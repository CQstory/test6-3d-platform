import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    role: '',
    isMerchant: false,
    activeTab: 'models' as 'models' | 'stats',
    models: [] as Model[],
    sortedModels: [] as Model[],
    stats: { total: 0, views: 0, favorites: 0 },
  },
  onLoad() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  onShow() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async _loadData() {
    const models = await modelService.getMyModels()
    const total = models.length
    const views = models.reduce((s, m) => s + m.views, 0)
    const favorites = models.reduce((s, m) => s + m.favorites, 0)
    const sortedModels = [...models].sort((a, b) => b.views - a.views)
    this.setData({
      models,
      sortedModels,
      stats: { total, views, favorites },
    })
  },
  onTabTap(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as 'models' | 'stats' })
  },
  onModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-form/model-form?id=' + model.id,
      })
    }
  },
  onAddModel() {
    wx.navigateTo({ url: '/pages/model-form/model-form' })
  },
})
