import { USE_MOCK } from './services/config'
import { userService } from './services/user-service'

App<IAppOption>({
  globalData: {
    userInfo: null as any,
    systemInfo: null as WechatMiniprogram.SystemInfo | null,
  },
  onLaunch() {
    const info = wx.getSystemInfoSync()
    this.globalData.systemInfo = info
    // CSS 变量设置：小程序环境 document 为适配器 shim，没有 documentElement
    try {
      if (document && document.documentElement) {
        const statusBarHeight = info.statusBarHeight || 44
        document.documentElement.style.setProperty('--status-bar-height', statusBarHeight + 'px')
      }
    } catch (_e) {
      // 小程序环境不支持 DOM CSS 变量，忽略
    }

    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 微信一键登录
    if (!USE_MOCK) {
      userService.loginWithWechat().then(res => {
        if (res.success) {
          console.log('[app] auto login success')
          this.globalData.userInfo = userService.getCurrentUser() as any
        } else {
          console.warn('[app] auto login failed:', res.msg)
        }
      })
    }
  },
})
