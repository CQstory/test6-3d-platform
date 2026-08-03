/**
 * GLTFLoader CJS 工厂：延迟 require 转换产物
 *
 * 背景：three/examples/jsm 为 ESM，已由 scripts/convert-three-addons.js 转 CJS 到
 *      lib/vendor/（分包项目文件，随分包打包，不依赖构建 npm 追踪分包 require）。
 *      其内部 require('three') 走包名映射到 miniprogram_npm（需先执行"构建 npm"）。
 * 注意：必须函数内延迟 require（避免 three 未就绪时顶层解构 null 崩溃），
 *      且调用前保证 createScopedThreejs 已成功（three 模块缓存命中）。
 */

/** 创建 GLTFLoader 实例（parse 模式加载 GLB，绕开 fetch/XHR） */
export function createGLTFLoader(THREE: any): any {
  if (!THREE || !THREE.Loader) {
    throw new Error('createGLTFLoader: THREE not ready, call createScopedThreejs first')
  }
  // 相对路径 require 分包内转换产物（lib/vendor/GLTFLoader.js）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../lib/vendor/GLTFLoader.js')
  const GLTFLoader = mod && (mod.GLTFLoader || mod.default)
  if (!GLTFLoader) {
    throw new Error('createGLTFLoader: GLTFLoader module invalid, run scripts/convert-three-addons.js')
  }
  return new GLTFLoader()
}
