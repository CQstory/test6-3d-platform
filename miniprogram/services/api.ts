import { API_BASE_URL, TOKEN_KEY } from './config'

/**
 * 通用请求方法，自动附加 Authorization header
 */
function request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync(TOKEN_KEY) || ''
    wx.request({
      url: API_BASE_URL + path,
      method,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
        } else {
          reject({ status: res.statusCode, data: res.data })
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

export const api = {
  get<T = any>(path: string) { return request<T>('GET', path) },
  post<T = any>(path: string, data?: any) { return request<T>('POST', path, data) },
  put<T = any>(path: string, data?: any) { return request<T>('PUT', path, data) },
  del<T = any>(path: string) { return request<T>('DELETE', path) },
}

/**
 * 上传文件
 */
export function uploadFile(filePath: string, apiPath: string): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync(TOKEN_KEY) || ''
    wx.uploadFile({
      url: API_BASE_URL + apiPath,
      filePath,
      name: 'file',
      header: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(res.data))
        } else {
          reject({ status: res.statusCode, data: res.data })
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}
