/**
 * 微信小程序浏览器 API 适配器（精简版）
 *
 * 在微信小程序 JS 环境中模拟 three.js 依赖的浏览器 API。
 * 必须最先被 require/import。
 */

/* global wx */

// ---- 1. 全局对象补丁 ----
var g = (typeof globalThis !== 'undefined') ? globalThis : (typeof global !== 'undefined' ? global : this)

// 安全地设置 window
if (typeof g.window === 'undefined') {
  g.window = g
}

// 安全地设置 self
if (typeof g.self === 'undefined') {
  g.self = g
}

// 安全地设置 document（最小实现）
var _listeners = {}
var _doc = {
  // 防止 IDE 将 document 转为 URL 时出现 [object Object] 错误
  toString: function() { return '[object HTMLDocument]' },
  documentElement: null,
  body: null,
  head: null,
  // DOM 属性
  visibilityState: 'visible',
  hidden: false,
  readyState: 'complete',
  // URL 相关（防止 IDE 内部路径解析崩溃）
  location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '', search: '', hash: '', replace: function(){} },
  URL: '',
  baseURI: '',
  // 事件方法
  addEventListener: function(t, fn) {
    if (!_listeners[t]) _listeners[t] = []
    _listeners[t].push(fn)
  },
  removeEventListener: function(t, fn) {
    if (!_listeners[t]) return
    _listeners[t] = _listeners[t].filter(function(f) { return f !== fn })
  },
  dispatchEvent: function(e) {
    var fns = _listeners[e.type]
    if (fns) fns.forEach(function(fn) { try { fn(e) } catch(ex) {} })
  },
  createElement: function(tag) {
    tag = (tag || '').toLowerCase()
    if (tag === 'canvas') return createFakeCanvas()
    if (tag === 'img' || tag === 'image') return createFakeImage()
    return {}
  },
  createElementNS: function(_ns, tag) { return _doc.createElement(tag) },
}

// 如果 document 尚未存在则设置
if (typeof g.document === 'undefined') {
  g.document = _doc
}

// ---- 2. 模拟 navigator ----
if (!g.navigator) {
  g.navigator = {
    userAgent: 'WeChatMiniProgram',
    platform: 'WeChat',
    appVersion: '5.0',
    language: 'zh-CN',
    onLine: true,
  }
}

// ---- 3. 模拟 Canvas ----
function createFakeCanvas() {
  var canvas = { width: 300, height: 150, style: {} }
  canvas.getContext = function(type) {
    if (type === 'webgl' || type === 'webgl2') {
      try {
        if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
          var off = wx.createOffscreenCanvas({ type: 'webgl', width: canvas.width, height: canvas.height })
          var ctx = off.getContext(type)
          if (ctx) {
            ctx.canvas = canvas
            return ctx
          }
        }
      } catch (_) {}
    }
    return null
  }
  canvas.addEventListener = _doc.addEventListener
  canvas.removeEventListener = _doc.removeEventListener
  return canvas
}

// ---- 4. 模拟 Image ----
function createFakeImage() {
  var img = { width: 0, height: 0, src: '', onload: null, onerror: null, complete: false }
  Object.defineProperty(img, 'src', {
    get: function() { return img._src },
    set: function(val) {
      img._src = val
      img.complete = false
      // 尝试使用 canvas.createImage() 加载（小程序真实 canvas 创建的对象）
      // 注意：wx.createImage() 是小游戏专属 API，小程序中不可用
      if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
        try {
          var wxImg = wx.createImage()
          wxImg.onload = function() {
            img.width = wxImg.width
            img.height = wxImg.height
            img.complete = true
            if (img.onload) img.onload()
          }
          wxImg.onerror = function(err) {
            if (img.onerror) img.onerror(err)
          }
          wxImg.src = val
          return
        } catch (e) {
          console.warn('[weapp-adapter] wx.createImage failed, using fallback:', e)
        }
      }
      // 回退：无法真正加载纹理，触发 onload 让调用方用纯色渲染
      console.warn('[weapp-adapter] No canvas.createImage available — textures will use solid colors')
      img.complete = true
      // 异步触发 onload（避免在 setter 中同步 resolve Promise）
      setTimeout(function() {
        if (img.onload) img.onload()
      }, 0)
    }
  })
  return img
}

