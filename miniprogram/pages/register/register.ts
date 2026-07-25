import { userService } from '../../services/user-service'

Page({
  data: {
    phone: '',
    password: '',
    confirmPassword: '',
    errorMsg: '',
    isSubmitting: false,
  },
  onLoad() {
    const savedPhone = wx.getStorageSync('login_phone') || ''
    if (savedPhone) this.setData({ phone: savedPhone })
  },
  onPhoneInput(e: any) { this.setData({ phone: e.detail.value, errorMsg: '' }) },
  onPasswordInput(e: any) { this.setData({ password: e.detail.value, errorMsg: '' }) },
  onConfirmPwdInput(e: any) { this.setData({ confirmPassword: e.detail.value, errorMsg: '' }) },

  async onRegister() {
    const { phone, password, confirmPassword } = this.data
    if (!phone.trim()) { this.setData({ errorMsg: '请输入手机号' }); return }
    if (password.length < 6) { this.setData({ errorMsg: '密码至少6位' }); return }
    if (password !== confirmPassword) { this.setData({ errorMsg: '两次密码不一致' }); return }
    this.setData({ isSubmitting: true, errorMsg: '' })
    const result = await userService.register(phone.trim(), password)
    this.setData({ isSubmitting: false })
    if (result.success) {
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1000)
    } else {
      this.setData({ errorMsg: result.msg })
    }
  },

  onGoBack() { wx.navigateBack({ delta: 1 }) },
  onGoLogin() { wx.navigateTo({ url: '/pages/login/login' }) },
})
