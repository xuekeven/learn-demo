#!/usr/bin/env node
/**
 * 使用 Puppeteer 启动本机 Chrome 系/Edge/内置 Chromium；在 macOS 上优先使用
 * /Applications/Google Chrome for Testing.app/.../「Google Chrome for Testing」。
 * 通过持久化 userDataDir 复用登录态。可选 --use-connect 连接远程调试实例。
 * 密码勿写入仓库；可用 --wait-stdin 在登录后由终端确认。
 */
import process from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import puppeteer from "puppeteer";

const DEFAULT_BROWSER_URL = "http://127.0.0.1:9222";
const DEFAULT_USER_DATA_NAME = ".get-link-content-profile";

/** 与 /Applications 下「Google Chrome for Testing」官方安装结构一致 */
const MAC_CHROME_FOR_TESTING = join(
  "/Applications",
  "Google Chrome for Testing.app",
  "Contents",
  "MacOS",
  "Google Chrome for Testing"
);
const MAC_CHROME_STABLE = join(
  "/Applications",
  "Google Chrome.app",
  "Contents",
  "MacOS",
  "Google Chrome"
);
const WIN_CHROME_FOR_TESTING = join(
  "C:\\Program Files",
  "Google",
  "Chrome for Testing",
  "Application",
  "chrome.exe"
);
const WIN_CHROME_FOR_TESTING_X86 = join(
  "C:\\Program Files (x86)",
  "Google",
  "Chrome for Testing",
  "Application",
  "chrome.exe"
);
const MAX_HTML_CHARS = 800_000;
const MAX_TEXT_CHARS = 400_000;

function parseArgs(argv) {
  const out = {
    url: null,
    mode: "launch",
    browserUrl: process.env.PUPPETEER_BROWSER_URL || DEFAULT_BROWSER_URL,
    userDataDir: process.env.GCL_USER_DATA_DIR || join(homedir(), DEFAULT_USER_DATA_NAME),
    channel: process.env.GCL_CHANNEL || "chrome",
    outPath: null,
    format: "json",
    waitUntil: "networkidle0",
    timeoutMs: 60_000,
    extraWaitMs: 0,
    headless: false,
    waitStdin: false,
    noChannelFallback: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--url" && argv[i + 1]) {
      out.url = argv[++i];
    } else if (a === "--use-connect") out.mode = "connect";
    else if (a === "--browser-url" && argv[i + 1]) {
      out.browserUrl = argv[++i];
    } else if (a === "--user-data-dir" && argv[i + 1]) {
      out.userDataDir = argv[++i];
    } else if (a === "--channel" && argv[i + 1]) {
      out.channel = argv[++i];
    } else if (a === "--no-channel") {
      out.noChannelFallback = true;
    } else if (a === "--headless") {
      out.headless = true;
    } else if (a === "--wait-stdin") {
      out.waitStdin = true;
    } else if (a === "--out" && argv[i + 1]) {
      out.outPath = argv[++i];
    } else if (a === "--format" && argv[i + 1]) {
      out.format = argv[++i];
    } else if (a === "--wait-until" && argv[i + 1]) {
      out.waitUntil = argv[++i];
    } else if (a === "--timeout-ms" && argv[i + 1]) {
      out.timeoutMs = Number(argv[++i]);
    } else if (a === "--extra-wait-ms" && argv[i + 1]) {
      out.extraWaitMs = Number(argv[++i]);
    } else if (!a.startsWith("-") && !out.url) {
      out.url = a;
    }
  }
  return out;
}

