Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
  },
  data: {
    // 状态栏高度（px），组件内读取真实值，不依赖外部 CSS 变量
    statusBarHeight: 44,
  },
  lifetimes: {
    attached() {
      try {
        // 基础库 3.x 推荐 wx.getWindowInfo（wx.getSystemInfoSync 已弃用；typings 旧版无类型，用 any 断言）
        const info = (wx as any).getWindowInfo()
        this.setData({ statusBarHeight: info.statusBarHeight || 44 })
      } catch (_e) {
        this.setData({ statusBarHeight: 44 })
      }
    },
  },
  methods: {
    onBack() {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({
            url: '/pages/index/index',
            fail: () => {
              wx.redirectTo({ url: '/pages/index/index' })
            },
          })
        },
      })
    },
  },
})
