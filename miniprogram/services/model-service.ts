import { Model, CATEGORY_MAP, CategoryType } from '../types/model'
import { ShopLink, PriceMatrix, PriceOption, PriceDimension, PriceFactors } from '../types/model'
import { api, uploadFile } from './api'
import { USE_MOCK } from './config'
import { modelsData } from '../data/models'
import { userService } from './user-service'

/* ========== 预置价格选项（G3 接口就绪前编辑页回退使用） ========== */

export const PRESET_PRICE_OPTIONS: PriceOption[] = [
  { id: 'preset-pla', dimension: 'material', label: 'PLA', is_preset: true, is_active: true },
  { id: 'preset-resin', dimension: 'material', label: '树脂', is_preset: true, is_active: true },
  { id: 'preset-nylon', dimension: 'material', label: '尼龙', is_preset: true, is_active: true },
  { id: 'preset-s', dimension: 'size', label: 'S', is_preset: true, is_active: true },
  { id: 'preset-m', dimension: 'size', label: 'M', is_preset: true, is_active: true },
  { id: 'preset-l', dimension: 'size', label: 'L', is_preset: true, is_active: true },
  { id: 'preset-xl', dimension: 'size', label: 'XL', is_preset: true, is_active: true },
  { id: 'preset-easy', dimension: 'complexity', label: '简单', is_preset: true, is_active: true },
  { id: 'preset-medium', dimension: 'complexity', label: '中等', is_preset: true, is_active: true },
  { id: 'preset-hard', dimension: 'complexity', label: '复杂', is_preset: true, is_active: true },
]

/* ========== API 响应类型 ========== */

interface ModelItem {
  id: string; name: string; description?: string; thumbnail: string
  model_url?: string; category: CategoryType; tags: string[]
  faces: number; format: string
  view_count: number; favorite_count: number; is_favorited?: boolean
  click_count?: number
  favorite_added?: number
  status?: string; review_comment?: string
  price_matrix?: PriceMatrix | null
  shop?: { id: string; name: string; avatar: string }
}
interface ModelListResponse { total: number; items: ModelItem[] }

/* ========== 字段映射：API(snake_case) → 前端(camelCase) ========== */

function mapModel(item: ModelItem): Model {
  return {
    id: item.id, name: item.name,
    description: item.description || '', thumbnail: item.thumbnail,
    modelUrl: item.model_url || '', category: item.category,
    tags: item.tags || [], faces: item.faces || 0, format: item.format || 'glb',
    merchantId: (item.shop && item.shop.id) || '',
    merchantName: (item.shop && item.shop.name) || '',
    merchantAvatar: (item.shop && item.shop.avatar) || '',
    views: item.view_count || 0, favorites: item.favorite_count || 0,
    clicks: item.click_count || 0,
    favoriteAdded: item.favorite_added || 0,
    price: 0,
    material: '',
    dimensions: '',
    status: 'published',
    shopLinks: [],
    priceMatrix: item.price_matrix || null,
  }
}

/* ========== 创建/更新模型参数 ========== */

interface CreateModelData {
  name: string; description: string; category: CategoryType
  tags: string[]; faces: number; format: string
  price: number; material: string; dimensions: string
  shopLinks: ShopLink[]; thumbnail: string; modelUrl: string
  /** 多维定价（均可选；都不传 = 单一定价，兼容旧行为） */
  base_price?: number
  factors?: PriceFactors
  price_matrix?: PriceMatrix
}

/* ========== Service 接口 ========== */

