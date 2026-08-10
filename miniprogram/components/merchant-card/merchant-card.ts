import { FALLBACK_IMAGE } from '../../utils/util'

Component({
  properties: {
    merchant: { type: Object, value: {} },
    topModels: { type: Array, value: [] },
  },
  data: {
    avatarError: false,
    imgFallback: FALLBACK_IMAGE,
    thumbErrors: {} as Record<number, boolean>,
  },
  observers: {
    'merchant': function (this: any) {
      // 商家切换时重置图片错误态
      this.setData({ avatarError: false, thumbErrors: {} })
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { merchant: this.properties.merchant })
    },
    onThumbTap(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number
      const model = (this.properties.topModels as any[])[index]
      if (model) this.triggerEvent('modeltap', { model })
    },
    onAvatarError() {
      this.setData({ avatarError: true })
    },
    onThumbError(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number
      this.setData({ ['thumbErrors.' + index]: true } as any)
    },
  },
})
