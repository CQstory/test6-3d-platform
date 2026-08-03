import { CATEGORY_MAP, CategoryType } from '../../types/model'
import { FALLBACK_IMAGE } from '../../utils/util'

Component({
  properties: {
    model: { type: Object, value: {} },
  },
  data: {
    isFavorite: false,
    facesText: '',
    categoryText: '',
    imgFallback: FALLBACK_IMAGE,
    imgError: false,
  },
  observers: {
    'model': function (this: any, model: any) {
      if (model) {
        this.loadFavoriteStatus(model.id)
        this.setData({
          facesText: model.faces ? ((model.faces / 1000).toFixed(1) + 'K面') : '',
          categoryText: CATEGORY_MAP[model.category as CategoryType] || '道具',
        })
      }
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { model: this.properties.model })
    },
    onImgError() {
      this.setData({ imgError: true })
    },
    loadFavoriteStatus(modelId: string) {
      try {
        const favorites: string[] = wx.getStorageSync('favorites') || []
        this.setData({ isFavorite: favorites.includes(modelId) })
      } catch (_) {
        this.setData({ isFavorite: false })
      }
    },
    onFavorite() {
      const modelId = (this.properties.model as any).id as string
      let favorites: string[] = []
      try { favorites = wx.getStorageSync('favorites') || [] } catch (_) {}

      let newFavorites: string[]
      let isFavorite: boolean
      if (favorites.includes(modelId)) {
        newFavorites = favorites.filter(id => id !== modelId)
        isFavorite = false
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      } else {
        newFavorites = [...favorites, modelId]
        isFavorite = true
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
      try { wx.setStorageSync('favorites', newFavorites) } catch (_) {}
      this.setData({ isFavorite })
      this.triggerEvent('favorite', { modelId, isFavorite })
    },
  },
})
