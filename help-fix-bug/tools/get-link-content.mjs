#!/usr/bin/env node
/**
 * get-link-content.mjs
 * 使用 Playwright 抓取目标 URL（等待页面网络稳定后），将结果保存到
 * ~/.get-link-content-res/<文件名>，供 AI 通过 Read 工具分析 Bug。
 *
 * ── 支持三种保存格式（可任意组合，默认仅保存 HTML） ──
 *   --html        HTML 快照（.html）—— 体积小，AI 读取分析用，默认开启
 *   --mhtml       MHTML 快照（.mhtml）—— 内嵌 CSS/图片，本地打开与原页面视觉一致
 *   --screenshot  全页截图（.png）—— 直观，适合视觉核对
 *   示例：--mhtml --screenshot（同时保存 mhtml 和 png，不保存 html）
 *
 * ── 浏览器选用顺序（自动探测，可用 --browser 覆盖） ──
 *   1. Google Chrome for Testing（本机路径探测）
 *   2. Google Chrome 稳定版（本机路径探测）
 *   3. Chrome channel（Playwright 自主寻找）
 *   4. Microsoft Edge channel（Windows 系统 Edge）
 *   5. Playwright 内置 Chromium（兜底）
 *   注：Playwright 只能自动化 Chromium 系浏览器。
 *
 * ── 自动登录检测 ──
 *   1. 先以无头模式访问 URL（复用 userDataDir 中持久化的登录态）
 *   2. 若检测到登录页 → 弹出有头浏览器 → 用户登录后按 Enter
 *   3. 无头重新抓取
 *
 * ── 输出文件命名（--out 未指定时自动推导） ──
 *   禅道  .../bug-view-59554.html  → bug-view-59554.{html,mhtml,png}
 *   Jira  .../browse/JDRW-129337  → JDRW-129337.{html,mhtml,png}
 *   监控  .../issues/24150        → issues-24150.{html,mhtml,png}
 *
 * 用法：
 *   node tools/get-link-content.mjs <URL>
 *   node tools/get-link-content.mjs <URL> --html --mhtml --screenshot
 *   node tools/get-link-content.mjs <URL> --html --screenshot --out /tmp/my-bug
 */
import process from "node:process";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { chromium } from "playwright";

// ─── 常量 ────────────────────────────────────────────────────────────────────

const DEFAULT_USER_DATA_DIR = join(homedir(), ".get-link-content-profile");
const DEFAULT_RES_DIR       = join(homedir(), ".get-link-content-res");

/** Chrome for Testing 可执行文件 —— 各平台 */
const CHROME_FOR_TESTING = {
  darwin: "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  win32:  ["C:\\Program Files\\Google\\Chrome for Testing\\Application\\chrome.exe",
           "C:\\Program Files (x86)\\Google\\Chrome for Testing\\Application\\chrome.exe"],
  linux:  ["/opt/google/chrome-for-testing/chrome", "/usr/bin/google-chrome-for-testing"],
};

/** Chrome 稳定版可执行文件 —— 各平台 */
const CHROME_STABLE = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  win32:  ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
           "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"],
  linux:  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"],
};

/** 登录页检测：URL 含登录关键字 */
const LOGIN_URL_RE   = /[/?=&](login|signin|sign[-_]in|auth|sso|passport|oauth|cas|account)/i;
/** 登录页检测：页面标题含登录关键字 */
const LOGIN_TITLE_RE = /登[录陆]|login|sign[\s-]*in/i;

// ─── 浏览器探测 ───────────────────────────────────────────────────────────────

function findFirst(paths) {
  const arr = Array.isArray(paths) ? paths : [paths];
  return arr.find(p => existsSync(p)) ?? null;
}

/**
 * 解析 --browser 参数或自动探测，返回传给 launchPersistentContext 的候选配置列表。
 * 每项为 { executablePath?, channel?, _label }，由 launchContext 依次尝试。
 *
 * --browser 支持：
 *   /绝对/路径          直接作为 executablePath
 *   chrome-for-testing  强制使用 Chrome for Testing
 *   chrome              强制使用 Chrome 稳定版（失败则 channel=chrome）
 *   edge | msedge       channel=msedge
 *   chromium            Playwright 内置 Chromium
 */
