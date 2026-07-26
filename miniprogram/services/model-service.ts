import { Model, CATEGORY_MAP, CategoryType } from '../types/model'
import { ShopLink } from '../types/model'
import { api, uploadFile } from './api'
import { USE_MOCK } from './config'
import { modelsData } from '../data/models'
import { userService } from './user-service'

/* ========== API 响应类型 ========== */

interface ModelItem {
  id: string; name: string; description?: string; thumbnail: string
  model_url?: string; category: CategoryType; tags: string[]
  faces: number; format: string
  view_count: number; favorite_count: number; is_favorited?: boolean
  status?: string; review_comment?: string
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
    price: 0,
    material: '',
    dimensions: '',
    status: 'published',
    shopLinks: [],
  }
}

/* ========== 创建/更新模型参数 ========== */

interface CreateModelData {
  name: string; description: string; category: CategoryType
  tags: string[]; faces: number; format: string
  price: number; material: string; dimensions: string
  shopLinks: ShopLink[]; thumbnail: string; modelUrl: string
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
  toggleFavorite(modelId: string): Promise<{ favorited: boolean; favorite_count: number }>
  getMyFavorites(): Promise<Model[]>
  getMyModels(): Promise<Model[]>
  createModel(data: CreateModelData): Promise<Model>
  updateModel(id: string, data: Partial<CreateModelData>): Promise<Model>
  uploadModelFile(filePath: string): Promise<string>
  uploadThumbnail(filePath: string): Promise<string>
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
  async toggleFavorite(modelId: string) {
    return api.post<{ favorited: boolean; favorite_count: number }>(`/models/${modelId}/favorite/toggle`)
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
}

/* ========== Mock（向后兼容） ========== */

const mockApi: IModelService = {
  async getHotModels(limit?: number) {
    const sorted = [...modelsData]
      .map(m => ({ ...m, hotScore: m.views * 0.4 + m.favorites * 0.6 * 10 }))
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
  async toggleFavorite(modelId: string) {
    let favs: string[] = []; try { favs = wx.getStorageSync('favorites') || [] } catch (_) {}
    let favorited: boolean
    if (favs.includes(modelId)) { favs = favs.filter(id => id !== modelId); favorited = false }
    else { favs = [...favs, modelId]; favorited = true }
    try { wx.setStorageSync('favorites', favs) } catch (_) {}
    return { favorited, favorite_count: favs.length }
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
      .map(m => ({ ...m, merchantName: name }))
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
      price: data.price || 0,
      material: data.material || '',
      dimensions: data.dimensions || '',
      status: 'published',
      shopLinks: data.shopLinks || [],
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
    }
    modelsData[idx] = updated
    return updated
  },
  async uploadModelFile(_filePath: string) {
    return 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
  },
  async uploadThumbnail(_filePath: string) {
    return 'https://picsum.photos/400/400?random=' + Date.now()
  },
}

export const modelService: IModelService = USE_MOCK ? mockApi : realApi
