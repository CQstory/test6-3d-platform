/**
 * 适配层：为 three.js 提供小程序环境的浏览器 API shim
 *
 * 策略：three.cjs 内部对浏览器 API 采用 typeof 保护，仅裸引用 document.createElementNS。
 * 本模块提供"最小可逆全局注入"：
 *   - install()：挂载 three 真正依赖的全局（document/Image/Blob/URL/TextDecoder 等）
 *   - restore()：恢复原状（组件销毁时调用，不产生永久全局污染）
 * 与旧 weapp-adapter 的关键区别：注入面最小化 + 可逆，替代全量全局 shim。
 */

/* ========== 全局对象获取 ========== */

const g: any = globalThis

/* ========== base64 工具 ========== */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** btoa 手动实现（回退） */
function btoaManual(input: string): string {
  let output = ''
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input.charCodeAt(i)
    const b1 = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN
    const b2 = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN
    output += B64_CHARS[b0 >> 2]
    output += B64_CHARS[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)]
    output += isNaN(b1) ? '=' : B64_CHARS[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)]
    output += isNaN(b2) ? '=' : B64_CHARS[b2 & 63]
  }
  return output
}

/** ArrayBuffer → base64（微信原生 API 优先，回退手动） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof wx !== 'undefined' && (wx as any).arrayBufferToBase64) {
    try {
      return (wx as any).arrayBufferToBase64(buffer)
    } catch (_e) {
      /* 回退手动实现 */
    }
  }
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK)
    let s = ''
    for (let j = 0; j < chunk.length; j++) s += String.fromCharCode(chunk[j])
    binary += s
  }
  return btoaManual(binary)
}

/* ========== TextDecoder / TextEncoder polyfill（JSCore 无原生） ========== */

class MiniTextDecoder {
  private _utf16le: boolean
  constructor(encoding?: string) {
    this._utf16le = !!(encoding && /utf-?16/i.test(encoding) && /le/i.test(encoding))
  }
  decode(input: Uint8Array | ArrayBuffer): string {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (this._utf16le) {
      let out = ''
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8))
      }
      return out
    }
    // UTF-8 解码
    let out = ''
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (b < 0x80) {
        out += String.fromCharCode(b)
        i++
      } else if (b < 0xe0) {
        out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
        i += 2
      } else if (b < 0xf0) {
        out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
        i += 3
      } else {
        const cp =
          ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)
        out += String.fromCodePoint(cp)
        i += 4
      }
    }
    return out
  }
}

class MiniTextEncoder {
  encode(str: string): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < str.length; i++) {
      const cp = str.codePointAt(i) as number
      if (cp < 0x80) {
        out.push(cp)
      } else if (cp < 0x800) {
        out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
      } else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
      } else {
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
        i++
      }
    }
    return new Uint8Array(out)
  }
}

/* ========== Blob polyfill（GLB 内嵌贴图关键路径） ========== */

class MiniBlob {
  _data: Uint8Array
  _type: string
  constructor(parts: Array<Uint8Array | ArrayBuffer | string>, opts?: { type?: string }) {
    const chunks: number[] = []
    for (const part of parts) {
      if (typeof part === 'string') {
        const enc = new MiniTextEncoder()
        const bytes = enc.encode(part)
        for (let i = 0; i < bytes.length; i++) chunks.push(bytes[i])
      } else if (part instanceof Uint8Array) {
        for (let i = 0; i < part.length; i++) chunks.push(part[i])
      } else if (part instanceof ArrayBuffer) {
        const bytes = new Uint8Array(part)
        for (let i = 0; i < bytes.length; i++) chunks.push(bytes[i])
      }
    }
    this._data = new Uint8Array(chunks)
    this._type = (opts && opts.type) || ''
  }
}

/* ========== URL polyfill（createObjectURL → base64 data URI） ========== */

function createObjectURL(blob: any): string {
  console.log('[weapp-shim] createObjectURL called, blob ctor:', blob && blob.constructor && blob.constructor.name, 'isMiniBlob:', !!(blob && blob instanceof MiniBlob))
  if (blob && blob instanceof MiniBlob) {
    const mime = blob._type || 'application/octet-stream'
    const buf = blob._data.buffer.slice(blob._data.byteOffset, blob._data.byteOffset + blob._data.byteLength) as ArrayBuffer
    const dataUri = 'data:' + mime + ';base64,' + arrayBufferToBase64(buf)
    console.log('[weapp-shim] createObjectURL -> data URI, mime:', mime, 'len:', blob._data.length)
    return dataUri
  }
  console.warn('[weapp-shim] createObjectURL: not a MiniBlob, return empty')
  return ''
}

function revokeObjectURL(_url: string): void {
  /* no-op */
}

/* ========== createScopedShim ========== */

/** 可逆全局注入的句柄 */
export interface ScopedShim {
  /** 挂载全局 shim（three 加载前调用） */
  install(): void
  /** 恢复全局原状（组件清理时调用） */
  restore(): void
}

