// @ts-nocheck
/**
 * 3D 模型查看器页面
 *
 * 底层为 WebGL Canvas（three.js 渲染），上层为 UI 控制组件。
 * 支持：模型加载、手势旋转/缩放、光源切换、自动旋转。
 */

// ===== 适配器必须在 three.js 之前加载 =====
// 使用 require 确保在 CommonJS 环境下的加载顺序
const __adapter = require('../../adapters/weapp-adapter')

// ===== 加载 three.js（本地打包版本，绕过 npm build） =====
let THREE: any
try {
  THREE = require('../../adapters/three-bundle')
  console.log('[viewer] three.js loaded successfully, revision:', THREE.REVISION)
} catch (e: any) {
  console.error('[viewer] Failed to load three.js:', e.message || e)
}

// ===== 工具模块 =====
const modelDB = require('../../adapters/model-db')
const glbLoader = require('../../adapters/glb-loader')

// ===== 常量 =====
const LIGHT_PRESETS = [
  { name: '默认', key: 'default' },
  { name: '明亮', key: 'bright' },
  { name: '柔和', key: 'soft' },
  { name: '戏剧', key: 'dramatic' },
  { name: '昏暗', key: 'dim' },
]

const MAX_LOAD_RETRIES = 3
const LOAD_RETRY_DELAY = 1500  // ms
const LOAD_TIMEOUT = 30000     // ms

// ===== 全局错误捕获（调试用） =====
try {
  if (typeof wx !== 'undefined') {
    console.log('[viewer] 模块加载完成, THREE:', typeof THREE, 'modelDB:', typeof modelDB)
  }
} catch (e) {
  console.error('[viewer] 初始化错误:', e)
}

