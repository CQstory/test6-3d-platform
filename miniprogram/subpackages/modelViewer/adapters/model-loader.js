"use strict";
/**
 * 统一模型加载器
 * 自动检测 GLB/OBJ 格式并路由到对应解析器
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModel = loadModel;
const obj_loader_1 = require("./obj-loader");
const glbLoader = require('./glb-loader');
/** 检测文件格式（基于文件扩展名或 magic bytes） */
function detectFormat(data, url) {
    // 1. URL 扩展名优先
    const lower = url.toLowerCase();
    if (lower.endsWith('.obj'))
        return 'obj';
    if (lower.endsWith('.glb'))
        return 'glb';
    // 2. Magic bytes 检测
    if (data.byteLength >= 4) {
        const magic = new DataView(data).getUint32(0, true);
        if (magic === 0x46546c67)
            return 'glb'; // 'glTF'
    }
    // 3. 文本首行检测（OBJ 以 'v ' 或 '# ' 开头）
    try {
        const head = new Uint8Array(data.slice(0, 20));
        const str = String.fromCharCode.apply(null, Array.from(head));
        if (str.startsWith('v ') || str.startsWith('# ') || str.includes('mtllib'))
            return 'obj';
    }
    catch (_) {
        // ignore
    }
    return 'glb'; // 默认
}
async function loadModel(url, THREE, canvas) {
    // 下载模型文件
    const adapter = require('./weapp-adapter');
    const data = await adapter.downloadBinary(url);
    const format = detectFormat(data, url);
    console.log('[model-loader] Detected format:', format, 'for', url);
    if (format === 'obj') {
        return (0, obj_loader_1.loadOBJ)(data, THREE);
    }
    else {
        return glbLoader.loadGLBModel(url, THREE, canvas);
    }
}
