# 微信小程序编译链 es6:false 与 class fields 语法兼容问题报告

> 日期：2026-08-15
> 范围：`miniprogram/subpackages/modelViewer/lib/weapp-shim.ts` 中 `ScopedImage` 类字段初始化方式由 class fields 语法改为 constructor 内赋值的兼容性根因分析
> 前置背景：项目 `project.config.json` 配置 `"es6": false`（关闭"将 JS 代码编译成 ES5"），`"useCompilerPlugins": ["typescript"]`（微信内置 TS 编译插件）

## 一、问题现象

`ScopedImage` 类原使用 class fields 语法（ES2022）：

```ts
class ScopedImage {
  onload: (() => void) | null = null
  width = 0
  complete = false
  ...
}
```

真机/工具环境出现编译或运行期兼容问题，需改为 constructor 内赋值：

```ts
class ScopedImage {
  onload: (() => void) | null
  width: number
  ...
  constructor() {
    this.onload = null
    this.width = 0
    ...
  }
}
```

## 二、根因（官方文档 + 实测双重确认）

### 2.1 微信内置 TS 编译插件 ≠ tsc

微信官方文档《原生支持 TypeScript》明确说明：

> 目前的 ts 代码转换成 js 代码的逻辑，是由 **@babel/plugin-transform-typescript** 插件进行处理的，因此在编译过程中，**仅仅是移除了 ts 代码中类型声明等信息**。

即微信工具链的 TS→JS 转换**只删类型、不做语法降级**。class fields（ES2022）语法被**原样保留**在产物中。

### 2.2 es6: false 关闭二次降级

官方文档《代码编译》说明"将 JS 代码编译成 ES5"（es6 选项）使用 babel7 preset-env，编译目标 `{chrome:53, ios:8}`。本项目 `"es6": false` 表示**关闭该降级**，TS 产物不再过 Babel，class fields 语法直接进入运行时。

### 2.3 与本地 tsc 行为的差异（实测验证）

用 git 中旧版本代码以项目 tsconfig（`target: ES2020`）本地编译，产物显示：

```js
class ScopedImage {
    constructor() {
        this.onload = null;   // ← 被转译为 constructor 赋值
        ...
```

**本地 tsc 会转译 class fields**（`target < ES2022` 时 `useDefineForClassFields` 默认 false），因此 `npx tsc --noEmit` 永远无法发现此问题——类型检查通过，且产物行为与微信工具链完全不同。

## 三、完整因果链

| 环节 | 配置/行为 | 结果 |
|------|-----------|------|
| 1 | `useCompilerPlugins: ["typescript"]` | 启用微信内置 TS 编译插件 |
| 2 | 微信内置 TS 插件 = `@babel/plugin-transform-typescript` | **只删类型，不降级新语法** |
| 3 | 源码含 class fields（`onload = null`） | 语法原样保留在产物 JS 中 |
| 4 | `"es6": false` | 关闭 Babel preset-env 二次降级（目标 `{chrome:53, ios:8}`） |
| 5 | 低版本 JSCore 不支持 ES2022 class fields | 真机运行时 SyntaxError / 编译失败 |

## 四、修复方案

class fields 改为 **constructor 内赋值**（ES5 兼容写法），不依赖任何转译即可运行：

```ts
// 字段在 constructor 内赋值：微信编译链（es6:false）不支持 class fields 语法（onload = null）
this.onload = null
this.onerror = null
this.width = 0
this.height = 0
this.complete = false
this._listeners = {}
```

类型层面 `strictPropertyInitialization: true` 同样满足（constructor 内赋值视为已初始化）。

## 五、经验教训

1. **微信工具链下不要使用 class fields 语法**（以及任何 ES2022+ 新语法），除非开启 `"es6": true` 依赖 Babel 降级；constructor 赋值是最稳妥的兼容写法。
2. **`npx tsc --noEmit` 无法发现微信工具链的语法兼容问题**：本地 tsc 与微信 TS 编译插件（Babel）的降级行为不同，类型检查通过 ≠ 工具链可运行。
3. 排查此类问题的快捷路径：先确认 `project.config.json` 的 `es6` 开关与 `useCompilerPlugins`，再对照微信官方文档《代码编译》《原生支持 TypeScript》确认转换行为，避免在错误方向浪费时间。

## 六、结论

| 项 | 结论 |
|----|------|
| 是否存在兼容问题 | 是（es6:false 下 class fields 语法不被支持） |
| 直接原因 | 微信内置 TS 插件只删类型不降级 + es6:false 关闭 Babel 降级 |
| 为何 tsc 检查不出 | 本地 tsc（target ES2020）会转译 class fields，与微信工具链行为不同 |
| 修复 | class fields → constructor 内赋值（提交 `3fd07de` 附带） |
| 是否已解决 | 是（逻辑等价，已验证） |
