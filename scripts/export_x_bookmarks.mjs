#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { inspectAuthReadiness, resolveAuthContext } from "./lib/chromium_auth.mjs";
import { collectBookmarksViaApi, resolveBookmarksQueryId } from "./lib/x_bookmarks_api.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

class ExportError extends Error {}

function parseArgs(argv) {
  const args = {
    outDir: null,
    limit: 0,
    maxPages: 12,
    pageSize: 100,
    pagePauseMs: 1200,
    browser: "auto",
    profile: "auto",
    cookieDb: null,
    cookieHeader: null,
    authToken: null,
    ct0: null,
    queryId: null,
    check: false,
    insecure: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--out-dir") {
      args.outDir = next;
      index += 1;
    } else if (arg === "--limit" || arg === "--max-items") {
      args.limit = Number.parseInt(next, 10) || 0;
      index += 1;
    } else if (arg === "--max-pages") {
      args.maxPages = Number.parseInt(next, 10) || 12;
      index += 1;
    } else if (arg === "--page-size") {
      args.pageSize = Number.parseInt(next, 10) || 100;
      index += 1;
    } else if (arg === "--page-pause") {
      args.pagePauseMs = Math.round((Number.parseFloat(next) || 1.2) * 1000);
      index += 1;
    } else if (arg === "--browser") {
      args.browser = next || "auto";
      index += 1;
    } else if (arg === "--profile") {
      args.profile = next || "auto";
      index += 1;
    } else if (arg === "--cookie-db") {
      args.cookieDb = next || null;
      index += 1;
    } else if (arg === "--cookie-header") {
      args.cookieHeader = next || null;
      index += 1;
    } else if (arg === "--auth-token") {
      args.authToken = next || null;
      index += 1;
    } else if (arg === "--ct0") {
      args.ct0 = next || null;
      index += 1;
    } else if (arg === "--query-id") {
      args.queryId = next || null;
      index += 1;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--insecure") {
      args.insecure = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`x-bookmark-digest exporter

Usage:
  node scripts/export_x_bookmarks.mjs [options]

What this embedded exporter does:
  1. Resolve X auth cookies from one of these sources:
     - --auth-token / --ct0
     - X_AUTH_TOKEN / X_CT0
     - --cookie-header / X_COOKIE_HEADER
     - the logged-in macOS Chromium profile (Chrome / Arc / Brave / Edge / Chromium)
  2. Call X's bookmarks GraphQL API directly
  3. Write local artifacts into runs/<timestamp>/

Options:
  --check                    print readiness only, without decrypting browser cookies
  --out-dir <dir>            output directory
  --limit <n>                stop after N bookmarks
  --max-pages <n>            stop after N API pages (default: 12)
  --page-size <n>            requested bookmarks per API page (default: 100)
  --page-pause <sec>         wait between pages (default: 1.2)
  --browser <name>           auto, chrome, arc, brave, edge, or chromium
  --profile <name>           Default, Profile 1, ... or auto
  --cookie-db <path>         explicit Chromium Cookies sqlite path
  --auth-token <value>       X auth_token cookie
  --ct0 <value>              X ct0 cookie
  --cookie-header <value>    full Cookie header containing auth_token and ct0
  --query-id <value>         override Bookmarks GraphQL query id
  --insecure                 disable TLS certificate verification for this run

Typical flow:
  node scripts/export_x_bookmarks.mjs --check
  node scripts/export_x_bookmarks.mjs

If you want to avoid a macOS Keychain prompt entirely, pass --auth-token and --ct0 manually.
`);
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
  const runDir = path.join(REPO_ROOT, "runs", timestamp);
  ensureDir(runDir);
  return runDir;
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
  const rows = [
    [
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
    ].join(","),
  ];

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
    const bookmarkId = raw.bookmark_id || raw.status_id || fingerprint(raw);
    const statusUrl = raw.status_url || null;
    const text = (raw.text || raw.raw_text_fallback || "").trim();
    const dedupeKey = statusUrl || bookmarkId || text;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      bookmark_id: bookmarkId,
      status_id: raw.status_id || null,
      status_url: statusUrl,
      author_name: raw.author_name || null,
      handle: raw.handle || null,
      text,
      language: raw.language || detectLanguage(text),
      hashtags: [...new Set(raw.hashtags || [])],
      urls: [...new Set(raw.urls || [])],
      media: [...new Set(raw.media || [])],
      quoted_status_urls: [...new Set(raw.quoted_status_urls || [])],
      is_reply: Boolean(raw.is_reply),
      metrics: raw.metrics || {},
      created_at: raw.created_at || null,
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
        // Ignore malformed URLs from the API payload.
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
    api_rounds: rounds,
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

async function buildCheckResponse(args) {
  const readiness = await inspectAuthReadiness(args);
  return {
    ok: true,
    check_only: true,
    ...readiness,
  };
}

function maybeEnableInsecureTls(args) {
  if (!args.insecure) return;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.check) {
    console.log(JSON.stringify(await buildCheckResponse(args), null, 2));
    return;
  }

  maybeEnableInsecureTls(args);

  const auth = await resolveAuthContext(args);
  const queryId = await resolveBookmarksQueryId(args.queryId);
  const runDir = makeRunDir(args.outDir);
  const collected = await collectBookmarksViaApi({
    authToken: auth.authToken,
    ct0: auth.ct0,
    queryId,
    limit: args.limit,
    maxPages: args.maxPages,
    pageSize: args.pageSize,
    pagePauseMs: args.pagePauseMs,
  });

  const items = normalizeItems(collected.items);
  const stats = buildStats(items, collected.rounds);
  const chunkManifest = writeChunks(runDir, items);

  writeJson(path.join(runDir, "summary", "session.json"), {
    exporter: "embedded-mini-opencli",
    auth_source: auth.source,
    browser: auth.browser || null,
    browser_label: auth.browserLabel || null,
    profile: auth.profile || null,
    cookie_db: auth.cookieDbPath || null,
    keychain_service: auth.keychainService || null,
    query_id: collected.queryId,
    saved_at: new Date().toISOString(),
  });
  writeJson(path.join(runDir, "raw", "bookmarks.json"), items);
  writeJsonl(path.join(runDir, "raw", "bookmarks.jsonl"), items);
  writeJson(path.join(runDir, "raw", "rounds.json"), collected.rounds);
  writeCsv(path.join(runDir, "index", "bookmarks.csv"), items);
  writeJson(path.join(runDir, "summary", "stats.json"), stats);
  writeSeedMarkdown(path.join(runDir, "summary", "seed.md"), stats, chunkManifest);
  ensureDir(path.join(runDir, "report"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        exporter: "embedded-mini-opencli",
        run_dir: runDir,
        bookmark_count: items.length,
        auth_source: auth.source,
        browser: auth.browser || null,
        profile: auth.profile || null,
        query_id: collected.queryId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
      },
      null,
      2,
    ),
  );
  process.exit(error instanceof ExportError ? 1 : 1);
});
