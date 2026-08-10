import { Merchant } from '../types/model'
import { api, uploadFile } from './api'
import { USE_MOCK } from './config'
import { merchantsData } from '../data/merchants'

/* ========== API 响应类型 ========== */

interface ShopResponse {
  id: string; name: string; avatar: string; cover: string; description: string
  specialties?: string[]
  model_count?: number; total_views?: number
  contact?: { wechat: string; phone: string; email: string }
  stats?: { models: number; views: number; rating: number }
}

interface ShopListResponse {
  total: number
  items: ShopResponse[]
  page?: number
  size?: number
}

/* ========== 字段映射：API(snake_case) → 前端(camelCase) ========== */

/** 取第一个非 null/undefined 的值（兼容写法，等价于 ??，微信编译链 es6:false 不支持 ??） */
function firstDefined(...vals: any[]): any {
  for (const v of vals) {
    if (v != null) return v
  }
  return undefined
}

function mapShop(item: ShopResponse): Merchant {
  return {
    id: item.id, name: item.name, avatar: item.avatar,
    cover: item.cover, description: item.description,
    specialties: item.specialties || [],
    contact: item.contact || { wechat: '', phone: '', email: '' },
    stats: {
      models: firstDefined(item.model_count, item.stats && item.stats.models, 0),
      views: firstDefined(item.total_views, item.stats && item.stats.views, 0),
      rating: (item.stats && item.stats.rating) || 0,
    },
  }
}

/* ========== Service 接口 ========== */

export interface IMerchantService {
  getMerchantById(id: string): Promise<Merchant | null>
  getAllMerchants(): Promise<Merchant[]>
  getMyShop(): Promise<Merchant | null>
  updateShop(data: Partial<Merchant>): Promise<Merchant>
  uploadImage(filePath: string): Promise<string>
  applyShop(data: {
    name: string
    description?: string
    contact?: { wechat: string; phone: string; email: string }
    plan_id?: string
  }): Promise<{ success: boolean; msg: string }>
}

/* ========== Real API ========== */

const realApi: IMerchantService = {
  async getMerchantById(id: string) {
    try {
      const item = await api.get<ShopResponse>(`/shops/${id}`)
      return mapShop(item)
    } catch {
      return null
    }
  },
  async getAllMerchants() {
    // 后端已交付 GET /shops（仅返回审核通过店铺）；失败时返回空列表（页面展示空态）
    // 不降级静态 mock：mock id 与真实模型 shop_id 不匹配，会导致缩略图等聚合数据错位
    try {
      const res = await api.get<ShopListResponse>('/shops?size=50')
      return res.items.map(mapShop)
    } catch (e) {
      console.error('[merchant-service] getAllMerchants failed:', e)
      return []
    }
  },
  async getMyShop() {
    try {
      const item = await api.get<ShopResponse>('/shops/mine')
      return mapShop(item)
    } catch {
      return null
    }
  },
  async updateShop(data: Partial<Merchant>) {
    const res = await api.put<ShopResponse>('/shops/mine', {
      name: data.name,
      avatar: data.avatar,
      cover: data.cover,
      description: data.description,
      contact_wechat: data.contact && data.contact.wechat,
      contact_phone: data.contact && data.contact.phone,
      contact_email: data.contact && data.contact.email,
    })
    return mapShop(res)
  },
  async uploadImage(filePath: string) {
    // 店铺图片复用通用缩略图上传接口
    const res = await uploadFile(filePath, '/upload/thumbnail')
    return res.url
  },
  async applyShop(data: { name: string; description?: string; contact?: { wechat: string; phone: string; email: string }; plan_id?: string }) {
    try {
      await api.post<{ id: string; status: string }>('/shops', {
        name: data.name,
        description: data.description || '',
        contact_wechat: data.contact && data.contact.wechat,
        contact_phone: data.contact && data.contact.phone,
        contact_email: data.contact && data.contact.email,
        plan_id: data.plan_id,
      })
      return { success: true, msg: '申请已提交，等待审核' }
    } catch (e: any) {
      const msg = e && e.data && e.data.detail ? e.data.detail : '申请失败'
      return { success: false, msg }
    }
  },
}

/* ========== Mock（本地存储持久化店铺修改） ========== */

const MOCK_SHOP_KEY = 'mock_my_shop'

function getMockShop(): Merchant {
  const base = merchantsData[0]
  try {
    const raw = wx.getStorageSync(MOCK_SHOP_KEY)
    if (raw) return { ...base, ...JSON.parse(raw) }
  } catch (_) {}
  return base
}

const mockApi: IMerchantService = {
  async getMerchantById(id: string) {
    return merchantsData.find(m => m.id === id) || null
  },
  async getAllMerchants() {
    return merchantsData
  },
  async getMyShop() {
    return getMockShop()
  },
  async updateShop(data: Partial<Merchant>) {
    const current = getMockShop()
    const updated: Merchant = {
      ...current,
      name: data.name !== undefined ? data.name : current.name,
      avatar: data.avatar !== undefined ? data.avatar : current.avatar,
      cover: data.cover !== undefined ? data.cover : current.cover,
      description: data.description !== undefined ? data.description : current.description,
      contact: { ...current.contact, ...(data.contact || {}) },
    }
    try { wx.setStorageSync(MOCK_SHOP_KEY, JSON.stringify(updated)) } catch (_) {}
    return updated
  },
  async uploadImage(_filePath: string) {
    return 'https://picsum.photos/400/300?random=' + Date.now()
  },
  async applyShop(data: { name: string; description?: string; contact?: { wechat: string; phone: string; email: string }; plan_id?: string }) {
    if (!data.name || !data.name.trim()) {
      return { success: false, msg: '请输入店铺名称' }
    }
    // Mock：模拟提交成功，写入本地
    try {
      wx.setStorageSync('mock_apply', { name: data.name, plan_id: data.plan_id, at: Date.now() })
    } catch (_e) {}
    return { success: true, msg: '申请已提交，等待审核' }
  },
}

export const merchantService: IMerchantService = USE_MOCK ? mockApi : realApi