export interface IModelService {
  getHotModels(limit?: number): Promise<Model[]>
  getFeaturedModels(limit?: number): Promise<Model[]>
  getModelById(id: string): Promise<Model | null>
  getModelsByCategory(cat: CategoryType): Promise<Model[]>
  getModelsByMerchant(merchantId: string): Promise<Model[]>
  searchModels(keyword: string): Promise<Model[]>
  getAllCategories(): { key: CategoryType; label: string }[]
  recordView(modelId: string): Promise<number>
  /** 记录电商链接点击：每次点击 +1，不去重（浏览量可能小于点击量） */
  recordClick(modelId: string, data?: { link_url?: string; platform?: string }): Promise<number>
  /** 浏览/点击趋势（近 N 天，后端聚合；接口未就绪时前端降级） */
  getStatsTrend(days?: number): Promise<{ dates: string[]; views: number[]; clicks: number[]; favorites: number[] }>
  toggleFavorite(modelId: string): Promise<{ favorited: boolean; favorite_count: number; favorite_added: number }>
  getMyFavorites(): Promise<Model[]>
  getMyModels(): Promise<Model[]>
  createModel(data: CreateModelData): Promise<Model>
  updateModel(id: string, data: Partial<CreateModelData>): Promise<Model>
  uploadModelFile(filePath: string): Promise<string>
  uploadThumbnail(filePath: string): Promise<string>
  getPriceOptions(dimension: PriceDimension): Promise<PriceOption[]>
  createPriceOption(data: { dimension: PriceDimension; label: string; description?: string }): Promise<PriceOption>
  previewPriceMatrix(params: {
    base_price: number
    factors: PriceFactors
    materials: { id: string; label: string }[]
    sizes: { id: string; label: string }[]
    complexities: { id: string; label: string }[]
  }): Promise<PriceMatrix>
}

/* ========== Real API ========== */

const realApi: IModelService = {
  async getHotModels(limit = 8) {
    const res = await api.get<ModelListResponse>(`/models?hot=true&size=${limit}`)
    return res.items.map(mapModel)
  },
  async getFeaturedModels(limit = 4) {
    const res = await api.get<ModelListResponse>(`/models?featured=true&size=${limit}`)
    return res.items.map(mapModel)
  },
  async getModelById(id: string) {
    const item = await api.get<ModelItem>(`/models/${id}`)
    return item ? mapModel(item) : null
  },
  async getModelsByCategory(cat: CategoryType) {
    const res = await api.get<ModelListResponse>(`/models?category=${cat}`)
    return res.items.map(mapModel)
  },
  async getModelsByMerchant(merchantId: string) {
    const res = await api.get<ModelListResponse>(`/models?shop_id=${merchantId}`)
    return res.items.map(mapModel)
  },
  async searchModels(keyword: string) {
    const res = await api.get<ModelListResponse>(`/models?keyword=${encodeURIComponent(keyword)}`)
    return res.items.map(mapModel)
  },
  getAllCategories() {
    return Object.entries(CATEGORY_MAP).map(([key, label]) => ({ key: key as CategoryType, label }))
  },
  async recordView(modelId: string) {
    const res = await api.post<{ view_count: number }>(`/models/${modelId}/view`)
    return res.view_count
  },
  async recordClick(modelId: string, data?: { link_url?: string; platform?: string }) {
    const res = await api.post<{ click_count: number }>(`/models/${modelId}/click`, data || {})
    return res.click_count
  },
  async getStatsTrend(days = 7) {
    const res = await api.get<{ dates: string[]; views: number[]; clicks: number[]; favorites: number[] }>(
      `/merchant/stats/trend?days=${days}`
    )
    return res
  },
  async toggleFavorite(modelId: string) {
    return api.post<{ favorited: boolean; favorite_count: number; favorite_added: number }>(`/models/${modelId}/favorite/toggle`)
  },
  async getMyFavorites() {
    const res = await api.get<ModelListResponse>('/users/me/favorites')
    return res.items.map(mapModel)
  },
  async getMyModels() {
    const res = await api.get<ModelListResponse>('/merchant/models')
    return res.items.map(mapModel)
  },
  async createModel(data: CreateModelData) {
    const res = await api.post<ModelItem>('/models', data)
    return mapModel(res)
  },
  async updateModel(id: string, data: Partial<CreateModelData>) {
    const res = await api.put<ModelItem>('/models/' + id, data)
    return mapModel(res)
  },
  async uploadModelFile(filePath: string) {
    const res = await uploadFile(filePath, '/upload/model')
    return res.url
  },
  async uploadThumbnail(filePath: string) {
    const res = await uploadFile(filePath, '/upload/thumbnail')
    return res.url
  },
  async getPriceOptions(dimension: PriceDimension) {
    const res = await api.get<{ items: PriceOption[] }>(`/price-options?dimension=${dimension}`)
    return res.items || []
  },
  async createPriceOption(data: { dimension: PriceDimension; label: string; description?: string }) {
    return api.post<PriceOption>('/price-options', data)
  },
  async previewPriceMatrix(params: {
    base_price: number
    factors: PriceFactors
    materials: { id: string; label: string }[]
    sizes: { id: string; label: string }[]
    complexities: { id: string; label: string }[]
  }) {
    return api.post<PriceMatrix>('/models/price-matrix/preview', params)
  },
}

