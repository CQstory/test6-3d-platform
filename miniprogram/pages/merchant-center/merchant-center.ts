import { Model, Merchant } from '../../types/model'
import { modelService } from '../../services/model-service'
import { merchantService } from '../../services/merchant-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    role: '',
    isMerchant: false,
    activeTab: 'models' as 'models' | 'stats',
    shop: {} as Merchant,
    models: [] as Model[],
  },
  async onLoad() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async onShow() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async _loadData() {
    // 店铺信息（用于顶部店铺卡，点击进入店铺设置）
    try {
      const shop = await merchantService.getMyShop()
      this.setData({ shop: shop || ({} as Merchant) })
    } catch (_e) {
      this.setData({ shop: {} as Merchant })
    }
    // 模型列表：失败不抛异常，保留空列表（后端可能返回 400 未入驻等）
    try {
      const models = await modelService.getMyModels()
      this.setData({ models })
    } catch (_e) {
      this.setData({ models: [] })
    }
  },
  onTabTap(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as 'models' | 'stats' })
  },
  onShopTap() {
    wx.navigateTo({ url: '/pages/shop-settings/shop-settings' })
  },
  onModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-edit/model-edit?id=' + model.id,
      })
    }
  },
  onAddModel() {
    wx.navigateTo({ url: '/pages/model-edit/model-edit' })
  },
})
