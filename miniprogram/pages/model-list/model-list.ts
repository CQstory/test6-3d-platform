import { Merchant, Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { merchantService } from '../../services/merchant-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    activeTab: 'merchants',
    // 搜索模型子页面
    keyword: '',
    activeCategory: 'all',
    categories: [] as { key: string; label: string }[],
    allModels: [] as Model[],
    displayModels: [] as Model[],
    // 搜索商家子页面
    merchantKeyword: '',
    activeSpecialty: 'all',
    specialties: [] as string[],
    allMerchants: [] as Merchant[],
    displayMerchants: [] as Merchant[],
    top3ModelsMap: {} as Record<string, Model[]>,
    role: '',
  },
  async onLoad() {
    const user = userService.getCurrentUser()
    this.setData({ role: user ? user.role : 'user' })

    // 模型子页面
    const models = await modelService.getHotModels()
    const cats = [
      { key: 'all', label: '全部' },
      ...modelService.getAllCategories(),
    ]
    this.setData({ allModels: models, displayModels: models, categories: cats })

    // 商家子页面
    try {
      const merchants = await merchantService.getAllMerchants()
      // 领域 chips：全量商家 specialties 去重
      const specSet: string[] = []
      merchants.forEach(m => {
        ;(m.specialties || []).forEach(s => {
          if (specSet.indexOf(s) === -1) specSet.push(s)
        })
      })
      // 代表作：每个商家 views 前 3 的模型
      const top3ModelsMap: Record<string, Model[]> = {}
      for (const m of merchants) {
        try {
          const list = await modelService.getModelsByMerchant(m.id)
          top3ModelsMap[m.id] = list
            .sort((a, b) => b.views - a.views)
            .slice(0, 3)
        } catch (_) {
          top3ModelsMap[m.id] = []
        }
      }
      this.setData({
        allMerchants: merchants,
        displayMerchants: merchants,
        specialties: specSet,
        top3ModelsMap,
      })
    } catch (_) {
      this.setData({ allMerchants: [], displayMerchants: [] })
    }
  },
  /* ===== inner tabs ===== */
  onInnerTabTap(e: WechatMiniprogram.TouchEvent) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as string })
  },
  /* ===== 搜索模型子页面（原逻辑保留） ===== */
  onSearchInput(e: any) {
    this.setData({ keyword: (e.detail.value || '').trim() })
    this._filter()
  },
  onCategoryTap(e: any) {
    this.setData({ activeCategory: e.currentTarget.dataset.key as string })
    this._filter()
  },
  _filter() {
    let list = this.data.allModels
    if (this.data.activeCategory !== 'all') {
      list = list.filter(m => m.category === this.data.activeCategory)
    }
    if (this.data.keyword) {
      const kw = this.data.keyword.toLowerCase()
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(kw) ||
          m.tags.some(t => t.includes(kw))
      )
    }
    this.setData({ displayModels: list })
  },
  onCardTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
  /* ===== 搜索商家子页面 ===== */
  onMerchantSearchInput(e: any) {
    this.setData({ merchantKeyword: (e.detail.value || '').trim() })
    this._filterMerchants()
  },
  onSpecialtyTap(e: any) {
    this.setData({ activeSpecialty: e.currentTarget.dataset.key as string })
    this._filterMerchants()
  },
  _filterMerchants() {
    let list = this.data.allMerchants
    if (this.data.activeSpecialty !== 'all') {
      list = list.filter(
        m => (m.specialties || []).indexOf(this.data.activeSpecialty) !== -1
      )
    }
    if (this.data.merchantKeyword) {
      const kw = this.data.merchantKeyword.toLowerCase()
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(kw) ||
          m.description.toLowerCase().includes(kw) ||
          (m.specialties || []).some(s => s.toLowerCase().includes(kw))
      )
    }
    this.setData({ displayMerchants: list })
  },
  onMerchantTap(e: any) {
    const merchant = (e.detail && e.detail.merchant) as Merchant
    if (merchant) {
      wx.navigateTo({
        url: '/pages/store-front/store-front?id=' + merchant.id,
      })
    }
  },
  onThumbModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-detail/model-detail?id=' + model.id,
      })
    }
  },
})
