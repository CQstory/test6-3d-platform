import { userService } from '../../services/user-service'

Page({
  data: {
    phone: '',
    password: '',
    errorMsg: '',
    isSubmitting: false,
    wechatLoading: false,
  },
  onLoad() {
    const savedPhone = wx.getStorageSync('login_phone') || ''
    if (savedPhone) this.setData({ phone: savedPhone })
  },
  onPhoneInput(e: any) { this.setData({ phone: e.detail.value, errorMsg: '' }) },
  onPasswordInput(e: any) { this.setData({ password: e.detail.value, errorMsg: '' }) },

  async onLogin() {
    const { phone, password } = this.data
    if (!phone.trim()) { this.setData({ errorMsg: '请输入手机号' }); return }
    if (!password) { this.setData({ errorMsg: '请输入密码' }); return }
    this.setData({ isSubmitting: true, errorMsg: '' })
    const result = await userService.login(phone.trim(), password)
    this.setData({ isSubmitting: false })
    if (result.success) {
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000)
    } else {
      this.setData({ errorMsg: result.msg })
    }
  },

  async onWechatLogin() {
    this.setData({ wechatLoading: true, errorMsg: '' })
    const result = await userService.loginWithWechat()
    this.setData({ wechatLoading: false })
    if (result.success) {
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000)
    } else {
      this.setData({ errorMsg: result.msg })
    }
  },

  onGoBack() { wx.navigateBack({ delta: 1 }) },
  onGoRegister() { wx.navigateTo({ url: '/pages/register/register' }) },
  onGoReset() { wx.navigateTo({ url: '/pages/reset-pwd/reset-pwd' }) },
})