function printHelp() {
  const msg = `用法:
  node get-link-content.mjs --url <页面URL>
  node get-link-content.mjs <页面URL>

主流程（默认）：Puppeteer 用独立用户数据目录启动浏览器。macOS 上优先用
  /Applications/Google Chrome for Testing.app/.../「Google Chrome for Testing」；
  无则再试稳定版 Google Chrome、再按 channel、最后为 Puppeteer 内置 Chromium。
  （与系统「默认浏览器」设置无关。）

环境变量:
  PUPPETEER_BROWSER_URL     仅 --use-connect 时：远程调试地址，默认 ${DEFAULT_BROWSER_URL}
  GCL_USER_DATA_DIR         非 connect 时：用户数据目录，默认 ~/ ${DEFAULT_USER_DATA_NAME}
  GCL_CHANNEL                非 connect 时：msedge 走 Edge；chromium/配合 --no-channel 走内置 Chromium
  PUPPETEER_EXECUTABLE_PATH  指定可执行文件，覆盖以下自动探测

参数:
  --use-connect             改为连接本机已开启的远程调试（旧方案），不启动新进程
  --browser-url <url>        同 PUPPETEER_BROWSER_URL
  --user-data-dir <path>   独立 profile 路径（勿与正在日常使用的同一路径同时占用）
  --channel <name>         chrome | msedge | chromium；chromium=使用 Puppeteer 自带浏览器
  --no-channel             不指定 channel，由 Puppeteer 使用内置 Chromium
  --headless                无头（登录页/验证码场景通常需关闭无头，首次登录用有头窗口）
  --wait-stdin              打开页面后暂停，在终端按 Enter 再继续抓取（适合先手动登录/过 MFA）
  --out <file>             输出文件；缺省为 stdout
  --format json|text|html
  --wait-until load|domcontentloaded|networkidle0|networkidle2
  --timeout-ms <n>         导航超时
  --extra-wait-ms <n>      导航后额外等待（SPA）
`;
  process.stderr.write(msg);
}

function truncate(s, max) {
  if (s.length <= max) return { value: s, truncated: false };
  return { value: s.slice(0, max), truncated: true };
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question("登录或验证完成后请按 Enter 继续…\n", () => {
      rl.close();
      resolve();
    });
  });
}