/**
 * 为指定 canvas 创建局部 shim。
 * @param canvas 页面 WebGL canvas 节点（createImage 桥接的目标）
 */
export function createScopedShim(canvas: any): ScopedShim {
  if (!canvas || !canvas.createImage) {
    throw new Error('createScopedShim: canvas.createImage is required')
  }

  // ---- 图片类：桥接 canvas.createImage()（真机纹理加载核心 API） ----
  class ScopedImage {
    onload: (() => void) | null
    onerror: ((e?: any) => void) | null
    width: number
    height: number
    complete: boolean
    private _img: any
    private _listeners: Record<string, Array<(e?: any) => void>>

    constructor() {
      // 字段在 constructor 内赋值：微信编译链（es6:false）不支持 class fields 语法（onload = null）
      this.onload = null
      this.onerror = null
      this.width = 0
      this.height = 0
      this.complete = false
      this._listeners = {}
      this._img = canvas.createImage()
      const onLoadCb = () => {
        this.width = this._img.width || 0
        this.height = this._img.height || 0
        this.complete = true
        console.log('[weapp-shim] ScopedImage onload, w:', this.width, 'h:', this.height, 'src head:', String(this._img.src || '').slice(0, 50))
        if (this.onload) this.onload()
        this._dispatch('load', { type: 'load' })
      }
      const onErrCb = (err: any) => {
        console.warn('[weapp-shim] ScopedImage onerror, src head:', String(this._img.src || '').slice(0, 50), 'err:', err)
        if (this.onerror) this.onerror(err)
        this._dispatch('error', { type: 'error', message: String(err) })
      }
      // 双保险：onload 属性 + addEventListener（基础库 3.x 回调方式可能不同）
      this._img.onload = onLoadCb
      this._img.onerror = onErrCb
      try {
        if (typeof this._img.addEventListener === 'function') {
          this._img.addEventListener('load', onLoadCb)
          this._img.addEventListener('error', onErrCb)
        }
      } catch (_e) {
        /* 忽略 */
      }
    }
    set src(v: string) {
      this._img.src = v
    }
    get src(): string {
      return this._img.src || ''
    }
    // three ImageLoader 用 addEventListener('load'/'error') 而非 onload 属性
    addEventListener(type: string, fn: (e?: any) => void) {
      console.log('[weapp-shim] ScopedImage.addEventListener, type:', type)
      if (!this._listeners[type]) this._listeners[type] = []
      this._listeners[type].push(fn)
    }
    removeEventListener(type: string, fn: (e?: any) => void) {
      const arr = this._listeners[type]
      if (arr) this._listeners[type] = arr.filter((f) => f !== fn)
    }
    private _dispatch(type: string, e: any) {
      const arr = this._listeners[type]
      console.log('[weapp-shim] ScopedImage._dispatch, type:', type, 'listenerCount:', arr ? arr.length : 0)
      if (arr) {
        arr.forEach((fn) => {
          try {
            // this 必须绑定为 ScopedImage：ImageLoader 的 onImageLoad 里 this 指向 image
            // （Cache.add(url, this) + onLoad(this)），原生事件系统 this = 事件目标
            fn.call(this, e)
          } catch (_e) {
            console.warn('[weapp-shim] ScopedImage listener error:', _e)
          }
        })
      }
    }
  }

  // ---- document 最小实现（three 唯一裸引用 createElementNS） ----
  const doc = {
    createElementNS(_ns: string | null, tag: string) {
      const t = (tag || '').toLowerCase()
      if (t === 'canvas') {
        const off = (wx as any).createOffscreenCanvas({ type: 'webgl' })
        if (off && !off.style) off.style = { display: 'block' }
        return off
      }
      if (t === 'img' || t === 'image') return new ScopedImage()
      return {}
    },
    createElement(tag: string) {
      return doc.createElementNS(null, tag)
    },
  }

  // ---- 注入键集合（含 self/rAF：微信模块包裹函数遮蔽 + three 内部全局 rAF 需求） ----
  const KEYS = ['self', 'document', 'Image', 'Blob', 'URL', 'TextDecoder', 'TextEncoder', 'atob', 'btoa', 'requestAnimationFrame', 'cancelAnimationFrame']
  const saved: Record<string, any> = {}

  /** 安全注入：直接赋值失败（基础库 Window 只读 getter）则尝试 defineProperty，再失败则保留全局 */
  function trySetGlobal(key: string, value: any): boolean {
    try {
      g[key] = value
      return true
    } catch (_e) {
      /* fallthrough */
    }
    try {
      Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true })
      return true
    } catch (_e2) {
      return false
    }
  }

  function atobImpl(s: string): string {
    // atob 手动实现（GLB JSON 解析可能用到）
    const b64 = s.replace(/=+$/, '')
    const lookup: Record<string, number> = {}
    for (let i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS[i]] = i
    let out = ''
    let buffer = 0
    let bits = 0
    for (let i = 0; i < b64.length; i++) {
      buffer = (buffer << 6) | lookup[b64[i]]
      bits += 6
      if (bits >= 8) {
        bits -= 8
        out += String.fromCharCode((buffer >> bits) & 0xff)
      }
    }
    return out
  }

  function btoaImpl(s: string): string {
    if (typeof wx !== 'undefined' && (wx as any).arrayBufferToBase64) {
      try {
        const bytes = new Uint8Array(s.length)
        for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff
        return (wx as any).arrayBufferToBase64(bytes.buffer)
      } catch (_e) {
        /* 回退 */
      }
    }
    return btoaManual(s)
  }

  return {
    install() {
      // 记录原始值（restore 用）
      for (const k of KEYS) {
        saved[k] = k in g ? g[k] : undefined
      }

      // 环境探测：基础库 3.x 自带 Window/document（只读 getter），确认其能力
      console.log(
        '[weapp-shim] install, globals -> document:',
        typeof g.document,
        g.document && typeof g.document.createElementNS,
        '| Image:', typeof g.Image,
        '| URL:', typeof g.URL,
        '| Blob:', typeof g.Blob,
        '| TextDecoder:', typeof g.TextDecoder,
        '| atob:', typeof g.atob
      )

      // 安全注入：只读属性（如基础库 document）失败则保留全局
      const failed: string[] = []
      const injected: string[] = []

      // 0) self：GLTFLoader 用 self.URL || self.webkitURL，基础库中 self 可能为 undefined
      if (trySetGlobal('self', g)) injected.push('self')
      else failed.push('self')

      // 1) document：整体覆盖可能只读（保留全局），改为给 document 对象挂 createElementNS/createElement
      //    （three 唯一裸引用 document.createElementNS，桥接到闭包 canvas）
      if (trySetGlobal('document', doc)) {
        injected.push('document')
      } else if (g.document && typeof g.document === 'object') {
        try {
          g.document.createElementNS = doc.createElementNS
          g.document.createElement = doc.createElement
          injected.push('document.methods')
        } catch (_e) {
          failed.push('document')
        }
      } else {
        failed.push('document')
      }

      // 2) URL：无条件用我们的 createObjectURL/revokeObjectURL 覆盖原生方法
      //    原生 createObjectURL 只接受原生 Blob，MiniBlob 会抛 Overload resolution failed
      const nativeUrl = g.URL
      let urlOk = false
      if (nativeUrl && (typeof nativeUrl === 'function' || typeof nativeUrl === 'object')) {
        try {
          nativeUrl.createObjectURL = createObjectURL
          nativeUrl.revokeObjectURL = revokeObjectURL
          urlOk = true
        } catch (_e) {
          try {
            Object.defineProperty(nativeUrl, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
            Object.defineProperty(nativeUrl, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
            urlOk = true
          } catch (_e2) {
            urlOk = false
          }
        }
        if (urlOk) injected.push('URL.methods')
        else failed.push('URL')
      }
      if (!urlOk) {
        // 原生 URL 完全不可覆盖：整体替换为我们的对象（GLTFLoader 只需 createObjectURL/revokeObjectURL）
        if (trySetGlobal('URL', { createObjectURL, revokeObjectURL })) injected.push('URL')
        else failed.push('URL')
      }

      // 3) 其余 polyfill（Image/Blob/TextDecoder/TextEncoder/atob/btoa/rAF）
      const rest: Array<[string, any]> = [
        ['Image', ScopedImage],
        ['Blob', MiniBlob],
        ['TextDecoder', MiniTextDecoder],
        ['TextEncoder', MiniTextEncoder],
        ['atob', atobImpl],
        ['btoa', btoaImpl],
        // 全局 rAF：桥接 canvas（three 内部 WebGLAnimation/其他库可能用全局）
        ['requestAnimationFrame', (cb: (t: number) => void) => canvas.requestAnimationFrame(cb)],
        ['cancelAnimationFrame', (id: number) => {
          if (canvas.cancelAnimationFrame) canvas.cancelAnimationFrame(id)
        }],
      ]
      for (const [key, value] of rest) {
        if (trySetGlobal(key, value)) injected.push(key)
        else failed.push(key)
      }
      if (failed.length > 0) {
        console.warn('[weapp-shim] cannot override globals (keep native):', failed.join(','))
      }
      console.log('[weapp-shim] injected:', injected.join(',') || '(none)')
    },
    restore() {
      for (const k of KEYS) {
        if (saved[k] === undefined) {
          try {
            delete g[k]
          } catch (_e) {
            /* 只读不可删：忽略 */
          }
        } else {
          try {
            g[k] = saved[k]
          } catch (_e) {
            try {
              Object.defineProperty(g, k, { value: saved[k], configurable: true, writable: true, enumerable: true })
            } catch (_e2) {
              /* 只读不可覆盖：忽略（install 时也未能覆盖） */
            }
          }
        }
      }
    },
  }
}