function resolveBrowserCandidates(browserArg) {
  const env = process.env.GCL_EXECUTABLE_PATH;
  if (env) return [{ executablePath: env, _label: `env: ${env}` }];

  if (browserArg) {
    const b = browserArg.trim();
    if (b.startsWith("/") || /^[A-Za-z]:\\/.test(b)) {
      return [{ executablePath: b, _label: b }];
    }
    switch (b.toLowerCase()) {
      case "chrome-for-testing": {
        const p = findFirst(CHROME_FOR_TESTING[process.platform] ?? []);
        if (!p) throw new Error(`未找到 Google Chrome for Testing（平台：${process.platform}）`);
        return [{ executablePath: p, _label: "Chrome for Testing" }];
      }
      case "chrome": {
        const p = findFirst(CHROME_STABLE[process.platform] ?? []);
        return p
          ? [{ executablePath: p, _label: "Chrome Stable" }]
          : [{ channel: "chrome", _label: "Chrome (channel)" }];
      }
      case "edge":
      case "msedge":
        return [{ channel: "msedge", _label: "Edge" }];
      case "chromium":
        return [{ _label: "Playwright bundled Chromium" }];
      default:
        throw new Error(
          `未知 --browser 值：${b}\n支持：chrome-for-testing | chrome | edge | chromium | 绝对路径`
        );
    }
  }

  // 自动探测候选（依次尝试，失败则下一个）
  const candidates = [];
  const p = process.platform;

  const cft = findFirst(CHROME_FOR_TESTING[p] ?? []);
  if (cft) candidates.push({ executablePath: cft, _label: "Chrome for Testing" });

  const cs = findFirst(CHROME_STABLE[p] ?? []);
  if (cs) candidates.push({ executablePath: cs, _label: "Chrome Stable" });

  candidates.push({ channel: "chrome",  _label: "Chrome (channel)" });
  candidates.push({ channel: "msedge",  _label: "Edge (channel)" });
  candidates.push({ _label: "Playwright bundled Chromium" });

  return candidates;
}

/**
 * 按候选列表依次尝试启动 Playwright 持久化上下文，返回第一个成功的。
 */
