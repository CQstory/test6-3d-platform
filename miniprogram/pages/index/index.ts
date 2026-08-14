import { Model, Banner } from '../../types/model'
import { modelService } from '../../services/model-service'
import { bannersData } from '../../data/banners'
import { userService } from '../../services/user-service'

Page({
  data: {
    banners: [] as Banner[],
    hotModels: [] as Model[],
    displayHotModels: [] as Model[],
    hotExpanded: false,
    featuredModels: [] as Model[],
    role: '',
  },
  async onLoad() {
    const hotModels = await modelService.getHotModels()
    const featuredModels = await modelService.getFeaturedModels()
    const user = userService.getCurrentUser()
    this.setData({
      banners: bannersData,
      hotModels,
      displayHotModels: hotModels.slice(0, 2),
      featuredModels,
      role: user ? user.role : 'user',
    })
  },
  onExpandHot() {
    this.setData({
      displayHotModels: this.data.hotModels,
      hotExpanded: true,
    })
  },
  onCollapseHot() {
    this.setData({
      displayHotModels: this.data.hotModels.slice(0, 2),
      hotExpanded: false,
    })
  },
  onHotItemTap(e: any) {
    const model = e.currentTarget.dataset.model as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
  onCardTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
  onBannerTap(e: any) {
    const link = e.currentTarget.dataset.link as string
    if (link) {
      if (link.startsWith('/pages/model-list')) {
        wx.switchTab({ url: link })
      } else {
        wx.navigateTo({ url: link })
      }
    }
  },
  onGoBrowse() {
    wx.switchTab({ url: '/pages/model-list/model-list' })
  },
  onGoMerchant() {
    wx.switchTab({ url: '/pages/merchant-center/merchant-center' })
  },
  onGoViewer() {
    wx.navigateTo({
      url: '/subpackages/modelViewer/pages/model-pick/model-pick',
    })
  },
})