// ---- 5. 模拟 XMLHttpRequest ----
function FakeXMLHttpRequest() {
  var xhr = this
  xhr.readyState = 0
  xhr.status = 0
  xhr.statusText = ''
  xhr.response = null
  xhr.responseType = ''
  xhr.responseText = ''
  xhr.onload = null
  xhr.onerror = null
  xhr.onprogress = null
  xhr.onloadstart = null
  xhr.onloadend = null
  xhr._method = 'GET'
  xhr._url = ''
  xhr._headers = {}
}

FakeXMLHttpRequest.prototype.open = function(method, url) {
  this._method = method.toUpperCase()
  this._url = url
  this.readyState = 1
}

FakeXMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  this._headers[name] = value
}

FakeXMLHttpRequest.prototype.overrideMimeType = function() {}

FakeXMLHttpRequest.prototype.abort = function() {
  if (this._task) this._task.abort()
}

FakeXMLHttpRequest.prototype.send = function(body) {
  var xhr = this
  xhr.readyState = 2
  if (xhr.onloadstart) xhr.onloadstart()

  if (typeof wx === 'undefined' || !wx.request) {
    xhr.status = 0
    if (xhr.onerror) xhr.onerror(new Error('wx.request not available'))
    return
  }

  xhr._task = wx.request({
    url: xhr._url,
    method: xhr._method,
    data: body,
    header: xhr._headers,
    responseType: xhr.responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
    success: function(res) {
      xhr.readyState = 4
      xhr.status = res.statusCode || 200
      xhr.statusText = res.statusCode === 200 ? 'OK' : 'Error'
      xhr.response = res.data
      if (xhr.responseType === 'text' || xhr.responseType === '') {
        xhr.responseText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      }
      if (xhr.onload) xhr.onload()
      if (xhr.onloadend) xhr.onloadend()
    },
    fail: function(err) {
      xhr.readyState = 4
      xhr.status = 0
      if (xhr.onerror) xhr.onerror(err)
      if (xhr.onloadend) xhr.onloadend()
    }
  })
}

// ---- 6. 辅助函数 ----
function atobPolyfill(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  var out = ''
  str = String(str).replace(/[^A-Za-z0-9+/=]/g, '')
  for (var i = 0; i < str.length; i += 4) {
    var e1 = chars.indexOf(str.charAt(i)), e2 = chars.indexOf(str.charAt(i+1))
    var e3 = chars.indexOf(str.charAt(i+2)), e4 = chars.indexOf(str.charAt(i+3))
    out += String.fromCharCode((e1<<2)|(e2>>4))
    if (e3 !== 64) out += String.fromCharCode(((e2&15)<<4)|(e3>>2))
    if (e4 !== 64) out += String.fromCharCode(((e3&3)<<6)|e4)
  }
  return out
}

function btoaPolyfill(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  var out = ''
  str = String(str)
  for (var i = 0; i < str.length; i += 3) {
    var c1 = str.charCodeAt(i), c2 = str.charCodeAt(i+1), c3 = str.charCodeAt(i+2)
    out += chars.charAt(c1>>2) + chars.charAt(((c1&3)<<4)|(c2>>4))
    out += isNaN(c2) ? '==' : chars.charAt(((c2&15)<<2)|(c3>>6))
    out += isNaN(c3) ? '=' : chars.charAt(c3&63)
  }
  return out
}

function TextDecPolyfill() {}
TextDecPolyfill.prototype.decode = function(buf) {
  if (typeof buf === 'string') return buf
  if (buf instanceof ArrayBuffer) {
    var arr = new Uint8Array(buf), str = ''
    for (var i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i])
    return decodeURIComponent(escape(str))
  }
  return String(buf)
}

function TextEncPolyfill() {}
TextEncPolyfill.prototype.encode = function(str) {
  var len = str.length, buf = new ArrayBuffer(len * 3), view = new Uint8Array(buf), off = 0
  for (var i = 0; i < len; i++) {
    var code = str.charCodeAt(i)
    if (code < 0x80) { view[off++] = code }
    else if (code < 0x800) { view[off++] = 0xc0 | (code>>6); view[off++] = 0x80 | (code&0x3f) }
    else { view[off++] = 0xe0 | (code>>12); view[off++] = 0x80 | ((code>>6)&0x3f); view[off++] = 0x80 | (code&0x3f) }
  }
  return buf.slice(0, off)
}

