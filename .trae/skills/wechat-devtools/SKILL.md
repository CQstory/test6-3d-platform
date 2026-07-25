---
name: wechat-devtools
description: >
---

# WeChat Developer Tools — Debugging Information Retrieval

This skill retrieves debugging information (console logs, runtime errors, page state) from a
WeChat mini program project running in the WeChat Developer Tools IDE. It uses three interfaces:
HTTP v2 API for basic operations, CLI for automation setup, and miniprogram-automator for runtime
introspection.

---

## ⚠️ Core Principle: Always Gate on Login

Most debugging operations — preview compilation, automation mode, automator connection — require
the IDE to be logged in with a WeChat account. **Calling these endpoints while not logged in
returns `code 10` ("需要重新登录") and wastes the call.** The automator setup (`cli.bat auto`)
is particularly expensive because it spawns processes and fetches app permissions.

**The rule**: before any login-required step, check `/v2/islogin`. If `{"login":false}`:

1. **Do NOT** call `/v2/login` to fetch a QR code image — the image is a binary JPEG that can't
   be displayed inline. Instead, the IDE will pop up its own login QR window automatically when
   it needs authentication.

2. **Tell the user**:
   > ⚠️ 微信开发者工具尚未登录。请在 IDE 弹出的窗口中用微信扫码登录，然后回复 **yes** 或 **已登录**。

3. **Wait** for the user to explicitly confirm (e.g. "yes", "已登录", "done", "ok").

4. **Verify** with `/v2/islogin` that `login` is now `true`, then continue.

5. If the user says they don't see a QR popup, only then try `/v2/login` as a fallback to
   trigger one — but still present it as "请在 IDE 中扫码登录" rather than trying to display
   the JPEG.

**This gate applies before**: `/v2/preview`, `/v2/autopreview`, `/v2/upload`, `/v2/buildnpm`,
`cli.bat auto`, `cli.bat preview`, and any automator connection.

Operations that work without login: `/v2/open`, `/v2/islogin`, `/v2/close`, `/v2/quit`.

---

## Main Workflow: Retrieve Debugging Information

Follow this sequence every time. Each step gates on the one before it — do not skip ahead.

### Step 1 — Establish the Basics

```
1. Confirm the service port (user provides, or check .ide file)
2. Verify the port responds:   curl http://127.0.0.1:<port>/v2/islogin
3. Open the project:           curl http://127.0.0.1:<port>/v2/open?projectpath=<url-encoded-path>
```

If the port doesn't respond, the IDE service port is not enabled. Tell the user:
> 微信开发者工具的服务端口未开启。请在 IDE 中：**设置 → 安全设置 → 开启「服务端口」**，然后告诉我端口号。

### Step 2 — Login Gate (see Core Principle above)

```
1. curl /v2/islogin
2. If false → tell user to scan QR in IDE popup → WAIT for confirmation
3. Verify login is now true
```

### Step 3 — Enable Automation Mode

Only after login is confirmed:

```bash
cli.bat auto --project "<absolute-project-path>" --auto-port 9420
```

If port 9420 is in use, increment: 9421, 9422. Record the port that worked.

If this returns an error about login, go back to Step 2.

### Step 4 — Connect Automator & Collect Data

```js
const automator = require('miniprogram-automator');

const mp = await automator.connect({
  wsEndpoint: 'ws://127.0.0.1:<auto-port>',
});

// Listen for events
mp.on('console', (log) => { /* log.type: 'log'|'warn'|'error'|'info' */ });
mp.on('exception', (err) => { /* uncaught exceptions */ });

// Navigate and collect
await mp.currentPage();
await mp.switchTab('/pages/...');
await mp.navigateTo('/pages/...');

// Summarize and report errors/warnings to the user
```

### Step 5 — Report & Clean Up

Present findings: console errors, warnings, exceptions, page state. Then:

```js
await mp.close();
```

---

## Appendix A: HTTP v2 API Reference

**Base URL**: `http://127.0.0.1:<port>/v2/`

Responses: `200` on success (often `{}` or a JPEG), `400` with `{"code":N,"message":"..."}` on failure.

### Endpoint Quick Reference

| Endpoint | Login? | Key Parameter | Returns |
|----------|--------|---------------|---------|
| `/v2/open` | No | `projectpath=<url-encoded>` | `{}` |
| `/v2/islogin` | No | (none) | `{"login":bool}` |
| `/v2/login` | No | `format=image` | JPEG QR image |
| `/v2/close` | No | `project=<url-encoded>` | `{}` |
| `/v2/quit` | No | (none) | `{}` |
| `/v2/preview` | **Yes** | `project=<url-encoded>` | JPEG QR on success |
| `/v2/autopreview` | **Yes** | `project=<url-encoded>` | JSON |
| `/v2/upload` | **Yes** | `project=,version=,desc=` | JSON |
| `/v2/buildnpm` | **Yes** | `project=,compile-type=` | JSON |
| `/v2/cleancache` | No | `project=,clean=` | JSON |
| `/v2/resetfileutils` | No | `project=` | JSON |

