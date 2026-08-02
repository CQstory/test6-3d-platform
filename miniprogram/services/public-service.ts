import { Banner, Plan } from '../types/model'
import { api } from './api'
import { USE_MOCK } from './config'
import { bannersData } from '../data/banners'
import { plansData } from '../data/plans'

/* ========== 类型 ========== */

interface BannerItem { id: string; image: string; title: string; subtitle: string; link: string }

interface PlanItem {
  id: string; plan_key: string; name: string; price: number
  slots: number; features: string[]; is_highlighted: boolean
}

/** 后端实际返回裸数组（部分接口可能是 {items} 包装），统一归一化为数组 */
function unwrapList<T>(res: T[] | { items?: T[] } | null): T[] {
  if (Array.isArray(res)) return res
  return (res && res.items) || []
}

/* ========== 映射 ========== */

function mapPlan(item: PlanItem): Plan {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    unit: '月',
    slots: item.slots,
    features: item.features || [],
    highlight: item.is_highlighted || false,
  }
}

/* ========== Service ========== */

export interface IPublicService {
  getBanners(): Promise<Banner[]>
  getPlans(): Promise<Plan[]>
}

const realService: IPublicService = {
  async getBanners() {
    const res = await api.get<BannerItem[] | { items: BannerItem[] }>('/banners')
    return unwrapList(res) as Banner[]
  },
  async getPlans() {
    const res = await api.get<PlanItem[] | { items: PlanItem[] }>('/plans')
    return unwrapList(res).map(mapPlan)
  },
}

const mockService: IPublicService = {
  async getBanners() { return bannersData },
  async getPlans() { return plansData },
}

export const publicService: IPublicService = USE_MOCK ? mockService : realService
