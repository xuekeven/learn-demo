# Help Fix Bug

一个 Cursor Agent Skill，帮助开发者**系统性地排查、分析、修复 Bug**，并自动生成结构化的修复报告。

## 工作流

```
了解 Bug → 分析 Bug → 修复 Bug → 总结 Bug
```

| 步骤 | 文档 | 说明 |
|------|------|------|
| 1. 了解 Bug | `prompts/comprehend.md` | 向用户收集代码基线、出现时间、Bug 描述 |
| 2. 分析 Bug | `prompts/analyze.md` | 新建修复分支，获取报告链接内容，系统分析根因 |
| 3. 修复 Bug | `prompts/fix.md` | 提供多方案对比，修改代码，等待用户验证 |
| 4. 总结 Bug | `prompts/summarize.md` | 生成结构化修复报告（可写入文件留档） |

## 触发方式

在 Cursor 对话中，以以下任一方式触发：

```
/help-fix <描述或链接>
/help-fix https://jira.example.com/browse/XX-1234
帮我看看这个 bug，批量导出会卡住
帮忙排查一下 https://zentao.example.com/zentao/bug-view-100.html
看下这个报错 https://fe-monitor.example.com/issues/500
```

若只要解释概念、不排查代码，Skill 不会自动启动。

## 支持的报告链接类型

| 类型 | URL 格式 |
|------|---------|
| 禅道 | `https://zentao.jiandan100.cn/zentao/bug-view-*.html` |
| Jira | `https://jira.jiandan100.cn/jira/browse/JDRW-*` |
| 前端监控 | `https://fe-monitor.jd100.com/easytech/issues/*?project=*` |

## 工具（`tools/`）

tools 目录下只有 `.mjs` 脚本，不含其他配置文件（依赖统一在本目录的 `package.json` 中）。

### `tools/create-branch.mjs`

从指定 Git 基线（分支 / tag / commit）创建修复分支，分支名自动按 `fix-YYMMDD-HHmm` 格式生成。

```bash
# 在目标仓库根目录运行
node path/to/help-fix-bug/tools/create-branch.mjs --base main
node path/to/help-fix-bug/tools/create-branch.mjs --base v1.2.5 --dry-run
node path/to/help-fix-bug/tools/create-branch.mjs --help
```

### `tools/get-link-content.mjs`

用 **Playwright** 抓取报告链接页面内容，并保存 HTML / MHTML / PNG 文件供 AI 分析或人工核对。

对于禅道的壳页式页面，脚本会优先抓运行中的 iframe 内页：`--html` 保存 iframe DOM 并把页面内图片下载到同名 `.assets/` 目录，`--screenshot` 保存 iframe 画面，`--mhtml` 暂不支持并会打印提示跳过。

**自动登录检测**：

1. 先以**无头**模式访问 URL（复用持久化登录态）
2. 若检测到登录页（URL/标题/密码框）→ 弹出**有头**浏览器，用户完成登录后按 Enter
3. 关闭有头浏览器（登录 Cookie 已写入 `userDataDir`），**无头**重新抓取

```bash
# 在 help-fix-bug/ 目录下运行（已 npm install）
node tools/get-link-content.mjs --url "https://jira.example.com/browse/XX-1"
node tools/get-link-content.mjs "https://zentao.example.com/zentao/bug-view-1.html" --mhtml --screenshot
node tools/get-link-content.mjs "https://zentao.example.com/zentao/bug-view-1.html" --out /tmp/issue
node tools/get-link-content.mjs --help
```

常用参数：

| 参数 | 说明 |
|------|------|
| `--html` | 保存 HTML 快照；默认启用。禅道页面会额外下载图片到同名 `.assets/` 目录 |
| `--mhtml` | 保存 MHTML 快照；禅道页面暂不支持，会打印提示并跳过 |
| `--screenshot` | 保存整页 PNG 截图 |
| `--out <stem>` | 指定输出前缀；脚本会自动追加 `.html` / `.mhtml` / `.png` |
| `--wait-until <event>` | `page.goto` 等待事件，默认 `domcontentloaded` |
| `--headed` | 始终有头模式（手动操作后按 Enter 再抓取） |
| `--headless` | 始终无头，跳过登录检测 |
| `--extra-wait-ms <n>` | 导航后额外等待（适合懒加载 SPA） |
| `GCL_EXECUTABLE_PATH` | 环境变量：覆盖浏览器可执行文件路径 |
| `GCL_USER_DATA_DIR` | 环境变量：登录态持久化目录，默认 `~/.get-link-content-profile` |

## 安装（首次使用）

工具脚本依赖 `playwright`，需先在本目录安装依赖：

```bash
cd help-fix-bug
npm install
```

## 目录结构

```
help-fix-bug/
├── SKILL.md                 # Cursor Skill 入口（触发条件、工作流索引）
├── README.md                # 本文件
├── package.json             # Node 依赖（playwright）
├── prompts/
│   ├── comprehend.md        # 步骤 1：了解 Bug
│   ├── analyze.md           # 步骤 2：分析 Bug
│   ├── fix.md               # 步骤 3：修复 Bug
│   └── summarize.md         # 步骤 4：总结 Bug
└── tools/
    ├── create-branch.mjs    # 创建修复分支
    └── get-link-content.mjs # 抓取报告链接内容
```

## 安全注意事项

- 不在仓库中存储账号密码、Cookie、API Token
- `get-link-content.mjs` 的登录态仅落在本机 `userDataDir`（默认 `~/.get-link-content-profile`）
- 含内网地址或业务细节的抓取结果（如 `/tmp/issue.html`、`/tmp/issue.mhtml`）**不要提交到公开仓库**
