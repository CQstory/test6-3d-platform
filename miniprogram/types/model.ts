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
  /** 多维价格矩阵；null = 单一定价模式（兼容旧数据） */
  priceMatrix: PriceMatrix | null
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

/** 价格矩阵中单个选项 */
export interface PriceMatrixOption {
  id: string
  label: string
}

/** 价格矩阵（权威数据，随模型详情返回） */
export interface PriceMatrix {
  materials: PriceMatrixOption[]
  sizes: PriceMatrixOption[]
  complexities: PriceMatrixOption[]
  /** 组合键 `材料id:尺寸id:复杂度id` → 价格；允许缺省组合 */
  prices: Record<string, number>
}

/** 维度选项（录入表单用） */
export interface PriceOption {
  id: string
  dimension: 'material' | 'size' | 'complexity'
  label: string
  description?: string
  is_preset: boolean
  is_active: boolean
}

/** 因子系数：维度 → 选项 id → 系数（一键生成入参） */
export type PriceFactors = Record<PriceDimension, Record<string, number>>

/** 价格维度枚举（编辑页勾选用） */
export type PriceDimension = 'material' | 'size' | 'complexity'

/** 分类标签映射 */
export const CATEGORY_MAP: Record<CategoryType, string> = {
  creature: '生物',
  industrial: '工业模具',
  toy: '玩具',
  plant: '植物',
  prop: '道具',
}