// ---- 7. 设置所有全局 API ----
var win = g.window

// Canvas / Image / XHR
// 注意：不设置 HTMLImageElement，保持 typeof HTMLImageElement === 'undefined'
// 这样 three.js r152 的 instanceof HTMLImageElement 检查会被短路跳过，
// 原生微信 Image（来自 canvas.createImage()）才能正常通过纹理管道
win.HTMLCanvasElement = null
win.Image = createFakeImage
win.XMLHttpRequest = FakeXMLHttpRequest
// 不覆盖 IDE 已有的 document，仅在其不存在时设置（避免破坏 IDE 内部路径解析）
if (typeof win.document === 'undefined') {
  win.document = _doc
}

// URL
if (!win.URL) {
  var _blobs = {}, _bid = 0
  win.URL = {
    createObjectURL: function(b) { var id = 'blob:' + (++_bid); _blobs[id] = b; return id },
    revokeObjectURL: function(id) { delete _blobs[id] }
  }
}

// Text codec
if (typeof TextDecoder === 'undefined') g.TextDecoder = TextDecPolyfill
if (typeof TextEncoder === 'undefined') g.TextEncoder = TextEncPolyfill

// atob / btoa
if (typeof atob === 'undefined') g.atob = atobPolyfill
if (typeof btoa === 'undefined') g.btoa = btoaPolyfill

// requestAnimationFrame
if (typeof g.requestAnimationFrame === 'undefined') {
  var _rafId = 0, _rafCbs = {}
  g.requestAnimationFrame = function(cb) {
    var id = ++_rafId; _rafCbs[id] = cb
    setTimeout(function() { if (_rafCbs[id]) { delete _rafCbs[id]; try { cb(Date.now()) } catch(e) {} } }, 16)
    return id
  }
  g.cancelAnimationFrame = function(id) { delete _rafCbs[id] }
}

// performance.now
if (!g.performance || !g.performance.now) {
  if (!g.performance) g.performance = {}
  g.performance.now = function() { return Date.now() }
}

// Blob
if (typeof Blob === 'undefined') {
  g.Blob = function(parts, _opts) { this._data = parts }
}

// ---- 8. 补齐 window 属性 ----
win.innerWidth = 375
win.innerHeight = 667
win.devicePixelRatio = 2
win.screen = { width: 375, height: 667, availWidth: 375, availHeight: 667 }
win.location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '', search: '', hash: '', replace: function(){} }
win.requestAnimationFrame = g.requestAnimationFrame
win.cancelAnimationFrame = g.cancelAnimationFrame
win.performance = g.performance
win.setTimeout = setTimeout
win.clearTimeout = clearTimeout
win.setInterval = setInterval
win.clearInterval = clearInterval
win.navigator = g.navigator
win.addEventHandler = _doc.addEventListener
win.removeEventHandler = _doc.removeEventListener

// 确保所有属性也在 window 上
win.Blob = g.Blob
win.TextDecoder = g.TextDecoder
win.TextEncoder = g.TextEncoder
win.atob = g.atob
win.btoa = g.btoa

