/** 模型文件选择页（缓冲页）：首页 → 选文件 → 跳渲染页 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

Page({
  data: {
    fileName: '',
    fileSizeText: '',
    modelUrl: '',
    picked: false,
    statusBarHeight: 44,
  },

  onLoad() {
    try {
      const info = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ statusBarHeight: info.statusBarHeight || 44 })
    } catch (_e) {
      this.setData({ statusBarHeight: 44 })
    }
  },

  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },

  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      // 注意：extension 不带点（PC 端带点会失效）；鸿蒙系统存在后缀缺失 bug，下方 name 兜底校验
      extension: ['glb', 'gltf'],
      success: (res: any) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        const name = (file.name || 'model.glb') as string
        const lower = name.toLowerCase()
        if (!(lower.endsWith('.glb') || lower.endsWith('.gltf'))) {
          wx.showToast({ title: '请选择 .glb 或 .gltf 格式的 3D 模型文件', icon: 'none' })
          return
        }
        if (file.size > MAX_FILE_SIZE) {
          wx.showToast({ title: '文件超过 50MB 上限，请压缩后重试', icon: 'none' })
          return
        }
        this.setData({
          fileName: name,
          fileSizeText: this._formatSize(file.size),
          modelUrl: file.path,
          picked: true,
        })
      },
    })
  },

  onStartRender() {
    if (!this.data.modelUrl) return
    wx.navigateTo({
      url:
        '/subpackages/modelViewer/pages/model-render/model-render' +
        '?modelUrl=' + encodeURIComponent(this.data.modelUrl) +
        '&name=' + encodeURIComponent(this.data.fileName) +
        '&size=' + (this.data.fileSizeText || ''),
    })
  },

  _formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  },
})