**Critical parameter difference**: `/v2/open` uses `projectpath`; all other endpoints use `project`.

### Bash Examples

```bash
PORT=52489
PROJ="d%3A%2FCode%2Fbenchuang%2Ftest2"

curl -s "http://127.0.0.1:$PORT/v2/open?projectpath=$PROJ"
curl -s "http://127.0.0.1:$PORT/v2/islogin"
curl -s "http://127.0.0.1:$PORT/v2/preview?project=$PROJ"
```

---

## Appendix B: CLI Command Reference

```bash
cli.bat <command> [--project <path>] [--auto-port <N>] [--appid <id>]
```

### All Commands

| Command | Purpose | Login? |
|---------|---------|--------|
| `open` | Open IDE / project | No |
| `islogin` | Check login | No |
| `login` | Trigger login | No |
| `close` | Close project | No |
| `quit` | Quit IDE | No |
| **`auto`** | **Enable automation mode** | **Yes** |
| `auto-replay` | Replay automation | Yes |
| `preview` | Preview | Yes |
| `auto-preview` | Auto preview | Yes |
| `upload` | Upload code | Yes |
| `build-npm` | Build npm | Yes |
| `cache` | Clean cache | No |
| `reset-fileutils` | Reset file watcher | No |
| `open-other` | Open other project | No |
| `cloud` | CloudBase ops | Yes |
| `build-ipa` / `build-apk` | Native builds | Yes |

### Finding the CLI

| Platform | Typical paths |
|----------|--------------|
| Windows | `D:/微信小程序/微信web开发者工具/cli.bat`, `C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat` |
| macOS | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |

Search fallback: `find "C:/" -maxdepth 4 -name "cli.bat" 2>/dev/null`

---

## Appendix C: miniprogram-automator Reference

### Setup

```bash
cd <project-root>
npm install miniprogram-automator --save-dev
```

### Enable Automation (each session, after login)

```bash
cli.bat auto --project "<path>" --auto-port 9420
# Expected output:
# ✔ IDE server has started, listening on http://127.0.0.1:<port>
# ✔ Using AppID: <appid>
# ✔ auto
```

### Connect & API

```js
const automator = require('miniprogram-automator');

// Connect
const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:<auto-port>' });

// Events (use .on(), NOT .onConsoleLog/.onConsoleError in newer versions)
mp.on('console', (log) => {
  // log.type: 'log'|'warn'|'error'|'info'
  // log.args: [{value, description}, ...]
});
mp.on('exception', (err) => { /* err.exception.description */ });
mp.on('pageChange', (data) => { /* data.path */ });

// Page operations
await mp.currentPage()           // → { path, data }
await mp.pageStack()             // → [{path, data}, ...]
await mp.systemInfo()            // → { platform, version, SDKVersion, model }
await mp.switchTab('/pages/x')   // tab bar pages
await mp.navigateTo('/pages/x')  // sub pages (needs ?params for some pages)
await mp.navigateBack()
await mp.reLaunch('/pages/x')
await mp.redirectTo('/pages/x')

// Code evaluation
await mp.evaluate(() => getApp().globalData)
await mp.callWxMethod('getSystemInfo')
await mp.callWxMethod('getStorage', { key: 'logs' })

// Visual
await mp.screenshot({ path: '/tmp/screenshot.png' })

// Cleanup
await mp.close()
```

---

## Appendix D: Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `code 10: 需要重新登录` | IDE not logged in | Gate: tell user to scan QR in IDE popup, wait for "yes" |
| `Port N is in use` | Stale automation session | Use different port: `--auto-port 9421` |
| `Failed connecting to ws://...` | Automation not enabled | Run `cli.bat auto --project ...` first |
| `code 31: 缺失参数` | Wrong query param name | `/v2/open` uses `projectpath`, others use `project` |
| `onConsoleLog is not a function` | API renamed in newer automator | Use `mp.on('console', fn)` |
| `navigateTo` timeout | Tab page or missing params | Use `switchTab` for tabs; check page needs `?id=xxx` |
| `cliPath is not correct` | Path doesn't end in `.bat` on Windows | Ensure path ends with `cli.bat`, not `.exe` |
| IDE service port not responding | Port not enabled | Settings → Security → Enable service port |