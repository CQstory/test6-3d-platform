import { Model } from '../../types/model'
import { modelService } from '../../services/model-service'
import { userService } from '../../services/user-service'

/** 全局恢复标记 —— 跨页面实例通信，比 per-instance flag 更可靠 */
const app = getApp<IAppOption>()
const RECOVERY_KEY = '__model_detail_needs_recovery'

Page({
  data: {
    model: {} as Model,
    facesText: '',
  },
  /** 记录当前模型 ID，用于从 Viewer 返回后重建页面 */
  _modelId: '' as string,
  /** 标记是否刚从 Viewer 返回——此时 WXML 绑定可能已被 Skyline GL 污染 */
  _fromViewer: false as boolean,

  async onLoad(options: { id?: string }) {
    console.log('[model-detail] onLoad, options=', options)
    this._modelId = options.id || ''
    this._fromViewer = false

    // 清除全局恢复标记（新实例已创建，无需再次恢复）
    if (app && (app.globalData as any)[RECOVERY_KEY]) {
      (app.globalData as any)[RECOVERY_KEY] = false
    }

    if (!userService.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 1500)
      return
    }

    const id = this._modelId
    if (!id) return

    try {
      const model = await modelService.getModelById(id)
      if (model) {
        this.setData({
          model,
          facesText: model.faces ? (model.faces / 1000).toFixed(1) + 'K面' : '',
        })
        console.log('[model-detail] model loaded:', model.name)
        modelService.recordView(id).catch(() => {})
      } else {
        console.warn('[model-detail] model not found for id:', id)
      }
    } catch (err: any) {
      console.error('[model-detail] Failed to load model:', err)
      // API 请求失败时不阻塞页面，保留空状态让用户可操作
    }
  },

  onShow() {
    console.log('[model-detail] onShow, modelId=', this._modelId, '_fromViewer=', this._fromViewer)

    // 双重检查：per-instance flag 或全局恢复标记任一为真都需要恢复
    const globalNeedsRecovery = app && (app.globalData as any)[RECOVERY_KEY]

    if (this._fromViewer || globalNeedsRecovery) {
      this._fromViewer = false
      if (app && (app.globalData as any)[RECOVERY_KEY]) {
        (app.globalData as any)[RECOVERY_KEY] = false
      }

      const id = this._modelId
      if (id) {
        console.log('[model-detail] Recovering from GL freeze — creating fresh page instance via redirectTo')
        // redirectTo 会替换当前页面 → 页面栈变为 [..., model-detail(new)]
        // 但如果 Skyline 渲染线程已冻结，redirectTo 可能失败 → fallback 到 reLaunch
        wx.redirectTo({
          url: '/pages/model-detail/model-detail?id=' + id,
          fail: (err: any) => {
            console.error('[model-detail] redirectTo failed (render thread likely frozen):', err)
            // reLaunch 彻底清空页面栈，从零重建
            wx.reLaunch({
              url: '/pages/index/index',
            })
          },
        })
        return
      }
    }

    // 正常场景：简单的数据刷新
    const m = this.data.model as Model
    if (m && m.id) {
      this.setData({
        facesText: m.faces ? (m.faces / 1000).toFixed(1) + 'K面' : '',
      })
    }
  },

  onUnload() {
    console.log('[model-detail] onUnload — page destroyed')
  },

  onPageTap(e: any) {
    console.log('[model-detail] page tap detected, target:', e.target.id || e.target.dataset || 'no-id')
  },

  onOpenLink(e: any) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' }),
      })
    }
  },

  onView3D() {
    console.log('[model-detail] onView3D tapped')
    this._fromViewer = true
    // 设置全局恢复标记，作为 per-instance flag 的备份
    // 如果页面实例被异常销毁（如微信回收），onShow 仍能通过全局标记检测到需要恢复
    if (app) {
      (app.globalData as any)[RECOVERY_KEY] = true;
      (app.globalData as any)[RECOVERY_KEY + '_modelId'] = this._modelId
    }
    const m = this.data.model
    // 防御性编程：如果 model 数据为空，viewer 会回退到本地 modelDB
    const id = m.id || this._modelId || 'damaged-helmet'
    const name = m.name || ''
    const modelUrl = m.modelUrl || ''
    wx.navigateTo({
      url:
        '/subpackages/modelViewer/pages/viewer/viewer?id=' +
        id +
        '&name=' +
        encodeURIComponent(name) +
        '&modelUrl=' +
        encodeURIComponent(modelUrl),
    })
  },
})
