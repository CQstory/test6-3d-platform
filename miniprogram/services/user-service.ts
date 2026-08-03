import { api } from './api'
import { USE_MOCK, TOKEN_KEY, USER_INFO_KEY, LOGIN_PHONE_KEY } from './config'

/* ========== 类型 ========== */

interface AuthResult { success: boolean; msg: string }

interface ApiUser {
  id: string; nickname: string; avatar_url: string
  role: 'user' | 'merchant' | 'admin'
}
interface LoginResponse { token: string; user: ApiUser }

export interface UserInfo {
  phone: string; nickname: string; avatar: string
  role: string; loginType: string
}

/* ========== 内部存储 ========== */

function setSession(token: string) { wx.setStorageSync(TOKEN_KEY, token) }
function getToken(): string { return wx.getStorageSync(TOKEN_KEY) || '' }
function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_INFO_KEY)
}

function saveUserInfo(user: ApiUser, phone: string) {
  const info: UserInfo = {
    phone,
    nickname: user.nickname || phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
    avatar: user.avatar_url || '',
    role: user.role,
    loginType: 'phone',
  }
  wx.setStorageSync(USER_INFO_KEY, JSON.stringify(info))
}

function getUserInfo(): UserInfo | null {
  try { const raw = wx.getStorageSync(USER_INFO_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/* ========== Mock 数据 ========== */

interface StoredUser { phone: string; password: string }
const USERS_KEY = 'mini_users'
const getUsers = (): StoredUser[] => {
  try { const d = wx.getStorageSync(USERS_KEY); return d ? JSON.parse(d) : [] } catch { return [] }
}
const saveUsers = (u: StoredUser[]) => wx.setStorageSync(USERS_KEY, JSON.stringify(u))
const findUser = (phone: string) => getUsers().find(x => x.phone === phone)

const PHONE_RE = /^1[3-9]\d{9}$/

/* ========== 统一导出 ========== */

export const userService = {
  /* ---- 手机号/用户名密码登录（兼容两种） ---- */
  async login(phone: string, password: string): Promise<AuthResult> {
    // 兼容用户名登录：不强制手机号格式（后端校验）；注册仍严格要求手机号
    if (!phone.trim()) return { success: false, msg: '请输入手机号或用户名' }
    if (password.length < 6) return { success: false, msg: '密码至少6位' }

    if (USE_MOCK) {
      await simulateNetwork()
      const user = findUser(phone)
      if (!user) return { success: false, msg: '手机号未注册' }
      if (user.password !== password) return { success: false, msg: '密码错误' }
      // Mock: 直接存储手机号
      wx.setStorageSync(LOGIN_PHONE_KEY, phone)
      wx.setStorageSync(USER_INFO_KEY, JSON.stringify({
        phone, nickname: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        avatar: '', role: 'user', loginType: 'phone',
      }))
      return { success: true, msg: '登录成功' }
    }

    try {
      const res = await api.post<LoginResponse>('/auth/login', { username: phone, password })
      setSession(res.token)
      saveUserInfo(res.user, phone)
      wx.setStorageSync(LOGIN_PHONE_KEY, phone)
      return { success: true, msg: '登录成功' }
    } catch (e: any) {
      const msg = e && e.data ? (e.data.detail || '登录失败') : '登录失败'
      return { success: false, msg }
    }
  },

  /* ---- 手机号注册 ---- */
  async register(phone: string, password: string): Promise<AuthResult> {
    if (!PHONE_RE.test(phone)) return { success: false, msg: '请输入正确的手机号' }
    if (password.length < 6) return { success: false, msg: '密码至少6位' }

    if (USE_MOCK) {
      await simulateNetwork()
      if (findUser(phone)) return { success: false, msg: '该手机号已注册' }
      getUsers().push({ phone, password })
      saveUsers(getUsers())
      wx.setStorageSync(LOGIN_PHONE_KEY, phone)
      wx.setStorageSync(USER_INFO_KEY, JSON.stringify({
        phone, nickname: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        avatar: '', role: 'user', loginType: 'phone',
      }))
      return { success: true, msg: '注册成功' }
    }

    try {
      const res = await api.post<LoginResponse>('/auth/register', { username: phone, password })
      setSession(res.token)
      saveUserInfo(res.user, phone)
      wx.setStorageSync(LOGIN_PHONE_KEY, phone)
      return { success: true, msg: '注册成功' }
    } catch (e: any) {
      const msg = e && e.data ? (e.data.detail || '注册失败') : '注册失败'
      return { success: false, msg }
    }
  },

  /* ---- 微信一键登录 ---- */
  async loginWithWechat(): Promise<AuthResult> {
    if (USE_MOCK) return { success: false, msg: 'Mock 模式不支持微信登录' }
    try {
      const code = await new Promise<string>((resolve, reject) => {
        wx.login({
          success: res => { if (res.code) resolve(res.code); else reject(new Error('no code')) },
          fail: err => reject(new Error(err.errMsg || 'wx.login 失败')),
        })
      })
      const res = await api.post<LoginResponse>('/auth/login', { code })
      setSession(res.token)
      saveUserInfo(res.user, res.user.id) // phone unknown from WeChat
      return { success: true, msg: '登录成功' }
    } catch (e: any) {
      return { success: false, msg: e.message || (e && e.data && e.data.detail) || '登录失败' }
    }
  },

  /* ---- Session Key */ 
  getSessionKey(): string { return getToken() },

  /* ---- 登录状态 ---- */
  isLoggedIn(): boolean {
    if (USE_MOCK) return !!(getUserInfo() && getUserInfo()!.phone)
    return !!getToken() && !!getUserInfo()
  },

  /* ---- 当前用户 ---- */
  getCurrentUser(): UserInfo | null { return getUserInfo() },
  getPhone(): string { return wx.getStorageSync(LOGIN_PHONE_KEY) || '' },

  /* ---- 登出 ---- */
  logout() { clearSession() },

  /* ---- 重置密码（Mock） ---- */
  async resetPassword(phone: string): Promise<AuthResult> {
    if (!USE_MOCK) return { success: false, msg: '生产环境不支持此功能' }
    await simulateNetwork()
    if (!findUser(phone)) return { success: false, msg: '该手机号未注册' }
    return { success: true, msg: '重置链接已发送（演示环境未实际发送）' }
  },
}

function simulateNetwork(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 300))
}
