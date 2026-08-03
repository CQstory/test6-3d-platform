/**
 * 将 three examples/jsm 中需要的加载器/工具从 ESM 转 CJS，适配微信小程序 require
 *
 * 背景：小程序"构建 npm"产物按 CJS 解析，examples/jsm 为 ESM（import/export），
 *       且构建 npm 不追踪分包内 require 的 npm 子路径（node_modules/three/build/addons-cjs 打不进 miniprogram_npm）。
 * 处理：GLTFLoader.js 与 BufferGeometryUtils.js 转 CJS，输出到分包 lib/vendor/（项目文件），
 *       业务侧相对路径 require，GLTFLoader 内部 require('three') 仍走包名映射到 miniprogram_npm。
 * 注意：npm install 会还原 node_modules 但不会动分包目录；重跑本脚本幂等
 */
const fs = require('fs')
const path = require('path')

const THREE_DIR = path.resolve(__dirname, '../node_modules/three')
// 输出到分包 lib/vendor/：项目文件，随分包打包，不依赖构建 npm 追踪
const OUT_DIR = path.resolve(__dirname, '../miniprogram/subpackages/modelViewer/lib/vendor')

const FILES = [
  {
    src: path.join(THREE_DIR, 'examples/jsm/loaders/GLTFLoader.js'),
    out: path.join(OUT_DIR, 'GLTFLoader.js'),
    requireMap: { '../utils/BufferGeometryUtils.js': './BufferGeometryUtils.js' },
  },
  {
    src: path.join(THREE_DIR, 'examples/jsm/utils/BufferGeometryUtils.js'),
    out: path.join(OUT_DIR, 'BufferGeometryUtils.js'),
    requireMap: {},
  },
]

/** 把 ESM 源码转为 CJS */
function convert(content, requireMap) {
  // 1) 多行 import { ... } from 'mod'  →  const { ... } = require('mod')
  content = content.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)';/g, (m, names, mod) => {
    const target = requireMap[mod] || mod
    const trimmed = names.trim().replace(/\n\s*/g, '\n  ')
    return `const {\n  ${trimmed}\n} = require('${target}');`
  })
  // 2) 单行 import X from 'mod'  /  import { X } from 'mod'  /  import * as X from 'mod'
  content = content.replace(/import\s+\*\s*as\s+(\w+)\s+from\s*'([^']+)';/g, (m, name, mod) => {
    const target = requireMap[mod] || mod
    return `const ${name} = require('${target}');`
  })
  content = content.replace(/import\s+(\w+)\s+from\s*'([^']+)';/g, (m, name, mod) => {
    const target = requireMap[mod] || mod
    return `const ${name} = require('${target}');`
  })
  content = content.replace(/import\s*\{([^}]+)\}\s*from\s*'([^']+)';/g, (m, names, mod) => {
    const target = requireMap[mod] || mod
    return `const { ${names.trim().replace(/\n\s*/g, ' ')} } = require('${target}');`
  })
  // 3) export function X → function X（保留定义，末尾统一 module.exports）
  content = content.replace(/export\s+function\s+(\w+)/g, 'function $1')
  // 4) export class X → class X
  content = content.replace(/export\s+class\s+(\w+)/g, 'class $1')
  // 5) export { A, B };（含多行块）→ module.exports = { A, B };
  content = content.replace(/export\s*\{([\s\S]*?)\};?/g, (m, names) => {
    const trimmed = names.trim().replace(/\n\s*/g, ' ')
    return `module.exports = { ${trimmed} };`
  })
  // 6) GLTFLoader 的 self.URL：微信模块包裹函数可能遮蔽全局 self（值为 undefined）→ 改用 globalThis
  content = content.replace(
    /const URL = self\.URL \|\| self\.webkitURL;/g,
    "const URL = (typeof globalThis !== 'undefined' && globalThis.URL) || { createObjectURL: function () { return '' }, revokeObjectURL: function () {} };"
  )
  // 7) 暴露纹理加载真实错误：默认 catch 只打印 sourceURI（可能是 Promise），加 error 参数
  content = content.replace(
    /console\.error\( 'THREE\.GLTFLoader: Couldn\\'t load texture', sourceURI \);/g,
    "console.error( 'THREE.GLTFLoader: Couldn\\'t load texture', sourceURI, error );"
  )
  // 8) 纹理加载诊断日志（定位 texture.image 为何为 null）
  content = content.replace(
    /loadImageSource\( sourceIndex, loader \) \{\n\n\t\tconst parser = this;/,
    "loadImageSource( sourceIndex, loader ) {\n\n\t\tconsole.log( '[gltf-diag] loadImageSource, sourceIdx:', sourceIndex, 'loader:', loader && loader.constructor && loader.constructor.name );\n\n\t\tconst parser = this;"
  )
  content = content.replace(
    /sourceURI = parser\.getDependency\( 'bufferView', sourceDef\.bufferView \)/,
    "console.log( '[gltf-diag] bufferView path, mime:', sourceDef.mimeType );\n\t\t\t\tsourceURI = parser.getDependency( 'bufferView', sourceDef.bufferView )"
  )
  content = content.replace(
    /loader\.load\( LoaderUtils\.resolveURL\( sourceURI, options\.path \), onLoad, undefined, reject \);/,
    "console.log( '[gltf-diag] loader.load, sourceURI head:', String( sourceURI ).slice( 0, 60 ), 'loader:', loader.constructor.name );\n\t\t\t\tloader.load( LoaderUtils.resolveURL( sourceURI, options.path ), onLoad, undefined, reject );"
  )
  // 9) loadImageSource resolved 后的 texture 状态（验证 ImageLoader this 绑定修复）
  content = content.replace(
    /const promise = this\.loadImageSource\( sourceIndex, loader \)\.then\( function \( texture \) \{\n\n\t\t\ttexture\.flipY = false;/,
    "const promise = this.loadImageSource( sourceIndex, loader ).then( function ( texture ) {\n\n\t\t\tconsole.log( '[gltf-diag] loadImageSource resolved -> ctor:', texture && texture.constructor && texture.constructor.name, 'image:', texture.image === null ? 'null' : texture.image === undefined ? 'undefined' : 'object', 'version:', texture.version, 'needsUpdate:', texture.needsUpdate );\n\n\t\t\ttexture.flipY = false;"
  )
  return content
}

fs.mkdirSync(OUT_DIR, { recursive: true })

let anyError = false
for (const f of FILES) {
  if (!fs.existsSync(f.src)) {
    console.error('[convert-three-addons] source not found:', f.src)
    anyError = true
    continue
  }
  // 幂等：输出较新则跳过
  const srcStat = fs.statSync(f.src)
  let skip = false
  if (fs.existsSync(f.out)) {
    const outStat = fs.statSync(f.out)
    if (outStat.mtimeMs >= srcStat.mtimeMs) skip = true
  }
  if (skip) {
    console.log('[convert-three-addons] up-to-date, skip:', path.basename(f.out))
    continue
  }
  const source = fs.readFileSync(f.src, 'utf8')
  const converted = convert(source, f.requireMap)
  fs.writeFileSync(f.out, converted, 'utf8')
  console.log('[convert-three-addons] converted:', f.src, '->', f.out)
}

if (anyError) process.exit(1)
console.log('[convert-three-addons] done, output dir:', OUT_DIR)
