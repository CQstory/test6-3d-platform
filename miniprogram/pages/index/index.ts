import { Model, Banner } from '../../types/model'
import { modelService } from '../../services/model-service'
import { bannersData } from '../../data/banners'

Page({
  data: {
    banners: [] as Banner[],
    hotModels: [] as Model[],
    displayHotModels: [] as Model[],
    hotExpanded: false,
    featuredModels: [] as Model[],
  },
  async onLoad() {
    const hotModels = await modelService.getHotModels()
    const featuredModels = await modelService.getFeaturedModels()
    this.setData({
      banners: bannersData,
      hotModels,
      displayHotModels: hotModels.slice(0, 2),
      featuredModels,
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
})
