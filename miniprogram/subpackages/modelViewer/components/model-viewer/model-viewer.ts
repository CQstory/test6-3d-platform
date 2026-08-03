/**
 * model-viewer 渲染器组件
 *
 * 架构：canvas 在组件内部，three 实例（createScopedThreejs）生命周期 = 组件生命周期。
 * 相机：球坐标轨道（θ 无限制 / φ 钳位 / r 基于包围球 clamp），包围球自动取景占屏宽度 2/3~3/4。
 * 清理链（根治"从 viewer 返回 detail 后卡死"）：
 *   1. 页面 top-bar 返回前显式调 cleanup()
 *   2. 页面 onUnload 兜底调 cleanup()
 *   3. 组件 detached 兜底 _cleanup()（三者幂等）
 * 清理内容：stopLoop → 全量 dispose（几何/材质/纹理）→ renderer.dispose() + forceContextLoss()
 *          → 隐藏 canvas 节点（触发 WebView 销毁 GL 图层）→ 卸载全局 shim（restore）
 */
import { createScopedThreejs, ScopedThree } from '../../lib/create-scoped-three'
import { createGLTFLoader } from '../../lib/gltf-loader'

/* ===== 常量 ===== */
/** 垂直极角钳位：避免翻转过头/穿地 */
const PHI_MIN = 0.15 * Math.PI
const PHI_MAX = 0.85 * Math.PI
/** 自动取景：模型占屏幕宽度比例（2/3~3/4 区间中点） */
const FIT_RATIO = 0.7
/** 缩放距离下限（贴脸）与上限（拉远），基于包围球半径 */
const MIN_DIST_SCALE = 0.5
const MAX_DIST_SCALE = 3.0
const LOAD_TIMEOUT = 30000
const MAX_LOAD_RETRIES = 3
const LOAD_RETRY_DELAY = 1500
const AUTO_ROTATE_SPEED = 0.005
/** 手势介入后自动旋转恢复延迟 */
const AUTO_ROTATE_RESUME_DELAY = 2000
const TOUCH_SENSITIVITY = 0.008
const INERTIA_DECAY = 0.95
const ROTATE_LERP = 0.12

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

