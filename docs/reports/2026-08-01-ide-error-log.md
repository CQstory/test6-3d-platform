# IDE 报错日志（2026-08-01）

> 来源：微信开发者工具 Console 导出
> 环境：Windows / mp / lib 3.16.2
> 原始日志见「二、原始日志」，原因分析见「一、错误清单与原因对照」

---

## 一、错误清单与原因对照

| # | 错误 | 次数 | 原因 | 责任方 |
|---|------|------|------|--------|
| 1 | `GET /api/v1/shops/mine` 404 | 2 | 后端未实现 `GET /shops/mine`（API.md 已定义但未落地）；前端 `getMyShop()` 已 catch 返回 null，仅控制台噪音 | 后端 |
| 2 | `GET /api/v1/merchant/models` 400 `请先申请入驻店铺` | 2 | 当前用户未入驻店铺（role 为 merchant 但后端无店铺记录）；且 `merchant-center._loadData` 未 catch → 触发 MiniProgramError 未捕获异常 | 前端+后端 |
| 3 | 图片加载 `ERR_CONNECTION_RESET`（Fox/Avocado 缩略图） | 2 | 缩略图 URL 指向 `raw.githubusercontent.com`，国内网络不可达；后端静态图走 `localhost:8000/static/picture/` 正常 | 数据源 |
| 4 | `wx.getSystemInfoSync is deprecated` | 1 | 基础库 3.16.2 弃用该 API，应改用 `wx.getWindowInfo` / `wx.getDeviceInfo` | 前端 |
| 5 | `GET /api/v1/price-options?dimension=xxx` 404 | 3 | G3 选项接口后端未实现（预期内）；前端 `loadOptions` 已 catch 回退预置选项，无功能影响 | 后端 |

---

## 二、原始日志

```
api.ts:9 GET http://localhost:8000/api/v1/shops/mine 404 (Not Found)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getMyShop @ merchant-service.ts:56
_loadData @ merchant-center.ts:34
onLoad @ merchant-center.ts:20
api.ts:9 GET http://localhost:8000/api/v1/shops/mine 404 (Not Found)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getMyShop @ merchant-service.ts:56
_loadData @ merchant-center.ts:34
onShow @ merchant-center.ts:29
api.ts:9 GET http://localhost:8000/api/v1/merchant/models 400 (Bad Request)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getMyModels @ model-service.ts:141
_loadData @ merchant-center.ts:35
async function (async)
_loadData @ merchant-center.ts:34
onLoad @ merchant-center.ts:20
<Error: MiniProgramError
{"status":400,"data":{"detail":"请先申请入驻店铺"}}>
Error: MiniProgramError
{"status":400,"data":{"detail":"请先申请入驻店铺"}}
    at Object.errorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:207233)
    at Function.thirdErrorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:206517)
    at Object.thirdErrorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:210381)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
api.ts:9 GET http://localhost:8000/api/v1/merchant/models 400 (Bad Request)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getMyModels @ model-service.ts:141
_loadData @ merchant-center.ts:35
async function (async)
_loadData @ merchant-center.ts:34
onShow @ merchant-center.ts:29
<Error: MiniProgramError
{"status":400,"data":{"detail":"请先申请入驻店铺"}}>
Error: MiniProgramError
{"status":400,"data":{"detail":"请先申请入驻店铺"}}
    at Object.errorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:207233)
    at Function.thirdErrorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:206517)
    at Object.thirdErrorReport (http://127.0.0.1:61857/appservice/__dev__/WAServiceMainContext.js?t=wechat&v=3.16.2:1:210381)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
[渲染层网络层错误] Failed to load image https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/screenshot/screenshot.png
net::ERR_CONNECTION_RESET 
(env: Windows,mp,2.01.2510290; lib: 3.16.2)
[渲染层网络层错误] Failed to load image https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/screenshot/screenshot.png
net::ERR_CONNECTION_RESET 
(env: Windows,mp,2.01.2510290; lib: 3.16.2)
top-bar.ts:13 wx.getSystemInfoSync is deprecated.Please use wx.getSystemSetting/wx.getAppAuthorizeSetting/wx.getDeviceInfo/wx.getWindowInfo/wx.getAppBaseInfo instead.
attached @ top-bar.ts:13
api.ts:9 GET http://localhost:8000/api/v1/price-options?dimension=material 404 (Not Found)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getPriceOptions @ model-service.ts:161
loadOptions @ model-edit.ts:31
onLoad @ model-edit.ts:88
api.ts:9 GET http://localhost:8000/api/v1/price-options?dimension=size 404 (Not Found)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getPriceOptions @ model-service.ts:161
loadOptions @ model-edit.ts:31
onLoad @ model-edit.ts:89
api.ts:9 GET http://localhost:8000/api/v1/price-options?dimension=complexity 404 (Not Found)(env: Windows,mp,2.01.2510290; lib: 3.16.2)
(anonymous) @ api.ts:9
request @ api.ts:7
get @ api.ts:32
getPriceOptions @ model-service.ts:161
loadOptions @ model-edit.ts:31
onLoad @ model-edit.ts:90
```
