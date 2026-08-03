import { userService } from '../../services/user-service'

Component({
  properties: {
    active: { type: String, value: 'home' },
    role: { type: String, value: '' },
  },
  data: {
    tabs: [] as { key: string; label: string; icon: string }[],
  },
  lifetimes: {
    attached() {
      this._buildTabs()
    },
  },
  observers: {
    'role'() {
      this._buildTabs()
    },
  },
  methods: {
    _buildTabs() {
      const role = this.properties.role || (userService.getCurrentUser() || {} as any).role || 'user'
      const isMerchant = role === 'merchant'
      this.setData({
        tabs: [
          { key: 'home', label: '主页', icon: '🏠' },
          { key: 'browse', label: '模型库', icon: '📦' },
          {
            key: 'merchant',
            label: isMerchant ? '商家' : '消息',
            icon: isMerchant ? '🏪' : '💬',
          },
          { key: 'profile', label: '我的', icon: '👤' },
        ],
      })
    },
    onTabTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as string
      if (key === this.properties.active) return

      const routes: Record<string, string> = {
        home: '/pages/index/index',
        browse: '/pages/model-list/model-list',
        merchant: '/pages/merchant-center/merchant-center',
        profile: '/pages/profile/profile',
      }
      wx.switchTab({ url: routes[key] })
    },
  },
})