// ---- 9. 导出辅助方法 ----
module.exports = {
  updateScreenSize: function(w, h, dpr) {
    win.innerWidth = w
    win.innerHeight = h
    win.screen.width = w
    win.screen.height = h
    win.devicePixelRatio = dpr || 2
  },
  createImage: function(canvas) {
    // 创建可用于 WebGL 纹理的 Image 对象
    // 优先使用 canvas.createImage()（小程序 Canvas/OffscreenCanvas 原生方法，基础库 >= 2.7.3）
    if (canvas && typeof canvas.createImage === 'function') {
      try {
        var img = canvas.createImage()
        if (img) return img
      } catch (e) {
        console.warn('[weapp-adapter] canvas.createImage() threw:', e)
      }
    }
    // 注意：wx.createImage() 是小游戏（Mini Game）专属 API，普通小程序中不存在
    // 此处保留仅作防御性回退，正常情况下不会命中
    try {
      if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
        return wx.createImage()
      }
    } catch (e) {}

    // 回退：使用适配器自身的 createFakeImage（模拟器环境，纹理显示为纯色）
    return createFakeImage()
  },
  _downloadViaRequest: function(url, resolve, reject) {
    if (typeof wx === 'undefined' || !wx.request) {
      return reject(new Error('wx.request not available'))
    }
    console.log('[weapp-adapter] Downloading via wx.request:', url)
    var timedOut = false
    var requestTask = wx.request({
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000,
      success: function(res) {
        if (timedOut) return
        console.log('[weapp-adapter] wx.request success, status:', res.statusCode, 'data type:', typeof res.data)
        if (res.statusCode === 200) {
          var data = res.data
          // IDE 模拟器中可能返回 Node.js Buffer 而非 ArrayBuffer
          if (data && typeof data === 'object' && data.buffer instanceof ArrayBuffer) {
            console.log('[weapp-adapter] Converting Buffer to ArrayBuffer, length:', data.byteLength)
            data = data.buffer
          }
          if (typeof data === 'string') {
            var buf = new ArrayBuffer(data.length)
            var view = new Uint8Array(buf)
            for (var i = 0; i < data.length; i++) view[i] = data.charCodeAt(i) & 0xff
            data = buf
          }
          if (data instanceof ArrayBuffer && data.byteLength > 0) {
            console.log('[weapp-adapter] Downloaded', data.byteLength, 'bytes')
            resolve(data)
          } else {
            console.error('[weapp-adapter] Invalid data after download:', typeof data, data && data.byteLength)
            reject(new Error('Downloaded empty or invalid data (type=' + typeof data + ', len=' + (data ? data.byteLength : 'N/A') + ')'))
          }
        } else {
          reject(new Error('Download via request failed: HTTP ' + res.statusCode))
        }
      },
      fail: function(err) {
        if (timedOut) return
        console.error('[weapp-adapter] wx.request failed:', err)
        reject(new Error('Download request failed: ' + (err.errMsg || 'unknown')))
      }
    })
    setTimeout(function() {
      if (!timedOut) {
        timedOut = true
        try { requestTask.abort() } catch (e) {}
        reject(new Error('Download timeout'))
      }
    }, 35000)
  },
  downloadBinary: function(url) {
    var self = this
    console.log('[weapp-adapter] downloadBinary:', url)
    return new Promise(function(resolve, reject) {
      // 优先尝试 wx.downloadFile（IDE 中更稳定，且 SDK report 能正常追踪）
      if (typeof wx !== 'undefined' && wx.downloadFile) {
        var timedOut = false
        var downloadTask = wx.downloadFile({
          url: url,
          timeout: 30000,
          success: function(res) {
            if (timedOut) return
            console.log('[weapp-adapter] wx.downloadFile success, status:', res.statusCode)
            if (res.statusCode === 200) {
              try {
                var fs = wx.getFileSystemManager()
                var data = fs.readFileSync(res.tempFilePath)
                console.log('[weapp-adapter] File read from temp, size:', data.byteLength)
                resolve(data)
              } catch (e) {
                console.warn('[weapp-adapter] fs.readFileSync failed, retrying with wx.request:', e)
                self._downloadViaRequest(url, resolve, reject)
              }
            } else {
              reject(new Error('Download failed: HTTP ' + res.statusCode))
            }
          },
          fail: function(err) {
            if (timedOut) return
            console.warn('[weapp-adapter] wx.downloadFile failed, retrying with wx.request:', err)
            self._downloadViaRequest(url, resolve, reject)
          }
        })
        setTimeout(function() {
          if (!timedOut) {
            timedOut = true
            try { downloadTask.abort() } catch (e) {}
            reject(new Error('Download timeout'))
          }
        }, 35000)
        return
      }
      self._downloadViaRequest(url, resolve, reject)
    })
  },
  downloadImage: function(url) {
    return new Promise(function(resolve, reject) {
      if (typeof wx === 'undefined' || !wx.downloadFile) {
        return reject(new Error('wx.downloadFile not available'))
      }
      wx.downloadFile({
        url: url,
        success: function(res) {
          if (res.statusCode === 200) resolve(res.tempFilePath)
          else reject(new Error('Download failed: ' + res.statusCode))
        },
        fail: reject
      })
    })
  }
}