function pickPreferredChromePath() {
  const { platform } = process;
  if (platform === "darwin") {
    if (existsSync(MAC_CHROME_FOR_TESTING)) return MAC_CHROME_FOR_TESTING;
    if (existsSync(MAC_CHROME_STABLE)) return MAC_CHROME_STABLE;
  } else if (platform === "win32") {
    if (existsSync(WIN_CHROME_FOR_TESTING)) return WIN_CHROME_FOR_TESTING;
    if (existsSync(WIN_CHROME_FOR_TESTING_X86)) return WIN_CHROME_FOR_TESTING_X86;
  } else if (platform === "linux") {
    const candidates = [
      "/opt/google/chrome-for-testing/chrome",
      "/usr/bin/google-chrome-for-testing",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function buildLaunchOptions(opts) {
  const base = {
    userDataDir: opts.userDataDir,
    headless: opts.headless,
    defaultViewport: null,
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      config: { ...base, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH },
      summary: { kind: "executable", path: process.env.PUPPETEER_EXECUTABLE_PATH, source: "PUPPETEER_EXECUTABLE_PATH" },
    };
  }
  if (opts.noChannelFallback || opts.channel === "chromium") {
    return { config: { ...base }, summary: { kind: "bundled" } };
  }
  if (opts.channel === "msedge") {
    return { config: { ...base, channel: "msedge" }, summary: { kind: "channel", channel: "msedge" } };
  }
  const chromePath = pickPreferredChromePath();
  if (chromePath) {
    const label = chromePath.includes("Chrome for Testing") || chromePath.includes("chrome-for-testing")
      ? "google-chrome-for-testing"
      : "google-chrome-stable";
    return { config: { ...base, executablePath: chromePath }, summary: { kind: "executable", path: chromePath, label } };
  }
  return { config: { ...base, channel: "chrome" }, summary: { kind: "channel", channel: "chrome" } };
}

async function connectOrLaunch(opts) {
  if (opts.mode === "connect") {
    const browser = await puppeteer.connect({
      browserURL: opts.browserUrl,
      defaultViewport: null,
    });
    return {
      browser,
      summary: { mode: "connect", browserUrl: opts.browserUrl },
    };
  }
  const { config, summary } = buildLaunchOptions(opts);
  try {
    const browser = await puppeteer.launch(config);
    return { browser, summary: { mode: "launch", userDataDir: opts.userDataDir, ...summary } };
  } catch (e) {
    if (config.executablePath) {
      process.stderr.write(
        `使用指定/探测到的 Chrome 路径启动失败: ${e?.message || e}\n` +
          `将尝试 channel=google-chrome 再试；仍失败则使用 Puppeteer 内置 Chromium。\n`
      );
      const second = {
        userDataDir: config.userDataDir,
        headless: config.headless,
        defaultViewport: null,
        channel: "chrome",
      };
      try {
        const browser = await puppeteer.launch(second);
        return {
          browser,
          summary: {
            mode: "launch",
            userDataDir: opts.userDataDir,
            ...summary,
            fallback: "puppeteer-channel-chrome",
          },
        };
      } catch (e2) {
        const third = {
          userDataDir: config.userDataDir,
          headless: config.headless,
          defaultViewport: null,
        };
        const browser = await puppeteer.launch(third);
        return {
          browser,
          summary: { mode: "launch", userDataDir: opts.userDataDir, fallback: "bundled-chromium" },
        };
      }
    }
    if (config.channel) {
      process.stderr.write(
        `用 channel=${config.channel} 启动失败: ${e?.message || e}\n改试内置 Chromium…\n`
      );
      const fallback = { ...config };
      delete fallback.channel;
      const browser = await puppeteer.launch(fallback);
      return {
        browser,
        summary: {
          mode: "launch",
          userDataDir: opts.userDataDir,
          originalChannel: config.channel,
          fallback: "bundled-chromium",
        },
      };
    }
    throw e;
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  if (!opts.url) {
    printHelp();
    process.exit(1);
  }

  if (!/^https?:\/\//i.test(opts.url)) {
    process.stderr.write("error: --url 必须是 http(s) 完整地址\n");
    process.exit(1);
  }

  if (!["json", "text", "html"].includes(opts.format)) {
    process.stderr.write("error: --format 只支持 json|text|html\n");
    process.exit(1);
  }

  const waitUntilOption = [
    "load",
    "domcontentloaded",
    "networkidle0",
    "networkidle2",
  ].includes(opts.waitUntil)
    ? opts.waitUntil
    : "networkidle0";

  let browser;
  let browserInfo;
  try {
    const r = await connectOrLaunch(opts);
    browser = r.browser;
    browserInfo = r.summary;
  } catch (e) {
    if (opts.mode === "connect") {
      process.stderr.write(
        `无法连接到 ${opts.browserUrl}。请确保已用远程调试方式启动 Chrome，或去掉 --use-connect 走本机启动模式。\n` +
          `原因: ${e?.message || e}\n`
      );
    } else {
      process.stderr.write(`启动浏览器失败: ${e?.message || e}\n`);
    }
    process.exit(2);
  }

  const page = await browser.newPage();
  let finalUrl = opts.url;
  let title = "";
  let textContent = "";
  let html = "";

  try {
    await page.goto(opts.url, {
      waitUntil: waitUntilOption,
      timeout: opts.timeoutMs,
    });
    if (opts.extraWaitMs > 0) {
      await new Promise((r) => setTimeout(r, opts.extraWaitMs));
    }
    if (opts.waitStdin) {
      process.stderr.write(
        "如页面需登录/二次验证，请在已弹出的浏览器窗口中完成。然后回到本终端按提示继续。\n"
      );
      await waitForEnter();
    }
    finalUrl = page.url();
    title = await page.title();
    const bodyText = await page.evaluate(
      () => document.body && document.body.innerText
    );
    const bodyHtml = await page.evaluate(
      () => document.documentElement && document.documentElement.outerHTML
    );
    textContent = bodyText || "";
    html = bodyHtml || "";
  } finally {
    await page.close().catch(() => {});
    if (opts.mode === "connect") {
      await browser.disconnect().catch(() => {});
    } else {
      await browser.close().catch(() => {});
    }
  }

  const tText = truncate(textContent, MAX_TEXT_CHARS);
  const tHtml = truncate(html, MAX_HTML_CHARS);

  const payload = {
    ok: true,
    browser: browserInfo,
    requestedUrl: opts.url,
    finalUrl,
    title,
    textContent: tText.value,
    textTruncated: tText.truncated,
    html: tHtml.value,
    htmlTruncated: tHtml.truncated,
    note:
      "Puppeteer 仅驱动 Chrome 系/内置 Chromium，不等同于系统「默认浏览器」设置；登录态由 user-data-dir 持久化，密码勿写入 git。",
  };

  let body;
  if (opts.format === "text") {
    body = payload.textContent;
  } else if (opts.format === "html") {
    body = payload.html;
  } else {
    body = JSON.stringify(payload, null, 2);
  }

  if (opts.outPath) {
    writeFileSync(opts.outPath, body, "utf8");
    process.stdout.write(`已写入: ${opts.outPath}\n`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith("\n")) process.stdout.write("\n");
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(3);
});
