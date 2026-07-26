/** 模型分类 */
export type CategoryType = 'creature' | 'industrial' | 'toy' | 'plant' | 'prop'

/** 模型数据模型 */
export interface Model {
  id: string
  name: string
  description: string
  thumbnail: string
  modelUrl: string
  category: CategoryType
  tags: string[]
  faces: number
  format: string
  merchantId: string
  merchantName: string
  merchantAvatar: string
  views: number
  favorites: number
  price: number
  material: string
  dimensions: string
  status: ModelStatus
  shopLinks: ShopLink[]
}

/** Banner 轮播图 */
export interface Banner {
  id: string
  image: string
  title: string
  subtitle: string
  link: string
}

/** 商家 */
export interface Merchant {
  id: string
  name: string
  avatar: string
  cover: string
  description: string
  contact: {
    wechat: string
    phone: string
    email: string
  }
  stats: {
    models: number
    views: number
    rating: number
  }
}

/** 套餐 */
export interface Plan {
  id: string
  name: string
  price: number
  unit: string
  slots: number
  features: string[]
  highlight: boolean
}

/** 电商链接 */
export interface ShopLink {
  platform: string
  shopName: string
  url: string
}

/** 模型发布状态 */
export type ModelStatus = 'published' | 'flagged' | 'removed'

/** 分类标签映射 */
export const CATEGORY_MAP: Record<CategoryType, string> = {
  creature: '生物',
  industrial: '工业模具',
  toy: '玩具',
  plant: '植物',
  prop: '道具',
}