Component({
  options: {
    styleIsolation: 'isolated',
  },

  properties: {
    modelUrl: { type: String, value: '' },
    modelName: { type: String, value: '' },
  },

  data: {
    loading: true,
    progressText: '',
    errorMsg: '',
    isRotating: true,
    canvasVisible: true,
    showDebug: false,
    revision: '',
    webgl2Text: '',
    dprText: '',
    fps: 0,

    /* ===== 私有实例状态（非渲染字段，直接赋值不走 setData） ===== */
    _scoped: null as ScopedThree | null,
    _canvas: null as any,
    _gl: null as any,
    _renderer: null as any,
    _scene: null as any,
    _camera: null as any,
    _modelGroup: null as any,
    _modelRadius: 1,
    _minDist: 0.5,
    _maxDist: 3,
    _rafId: 0,
    _cleanedUp: false,
    _loadRetries: 0,
    _loadTimeoutId: null as any,
    _touch: null as { x: number; y: number } | null,
    _pinchDist: 0,
    _pinchStartRadius: 1,
    _inertia: null as { vx: number; vy: number } | null,
    _autoRotatePaused: false,
    _lastTouchTime: 0,
    _fpsFrames: 0,
    _fpsLastTime: 0,
    _camState: {
      theta: 0,
      phi: Math.PI / 2.6,
      radius: 4,
      targetTheta: 0,
      targetPhi: Math.PI / 2.6,
      targetRadius: 4,
    },
  },

  lifetimes: {
    ready() {
      this._init()
    },
    detached() {
      this._cleanup()
    },
  },

  pageLifetimes: {
    show() {
      this._startLoop()
    },
    hide() {
      this._stopLoop()
    },
  },

  methods: {
    /* ---- 对外清理接口（页面 top-bar 返回前 / onUnload 调用，幂等） ---- */
    cleanup() {
      this._cleanup()
    },

    /* ===== 初始化 ===== */
    _init() {
      if (this.data._cleanedUp) return
      this.createSelectorQuery()
        .select('#glCanvas')
        .node()
        .exec((res: any) => {
          if (this.data._cleanedUp) return
          if (!res || !res[0] || !res[0].node) {
            console.error('[model-viewer] canvas node not found')
            this.setData({ errorMsg: '无法获取 Canvas 节点', loading: false })
            return
          }
          this._initWithCanvas(res[0].node)
        })
    },

    _initWithCanvas(canvas: any) {
      try {
        this.data._canvas = canvas
        if (!canvas.style) canvas.style = { width: '', height: '', left: '', top: '' } as any
        if (canvas.clientWidth === undefined) canvas.clientWidth = 0
        if (canvas.clientHeight === undefined) canvas.clientHeight = 0

        // 补事件方法：three WebGLRenderer 构造时会 addEventListener（监听 contextlost 等）
        if (typeof canvas.addEventListener !== 'function') {
          canvas.addEventListener = function (_type: string, _listener: any, _options?: any) {
            /* no-op：小程序 canvas 无 DOM 事件，渲染线程 GL 图层由组件生命周期管理 */
          }
        }
        if (typeof canvas.removeEventListener !== 'function') {
          canvas.removeEventListener = function (_type: string, _listener: any, _options?: any) {
            /* no-op */
          }
        }
        if (typeof canvas.dispatchEvent !== 'function') {
          canvas.dispatchEvent = function (_event: any) {
            return true
          }
        }

        // 系统信息（宽高/dpr）
        const info = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync()
        const width = info.windowWidth || 375
        const height = info.windowHeight || 667
        const dpr = info.pixelRatio || 2

        // canvas 物理尺寸
        canvas.width = width * dpr
        canvas.height = height * dpr

        // WebGL 上下文
        let gl: any = null
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
          console.error('[model-viewer] getContext threw:', e)
          gl = null
        }
        if (!gl) {
          console.error('[model-viewer] WebGL context unavailable')
          this.setData({ errorMsg: 'WebGL 不可用，请检查设备支持', loading: false })
          return
        }
        this.data._gl = gl
        console.log('[model-viewer] WebGL version:', gl.getParameter(gl.VERSION))

        // 自测：canvas.createImage 能否加载 data URI（纹理链路核心疑点）
        try {
          const testImg = canvas.createImage()
          const testSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          testImg.onload = () => {
            console.log('[model-viewer] createImage data-uri test: OK, w:', testImg.width, 'h:', testImg.height, 'complete:', testImg.complete !== undefined ? testImg.complete : 'n/a')
          }
          testImg.onerror = (e: any) => {
            console.warn('[model-viewer] createImage data-uri test: FAIL, err:', e)
          }
          testImg.src = testSrc
        } catch (e: any) {
          console.warn('[model-viewer] createImage data-uri test: EXCEPTION:', e)
        }

        // 绑定 three（可逆全局 shim 在此 install）
        const scoped = createScopedThreejs(canvas)
        this.data._scoped = scoped
        const THREE = scoped.THREE
        this.setData({
          revision: scoped.REVISION,
          webgl2Text: scoped.webgl2Supported ? 'yes' : 'no',
          dprText: String(dpr),
        })
        console.log('[model-viewer] three r' + scoped.REVISION + ', webgl2:', scoped.webgl2Supported)

        // 渲染器
        this.data._renderer = new THREE.WebGLRenderer({
          canvas,
          context: gl,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        })
        this.data._renderer.setSize(width, height)
        this.data._renderer.setPixelRatio(dpr)
        this.data._renderer.setClearColor(0x1a1a2e, 1)
        this.data._renderer.shadowMap.enabled = true
        this.data._renderer.shadowMap.type = THREE.PCFSoftShadowMap
        this.data._renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.data._renderer.toneMappingExposure = 1.0
        this.data._renderer.outputColorSpace = THREE.SRGBColorSpace

        // 场景
        this.data._scene = new THREE.Scene()
        this.data._scene.background = new THREE.Color(0x1a1a2e)

        // 相机
        this.data._camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
        this.data._camera.position.set(0, 1, 4)
        this.data._camera.lookAt(0, 0, 0)

        // 模型容器
        this.data._modelGroup = new THREE.Group()
        this.data._scene.add(this.data._modelGroup)

        // 灯光（默认预设）
        this._setupLights(THREE)

        // 启动渲染循环
        this._startLoop()

        // 加载模型
        this._loadModel()
      } catch (e: any) {
        console.error('[model-viewer] init error:', e)
        this.setData({ errorMsg: '初始化失败: ' + (e && e.message ? e.message : e), loading: false })
      }
    },

    /* ===== 灯光 ===== */
    _setupLights(THREE: any) {
      const scene = this.data._scene
      if (!scene) return
      const ambient = new THREE.AmbientLight(0x404060, 1.2)
      scene.add(ambient)
      const key = new THREE.DirectionalLight(0xffffff, 2.5)
      key.position.set(5, 8, 5)
      key.castShadow = true
      key.shadow.mapSize.width = 1024
      key.shadow.mapSize.height = 1024
      key.shadow.camera.near = 0.5
      key.shadow.camera.far = 50
      scene.add(key)
      const fill = new THREE.DirectionalLight(0x8899cc, 0.6)
      fill.position.set(-3, 1, -2)
      scene.add(fill)
    },

    /* ===== 模型加载（GLTFLoader parse 模式） ===== */
    _loadModel() {
      const url = this.properties.modelUrl
      if (!url) {
        this.setData({ errorMsg: '缺少模型地址 modelUrl', loading: false })
        return
      }
      if (!this.data._scoped) {
        this.setData({ errorMsg: 'three 未就绪，请先执行"构建 npm"', loading: false })
        return
      }

      this.data._loadRetries = this.data._loadRetries || 0
      console.log('[model-viewer] loading model:', url, '(attempt ' + (this.data._loadRetries + 1) + ')')

      // 超时保护
      if (this.data._loadTimeoutId) clearTimeout(this.data._loadTimeoutId)
      this.data._loadTimeoutId = setTimeout(() => {
        this.data._loadTimeoutId = null
        this._handleLoadError(new Error('加载超时，请检查网络连接'))
      }, LOAD_TIMEOUT)

      wx.request({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        success: (res: any) => {
          const data = res && res.data
          if (!data || !(data instanceof ArrayBuffer)) {
            this._handleLoadError(new Error('模型数据格式错误'))
            return
          }
          try {
            const THREE = this.data._scoped!.THREE
            const loader = createGLTFLoader(THREE)
            loader.parse(
              data,
              '',
              (gltf: any) => {
                if (this.data._loadTimeoutId) {
                  clearTimeout(this.data._loadTimeoutId)
                  this.data._loadTimeoutId = null
                }
                const model = (gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null
                if (!model) {
                  this._handleLoadError(new Error('模型场景为空'))
                  return
                }
                this._onModelLoaded(model)
              },
              (err: any) => {
                this._handleLoadError(err || new Error('模型解析失败'))
              }
            )
          } catch (e: any) {
            this._handleLoadError(e)
          }
        },
        fail: (err: any) => {
          this._handleLoadError(new Error(err && err.errMsg ? err.errMsg : '网络请求失败'))
        },
      })
    },

    _onModelLoaded(model: any) {
      const THREE = this.data._scoped!.THREE
      // 清空旧模型
      while (this.data._modelGroup && this.data._modelGroup.children.length > 0) {
        const child = this.data._modelGroup.children[0]
        this.data._modelGroup.remove(child)
      }
      this.data._modelGroup.add(model)

      // 包围球自动取景：模型占屏幕宽度 2/3~3/4
      const box = new THREE.Box3().setFromObject(model)
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const radius = Math.max(sphere.radius || 1, 0.01)
      this.data._modelRadius = radius

      // 模型中心移到原点
      const center = sphere.center
      this.data._modelGroup.position.set(-center.x, -center.y, -center.z)

      // 相机初始距离（竖屏水平 FOV 换算）
      const width = this.data._canvas ? this.data._canvas.width / (this.data._canvas.pixelRatio || 1) : 375
      const height = this.data._canvas ? this.data._canvas.height / (this.data._canvas.pixelRatio || 1) : 667
      const vFov = (this.data._camera.fov * Math.PI) / 180
      const aspect = width / height
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
      const dist = clamp(radius / (FIT_RATIO * Math.tan(hFov / 2)), radius * MIN_DIST_SCALE, radius * MAX_DIST_SCALE)

      this.data._minDist = radius * MIN_DIST_SCALE
      this.data._maxDist = radius * MAX_DIST_SCALE
      const s = this.data._camState
      s.theta = 0
      s.phi = Math.PI / 2.6
      s.radius = dist
      s.targetTheta = 0
      s.targetPhi = Math.PI / 2.6
      s.targetRadius = dist

      this.setData({ loading: false, errorMsg: '', modelName: this.properties.modelName })
      console.log('[model-viewer] model loaded, radius:', radius.toFixed(2), 'dist:', dist.toFixed(2))

      // 纹理诊断：打印场景内所有 map 纹理的真实状态（定位 texture.image 为何为 null）
      model.traverse((child: any) => {
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m: any) => {
            if (m.map) {
              const img = m.map.image
              console.log(
                '[model-viewer] texture diag -> image:',
                img === null ? 'null' : img === undefined ? 'undefined' : img.constructor ? img.constructor.name : 'unknown',
                '| complete:', img && img.complete,
                '| w:', img && img.width,
                '| needsUpdate:', m.map.needsUpdate,
                '| version:', m.map.version
              )
            }
          })
        }
      })
    },

    _handleLoadError(err: any) {
      this.data._loadRetries = (this.data._loadRetries || 0) + 1
      const msg = err && err.message ? err.message : String(err)
      console.error('[model-viewer] load failed (attempt ' + this.data._loadRetries + '):', msg)

      if (this.data._loadRetries <= MAX_LOAD_RETRIES) {
        const delay = LOAD_RETRY_DELAY * this.data._loadRetries
        this.setData({ progressText: '加载失败，重试中 (' + this.data._loadRetries + '/' + MAX_LOAD_RETRIES + ')...' })
        setTimeout(() => {
          this._loadModel()
        }, delay)
      } else {
        let friendly = '模型加载失败'
        if (msg.indexOf('timeout') >= 0 || msg.indexOf('超时') >= 0) friendly = '加载超时，请检查网络后重试'
        else if (msg.indexOf('fail') >= 0 || msg.indexOf('request') >= 0 || msg.indexOf('网络') >= 0) friendly = '网络请求失败，请检查域名配置或网络连接'
        else if (msg.indexOf('parse') >= 0 || msg.indexOf('解析') >= 0) friendly = '模型格式解析失败'
        this.setData({ loading: false, errorMsg: friendly + '\n(' + msg + ')' })
      }
    },

    onRetry() {
      this.data._loadRetries = 0
      if (this.data._loadTimeoutId) {
        clearTimeout(this.data._loadTimeoutId)
        this.data._loadTimeoutId = null
      }
      this.setData({ errorMsg: '', loading: true, progressText: '' })
      this._loadModel()
    },

    /* ===== 渲染循环（优先 canvas.requestAnimationFrame，绝不用全局 setTimeout 模拟） ===== */
    _startLoop() {
      if (this.data._rafId || !this.data._canvas || !this.data._renderer) return
      const loop = () => {
        this.data._rafId = 0
        this._render()
        if (this.data._canvas && !this.data._cleanedUp) {
          this.data._rafId = this.data._canvas.requestAnimationFrame(loop)
        }
      }
      this.data._rafId = this.data._canvas.requestAnimationFrame(loop)
    },

    _stopLoop() {
      if (this.data._rafId && this.data._canvas && this.data._canvas.cancelAnimationFrame) {
        this.data._canvas.cancelAnimationFrame(this.data._rafId)
      }
      this.data._rafId = 0
    },

    _render() {
      if (!this.data._renderer || !this.data._scene || !this.data._camera || this.data._cleanedUp) return
      const s = this.data._camState
      const now = Date.now()

      // 自动旋转：手势介入后暂停，2s 无操作恢复
      if (this.data._autoRotatePaused && now - this.data._lastTouchTime > AUTO_ROTATE_RESUME_DELAY) {
        this.data._autoRotatePaused = false
      }
      if (this.data.isRotating && !this.data._autoRotatePaused) {
        s.targetTheta += AUTO_ROTATE_SPEED
      }

      // 惯性衰减
      if (this.data._inertia) {
        s.targetTheta += this.data._inertia.vx
        s.targetPhi = clamp(s.targetPhi + this.data._inertia.vy, PHI_MIN, PHI_MAX)
        this.data._inertia.vx *= INERTIA_DECAY
        this.data._inertia.vy *= INERTIA_DECAY
        if (Math.abs(this.data._inertia.vx) < 0.0002 && Math.abs(this.data._inertia.vy) < 0.0002) {
          this.data._inertia = null
        }
      }

      // 阻尼 lerp
      s.theta += (s.targetTheta - s.theta) * ROTATE_LERP
      s.phi += (s.targetPhi - s.phi) * ROTATE_LERP
      s.radius += (s.targetRadius - s.radius) * ROTATE_LERP

      // 球坐标 → 相机位置
      const sinPhi = Math.sin(s.phi)
      this.data._camera.position.set(
        s.radius * sinPhi * Math.sin(s.theta),
        s.radius * Math.cos(s.phi),
        s.radius * sinPhi * Math.cos(s.theta)
      )
      this.data._camera.lookAt(0, 0, 0)

      this.data._renderer.render(this.data._scene, this.data._camera)

      // FPS 统计（调试）
      if (this.data.showDebug) {
        this.data._fpsFrames++
        if (!this.data._fpsLastTime) this.data._fpsLastTime = now
        if (now - this.data._fpsLastTime >= 1000) {
          const fps = Math.round((this.data._fpsFrames * 1000) / (now - this.data._fpsLastTime))
          this.data._fpsFrames = 0
          this.data._fpsLastTime = now
          this.setData({ fps })
        }
      }
    },

    /* ===== 手势：单指旋转 + 双指缩放 ===== */
    _touchPoint(t: any): { x: number; y: number } {
      return { x: t.x !== undefined ? t.x : t.clientX || 0, y: t.y !== undefined ? t.y : t.clientY || 0 }
    },

    _touchDist(a: any, b: any): number {
      const p1 = this._touchPoint(a)
      const p2 = this._touchPoint(b)
      return Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y))
    },

    onTouchStart(e: any) {
      const touches = e.touches || []
      this.data._lastTouchTime = Date.now()
      this.data._autoRotatePaused = true
      if (touches.length === 1) {
        this.data._touch = this._touchPoint(touches[0])
        this.data._pinchDist = 0
      } else if (touches.length >= 2) {
        this.data._pinchDist = this._touchDist(touches[0], touches[1])
        this.data._pinchStartRadius = this.data._camState.targetRadius
      }
    },

    onTouchMove(e: any) {
      const touches = e.touches || []
      if (touches.length === 1 && this.data._pinchDist === 0 && this.data._touch) {
        const p = this._touchPoint(touches[0])
        const dx = p.x - this.data._touch.x
        const dy = p.y - this.data._touch.y
        const s = this.data._camState
        // 相机轨道：左滑 → theta 增大 → 俯视看模型顺时针旋转（OrbitControls 标准手感）
        s.targetTheta -= dx * TOUCH_SENSITIVITY
        // 上下方向已反转：上滑 → phi 增大 → 相机降低（视角向下看）
        s.targetPhi = clamp(s.targetPhi - dy * TOUCH_SENSITIVITY, PHI_MIN, PHI_MAX)
        // 惯性速度（与旋转方向一致，上下已同步反转）
        this.data._inertia = { vx: -dx * TOUCH_SENSITIVITY, vy: -dy * TOUCH_SENSITIVITY }
        this.data._touch = p
        this.data._lastTouchTime = Date.now()
      } else if (touches.length >= 2 && this.data._pinchDist > 0) {
        const d = this._touchDist(touches[0], touches[1])
        const scale = this.data._pinchDist / d
        this.data._camState.targetRadius = clamp(this.data._pinchStartRadius * scale, this.data._minDist, this.data._maxDist)
        this.data._lastTouchTime = Date.now()
      }
    },

    onTouchEnd() {
      this.data._pinchDist = 0
      this.data._touch = null
    },

    /* ===== UI 交互 ===== */
    onToggleRotate() {
      const next = !this.data.isRotating
      this.setData({ isRotating: next })
      if (next) {
        this.data._autoRotatePaused = false
      }
    },

    onToggleDebug() {
      this.setData({ showDebug: !this.data.showDebug })
      if (!this.data.showDebug) {
        this.data._fpsFrames = 0
        this.data._fpsLastTime = 0
        this.setData({ fps: 0 })
      }
    },

    /* ===== 清理链（根治卡死，幂等） ===== */
    _cleanup() {
      if (this.data._cleanedUp) return
      this.data._cleanedUp = true
      console.log('[model-viewer] cleanup start')

      // 1. 停止渲染循环
      this._stopLoop()

      // 2. 清超时
      if (this.data._loadTimeoutId) {
        clearTimeout(this.data._loadTimeoutId)
        this.data._loadTimeoutId = null
      }

      // 3. 场景全量释放（几何/材质/纹理，material.dispose 不释放 texture 需显式处理）
      if (this.data._scene) {
        this.data._scene.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            mats.forEach((m: any) => {
              this._disposeMaterialTextures(m)
              if (m.dispose) m.dispose()
            })
          }
        })
        this.data._scene = null
      }

      // 4. renderer dispose + forceContextLoss（释放 WebGL 上下文的关键）
      if (this.data._renderer) {
        try {
          this.data._renderer.dispose()
        } catch (e: any) {
          console.error('[model-viewer] renderer.dispose error:', e)
        }
        try {
          if (this.data._renderer.forceContextLoss) this.data._renderer.forceContextLoss()
        } catch (e: any) {
          console.error('[model-viewer] forceContextLoss error:', e)
        }
        this.data._renderer = null
      }

      // 5. 隐藏 canvas 节点，触发 WebView 销毁 GL 图层（页面存活时生效）
      this.setData({ canvasVisible: false })

      // 6. 卸载全局 shim（可逆恢复）
      if (this.data._scoped) {
        try {
          this.data._scoped.restore()
        } catch (e: any) {
          console.error('[model-viewer] restore shim error:', e)
        }
        this.data._scoped = null
      }

      this.data._canvas = null
      this.data._gl = null
      this.data._camera = null
      this.data._modelGroup = null
      console.log('[model-viewer] cleanup done')
    },

    _disposeMaterialTextures(m: any) {
      const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'envMap', 'lightMap', 'specularMap']
      keys.forEach((k) => {
        const tex = m[k]
        if (tex && tex.dispose) {
          tex.dispose()
          if (tex.image) tex.image = null
        }
      })
    },
  },
})
