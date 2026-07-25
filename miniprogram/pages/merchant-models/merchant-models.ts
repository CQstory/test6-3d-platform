import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'

Page({
  data: {
    models: [] as Model[],
    merchantName: '',
  },
  async onLoad(options: { id?: string }) {
    const id = options.id || ''
    if (id) {
      const models = await modelService.getModelsByMerchant(id)
      this.setData({
        models,
        merchantName: models.length > 0 ? models[0].merchantName : '',
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
})
