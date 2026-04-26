import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { createDecipheriv, pbkdf2Sync } from "crypto";

const MACOS_BROWSER_SPECS = [
  {
    id: "chrome",
    label: "Google Chrome",
    userDataDir: path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome"),
    keychainService: "Chrome Safe Storage",
    keychainAccount: "Chrome",
  },
  {
    id: "arc",
    label: "Arc",
    userDataDir: path.join(os.homedir(), "Library", "Application Support", "Arc", "User Data"),
    keychainService: "Arc Safe Storage",
    keychainAccount: "Arc",
  },
  {
    id: "brave",
    label: "Brave",
    userDataDir: path.join(os.homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
    keychainService: "Brave Safe Storage",
    keychainAccount: "Brave",
  },
  {
    id: "edge",
    label: "Microsoft Edge",
    userDataDir: path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge"),
    keychainService: "Microsoft Edge Safe Storage",
    keychainAccount: "Microsoft Edge",
  },
  {
    id: "chromium",
    label: "Chromium",
    userDataDir: path.join(os.homedir(), "Library", "Application Support", "Chromium"),
    keychainService: "Chromium Safe Storage",
    keychainAccount: "Chromium",
  },
];

const X_COOKIE_HOSTS = [".x.com", "x.com", ".twitter.com", "twitter.com"];
const X_COOKIE_NAMES = ["auth_token", "ct0"];

function parseCookieHeader(rawHeader) {
  const jar = {};
  for (const part of String(rawHeader || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const name = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim();
    if (name) jar[name] = value;
  }
  return jar;
}

function getManualAuthContext(options) {
  const cliAuthToken = options.authToken || "";
  const cliCt0 = options.ct0 || "";
  if (cliAuthToken && cliCt0) {
    return {
      source: "cli",
      authToken: cliAuthToken,
      ct0: cliCt0,
    };
  }

  const envAuthToken = process.env.X_AUTH_TOKEN || "";
  const envCt0 = process.env.X_CT0 || "";
  if (envAuthToken && envCt0) {
    return {
      source: "env",
      authToken: envAuthToken,
      ct0: envCt0,
    };
  }

  const cliCookieHeader = options.cookieHeader || "";
  if (cliCookieHeader) {
    const parsed = parseCookieHeader(cliCookieHeader);
    if (parsed.auth_token && parsed.ct0) {
      return {
        source: "cookie_header",
        authToken: parsed.auth_token,
        ct0: parsed.ct0,
      };
    }
  }

  const envCookieHeader = process.env.X_COOKIE_HEADER || "";
  if (envCookieHeader) {
    const parsed = parseCookieHeader(envCookieHeader);
    if (parsed.auth_token && parsed.ct0) {
      return {
        source: "cookie_header_env",
        authToken: parsed.auth_token,
        ct0: parsed.ct0,
      };
    }
  }

  return null;
}

function normalizeBrowserChoice(rawBrowser) {
  const value = String(rawBrowser || "auto").trim().toLowerCase();
  if (!value || value === "auto") return "auto";
  const supported = new Set(MACOS_BROWSER_SPECS.map((browser) => browser.id));
  if (!supported.has(value)) {
    throw new Error(`Unsupported browser "${rawBrowser}". Use auto, chrome, arc, brave, edge, or chromium.`);
  }
  return value;
}

function normalizeProfileChoice(rawProfile) {
  const value = String(rawProfile || "auto").trim();
  return value || "auto";
}

function getBrowserSpecs(browserChoice) {
  if (browserChoice === "auto") return [...MACOS_BROWSER_SPECS];
  return MACOS_BROWSER_SPECS.filter((browser) => browser.id === browserChoice);
}

function listProfileNames(userDataDir, preferredProfile) {
  if (!fs.existsSync(userDataDir)) {
    return [];
  }
  if (preferredProfile !== "auto") {
    return [preferredProfile];
  }

  const names = new Set();
  names.add("Default");
  for (const entry of fs.readdirSync(userDataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (/^(Default|Profile \d+|Profile [A-Za-z0-9 _-]+)$/.test(entry.name)) {
      names.add(entry.name);
    }
  }
  return [...names].sort((left, right) => {
    if (left === "Default") return -1;
    if (right === "Default") return 1;
    return left.localeCompare(right);
  });
}

function withCopiedDatabase(cookieDbPath, callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "x-bookmark-cookies-"));
  const tempDbPath = path.join(tempDir, "Cookies.sqlite");
  fs.copyFileSync(cookieDbPath, tempDbPath);
  try {
    return callback(tempDbPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runSqliteQuery(cookieDbPath, sql) {
  return withCopiedDatabase(cookieDbPath, (tempDbPath) => {
    const stdout = execFileSync("sqlite3", ["-tabs", tempDbPath, sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!stdout.trim()) return [];
    return stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("\t"));
  });
}

function queryXCookieRows(cookieDbPath) {
  const hostList = X_COOKIE_HOSTS.map((host) => `'${host}'`).join(", ");
  const nameList = X_COOKIE_NAMES.map((name) => `'${name}'`).join(", ");
  const sql = [
    "SELECT",
    "  host_key,",
    "  name,",
    "  COALESCE(value, ''),",
    "  COALESCE(hex(encrypted_value), ''),",
    "  COALESCE(path, ''),",
    "  COALESCE(expires_utc, 0)",
    "FROM cookies",
    `WHERE host_key IN (${hostList})`,
    `  AND name IN (${nameList})`,
    "ORDER BY",
    "  CASE name WHEN 'auth_token' THEN 0 WHEN 'ct0' THEN 1 ELSE 2 END,",
    "  CASE host_key WHEN '.x.com' THEN 0 WHEN 'x.com' THEN 1 WHEN '.twitter.com' THEN 2 ELSE 3 END",
  ].join(" ");

  return runSqliteQuery(cookieDbPath, sql).map(([hostKey, name, value, encryptedHex, cookiePath, expiresUtc]) => ({
    hostKey,
    name,
    value,
    encryptedHex,
    path: cookiePath,
    expiresUtc: Number.parseInt(expiresUtc, 10) || 0,
  }));
}

function inspectCookieDb(cookieDbPath) {
  if (!cookieDbPath || !fs.existsSync(cookieDbPath)) {
    return {
      cookieDbPath,
      cookieDbExists: false,
      xCookieNames: [],
      rowCount: 0,
      error: null,
    };
  }

  try {
    const rows = queryXCookieRows(cookieDbPath);
    return {
      cookieDbPath,
      cookieDbExists: true,
      xCookieNames: [...new Set(rows.map((row) => row.name))],
      rowCount: rows.length,
      error: null,
    };
  } catch (error) {
    return {
      cookieDbPath,
      cookieDbExists: true,
      xCookieNames: [],
      rowCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function inspectBrowserCandidates(options) {
  const browserChoice = normalizeBrowserChoice(options.browser);
  const profileChoice = normalizeProfileChoice(options.profile);
  const candidates = [];

  for (const browser of getBrowserSpecs(browserChoice)) {
    const browserExists = fs.existsSync(browser.userDataDir);
    const probe = {
      browser: browser.id,
      browser_label: browser.label,
      user_data_dir: browser.userDataDir,
      browser_exists: browserExists,
      keychain_service: browser.keychainService,
      keychain_account: browser.keychainAccount,
      profiles: [],
    };

    if (browserExists) {
      for (const profileName of listProfileNames(browser.userDataDir, profileChoice)) {
        const cookieDbPath = path.join(browser.userDataDir, profileName, "Cookies");
        probe.profiles.push({
          profile: profileName,
          ...inspectCookieDb(cookieDbPath),
        });
      }
    }

    candidates.push(probe);
  }

  return candidates;
}

function selectBrowserProfile(options) {
  const browserChoice = normalizeBrowserChoice(options.browser);
  const profileChoice = normalizeProfileChoice(options.profile);
  const candidates = inspectBrowserCandidates({ browser: browserChoice, profile: profileChoice });

  let firstCookieDb = null;
  for (const browser of candidates) {
    for (const profile of browser.profiles) {
      if (!firstCookieDb && profile.cookieDbExists) {
        firstCookieDb = {
          browser,
          profile,
        };
      }
      const ready = profile.xCookieNames.includes("auth_token") && profile.xCookieNames.includes("ct0");
      if (ready) {
        return {
          selected: {
            browserId: browser.browser,
            browserLabel: browser.browser_label,
            userDataDir: browser.user_data_dir,
            profileName: profile.profile,
            cookieDbPath: profile.cookieDbPath,
            keychainService: browser.keychain_service,
            keychainAccount: browser.keychain_account,
            xCookieNames: profile.xCookieNames,
          },
          candidates,
        };
      }
    }
  }

  if (firstCookieDb) {
    return {
      selected: {
        browserId: firstCookieDb.browser.browser,
        browserLabel: firstCookieDb.browser.browser_label,
        userDataDir: firstCookieDb.browser.user_data_dir,
        profileName: firstCookieDb.profile.profile,
        cookieDbPath: firstCookieDb.profile.cookieDbPath,
        keychainService: firstCookieDb.browser.keychain_service,
        keychainAccount: firstCookieDb.browser.keychain_account,
        xCookieNames: firstCookieDb.profile.xCookieNames,
      },
      candidates,
    };
  }

  return {
    selected: null,
    candidates,
  };
}

function inferBrowserSpecFromCookieDb(cookieDbPath) {
  const normalized = path.resolve(cookieDbPath);
  for (const browser of MACOS_BROWSER_SPECS) {
    const root = path.resolve(browser.userDataDir);
    if (normalized.startsWith(root)) {
      return browser;
    }
  }
  return null;
}

function readMacSafeStoragePassword(keychainService, keychainAccount) {
  const args = ["find-generic-password", "-w", "-a", keychainAccount, "-s", keychainService];
  try {
    const stdout = execFileSync("security", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (stdout) return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not unlock "${keychainService}" from macOS Keychain. This step is only used to decrypt Chromium cookies for X bookmarks. ${args.join(" ")} -> ${message}`,
    );
  }

  throw new Error(`Could not unlock "${keychainService}" from macOS Keychain. The keychain item returned an empty password.`);
}

function decryptChromiumCookieValue(encryptedHex, passphrase) {
  const encrypted = Buffer.from(encryptedHex, "hex");
  if (!encrypted.length) return "";

  const prefix = encrypted.subarray(0, 3).toString("utf8");
  if (prefix !== "v10" && prefix !== "v11") {
    return encrypted.toString("utf8");
  }

  const key = pbkdf2Sync(Buffer.from(passphrase, "utf8"), "saltysalt", 1003, 16, "sha1");
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  return decrypted.toString("utf8");
}

function pickBestCookieRow(rows, name) {
  const matches = rows.filter((row) => row.name === name);
  const preferredHosts = new Map(X_COOKIE_HOSTS.map((host, index) => [host, index]));
  matches.sort((left, right) => {
    return (preferredHosts.get(left.hostKey) ?? 99) - (preferredHosts.get(right.hostKey) ?? 99);
  });
  return matches[0] || null;
}

function resolveCookieValue(row, passphrase) {
  if (!row) return "";
  if (row.value) return row.value;
  if (!row.encryptedHex) return "";
  return decryptChromiumCookieValue(row.encryptedHex, passphrase).trim();
}

export function inspectAuthReadiness(options) {
  const manual = getManualAuthContext(options);
  if (manual) {
    return {
      mode: "embedded-mini-opencli",
      auth_source: manual.source,
      ready: true,
      platform: process.platform,
      manual_cookie_header_present: Boolean(options.cookieHeader || process.env.X_COOKIE_HEADER),
      browser_probe: null,
      notes: ["Manual X cookies already supplied, so browser discovery is skipped."],
    };
  }

  const response = {
    mode: "embedded-mini-opencli",
    auth_source: null,
    ready: false,
    platform: process.platform,
    manual_cookie_header_present: Boolean(options.cookieHeader || process.env.X_COOKIE_HEADER),
    browser_probe: null,
    notes: [],
  };

  if (process.platform !== "darwin") {
    response.notes.push("Automatic cookie discovery is only built in for macOS Chromium browsers right now.");
    response.notes.push("Use --auth-token/--ct0 or X_AUTH_TOKEN/X_CT0 on other platforms.");
    return response;
  }

  const explicitCookieDb = options.cookieDb ? path.resolve(options.cookieDb) : null;
  if (explicitCookieDb) {
    const browser = inferBrowserSpecFromCookieDb(explicitCookieDb);
    response.browser_probe = {
      selected: {
        browser: browser?.id || normalizeBrowserChoice(options.browser),
        browser_label: browser?.label || null,
        profile: normalizeProfileChoice(options.profile),
        cookie_db: explicitCookieDb,
        keychain_service: browser?.keychainService || null,
      },
      candidates: [],
      ...inspectCookieDb(explicitCookieDb),
    };
    response.ready = response.browser_probe.xCookieNames.includes("auth_token") && response.browser_probe.xCookieNames.includes("ct0");
    response.auth_source = response.ready ? "macos-chromium" : null;
    response.notes.push("A successful run may still trigger one macOS keychain prompt for the browser Safe Storage entry.");
    return response;
  }

  const probe = selectBrowserProfile(options);
  response.browser_probe = {
    selected: probe.selected
      ? {
          browser: probe.selected.browserId,
          browser_label: probe.selected.browserLabel,
          profile: probe.selected.profileName,
          cookie_db: probe.selected.cookieDbPath,
          keychain_service: probe.selected.keychainService,
          x_cookie_names: probe.selected.xCookieNames,
        }
      : null,
    candidates: probe.candidates,
  };
  response.ready = Boolean(probe.selected && probe.selected.xCookieNames.includes("auth_token") && probe.selected.xCookieNames.includes("ct0"));
  response.auth_source = response.ready ? "macos-chromium" : null;

  if (response.ready) {
    response.notes.push("A successful run may still trigger one macOS keychain prompt for the browser Safe Storage entry.");
  } else {
    response.notes.push("No usable X auth cookies were found automatically. Supply --auth-token and --ct0 if needed.");
  }

  return response;
}

export function resolveAuthContext(options) {
  const manual = getManualAuthContext(options);
  if (manual) {
    return manual;
  }

  if (process.platform !== "darwin") {
    throw new Error("Automatic browser cookie discovery is only built in for macOS Chromium browsers. Supply --auth-token and --ct0 on this platform.");
  }

  const explicitCookieDb = options.cookieDb ? path.resolve(options.cookieDb) : null;
  let selected = null;

  if (explicitCookieDb) {
    const browser = inferBrowserSpecFromCookieDb(explicitCookieDb);
    if (!browser) {
      throw new Error("Could not infer which Chromium browser owns the provided --cookie-db. Add --browser or pass --auth-token and --ct0 directly.");
    }
    selected = {
      browserId: browser.id,
      browserLabel: browser.label,
      profileName: normalizeProfileChoice(options.profile),
      cookieDbPath: explicitCookieDb,
      keychainService: browser.keychainService,
      keychainAccount: browser.keychainAccount,
    };
  } else {
    const probe = selectBrowserProfile(options);
    selected = probe.selected;
  }

  if (!selected) {
    throw new Error("Could not locate a logged-in Chromium profile with X cookies. Use --browser/--profile to point at the right profile, or pass --auth-token and --ct0 directly.");
  }

  const rows = queryXCookieRows(selected.cookieDbPath);
  const authRow = pickBestCookieRow(rows, "auth_token");
  const ct0Row = pickBestCookieRow(rows, "ct0");
  if (!authRow || !ct0Row) {
    throw new Error(`Found browser profile ${selected.browserLabel}/${selected.profileName}, but it does not contain both auth_token and ct0 for X.`);
  }

  const passphrase = readMacSafeStoragePassword(selected.keychainService, selected.keychainAccount);
  const authToken = resolveCookieValue(authRow, passphrase);
  const ct0 = resolveCookieValue(ct0Row, passphrase);

  if (!authToken || !ct0) {
    throw new Error(`Failed to decrypt auth_token or ct0 from ${selected.browserLabel}/${selected.profileName}.`);
  }

  return {
    source: "macos-chromium",
    authToken,
    ct0,
    browser: selected.browserId,
    browserLabel: selected.browserLabel,
    profile: selected.profileName,
    cookieDbPath: selected.cookieDbPath,
    keychainService: selected.keychainService,
  };
}
