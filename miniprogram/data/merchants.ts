import { Merchant } from '../types/model'

export const merchantsData: Merchant[] = [
  {
    id: 'merchant-1',
    name: '星河模型工坊',
    avatar: 'https://api.dicebear.com/8.x/shapes/svg?seed=galaxy',
    cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    description: '专注科幻与军事题材3D建模，拥有5年行业经验。擅长硬表面建模与PBR材质表现，作品涵盖头盔、武器、载具等多种品类。',
    specialties: ['科幻军事', '摄影道具'],
    contact: {
      wechat: 'galaxy_model',
      phone: '138-0000-1001',
      email: 'galaxy@model.com',
    },
    stats: { models: 12, views: 3680, rating: 4.8 },
  },
  {
    id: 'merchant-2',
    name: '萌趣手办社',
    avatar: 'https://api.dicebear.com/8.x/shapes/svg?seed=cute',
    cover: 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800&q=80',
    description: '以可爱风格见长的手办模型工作室。主攻Q版角色、动物造型，作品深受二次元爱好者喜爱，提供从设计到打印的一站式服务。',
    specialties: ['Q版手办', '动物造型'],
    contact: {
      wechat: 'cute_figure',
      phone: '139-0000-2002',
      email: 'cute@figure.com',
    },
    stats: { models: 8, views: 5120, rating: 4.9 },
  },
  {
    id: 'merchant-3',
    name: '像素工坊',
    avatar: 'https://api.dicebear.com/8.x/shapes/svg?seed=pixel',
    cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80',
    description: '专注于道具与场景模型制作，为影视、游戏行业提供高质量资产。低多边形与写实风格双线并行，满足不同客户需求。',
    specialties: ['道具场景', '沙盘'],
    contact: {
      wechat: 'pixel_studio',
      phone: '137-0000-3003',
      email: 'pixel@studio.com',
    },
    stats: { models: 15, views: 2910, rating: 4.7 },
  },
  {
    id: 'merchant-4',
    name: '龙鳞雕塑室',
    avatar: 'https://api.dicebear.com/8.x/shapes/svg?seed=dragon',
    cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    description: '立足东方传统美学，专注于龙、凤、麒麟等神兽类模型创作。每件作品均为纯手工雕刻数模，细节丰富，极具收藏价值。',
    specialties: ['东方神兽', '雕塑'],
    contact: {
      wechat: 'dragon_scale',
      phone: '136-0000-4004',
      email: 'dragon@sculpture.com',
    },
    stats: { models: 6, views: 8100, rating: 5.0 },
  },
]
