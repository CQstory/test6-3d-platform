import { CATEGORY_MAP, ShopLink, PriceDimension, PriceFactors, PriceMatrix } from '../../types/model'
import { modelService, PRESET_PRICE_OPTIONS } from '../../services/model-service'

const CATEGORIES = Object.entries(CATEGORY_MAP).map(([key, label]) => ({ key, label }))

interface ShopLinkInput extends ShopLink {
  _key: string
}

/** 价格选项（编辑页勾选/系数输入） */
interface PriceOptInput {
  id: string
  label: string
  checked: boolean
  factor: string
}

/** 矩阵预览行 */
interface MatrixRow {
  key: string
  material: string
  size: string
  complexity: string
  price: string
}

/** 选项来源：先尝试后端接口，失败回退预置选项 */
async function loadOptions(dimension: PriceDimension): Promise<PriceOptInput[]> {
  let list = PRESET_PRICE_OPTIONS.filter(o => o.dimension === dimension)
  try {
    const remote = await modelService.getPriceOptions(dimension)
    if (remote && remote.length > 0) {
      list = remote
    }
  } catch (_e) {
    // 接口未就绪（G3），使用预置选项
  }
  return list.map((o, i) => ({
    id: o.id,
    label: o.label,
    checked: i === 0, // 默认勾选每维第一个，便于快速生成
    factor: '1',
  }))
}

