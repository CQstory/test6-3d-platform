/**
 * 绑定层：把 three.js npm 包绑定到指定 canvas，返回作用域化的 THREE 命名空间
 *
 * 流程：install 可逆全局 shim → require('three')（包名路径，运行时映射 miniprogram_npm）
 *      → 返回 THREE + 清理句柄（restore）。three 实例生命周期由调用方（组件）持有。
 */
import { createScopedShim } from './weapp-shim'

/** 绑定到单个 canvas 的 three 命名空间 */
export interface ScopedThree {
  /** three.js 命名空间（three 无官方 TS 类型，使用 any） */
  THREE: any
  /** three 版本号，如 "162" */
  REVISION: string
  /** 当前环境 WebGL2 支持探测结果（决定后续版本升级依据） */
  webgl2Supported: boolean
  /** 卸载全局 shim（组件清理时调用，幂等） */
  restore(): void
}

/**
 * 创建绑定到指定 canvas 的 three 实例。
 * @param canvas 页面 WebGL canvas 节点
 */
export function createScopedThreejs(canvas: any): ScopedThree {
  if (!canvas) throw new Error('createScopedThreejs: canvas is required')

  const shim = createScopedShim(canvas)
  try {
    shim.install()
    // 包名路径 require：运行时自动映射到 miniprogram_npm/three
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three')
    // 探测：微信模块包裹函数是否遮蔽 document/self（决定 three 主库能否用全局 DOM shim）
    const gProbe: any = globalThis
    const docProbe: any = gProbe.document
    const selfProbe: any = gProbe.self
    console.log(
      '[create-scoped-three] module scope -> document:',
      typeof docProbe,
      docProbe && typeof docProbe.createElementNS,
      '| self:',
      typeof selfProbe,
      '| globalThis.URL:',
      typeof gProbe.URL,
      gProbe.URL && typeof gProbe.URL.createObjectURL
    )
    if (!THREE || !THREE.WebGLRenderer || !THREE.Scene) {
      shim.restore()
      throw new Error('three 加载失败：请在微信开发者工具中执行"构建 npm"')
    }

    // WebGL2 探测：用离屏 canvas，避免占用主 canvas 的 context 类型
    let webgl2Supported = false
    try {
      const probe = (wx as any).createOffscreenCanvas({ type: 'webgl' })
      const gl2 = probe && probe.getContext && probe.getContext('webgl2')
      webgl2Supported = !!gl2
    } catch (_e) {
      webgl2Supported = false
    }

    return {
      THREE,
      REVISION: String(THREE.REVISION || ''),
      webgl2Supported,
      restore: () => shim.restore(),
    }
  } catch (e) {
    try {
      shim.restore()
    } catch (_re) {
      /* restore 失败不影响主错误 */
    }
    throw e
  }
}
