/**
 * viewer 页面：承载 model-viewer 渲染器组件
 *
 * 职责：解析跳转参数（id/name/modelUrl）→ 传给组件；返回时执行"清理三保险"的前两保险
 *  1. onBack：先 selectComponent 调组件 cleanup() 再 navigateBack
 *  2. onUnload：兜底再调一次（幂等，防系统返回/手势返回绕过 onBack）
 *  3. 组件 detached：最后防线（组件内部）
 */
Page({
  data: {
    modelName: '',
    modelUrl: '',
    modelId: '',
    statusBarHeight: 44,
  },

  onLoad(options: Record<string, string>) {
    const modelUrl = (options && options.modelUrl && decodeURIComponent(options.modelUrl)) || ''
    const modelName = (options && options.name && decodeURIComponent(options.name)) || ''
    const modelId = (options && options.id) || ''
    this.setData({ modelName, modelUrl, modelId })

    // 状态栏高度（自定义导航栏预留）
    try {
      const info = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ statusBarHeight: info.statusBarHeight || 44 })
    } catch (_e) {
      this.setData({ statusBarHeight: 44 })
    }
    console.log('[viewer] onLoad, modelId:', modelId, 'url:', modelUrl ? 'set' : 'empty')
  },

  onUnload() {
    // 兜底清理：防手势返回/系统返回绕过 onBack
    const comp = this.selectComponent('#modelViewer') as any
    if (comp && comp.cleanup) comp.cleanup()
    console.log('[viewer] onUnload, cleanup fallback invoked')
  },

  onBack() {
    // 返回前先显式清理（根治卡死的第一保险）
    const comp = this.selectComponent('#modelViewer') as any
    if (comp && comp.cleanup) comp.cleanup()
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({
          url: '/pages/index/index',
          fail: () => {
            wx.reLaunch({ url: '/pages/index/index' })
          },
        })
      },
    })
  },
})