// ===== 页面实例 =====
Page({
  data: {
    // 光源
    lightPresetIndex: 0,
    lightPresetName: '默认',
    lightPresets: ['默认', '明亮', '柔和', '戏剧', '昏暗'],
    showLightPanel: false,

    // 旋转
    isRotating: true,

    // 状态
    modelLoaded: false,
    modelName: '',
    errorMsg: '',
    activeControl: '' as string,

    // 调试
    showDebug: false,
    fpsValue: 0,
    touchDebug: '',
  },

  // ---- 页面生命周期 ----
  onLoad(options: any) {
    const modelId = (options && options.id) || 'damaged-helmet'
    const modelUrl = (options && options.modelUrl && decodeURIComponent(options.modelUrl)) || ''
    const modelName = (options && options.name && decodeURIComponent(options.name)) || ''

    // 初始化私有状态
    this._canvas = null
    this._gl = null
    this._renderer = null
    this._scene = null
    this._camera = null
    this._modelGroup = null
    this._pivotGroup = null
    this._lights = []
    this._rafId = 0
    this._modelId = modelId
    this._autoRotateAngle = 0
    this._loadRetries = 0
    this._loadTimeoutId = null
    // FPS 计数
    this._fpsFrames = 0
    this._fpsLastTime = 0
    this._fpsUpdateTimer = 0
    this._touchState = {
      startX: 0, startY: 0,
      lastX: 0, lastY: 0,
      rotX: 0, rotY: 0,
      targetRotX: 0, targetRotY: 0,
      distance: 4,
      pinchStartDist: 0,
      pinchStartDistance: 4,
    }

    // 优先使用 URL 传入的 modelUrl（来自服务端），否则从本地 modelDB 查找
    if (modelUrl) {
      this._directModelUrl = modelUrl
      console.log('[viewer] Using direct modelUrl:', modelUrl)
    }
    if (modelName) {
      this.setData({ modelName })
    } else {
      const model = modelDB.getModelById(modelId)
      if (model) {
        this.setData({ modelName: model.name })
      }
    }
    console.log('[viewer] onLoad, modelId:', modelId)
  },

  onReady() {
    console.log('[viewer] onReady')
    this._initCanvas()
  },

  onShow() {
    console.log('[viewer] onShow')
    if (this._renderer) {
      this._startLoop()
    }
  },

  onHide() {
    console.log('[viewer] onHide')
    this._stopLoop()
  },

  onUnload() {
    console.log('[viewer] onUnload')
    if (!(this as any)._cleanedUp) {
      this._cleanup()
    }
  },

  // ---- Canvas 初始化 ----
  _initCanvas() {
    console.log('[viewer] _initCanvas start')
    if (!THREE) {
      console.error('[viewer] THREE is not available')
      this.setData({ errorMsg: 'three.js 加载失败，请先执行"构建 npm"' })
      return
    }
    if (typeof wx === 'undefined' || !wx.createSelectorQuery) {
      console.error('[viewer] wx.createSelectorQuery not available')
      this.setData({ errorMsg: '运行环境异常' })
      return
    }

    // 使用 wx.createSelectorQuery（Page 模式下更可靠）
    const query = wx.createSelectorQuery()
    query.select('#glcanvas').node()
    query.exec((res: any) => {
      console.log('[viewer] canvas query result count:', res ? res.length : 'null')
      if (!res || !res[0] || !res[0].node) {
        console.error('[viewer] Canvas node not found in:', JSON.stringify(res))
        this.setData({ errorMsg: '无法获取 Canvas 节点' })
        return
      }

      const canvas = res[0].node
      console.log('[viewer] Canvas node obtained:', typeof canvas)
      this._canvas = canvas

      // Step 1: 补齐事件方法（不需要尺寸信息）
      if (!canvas.addEventListener) {
        canvas.addEventListener = function (_type: string, _listener: any, _options?: any) { /* no-op */ }
      }
      if (!canvas.removeEventListener) {
        canvas.removeEventListener = function (_type: string, _listener: any, _options?: any) { /* no-op */ }
      }
      if (!canvas.dispatchEvent) {
        canvas.dispatchEvent = function (_event: any) { /* no-op */ }
      }

      // Step 2: 获取设备信息
      const sysInfo = wx.getSystemInfoSync()
      const width = sysInfo.windowWidth
      const height = sysInfo.windowHeight
      const dpr = sysInfo.pixelRatio
      console.log('[viewer] Screen:', width, 'x', height, 'dpr:', dpr)

      // Step 3: 设置 canvas 物理尺寸
      canvas.width = width * dpr
      canvas.height = height * dpr

      // Step 4: 补齐依赖尺寸的 DOM 属性
      if (!canvas.style) {
        canvas.style = { width: '', height: '', left: '', top: '' } as any
      }
      if (canvas.clientWidth === undefined) canvas.clientWidth = width
      if (canvas.clientHeight === undefined) canvas.clientHeight = height
      if (canvas.getBoundingClientRect === undefined) {
        canvas.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: width, bottom: height, width: width, height: height }
        }
      }
      if (canvas.dataset === undefined) canvas.dataset = {}
      if (canvas.parentElement === undefined) canvas.parentElement = null
      if (canvas.parentNode === undefined) canvas.parentNode = null

      // 更新适配器中的屏幕尺寸
      const adapter = require('../../adapters/weapp-adapter')
      if (adapter.updateScreenSize) {
        adapter.updateScreenSize(width, height, dpr)
      }

      // 获取 WebGL 上下文（小程序仅支持 WebGL 1.0）
      let gl
      try {
        gl = canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          depth: true,
          stencil: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
        })
      } catch (e: any) {
        console.error('[viewer] getContext threw:', e)
        gl = null
      }

      if (!gl) {
        console.error('[viewer] WebGL context unavailable')
        this.setData({ errorMsg: 'WebGL 不可用，请检查设备支持' })
        return
      }

      console.log('[viewer] WebGL version:', gl.getParameter(gl.VERSION))
      console.log('[viewer] WebGL renderer:', gl.getParameter(gl.RENDERER))

      this._gl = gl

      // 初始化 three.js 场景
      this._initScene(width, height, dpr)

      // 加载模型
      this._loadModel()
    })
  },

  // ---- three.js 场景初始化 ----
  _initScene(width: number, height: number, dpr: number) {
    console.log('[viewer] _initScene')
    // 渲染器
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      context: this._gl,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(dpr)
    this._renderer.setClearColor(0x1a1a2e, 1)
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping
    this._renderer.toneMappingExposure = 1.0
    this._renderer.outputColorSpace = THREE.SRGBColorSpace

    // 场景
    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x1a1a2e)
    this._scene.fog = new THREE.Fog(0x1a1a2e, 8, 30)

    // 相机
    this._camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    this._camera.position.set(0, 1, this._touchState.distance)
    this._camera.lookAt(0, 0, 0)

    // 轴心组（用于旋转）
    this._pivotGroup = new THREE.Group()
    this._scene.add(this._pivotGroup)

    // 模型容器
    this._modelGroup = new THREE.Group()
    this._pivotGroup.add(this._modelGroup)

    // 默认光源
    this._setupLights(0)

    // 启动渲染循环
    this._startLoop()
  },

  // ---- 光源设置 ----
  _setupLights(presetIndex: number) {
    // 移除旧光源
    this._lights.forEach((light: any) => {
      if (light.parent) light.parent.remove(light)
      if (light.dispose) light.dispose()
    })
    this._lights = []

    const preset = LIGHT_PRESETS[presetIndex] || LIGHT_PRESETS[0]
    const scene = this._scene
    if (!scene) return

    switch (preset.key) {
      case 'default': {
        const ambient = new THREE.AmbientLight(0x404060, 1.2)
        scene.add(ambient)
        this._lights.push(ambient)

        const directional = new THREE.DirectionalLight(0xffffff, 2.5)
        directional.position.set(5, 8, 5)
        directional.castShadow = true
        directional.shadow.mapSize.width = 1024
        directional.shadow.mapSize.height = 1024
        directional.shadow.camera.near = 0.5
        directional.shadow.camera.far = 50
        directional.shadow.camera.left = -10
        directional.shadow.camera.right = 10
        directional.shadow.camera.top = 10
        directional.shadow.camera.bottom = -10
        directional.shadow.bias = -0.0001
        scene.add(directional)
        this._lights.push(directional)

        const fill = new THREE.DirectionalLight(0x8899cc, 0.6)
        fill.position.set(-3, 1, -2)
        scene.add(fill)
        this._lights.push(fill)
        break
      }
      case 'bright': {
        const ambient = new THREE.AmbientLight(0x8080a0, 2.0)
        scene.add(ambient)
        this._lights.push(ambient)

        const directional = new THREE.DirectionalLight(0xffffff, 4.0)
        directional.position.set(5, 8, 5)
        scene.add(directional)
        this._lights.push(directional)

        const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.0)
        scene.add(hemi)
        this._lights.push(hemi)
        break
      }
      case 'soft': {
        const hemi = new THREE.HemisphereLight(0xddeeff, 0x3b3028, 1.5)
        scene.add(hemi)
        this._lights.push(hemi)

        const ambient = new THREE.AmbientLight(0x606070, 0.8)
        scene.add(ambient)
        this._lights.push(ambient)

        const point = new THREE.PointLight(0xffeedd, 3.0, 12, 1.5)
        point.position.set(2, 3, 4)
        scene.add(point)
        this._lights.push(point)
        break
      }
      case 'dramatic': {
        const spot = new THREE.SpotLight(0xffffff, 8.0, 15, Math.PI / 7, 0.3, 0.5)
        spot.position.set(5, 7, 3)
        spot.castShadow = true
        spot.shadow.mapSize.width = 1024
        spot.shadow.mapSize.height = 1024
        scene.add(spot)
        this._lights.push(spot)

        const ambient = new THREE.AmbientLight(0x111122, 0.4)
        scene.add(ambient)
        this._lights.push(ambient)

        const rim = new THREE.PointLight(0x4466aa, 2.0, 8)
        rim.position.set(-3, 1, -3)
        scene.add(rim)
        this._lights.push(rim)
        break
      }
      case 'dim': {
        const ambient = new THREE.AmbientLight(0x202030, 0.5)
        scene.add(ambient)
        this._lights.push(ambient)

        const point = new THREE.PointLight(0xff9944, 1.5, 6, 2.0)
        point.position.set(1, 2, 3)
        scene.add(point)
        this._lights.push(point)
        break
      }
    }
  },

  // ---- 模型加载 ----
  _loadModel() {
    // 优先使用 URL 直接传入的 modelUrl，否则从本地 modelDB 查找
    let url: string
    if (this._directModelUrl) {
      url = this._directModelUrl
    } else {
      const model = modelDB.getModelById(this._modelId)
      if (!model) {
        this.setData({ errorMsg: '模型数据未找到: ' + this._modelId })
        return
      }
      url = model.modelUrl
    }

    this._loadRetries = this._loadRetries || 0

    console.log('[viewer] Loading model from:', url, '(attempt ' + (this._loadRetries + 1) + '/' + (MAX_LOAD_RETRIES + 1) + ')')

    // 超时保护
    if (this._loadTimeoutId) clearTimeout(this._loadTimeoutId)
    this._loadTimeoutId = setTimeout(() => {
      console.error('[viewer] Model load timeout after', LOAD_TIMEOUT, 'ms')
      this._loadTimeoutId = null
      this._handleLoadError(new Error('加载超时，请检查网络连接'))
    }, LOAD_TIMEOUT)

    // 传入 canvas 以支持 canvas.createImage()（真机纹理加载的核心 API）
    glbLoader.loadGLBModel(url, THREE, this._canvas)
      .then((rootGroup: any) => {
        if (this._loadTimeoutId) clearTimeout(this._loadTimeoutId)
        this._loadTimeoutId = null
        this._loadRetries = 0

        console.log('[viewer] Model loaded successfully')

        // 自动适配模型大小
        this._normalizeModelSize(rootGroup)

        // 添加到场景
        if (this._modelGroup) {
          // 先清空旧模型
          while (this._modelGroup.children.length > 0) {
            this._modelGroup.remove(this._modelGroup.children[0])
          }
          this._modelGroup.add(rootGroup)
        }

        this.setData({ modelLoaded: true })

        // 强制渲染一帧
        this._render()
      })
      .catch((err: any) => {
        if (this._loadTimeoutId) clearTimeout(this._loadTimeoutId)
        this._loadTimeoutId = null
        this._handleLoadError(err)
      })
  },

  _handleLoadError(err: any) {
    this._loadRetries = (this._loadRetries || 0) + 1

    console.error('[viewer] Model load failed (attempt ' + this._loadRetries + '/' + (MAX_LOAD_RETRIES + 1) + '):', err)

    if (this._loadRetries <= MAX_LOAD_RETRIES) {
      const delay = LOAD_RETRY_DELAY * this._loadRetries
      console.log('[viewer] Retrying in', delay, 'ms...')
      this.setData({
        errorMsg: '加载失败，正在重试(' + this._loadRetries + '/' + (MAX_LOAD_RETRIES + 1) + ')...',
      })
      setTimeout(() => {
        this._loadModel()
      }, delay)
    } else {
      const errMsg = err.message || String(err)
      let friendlyMsg = '模型加载失败'
      if (errMsg.includes('timeout') || errMsg.includes('超时')) {
        friendlyMsg = '加载超时，请检查网络后重试'
      } else if (errMsg.includes('fail') || errMsg.includes('request')) {
        friendlyMsg = '网络请求失败，请检查域名配置或网络连接'
      } else if (errMsg.includes('parse') || errMsg.includes('format')) {
        friendlyMsg = '模型格式解析失败'
      }
      this.setData({
        errorMsg: friendlyMsg + '\n(' + errMsg + ')',
      })
    }
  },

  // ---- 模型尺寸归一化 ----
  _normalizeModelSize(group: any) {
    const box = new THREE.Box3().setFromObject(group)
    const size = new THREE.Vector3()
    box.getSize(size)

    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scale = 2.5 / maxDim
      group.scale.setScalar(scale)

      // 将模型居中
      const center = new THREE.Vector3()
      box.getCenter(center)
      group.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    }
  },

  // ---- 渲染循环 ----
  _startLoop() {
    if (this._rafId) return
    const loop = () => {
      this._rafId = 0
      this._render()
      this._scheduleFrame()
    }
    this._scheduleFrame = () => {
      if (typeof requestAnimationFrame !== 'undefined') {
        this._rafId = requestAnimationFrame(loop)
      } else if (this._canvas && this._canvas.requestAnimationFrame) {
        this._rafId = this._canvas.requestAnimationFrame(loop)
      } else {
        this._rafId = setTimeout(loop, 16) as any
      }
    }
    this._scheduleFrame()
  },

  _stopLoop() {
    if (this._rafId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this._rafId)
      } else if (this._canvas && this._canvas.cancelAnimationFrame) {
        this._canvas.cancelAnimationFrame(this._rafId)
      } else {
        clearTimeout(this._rafId)
      }
      this._rafId = 0
    }
  },

  _render() {
    if (!this._renderer || !this._scene || !this._camera) return

    const ts = this._touchState

    // 自动旋转
    if (this.data.isRotating) {
      this._autoRotateAngle += 0.005
      ts.targetRotY = this._autoRotateAngle
    }

    // 平滑旋转（惯性）
    const lerp = 0.12
    ts.rotX += (ts.targetRotX - ts.rotX) * lerp
    ts.rotY += (ts.targetRotY - ts.rotY) * lerp

    // 应用旋转和缩放
    if (this._pivotGroup) {
      this._pivotGroup.rotation.set(ts.rotX, ts.rotY, 0)
    }

    // 相机距离
    this._camera.position.z = ts.distance

    this._renderer.render(this._scene, this._camera)

    // FPS 统计（每秒更新一次到 UI）
    this._fpsFrames++
    const now = Date.now()
    if (!this._fpsLastTime) this._fpsLastTime = now
    if (now - this._fpsLastTime >= 1000) {
      const fps = Math.round(this._fpsFrames * 1000 / (now - this._fpsLastTime))
      this._fpsFrames = 0
      this._fpsLastTime = now
      if (this.data.showDebug) {
        this.setData({ fpsValue: fps })
      }
    }
  },

  _scheduleFrame: undefined as any,

  // ---- 触摸交互 ----
  onTouchStart(e: any) {
    const touches = e.touches || e.changedTouches || []
    if (touches.length === 1) {
      this._touchState.startX = touches[0].x || touches[0].clientX || 0
      this._touchState.startY = touches[0].y || touches[0].clientY || 0
      this._touchState.lastX = this._touchState.startX
      this._touchState.lastY = this._touchState.startY
    } else if (touches.length === 2) {
      const dx = (touches[0].x || touches[0].clientX || 0) - (touches[1].x || touches[1].clientX || 0)
      const dy = (touches[0].y || touches[0].clientY || 0) - (touches[1].y || touches[1].clientY || 0)
      this._touchState.pinchStartDist = Math.sqrt(dx * dx + dy * dy)
      this._touchState.pinchStartDistance = this._touchState.distance
    }
    if (this.data.showDebug) {
      this.setData({ touchDebug: 'start ' + touches.length + 'f' })
    }
  },

  onTouchMove(e: any) {
    const touches = e.touches || e.changedTouches || []
    const ts = this._touchState

    if (touches.length === 1) {
      const x = touches[0].x || touches[0].clientX || 0
      const y = touches[0].y || touches[0].clientY || 0

      const dx = x - ts.lastX
      const dy = y - ts.lastY

      // 水平拖动 → 绕 Y 轴旋转
      ts.targetRotY += dx * 0.008
      // 垂直拖动 → 绕 X 轴旋转
      ts.targetRotX += dy * 0.008
      // 限制 X 轴旋转范围
      ts.targetRotX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, ts.targetRotX))

      ts.lastX = x
      ts.lastY = y

      // 手动旋转时暂停自动旋转
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.setData({ isRotating: false })
      }

      if (this.data.showDebug) {
        this.setData({ touchDebug: 'move dx=' + Math.round(dx) + ' dy=' + Math.round(dy) })
      }
    } else if (touches.length === 2) {
      const dx = (touches[0].x || touches[0].clientX || 0) - (touches[1].x || touches[1].clientX || 0)
      const dy = (touches[0].y || touches[0].clientY || 0) - (touches[1].y || touches[1].clientY || 0)
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (ts.pinchStartDist > 0) {
        const scale = ts.pinchStartDist / dist
        ts.distance = Math.max(1.0, Math.min(12.0, ts.pinchStartDistance * scale))
      }

      if (this.data.showDebug) {
        this.setData({ touchDebug: 'pinch d=' + Math.round(dist) + ' z=' + ts.distance.toFixed(1) })
      }
    }
  },

  onTouchEnd(_e: any) {
    if (this.data.showDebug) {
      this.setData({ touchDebug: 'end' })
    }
  },

  // ---- UI 交互 ----
  onBack() {
    console.log('[viewer] onBack — cleaning up before navigate')
    // 在导航开始前释放 GL 资源，避免污染父页渲染管线
    this._cleanup()
    this._cleanedUp = true
    wx.navigateBack({
      delta: 1,
      fail: () => {
        console.log('[viewer] navigateBack failed, falling back')
        wx.switchTab({
          url: '/pages/index/index',
          fail: () => {
            wx.redirectTo({ url: '/pages/index/index' })
          },
        })
      },
    })
  },

  onToggleLight() {
    this.setData({
      showLightPanel: !this.data.showLightPanel,
      activeControl: this.data.showLightPanel ? '' : 'light',
    })
  },

  onSelectLightPreset(e: any) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    if (isNaN(index) || index < 0 || index >= LIGHT_PRESETS.length) return

    this.setData({
      lightPresetIndex: index,
      lightPresetName: LIGHT_PRESETS[index].name,
      showLightPanel: false,
      activeControl: '',
    })

    this._setupLights(index)
  },

  onToggleRotation() {
    const newState = !this.data.isRotating
    this.setData({
      isRotating: newState,
      activeControl: newState ? 'rotate' : '',
    })
    if (newState) {
      this._autoRotateAngle = this._touchState.targetRotY
    }
  },

  onRetry() {
    this._loadRetries = 0
    if (this._loadTimeoutId) {
      clearTimeout(this._loadTimeoutId)
      this._loadTimeoutId = null
    }
    this.setData({ errorMsg: '', modelLoaded: false })
    this._loadModel()
  },

  onToggleDebug() {
    this.setData({ showDebug: !this.data.showDebug })
    if (!this.data.showDebug) {
      this._fpsFrames = 0
      this._fpsLastTime = 0
      this.setData({ fpsValue: 0, touchDebug: '' })
    }
  },

  // ---- 清理 ----
  _cleanup() {
    this._stopLoop()

    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    if (this._scene) {
      this._scene.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      this._scene = null
    }

    this._lights = []
    this._modelGroup = null
    this._pivotGroup = null
    this._camera = null
    this._gl = null
    this._canvas = null
  },
})
