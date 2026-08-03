import { userService, UserInfo } from '../../services/user-service'

Page({
  data: {
    isLoggedIn: false,
    userInfo: null as UserInfo | null,
    role: '',
    roleLabel: '',
  },
  onLoad() { this.refresh() },
  onShow() { this.refresh() },
  refresh() {
    const loggedIn = userService.isLoggedIn()
    const info = userService.getCurrentUser()
    const role = info ? info.role : 'user'
    this.setData({
      isLoggedIn: loggedIn,
      userInfo: info,
      role,
      roleLabel: role === 'merchant' ? '商家' : '普通用户',
    })
  },

  onGoLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
  onGoRegister() { wx.navigateTo({ url: '/pages/register/register' }) },
  onGoFavorites() { wx.navigateTo({ url: '/pages/favorites/favorites' }) },
  onGoPricing() { wx.navigateTo({ url: '/pages/pricing/pricing' }) },
  onGoShopSettings() { wx.navigateTo({ url: '/pages/shop-settings/shop-settings' }) },
  onGoMerchantApply() { wx.navigateTo({ url: '/pages/merchant-apply/merchant-apply' }) },

  onMenuTap(e: any) {
    const key = e.currentTarget.dataset.key
    if (key === 'logout') {
      wx.showModal({
        title: '退出登录',
        content: '确定要退出吗？',
        success: (res: any) => {
          if (res.confirm) {
            userService.logout()
            this.refresh()
            wx.showToast({ title: '已退出', icon: 'none' })
          }
        },
      })
    }
  },
})
