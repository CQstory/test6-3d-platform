Component({
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
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
