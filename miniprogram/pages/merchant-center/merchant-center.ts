import { Model, Merchant } from '../../types/model'
import { modelService } from '../../services/model-service'
import { merchantService } from '../../services/merchant-service'
import { userService } from '../../services/user-service'

Page({
  data: {
    role: '',
    isMerchant: false,
    activeTab: 'models' as 'models' | 'stats',
    shop: {} as Merchant,
    models: [] as Model[],
    // 数据看板
    stats: { total: 0, views: 0, clicks: 0, favorites: 0, favoriteAdded: 0, conversion: 0 },
    favoriteDiff: 0, // 收藏后取消人次 = 累计收藏 - 当前收藏（深度意向信号）
    topByViews: [] as Model[],
    topByClicks: [] as Model[],
    topByFavorites: [] as Model[],
    rankList: [] as Model[],
    rankTab: 'clicks' as 'views' | 'clicks' | 'favorites',
    statusDist: { published: 0, flagged: 0, removed: 0 } as Record<string, number>,
    trend: { dates: [] as string[], views: [] as number[], clicks: [] as number[], favorites: [] as number[] },
    trendReady: false,
  },
  async onLoad() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async onShow() {
    const user = userService.getCurrentUser()
    const role = user ? user.role : 'user'
    const isMerchant = role === 'merchant'
    this.setData({ role, isMerchant })
    if (isMerchant) {
      this._loadData()
    }
  },
  async _loadData() {
    // 店铺信息（用于顶部店铺卡，点击进入店铺设置）
    try {
      const shop = await merchantService.getMyShop()
      this.setData({ shop: shop || ({} as Merchant) })
    } catch (_e) {
      this.setData({ shop: {} as Merchant })
    }
    // 模型列表：失败不抛异常，保留空列表（后端可能返回 400 未入驻等）
    try {
      const models = await modelService.getMyModels()
      this.setData({ models })
      this._aggregateStats(models)
    } catch (_e) {
      this.setData({ models: [] })
    }
  },
  /** 数据看板聚合：一次 getMyModels 全部派生（总览/转化率/排行/状态分布/趋势） */
  _aggregateStats(models: Model[]) {
    const total = models.length
    const views = models.reduce((s, m) => s + m.views, 0)
    const clicks = models.reduce((s, m) => s + m.clicks, 0)
    const favorites = models.reduce((s, m) => s + m.favorites, 0)
    const favoriteAdded = models.reduce((s, m) => s + m.favoriteAdded, 0)
    // 浏览 → 点击转化率（点击数可大于浏览量，故转化率可为 100%+）
    const conversion = views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0
    const statusDist = { published: 0, flagged: 0, removed: 0 }
    models.forEach(m => { if (statusDist[m.status] != null) statusDist[m.status]++ })
    this.setData({
      stats: { total, views, clicks, favorites, favoriteAdded, conversion },
      favoriteDiff: favoriteAdded - favorites,
      topByViews: [...models].sort((a, b) => b.views - a.views).slice(0, 5),
      topByClicks: [...models].sort((a, b) => b.clicks - a.clicks).slice(0, 5),
      topByFavorites: [...models].sort((a, b) => b.favoriteAdded - a.favoriteAdded).slice(0, 5),
      statusDist,
    })
    this._updateRankList()
    // 趋势：Real 模式调后端接口（未就绪降级）；Mock 模式返回模拟数据
    modelService.getStatsTrend(7)
      .then((raw) => {
        const max = Math.max(...raw.views, ...raw.clicks, ...raw.favorites, 1)
        this.setData({
          trend: {
            dates: raw.dates,
            views: raw.views.map(v => Math.round((v / max) * 100)),
            clicks: raw.clicks.map(c => Math.round((c / max) * 100)),
            favorites: raw.favorites.map(f => Math.round((f / max) * 100)),
          },
          trendReady: true,
        })
      })
      .catch(() => this.setData({ trendReady: false }))
  },
  /** 按当前排行 Tab 刷新展示列表（收藏按累计 favoriteAdded 排序） */
  _updateRankList() {
    const tab = this.data.rankTab
    const list = tab === 'clicks' ? this.data.topByClicks : tab === 'views' ? this.data.topByViews : this.data.topByFavorites
    this.setData({ rankList: list })
  },
  onRankTabTap(e: any) {
    this.setData({ rankTab: e.currentTarget.dataset.tab as 'views' | 'clicks' | 'favorites' })
    this._updateRankList()
  },
  onTabTap(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.tab as 'models' | 'stats' })
  },
  onShopTap() {
    wx.navigateTo({ url: '/pages/shop-settings/shop-settings' })
  },
  onModelTap(e: any) {
    const model = (e.detail && e.detail.model) as Model
    if (model) {
      wx.navigateTo({
        url: '/pages/model-edit/model-edit?id=' + model.id,
      })
    }
  },
  onAddModel() {
    wx.navigateTo({ url: '/pages/model-edit/model-edit' })
  },
})
