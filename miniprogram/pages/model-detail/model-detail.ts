import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'
import { FALLBACK_IMAGE, formatPriceText } from '../../utils/util'

Page({
  data: {
    model: {} as Model,
    facesText: '',
    priceText: '',
    isFavorite: false,
    imgFallback: FALLBACK_IMAGE,
    imgError: false,
  },
  /** 记录当前模型 ID */
  _modelId: '' as string,

  async onLoad(options: { id?: string }) {
    console.log('[model-detail] onLoad, options=', options)
    this._modelId = options.id || ''

    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 1500)
      return
    }

    const id = this._modelId
    if (!id) return

    try {
      const model = await modelService.getModelById(id)
      if (model) {
        this.setData({
          model,
          facesText: model.faces ? (model.faces / 1000).toFixed(1) + 'K面' : '',
          priceText: formatPriceText(model.price || 0, model.priceMatrix || null),
        })
        this.loadFavoriteStatus(id)
        console.log('[model-detail] model loaded:', model.name)
        modelService.recordView(id).catch(() => {})
      } else {
        console.warn('[model-detail] model not found for id:', id)
      }
    } catch (err: any) {
      console.error('[model-detail] Failed to load model:', err)
      // API 请求失败时不阻塞页面，保留空状态让用户可操作
    }
  },

  onShow() {
    console.log('[model-detail] onShow, modelId=', this._modelId)

    // 简单的数据刷新
    const m = this.data.model as Model
    if (m && m.id) {
      this.setData({
        facesText: m.faces ? (m.faces / 1000).toFixed(1) + 'K面' : '',
      })
      // 收藏状态可能在其他页面变更，重新读取
      this.loadFavoriteStatus(m.id)
    }
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
    const modelId = this._modelId
    if (!modelId) return
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
  },

  onGoMerchant() {
    const m = this.data.model as Model
    if (m && m.merchantId) {
      wx.navigateTo({
        url: '/pages/store-front/store-front?id=' + m.merchantId,
      })
    }
  },

  onUnload() {
    console.log('[model-detail] onUnload — page destroyed')
  },

  onPageTap(e: any) {
    console.log('[model-detail] page tap detected, target:', e.target.id || e.target.dataset || 'no-id')
  },

  onImgError() {
    this.setData({ imgError: true })
  },

  onOpenLink(e: any) {
    const url = e.currentTarget.dataset.url
    if (url) {
      // 点击跳转埋点：每次点击 +1，不去重（浏览量可能小于点击量）
      modelService.recordClick(this._modelId, {
        link_url: url,
        platform: e.currentTarget.dataset.platform || '',
      }).catch(() => {})
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' }),
      })
    }
  },

  onView3D() {
    console.log('[model-detail] onView3D tapped')
    const m = this.data.model as Model
    const id = m.id || this._modelId
    const name = m.name || ''
    const modelUrl = m.modelUrl || ''
    wx.navigateTo({
      url:
        '/subpackages/modelViewer/pages/viewer/viewer?id=' +
        encodeURIComponent(id) +
        '&name=' +
        encodeURIComponent(name) +
        '&modelUrl=' +
        encodeURIComponent(modelUrl),
    })
  },

})
