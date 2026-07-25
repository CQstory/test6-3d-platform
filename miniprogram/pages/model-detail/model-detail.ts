import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    model: {} as Model,
    facesText: '',
  },
  async onLoad(options: { id?: string }) {
    console.log('[model-detail] onLoad, options=', options)
    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 1500)
      return
    }

    const id = options.id || ''
    const model = await modelService.getModelById(id)
    if (model) {
      this.setData({
        model,
        facesText: model.faces ? (model.faces / 1000).toFixed(1) + 'K面' : '',
      })
      console.log('[model-detail] model loaded:', model.name)
      modelService.recordView(id).catch(() => {})
    }
  },
  onShow() {
    console.log('[model-detail] onShow, model.id=', (this.data.model as Model).id)
    // 强制刷新视图绑定（subpackage GL 页面可能破坏父页 WXML 绑定）
    this.setData({ _ts: Date.now() })
  },
  onUnload() {
    console.log('[model-detail] onUnload — page destroyed')
  },
  onPageTap(e: any) {
    console.log('[model-detail] page tap detected, target:', e.target.id || e.target.dataset || 'no-id')
  },
  onView3D() {
    console.log('[model-detail] onView3D tapped')
    const m = this.data.model
    wx.navigateTo({
      url:
        '/subpackages/modelViewer/pages/viewer/viewer?id=' +
        m.id +
        '&name=' +
        encodeURIComponent(m.name) +
        '&modelUrl=' +
        encodeURIComponent(m.modelUrl),
    })
  },
})
