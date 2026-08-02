import { publicService } from '../../services/public-service'
import { merchantService } from '../../services/merchant-service'
import { userService } from '../../services/user-service'
import { Plan } from '../../types/model'

Page({
  data: {
    name: '',
    description: '',
    wechat: '',
    phone: '',
    email: '',
    plans: [] as Plan[],
    planIndex: 0,
    planNames: [] as string[],
    submitting: false,
  },

  async onLoad() {
    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 })
      setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 1500)
      return
    }
    const plans = await publicService.getPlans()
    this.setData({
      plans,
      planNames: plans.map(p => `${p.name} ¥${p.price}/${p.unit}`),
    })
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onPlanChange(e: any) {
    this.setData({ planIndex: parseInt(e.detail.value, 10) || 0 })
  },

  async onSubmit() {
    const { name } = this.data
    if (!name.trim()) { wx.showToast({ title: '请输入店铺名称', icon: 'none' }); return }
    const plan = this.data.plans[this.data.planIndex]
    if (!plan) { wx.showToast({ title: '套餐数据未加载，请返回重试', icon: 'none' }); return }

    this.setData({ submitting: true })
    const res = await merchantService.applyShop({
      name: name.trim(),
      description: this.data.description.trim(),
      contact: {
        wechat: this.data.wechat.trim(),
        phone: this.data.phone.trim(),
        email: this.data.email.trim(),
      },
      plan_id: plan.id,
    })
    this.setData({ submitting: false })

    if (res.success) {
      wx.showModal({
        title: '申请已提交',
        content: res.msg + '，审核通过后即可发布模型',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1 }),
      })
    } else {
      wx.showToast({ title: res.msg, icon: 'none' })
    }
  },
})
