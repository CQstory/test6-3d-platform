/**
 * 修复 three npm 包入口，适配微信开发者工具"构建 npm"及小程序运行环境
 *
 * 背景：
 *  - 微信"构建 npm"不识别 .cjs 入口（three@0.162.0 的 build/three.cjs + type: module）
 *  - 基础库 3.x 的 document 是 frozen 对象（无 createElementNS）→ three 需回退到全局 Image/离屏 canvas
 *  - WebGL texImage2D 只接受 canvas.createImage() 原生对象 → 需解包 ScopedImage._img
 *  - 微信模块包裹函数的 self 参数为 null（typeof null === 'object' 骗过检查）→ WebGLAnimation 需守卫
 *  - 纹理无 image 的警告每帧刷屏 → 去重（每个纹理只警告一次）
 *
 * 注意：npm install 会还原 node_modules，脚本需幂等，install 后重跑
 */
const fs = require('fs')
const path = require('path')

const THREE_DIR = path.resolve(__dirname, '../node_modules/three')
const BUILD_DIR = path.join(THREE_DIR, 'build')
const PKG_PATH = path.join(THREE_DIR, 'package.json')

if (!fs.existsSync(PKG_PATH)) {
  console.error('[fix-three-cjs] three package.json not found, run `npm install three@0.162.0` first')
  process.exit(1)
}

// 1. 复制 three.cjs → three.js（构建 npm 需要 .js 入口）
const srcCjs = path.join(BUILD_DIR, 'three.cjs')
const destJs = path.join(BUILD_DIR, 'three.js')
if (fs.existsSync(srcCjs)) {
  fs.copyFileSync(srcCjs, destJs)
  console.log('[fix-three-cjs] copied build/three.cjs -> build/three.js')
} else {
  console.error('[fix-three-cjs] build/three.cjs not found:', srcCjs)
  process.exit(1)
}

// 1.5 patch three.js 的 createElementNS：小程序基础库 3.x 的 document 是 frozen 对象（无 createElementNS），
//     而 three 主库唯一裸引用 document 的地方就是它（ImageLoader 创建 img / createCanvasElement 创建 canvas）。
//     回退到全局 Image（weapp-shim 注入的 ScopedImage，桥接 canvas.createImage）与离屏 canvas。
{
  const threeJs = path.join(BUILD_DIR, 'three.js')
  let js = fs.readFileSync(threeJs, 'utf8')
  const OLD_FN =
    "function createElementNS( name ) {\n\n\treturn document.createElementNS( 'http://www.w3.org/1999/xhtml', name );\n\n}"
  const NEW_FN =
    "function createElementNS( name ) {\n\n\t// weapp patch: base lib document is frozen without createElementNS\n\tif ( typeof document !== 'undefined' && typeof document.createElementNS === 'function' ) {\n\n\t\treturn document.createElementNS( 'http://www.w3.org/1999/xhtml', name );\n\n\t}\n\tif ( name === 'img' || name === 'image' ) {\n\n\t\tif ( typeof Image !== 'undefined' ) return new Image();\n\n\t}\n\tif ( name === 'canvas' ) {\n\n\t\tif ( typeof wx !== 'undefined' && wx.createOffscreenCanvas ) {\n\n\t\t\tconst off = wx.createOffscreenCanvas( { type: 'webgl' } );\n\t\t\tif ( off && !off.style ) off.style = { display: 'block' };\n\t\t\treturn off;\n\n\t\t}\n\n\t}\n\treturn {};\n\n}"
  if (js.indexOf('weapp patch') === -1) {
    if (js.indexOf(OLD_FN) !== -1) {
      js = js.replace(OLD_FN, NEW_FN)
      fs.writeFileSync(threeJs, js, 'utf8')
      console.log('[fix-three-cjs] patched createElementNS (weapp compat)')
    } else {
      console.warn('[fix-three-cjs] createElementNS pattern not found, skip patch')
    }
  } else {
    console.log('[fix-three-cjs] createElementNS already patched, skip')
  }
}

// 1.6 patch WebGLState.texImage2D：ScopedImage（weapp-shim 桥接对象）上传时解包为原生 _img
//     小程序 WebGL 的 gl.texImage2D 只接受 canvas.createImage() 返回的原生对象
{
  const threeJs = path.join(BUILD_DIR, 'three.js')
  let js = fs.readFileSync(threeJs, 'utf8')
  const OLD_TEX =
    '\tfunction texImage2D() {\n\n\t\ttry {\n\n\t\t\tgl.texImage2D.apply( gl, arguments );\n\n\t\t} catch ( error ) {\n\n\t\t\tconsole.error( \'THREE.WebGLState:\', error );\n\n\t\t}\n\n\t}'
  const NEW_TEX =
    '\tfunction texImage2D() {\n\n\t\ttry {\n\n\t\t\t// weapp patch: unwrap ScopedImage bridge, upload native _img\n\t\t\tconst args = Array.prototype.slice.call( arguments );\n\t\t\tconst last = args[ args.length - 1 ];\n\t\t\tif ( last && last._img ) {\n\n\t\t\t\targs[ args.length - 1 ] = last._img;\n\n\t\t\t}\n\t\t\tgl.texImage2D.apply( gl, args );\n\n\t\t} catch ( error ) {\n\n\t\t\tconsole.error( \'THREE.WebGLState:\', error );\n\n\t\t}\n\n\t}'
  if (js.indexOf('unwrap ScopedImage bridge') === -1) {
    if (js.indexOf(OLD_TEX) !== -1) {
      js = js.replace(OLD_TEX, NEW_TEX)
      fs.writeFileSync(threeJs, js, 'utf8')
      console.log('[fix-three-cjs] patched texImage2D (ScopedImage unwrap)')
    } else {
      console.warn('[fix-three-cjs] texImage2D pattern not found, skip patch')
    }
  } else {
    console.log('[fix-three-cjs] texImage2D already patched, skip')
  }
}

