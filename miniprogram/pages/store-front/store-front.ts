import { Merchant, Model } from '../../types/model'
import { merchantService } from '../../services/merchant-service'
import { modelService } from '../../services/model-service'

Page({
  data: {
    merchant: {} as Merchant,
    models: [] as Model[],
    modelsLoaded: false,
  },
  async onLoad(options: { id?: string }) {
    const id = options.id || ''
    if (!id) return

    try {
      const merchant = await merchantService.getMerchantById(id)
      if (merchant) {
        this.setData({ merchant })
      }
    } catch (e) {
      console.error('[store-front] load merchant failed:', e)
    }

    try {
      const models = await modelService.getModelsByMerchant(id)
      this.setData({ models, modelsLoaded: true })
    } catch (e) {
      console.error('[store-front] load models failed:', e)
      this.setData({ modelsLoaded: true })
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