/* ========== Mock（向后兼容） ========== */

const mockApi: IModelService = {
  async getHotModels(limit?: number) {
    // 新热度公式：特殊浏览量 = views + 5×favoriteAdded + 3×clicks（收藏含取消加权，体现强意向）
    const sorted = [...modelsData]
      .map(m => ({ ...m, hotScore: m.views + m.favoriteAdded * 5 + m.clicks * 3 }))
      .sort((a, b) => b.hotScore - a.hotScore)
    return sorted.slice(0, limit != null ? limit : sorted.length)
  },
  async getFeaturedModels(limit?: number) {
    return modelsData.slice(0, limit != null ? limit : 4)
  },
  async getModelById(id: string) {
    return modelsData.find(m => m.id === id) || null
  },
  async getModelsByCategory(cat: CategoryType) {
    return modelsData.filter(m => m.category === cat)
  },
  async getModelsByMerchant(merchantId: string) {
    return modelsData.filter(m => m.merchantId === merchantId)
  },
  async searchModels(keyword: string) {
    const kw = keyword.toLowerCase()
    return modelsData.filter(m =>
      m.name.toLowerCase().includes(kw) || m.tags.some(t => t.includes(kw)) || m.description.toLowerCase().includes(kw)
    )
  },
  getAllCategories() {
    return Object.entries(CATEGORY_MAP).map(([key, label]) => ({ key: key as CategoryType, label }))
  },
  async recordView() { return 0 },
  async recordClick(modelId: string, _data?: { link_url?: string; platform?: string }) {
    // 本地累加点击次数（每次 +1，不去重）
    const key = 'mock_clicks_' + modelId
    const n = (Number(wx.getStorageSync(key)) || 0) + 1
    try { wx.setStorageSync(key, n) } catch (_) {}
    return n
  },
  async getStatsTrend(days = 7) {
    // 模拟近 N 天三序列（常态：浏览 ≥ 收藏 ≥ 点击）
    const dates: string[] = []; const views: number[] = []; const clicks: number[] = []; const favorites: number[] = []
    const now = Date.now()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
      const v = 40 + Math.round(Math.random() * 60)
      views.push(v)
      favorites.push(Math.round(v * 0.6))
      clicks.push(Math.round(v * 0.3))
    }
    return { dates, views, clicks, favorites }
  },
  async toggleFavorite(modelId: string) {
    let favs: string[] = []; try { favs = wx.getStorageSync('favorites') || [] } catch (_) {}
    let favorited: boolean
    let added = Number(wx.getStorageSync('mock_fav_added_' + modelId)) || 0
    if (favs.includes(modelId)) { favs = favs.filter(id => id !== modelId); favorited = false }
    else {
      favs = [...favs, modelId]; favorited = true
      // 累计收藏 +1（取消不回退，模拟后端 favorite_added 口径）
      added += 1
      try { wx.setStorageSync('mock_fav_added_' + modelId, added) } catch (_) {}
    }
    try { wx.setStorageSync('favorites', favs) } catch (_) {}
    return { favorited, favorite_count: favs.length, favorite_added: added }
  },
  async getMyFavorites() {
    let favIds: string[] = []; try { favIds = wx.getStorageSync('favorites') || [] } catch (_) {}
    return modelsData.filter(m => favIds.includes(m.id))
  },
  async getMyModels() {
    const user = userService.getCurrentUser()
    const merchantId = 'merchant-1'
    const name = user ? user.nickname : '星河模型工坊'
    return modelsData
      .filter(m => m.merchantId === merchantId)
      .map(m => ({
        ...m,
        merchantName: name,
        clicks: m.clicks + (Number(wx.getStorageSync('mock_clicks_' + m.id)) || 0),
        favoriteAdded: m.favoriteAdded + (Number(wx.getStorageSync('mock_fav_added_' + m.id)) || 0),
      }))
  },
  async createModel(data: CreateModelData) {
    const user = userService.getCurrentUser()
    const newModel: Model = {
      id: 'model-' + Date.now(),
      name: data.name,
      description: data.description || '',
      thumbnail: data.thumbnail || 'https://picsum.photos/400/400?random=' + Date.now(),
      modelUrl: data.modelUrl || '',
      category: data.category,
      tags: data.tags || [],
      faces: data.faces || 0,
      format: data.format || 'glb',
      merchantId: 'merchant-1',
      merchantName: user ? user.nickname : '星河模型工坊',
      merchantAvatar: user ? user.avatar : 'https://api.dicebear.com/8.x/shapes/svg?seed=galaxy',
      views: 0,
      favorites: 0,
      clicks: 0,
      favoriteAdded: 0,
      price: data.price || 0,
      material: data.material || '',
      dimensions: data.dimensions || '',
      status: 'published',
      shopLinks: data.shopLinks || [],
      priceMatrix: data.price_matrix || null,
    }
    modelsData.unshift(newModel)
    return newModel
  },
  async updateModel(id: string, data: Partial<CreateModelData>) {
    const idx = modelsData.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('模型未找到')
    const existing = modelsData[idx]
    const updated: Model = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.faces !== undefined && { faces: data.faces }),
      ...(data.format !== undefined && { format: data.format }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.material !== undefined && { material: data.material }),
      ...(data.dimensions !== undefined && { dimensions: data.dimensions }),
      ...(data.shopLinks !== undefined && { shopLinks: data.shopLinks }),
      ...(data.thumbnail !== undefined && { thumbnail: data.thumbnail }),
      ...(data.modelUrl !== undefined && { modelUrl: data.modelUrl }),
      ...(data.price_matrix !== undefined && { priceMatrix: data.price_matrix }),
    }
    modelsData[idx] = updated
    return updated
  },
  async getPriceOptions(dimension: PriceDimension) {
    return PRESET_PRICE_OPTIONS.filter(o => o.dimension === dimension)
  },
  async createPriceOption(data: { dimension: PriceDimension; label: string; description?: string }) {
    if (PRESET_PRICE_OPTIONS.some(o => o.dimension === data.dimension && o.label === data.label)) {
      throw new Error('该选项已存在')
    }
    const option: PriceOption = {
      id: 'custom-' + Date.now(),
      dimension: data.dimension,
      label: data.label,
      description: data.description || '',
      is_preset: false,
      is_active: true,
    }
    PRESET_PRICE_OPTIONS.push(option)
    return option
  },
  async previewPriceMatrix(params: {
    base_price: number
    factors: PriceFactors
    materials: { id: string; label: string }[]
    sizes: { id: string; label: string }[]
    complexities: { id: string; label: string }[]
  }) {
    const { base_price, factors, materials, sizes, complexities } = params
    if (materials.length === 0 || sizes.length === 0 || complexities.length === 0) {
      throw new Error('每个维度至少选择一个选项')
    }
    const factorOf = (dim: PriceDimension, id: string) => {
      const m = factors[dim]
      return m && m[id] != null ? m[id] : 1.0
    }
    const prices: Record<string, number> = {}
    materials.forEach(m => {
      sizes.forEach(s => {
        complexities.forEach(c => {
          const key = `${m.id}:${s.id}:${c.id}`
          const p = base_price * factorOf('material', m.id) * factorOf('size', s.id) * factorOf('complexity', c.id)
          prices[key] = Math.round(p * 100) / 100
        })
      })
    })
    return { materials, sizes, complexities, prices }
  },
  async uploadModelFile(_filePath: string) {
    return 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
  },
  async uploadThumbnail(_filePath: string) {
    return 'https://picsum.photos/400/400?random=' + Date.now()
  },
}

export const modelService: IModelService = USE_MOCK ? mockApi : realApi