// 1.7 patch WebGLAnimation.setContext：微信模块包裹函数的 self 参数是 null（typeof null === 'object'
//     骗过 typeof self !== 'undefined' 检查）
{
  const threeJs = path.join(BUILD_DIR, 'three.js')
  let js = fs.readFileSync(threeJs, 'utf8')
  const OLD_SELF = "\t\tif ( typeof self !== 'undefined' ) animation.setContext( self );"
  const NEW_SELF = "\t\tif ( typeof self !== 'undefined' && self !== null ) animation.setContext( self );"
  if (js.indexOf('self !== null') === -1) {
    if (js.indexOf(OLD_SELF) !== -1) {
      js = js.replace(OLD_SELF, NEW_SELF)
      fs.writeFileSync(threeJs, js, 'utf8')
      console.log('[fix-three-cjs] patched WebGLAnimation.setContext (self null guard)')
    } else {
      console.warn('[fix-three-cjs] setContext pattern not found, skip patch')
    }
  } else {
    console.log('[fix-three-cjs] setContext already patched, skip')
  }
}

// 1.8 patch WebGLAnimation.stop：context 默认就是 null（即使 setContext 被跳过），stop 时直接崩
//     改为 context 空值保护（context 存在且有 cancelAnimationFrame 才调用）
{
  const threeJs = path.join(BUILD_DIR, 'three.js')
  let js = fs.readFileSync(threeJs, 'utf8')
  const OLD_STOP = "\t\tstop: function () {\n\n\t\t\tcontext.cancelAnimationFrame( requestId );\n\n\t\t\tisAnimating = false;"
  const NEW_STOP =
    "\t\tstop: function () {\n\n\t\t\tif ( context !== null && typeof context.cancelAnimationFrame === 'function' ) {\n\n\t\t\t\tcontext.cancelAnimationFrame( requestId );\n\n\t\t\t}\n\n\t\t\tisAnimating = false;"
  if (js.indexOf('context !== null && typeof context.cancelAnimationFrame') === -1) {
    if (js.indexOf(OLD_STOP) !== -1) {
      js = js.replace(OLD_STOP, NEW_STOP)
      fs.writeFileSync(threeJs, js, 'utf8')
      console.log('[fix-three-cjs] patched WebGLAnimation.stop (context null guard)')
    } else {
      console.warn('[fix-three-cjs] stop pattern not found, skip patch')
    }
  } else {
    console.log('[fix-three-cjs] stop already patched, skip')
  }
}

// 1.9 patch setTexture2D：纹理无 image 的警告去重（每帧刷屏 → 每个纹理只警告一次）
{
  const threeJs = path.join(BUILD_DIR, 'three.js')
  let js = fs.readFileSync(threeJs, 'utf8')
  const OLD_WARN =
    "\t\t\tif ( image === null ) {\n\n\t\t\t\tconsole.warn( 'THREE.WebGLRenderer: Texture marked for update but no image data found.' );\n\n\t\t\t} else if ( image.complete === false ) {"
  const NEW_WARN =
    "\t\t\tif ( image === null ) {\n\n\t\t\t\tif ( _warnedNoImage === undefined ) var _warnedNoImage = new Set();\n\t\t\t\tif ( _warnedNoImage.has( texture ) === false ) {\n\n\t\t\t\t\t_warnedNoImage.add( texture );\n\t\t\t\t\tconsole.warn( 'THREE.WebGLRenderer: Texture marked for update but no image data found.' );\n\n\t\t\t\t}\n\n\t\t\t} else if ( image.complete === false ) {"
  if (js.indexOf('_warnedNoImage') === -1) {
    if (js.indexOf(OLD_WARN) !== -1) {
      js = js.replace(OLD_WARN, NEW_WARN)
      fs.writeFileSync(threeJs, js, 'utf8')
      console.log('[fix-three-cjs] patched setTexture2D warning dedup')
    } else {
      console.warn('[fix-three-cjs] setTexture2D pattern not found, skip patch')
    }
  } else {
    console.log('[fix-three-cjs] setTexture2D already patched, skip')
  }
}

// 2. 修改 package.json：main → ./build/three.js、移除 type: module
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
let changed = false
if (pkg.main !== './build/three.js') {
  pkg.main = './build/three.js'
  changed = true
}
if (pkg.type === 'module') {
  delete pkg.type
  changed = true
}
if (changed) {
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
  console.log('[fix-three-cjs] package.json patched: main=' + pkg.main + ', type removed')
} else {
  console.log('[fix-three-cjs] package.json already patched, skip')
}
console.log('[fix-three-cjs] done')
