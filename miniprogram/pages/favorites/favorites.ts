import { Model } from '../../types/model'
import { modelsData } from '../../data/models'

Page({
  data: {
    models: [] as Model[],
  },
  onLoad() {
    this.loadFavorites()
  },
  onShow() {
    this.loadFavorites()
  },
  loadFavorites() {
    try {
      const favIds: string[] = wx.getStorageSync('favorites') || []
      const models = modelsData.filter(m => favIds.includes(m.id))
      this.setData({ models })
    } catch (_) {
      this.setData({ models: [] })
    }
  },
  onCardTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({ url: '/pages/model-detail/model-detail?id=' + model.id })
    }
  },
})
