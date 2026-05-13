# get-link-content

用 **Puppeteer** 启动本机 **Chrome 系**浏览器（在 **macOS** 上**默认**使用 `/Applications` 下 **Google Chrome for Testing** 可执行文件），在固定 `userDataDir` 中持久化 Cookie/登录态，再打开目标链接，导出 **innerText** 与 **outerHTML** 供 AI 分析。失败时会依次回退到稳定版 **Google Chrome**、Puppeteer 的 `channel=chrome`、最后 **Puppeteer 自带 Chromium**。

## 默认用哪个 Chrome？

- **macOS**：若存在 `Google Chrome for Testing.app`（路径见下）则**始终优先**使用其中的 `Contents/MacOS/Google Chrome for Testing`；否则若安装了稳定版，则用 `Google Chrome.app/.../Google Chrome`；都没有再走 Puppeteer 渠道或内置 Chromium。  
- **Windows**：若存在 `C:\Program Files\Google\Chrome for Testing\Application\chrome.exe`（及 x86 目录）则优先。  
- **Linux**：尝试常见路径（如 `/opt/google/chrome-for-testing/chrome` 等）。  

可直接覆盖可执行文件：

- 环境变量 **`PUPPETEER_EXECUTABLE_PATH`**（推荐用于自定义路径、CI）。

## 安装

```bash
cd help-fix-bug/tools/get-link-content
npm install
```

## 最简用法

首次进需登录的页面时**不要**加 `--headless`；有验证码/MFA 时加 `--wait-stdin`，在浏览器里操作完回到终端**按 Enter** 再继续抓取。

```bash
node get-link-content.mjs --url "https://jira.jiandan100.cn/jira/browse/JDRW-129237" --wait-stdin --out /Users/kai/Desktop/code/repos/learn-demo/help-fix-bug/testRes/JDRW-129237.json
```

只导出可读文本：

```bash
node get-link-content.mjs "https://zentao.example.com/bug-view-1.html" --format text
```

## 远程调试（`--use-connect`）时请用同一路径的 Chrome

若你**自己**先启动一个带 **9222** 的 Chrome，需使用 **Chrome for Testing** 的可执行文件，例如 **macOS**：

```bash
"/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-remote-debug"
```

再运行（另一终端）：

```bash
node get-link-content.mjs --use-connect --url "https://…"
```

## 常用参数

| 参数 / 环境变量 | 说明 |
|-----------------|------|
| `PUPPETEER_EXECUTABLE_PATH` | 覆盖上述自动探测的浏览器路径 |
| `--user-data-dir` / `GCL_USER_DATA_DIR` | 独立用户数据目录，勿与**正在运行**的主 Chrome 共用同一 profile |
| `--channel msedge` / `GCL_CHANNEL=msedge` | 使用本机 **Edge**（不走路径探测里的 Chrome for Testing） |
| `--channel chromium` 或 `--no-channel` | 使用 **Puppeteer 自带 Chromium** |
| `--use-connect` | 连接已开启远程调试的实例 |
| `--headless` | 无头（仅适合已无需交互登录的页） |
| `--wait-stdin` | 打开 URL 后暂停，终端确认后再导出 |

## 安全

- 勿在仓库中保存**账号密码**、Cookie 导出。含内网或隐私的 `json` **勿**推送到公开远程。
