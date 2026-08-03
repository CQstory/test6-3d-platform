import { merchantService } from '../../services/merchant-service'

Page({
  data: {
    name: '',
    description: '',
    avatar: '',
    cover: '',
    wechat: '',
    phone: '',
    email: '',
    // 新选择的本地图片（保存时上传）
    avatarPath: '' as string,
    coverPath: '' as string,
    loading: false,
    uploading: false,
  },

  async onLoad() {
    this.setData({ loading: true })
    const shop = await merchantService.getMyShop()
    if (shop) {
      this.setData({
        name: shop.name || '',
        description: shop.description || '',
        avatar: shop.avatar || '',
        cover: shop.cover || '',
        wechat: (shop.contact && shop.contact.wechat) || '',
        phone: (shop.contact && shop.contact.phone) || '',
        email: (shop.contact && shop.contact.email) || '',
      })
    }
    this.setData({ loading: false })
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onChooseCover() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res: any) => {
        this.setData({ coverPath: res.tempFilePaths[0] })
      },
    })
  },

  onChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res: any) => {
        this.setData({ avatarPath: res.tempFilePaths[0] })
      },
    })
  },

  async onSave() {
    const { name } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入店铺名称', icon: 'none' })
      return
    }

    this.setData({ uploading: true })

    try {
      let avatar = this.data.avatar
      let cover = this.data.cover
      if (this.data.avatarPath) {
        avatar = await merchantService.uploadImage(this.data.avatarPath)
      }
      if (this.data.coverPath) {
        cover = await merchantService.uploadImage(this.data.coverPath)
      }

      await merchantService.updateShop({
        name: name.trim(),
        description: this.data.description.trim(),
        avatar,
        cover,
        contact: {
          wechat: this.data.wechat.trim(),
          phone: this.data.phone.trim(),
          email: this.data.email.trim(),
        },
      })

      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
    } catch (e: any) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },
})
