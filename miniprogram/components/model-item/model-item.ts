import { Model, CATEGORY_MAP } from '../../types/model'
import { FALLBACK_IMAGE } from '../../utils/util'

const STATUS_MAP: Record<string, string> = {
  published: '已发布',
  flagged: '违规',
  removed: '已撤回',
}

Component({
  properties: {
    model: { type: Object, value: {} as Model },
    showStatus: { type: Boolean, value: true },
    showPrice: { type: Boolean, value: true },
  },
  data: {
    categoryText: '',
    statusText: '',
    statusClass: '',
    imgFallback: FALLBACK_IMAGE,
    imgError: false,
  },
  observers: {
    'model.category'(cat: string) {
      this.setData({ categoryText: CATEGORY_MAP[cat as keyof typeof CATEGORY_MAP] || cat })
    },
    'model.status'(s: string) {
      const status = s || 'published'
      this.setData({
        statusText: STATUS_MAP[status] || status,
        statusClass: 'status-' + status,
      })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { model: this.properties.model })
    },
    onImgError() {
      this.setData({ imgError: true })
    },
  },
})
