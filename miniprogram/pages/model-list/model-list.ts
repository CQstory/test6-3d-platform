import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    keyword: '',
    activeCategory: 'all',
    categories: [] as { key: string; label: string }[],
    allModels: [] as Model[],
    displayModels: [] as Model[],
    role: '',
  },
  async onLoad() {
    const models = await modelService.getHotModels()
    const cats = [
      { key: 'all', label: '全部' },
      ...modelService.getAllCategories(),
    ]
    const user = userService.getCurrentUser()
    this.setData({
      allModels: models,
      displayModels: models,
      categories: cats,
      role: user ? user.role : 'user',
    })
  },
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
})
