#!/usr/bin/env node

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const BOOKMARKS_URL = "https://x.com/i/bookmarks";
const DEFAULT_DAEMON_URL = "http://localhost:19824";
const DAEMON_ENTRY = path.join(REPO_ROOT, "vendor", "bb-browser", "dist", "daemon.js");
const EXTENSION_DIR = path.join(REPO_ROOT, "vendor", "bb-browser", "extension");
const EXTRACT_SCRIPT = await fsp.readFile(path.join(REPO_ROOT, "assets", "extract_bookmarks.js"), "utf8");

class ExportError extends Error {}

function parseArgs(argv) {
  const args = {
    daemonUrl: DEFAULT_DAEMON_URL,
    outDir: null,
    maxItems: 0,
    maxScrolls: 120,
    idleRounds: 4,
    scrollPause: 1600,
    extensionWait: 25_000,
    commandTimeout: 90_000,
    bookmarkUrl: BOOKMARKS_URL,
    tabId: null,
    noOpenTab: false,
    keepDaemon: false,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--daemon-url") {
      args.daemonUrl = next;
      index += 1;
    } else if (arg === "--out-dir") {
      args.outDir = next;
      index += 1;
    } else if (arg === "--max-items") {
      args.maxItems = Number.parseInt(next, 10) || 0;
      index += 1;
    } else if (arg === "--max-scrolls") {
      args.maxScrolls = Number.parseInt(next, 10) || 120;
      index += 1;
    } else if (arg === "--idle-rounds") {
      args.idleRounds = Number.parseInt(next, 10) || 4;
      index += 1;
    } else if (arg === "--scroll-pause") {
      args.scrollPause = Math.round((Number.parseFloat(next) || 1.6) * 1000);
      index += 1;
    } else if (arg === "--extension-wait") {
      args.extensionWait = Math.round((Number.parseFloat(next) || 25) * 1000);
      index += 1;
    } else if (arg === "--command-timeout") {
      args.commandTimeout = Math.round((Number.parseFloat(next) || 90) * 1000);
      index += 1;
    } else if (arg === "--bookmark-url") {
      args.bookmarkUrl = next;
      index += 1;
    } else if (arg === "--tab-id") {
      args.tabId = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--no-open-tab") {
      args.noOpenTab = true;
    } else if (arg === "--keep-daemon") {
      args.keepDaemon = true;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  validateDaemonUrl(args.daemonUrl);
  return args;
}

function printHelp() {
  console.log(`x-bookmark-digest exporter

Usage:
  node scripts/export_x_bookmarks.mjs [options]

Core flow:
  1. Use your real Chrome/Brave/Edge login state
  2. Start the bundled bb-browser daemon if needed
  3. Reuse an existing https://x.com/i/bookmarks tab, or open one tab in that same browser
  4. Export bookmarks into local artifacts under runs/<timestamp>/

Options:
  --check                    print daemon / extension / tab readiness only
  --daemon-url <url>         daemon endpoint (default: http://localhost:19824)
  --out-dir <dir>            output directory
  --max-items <n>            stop after N unique bookmarks
  --max-scrolls <n>          maximum scroll rounds
  --idle-rounds <n>          stop after N no-growth rounds
  --scroll-pause <seconds>   wait after each scroll
  --extension-wait <sec>     wait for extension to connect before failing
  --command-timeout <sec>    timeout for daemon eval commands
  --tab-id <id>              target a specific existing tab
  --no-open-tab              fail instead of opening a new bookmarks tab
  --keep-daemon              do not stop a daemon started by this script

One-time setup if --check says extension is disconnected:
  1. Open chrome://extensions in your usual browser
  2. Enable Developer Mode
  3. Load unpacked -> ${path.relative(REPO_ROOT, EXTENSION_DIR)}
  4. Keep that browser open and rerun
`);
}

function validateDaemonUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ExportError(`Invalid daemon URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "http:") {
    throw new ExportError(`Daemon URL must use http://, received ${rawUrl}`);
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new ExportError(`Daemon URL must point to the server root, received ${rawUrl}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeRunDir(outDir) {
  if (outDir) {
    const resolved = path.resolve(outDir);
    ensureDir(resolved);
    return resolved;
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(REPO_ROOT, "runs", timestamp);
  ensureDir(dir);
  return dir;
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function writeJsonl(filePath, items) {
  ensureDir(path.dirname(filePath));
  const body = items.map((item) => JSON.stringify(item)).join("\n");
  fs.writeFileSync(filePath, `${body}${body ? "\n" : ""}`, "utf8");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function writeCsv(filePath, items) {
  ensureDir(path.dirname(filePath));
  const header = [
    "ordinal",
    "bookmark_id",
    "status_url",
    "author_name",
    "handle",
    "language",
    "is_reply",
    "hashtags",
    "urls",
    "media_count",
    "text",
  ];
  const rows = [header.join(",")];
  for (const item of items) {
    rows.push(
      [
        item.ordinal,
        item.bookmark_id,
        item.status_url || "",
        item.author_name || "",
        item.handle || "",
        item.language,
        String(item.is_reply),
        item.hashtags.join(" | "),
        item.urls.join(" | "),
        String(item.media.length),
        item.text || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  fs.writeFileSync(filePath, rows.join("\n"), "utf8");
}

function detectLanguage(text) {
  if (!text) return "unknown";
  const cjk = [...text].filter((char) => char >= "\u4e00" && char <= "\u9fff").length;
  const latin = [...text].filter((char) => /[A-Za-z]/.test(char)).length;
  if (cjk && latin) return "mixed";
  if (cjk) return "zh";
  if (latin) return "en";
  return "other";
}

function fingerprint(item) {
  const base = item.status_url || `${item.handle || ""}|${item.text || ""}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeItems(rawItems) {
  const seen = new Set();
  const items = [];
  for (const raw of rawItems) {
    const statusUrl = raw.status_url || null;
    const bookmarkId = raw.bookmark_id || raw.status_id || fingerprint(raw);
    const text = (raw.text || raw.raw_text_fallback || "").trim();
    const key = statusUrl || bookmarkId || text;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      bookmark_id: bookmarkId,
      status_id: raw.status_id || null,
      status_url: statusUrl,
      author_name: raw.author_name || null,
      handle: raw.handle || null,
      text,
      language: detectLanguage(text),
      hashtags: [...new Set(raw.hashtags || [])],
      urls: [...new Set(raw.urls || [])],
      media: [...new Set(raw.media || [])],
      quoted_status_urls: [...new Set(raw.quoted_status_urls || [])],
      is_reply: Boolean(raw.is_reply),
      metrics: raw.metrics || {},
    });
  }
  return items.map((item, index) => ({ ...item, ordinal: index + 1 }));
}

function topAuthors(items, limit = 15) {
  const counter = new Map();
  for (const item of items) {
    const key = item.handle || item.author_name || "unknown";
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([author, count]) => ({ author, count }));
}

function topDomains(items, limit = 15) {
  const counter = new Map();
  for (const item of items) {
    for (const url of item.urls) {
      try {
        const domain = new URL(url).hostname;
        counter.set(domain, (counter.get(domain) || 0) + 1);
      } catch {
        // Ignore malformed links from the timeline.
      }
    }
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}

function topHashtags(items, limit = 20) {
  const counter = new Map();
  for (const item of items) {
    for (const hashtag of item.hashtags) {
      counter.set(hashtag, (counter.get(hashtag) || 0) + 1);
    }
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([hashtag, count]) => ({ hashtag, count }));
}

function buildStats(items, rounds) {
  const languageBreakdown = {};
  for (const item of items) {
    languageBreakdown[item.language] = (languageBreakdown[item.language] || 0) + 1;
  }
  return {
    total_bookmarks: items.length,
    with_links: items.filter((item) => item.urls.length > 0).length,
    with_media: items.filter((item) => item.media.length > 0).length,
    reply_count: items.filter((item) => item.is_reply).length,
    language_breakdown: languageBreakdown,
    top_authors: topAuthors(items),
    top_domains: topDomains(items),
    top_hashtags: topHashtags(items),
    scroll_rounds: rounds,
  };
}

function chunkItems(items, maxChars = 18_000) {
  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const item of items) {
    const estimated = item.text.length + 250;
    if (current.length && currentChars + estimated > maxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += estimated;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function writeChunks(runDir, items) {
  const manifest = [];
  const chunks = chunkItems(items);
  chunks.forEach((chunk, index) => {
    const relPath = path.join("chunks", `chunk-${String(index + 1).padStart(3, "0")}.json`);
    writeJson(path.join(runDir, relPath), chunk);
    manifest.push({
      path: relPath,
      count: chunk.length,
      ordinals: [chunk[0].ordinal, chunk[chunk.length - 1].ordinal],
    });
  });
  return manifest;
}

function writeSeedMarkdown(filePath, stats, chunkManifest) {
  const lines = [
    "# Bookmark Seed",
    "",
    `- Total bookmarks: ${stats.total_bookmarks}`,
    `- With external links: ${stats.with_links}`,
    `- With media: ${stats.with_media}`,
    `- Replies: ${stats.reply_count}`,
    "",
    "## Top Authors",
    "",
    ...(stats.top_authors.length ? stats.top_authors.slice(0, 10).map((item) => `- ${item.author}: ${item.count}`) : ["- None"]),
    "",
    "## Top Domains",
    "",
    ...(stats.top_domains.length ? stats.top_domains.slice(0, 10).map((item) => `- ${item.domain}: ${item.count}`) : ["- None"]),
    "",
    "## Top Hashtags",
    "",
    ...(stats.top_hashtags.length ? stats.top_hashtags.slice(0, 10).map((item) => `- ${item.hashtag}: ${item.count}`) : ["- None"]),
    "",
    "## Chunk Plan",
    "",
    ...(chunkManifest.length
      ? chunkManifest.map((chunk) => `- ${chunk.path}: ${chunk.count} bookmarks (${chunk.ordinals[0]}-${chunk.ordinals[1]})`)
      : ["- No chunks were generated."]),
    "",
    "## Suggested Agent Flow",
    "",
    "- Read `summary/stats.json` first.",
    "- If the library is small, summarize directly from `raw/bookmarks.json`.",
    "- If it is large, summarize chunk files first, then merge.",
    "- Write final outputs to `report/bookmark-digest.md` and `report/bookmark-index.md`.",
    "",
  ];
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

async function requestJson(url, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ExportError(`Received a non-JSON response from ${url}`);
      }
    }
    if (!response.ok) {
      throw new ExportError(data.error || data.message || `HTTP ${response.status} when requesting ${url}`);
    }
    return data;
  } catch (error) {
    if (error instanceof ExportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ExportError(`Timed out requesting ${url}`);
    }
    throw new ExportError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

async function getDaemonStatus(baseUrl, timeoutMs = 1_500) {
  try {
    return await requestJson(`${baseUrl}/status`, {}, timeoutMs);
  } catch {
    return null;
  }
}

function startBundledDaemon(baseUrl) {
  if (!fs.existsSync(DAEMON_ENTRY)) {
    throw new ExportError(`Bundled daemon entry not found at ${DAEMON_ENTRY}`);
  }
  const parsed = new URL(baseUrl);
  const port = Number.parseInt(parsed.port || "80", 10);
  return spawn(process.execPath, [DAEMON_ENTRY, "--host", parsed.hostname, "--port", String(port)], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
}

async function waitForDaemon(baseUrl, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getDaemonStatus(baseUrl, 1_500);
    if (status?.running) return status;
    await sleep(250);
  }
  return null;
}

async function waitForExtension(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const status = await getDaemonStatus(baseUrl, 1_500);
    lastStatus = status;
    if (status?.extensionConnected) return status;
    await sleep(500);
  }
  return lastStatus;
}

async function ensureDaemon(baseUrl) {
  const running = await getDaemonStatus(baseUrl, 1_500);
  if (running?.running) {
    return { started: false, daemonProcess: null, status: running };
  }

  const daemonProcess = startBundledDaemon(baseUrl);
  const status = await waitForDaemon(baseUrl, 10_000);
  if (!status?.running) {
    throw new ExportError(`Could not start the bundled daemon at ${baseUrl}. Check for a port conflict first.`);
  }
  return { started: true, daemonProcess, status };
}

async function daemonCommand(baseUrl, action, params = {}, timeoutMs = 30_000) {
  const payload = await requestJson(
    `${baseUrl}/command`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: `x-bookmark-digest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        action,
        ...params,
      }),
    },
    timeoutMs,
  );

  if (!payload.success) {
    throw new ExportError(payload.error || `Daemon command failed: ${action}`);
  }
  return payload.data;
}

function normalizeTab(tab) {
  return {
    tab_id: tab.tabId,
    title: tab.title || "",
    url: tab.url || "",
  };
}

function isXBookmarkUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    return (hostname === "x.com" || hostname === "twitter.com") && url.pathname.startsWith("/i/bookmarks");
  } catch {
    return false;
  }
}

async function listTabs(baseUrl) {
  return await daemonCommand(baseUrl, "tab_list", {}, 20_000);
}

async function buildCheckReport(baseUrl, ensureResult) {
  const status = await getDaemonStatus(baseUrl, 1_500);
  const report = {
    check_only: true,
    daemon_url: baseUrl,
    daemon_running: Boolean(status?.running),
    extension_connected: Boolean(status?.extensionConnected),
    pending_requests: status?.pendingRequests ?? null,
    uptime_seconds: status?.uptime ?? null,
    vendor_daemon_entry: path.relative(REPO_ROOT, DAEMON_ENTRY),
    extension_dir: path.relative(REPO_ROOT, EXTENSION_DIR),
    daemon_started_by_check: ensureResult.started,
  };

  if (status?.extensionConnected) {
    const tabData = await listTabs(baseUrl);
    const tabs = tabData.tabs || [];
    report.total_tabs = tabs.length;
    report.active_tab = tabs[tabData.activeIndex] ? normalizeTab(tabs[tabData.activeIndex]) : null;
    report.bookmark_tabs = tabs.filter((tab) => isXBookmarkUrl(tab.url)).map(normalizeTab);
  } else {
    report.total_tabs = null;
    report.active_tab = null;
    report.bookmark_tabs = [];
  }

  report.ready = Boolean(report.daemon_running && report.extension_connected);
  return report;
}

async function evaluateTab(baseUrl, tabId, script, timeoutMs) {
  const data = await daemonCommand(baseUrl, "eval", { tabId, script }, timeoutMs);
  return data.result;
}

async function getBookmarkTab(baseUrl, args) {
  const tabData = await listTabs(baseUrl);
  const tabs = tabData.tabs || [];

  if (Number.isInteger(args.tabId)) {
    const target = tabs.find((tab) => tab.tabId === args.tabId);
    if (!target) {
      throw new ExportError(`Tab ${args.tabId} was not found in the real browser.`);
    }
    return { tabId: target.tabId, openedNewTab: false, tab: normalizeTab(target) };
  }

  const bookmarkTabs = tabs.filter((tab) => isXBookmarkUrl(tab.url));
  if (bookmarkTabs.length) {
    const activeBookmarkTab = bookmarkTabs.find((tab) => tab.tabId === tabs[tabData.activeIndex]?.tabId);
    const target = activeBookmarkTab || bookmarkTabs[0];
    return { tabId: target.tabId, openedNewTab: false, tab: normalizeTab(target) };
  }

  if (args.noOpenTab) {
    throw new ExportError("No existing X bookmarks tab was found. Open https://x.com/i/bookmarks in your usual browser and rerun.");
  }

  const opened = await daemonCommand(baseUrl, "open", { url: args.bookmarkUrl }, args.commandTimeout);
  if (!Number.isInteger(opened.tabId)) {
    throw new ExportError("The daemon opened a tab but did not return a tab id.");
  }
  await sleep(2_500);
  return {
    tabId: opened.tabId,
    openedNewTab: true,
    tab: {
      tab_id: opened.tabId,
      title: "",
      url: args.bookmarkUrl,
    },
  };
}

async function prepareBookmarkTab(baseUrl, tabId, bookmarkUrl, timeoutMs) {
  await evaluateTab(
    baseUrl,
    tabId,
    `(() => {
      const target = ${JSON.stringify(bookmarkUrl)};
      if (location.href !== target) {
        location.assign(target);
        return { navigated: true, href: location.href };
      }
      window.scrollTo(0, 0);
      return { navigated: false, href: location.href };
    })()`,
    timeoutMs,
  );
  await sleep(1_500);
}

async function diagnoseState(baseUrl, tabId, timeoutMs) {
  return await evaluateTab(
    baseUrl,
    tabId,
    `(() => {
      const bodyText = (document.body?.innerText || "").slice(0, 4000);
      const path = location.pathname || "";
      const looksLogin =
        /\\/i\\/flow|login|signin/i.test(path) ||
        /log in|sign in|登录|登入/i.test(bodyText);
      const looksEmpty =
        /haven.?t added any posts to your bookmarks yet|you haven.?t added any posts to your bookmarks yet|还没有.*书签/i.test(bodyText);
      return {
        url: location.href,
        title: document.title,
        pathname: path,
        readyState: document.readyState,
        hasTweets: !!document.querySelector('article[data-testid="tweet"]'),
        looksLogin,
        looksEmpty,
        snippet: bodyText.slice(0, 1200)
      };
    })()`,
    timeoutMs,
  );
}

async function waitForTimeline(baseUrl, tabId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    const state = await diagnoseState(baseUrl, tabId, 20_000);
    lastState = state;
    if (state.hasTweets || state.looksEmpty || state.looksLogin) {
      return state;
    }
    await sleep(1_500);
  }
  return lastState;
}

async function collectBookmarks(baseUrl, tabId, options) {
  const rounds = [];
  const seen = new Map();
  let idleRounds = 0;

  await evaluateTab(baseUrl, tabId, "window.scrollTo(0, 0)", 10_000).catch(() => {});
  await sleep(1_200);

  for (let round = 1; round <= options.maxScrolls; round += 1) {
    const snapshot = await evaluateTab(baseUrl, tabId, EXTRACT_SCRIPT, options.commandTimeout);
    const batch = normalizeItems(snapshot.items || []);
    let newItems = 0;

    for (const item of batch) {
      const key = item.status_url || item.bookmark_id;
      if (seen.has(key)) continue;
      seen.set(key, item);
      newItems += 1;
    }

    rounds.push({
      round,
      visible_items: batch.length,
      new_items: newItems,
      collected_total: seen.size,
      scroll_y: snapshot.scroll_y,
      page_height: snapshot.page_height,
    });

    if (options.maxItems && seen.size >= options.maxItems) break;
    idleRounds = newItems === 0 ? idleRounds + 1 : 0;
    if (idleRounds >= options.idleRounds) break;

    await evaluateTab(
      baseUrl,
      tabId,
      `(() => {
        window.scrollBy(0, Math.max(420, Math.floor(window.innerHeight * 0.92)));
        return {
          scrollY: window.scrollY,
          pageHeight: document.documentElement.scrollHeight
        };
      })()`,
      20_000,
    );
    await sleep(options.scrollPause);
  }

  return {
    items: [...seen.values()].map((item, index) => ({ ...item, ordinal: index + 1 })),
    rounds,
  };
}

function extensionSetupMessage() {
  return [
    "The bundled daemon is running but the real-browser extension is not connected.",
    "In your usual Chrome/Brave/Edge:",
    "1. Open chrome://extensions",
    "2. Enable Developer Mode",
    `3. Load unpacked -> ${EXTENSION_DIR}`,
    `4. Keep that browser open and rerun: node scripts/export_x_bookmarks.mjs --check`,
  ].join(" ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const daemon = await ensureDaemon(args.daemonUrl);

  try {
    if (args.check) {
      const report = await buildCheckReport(args.daemonUrl, daemon);
      console.log(JSON.stringify({ ok: true, ...report }, null, 2));
      return;
    }

    const extensionStatus = await waitForExtension(args.daemonUrl, args.extensionWait);
    if (!extensionStatus?.extensionConnected) {
      throw new ExportError(extensionSetupMessage());
    }

    const runDir = makeRunDir(args.outDir);
    const targetTab = await getBookmarkTab(args.daemonUrl, args);
    await prepareBookmarkTab(args.daemonUrl, targetTab.tabId, args.bookmarkUrl, args.commandTimeout);

    const pageState = await waitForTimeline(args.daemonUrl, targetTab.tabId, 35_000);
    if (!pageState) {
      throw new ExportError("Timed out waiting for the X bookmarks timeline to load.");
    }
    if (pageState.looksLogin) {
      throw new ExportError("The current real-browser session opened a login gate instead of bookmarks. Confirm that this browser is logged into X first.");
    }

    const collected = await collectBookmarks(args.daemonUrl, targetTab.tabId, args);
    const stats = buildStats(collected.items, collected.rounds);
    const chunkManifest = writeChunks(runDir, collected.items);

    writeJson(path.join(runDir, "summary", "session.json"), {
      daemon_url: args.daemonUrl,
      daemon_started_by_exporter: daemon.started,
      tab_id: targetTab.tabId,
      opened_new_tab: targetTab.openedNewTab,
      page_state: pageState,
      saved_at: new Date().toISOString(),
    });
    writeJson(path.join(runDir, "raw", "bookmarks.json"), collected.items);
    writeJsonl(path.join(runDir, "raw", "bookmarks.jsonl"), collected.items);
    writeJson(path.join(runDir, "raw", "rounds.json"), collected.rounds);
    writeCsv(path.join(runDir, "index", "bookmarks.csv"), collected.items);
    writeJson(path.join(runDir, "summary", "stats.json"), stats);
    writeSeedMarkdown(path.join(runDir, "summary", "seed.md"), stats, chunkManifest);
    ensureDir(path.join(runDir, "report"));

    console.log(
      JSON.stringify(
        {
          ok: true,
          run_dir: runDir,
          bookmark_count: collected.items.length,
          daemon_url: args.daemonUrl,
          tab_id: targetTab.tabId,
          opened_new_tab: targetTab.openedNewTab,
        },
        null,
        2,
      ),
    );
  } finally {
    if (daemon.started && daemon.daemonProcess && !args.keepDaemon) {
      daemon.daemonProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
