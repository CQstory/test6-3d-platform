import { CATEGORY_MAP, ShopLink } from '../../types/model'
import { modelService } from '../../services/model-service'

const CATEGORIES = Object.entries(CATEGORY_MAP).map(([key, label]) => ({ key, label }))

interface ShopLinkInput extends ShopLink {
  _key: string
}

Page({
  data: {
    isEdit: false,
    modelId: '',
    title: '新增模型',

    name: '',
    description: '',
    category: 'creature' as string,
    categoryIndex: 0,
    categoriesList: CATEGORIES.map(c => c.label),
    tagInput: '',
    faces: '' as string,
    format: 'glb',
    price: '' as string,
    material: '',
    dimensions: '',
    shopLinks: [] as ShopLinkInput[],
    thumbnail: '',
    modelUrl: '',
    thumbnailPath: '' as string,
    modelFilePath: '' as string,
    modelFileName: '' as string,
    uploading: false,
  },

  onLoad(options: { id?: string }) {
    if (options.id) {
      const id = options.id
      this.setData({ isEdit: true, modelId: id, title: '编辑模型' })
      this._loadModel(id)
    }
  },

  async _loadModel(id: string) {
    const model = await modelService.getModelById(id)
    if (!model) return
    const catIdx = CATEGORIES.findIndex(c => c.key === model.category)
    this.setData({
      name: model.name,
      description: model.description,
      category: model.category,
      categoryIndex: catIdx >= 0 ? catIdx : 0,
      tagInput: model.tags.join('，'),
      faces: String(model.faces || ''),
      format: model.format || 'glb',
      price: model.price ? String(model.price) : '',
      material: model.material || '',
      dimensions: model.dimensions || '',
      shopLinks: (model.shopLinks || []).map((l, i) => ({ ...l, _key: 'link-' + i })),
      thumbnail: model.thumbnail || '',
      modelUrl: model.modelUrl || '',
      modelFileName: model.modelUrl ? '已上传的模型文件' : '',
    })
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onCategoryChange(e: any) {
    const idx = parseInt(e.detail.value, 10)
    this.setData({ categoryIndex: idx, category: CATEGORIES[idx].key })
  },

  onFormatChange(e: any) {
    this.setData({ format: e.currentTarget.dataset.format })
  },

  onAddLink() {
    if (this.data.shopLinks.length >= 5) {
      wx.showToast({ title: '最多添加5条链接', icon: 'none' })
      return
    }
    const links = [...this.data.shopLinks, { platform: '', shopName: '', url: '', _key: 'link-' + Date.now() }]
    this.setData({ shopLinks: links })
  },
  onRemoveLink(e: any) {
    const key = e.currentTarget.dataset.key
    this.setData({ shopLinks: this.data.shopLinks.filter(l => l._key !== key) })
  },
  onLinkInput(e: any) {
    const key = e.currentTarget.dataset.key
    const field = e.currentTarget.dataset.field as keyof ShopLinkInput
    const value = e.detail.value
    this.setData({
      shopLinks: this.data.shopLinks.map(l =>
        l._key === key ? { ...l, [field]: value } : l
      ),
    })
  },

  onChooseThumbnail() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res: any) => {
        this.setData({ thumbnailPath: res.tempFilePaths[0] })
      },
    })
  },

  onChooseModelFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res: any) => {
        const file = res.tempFiles[0]
        this.setData({
          modelFilePath: file.path,
          modelFileName: file.name || '已选择文件',
        })
      },
    })
  },

  async onSave() {
    const { name } = this.data
    if (!name.trim()) { wx.showToast({ title: '请输入名称', icon: 'none' }); return }

    if (!this.data.isEdit && !this.data.modelFilePath) {
      wx.showToast({ title: '请上传模型文件', icon: 'none' }); return
    }

    this.setData({ uploading: true })

    try {
      let thumbnail = this.data.thumbnail
      let modelUrl = this.data.modelUrl

      if (this.data.thumbnailPath) {
        thumbnail = await modelService.uploadThumbnail(this.data.thumbnailPath)
      }
      if (this.data.modelFilePath) {
        modelUrl = await modelService.uploadModelFile(this.data.modelFilePath)
      }

      const tags = this.data.tagInput
        .split(/[,，]/)
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const shopLinks: ShopLink[] = this.data.shopLinks.map(l => ({
        platform: l.platform,
        shopName: l.shopName,
        url: l.url,
      })).filter(l => l.platform && l.url)

      const data = {
        name: name.trim(),
        description: this.data.description.trim(),
        category: this.data.category as any,
        tags,
        faces: parseInt(this.data.faces, 10) || 0,
        format: this.data.format,
        price: parseFloat(this.data.price) || 0,
        material: this.data.material.trim(),
        dimensions: this.data.dimensions.trim(),
        shopLinks,
        thumbnail,
        modelUrl,
      }

      if (this.data.isEdit) {
        await modelService.updateModel(this.data.modelId, data)
      } else {
        await modelService.createModel(data)
      }

      wx.showToast({ title: this.data.isEdit ? '已保存' : '已发布', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
    } catch (e: any) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },
})