Page({
  data: {
    isEdit: false,
    modelId: '',
    title: '发布商品',

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

    // 多维定价
    priceMode: 'single' as 'single' | 'matrix',
    basePrice: '' as string,
    materialOptions: [] as PriceOptInput[],
    sizeOptions: [] as PriceOptInput[],
    complexityOptions: [] as PriceOptInput[],
    matrixRows: [] as MatrixRow[],
    matrixLoaded: false,
    generating: false,
    // 自定义选项
    customDimension: 'material' as PriceDimension,
    customLabel: '' as string,
  },

  async onLoad(options: { id?: string }) {
    // 预加载三维选项
    const [materials, sizes, complexities] = await Promise.all([
      loadOptions('material'),
      loadOptions('size'),
      loadOptions('complexity'),
    ])
    this.setData({ materialOptions: materials, sizeOptions: sizes, complexityOptions: complexities })

    if (options.id) {
      const id = options.id
      this.setData({ isEdit: true, modelId: id, title: '编辑商品' })
      this._loadModel(id)
    }
  },

  async _loadModel(id: string) {
    const model = await modelService.getModelById(id)
    if (!model) return
    const catIdx = CATEGORIES.findIndex(c => c.key === model.category)
    const patch: any = {
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
    }

    // 多维矩阵回填
    if (model.priceMatrix) {
      const pm = model.priceMatrix
      const fill = (list: PriceOptInput[], opts: { id: string; label: string }[]): PriceOptInput[] => {
        if (opts.length > 0) {
          return opts.map(o => {
            const hit = list.find(x => x.id === o.id)
            return { id: o.id, label: hit ? hit.label : o.label, checked: true, factor: '1' }
          })
        }
        return list
      }
      const rows: MatrixRow[] = Object.entries(pm.prices).map(([key, v]) => {
        const [mid, sid, cid] = key.split(':')
        const m = pm.materials.find(x => x.id === mid)
        const s = pm.sizes.find(x => x.id === sid)
        const c = pm.complexities.find(x => x.id === cid)
        return {
          key,
          material: m ? m.label : mid,
          size: s ? s.label : sid,
          complexity: c ? c.label : cid,
          price: String(v),
        }
      })
      // 起售价作为基础价参考（矩阵无法反推原系数）
      const minPrice = rows.reduce((min, r) => Math.min(min, parseFloat(r.price) || 0), Infinity)
      patch.priceMode = 'matrix'
      patch.basePrice = Number.isFinite(minPrice) ? String(minPrice) : ''
      patch.materialOptions = fill(this.data.materialOptions, pm.materials)
      patch.sizeOptions = fill(this.data.sizeOptions, pm.sizes)
      patch.complexityOptions = fill(this.data.complexityOptions, pm.complexities)
      patch.matrixRows = rows
      patch.matrixLoaded = true
    }

    this.setData(patch)
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

  /* ========== 多维定价 ========== */

  onPriceModeChange(e: any) {
    this.setData({ priceMode: e.currentTarget.dataset.mode as 'single' | 'matrix' })
  },

  onToggleOption(e: any) {
    const dim = e.currentTarget.dataset.dim as PriceDimension
    const id = e.currentTarget.dataset.id as string
    const field = dim === 'material' ? 'materialOptions' : dim === 'size' ? 'sizeOptions' : 'complexityOptions'
    const list = (this.data as any)[field] as PriceOptInput[]
    this.setData({
      [field]: list.map(o => (o.id === id ? { ...o, checked: !o.checked } : o)),
    })
  },

  onFactorInput(e: any) {
    const dim = e.currentTarget.dataset.dim as PriceDimension
    const id = e.currentTarget.dataset.id as string
    const value = e.detail.value
    const field = dim === 'material' ? 'materialOptions' : dim === 'size' ? 'sizeOptions' : 'complexityOptions'
    const list = (this.data as any)[field] as PriceOptInput[]
    this.setData({
      [field]: list.map(o => (o.id === id ? { ...o, factor: value } : o)),
    })
  },

  onCustomDimensionChange(e: any) {
    this.setData({ customDimension: e.currentTarget.dataset.dim as PriceDimension })
  },

  onCustomLabelInput(e: any) {
    this.setData({ customLabel: e.detail.value })
  },

  async onAddCustomOption() {
    const { customDimension, customLabel } = this.data
    const label = customLabel.trim()
    if (!label) { wx.showToast({ title: '请输入选项名称', icon: 'none' }); return }
    this.setData({ uploading: true })
    try {
      const option = await modelService.createPriceOption({ dimension: customDimension, label })
      const field = customDimension === 'material' ? 'materialOptions' : customDimension === 'size' ? 'sizeOptions' : 'complexityOptions'
      const list = (this.data as any)[field] as PriceOptInput[]
      this.setData({
        [field]: [...list, { id: option.id, label: option.label, checked: true, factor: '1' }],
        customLabel: '',
      })
      wx.showToast({ title: '已添加', icon: 'success' })
    } catch (e: any) {
      wx.showToast({ title: e.message || '添加失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  _checkedOptions(dim: PriceDimension): PriceOptInput[] {
    const field = dim === 'material' ? 'materialOptions' : dim === 'size' ? 'sizeOptions' : 'complexityOptions'
    return ((this.data as any)[field] as PriceOptInput[]).filter(o => o.checked)
  },

  async onGenerateMatrix() {
    const basePrice = parseFloat(this.data.basePrice)
    if (!basePrice || basePrice <= 0) { wx.showToast({ title: '请输入有效的基础价', icon: 'none' }); return }
    const materials = this._checkedOptions('material')
    const sizes = this._checkedOptions('size')
    const complexities = this._checkedOptions('complexity')
    if (materials.length === 0 || sizes.length === 0 || complexities.length === 0) {
      wx.showToast({ title: '每个维度至少勾选一个选项', icon: 'none' }); return
    }

    const toFactor = (list: PriceOptInput[]) => {
      const map: Record<string, number> = {}
      list.forEach(o => {
        const v = parseFloat(o.factor)
        map[o.id] = Number.isFinite(v) && v > 0 ? v : 1
      })
      return map
    }

    this.setData({ generating: true })
    try {
      const matrix = await modelService.previewPriceMatrix({
        base_price: basePrice,
        factors: {
          material: toFactor(materials),
          size: toFactor(sizes),
          complexity: toFactor(complexities),
        },
        materials: materials.map(o => ({ id: o.id, label: o.label })),
        sizes: sizes.map(o => ({ id: o.id, label: o.label })),
        complexities: complexities.map(o => ({ id: o.id, label: o.label })),
      })
      const rows: MatrixRow[] = Object.entries(matrix.prices).map(([key, v]) => {
        const [mid, sid, cid] = key.split(':')
        const m = matrix.materials.find(x => x.id === mid)
        const s = matrix.sizes.find(x => x.id === sid)
        const c = matrix.complexities.find(x => x.id === cid)
        return {
          key,
          material: m ? m.label : mid,
          size: s ? s.label : sid,
          complexity: c ? c.label : cid,
          price: String(v),
        }
      })
      this.setData({ matrixRows: rows, matrixLoaded: true })
      wx.showToast({ title: `已生成 ${rows.length} 个价格`, icon: 'success' })
    } catch (e: any) {
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  onMatrixPriceInput(e: any) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({
      matrixRows: this.data.matrixRows.map(r => (r.key === key ? { ...r, price: value } : r)),
    })
  },

  _buildPriceMatrix(): PriceMatrix | null {
    const materials = this._checkedOptions('material').map(o => ({ id: o.id, label: o.label }))
    const sizes = this._checkedOptions('size').map(o => ({ id: o.id, label: o.label }))
    const complexities = this._checkedOptions('complexity').map(o => ({ id: o.id, label: o.label }))
    if (materials.length === 0 || sizes.length === 0 || complexities.length === 0) return null
    const prices: Record<string, number> = {}
    this.data.matrixRows.forEach(r => {
      const v = parseFloat(r.price)
      if (Number.isFinite(v) && v > 0) prices[r.key] = Math.round(v * 100) / 100
    })
    if (Object.keys(prices).length === 0) return null
    return { materials, sizes, complexities, prices }
  },

  async onSave() {
    const { name } = this.data
    if (!name.trim()) { wx.showToast({ title: '请输入名称', icon: 'none' }); return }

    if (!this.data.isEdit && !this.data.modelFilePath) {
      wx.showToast({ title: '请上传模型文件', icon: 'none' }); return
    }

    const isMatrix = this.data.priceMode === 'matrix'
    const priceMatrix = isMatrix ? this._buildPriceMatrix() : null
    if (isMatrix && !priceMatrix) {
      wx.showToast({ title: '请先生成并完善价格矩阵', icon: 'none' }); return
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

      // 矩阵模式下 price 提交为矩阵最小值（起售价），供后端/列表展示
      let price = parseFloat(this.data.price) || 0
      let material = this.data.material.trim()
      let dimensions = this.data.dimensions.trim()
      const matrixPayload: any = {}
      if (isMatrix && priceMatrix) {
        price = Math.min(...Object.values(priceMatrix.prices))
        material = priceMatrix.materials.map(o => o.label).join('/')
        dimensions = priceMatrix.sizes.map(o => o.label).join('/')
        matrixPayload.base_price = parseFloat(this.data.basePrice) || 0
        matrixPayload.factors = {
          material: Object.fromEntries(this._checkedOptions('material').map(o => [o.id, parseFloat(o.factor) || 1])),
          size: Object.fromEntries(this._checkedOptions('size').map(o => [o.id, parseFloat(o.factor) || 1])),
          complexity: Object.fromEntries(this._checkedOptions('complexity').map(o => [o.id, parseFloat(o.factor) || 1])),
        } as PriceFactors
        matrixPayload.price_matrix = priceMatrix
      }

      const data = {
        name: name.trim(),
        description: this.data.description.trim(),
        category: this.data.category as any,
        tags,
        faces: parseInt(this.data.faces, 10) || 0,
        format: this.data.format,
        price,
        material,
        dimensions,
        shopLinks,
        thumbnail,
        modelUrl,
        ...matrixPayload,
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
