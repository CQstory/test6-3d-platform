import { Merchant } from '../../types/model'
import { merchantsData } from '../../data/merchants'

Page({
  data: {
    merchant: {} as Merchant,
  },
  onLoad(options: { id?: string }) {
    const id = options.id || 'merchant-1'
    const merchant = merchantsData.find(m => m.id === id)
    if (merchant) {
      this.setData({ merchant })
    }
  },
})