async function launchContext(userDataDir, headless, candidates) {
  const baseArgs = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
  ];
  let lastErr;
  for (const { _label, ...config } of candidates) {
    try {
      const ctx = await chromium.launchPersistentContext(userDataDir, {
        headless,
        ...config,
        args: baseArgs,
        ignoreHTTPSErrors: true,
      });
      if (_label) process.stderr.write(`使用浏览器：${_label}\n`);
      return ctx;
    } catch (e) {
      if (_label) process.stderr.write(`${_label} 不可用，尝试下一个…\n`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("所有浏览器候选均启动失败");
}

// ─── 文件命名 ──────────────────────────────────────────────────────────────────

/**
 * 从 URL 推导输出文件的基名（stem，不含扩展名）。
 *
 * 示例：
 *   .../zentao/bug-view-59554.html  → bug-view-59554
 *   .../jira/browse/JDRW-129337    → JDRW-129337
 *   .../issues/24150?project=10    → issues-24150
 * 规则：取路径末尾有意义的段；末段若为纯数字则拼上倒数第二段。
 */
function urlToStem(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return `page-${Date.now()}`; }

  const segs = u.pathname
    .split("/")
    .filter(Boolean)
    .map(s => s.replace(/\.html$/i, ""));

  if (segs.length === 0) return sanitize(u.hostname);

  const last = segs[segs.length - 1];
  const base =
    /^\d+$/.test(last) && segs.length >= 2
      ? segs[segs.length - 2] + "-" + last
      : last;

  return sanitize(base);
}

function sanitize(s) {
  return s
    .replace(/[^a-zA-Z0-9\-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── 登录检测 ─────────────────────────────────────────────────────────────────

async function detectLoginPage(page) {
  const url = page.url();
  if (LOGIN_URL_RE.test(url)) return true;

  const title = await page.title().catch(() => "");
  if (LOGIN_TITLE_RE.test(title)) return true;

  const pwdCount = await page
    .locator('input[type="password"]')
    .count()
    .catch(() => 0);
  return pwdCount > 0;
}

// ─── 核心：打开页面，把 page 传给 callback ────────────────────────────────────

function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 处理自动登录检测，最终把稳定的 page 传给 callback，返回 callback 的结果。
 * 无论成功或失败，context 都会在 callback 完成后关闭。
 */
async function withPage(url, userDataDir, candidates, opts, callback) {
  const {
    waitUntil    = "networkidle",
    timeoutMs    = 60_000,
    extraWaitMs  = 0,
    forceHeaded  = false,
    forceHeadless = false,
  } = opts;
  const gotoOpts = { waitUntil, timeout: timeoutMs };

  // ── 强制有头 ──
  if (forceHeaded) {
    process.stderr.write("以有头模式打开浏览器，操作完成后按 Enter 继续…\n");
    const ctx = await launchContext(userDataDir, false, candidates);
    try {
      const page = await ctx.newPage();
      await page.goto(url, gotoOpts);
      if (extraWaitMs > 0) await sleep(extraWaitMs);
      await waitForEnter("操作完成后按 Enter 开始保存…\n");
      return await callback(page);
    } finally { await ctx.close().catch(() => {}); }
  }

  // ── 第一步：无头尝试 ──
  {
    const ctx = await launchContext(userDataDir, true, candidates);
    let needLogin = false;
    try {
      const page = await ctx.newPage();
      await page.goto(url, gotoOpts);
      if (extraWaitMs > 0) await sleep(extraWaitMs);

      if (forceHeadless) return await callback(page);

      needLogin = await detectLoginPage(page);
      if (!needLogin) return await callback(page);
    } finally { await ctx.close().catch(() => {}); }

    // ── 第二步：检测到登录页 → 弹出有头浏览器 ──
    process.stderr.write(
      "\n检测到当前页面需要登录，正在打开有头浏览器…\n" +
      "请在弹出的窗口中完成登录操作。\n"
    );
    const headedCtx = await launchContext(userDataDir, false, candidates);
    try {
      const page = await headedCtx.newPage();
      await page.goto(url, { ...gotoOpts, timeout: timeoutMs * 2 }).catch(() => {});
      await waitForEnter("\n登录完成后按 Enter，脚本将无头重新抓取…\n");
    } finally { await headedCtx.close().catch(() => {}); }

    // ── 第三步：无头重试 ──
    process.stderr.write("正在以无头模式重新抓取目标页面…\n");
    const ctx2 = await launchContext(userDataDir, true, candidates);
    try {
      const page = await ctx2.newPage();
      await page.goto(url, gotoOpts);
      if (extraWaitMs > 0) await sleep(extraWaitMs);
      if (await detectLoginPage(page)) {
        throw new Error("登录后仍检测到登录页，请确认登录成功后重试。");
      }
      return await callback(page);
    } finally { await ctx2.close().catch(() => {}); }
  }
}

// ─── 保存各格式 ───────────────────────────────────────────────────────────────

/**
 * 将 page 按指定格式列表保存，返回已保存文件路径数组。
 *
 * @param {import('playwright').Page} page
 * @param {string}   stem    输出路径（不含扩展名），如 /home/user/.get-link-content-res/JDRW-129337
 * @param {string[]} formats 格式列表，取值：'html' | 'mhtml' | 'screenshot'
 */
async function saveFormats(page, stem, formats) {
  const saved = [];

  for (const fmt of formats) {
    switch (fmt) {
      case "html": {
        const html = await page.content();
        const path = stem + ".html";
        writeFileSync(path, html, "utf8");
        saved.push({ fmt, path, size: html.length });
        break;
      }
      case "mhtml": {
        // CDP Page.captureSnapshot 内嵌所有 CSS/图片，本地打开与原页面视觉一致
        const cdp = await page.context().newCDPSession(page);
        const { data } = await cdp.send("Page.captureSnapshot", { format: "mhtml" });
        const path = stem + ".mhtml";
        writeFileSync(path, data, "utf8");
        saved.push({ fmt, path, size: data.length });
        break;
      }
      case "screenshot": {
        const path = stem + ".png";
        await page.screenshot({ path, fullPage: true, type: "png" });
        saved.push({ fmt, path, size: -1 });   // size 由 fs.stat 获取，此处略
        break;
      }
    }
  }

  return saved;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    url:           null,
    browser:       null,
    userDataDir:   process.env.GCL_USER_DATA_DIR || DEFAULT_USER_DATA_DIR,
    resDir:        process.env.GCL_RES_DIR       || DEFAULT_RES_DIR,
    outStem:       null,       // --out 指定输出路径/前缀（不含扩展名）
    // 格式标志（三者可任意组合；均未指定时默认 html=true）
    fmtHtml:       false,
    fmtMhtml:      false,
    fmtScreenshot: false,
    // 页面加载选项
    waitUntil:     "networkidle",
    timeoutMs:     60_000,
    extraWaitMs:   0,
    forceHeaded:   false,
    forceHeadless: false,
    help:          false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if      (a === "-h" || a === "--help")           opts.help          = true;
    else if (a === "--url"           && argv[i + 1]) opts.url           = argv[++i];
    else if (a === "--browser"       && argv[i + 1]) opts.browser       = argv[++i];
    else if (a === "--user-data-dir" && argv[i + 1]) opts.userDataDir   = argv[++i];
    else if (a === "--res-dir"       && argv[i + 1]) opts.resDir        = argv[++i];
    else if (a === "--out"           && argv[i + 1]) opts.outStem       = argv[++i];
    else if (a === "--html")                         opts.fmtHtml       = true;
    else if (a === "--mhtml")                        opts.fmtMhtml      = true;
    else if (a === "--screenshot")                   opts.fmtScreenshot = true;
    else if (a === "--wait-until"    && argv[i + 1]) opts.waitUntil     = argv[++i];
    else if (a === "--timeout-ms"    && argv[i + 1]) opts.timeoutMs     = Number(argv[++i]);
    else if (a === "--extra-wait-ms" && argv[i + 1]) opts.extraWaitMs   = Number(argv[++i]);
    else if (a === "--headed")                        opts.forceHeaded   = true;
    else if (a === "--headless")                      opts.forceHeadless = true;
    else if (!a.startsWith("-") && !opts.url)         opts.url           = a;
  }

  return opts;
}

function printHelp() {
  process.stderr.write(`
用法:
  node tools/get-link-content.mjs <URL>                         # 默认保存 HTML
  node tools/get-link-content.mjs <URL> --mhtml --screenshot    # 保存 MHTML + 截图
  node tools/get-link-content.mjs <URL> --html --mhtml --screenshot --out /tmp/issue

格式选项（可任意组合，默认仅 --html）:
  --html          HTML 快照（.html）—— 体积小，适合 AI 读取分析
  --mhtml         MHTML 快照（.mhtml）—— 内嵌所有 CSS/图片，本地打开视觉一致
  --screenshot    全页截图（.png）—— 直观，适合视觉核对

输出:
  文件保存到 ~/.get-link-content-res/<自动命名>.<ext>，路径打印到 stdout（每行一个）。
  --out <stem>  指定输出路径前缀（不含扩展名）；格式扩展名自动追加。
    示例：--out /tmp/JDRW-129337 → /tmp/JDRW-129337.html  /tmp/JDRW-129337.png

浏览器选用顺序（未指定 --browser 时）:
  1. Google Chrome for Testing  2. Chrome  3. Chrome channel  4. Edge  5. 内置 Chromium

环境变量:
  GCL_EXECUTABLE_PATH   覆盖浏览器可执行文件路径（最高优先）
  GCL_USER_DATA_DIR     登录态持久化目录，默认 ~/.get-link-content-profile
  GCL_RES_DIR           保存目录，默认 ~/.get-link-content-res

其他参数:
  --browser <path|name>     指定浏览器：绝对路径 | chrome-for-testing | chrome | edge | chromium
  --user-data-dir <path>    独立 profile 目录（勿与日常正在使用的 Chrome 共用）
  --res-dir <path>          结果保存目录（覆盖 GCL_RES_DIR）
  --wait-until <event>      load | domcontentloaded | networkidle | commit（默认 networkidle）
  --timeout-ms <n>          导航超时（毫秒），默认 60000
  --extra-wait-ms <n>       导航后额外等待（毫秒），适合慢速 SPA
  --headed                  始终有头模式（手动操作后按 Enter 再保存）
  --headless                始终无头，跳过登录检测

安全:
  不在仓库中保存密码或 Cookie；登录态仅落在本机 userDataDir 目录。
  结果文件含内网/隐私内容时，勿提交到公开仓库。
`);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) { printHelp(); process.exit(0); }
  if (!opts.url)  { printHelp(); process.exit(1); }

  if (!/^https?:\/\//i.test(opts.url)) {
    process.stderr.write("error: URL 必须以 http:// 或 https:// 开头\n");
    process.exit(1);
  }

  const validWaitUntil = ["load", "domcontentloaded", "networkidle", "commit"];
  if (!validWaitUntil.includes(opts.waitUntil)) {
    process.stderr.write(`error: --wait-until 只支持 ${validWaitUntil.join(" | ")}\n`);
    process.exit(1);
  }

  // 确定要保存的格式列表
  const formats = [];
  if (opts.fmtHtml)       formats.push("html");
  if (opts.fmtMhtml)      formats.push("mhtml");
  if (opts.fmtScreenshot) formats.push("screenshot");
  if (formats.length === 0) formats.push("html");   // 默认保存 HTML

  // 解析浏览器候选
  let candidates;
  try {
    candidates = resolveBrowserCandidates(opts.browser);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }

  // 确定输出 stem
  let stem = opts.outStem;
  if (!stem) {
    // 去掉已知格式扩展名（防止用户传了 /tmp/foo.html）
    if (stem && [".html", ".mhtml", ".png"].includes(extname(stem).toLowerCase())) {
      stem = stem.slice(0, -extname(stem).length);
    }
    mkdirSync(opts.resDir, { recursive: true });
    stem = join(opts.resDir, urlToStem(opts.url));
  } else {
    // --out 指定了路径，确保父目录存在；自动剥离用户可能带的扩展名
    const ext = extname(stem).toLowerCase();
    if ([".html", ".mhtml", ".png"].includes(ext)) stem = stem.slice(0, -ext.length);
    mkdirSync(join(stem, ".."), { recursive: true });
  }

  // 抓取并保存
  let saved;
  try {
    saved = await withPage(opts.url, opts.userDataDir, candidates, {
      waitUntil:     opts.waitUntil,
      timeoutMs:     opts.timeoutMs,
      extraWaitMs:   opts.extraWaitMs,
      forceHeaded:   opts.forceHeaded,
      forceHeadless: opts.forceHeadless,
    }, async (page) => {
      const finalUrl = page.url();
      const title    = await page.title().catch(() => "");
      const results  = await saveFormats(page, stem, formats);
      return { finalUrl, title, results };
    });
  } catch (e) {
    process.stderr.write(`抓取失败: ${e?.message || e}\n`);
    process.exit(2);
  }

  // stdout：每个文件一行路径（方便 Agent 直接 Read）
  for (const { path } of saved.results) {
    process.stdout.write(path + "\n");
  }

  // stderr：摘要
  process.stderr.write(`\n最终 URL：${saved.finalUrl}\n标题：${saved.title}\n`);
  for (const { fmt, path, size } of saved.results) {
    const sizeStr = size >= 0 ? `（${(size / 1024).toFixed(0)} KB）` : "";
    process.stderr.write(`  [${fmt}] 已保存${sizeStr}: ${path}\n`);
  }
}

main().catch(e => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(3);
});
