import { Merchant } from '../types/model'
import { api } from './api'
import { USE_MOCK } from './config'
import { merchantsData } from '../data/merchants'

/* ========== API 响应类型 ========== */

interface ShopResponse {
  id: string; name: string; avatar: string; cover: string; description: string
  model_count?: number; total_views?: number
}

/* ========== Service 接口 ========== */

export interface IMerchantService {
  getMerchantById(id: string): Promise<Merchant | null>
  getAllMerchants(): Promise<Merchant[]>
}

/* ========== Real API ========== */

const realApi: IMerchantService = {
  async getMerchantById(id: string) {
    try {
      const item = await api.get<ShopResponse>(`/shops/${id}`)
      return {
        id: item.id, name: item.name, avatar: item.avatar,
        cover: item.cover, description: item.description,
        contact: { wechat: '', phone: '', email: '' },
        stats: {
          models: item.model_count || 0,
          views: item.total_views || 0,
          rating: 0,
        },
      }
    } catch {
      return null
    }
  },
  async getAllMerchants() {
    return merchantsData // 后端无全量列表
  },
}

/* ========== Mock ========== */

const mockApi: IMerchantService = {
  async getMerchantById(id: string) {
    return merchantsData.find(m => m.id === id) || null
  },
  async getAllMerchants() {
    return merchantsData
  },
}

export const merchantService: IMerchantService = USE_MOCK ? mockApi : realApi
