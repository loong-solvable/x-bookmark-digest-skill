#!/usr/bin/env node
import {
  COMMAND_TIMEOUT,
  generateId
} from "./chunk-XYKHDJST.js";
import {
  applyJq
} from "./chunk-AHGAQEFO.js";
import {
  parseOpenClawJson
} from "./chunk-FSL4RNI6.js";
import "./chunk-D4HDZEJT.js";

// packages/cli/src/index.ts
import { fileURLToPath as fileURLToPath4 } from "url";

// packages/cli/src/cdp-client.ts
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import os2 from "os";
import path2 from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";

// packages/cli/src/cdp-discovery.ts
import { execFile, execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
var DEFAULT_CDP_PORT = Number.parseInt(process.env.BB_BROWSER_CDP_PORT ?? "19827", 10);
var MANAGED_BROWSER_DIR = path.join(os.homedir(), ".bb-browser", "browser");
var MANAGED_USER_DATA_DIR = path.join(MANAGED_BROWSER_DIR, "user-data");
var MANAGED_PORT_FILE = path.join(MANAGED_BROWSER_DIR, "cdp-port");
function execFileAsync(command, args, timeout) {
  return new Promise((resolve3, reject) => {
    execFile(command, args, { encoding: "utf8", timeout }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve3(stdout.trim());
    });
  });
}
function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return void 0;
  return process.argv[index + 1];
}
function parsePort(raw) {
  const port = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(port) && port > 0 ? port : null;
}
async function readManagedPort() {
  try {
    return parsePort((await readFile(MANAGED_PORT_FILE, "utf8")).trim());
  } catch {
    return null;
  }
}
async function tryOpenClaw() {
  try {
    const raw = await execFileAsync("npx", ["openclaw", "browser", "status", "--json"], 5e3);
    const parsed = parseOpenClawJson(raw);
    const port = Number(parsed?.cdpPort);
    if (Number.isInteger(port) && port > 0) {
      return { host: "127.0.0.1", port };
    }
  } catch {
  }
  return null;
}
async function canConnect(host, port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
function findBrowserExecutable() {
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
      "/Applications/Arc.app/Contents/MacOS/Arc",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }
  if (process.platform === "linux") {
    const candidates = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"];
    for (const candidate of candidates) {
      try {
        const resolved = execSync(`which ${candidate}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        if (resolved) {
          return resolved;
        }
      } catch {
      }
    }
    return null;
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ...localAppData ? [
        `${localAppData}\\Google\\Chrome Dev\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome SxS\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome Beta\\Application\\chrome.exe`
      ] : [],
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }
  return null;
}
async function isManagedBrowserRunning() {
  const port = await readManagedPort();
  if (!port) {
    return false;
  }
  try {
    return await canConnect("127.0.0.1", port);
  } catch {
    return false;
  }
}
async function launchManagedBrowser(port = DEFAULT_CDP_PORT) {
  const executable = findBrowserExecutable();
  if (!executable) {
    return null;
  }
  await mkdir(MANAGED_USER_DATA_DIR, { recursive: true });
  const defaultProfileDir = path.join(MANAGED_USER_DATA_DIR, "Default");
  const prefsPath = path.join(defaultProfileDir, "Preferences");
  await mkdir(defaultProfileDir, { recursive: true });
  try {
    let prefs = {};
    try {
      prefs = JSON.parse(await readFile(prefsPath, "utf8"));
    } catch {
    }
    if (!prefs.profile?.name || prefs.profile.name !== "bb-browser") {
      prefs.profile = { ...prefs.profile || {}, name: "bb-browser" };
      await writeFile(prefsPath, JSON.stringify(prefs), "utf8");
    }
  } catch {
  }
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${MANAGED_USER_DATA_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "about:blank"
  ];
  try {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  } catch {
    return null;
  }
  await mkdir(MANAGED_BROWSER_DIR, { recursive: true });
  await writeFile(MANAGED_PORT_FILE, String(port), "utf8");
  const deadline = Date.now() + 8e3;
  while (Date.now() < deadline) {
    if (await canConnect("127.0.0.1", port)) {
      return { host: "127.0.0.1", port };
    }
    await new Promise((resolve3) => setTimeout(resolve3, 250));
  }
  return null;
}
async function discoverCdpPort() {
  const explicitPort = parsePort(getArgValue("--port"));
  if (explicitPort && await canConnect("127.0.0.1", explicitPort)) {
    return { host: "127.0.0.1", port: explicitPort };
  }
  let launchPort = explicitPort ?? null;
  const managedPort = await readManagedPort();
  if (managedPort && await canConnect("127.0.0.1", managedPort)) {
    return { host: "127.0.0.1", port: managedPort };
  }
  if (!launchPort && managedPort) launchPort = managedPort;
  if (process.argv.includes("--openclaw")) {
    const viaOpenClaw = await tryOpenClaw();
    if (viaOpenClaw && await canConnect(viaOpenClaw.host, viaOpenClaw.port)) {
      return viaOpenClaw;
    }
  }
  const launched = await launchManagedBrowser(launchPort ?? DEFAULT_CDP_PORT);
  if (launched) {
    return launched;
  }
  if (!process.argv.includes("--openclaw")) {
    const detectedOpenClaw = await tryOpenClaw();
    if (detectedOpenClaw && await canConnect(detectedOpenClaw.host, detectedOpenClaw.port)) {
      return detectedOpenClaw;
    }
  }
  return null;
}

// packages/cli/src/cdp-client.ts
var connectionState = null;
var reconnecting = null;
var networkRequests = /* @__PURE__ */ new Map();
var networkEnabled = false;
var consoleMessages = [];
var consoleEnabled = false;
var jsErrors = [];
var errorsEnabled = false;
var traceRecording = false;
var traceEvents = [];
function getContextFilePath(host, port) {
  const safeHost = host.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path2.join(os2.tmpdir(), `bb-browser-cdp-context-${safeHost}-${port}.json`);
}
function loadPersistedCurrentTargetId(host, port) {
  try {
    const data = JSON.parse(readFileSync(getContextFilePath(host, port), "utf-8"));
    return typeof data.currentTargetId === "string" && data.currentTargetId ? data.currentTargetId : void 0;
  } catch {
    return void 0;
  }
}
function persistCurrentTargetId(host, port, currentTargetId) {
  try {
    writeFileSync(getContextFilePath(host, port), JSON.stringify({ currentTargetId }));
  } catch {
  }
}
function setCurrentTargetId(targetId) {
  const state = connectionState;
  if (!state) return;
  state.currentTargetId = targetId;
  persistCurrentTargetId(state.host, state.port, targetId);
}
function buildRequestError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
function fetchJson(url) {
  return new Promise((resolve3, reject) => {
    const requester = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = requester(url, { method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode ?? 500}: ${raw}`));
          return;
        }
        try {
          resolve3(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
async function getJsonList(host, port) {
  const data = await fetchJson(`http://${host}:${port}/json/list`);
  return Array.isArray(data) ? data : [];
}
async function getJsonVersion(host, port) {
  const data = await fetchJson(`http://${host}:${port}/json/version`);
  const url = data.webSocketDebuggerUrl;
  if (typeof url !== "string" || !url) {
    throw new Error("CDP endpoint missing webSocketDebuggerUrl");
  }
  return { webSocketDebuggerUrl: url };
}
function connectWebSocket(url) {
  return new Promise((resolve3, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => {
      const socket = ws._socket;
      if (socket && typeof socket.unref === "function") {
        socket.unref();
      }
      resolve3(ws);
    });
    ws.once("error", reject);
  });
}
function createState(host, port, browserWsUrl, browserSocket) {
  const state = {
    host,
    port,
    browserWsUrl,
    browserSocket,
    browserPending: /* @__PURE__ */ new Map(),
    nextMessageId: 1,
    sessions: /* @__PURE__ */ new Map(),
    attachedTargets: /* @__PURE__ */ new Map(),
    refsByTarget: /* @__PURE__ */ new Map(),
    currentTargetId: loadPersistedCurrentTargetId(host, port),
    activeFrameIdByTarget: /* @__PURE__ */ new Map(),
    dialogHandlers: /* @__PURE__ */ new Map()
  };
  browserSocket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (typeof message.id === "number") {
      const pending = state.browserPending.get(message.id);
      if (!pending) return;
      state.browserPending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message ?? "Unknown CDP error"}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      const params = message.params;
      const sessionId = params.sessionId;
      const targetInfo = params.targetInfo;
      if (typeof sessionId === "string" && typeof targetInfo?.targetId === "string") {
        state.sessions.set(targetInfo.targetId, sessionId);
        state.attachedTargets.set(sessionId, targetInfo.targetId);
      }
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      const params = message.params;
      const sessionId = params.sessionId;
      if (typeof sessionId === "string") {
        const targetId = state.attachedTargets.get(sessionId);
        if (targetId) {
          state.sessions.delete(targetId);
          state.attachedTargets.delete(sessionId);
          state.activeFrameIdByTarget.delete(targetId);
          state.dialogHandlers.delete(targetId);
          if (state.currentTargetId === targetId) {
            state.currentTargetId = void 0;
            persistCurrentTargetId(state.host, state.port, void 0);
          }
        }
      }
      return;
    }
    if (message.method === "Target.receivedMessageFromTarget") {
      const params = message.params;
      const sessionId = params.sessionId;
      const messageText = params.message;
      if (typeof sessionId === "string" && typeof messageText === "string") {
        const targetId = state.attachedTargets.get(sessionId);
        if (targetId) {
          handleSessionEvent(targetId, JSON.parse(messageText)).catch(() => {
          });
        }
      }
      return;
    }
    if (typeof message.sessionId === "string" && typeof message.method === "string") {
      const targetId = state.attachedTargets.get(message.sessionId);
      if (targetId) {
        handleSessionEvent(targetId, message).catch(() => {
        });
      }
    }
  });
  browserSocket.on("close", () => {
    if (connectionState === state) {
      connectionState = null;
    }
    for (const pending of state.browserPending.values()) {
      pending.reject(new Error("CDP connection closed"));
    }
    state.browserPending.clear();
  });
  browserSocket.on("error", () => {
  });
  return state;
}
async function browserCommand(method, params = {}) {
  const state = connectionState;
  if (!state) throw new Error("CDP connection not initialized");
  const id = state.nextMessageId++;
  const payload = JSON.stringify({ id, method, params });
  const promise = new Promise((resolve3, reject) => {
    state.browserPending.set(id, { resolve: resolve3, reject, method });
  });
  state.browserSocket.send(payload);
  return promise;
}
async function sessionCommand(targetId, method, params = {}) {
  const state = connectionState;
  if (!state) throw new Error("CDP connection not initialized");
  const sessionId = state.sessions.get(targetId) ?? await attachTarget(targetId);
  const id = state.nextMessageId++;
  const payload = JSON.stringify({ id, method, params, sessionId });
  return new Promise((resolve3, reject) => {
    const check = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id && msg.sessionId === sessionId) {
        state.browserSocket.off("message", check);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message ?? "Unknown CDP error"}`));
        else resolve3(msg.result);
      }
    };
    state.browserSocket.on("message", check);
    state.browserSocket.send(payload);
  });
}
function getActiveFrameId(targetId) {
  const frameId = connectionState?.activeFrameIdByTarget.get(targetId);
  return frameId ?? void 0;
}
async function pageCommand(targetId, method, params = {}) {
  const frameId = getActiveFrameId(targetId);
  return sessionCommand(targetId, method, frameId ? { ...params, frameId } : params);
}
function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return void 0;
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}
async function handleSessionEvent(targetId, event) {
  const method = event.method;
  const params = event.params ?? {};
  if (typeof method !== "string") return;
  if (method === "Page.javascriptDialogOpening") {
    const handler = connectionState?.dialogHandlers.get(targetId);
    if (handler) {
      await sessionCommand(targetId, "Page.handleJavaScriptDialog", {
        accept: handler.accept,
        ...handler.promptText !== void 0 ? { promptText: handler.promptText } : {}
      });
    }
    return;
  }
  if (method === "Network.requestWillBeSent") {
    const requestId = typeof params.requestId === "string" ? params.requestId : void 0;
    const request = params.request;
    if (!requestId || !request) return;
    networkRequests.set(requestId, {
      requestId,
      url: String(request.url ?? ""),
      method: String(request.method ?? "GET"),
      type: String(params.type ?? "Other"),
      timestamp: Math.round(Number(params.timestamp ?? Date.now()) * 1e3),
      requestHeaders: normalizeHeaders(request.headers),
      requestBody: typeof request.postData === "string" ? request.postData : void 0
    });
    return;
  }
  if (method === "Network.responseReceived") {
    const requestId = typeof params.requestId === "string" ? params.requestId : void 0;
    const response = params.response;
    if (!requestId || !response) return;
    const existing = networkRequests.get(requestId);
    if (!existing) return;
    existing.status = typeof response.status === "number" ? response.status : void 0;
    existing.statusText = typeof response.statusText === "string" ? response.statusText : void 0;
    existing.responseHeaders = normalizeHeaders(response.headers);
    existing.mimeType = typeof response.mimeType === "string" ? response.mimeType : void 0;
    networkRequests.set(requestId, existing);
    return;
  }
  if (method === "Network.loadingFailed") {
    const requestId = typeof params.requestId === "string" ? params.requestId : void 0;
    if (!requestId) return;
    const existing = networkRequests.get(requestId);
    if (!existing) return;
    existing.failed = true;
    existing.failureReason = typeof params.errorText === "string" ? params.errorText : "Unknown error";
    networkRequests.set(requestId, existing);
    return;
  }
  if (method === "Runtime.consoleAPICalled") {
    const type = String(params.type ?? "log");
    const args = Array.isArray(params.args) ? params.args : [];
    const text = args.map((arg) => {
      if (typeof arg.value === "string") return arg.value;
      if (arg.value !== void 0) return String(arg.value);
      if (typeof arg.description === "string") return arg.description;
      return "";
    }).filter(Boolean).join(" ");
    const stack = params.stackTrace;
    const firstCallFrame = Array.isArray(stack?.callFrames) ? stack?.callFrames[0] : void 0;
    consoleMessages.push({
      type: ["log", "info", "warn", "error", "debug"].includes(type) ? type : "log",
      text,
      timestamp: Math.round(Number(params.timestamp ?? Date.now())),
      url: typeof firstCallFrame?.url === "string" ? firstCallFrame.url : void 0,
      lineNumber: typeof firstCallFrame?.lineNumber === "number" ? firstCallFrame.lineNumber : void 0
    });
    return;
  }
  if (method === "Runtime.exceptionThrown") {
    const details = params.exceptionDetails;
    if (!details) return;
    const exception = details.exception;
    const stackTrace = details.stackTrace;
    const callFrames = Array.isArray(stackTrace?.callFrames) ? stackTrace.callFrames : [];
    jsErrors.push({
      message: typeof exception?.description === "string" ? exception.description : String(details.text ?? "JavaScript exception"),
      url: typeof details.url === "string" ? details.url : typeof callFrames[0]?.url === "string" ? String(callFrames[0].url) : void 0,
      lineNumber: typeof details.lineNumber === "number" ? details.lineNumber : void 0,
      columnNumber: typeof details.columnNumber === "number" ? details.columnNumber : void 0,
      stackTrace: callFrames.length > 0 ? callFrames.map((frame) => `${String(frame.functionName ?? "<anonymous>")} (${String(frame.url ?? "")}:${String(frame.lineNumber ?? 0)}:${String(frame.columnNumber ?? 0)})`).join("\n") : void 0,
      timestamp: Date.now()
    });
  }
}
async function ensureNetworkMonitoring(targetId) {
  if (networkEnabled) return;
  await sessionCommand(targetId, "Network.enable");
  networkEnabled = true;
}
async function ensureConsoleMonitoring(targetId) {
  if (consoleEnabled && errorsEnabled) return;
  await sessionCommand(targetId, "Runtime.enable");
  consoleEnabled = true;
  errorsEnabled = true;
}
async function attachTarget(targetId) {
  const result = await browserCommand("Target.attachToTarget", {
    targetId,
    flatten: true
  });
  connectionState?.sessions.set(targetId, result.sessionId);
  connectionState?.attachedTargets.set(result.sessionId, targetId);
  connectionState?.activeFrameIdByTarget.set(targetId, connectionState?.activeFrameIdByTarget.get(targetId) ?? null);
  await sessionCommand(targetId, "Page.enable");
  await sessionCommand(targetId, "Runtime.enable");
  await sessionCommand(targetId, "DOM.enable");
  await sessionCommand(targetId, "Accessibility.enable");
  return result.sessionId;
}
async function getTargets() {
  const state = connectionState;
  if (!state) throw new Error("CDP connection not initialized");
  try {
    const result = await browserCommand("Target.getTargets");
    return (result.targetInfos || []).map((target) => ({
      id: target.targetId,
      type: target.type,
      title: target.title,
      url: target.url,
      webSocketDebuggerUrl: ""
    }));
  } catch {
    return getJsonList(state.host, state.port);
  }
}
async function ensurePageTarget(targetId) {
  const targets = (await getTargets()).filter((target2) => target2.type === "page");
  if (targets.length === 0) throw new Error("No page target found");
  const persistedTargetId = targetId === void 0 ? connectionState?.currentTargetId : void 0;
  let target;
  if (typeof targetId === "number") {
    target = targets[targetId] ?? targets.find((item) => Number(item.id) === targetId);
  } else if (typeof targetId === "string") {
    target = targets.find((item) => item.id === targetId);
    if (!target) {
      const numericTargetId = Number(targetId);
      if (!Number.isNaN(numericTargetId)) {
        target = targets[numericTargetId] ?? targets.find((item) => Number(item.id) === numericTargetId);
      }
    }
  } else if (persistedTargetId) {
    target = targets.find((item) => item.id === persistedTargetId);
  }
  target ??= targets[0];
  setCurrentTargetId(target.id);
  await attachTarget(target.id);
  return target;
}
async function resolveBackendNodeIdByXPath(targetId, xpath) {
  await sessionCommand(targetId, "DOM.getDocument", { depth: 0 });
  const search = await sessionCommand(targetId, "DOM.performSearch", {
    query: xpath,
    includeUserAgentShadowDOM: true
  });
  try {
    if (!search.resultCount) {
      throw new Error(`Unknown ref xpath: ${xpath}`);
    }
    const { nodeIds } = await sessionCommand(targetId, "DOM.getSearchResults", {
      searchId: search.searchId,
      fromIndex: 0,
      toIndex: search.resultCount
    });
    for (const nodeId of nodeIds) {
      const described = await sessionCommand(targetId, "DOM.describeNode", {
        nodeId
      });
      if (described.node.backendNodeId) {
        return described.node.backendNodeId;
      }
    }
    throw new Error(`XPath resolved but no backend node id found: ${xpath}`);
  } finally {
    await sessionCommand(targetId, "DOM.discardSearchResults", { searchId: search.searchId }).catch(() => {
    });
  }
}
async function parseRef(ref) {
  const targetId = connectionState?.currentTargetId ?? "";
  let refs = connectionState?.refsByTarget.get(targetId) ?? {};
  if (!refs[ref] && targetId) {
    const persistedRefs = loadPersistedRefs(targetId);
    if (persistedRefs) {
      connectionState?.refsByTarget.set(targetId, persistedRefs);
      refs = persistedRefs;
    }
  }
  const found = refs[ref];
  if (!found) {
    throw new Error(`Unknown ref: ${ref}. Run snapshot first.`);
  }
  if (found.backendDOMNodeId) {
    return found.backendDOMNodeId;
  }
  if (targetId && found.xpath) {
    const backendDOMNodeId = await resolveBackendNodeIdByXPath(targetId, found.xpath);
    found.backendDOMNodeId = backendDOMNodeId;
    connectionState?.refsByTarget.set(targetId, refs);
    const pageUrl = await evaluate(targetId, "location.href", true).catch(() => void 0);
    if (pageUrl) {
      persistRefs(targetId, pageUrl, refs);
    }
    return backendDOMNodeId;
  }
  throw new Error(`Unknown ref: ${ref}. Run snapshot first.`);
}
function getRefsFilePath(targetId) {
  return path2.join(os2.tmpdir(), `bb-browser-refs-${targetId}.json`);
}
function loadPersistedRefs(targetId, expectedUrl) {
  try {
    const data = JSON.parse(readFileSync(getRefsFilePath(targetId), "utf-8"));
    if (data.targetId !== targetId) return null;
    if (expectedUrl !== void 0 && data.url !== expectedUrl) return null;
    if (!data.refs || typeof data.refs !== "object") return null;
    return data.refs;
  } catch {
    return null;
  }
}
function persistRefs(targetId, url, refs) {
  try {
    writeFileSync(getRefsFilePath(targetId), JSON.stringify({ targetId, url, timestamp: Date.now(), refs }));
  } catch {
  }
}
function clearPersistedRefs(targetId) {
  try {
    unlinkSync(getRefsFilePath(targetId));
  } catch {
  }
}
function loadBuildDomTreeScript() {
  const currentDir = path2.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path2.resolve(currentDir, "./extension/buildDomTree.js"),
    // npm installed: dist/cli.js → ../extension/buildDomTree.js
    path2.resolve(currentDir, "../extension/buildDomTree.js"),
    path2.resolve(currentDir, "../extension/dist/buildDomTree.js"),
    path2.resolve(currentDir, "../packages/extension/public/buildDomTree.js"),
    path2.resolve(currentDir, "../packages/extension/dist/buildDomTree.js"),
    // dev mode: packages/cli/dist/ → ../../../extension/
    path2.resolve(currentDir, "../../../extension/buildDomTree.js"),
    path2.resolve(currentDir, "../../../extension/dist/buildDomTree.js"),
    // dev mode: packages/cli/src/ → ../../extension/
    path2.resolve(currentDir, "../../extension/buildDomTree.js"),
    path2.resolve(currentDir, "../../../packages/extension/dist/buildDomTree.js"),
    path2.resolve(currentDir, "../../../packages/extension/public/buildDomTree.js")
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
    }
  }
  throw new Error("Cannot find buildDomTree.js");
}
async function evaluate(targetId, expression, returnByValue = true) {
  const result = await sessionCommand(targetId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed"
    );
  }
  return result.result.value ?? result.result;
}
async function focusNode(targetId, backendNodeId) {
  await sessionCommand(targetId, "DOM.focus", { backendNodeId });
}
async function insertTextIntoNode(targetId, backendNodeId, text, clearFirst) {
  const resolved = await sessionCommand(targetId, "DOM.resolveNode", { backendNodeId });
  await sessionCommand(targetId, "Runtime.callFunctionOn", {
    objectId: resolved.object.objectId,
    functionDeclaration: `function(clearFirst) {
      if (typeof this.scrollIntoView === 'function') {
        this.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      }
      if (typeof this.focus === 'function') this.focus();
      if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) {
        if (clearFirst) {
          this.value = '';
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof this.setSelectionRange === 'function') {
          const end = this.value.length;
          this.setSelectionRange(end, end);
        }
        return true;
      }
      if (this instanceof HTMLElement && this.isContentEditable) {
        if (clearFirst) {
          this.textContent = '';
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(this);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return true;
      }
      return false;
    }`,
    arguments: [
      { value: clearFirst }
    ],
    returnByValue: true
  });
  if (text) {
    await focusNode(targetId, backendNodeId);
    await sessionCommand(targetId, "Input.insertText", { text });
  }
}
async function getInteractablePoint(targetId, backendNodeId) {
  const resolved = await sessionCommand(targetId, "DOM.resolveNode", { backendNodeId });
  const call = await sessionCommand(targetId, "Runtime.callFunctionOn", {
    objectId: resolved.object.objectId,
    functionDeclaration: `function() {
      if (!(this instanceof Element)) {
        throw new Error('Ref does not resolve to an element');
      }
      this.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      const rect = this.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Element is not visible');
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }`,
    returnByValue: true
  });
  if (call.exceptionDetails) {
    throw new Error(call.exceptionDetails.text || "Failed to resolve element point");
  }
  const point = call.result.value;
  if (!point || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Failed to resolve element point");
  }
  return point;
}
async function mouseClick(targetId, x, y) {
  await sessionCommand(targetId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await sessionCommand(targetId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sessionCommand(targetId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
async function getAttributeValue(targetId, backendNodeId, attribute) {
  if (attribute === "text") {
    const resolved = await sessionCommand(targetId, "DOM.resolveNode", { backendNodeId });
    const call2 = await sessionCommand(targetId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() { return (this instanceof HTMLElement ? this.innerText : this.textContent || '').trim(); }`,
      returnByValue: true
    });
    return String(call2.result.value ?? "");
  }
  const result = await sessionCommand(targetId, "DOM.resolveNode", { backendNodeId });
  const call = await sessionCommand(targetId, "Runtime.callFunctionOn", {
    objectId: result.object.objectId,
    functionDeclaration: `function() { if (${JSON.stringify(attribute)} === 'url') return this.href || this.src || location.href; if (${JSON.stringify(attribute)} === 'title') return document.title; return this.getAttribute(${JSON.stringify(attribute)}) || ''; }`,
    returnByValue: true
  });
  return String(call.result.value ?? "");
}
async function buildSnapshot(targetId, request) {
  const script = loadBuildDomTreeScript();
  const buildArgs = {
    showHighlightElements: true,
    focusHighlightIndex: -1,
    viewportExpansion: -1,
    debugMode: false,
    startId: 0,
    startHighlightIndex: 0
  };
  const expression = `(() => { ${script}; const fn = globalThis.buildDomTree ?? (typeof window !== 'undefined' ? window.buildDomTree : undefined); if (typeof fn !== 'function') { throw new Error('buildDomTree is not available after script injection'); } return fn(${JSON.stringify({
    ...buildArgs
  })}); })()`;
  const value = await evaluate(targetId, expression, true);
  if (!value || !value.map || !value.rootId) {
    const title = await evaluate(targetId, "document.title", true);
    const pageUrl2 = await evaluate(targetId, "location.href", true);
    const fallbackSnapshot = {
      title,
      url: pageUrl2,
      lines: [title || pageUrl2],
      refs: {}
    };
    connectionState?.refsByTarget.set(targetId, {});
    persistRefs(targetId, pageUrl2, {});
    return fallbackSnapshot;
  }
  const snapshot = convertBuildDomTreeResult(value, {
    interactiveOnly: !!request.interactive,
    compact: !!request.compact,
    maxDepth: request.maxDepth,
    selector: request.selector
  });
  const pageUrl = await evaluate(targetId, "location.href", true);
  connectionState?.refsByTarget.set(targetId, snapshot.refs || {});
  persistRefs(targetId, pageUrl, snapshot.refs || {});
  return snapshot;
}
function convertBuildDomTreeResult(result, options) {
  const { interactiveOnly, compact, maxDepth, selector } = options;
  const { rootId, map } = result;
  const refs = {};
  const lines = [];
  const getRole = (node) => {
    const tagName = node.tagName.toLowerCase();
    const role = node.attributes?.role;
    if (role) return role;
    const type = node.attributes?.type?.toLowerCase() || "text";
    const inputRoleMap = {
      text: "textbox",
      password: "textbox",
      email: "textbox",
      url: "textbox",
      tel: "textbox",
      search: "searchbox",
      number: "spinbutton",
      range: "slider",
      checkbox: "checkbox",
      radio: "radio",
      button: "button",
      submit: "button",
      reset: "button",
      file: "button"
    };
    const roleMap = {
      a: "link",
      button: "button",
      input: inputRoleMap[type] || "textbox",
      select: "combobox",
      textarea: "textbox",
      img: "image",
      nav: "navigation",
      main: "main",
      header: "banner",
      footer: "contentinfo",
      aside: "complementary",
      form: "form",
      table: "table",
      ul: "list",
      ol: "list",
      li: "listitem",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      dialog: "dialog",
      article: "article",
      section: "region",
      label: "label",
      details: "group",
      summary: "button"
    };
    return roleMap[tagName] || tagName;
  };
  const collectTextContent = (node, nodeMap, depthLimit = 5) => {
    const texts = [];
    const visit = (nodeId, depth) => {
      if (depth > depthLimit) return;
      const currentNode = nodeMap[nodeId];
      if (!currentNode) return;
      if ("type" in currentNode && currentNode.type === "TEXT_NODE") {
        const text = currentNode.text.trim();
        if (text) texts.push(text);
        return;
      }
      for (const childId of currentNode.children || []) visit(childId, depth + 1);
    };
    for (const childId of node.children || []) visit(childId, 0);
    return texts.join(" ").trim();
  };
  const getName = (node) => {
    const attrs = node.attributes || {};
    return attrs["aria-label"] || attrs.title || attrs.placeholder || attrs.alt || attrs.value || collectTextContent(node, map) || attrs.name || void 0;
  };
  const truncateText = (text, length = 50) => text.length <= length ? text : `${text.slice(0, length - 3)}...`;
  const selectorText = selector?.trim().toLowerCase();
  const matchesSelector = (node, role, name) => {
    if (!selectorText) return true;
    const haystack = [node.tagName, role, name, node.xpath || "", ...Object.values(node.attributes || {})].join(" ").toLowerCase();
    return haystack.includes(selectorText);
  };
  if (interactiveOnly) {
    const interactiveNodes = Object.entries(map).filter(([, node]) => !("type" in node) && node.highlightIndex !== void 0 && node.highlightIndex !== null).map(([id, node]) => ({ id, node })).sort((a, b) => (a.node.highlightIndex ?? 0) - (b.node.highlightIndex ?? 0));
    for (const { node } of interactiveNodes) {
      const refId = String(node.highlightIndex);
      const role = getRole(node);
      const name = getName(node);
      if (!matchesSelector(node, role, name)) continue;
      let line = `${role} [ref=${refId}]`;
      if (name) line += ` ${JSON.stringify(truncateText(name))}`;
      lines.push(line);
      refs[refId] = {
        xpath: node.xpath || "",
        role,
        name,
        tagName: node.tagName.toLowerCase()
      };
    }
    return { snapshot: lines.join("\n"), refs };
  }
  const walk = (nodeId, depth) => {
    if (maxDepth !== void 0 && depth > maxDepth) return;
    const node = map[nodeId];
    if (!node) return;
    if ("type" in node && node.type === "TEXT_NODE") {
      const text = node.text.trim();
      if (!text) return;
      lines.push(`${"  ".repeat(depth)}- text ${JSON.stringify(truncateText(text, compact ? 80 : 120))}`);
      return;
    }
    const role = getRole(node);
    const name = getName(node);
    if (!matchesSelector(node, role, name)) {
      for (const childId of node.children || []) walk(childId, depth + 1);
      return;
    }
    const indent = "  ".repeat(depth);
    const refId = node.highlightIndex !== void 0 && node.highlightIndex !== null ? String(node.highlightIndex) : null;
    let line = `${indent}- ${role}`;
    if (refId) line += ` [ref=${refId}]`;
    if (name) line += ` ${JSON.stringify(truncateText(name, compact ? 50 : 80))}`;
    if (!compact) line += ` <${node.tagName.toLowerCase()}>`;
    lines.push(line);
    if (refId) {
      refs[refId] = {
        xpath: node.xpath || "",
        role,
        name,
        tagName: node.tagName.toLowerCase()
      };
    }
    for (const childId of node.children || []) walk(childId, depth + 1);
  };
  walk(rootId, 0);
  return { snapshot: lines.join("\n"), refs };
}
function ok(id, data) {
  return { id, success: true, data };
}
function fail(id, error) {
  return { id, success: false, error: buildRequestError(error).message };
}
async function ensureCdpConnection() {
  if (connectionState) return;
  if (reconnecting) return reconnecting;
  reconnecting = (async () => {
    const discovered = await discoverCdpPort();
    if (!discovered) {
      throw new Error("No browser connection found");
    }
    const version = await getJsonVersion(discovered.host, discovered.port);
    const wsUrl = version.webSocketDebuggerUrl;
    const socket = await connectWebSocket(wsUrl);
    connectionState = createState(discovered.host, discovered.port, wsUrl, socket);
  })();
  try {
    await reconnecting;
  } finally {
    reconnecting = null;
  }
}
async function sendCommand(request) {
  try {
    await ensureCdpConnection();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("\u8BF7\u6C42\u8D85\u65F6")), COMMAND_TIMEOUT));
    return await Promise.race([dispatchRequest(request), timeout]);
  } catch (error) {
    return fail(request.id, error);
  }
}
async function dispatchRequest(request) {
  const target = await ensurePageTarget(request.tabId);
  switch (request.action) {
    case "open": {
      if (!request.url) return fail(request.id, "Missing url parameter");
      if (request.tabId === void 0) {
        const created = await browserCommand("Target.createTarget", { url: request.url, background: true });
        const newTarget = await ensurePageTarget(created.targetId);
        return ok(request.id, { url: request.url, tabId: newTarget.id });
      }
      await pageCommand(target.id, "Page.navigate", { url: request.url });
      connectionState?.refsByTarget.delete(target.id);
      clearPersistedRefs(target.id);
      return ok(request.id, { url: request.url, title: target.title, tabId: target.id });
    }
    case "snapshot": {
      const snapshotData = await buildSnapshot(target.id, request);
      return ok(request.id, { title: target.title, url: target.url, snapshotData });
    }
    case "click":
    case "hover": {
      if (!request.ref) return fail(request.id, "Missing ref parameter");
      const backendNodeId = await parseRef(request.ref);
      const point = await getInteractablePoint(target.id, backendNodeId);
      await sessionCommand(target.id, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
      if (request.action === "click") await mouseClick(target.id, point.x, point.y);
      return ok(request.id, {});
    }
    case "fill":
    case "type": {
      if (!request.ref) return fail(request.id, "Missing ref parameter");
      if (request.text == null) return fail(request.id, "Missing text parameter");
      const backendNodeId = await parseRef(request.ref);
      await insertTextIntoNode(target.id, backendNodeId, request.text, request.action === "fill");
      return ok(request.id, { value: request.text });
    }
    case "check":
    case "uncheck": {
      if (!request.ref) return fail(request.id, "Missing ref parameter");
      const backendNodeId = await parseRef(request.ref);
      const desired = request.action === "check";
      const resolved = await sessionCommand(target.id, "DOM.resolveNode", { backendNodeId });
      await sessionCommand(target.id, "Runtime.callFunctionOn", {
        objectId: resolved.object.objectId,
        functionDeclaration: `function() { this.checked = ${desired}; this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true })); }`
      });
      return ok(request.id, {});
    }
    case "select": {
      if (!request.ref || request.value == null) return fail(request.id, "Missing ref or value parameter");
      const backendNodeId = await parseRef(request.ref);
      const resolved = await sessionCommand(target.id, "DOM.resolveNode", { backendNodeId });
      await sessionCommand(target.id, "Runtime.callFunctionOn", {
        objectId: resolved.object.objectId,
        functionDeclaration: `function() { this.value = ${JSON.stringify(request.value)}; this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true })); }`
      });
      return ok(request.id, { value: request.value });
    }
    case "get": {
      if (!request.attribute) return fail(request.id, "Missing attribute parameter");
      if (request.attribute === "url" && !request.ref) {
        return ok(request.id, { value: await evaluate(target.id, "location.href", true) });
      }
      if (request.attribute === "title" && !request.ref) {
        return ok(request.id, { value: await evaluate(target.id, "document.title", true) });
      }
      if (!request.ref) return fail(request.id, "Missing ref parameter");
      const value = await getAttributeValue(target.id, await parseRef(request.ref), request.attribute);
      return ok(request.id, { value });
    }
    case "screenshot": {
      const result = await sessionCommand(target.id, "Page.captureScreenshot", { format: "png", fromSurface: true });
      return ok(request.id, { dataUrl: `data:image/png;base64,${result.data}` });
    }
    case "close": {
      await browserCommand("Target.closeTarget", { targetId: target.id });
      connectionState?.refsByTarget.delete(target.id);
      clearPersistedRefs(target.id);
      return ok(request.id, {});
    }
    case "wait": {
      await new Promise((resolve3) => setTimeout(resolve3, request.ms ?? 1e3));
      return ok(request.id, {});
    }
    case "press": {
      if (!request.key) return fail(request.id, "Missing key parameter");
      await sessionCommand(target.id, "Input.dispatchKeyEvent", { type: "keyDown", key: request.key });
      if (request.key.length === 1) {
        await sessionCommand(target.id, "Input.dispatchKeyEvent", { type: "char", text: request.key, key: request.key });
      }
      await sessionCommand(target.id, "Input.dispatchKeyEvent", { type: "keyUp", key: request.key });
      return ok(request.id, {});
    }
    case "scroll": {
      const deltaY = request.direction === "up" ? -(request.pixels ?? 300) : request.pixels ?? 300;
      await sessionCommand(target.id, "Input.dispatchMouseEvent", { type: "mouseWheel", x: 0, y: 0, deltaX: 0, deltaY });
      return ok(request.id, {});
    }
    case "back": {
      await evaluate(target.id, "history.back(); undefined");
      return ok(request.id, {});
    }
    case "forward": {
      await evaluate(target.id, "history.forward(); undefined");
      return ok(request.id, {});
    }
    case "refresh": {
      await sessionCommand(target.id, "Page.reload", { ignoreCache: false });
      return ok(request.id, {});
    }
    case "eval": {
      if (!request.script) return fail(request.id, "Missing script parameter");
      const result = await evaluate(target.id, request.script, true);
      return ok(request.id, { result });
    }
    case "tab_list": {
      const tabs = (await getTargets()).filter((item) => item.type === "page").map((item, index) => ({ index, url: item.url, title: item.title, active: item.id === connectionState?.currentTargetId || !connectionState?.currentTargetId && index === 0, tabId: item.id }));
      return ok(request.id, { tabs, activeIndex: tabs.findIndex((tab) => tab.active) });
    }
    case "tab_new": {
      const created = await browserCommand("Target.createTarget", { url: request.url ?? "about:blank", background: true });
      return ok(request.id, { tabId: created.targetId, url: request.url ?? "about:blank" });
    }
    case "tab_select": {
      const tabs = (await getTargets()).filter((item) => item.type === "page");
      const selected = request.tabId !== void 0 ? tabs.find((item) => item.id === String(request.tabId) || Number(item.id) === request.tabId) : tabs[request.index ?? 0];
      if (!selected) return fail(request.id, "Tab not found");
      setCurrentTargetId(selected.id);
      await attachTarget(selected.id);
      return ok(request.id, { tabId: selected.id, url: selected.url, title: selected.title });
    }
    case "tab_close": {
      const tabs = (await getTargets()).filter((item) => item.type === "page");
      const selected = request.tabId !== void 0 ? tabs.find((item) => item.id === String(request.tabId) || Number(item.id) === request.tabId) : tabs[request.index ?? 0];
      if (!selected) return fail(request.id, "Tab not found");
      await browserCommand("Target.closeTarget", { targetId: selected.id });
      connectionState?.refsByTarget.delete(selected.id);
      if (connectionState?.currentTargetId === selected.id) {
        setCurrentTargetId(void 0);
      }
      clearPersistedRefs(selected.id);
      return ok(request.id, { tabId: selected.id });
    }
    case "frame": {
      if (!request.selector) return fail(request.id, "Missing selector parameter");
      const document = await pageCommand(target.id, "DOM.getDocument", {});
      const node = await pageCommand(target.id, "DOM.querySelector", { nodeId: document.root.nodeId, selector: request.selector });
      if (!node.nodeId) return fail(request.id, `\u627E\u4E0D\u5230 iframe: ${request.selector}`);
      const described = await pageCommand(target.id, "DOM.describeNode", { nodeId: node.nodeId });
      const frameId = described.node.frameId;
      const nodeName = String(described.node.nodeName ?? "").toLowerCase();
      if (!frameId) return fail(request.id, `\u65E0\u6CD5\u83B7\u53D6 iframe frameId: ${request.selector}`);
      if (nodeName && nodeName !== "iframe" && nodeName !== "frame") return fail(request.id, `\u5143\u7D20\u4E0D\u662F iframe: ${nodeName}`);
      connectionState?.activeFrameIdByTarget.set(target.id, frameId);
      const attributes = described.node.attributes ?? [];
      const attrMap = {};
      for (let i = 0; i < attributes.length; i += 2) attrMap[String(attributes[i])] = String(attributes[i + 1] ?? "");
      return ok(request.id, { frameInfo: { selector: request.selector, name: attrMap.name ?? "", url: attrMap.src ?? "", frameId } });
    }
    case "frame_main": {
      connectionState?.activeFrameIdByTarget.set(target.id, null);
      return ok(request.id, { frameInfo: { frameId: 0 } });
    }
    case "dialog": {
      connectionState?.dialogHandlers.set(target.id, { accept: request.dialogResponse !== "dismiss", ...request.promptText !== void 0 ? { promptText: request.promptText } : {} });
      await sessionCommand(target.id, "Page.enable");
      return ok(request.id, { dialog: { armed: true, response: request.dialogResponse ?? "accept" } });
    }
    case "network": {
      const subCommand = request.networkCommand ?? "requests";
      switch (subCommand) {
        case "requests": {
          await ensureNetworkMonitoring(target.id);
          const requests = Array.from(networkRequests.values()).filter((item) => !request.filter || item.url.includes(request.filter));
          if (request.withBody) {
            await Promise.all(requests.map(async (item) => {
              if (item.failed || item.responseBody !== void 0 || item.bodyError !== void 0) return;
              try {
                const body = await sessionCommand(target.id, "Network.getResponseBody", { requestId: item.requestId });
                item.responseBody = body.body;
                item.responseBodyBase64 = body.base64Encoded;
              } catch (error) {
                item.bodyError = error instanceof Error ? error.message : String(error);
              }
            }));
          }
          return ok(request.id, { networkRequests: requests });
        }
        case "route":
          return ok(request.id, { routeCount: 0 });
        case "unroute":
          return ok(request.id, { routeCount: 0 });
        case "clear":
          networkRequests.clear();
          return ok(request.id, {});
        default:
          return fail(request.id, `Unknown network subcommand: ${subCommand}`);
      }
    }
    case "console": {
      const subCommand = request.consoleCommand ?? "get";
      await ensureConsoleMonitoring(target.id);
      switch (subCommand) {
        case "get":
          return ok(request.id, { consoleMessages: consoleMessages.filter((item) => !request.filter || item.text.includes(request.filter)) });
        case "clear":
          consoleMessages.length = 0;
          return ok(request.id, {});
        default:
          return fail(request.id, `Unknown console subcommand: ${subCommand}`);
      }
    }
    case "errors": {
      const subCommand = request.errorsCommand ?? "get";
      await ensureConsoleMonitoring(target.id);
      switch (subCommand) {
        case "get":
          return ok(request.id, { jsErrors: jsErrors.filter((item) => !request.filter || item.message.includes(request.filter) || item.url?.includes(request.filter)) });
        case "clear":
          jsErrors.length = 0;
          return ok(request.id, {});
        default:
          return fail(request.id, `Unknown errors subcommand: ${subCommand}`);
      }
    }
    case "trace": {
      const subCommand = request.traceCommand ?? "status";
      switch (subCommand) {
        case "start":
          traceRecording = true;
          traceEvents.length = 0;
          return ok(request.id, { traceStatus: { recording: true, eventCount: 0 } });
        case "stop": {
          traceRecording = false;
          return ok(request.id, { traceEvents: [...traceEvents], traceStatus: { recording: false, eventCount: traceEvents.length } });
        }
        case "status":
          return ok(request.id, { traceStatus: { recording: traceRecording, eventCount: traceEvents.length } });
        default:
          return fail(request.id, `Unknown trace subcommand: ${subCommand}`);
      }
    }
    default:
      return fail(request.id, `Action not yet supported in direct CDP mode: ${request.action}`);
  }
}

// packages/cli/src/monitor-manager.ts
import { spawn as spawn2 } from "child_process";
import { mkdir as mkdir2, readFile as readFile2, writeFile as writeFile2, unlink } from "fs/promises";
import { request as httpRequest2 } from "http";
import { randomBytes } from "crypto";
import { fileURLToPath as fileURLToPath2 } from "url";
import { dirname, resolve } from "path";
import { existsSync as existsSync2 } from "fs";
import os3 from "os";
import path3 from "path";
var MONITOR_DIR = path3.join(os3.homedir(), ".bb-browser");
var PID_FILE = path3.join(MONITOR_DIR, "monitor.pid");
var PORT_FILE = path3.join(MONITOR_DIR, "monitor.port");
var TOKEN_FILE = path3.join(MONITOR_DIR, "monitor.token");
var DEFAULT_MONITOR_PORT = 19826;
function httpJson(method, url, token, body) {
  return new Promise((resolve3, reject) => {
    const parsed = new URL(url);
    const payload = body !== void 0 ? JSON.stringify(body) : void 0;
    const req = httpRequest2(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}
        },
        timeout: 5e3
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Monitor HTTP ${res.statusCode}: ${raw}`));
            return;
          }
          try {
            resolve3(JSON.parse(raw));
          } catch {
            reject(new Error(`Invalid JSON from monitor: ${raw}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Monitor request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}
async function readPortFile() {
  try {
    const raw = await readFile2(PORT_FILE, "utf8");
    const port = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}
async function readTokenFile() {
  try {
    return (await readFile2(TOKEN_FILE, "utf8")).trim();
  } catch {
    return null;
  }
}
async function ensureMonitorRunning() {
  const existingPort = await readPortFile();
  const existingToken = await readTokenFile();
  if (existingPort && existingToken) {
    try {
      const status = await httpJson(
        "GET",
        `http://127.0.0.1:${existingPort}/status`,
        existingToken
      );
      if (status.running) {
        return { port: existingPort, token: existingToken };
      }
    } catch {
    }
  }
  const cdp = await discoverCdpPort();
  if (!cdp) {
    throw new Error("Cannot start monitor: no browser connection found");
  }
  const token = randomBytes(32).toString("hex");
  const monitorPort = DEFAULT_MONITOR_PORT;
  const monitorScript = findMonitorScript();
  await mkdir2(MONITOR_DIR, { recursive: true });
  await writeFile2(TOKEN_FILE, token, { mode: 384 });
  const child = spawn2(process.execPath, [
    monitorScript,
    "--cdp-host",
    cdp.host,
    "--cdp-port",
    String(cdp.port),
    "--monitor-port",
    String(monitorPort),
    "--token",
    token
  ], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  const deadline = Date.now() + 5e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const status = await httpJson(
        "GET",
        `http://127.0.0.1:${monitorPort}/status`,
        token
      );
      if (status.running) {
        return { port: monitorPort, token };
      }
    } catch {
    }
  }
  throw new Error("Monitor process did not start in time");
}
async function monitorCommand(request) {
  const { port, token } = await ensureMonitorRunning();
  return httpJson(
    "POST",
    `http://127.0.0.1:${port}/command`,
    token,
    request
  );
}
function findMonitorScript() {
  const currentFile = fileURLToPath2(import.meta.url);
  const currentDir = dirname(currentFile);
  const candidates = [
    // Built output (tsup puts it next to cli.js)
    resolve(currentDir, "cdp-monitor.js"),
    // Development: packages/cli/src -> packages/cli/dist
    resolve(currentDir, "../dist/cdp-monitor.js"),
    // Monorepo root dist
    resolve(currentDir, "../../dist/cdp-monitor.js"),
    resolve(currentDir, "../../../dist/cdp-monitor.js")
  ];
  for (const candidate of candidates) {
    if (existsSync2(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

// packages/cli/src/client.ts
var MONITOR_ACTIONS = /* @__PURE__ */ new Set(["network", "console", "errors", "trace"]);
var jqExpression;
function setJqExpression(expression) {
  jqExpression = expression;
}
function printJqResults(response) {
  const target = response.data ?? response;
  const results = applyJq(target, jqExpression || ".");
  for (const result of results) {
    console.log(typeof result === "string" ? result : JSON.stringify(result));
  }
  process.exit(0);
}
function handleJqResponse(response) {
  if (jqExpression) {
    printJqResults(response);
  }
}
async function sendCommand2(request) {
  if (MONITOR_ACTIONS.has(request.action)) {
    try {
      return await monitorCommand(request);
    } catch {
      return sendCommand(request);
    }
  }
  return sendCommand(request);
}

// packages/cli/src/daemon-manager.ts
import { fileURLToPath as fileURLToPath3 } from "url";
import { dirname as dirname2, resolve as resolve2 } from "path";
import { existsSync as existsSync3 } from "fs";
async function isDaemonRunning() {
  return await isManagedBrowserRunning();
}
async function ensureDaemonRunning() {
  try {
    await ensureCdpConnection();
  } catch (error) {
    if (error instanceof Error && error.message.includes("No browser connection found")) {
      throw new Error([
        "bb-browser: Could not start browser.",
        "",
        "Make sure Chrome is installed, then try again.",
        "Or specify a CDP port manually: bb-browser --port 9222"
      ].join("\n"));
    }
    throw error;
  }
}

// packages/cli/src/history-sqlite.ts
import { copyFileSync, existsSync as existsSync4, unlinkSync as unlinkSync2 } from "fs";
import { execSync as execSync2 } from "child_process";
import { homedir, tmpdir } from "os";
import { join } from "path";
function getHistoryPathCandidates() {
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    join(home, "Library/Application Support/Google/Chrome/Default/History"),
    join(home, "Library/Application Support/Microsoft Edge/Default/History"),
    join(home, "Library/Application Support/BraveSoftware/Brave-Browser/Default/History"),
    join(home, "Library/Application Support/Arc/User Data/Default/History"),
    join(home, ".config/google-chrome/Default/History")
  ];
  if (localAppData) {
    candidates.push(
      join(localAppData, "Google/Chrome/User Data/Default/History"),
      join(localAppData, "Microsoft/Edge/User Data/Default/History")
    );
  }
  return candidates;
}
function findHistoryPath() {
  for (const historyPath of getHistoryPathCandidates()) {
    if (existsSync4(historyPath)) {
      return historyPath;
    }
  }
  return null;
}
function sqlEscape(value) {
  return value.replace(/'/g, "''");
}
function buildTimeWhere(days) {
  if (!days || days <= 0) {
    return "";
  }
  return `last_visit_time > (strftime('%s', 'now') - ${Math.floor(days)}*86400) * 1000000 + 11644473600000000`;
}
function runHistoryQuery(sql, mapRow) {
  const historyPath = findHistoryPath();
  if (!historyPath) {
    return [];
  }
  const tmpPath = join(tmpdir(), `bb-history-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    copyFileSync(historyPath, tmpPath);
    const escapedTmpPath = tmpPath.replace(/"/g, '\\"');
    const escapedSql = sql.replace(/"/g, '\\"');
    const output = execSync2(`sqlite3 -separator $'\\t' "${escapedTmpPath}" "${escapedSql}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return output.split("\n").filter(Boolean).map((line) => mapRow(line.split("	"))).filter((item) => item !== null);
  } catch {
    return [];
  } finally {
    try {
      unlinkSync2(tmpPath);
    } catch {
    }
  }
}
function searchHistory(query, days) {
  const conditions = [];
  const trimmedQuery = query?.trim();
  if (trimmedQuery) {
    const escapedQuery = sqlEscape(trimmedQuery);
    conditions.push(`(url LIKE '%${escapedQuery}%' OR title LIKE '%${escapedQuery}%')`);
  }
  const timeWhere = buildTimeWhere(days);
  if (timeWhere) {
    conditions.push(timeWhere);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT
      url,
      REPLACE(IFNULL(title, ''), char(9), ' '),
      IFNULL(visit_count, 0),
      IFNULL(last_visit_time, 0)
    FROM urls
    ${whereClause}
    ORDER BY last_visit_time DESC
    LIMIT 100;
  `.trim();
  return runHistoryQuery(sql, (row) => {
    if (row.length < 4) {
      return null;
    }
    const chromeTimestamp = Number(row[3]) || 0;
    return {
      url: row[0] || "",
      title: row[1] || "",
      visitCount: Number(row[2]) || 0,
      lastVisitTime: chromeTimestamp > 0 ? chromeTimestamp / 1e6 - 11644473600 : 0
    };
  });
}
function getHistoryDomains(days) {
  const timeWhere = buildTimeWhere(days);
  const whereClause = timeWhere ? `WHERE ${timeWhere}` : "";
  const sql = `
    SELECT
      domain,
      SUM(visit_count) AS visits,
      GROUP_CONCAT(title, char(31)) AS titles
    FROM (
      SELECT
        CASE
          WHEN instr(url, '//') > 0 AND instr(substr(url, instr(url, '//') + 2), '/') > 0
            THEN substr(
              substr(url, instr(url, '//') + 2),
              1,
              instr(substr(url, instr(url, '//') + 2), '/') - 1
            )
          WHEN instr(url, '//') > 0 THEN substr(url, instr(url, '//') + 2)
          WHEN instr(url, '/') > 0 THEN substr(url, 1, instr(url, '/') - 1)
          ELSE url
        END AS domain,
        IFNULL(visit_count, 0) AS visit_count,
        REPLACE(IFNULL(title, ''), char(31), ' ') AS title
      FROM urls
      ${whereClause}
    )
    WHERE domain != ''
    GROUP BY domain
    ORDER BY visits DESC
    LIMIT 50;
  `.trim();
  return runHistoryQuery(sql, (row) => {
    if (row.length < 3) {
      return null;
    }
    const titles = row[2] ? Array.from(new Set(row[2].split(String.fromCharCode(31)).map((title) => title.trim()).filter(Boolean))).slice(0, 10) : [];
    return {
      domain: row[0] || "",
      visits: Number(row[1]) || 0,
      titles
    };
  });
}

// packages/cli/src/commands/site.ts
import { readFileSync as readFileSync2, readdirSync, existsSync as existsSync5, mkdirSync } from "fs";
import { join as join2, relative } from "path";
import { homedir as homedir2 } from "os";
import { execSync as execSync3 } from "child_process";
var BB_DIR = join2(homedir2(), ".bb-browser");
var LOCAL_SITES_DIR = join2(BB_DIR, "sites");
var COMMUNITY_SITES_DIR = join2(BB_DIR, "bb-sites");
var COMMUNITY_REPO = "https://github.com/epiral/bb-sites.git";
function checkCliUpdate() {
  try {
    const current = execSync3("bb-browser --version", { timeout: 3e3, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    const latest = execSync3("npm view bb-browser version", { timeout: 5e3, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    if (latest && current && latest !== current && latest.localeCompare(current, void 0, { numeric: true }) > 0) {
      console.log(`
\u{1F4E6} bb-browser ${latest} available (current: ${current}). Run: npm install -g bb-browser`);
    }
  } catch {
  }
}
function exitJsonError(error, extra = {}) {
  console.log(JSON.stringify({ success: false, error, ...extra }, null, 2));
  process.exit(1);
}
function parseSiteMeta(filePath, source) {
  let content;
  try {
    content = readFileSync2(filePath, "utf-8");
  } catch {
    return null;
  }
  const sitesDir = source === "local" ? LOCAL_SITES_DIR : COMMUNITY_SITES_DIR;
  const relPath = relative(sitesDir, filePath);
  const defaultName = relPath.replace(/\.js$/, "").replace(/\\/g, "/");
  const metaMatch = content.match(/\/\*\s*@meta\s*\n([\s\S]*?)\*\//);
  if (metaMatch) {
    try {
      const metaJson = JSON.parse(metaMatch[1]);
      return {
        name: metaJson.name || defaultName,
        description: metaJson.description || "",
        domain: metaJson.domain || "",
        args: metaJson.args || {},
        capabilities: metaJson.capabilities,
        readOnly: metaJson.readOnly,
        example: metaJson.example,
        filePath,
        source
      };
    } catch {
    }
  }
  const meta = {
    name: defaultName,
    description: "",
    domain: "",
    args: {},
    filePath,
    source
  };
  const tagPattern = /\/\/\s*@(\w+)[ \t]+(.*)/g;
  let match;
  while ((match = tagPattern.exec(content)) !== null) {
    const [, key, value] = match;
    switch (key) {
      case "name":
        meta.name = value.trim();
        break;
      case "description":
        meta.description = value.trim();
        break;
      case "domain":
        meta.domain = value.trim();
        break;
      case "args":
        for (const arg of value.trim().split(/[,\s]+/).filter(Boolean)) {
          meta.args[arg] = { required: true };
        }
        break;
      case "example":
        meta.example = value.trim();
        break;
    }
  }
  return meta;
}
function scanSites(dir, source) {
  if (!existsSync5(dir)) return [];
  const sites = [];
  function walk(currentDir) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join2(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const meta = parseSiteMeta(fullPath, source);
        if (meta) sites.push(meta);
      }
    }
  }
  walk(dir);
  return sites;
}
function getSiteHintForDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const sites = getAllSites();
    const matched = sites.filter((s) => s.domain && (hostname === s.domain || hostname.endsWith("." + s.domain)));
    if (matched.length === 0) return null;
    const names = matched.map((s) => s.name);
    const example = matched[0].example || `bb-browser site ${names[0]}`;
    return `\u8BE5\u7F51\u7AD9\u6709 ${names.length} \u4E2A site adapter \u53EF\u76F4\u63A5\u83B7\u53D6\u6570\u636E\uFF0C\u65E0\u9700\u624B\u52A8\u64CD\u4F5C\u6D4F\u89C8\u5668\u3002\u8BD5\u8BD5: ${example}`;
  } catch {
    return null;
  }
}
function getAllSites() {
  const community = scanSites(COMMUNITY_SITES_DIR, "community");
  const local = scanSites(LOCAL_SITES_DIR, "local");
  const byName = /* @__PURE__ */ new Map();
  for (const s of community) byName.set(s.name, s);
  for (const s of local) byName.set(s.name, s);
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function matchTabOrigin(tabUrl, domain) {
  try {
    const tabOrigin = new URL(tabUrl).hostname;
    return tabOrigin === domain || tabOrigin.endsWith("." + domain);
  } catch {
    return false;
  }
}
function siteList(options) {
  const sites = getAllSites();
  if (sites.length === 0) {
    if (options.json) {
      console.log("[]");
      return;
    }
    console.log("\u672A\u627E\u5230\u4EFB\u4F55 site adapter\u3002");
    console.log("  \u5B89\u88C5\u793E\u533A adapter: bb-browser site update");
    console.log(`  \u79C1\u6709 adapter \u76EE\u5F55: ${LOCAL_SITES_DIR}`);
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(sites.map((s) => ({
      name: s.name,
      description: s.description,
      domain: s.domain,
      args: s.args,
      source: s.source
    })), null, 2));
    return;
  }
  const groups = /* @__PURE__ */ new Map();
  for (const s of sites) {
    const platform = s.name.split("/")[0];
    if (!groups.has(platform)) groups.set(platform, []);
    groups.get(platform).push(s);
  }
  for (const [platform, items] of groups) {
    console.log(`
${platform}/`);
    for (const s of items) {
      const cmd = s.name.split("/").slice(1).join("/");
      const src = s.source === "local" ? " (local)" : "";
      const desc = s.description ? ` - ${s.description}` : "";
      console.log(`  ${cmd.padEnd(20)}${desc}${src}`);
    }
  }
  console.log();
}
function siteSearch(query, options) {
  const sites = getAllSites();
  const q = query.toLowerCase();
  const matches = sites.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q)
  );
  if (matches.length === 0) {
    if (options.json) {
      console.log("[]");
      return;
    }
    console.log(`\u672A\u627E\u5230\u5339\u914D "${query}" \u7684 adapter\u3002`);
    console.log("  \u67E5\u770B\u6240\u6709: bb-browser site list");
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(matches.map((s) => ({
      name: s.name,
      description: s.description,
      domain: s.domain,
      source: s.source
    })), null, 2));
    return;
  }
  for (const s of matches) {
    const src = s.source === "local" ? " (local)" : "";
    console.log(`${s.name.padEnd(24)} ${s.description}${src}`);
  }
}
function siteUpdate(options = {}) {
  mkdirSync(BB_DIR, { recursive: true });
  const updateMode = existsSync5(join2(COMMUNITY_SITES_DIR, ".git")) ? "pull" : "clone";
  if (updateMode === "pull") {
    if (!options.json) {
      console.log("\u66F4\u65B0\u793E\u533A site adapter \u5E93...");
    }
    try {
      execSync3("git pull --ff-only", { cwd: COMMUNITY_SITES_DIR, stdio: "pipe" });
      if (!options.json) {
        console.log("\u66F4\u65B0\u5B8C\u6210\u3002");
        console.log("");
        console.log("\u{1F4A1} \u8FD0\u884C bb-browser site recommend \u770B\u770B\u54EA\u4E9B\u548C\u4F60\u7684\u6D4F\u89C8\u4E60\u60EF\u5339\u914D");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const manualAction = "cd ~/.bb-browser/bb-sites && git pull";
      if (options.json) {
        exitJsonError(`\u66F4\u65B0\u5931\u8D25: ${message}`, { action: manualAction, updateMode });
      }
      console.error(`\u66F4\u65B0\u5931\u8D25: ${e instanceof Error ? e.message : e}`);
      console.error("  \u624B\u52A8\u4FEE\u590D: cd ~/.bb-browser/bb-sites && git pull");
      process.exit(1);
    }
  } else {
    if (!options.json) {
      console.log(`\u514B\u9686\u793E\u533A adapter \u5E93: ${COMMUNITY_REPO}`);
    }
    try {
      execSync3(`git clone ${COMMUNITY_REPO} ${COMMUNITY_SITES_DIR}`, { stdio: "pipe" });
      if (!options.json) {
        console.log("\u514B\u9686\u5B8C\u6210\u3002");
        console.log("");
        console.log("\u{1F4A1} \u8FD0\u884C bb-browser site recommend \u770B\u770B\u54EA\u4E9B\u548C\u4F60\u7684\u6D4F\u89C8\u4E60\u60EF\u5339\u914D");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const manualAction = `git clone ${COMMUNITY_REPO} ~/.bb-browser/bb-sites`;
      if (options.json) {
        exitJsonError(`\u514B\u9686\u5931\u8D25: ${message}`, { action: manualAction, updateMode });
      }
      console.error(`\u514B\u9686\u5931\u8D25: ${e instanceof Error ? e.message : e}`);
      console.error(`  \u624B\u52A8\u4FEE\u590D: git clone ${COMMUNITY_REPO} ~/.bb-browser/bb-sites`);
      process.exit(1);
    }
  }
  const sites = scanSites(COMMUNITY_SITES_DIR, "community");
  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      updateMode,
      communityRepo: COMMUNITY_REPO,
      communityDir: COMMUNITY_SITES_DIR,
      siteCount: sites.length
    }, null, 2));
    return;
  }
  console.log(`\u5DF2\u5B89\u88C5 ${sites.length} \u4E2A\u793E\u533A adapter\u3002`);
  console.log(`\u2B50 Like bb-browser? \u2192 bb-browser star`);
  checkCliUpdate();
}
function findSiteByName(name) {
  return getAllSites().find((site) => site.name === name);
}
function siteInfo(name, options) {
  const site = findSiteByName(name);
  if (!site) {
    if (options.json) {
      exitJsonError(`adapter "${name}" not found`, { action: "bb-browser site list" });
    }
    console.error(`[error] site info: adapter "${name}" not found.`);
    console.error("  Try: bb-browser site list");
    process.exit(1);
  }
  const meta = {
    name: site.name,
    description: site.description,
    domain: site.domain,
    args: site.args,
    example: site.example,
    readOnly: site.readOnly
  };
  if (options.json) {
    console.log(JSON.stringify(meta, null, 2));
    return;
  }
  console.log(`${site.name} \u2014 ${site.description}`);
  console.log();
  console.log("\u53C2\u6570\uFF1A");
  const argEntries = Object.entries(site.args);
  if (argEntries.length === 0) {
    console.log("  \uFF08\u65E0\uFF09");
  } else {
    for (const [argName, argDef] of argEntries) {
      const requiredText = argDef.required ? "\u5FC5\u586B" : "\u53EF\u9009";
      const description = argDef.description || "";
      console.log(`  ${argName} (${requiredText})    ${description}`.trimEnd());
    }
  }
  console.log();
  console.log("\u793A\u4F8B\uFF1A");
  console.log(`  ${site.example || `bb-browser site ${site.name}`}`);
  console.log();
  console.log(`\u57DF\u540D\uFF1A${site.domain || "\uFF08\u672A\u58F0\u660E\uFF09"}`);
  console.log(`\u53EA\u8BFB\uFF1A${site.readOnly ? "\u662F" : "\u5426"}`);
}
async function siteRecommend(options) {
  const days = options.days ?? 30;
  const historyDomains = getHistoryDomains(days);
  const sites = getAllSites();
  const sitesByDomain = /* @__PURE__ */ new Map();
  for (const site of sites) {
    if (!site.domain) continue;
    const domain = site.domain.toLowerCase();
    const existing = sitesByDomain.get(domain) || [];
    existing.push(site);
    sitesByDomain.set(domain, existing);
  }
  const available = [];
  const notAvailable = [];
  for (const item of historyDomains) {
    const adapters = sitesByDomain.get(item.domain.toLowerCase());
    if (adapters && adapters.length > 0) {
      const sortedAdapters = [...adapters].sort((a, b) => a.name.localeCompare(b.name));
      available.push({
        domain: item.domain,
        visits: item.visits,
        adapterCount: sortedAdapters.length,
        adapters: sortedAdapters.map((site) => ({
          name: site.name,
          description: site.description,
          example: site.example || `bb-browser site ${site.name}`
        }))
      });
    } else if (item.visits >= 5 && item.domain && !item.domain.includes("localhost") && item.domain.includes(".")) {
      notAvailable.push(item);
    }
  }
  const jsonData = {
    days,
    available,
    not_available: notAvailable
  };
  if (options.jq) {
    handleJqResponse({ id: generateId(), success: true, data: jsonData });
  }
  if (options.json) {
    console.log(JSON.stringify(jsonData, null, 2));
    return;
  }
  console.log(`\u57FA\u4E8E\u4F60\u6700\u8FD1 ${days} \u5929\u7684\u6D4F\u89C8\u8BB0\u5F55\uFF1A`);
  console.log();
  console.log("\u{1F3AF} \u4F60\u5E38\u7528\u8FD9\u4E9B\u7F51\u7AD9\uFF0C\u53EF\u4EE5\u76F4\u63A5\u7528\uFF1A");
  console.log();
  if (available.length === 0) {
    console.log("  \uFF08\u6682\u65E0\u5339\u914D\u7684 adapter\uFF09");
  } else {
    for (const item of available) {
      console.log(`  ${item.domain.padEnd(20)} ${item.visits} \u6B21\u8BBF\u95EE    ${item.adapterCount} \u4E2A\u547D\u4EE4`);
      console.log(`    \u8BD5\u8BD5: ${item.adapters[0]?.example || `bb-browser site ${item.adapters[0]?.name || ""}`}`);
      console.log();
    }
  }
  console.log("\u{1F4CB} \u4F60\u5E38\u7528\u4F46\u8FD8\u6CA1\u6709 adapter\uFF1A");
  console.log();
  if (notAvailable.length === 0) {
    console.log("  \uFF08\u6682\u65E0\uFF09");
  } else {
    for (const item of notAvailable) {
      console.log(`  ${item.domain.padEnd(20)} ${item.visits} \u6B21\u8BBF\u95EE`);
    }
  }
  console.log();
  console.log('\u{1F4A1} \u8DDF\u4F60\u7684 AI Agent \u8BF4 "\u628A notion.so CLI \u5316"\uFF0C\u5B83\u5C31\u80FD\u81EA\u52A8\u5B8C\u6210\u3002');
  console.log();
  console.log(`\u6240\u6709\u5206\u6790\u7EAF\u672C\u5730\u5B8C\u6210\u3002\u7528 --days 7 \u53EA\u770B\u6700\u8FD1\u4E00\u5468\u3002`);
}
async function siteRun(name, args, options) {
  const sites = getAllSites();
  const site = sites.find((s) => s.name === name);
  if (!site) {
    const fuzzy = sites.filter((s) => s.name.includes(name));
    if (options.json) {
      exitJsonError(`site "${name}" not found`, {
        suggestions: fuzzy.slice(0, 5).map((s) => s.name),
        action: fuzzy.length > 0 ? void 0 : "bb-browser site update"
      });
    }
    console.error(`[error] site: "${name}" not found.`);
    if (fuzzy.length > 0) {
      console.error("  Did you mean:");
      for (const s of fuzzy.slice(0, 5)) {
        console.error(`    bb-browser site ${s.name}`);
      }
    } else {
      console.error("  Try: bb-browser site list");
      console.error("  Or:  bb-browser site update");
    }
    process.exit(1);
  }
  const argNames = Object.keys(site.args);
  const argMap = {};
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const flagName = args[i].slice(2);
      if (flagName in site.args && args[i + 1]) {
        argMap[flagName] = args[i + 1];
        i++;
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }
  let posIdx = 0;
  for (const argName of argNames) {
    if (!argMap[argName] && posIdx < positionalArgs.length) {
      argMap[argName] = positionalArgs[posIdx++];
    }
  }
  for (const [argName, argDef] of Object.entries(site.args)) {
    if (argDef.required && !argMap[argName]) {
      const usage = argNames.map((a) => {
        const def = site.args[a];
        return def.required ? `<${a}>` : `[${a}]`;
      }).join(" ");
      if (options.json) {
        exitJsonError(`missing required argument "${argName}"`, {
          usage: `bb-browser site ${name} ${usage}`,
          example: site.example
        });
      }
      console.error(`[error] site ${name}: missing required argument "${argName}".`);
      console.error(`  Usage: bb-browser site ${name} ${usage}`);
      if (site.example) console.error(`  Example: ${site.example}`);
      process.exit(1);
    }
  }
  const jsContent = readFileSync2(site.filePath, "utf-8");
  const jsBody = jsContent.replace(/\/\*\s*@meta[\s\S]*?\*\//, "").trim();
  const argsJson = JSON.stringify(argMap);
  const script = `(${jsBody})(${argsJson})`;
  if (options.openclaw) {
    const { ocGetTabs, ocFindTabByDomain, ocOpenTab, ocEvaluate } = await import("./openclaw-bridge-7BW5M4YX.js");
    let targetId;
    if (site.domain) {
      const tabs = ocGetTabs();
      const existing = ocFindTabByDomain(tabs, site.domain);
      if (existing) {
        targetId = existing.targetId;
      } else {
        targetId = ocOpenTab(`https://${site.domain}`);
        await new Promise((resolve3) => setTimeout(resolve3, 3e3));
      }
    } else {
      const tabs = ocGetTabs();
      if (tabs.length === 0) {
        throw new Error("No tabs open in OpenClaw browser");
      }
      targetId = tabs[0].targetId;
    }
    const wrappedFn = `async () => { const __fn = ${jsBody}; return await __fn(${argsJson}); }`;
    const parsed2 = ocEvaluate(targetId, wrappedFn);
    if (typeof parsed2 === "object" && parsed2 !== null && "error" in parsed2) {
      const errObj = parsed2;
      const checkText = `${errObj.error} ${errObj.hint || ""}`;
      const isAuthError = /401|403|unauthorized|forbidden|not.?logged|login.?required|sign.?in|auth/i.test(checkText);
      const loginHint = isAuthError && site.domain ? `Please log in to https://${site.domain} in your OpenClaw browser first, then retry.` : void 0;
      const hint = loginHint || errObj.hint;
      const reportHint = `If this is an adapter bug, report via: gh issue create --repo epiral/bb-sites --title "[${name}] <description>" OR: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] <description>"`;
      if (options.json) {
        console.log(JSON.stringify({ id: "openclaw", success: false, error: errObj.error, hint, reportHint }));
      } else {
        console.error(`[error] site ${name}: ${errObj.error}`);
        if (hint) console.error(`  Hint: ${hint}`);
        console.error(`  Report: gh issue create --repo epiral/bb-sites --title "[${name}] ..."`);
        console.error(`     or: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] ..."`);
      }
      process.exit(1);
    }
    if (options.jq) {
      const { applyJq: applyJq2 } = await import("./jq-HHMLHEPA.js");
      const expr = options.jq.replace(/^\.data\./, ".");
      const results = applyJq2(parsed2, expr);
      for (const r of results) {
        console.log(typeof r === "string" ? r : JSON.stringify(r));
      }
    } else if (options.json) {
      console.log(JSON.stringify({ id: "openclaw", success: true, data: parsed2 }));
    } else {
      console.log(JSON.stringify(parsed2, null, 2));
    }
    return;
  }
  await ensureDaemonRunning();
  let targetTabId = options.tabId;
  if (!targetTabId && site.domain) {
    const listReq = { id: generateId(), action: "tab_list" };
    const listResp = await sendCommand2(listReq);
    if (listResp.success && listResp.data?.tabs) {
      const matchingTab = listResp.data.tabs.find(
        (tab) => matchTabOrigin(tab.url, site.domain)
      );
      if (matchingTab) {
        targetTabId = matchingTab.tabId;
      }
    }
    if (!targetTabId) {
      const newResp = await sendCommand2({
        id: generateId(),
        action: "tab_new",
        url: `https://${site.domain}`
      });
      targetTabId = newResp.data?.tabId;
      await new Promise((resolve3) => setTimeout(resolve3, 3e3));
    }
  }
  const evalReq = { id: generateId(), action: "eval", script, tabId: targetTabId };
  const evalResp = await sendCommand2(evalReq);
  if (!evalResp.success) {
    const hint = site.domain ? `Open https://${site.domain} in your browser, make sure you are logged in, then retry.` : void 0;
    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: false, error: evalResp.error || "eval failed", hint }));
    } else {
      console.error(`[error] site ${name}: ${evalResp.error || "eval failed"}`);
      if (hint) console.error(`  Hint: ${hint}`);
    }
    process.exit(1);
  }
  const result = evalResp.data?.result;
  if (result === void 0 || result === null) {
    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: true, data: null }));
    } else {
      console.log("(no output)");
    }
    return;
  }
  let parsed;
  try {
    parsed = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    parsed = result;
  }
  if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
    const errObj = parsed;
    const checkText = `${errObj.error} ${errObj.hint || ""}`;
    const isAuthError = /401|403|unauthorized|forbidden|not.?logged|login.?required|sign.?in|auth/i.test(checkText);
    const loginHint = isAuthError && site.domain ? `Please log in to https://${site.domain} in your browser first, then retry.` : void 0;
    const hint = loginHint || errObj.hint;
    const reportHint = `If this is an adapter bug, report via: gh issue create --repo epiral/bb-sites --title "[${name}] <description>" OR: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] <description>"`;
    if (options.json) {
      console.log(JSON.stringify({ id: evalReq.id, success: false, error: errObj.error, hint, reportHint }));
    } else {
      console.error(`[error] site ${name}: ${errObj.error}`);
      if (hint) console.error(`  Hint: ${hint}`);
      console.error(`  Report: gh issue create --repo epiral/bb-sites --title "[${name}] ..."`);
      console.error(`     or: bb-browser site github/issue-create epiral/bb-sites --title "[${name}] ..."`);
    }
    process.exit(1);
  }
  if (options.jq) {
    const { applyJq: applyJq2 } = await import("./jq-HHMLHEPA.js");
    const expr = options.jq.replace(/^\.data\./, ".");
    const results = applyJq2(parsed, expr);
    for (const r of results) {
      console.log(typeof r === "string" ? r : JSON.stringify(r));
    }
  } else if (options.json) {
    console.log(JSON.stringify({ id: evalReq.id, success: true, data: parsed }));
  } else {
    console.log(JSON.stringify(parsed, null, 2));
  }
}
async function siteCommand(args, options = {}) {
  const subCommand = args[0];
  if (!subCommand || subCommand === "--help" || subCommand === "-h") {
    console.log(`bb-browser site - \u7F51\u7AD9 CLI \u5316\uFF08\u7BA1\u7406\u548C\u8FD0\u884C site adapter\uFF09

\u7528\u6CD5:
  bb-browser site list                      \u5217\u51FA\u6240\u6709\u53EF\u7528 adapter
  bb-browser site info <name>               \u67E5\u770B adapter \u5143\u4FE1\u606F
  bb-browser site recommend                 \u57FA\u4E8E\u5386\u53F2\u8BB0\u5F55\u63A8\u8350 adapter
  bb-browser site search <query>            \u641C\u7D22 adapter
  bb-browser site <name> [args...]          \u8FD0\u884C adapter\uFF08\u7B80\u5199\uFF09
  bb-browser site run <name> [args...]      \u8FD0\u884C adapter
  bb-browser site update                    \u66F4\u65B0\u793E\u533A adapter \u5E93 (git clone/pull)

\u76EE\u5F55:
  ${LOCAL_SITES_DIR}      \u79C1\u6709 adapter\uFF08\u4F18\u5148\uFF09
  ${COMMUNITY_SITES_DIR}   \u793E\u533A adapter

\u793A\u4F8B:
  bb-browser site update
  bb-browser site list
  bb-browser site reddit/thread https://www.reddit.com/r/LocalLLaMA/comments/...
  bb-browser site twitter/user yan5xu
  bb-browser site search reddit

\u521B\u5EFA\u65B0 adapter: bb-browser guide
\u62A5\u544A\u95EE\u9898: gh issue create --repo epiral/bb-sites --title "[adapter-name] \u63CF\u8FF0"
\u8D21\u732E\u793E\u533A: https://github.com/epiral/bb-sites`);
    return;
  }
  switch (subCommand) {
    case "list":
      siteList(options);
      break;
    case "search":
      if (!args[1]) {
        console.error("[error] site search: <query> is required.");
        console.error("  Usage: bb-browser site search <query>");
        process.exit(1);
      }
      siteSearch(args[1], options);
      break;
    case "info":
      if (!args[1]) {
        console.error("[error] site info: <name> is required.");
        console.error("  Usage: bb-browser site info <name>");
        process.exit(1);
      }
      siteInfo(args[1], options);
      break;
    case "recommend":
      await siteRecommend(options);
      break;
    case "update":
      siteUpdate(options);
      break;
    case "run":
      if (!args[1]) {
        console.error("[error] site run: <name> is required.");
        console.error("  Usage: bb-browser site run <name> [args...]");
        console.error("  Try: bb-browser site list");
        process.exit(1);
      }
      await siteRun(args[1], args.slice(2), options);
      break;
    default:
      if (subCommand.includes("/")) {
        await siteRun(subCommand, args.slice(1), options);
      } else {
        console.error(`[error] site: unknown subcommand "${subCommand}".`);
        console.error("  Available: list, info, recommend, search, run, update");
        console.error("  Try: bb-browser site --help");
        process.exit(1);
      }
      break;
  }
  silentUpdate();
}
function silentUpdate() {
  const gitDir = join2(COMMUNITY_SITES_DIR, ".git");
  if (!existsSync5(gitDir)) return;
  import("child_process").then(({ spawn: spawn3 }) => {
    const child = spawn3("git", ["pull", "--ff-only"], {
      cwd: COMMUNITY_SITES_DIR,
      stdio: "ignore",
      detached: true
    });
    child.unref();
  }).catch(() => {
  });
}

// packages/cli/src/commands/open.ts
async function openCommand(url, options = {}) {
  if (!url) {
    throw new Error("\u7F3A\u5C11 URL \u53C2\u6570");
  }
  await ensureDaemonRunning();
  let normalizedUrl = url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    normalizedUrl = "https://" + url;
  }
  const request = {
    id: generateId(),
    action: "open",
    url: normalizedUrl
  };
  if (options.tab !== void 0) {
    if (options.tab === "current") {
      request.tabId = "current";
    } else {
      const tabId = parseInt(options.tab, 10);
      if (isNaN(tabId)) {
        throw new Error(`\u65E0\u6548\u7684 tabId: ${options.tab}`);
      }
      request.tabId = tabId;
    }
  }
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      console.log(`\u5DF2\u6253\u5F00: ${response.data?.url ?? normalizedUrl}`);
      if (response.data?.title) {
        console.log(`\u6807\u9898: ${response.data.title}`);
      }
      if (response.data?.tabId) {
        console.log(`Tab ID: ${response.data.tabId}`);
      }
      const siteHint = getSiteHintForDomain(normalizedUrl);
      if (siteHint) {
        console.log(`
\u{1F4A1} ${siteHint}`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/snapshot.ts
async function snapshotCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "snapshot",
    interactive: options.interactive,
    compact: options.compact,
    maxDepth: options.maxDepth,
    selector: options.selector,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      console.log(`\u6807\u9898: ${response.data?.title ?? "(\u65E0\u6807\u9898)"}`);
      console.log(`URL: ${response.data?.url ?? "(\u672A\u77E5)"}`);
      if (response.data?.snapshotData?.snapshot) {
        console.log("");
        console.log(response.data.snapshotData.snapshot);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/click.ts
function parseRef2(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function clickCommand(ref, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef2(ref);
  const request = {
    id: generateId(),
    action: "click",
    ref: parsedRef,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "element";
      const name = response.data?.name;
      if (name) {
        console.log(`\u5DF2\u70B9\u51FB: ${role} "${name}"`);
      } else {
        console.log(`\u5DF2\u70B9\u51FB: ${role}`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/hover.ts
function parseRef3(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function hoverCommand(ref, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef3(ref);
  const request = {
    id: generateId(),
    action: "hover",
    ref: parsedRef,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "element";
      const name = response.data?.name;
      if (name) {
        console.log(`\u5DF2\u60AC\u505C: ${role} "${name}"`);
      } else {
        console.log(`\u5DF2\u60AC\u505C: ${role}`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/fill.ts
function parseRef4(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function fillCommand(ref, text, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  if (text === void 0 || text === null) {
    throw new Error("\u7F3A\u5C11 text \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef4(ref);
  const request = {
    id: generateId(),
    action: "fill",
    ref: parsedRef,
    text,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "element";
      const name = response.data?.name;
      if (name) {
        console.log(`\u5DF2\u586B\u5145: ${role} "${name}"`);
      } else {
        console.log(`\u5DF2\u586B\u5145: ${role}`);
      }
      console.log(`\u5185\u5BB9: "${text}"`);
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/type.ts
function parseRef5(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function typeCommand(ref, text, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  if (text === void 0 || text === null) {
    throw new Error("\u7F3A\u5C11 text \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef5(ref);
  const request = {
    id: generateId(),
    action: "type",
    ref: parsedRef,
    text,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "element";
      const name = response.data?.name;
      if (name) {
        console.log(`\u5DF2\u8F93\u5165: ${role} "${name}"`);
      } else {
        console.log(`\u5DF2\u8F93\u5165: ${role}`);
      }
      console.log(`\u5185\u5BB9: "${text}"`);
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/close.ts
async function closeCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "close",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const title = response.data?.title ?? "";
      if (title) {
        console.log(`\u5DF2\u5173\u95ED: "${title}"`);
      } else {
        console.log("\u5DF2\u5173\u95ED\u5F53\u524D\u6807\u7B7E\u9875");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/get.ts
function parseRef6(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function getCommand(attribute, ref, options = {}) {
  if (attribute === "text" && !ref) {
    throw new Error("get text \u9700\u8981 ref \u53C2\u6570\uFF0C\u5982: get text @5");
  }
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "get",
    attribute,
    ref: ref ? parseRef6(ref) : void 0,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const value = response.data?.value ?? "";
      console.log(value);
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/screenshot.ts
import fs from "fs";
import path4 from "path";
import os4 from "os";
function getDefaultPath() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const filename = `bb-screenshot-${timestamp}.png`;
  return path4.join(os4.tmpdir(), filename);
}
function saveBase64Image(dataUrl, filePath) {
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const dir = path4.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
}
async function screenshotCommand(outputPath, options = {}) {
  await ensureDaemonRunning();
  const filePath = outputPath ? path4.resolve(outputPath) : getDefaultPath();
  const request = {
    id: generateId(),
    action: "screenshot",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (response.success && response.data?.dataUrl) {
    const dataUrl = response.data.dataUrl;
    saveBase64Image(dataUrl, filePath);
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        path: filePath,
        base64: dataUrl
      }, null, 2));
    } else {
      console.log(`\u622A\u56FE\u5DF2\u4FDD\u5B58: ${filePath}`);
    }
  } else {
    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
    }
    process.exit(1);
  }
}

// packages/cli/src/commands/wait.ts
function isTimeWait(target) {
  return /^\d+$/.test(target);
}
function parseRef7(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function waitCommand(target, options = {}) {
  if (!target) {
    throw new Error("\u7F3A\u5C11\u7B49\u5F85\u76EE\u6807\u53C2\u6570");
  }
  await ensureDaemonRunning();
  let request;
  if (isTimeWait(target)) {
    const ms = parseInt(target, 10);
    request = {
      id: generateId(),
      action: "wait",
      waitType: "time",
      ms,
      tabId: options.tabId
    };
  } else {
    const ref = parseRef7(target);
    request = {
      id: generateId(),
      action: "wait",
      waitType: "element",
      ref,
      tabId: options.tabId
    };
  }
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      if (isTimeWait(target)) {
        console.log(`\u5DF2\u7B49\u5F85 ${target}ms`);
      } else {
        console.log(`\u5143\u7D20 @${parseRef7(target)} \u5DF2\u51FA\u73B0`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/press.ts
function parseKey(keyString) {
  const parts = keyString.split("+");
  const modifierNames = ["Control", "Alt", "Shift", "Meta"];
  const modifiers = [];
  let key = "";
  for (const part of parts) {
    if (modifierNames.includes(part)) {
      modifiers.push(part);
    } else {
      key = part;
    }
  }
  return { key, modifiers };
}
async function pressCommand(keyString, options = {}) {
  if (!keyString) {
    throw new Error("\u7F3A\u5C11 key \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const { key, modifiers } = parseKey(keyString);
  if (!key) {
    throw new Error("\u65E0\u6548\u7684\u6309\u952E\u683C\u5F0F");
  }
  const request = {
    id: generateId(),
    action: "press",
    key,
    modifiers,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const displayKey = modifiers.length > 0 ? `${modifiers.join("+")}+${key}` : key;
      console.log(`\u5DF2\u6309\u4E0B: ${displayKey}`);
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/scroll.ts
var VALID_DIRECTIONS = ["up", "down", "left", "right"];
var DEFAULT_PIXELS = 300;
async function scrollCommand(direction, pixels, options = {}) {
  if (!direction) {
    throw new Error("\u7F3A\u5C11 direction \u53C2\u6570");
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    throw new Error(
      `\u65E0\u6548\u7684\u6EDA\u52A8\u65B9\u5411: ${direction}\uFF0C\u652F\u6301: ${VALID_DIRECTIONS.join(", ")}`
    );
  }
  let pixelValue = DEFAULT_PIXELS;
  if (pixels !== void 0) {
    pixelValue = parseInt(pixels, 10);
    if (isNaN(pixelValue) || pixelValue <= 0) {
      throw new Error(`\u65E0\u6548\u7684\u50CF\u7D20\u503C: ${pixels}`);
    }
  }
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "scroll",
    direction,
    pixels: pixelValue,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      console.log(`\u5DF2\u6EDA\u52A8: ${direction} ${pixelValue}px`);
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/nav.ts
async function backCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "back",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const url = response.data?.url ?? "";
      if (url) {
        console.log(`\u540E\u9000\u81F3: ${url}`);
      } else {
        console.log("\u5DF2\u540E\u9000");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}
async function forwardCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "forward",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const url = response.data?.url ?? "";
      if (url) {
        console.log(`\u524D\u8FDB\u81F3: ${url}`);
      } else {
        console.log("\u5DF2\u524D\u8FDB");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}
async function refreshCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "refresh",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const title = response.data?.title ?? "";
      if (title) {
        console.log(`\u5DF2\u5237\u65B0: "${title}"`);
      } else {
        console.log("\u5DF2\u5237\u65B0\u9875\u9762");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/check.ts
function parseRef8(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function checkCommand(ref, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef8(ref);
  const request = {
    id: generateId(),
    action: "check",
    ref: parsedRef,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "checkbox";
      const name = response.data?.name;
      const wasAlreadyChecked = response.data?.wasAlreadyChecked;
      if (wasAlreadyChecked) {
        if (name) {
          console.log(`\u5DF2\u52FE\u9009\uFF08\u4E4B\u524D\u5DF2\u52FE\u9009\uFF09: ${role} "${name}"`);
        } else {
          console.log(`\u5DF2\u52FE\u9009\uFF08\u4E4B\u524D\u5DF2\u52FE\u9009\uFF09: ${role}`);
        }
      } else {
        if (name) {
          console.log(`\u5DF2\u52FE\u9009: ${role} "${name}"`);
        } else {
          console.log(`\u5DF2\u52FE\u9009: ${role}`);
        }
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}
async function uncheckCommand(ref, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef8(ref);
  const request = {
    id: generateId(),
    action: "uncheck",
    ref: parsedRef,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "checkbox";
      const name = response.data?.name;
      const wasAlreadyUnchecked = response.data?.wasAlreadyUnchecked;
      if (wasAlreadyUnchecked) {
        if (name) {
          console.log(`\u5DF2\u53D6\u6D88\u52FE\u9009\uFF08\u4E4B\u524D\u672A\u52FE\u9009\uFF09: ${role} "${name}"`);
        } else {
          console.log(`\u5DF2\u53D6\u6D88\u52FE\u9009\uFF08\u4E4B\u524D\u672A\u52FE\u9009\uFF09: ${role}`);
        }
      } else {
        if (name) {
          console.log(`\u5DF2\u53D6\u6D88\u52FE\u9009: ${role} "${name}"`);
        } else {
          console.log(`\u5DF2\u53D6\u6D88\u52FE\u9009: ${role}`);
        }
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/select.ts
function parseRef9(ref) {
  return ref.startsWith("@") ? ref.slice(1) : ref;
}
async function selectCommand(ref, value, options = {}) {
  if (!ref) {
    throw new Error("\u7F3A\u5C11 ref \u53C2\u6570");
  }
  if (value === void 0 || value === null) {
    throw new Error("\u7F3A\u5C11 value \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const parsedRef = parseRef9(ref);
  const request = {
    id: generateId(),
    action: "select",
    ref: parsedRef,
    value,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const role = response.data?.role ?? "combobox";
      const name = response.data?.name;
      const selectedValue = response.data?.selectedValue;
      const selectedLabel = response.data?.selectedLabel;
      if (name) {
        console.log(`\u5DF2\u9009\u62E9: ${role} "${name}"`);
      } else {
        console.log(`\u5DF2\u9009\u62E9: ${role}`);
      }
      if (selectedLabel && selectedLabel !== selectedValue) {
        console.log(`\u9009\u9879: "${selectedLabel}" (value="${selectedValue}")`);
      } else {
        console.log(`\u9009\u9879: "${selectedValue}"`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/eval.ts
async function evalCommand(script, options = {}) {
  if (!script) {
    throw new Error("\u7F3A\u5C11 script \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "eval",
    script,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const result = response.data?.result;
      if (result !== void 0) {
        if (typeof result === "object" && result !== null) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result);
        }
      } else {
        console.log("undefined");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/tab.ts
function parseTabSubcommand(args, rawArgv) {
  let tabId;
  if (rawArgv) {
    const idIdx = rawArgv.indexOf("--id");
    if (idIdx >= 0 && rawArgv[idIdx + 1]) {
      tabId = parseInt(rawArgv[idIdx + 1], 10);
      if (isNaN(tabId)) {
        throw new Error(`\u65E0\u6548\u7684 tabId: ${rawArgv[idIdx + 1]}`);
      }
    }
  }
  if (args.length === 0) {
    return { action: "tab_list" };
  }
  const first = args[0];
  if (first === "list") {
    return { action: "tab_list" };
  }
  if (first === "new") {
    return { action: "tab_new", url: args[1] };
  }
  if (first === "select") {
    if (tabId !== void 0) {
      return { action: "tab_select", tabId };
    }
    throw new Error("tab select \u9700\u8981 --id \u53C2\u6570\uFF0C\u7528\u6CD5\uFF1Abb-browser tab select --id <tabId>");
  }
  if (first === "close") {
    if (tabId !== void 0) {
      return { action: "tab_close", tabId };
    }
    const indexArg = args[1];
    if (indexArg !== void 0) {
      const index2 = parseInt(indexArg, 10);
      if (isNaN(index2) || index2 < 0) {
        throw new Error(`\u65E0\u6548\u7684\u6807\u7B7E\u9875\u7D22\u5F15: ${indexArg}`);
      }
      return { action: "tab_close", index: index2 };
    }
    return { action: "tab_close" };
  }
  const index = parseInt(first, 10);
  if (!isNaN(index) && index >= 0) {
    return { action: "tab_select", index };
  }
  throw new Error(`\u672A\u77E5\u7684 tab \u5B50\u547D\u4EE4: ${first}`);
}
function formatTabList(tabs, activeIndex) {
  const lines = [];
  lines.push(`\u6807\u7B7E\u9875\u5217\u8868\uFF08\u5171 ${tabs.length} \u4E2A\uFF0C\u5F53\u524D #${activeIndex}\uFF09\uFF1A`);
  for (const tab of tabs) {
    const prefix = tab.active ? "*" : " ";
    const title = tab.title || "(\u65E0\u6807\u9898)";
    lines.push(`${prefix} [${tab.index}] ${tab.url} - ${title}`);
  }
  return lines.join("\n");
}
async function tabCommand(args, options = {}) {
  await ensureDaemonRunning();
  const parsed = parseTabSubcommand(args, process.argv);
  const request = {
    id: generateId(),
    action: parsed.action,
    url: parsed.url,
    index: parsed.index,
    tabId: parsed.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      switch (parsed.action) {
        case "tab_list": {
          const tabs = response.data?.tabs ?? [];
          const activeIndex = response.data?.activeIndex ?? 0;
          console.log(formatTabList(tabs, activeIndex));
          break;
        }
        case "tab_new": {
          const url = response.data?.url ?? "about:blank";
          console.log(`\u5DF2\u521B\u5EFA\u65B0\u6807\u7B7E\u9875: ${url}`);
          break;
        }
        case "tab_select": {
          const title = response.data?.title ?? "(\u65E0\u6807\u9898)";
          const url = response.data?.url ?? "";
          console.log(`\u5DF2\u5207\u6362\u5230\u6807\u7B7E\u9875 #${parsed.index}: ${title}`);
          console.log(`  URL: ${url}`);
          break;
        }
        case "tab_close": {
          const closedTitle = response.data?.title ?? "(\u65E0\u6807\u9898)";
          console.log(`\u5DF2\u5173\u95ED\u6807\u7B7E\u9875: ${closedTitle}`);
          break;
        }
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/frame.ts
async function frameCommand(selector, options = {}) {
  if (!selector) {
    throw new Error("\u7F3A\u5C11 selector \u53C2\u6570");
  }
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "frame",
    selector,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const frameInfo = response.data?.frameInfo;
      if (frameInfo?.url) {
        console.log(`\u5DF2\u5207\u6362\u5230 frame: ${selector} (${frameInfo.url})`);
      } else {
        console.log(`\u5DF2\u5207\u6362\u5230 frame: ${selector}`);
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}
async function frameMainCommand(options = {}) {
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "frame_main",
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      console.log("\u5DF2\u8FD4\u56DE\u4E3B frame");
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/dialog.ts
async function dialogCommand(subCommand, promptText, options = {}) {
  if (!subCommand || !["accept", "dismiss"].includes(subCommand)) {
    throw new Error("\u8BF7\u4F7F\u7528 'dialog accept [text]' \u6216 'dialog dismiss'");
  }
  await ensureDaemonRunning();
  const request = {
    id: generateId(),
    action: "dialog",
    dialogResponse: subCommand,
    promptText: subCommand === "accept" ? promptText : void 0,
    tabId: options.tabId
  };
  const response = await sendCommand2(request);
  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    if (response.success) {
      const dialogInfo = response.data?.dialogInfo;
      if (dialogInfo) {
        const action = subCommand === "accept" ? "\u5DF2\u63A5\u53D7" : "\u5DF2\u62D2\u7EDD";
        console.log(`${action}\u5BF9\u8BDD\u6846\uFF08${dialogInfo.type}\uFF09: "${dialogInfo.message}"`);
      } else {
        console.log("\u5BF9\u8BDD\u6846\u5DF2\u5904\u7406");
      }
    } else {
      console.error(`\u9519\u8BEF: ${response.error}`);
      process.exit(1);
    }
  }
}

// packages/cli/src/commands/network.ts
async function networkCommand(subCommand, urlOrFilter, options = {}) {
  const response = await sendCommand2({
    id: generateId(),
    action: "network",
    networkCommand: subCommand,
    url: subCommand === "route" || subCommand === "unroute" ? urlOrFilter : void 0,
    filter: subCommand === "requests" ? urlOrFilter : void 0,
    routeOptions: subCommand === "route" ? {
      abort: options.abort,
      body: options.body
    } : void 0,
    withBody: subCommand === "requests" ? options.withBody : void 0,
    tabId: options.tabId
  });
  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }
  if (!response.success) {
    throw new Error(response.error || "Network command failed");
  }
  const data = response.data;
  switch (subCommand) {
    case "requests": {
      const requests = data?.networkRequests || [];
      if (requests.length === 0) {
        console.log("\u6CA1\u6709\u7F51\u7EDC\u8BF7\u6C42\u8BB0\u5F55");
        console.log("\u63D0\u793A: \u4F7F\u7528 network requests \u4F1A\u81EA\u52A8\u5F00\u59CB\u76D1\u63A7");
      } else {
        console.log(`\u7F51\u7EDC\u8BF7\u6C42 (${requests.length} \u6761):
`);
        for (const req of requests) {
          const status = req.failed ? `FAILED (${req.failureReason})` : req.status ? `${req.status} ${req.statusText || ""}` : "pending";
          console.log(`${req.method} ${req.url}`);
          console.log(`  \u7C7B\u578B: ${req.type}, \u72B6\u6001: ${status}`);
          if (options.withBody) {
            const requestHeaderCount = req.requestHeaders ? Object.keys(req.requestHeaders).length : 0;
            const responseHeaderCount = req.responseHeaders ? Object.keys(req.responseHeaders).length : 0;
            console.log(`  \u8BF7\u6C42\u5934: ${requestHeaderCount}, \u54CD\u5E94\u5934: ${responseHeaderCount}`);
            if (req.requestBody !== void 0) {
              const preview = req.requestBody.length > 200 ? `${req.requestBody.slice(0, 200)}...` : req.requestBody;
              console.log(`  \u8BF7\u6C42\u4F53: ${preview}`);
            }
            if (req.responseBody !== void 0) {
              const preview = req.responseBody.length > 200 ? `${req.responseBody.slice(0, 200)}...` : req.responseBody;
              console.log(`  \u54CD\u5E94\u4F53: ${preview}`);
            }
            if (req.bodyError) {
              console.log(`  Body\u9519\u8BEF: ${req.bodyError}`);
            }
          }
          console.log("");
        }
      }
      break;
    }
    case "route": {
      console.log(`\u5DF2\u6DFB\u52A0\u62E6\u622A\u89C4\u5219: ${urlOrFilter}`);
      if (options.abort) {
        console.log("  \u884C\u4E3A: \u963B\u6B62\u8BF7\u6C42");
      } else if (options.body) {
        console.log("  \u884C\u4E3A: \u8FD4\u56DE mock \u6570\u636E");
      } else {
        console.log("  \u884C\u4E3A: \u7EE7\u7EED\u8BF7\u6C42");
      }
      console.log(`\u5F53\u524D\u89C4\u5219\u6570: ${data?.routeCount || 0}`);
      break;
    }
    case "unroute": {
      if (urlOrFilter) {
        console.log(`\u5DF2\u79FB\u9664\u62E6\u622A\u89C4\u5219: ${urlOrFilter}`);
      } else {
        console.log("\u5DF2\u79FB\u9664\u6240\u6709\u62E6\u622A\u89C4\u5219");
      }
      console.log(`\u5269\u4F59\u89C4\u5219\u6570: ${data?.routeCount || 0}`);
      break;
    }
    case "clear": {
      console.log("\u5DF2\u6E05\u7A7A\u7F51\u7EDC\u8BF7\u6C42\u8BB0\u5F55");
      break;
    }
    default:
      throw new Error(`\u672A\u77E5\u7684 network \u5B50\u547D\u4EE4: ${subCommand}`);
  }
}

// packages/cli/src/commands/console.ts
async function consoleCommand(options = {}) {
  const response = await sendCommand2({
    id: generateId(),
    action: "console",
    consoleCommand: options.clear ? "clear" : "get",
    tabId: options.tabId
  });
  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }
  if (!response.success) {
    throw new Error(response.error || "Console command failed");
  }
  if (options.clear) {
    console.log("\u5DF2\u6E05\u7A7A\u63A7\u5236\u53F0\u6D88\u606F");
    return;
  }
  const messages = response.data?.consoleMessages || [];
  if (messages.length === 0) {
    console.log("\u6CA1\u6709\u63A7\u5236\u53F0\u6D88\u606F");
    console.log("\u63D0\u793A: console \u547D\u4EE4\u4F1A\u81EA\u52A8\u5F00\u59CB\u76D1\u63A7");
    return;
  }
  console.log(`\u63A7\u5236\u53F0\u6D88\u606F (${messages.length} \u6761):
`);
  const typeColors = {
    log: "",
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
    debug: "[DEBUG]"
  };
  for (const msg of messages) {
    const prefix = typeColors[msg.type] || `[${msg.type.toUpperCase()}]`;
    const location = msg.url ? ` (${msg.url}${msg.lineNumber ? `:${msg.lineNumber}` : ""})` : "";
    if (prefix) {
      console.log(`${prefix} ${msg.text}${location}`);
    } else {
      console.log(`${msg.text}${location}`);
    }
  }
}

// packages/cli/src/commands/errors.ts
async function errorsCommand(options = {}) {
  const response = await sendCommand2({
    id: generateId(),
    action: "errors",
    errorsCommand: options.clear ? "clear" : "get",
    tabId: options.tabId
  });
  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }
  if (!response.success) {
    throw new Error(response.error || "Errors command failed");
  }
  if (options.clear) {
    console.log("\u5DF2\u6E05\u7A7A JS \u9519\u8BEF\u8BB0\u5F55");
    return;
  }
  const errors = response.data?.jsErrors || [];
  if (errors.length === 0) {
    console.log("\u6CA1\u6709 JS \u9519\u8BEF");
    console.log("\u63D0\u793A: errors \u547D\u4EE4\u4F1A\u81EA\u52A8\u5F00\u59CB\u76D1\u63A7");
    return;
  }
  console.log(`JS \u9519\u8BEF (${errors.length} \u6761):
`);
  for (const err of errors) {
    console.log(`[ERROR] ${err.message}`);
    if (err.url) {
      console.log(`  \u4F4D\u7F6E: ${err.url}:${err.lineNumber || 0}:${err.columnNumber || 0}`);
    }
    if (err.stackTrace) {
      console.log(`  \u5806\u6808:`);
      console.log(err.stackTrace.split("\n").map((line) => `    ${line}`).join("\n"));
    }
    console.log("");
  }
}

// packages/cli/src/commands/trace.ts
async function traceCommand(subCommand, options = {}) {
  const response = await sendCommand2({
    id: generateId(),
    action: "trace",
    traceCommand: subCommand,
    tabId: options.tabId
  });
  if (options.json) {
    console.log(JSON.stringify(response));
    return;
  }
  if (!response.success) {
    throw new Error(response.error || "Trace command failed");
  }
  const data = response.data;
  switch (subCommand) {
    case "start": {
      const status = data?.traceStatus;
      console.log("\u5F00\u59CB\u5F55\u5236\u7528\u6237\u64CD\u4F5C");
      console.log(`\u6807\u7B7E\u9875 ID: ${status?.tabId || "N/A"}`);
      console.log("\n\u5728\u6D4F\u89C8\u5668\u4E2D\u8FDB\u884C\u64CD\u4F5C\uFF0C\u5B8C\u6210\u540E\u8FD0\u884C 'bb-browser trace stop' \u505C\u6B62\u5F55\u5236");
      break;
    }
    case "stop": {
      const events = data?.traceEvents || [];
      const status = data?.traceStatus;
      console.log(`\u5F55\u5236\u5B8C\u6210\uFF0C\u5171 ${events.length} \u4E2A\u4E8B\u4EF6
`);
      if (events.length === 0) {
        console.log("\u6CA1\u6709\u5F55\u5236\u5230\u4EFB\u4F55\u64CD\u4F5C");
        break;
      }
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const refStr = event.ref !== void 0 ? `@${event.ref}` : "";
        switch (event.type) {
          case "navigation":
            console.log(`${i + 1}. \u5BFC\u822A\u5230: ${event.url}`);
            break;
          case "click":
            console.log(`${i + 1}. \u70B9\u51FB ${refStr} [${event.elementRole}] "${event.elementName || ""}"`);
            break;
          case "fill":
            console.log(`${i + 1}. \u586B\u5145 ${refStr} [${event.elementRole}] "${event.elementName || ""}" <- "${event.value}"`);
            break;
          case "select":
            console.log(`${i + 1}. \u9009\u62E9 ${refStr} [${event.elementRole}] "${event.elementName || ""}" <- "${event.value}"`);
            break;
          case "check":
            console.log(`${i + 1}. ${event.checked ? "\u52FE\u9009" : "\u53D6\u6D88\u52FE\u9009"} ${refStr} [${event.elementRole}] "${event.elementName || ""}"`);
            break;
          case "press":
            console.log(`${i + 1}. \u6309\u952E ${event.key}`);
            break;
          case "scroll":
            console.log(`${i + 1}. \u6EDA\u52A8 ${event.direction} ${event.pixels}px`);
            break;
          default:
            console.log(`${i + 1}. ${event.type}`);
        }
      }
      console.log(`
\u72B6\u6001: ${status?.recording ? "\u5F55\u5236\u4E2D" : "\u5DF2\u505C\u6B62"}`);
      break;
    }
    case "status": {
      const status = data?.traceStatus;
      if (status?.recording) {
        console.log(`\u5F55\u5236\u4E2D (\u6807\u7B7E\u9875 ${status.tabId})`);
        console.log(`\u5DF2\u5F55\u5236 ${status.eventCount} \u4E2A\u4E8B\u4EF6`);
      } else {
        console.log("\u672A\u5728\u5F55\u5236");
      }
      break;
    }
    default:
      throw new Error(`\u672A\u77E5\u7684 trace \u5B50\u547D\u4EE4: ${subCommand}`);
  }
}

// packages/cli/src/commands/fetch.ts
function matchTabOrigin2(tabUrl, targetHostname) {
  try {
    const tabHostname = new URL(tabUrl).hostname;
    return tabHostname === targetHostname || tabHostname.endsWith("." + targetHostname);
  } catch {
    return false;
  }
}
async function ensureTabForOrigin(origin, hostname) {
  const listReq = { id: generateId(), action: "tab_list" };
  const listResp = await sendCommand2(listReq);
  if (listResp.success && listResp.data?.tabs) {
    const matchingTab = listResp.data.tabs.find(
      (tab) => matchTabOrigin2(tab.url, hostname)
    );
    if (matchingTab) {
      return matchingTab.tabId;
    }
  }
  const newResp = await sendCommand2({ id: generateId(), action: "tab_new", url: origin });
  if (!newResp.success) {
    throw new Error(`\u65E0\u6CD5\u6253\u5F00 ${origin}: ${newResp.error}`);
  }
  await new Promise((resolve3) => setTimeout(resolve3, 3e3));
  return newResp.data?.tabId;
}
function buildFetchScript(url, options) {
  const method = (options.method || "GET").toUpperCase();
  const hasBody = options.body && method !== "GET" && method !== "HEAD";
  let headersExpr = "{}";
  if (options.headers) {
    try {
      JSON.parse(options.headers);
      headersExpr = options.headers;
    } catch {
      throw new Error(`--headers must be valid JSON. Got: ${options.headers}`);
    }
  }
  return `(async () => {
    try {
      const resp = await fetch(${JSON.stringify(url)}, {
        method: ${JSON.stringify(method)},
        credentials: 'include',
        headers: ${headersExpr}${hasBody ? `,
        body: ${JSON.stringify(options.body)}` : ""}
      });
      const contentType = resp.headers.get('content-type') || '';
      let body;
      if (contentType.includes('application/json') && resp.status !== 204) {
        try { body = await resp.json(); } catch { body = await resp.text(); }
      } else {
        body = await resp.text();
      }
      return JSON.stringify({
        status: resp.status,
        contentType,
        body
      });
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  })()`;
}
async function fetchCommand(url, options = {}) {
  if (!url) {
    throw new Error(
      "\u7F3A\u5C11 URL \u53C2\u6570\n  \u7528\u6CD5: bb-browser fetch <url> [--json] [--method POST] [--body '{...}']\n  \u793A\u4F8B: bb-browser fetch https://www.reddit.com/api/me.json --json"
    );
  }
  await ensureDaemonRunning();
  const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
  let targetTabId = options.tabId;
  if (isAbsolute) {
    let origin;
    let hostname;
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
      hostname = parsed.hostname;
    } catch {
      throw new Error(`\u65E0\u6548\u7684 URL: ${url}`);
    }
    if (!targetTabId) {
      targetTabId = await ensureTabForOrigin(origin, hostname);
    }
  }
  const script = buildFetchScript(url, options);
  const evalReq = { id: generateId(), action: "eval", script, tabId: targetTabId };
  const evalResp = await sendCommand2(evalReq);
  if (!evalResp.success) {
    throw new Error(`Fetch \u5931\u8D25: ${evalResp.error}`);
  }
  const rawResult = evalResp.data?.result;
  if (rawResult === void 0 || rawResult === null) {
    throw new Error("Fetch \u672A\u8FD4\u56DE\u7ED3\u679C");
  }
  let result;
  try {
    result = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
  } catch {
    console.log(rawResult);
    return;
  }
  if (result.error) {
    throw new Error(`Fetch error: ${result.error}`);
  }
  if (options.output) {
    const { writeFileSync: writeFileSync2 } = await import("fs");
    const content = typeof result.body === "object" ? JSON.stringify(result.body, null, 2) : String(result.body);
    writeFileSync2(options.output, content, "utf-8");
    console.log(`\u5DF2\u5199\u5165 ${options.output} (${result.status}, ${content.length} bytes)`);
    return;
  }
  if (typeof result.body === "object") {
    console.log(JSON.stringify(result.body, null, 2));
  } else {
    console.log(result.body);
  }
}

// packages/cli/src/commands/history.ts
async function historyCommand(subCommand, options = {}) {
  const days = options.days || 30;
  const data = subCommand === "search" ? { historyItems: searchHistory(options.query, days) } : { historyDomains: getHistoryDomains(days) };
  if (options.json) {
    console.log(JSON.stringify({
      id: generateId(),
      success: true,
      data
    }));
    return;
  }
  switch (subCommand) {
    case "search": {
      const items = data?.historyItems || [];
      console.log(`\u627E\u5230 ${items.length} \u6761\u5386\u53F2\u8BB0\u5F55
`);
      if (items.length === 0) {
        console.log("\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u5386\u53F2\u8BB0\u5F55");
        break;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`${i + 1}. ${item.title || "(\u65E0\u6807\u9898)"}`);
        console.log(`   ${item.url}`);
        console.log(`   \u8BBF\u95EE\u6B21\u6570: ${item.visitCount}`);
      }
      break;
    }
    case "domains": {
      const domains = data?.historyDomains || [];
      console.log(`\u627E\u5230 ${domains.length} \u4E2A\u57DF\u540D
`);
      if (domains.length === 0) {
        console.log("\u6CA1\u6709\u627E\u5230\u5386\u53F2\u8BB0\u5F55");
        break;
      }
      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];
        console.log(`${i + 1}. ${domain.domain}`);
        console.log(`   \u8BBF\u95EE\u6B21\u6570: ${domain.visits}`);
      }
      break;
    }
    default:
      throw new Error(`\u672A\u77E5\u7684 history \u5B50\u547D\u4EE4: ${subCommand}`);
  }
}

// packages/cli/src/commands/daemon.ts
async function statusCommand(options = {}) {
  const running = await isDaemonRunning();
  if (options.json) {
    console.log(JSON.stringify({ running }));
  } else {
    console.log(running ? "\u6D4F\u89C8\u5668\u8FD0\u884C\u4E2D" : "\u6D4F\u89C8\u5668\u672A\u8FD0\u884C");
  }
}

// packages/cli/src/index.ts
var VERSION = "0.10.1";
var HELP_TEXT = `
bb-browser - AI Agent \u6D4F\u89C8\u5668\u81EA\u52A8\u5316\u5DE5\u5177

\u5B89\u88C5\uFF1A
  npm install -g bb-browser

\u63D0\u793A\uFF1A\u5927\u591A\u6570\u6570\u636E\u83B7\u53D6\u4EFB\u52A1\u8BF7\u76F4\u63A5\u4F7F\u7528 site \u547D\u4EE4\uFF0C\u65E0\u9700\u624B\u52A8\u64CD\u4F5C\u6D4F\u89C8\u5668\uFF1A
  bb-browser site list                    \u67E5\u770B\u6240\u6709\u53EF\u7528\u547D\u4EE4
  bb-browser site twitter/search "AI"     \u793A\u4F8B\uFF1A\u641C\u7D22\u63A8\u6587
  bb-browser site xueqiu/hot-stock 5      \u793A\u4F8B\uFF1A\u83B7\u53D6\u4EBA\u6C14\u80A1\u7968

\u7528\u6CD5\uFF1A
  bb-browser <command> [options]

\u5F00\u59CB\u4F7F\u7528\uFF1A
  site recommend               \u63A8\u8350\u4F60\u53EF\u80FD\u9700\u8981\u7684 adapter\uFF08\u57FA\u4E8E\u6D4F\u89C8\u5386\u53F2\uFF09
  site list                    \u5217\u51FA\u6240\u6709 adapter
  site info <name>             \u67E5\u770B adapter \u7528\u6CD5\uFF08\u53C2\u6570\u3001\u8FD4\u56DE\u503C\u3001\u793A\u4F8B\uFF09
  site <name> [args]           \u8FD0\u884C adapter
  site update                  \u66F4\u65B0\u793E\u533A adapter \u5E93
  guide                        \u5982\u4F55\u628A\u4EFB\u4F55\u7F51\u7AD9\u53D8\u6210 adapter
  star                         \u2B50 Star bb-browser on GitHub

\u6D4F\u89C8\u5668\u64CD\u4F5C\uFF1A
  open <url> [--tab]           \u6253\u5F00 URL
  snapshot [-i] [-c] [-d <n>]  \u83B7\u53D6\u9875\u9762\u5FEB\u7167
  click <ref>                  \u70B9\u51FB\u5143\u7D20
  hover <ref>                  \u60AC\u505C\u5143\u7D20
  fill <ref> <text>            \u586B\u5145\u8F93\u5165\u6846\uFF08\u6E05\u7A7A\u540E\u586B\u5165\uFF09
  type <ref> <text>            \u9010\u5B57\u7B26\u8F93\u5165\uFF08\u4E0D\u6E05\u7A7A\uFF09
  check/uncheck <ref>          \u52FE\u9009/\u53D6\u6D88\u590D\u9009\u6846
  select <ref> <val>           \u4E0B\u62C9\u6846\u9009\u62E9
  press <key>                  \u53D1\u9001\u6309\u952E
  scroll <dir> [px]            \u6EDA\u52A8\u9875\u9762

\u9875\u9762\u4FE1\u606F\uFF1A
  get text|url|title <ref>     \u83B7\u53D6\u9875\u9762\u5185\u5BB9
  screenshot [path]            \u622A\u56FE
  eval "<js>"                  \u6267\u884C JavaScript
  fetch <url>                  \u5E26\u767B\u5F55\u6001\u7684 HTTP \u8BF7\u6C42

\u6807\u7B7E\u9875\uFF1A
  tab [list|new|close|<n>]     \u7BA1\u7406\u6807\u7B7E\u9875
  status                       \u67E5\u770B\u53D7\u7BA1\u6D4F\u89C8\u5668\u72B6\u6001

\u5BFC\u822A\uFF1A
  back / forward / refresh     \u540E\u9000 / \u524D\u8FDB / \u5237\u65B0

\u8C03\u8BD5\uFF1A
  network requests [filter]    \u67E5\u770B\u7F51\u7EDC\u8BF7\u6C42
  console [--clear]            \u67E5\u770B/\u6E05\u7A7A\u63A7\u5236\u53F0
  errors [--clear]             \u67E5\u770B/\u6E05\u7A7A JS \u9519\u8BEF
  trace start|stop|status      \u5F55\u5236\u7528\u6237\u64CD\u4F5C
  history search|domains       \u67E5\u770B\u6D4F\u89C8\u5386\u53F2

\u9009\u9879\uFF1A
  --json               \u4EE5 JSON \u683C\u5F0F\u8F93\u51FA
  --port <n>           \u6307\u5B9A Chrome CDP \u7AEF\u53E3
  --openclaw           \u4F18\u5148\u590D\u7528 OpenClaw \u6D4F\u89C8\u5668\u5B9E\u4F8B
  --jq <expr>          \u5BF9 JSON \u8F93\u51FA\u5E94\u7528 jq \u8FC7\u6EE4\uFF08\u76F4\u63A5\u4F5C\u7528\u4E8E\u6570\u636E\uFF0C\u8DF3\u8FC7 id/success \u4FE1\u5C01\uFF09
  -i, --interactive    \u53EA\u8F93\u51FA\u53EF\u4EA4\u4E92\u5143\u7D20\uFF08snapshot \u547D\u4EE4\uFF09
  -c, --compact        \u79FB\u9664\u7A7A\u7ED3\u6784\u8282\u70B9\uFF08snapshot \u547D\u4EE4\uFF09
  -d, --depth <n>      \u9650\u5236\u6811\u6DF1\u5EA6\uFF08snapshot \u547D\u4EE4\uFF09
  -s, --selector <sel> \u9650\u5B9A CSS \u9009\u62E9\u5668\u8303\u56F4\uFF08snapshot \u547D\u4EE4\uFF09
  --tab <tabId>        \u6307\u5B9A\u64CD\u4F5C\u7684\u6807\u7B7E\u9875 ID
  --mcp                \u542F\u52A8 MCP server\uFF08\u7528\u4E8E Claude Code / Cursor \u7B49 AI \u5DE5\u5177\uFF09
  --help, -h           \u663E\u793A\u5E2E\u52A9\u4FE1\u606F
  --version, -v        \u663E\u793A\u7248\u672C\u53F7
`.trim();
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: null,
    args: [],
    flags: {
      json: false,
      help: false,
      version: false,
      interactive: false,
      compact: false
    }
  };
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--jq") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.jq = args[nextIdx];
        result.flags.json = true;
      }
    } else if (arg === "--openclaw") {
      result.flags.openclaw = true;
    } else if (arg === "--port") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.port = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
    } else if (arg === "--compact" || arg === "-c") {
      result.flags.compact = true;
    } else if (arg === "--depth" || arg === "-d") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.depth = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--selector" || arg === "-s") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.selector = args[nextIdx];
      }
    } else if (arg === "--days") {
      skipNext = true;
      const nextIdx = args.indexOf(arg) + 1;
      if (nextIdx < args.length) {
        result.flags.days = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--id") {
      skipNext = true;
    } else if (arg === "--tab") {
      skipNext = true;
    } else if (arg.startsWith("-")) {
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }
  return result;
}
async function main() {
  const parsed = parseArgs(process.argv);
  setJqExpression(parsed.flags.jq);
  const tabArgIdx = process.argv.indexOf("--tab");
  const globalTabId = tabArgIdx >= 0 && process.argv[tabArgIdx + 1] ? parseInt(process.argv[tabArgIdx + 1], 10) : void 0;
  if (parsed.flags.version) {
    console.log(VERSION);
    return;
  }
  if (process.argv.includes("--mcp")) {
    const mcpPath = fileURLToPath4(new URL("./mcp.js", import.meta.url));
    const { spawn: spawn3 } = await import("child_process");
    const child = spawn3(process.execPath, [mcpPath], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  if (parsed.flags.help || !parsed.command) {
    console.log(HELP_TEXT);
    return;
  }
  try {
    switch (parsed.command) {
      case "open": {
        const url = parsed.args[0];
        if (!url) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 URL \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser open <url> [--tab current|<tabId>]");
          process.exit(1);
        }
        const tabIndex = process.argv.findIndex((a) => a === "--tab");
        const tab = tabIndex >= 0 ? process.argv[tabIndex + 1] : void 0;
        await openCommand(url, { json: parsed.flags.json, tab });
        break;
      }
      case "snapshot": {
        await snapshotCommand({
          json: parsed.flags.json,
          interactive: parsed.flags.interactive,
          compact: parsed.flags.compact,
          maxDepth: parsed.flags.depth,
          selector: parsed.flags.selector,
          tabId: globalTabId
        });
        break;
      }
      case "click": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser click <ref>");
          console.error("\u793A\u4F8B\uFF1Abb-browser click @5");
          process.exit(1);
        }
        await clickCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "hover": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser hover <ref>");
          console.error("\u793A\u4F8B\uFF1Abb-browser hover @5");
          process.exit(1);
        }
        await hoverCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "check": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser check <ref>");
          console.error("\u793A\u4F8B\uFF1Abb-browser check @5");
          process.exit(1);
        }
        await checkCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "uncheck": {
        const ref = parsed.args[0];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser uncheck <ref>");
          console.error("\u793A\u4F8B\uFF1Abb-browser uncheck @5");
          process.exit(1);
        }
        await uncheckCommand(ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "fill": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser fill <ref> <text>");
          console.error('\u793A\u4F8B\uFF1Abb-browser fill @3 "hello world"');
          process.exit(1);
        }
        if (text === void 0) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 text \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser fill <ref> <text>");
          console.error('\u793A\u4F8B\uFF1Abb-browser fill @3 "hello world"');
          process.exit(1);
        }
        await fillCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "type": {
        const ref = parsed.args[0];
        const text = parsed.args[1];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser type <ref> <text>");
          console.error('\u793A\u4F8B\uFF1Abb-browser type @3 "append text"');
          process.exit(1);
        }
        if (text === void 0) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 text \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser type <ref> <text>");
          console.error('\u793A\u4F8B\uFF1Abb-browser type @3 "append text"');
          process.exit(1);
        }
        await typeCommand(ref, text, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "select": {
        const ref = parsed.args[0];
        const value = parsed.args[1];
        if (!ref) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 ref \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser select <ref> <value>");
          console.error('\u793A\u4F8B\uFF1Abb-browser select @4 "option1"');
          process.exit(1);
        }
        if (value === void 0) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 value \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser select <ref> <value>");
          console.error('\u793A\u4F8B\uFF1Abb-browser select @4 "option1"');
          process.exit(1);
        }
        await selectCommand(ref, value, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "eval": {
        const script = parsed.args[0];
        if (!script) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 script \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser eval <script>");
          console.error('\u793A\u4F8B\uFF1Abb-browser eval "document.title"');
          process.exit(1);
        }
        await evalCommand(script, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "get": {
        const attribute = parsed.args[0];
        if (!attribute) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u5C5E\u6027\u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser get <text|url|title> [ref]");
          console.error("\u793A\u4F8B\uFF1Abb-browser get text @5");
          console.error("      bb-browser get url");
          process.exit(1);
        }
        if (!["text", "url", "title"].includes(attribute)) {
          console.error(`\u9519\u8BEF\uFF1A\u672A\u77E5\u5C5E\u6027 "${attribute}"`);
          console.error("\u652F\u6301\u7684\u5C5E\u6027\uFF1Atext, url, title");
          process.exit(1);
        }
        const ref = parsed.args[1];
        await getCommand(attribute, ref, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "daemon":
      case "close": {
        await closeCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "back": {
        await backCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "forward": {
        await forwardCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "refresh": {
        await refreshCommand({ json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "screenshot": {
        const outputPath = parsed.args[0];
        await screenshotCommand(outputPath, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "wait": {
        const target = parsed.args[0];
        if (!target) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u7B49\u5F85\u76EE\u6807\u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser wait <ms|@ref>");
          console.error("\u793A\u4F8B\uFF1Abb-browser wait 2000");
          console.error("      bb-browser wait @5");
          process.exit(1);
        }
        await waitCommand(target, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "press": {
        const key = parsed.args[0];
        if (!key) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 key \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser press <key>");
          console.error("\u793A\u4F8B\uFF1Abb-browser press Enter");
          console.error("      bb-browser press Control+a");
          process.exit(1);
        }
        await pressCommand(key, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "scroll": {
        const direction = parsed.args[0];
        const pixels = parsed.args[1];
        if (!direction) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u65B9\u5411\u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser scroll <up|down|left|right> [pixels]");
          console.error("\u793A\u4F8B\uFF1Abb-browser scroll down");
          console.error("      bb-browser scroll up 500");
          process.exit(1);
        }
        await scrollCommand(direction, pixels, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "tab": {
        await tabCommand(parsed.args, { json: parsed.flags.json });
        break;
      }
      case "status": {
        await statusCommand({ json: parsed.flags.json });
        break;
      }
      case "frame": {
        const selectorOrMain = parsed.args[0];
        if (!selectorOrMain) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11 selector \u53C2\u6570");
          console.error("\u7528\u6CD5\uFF1Abb-browser frame <selector>");
          console.error('\u793A\u4F8B\uFF1Abb-browser frame "iframe#editor"');
          console.error("      bb-browser frame main");
          process.exit(1);
        }
        if (selectorOrMain === "main") {
          await frameMainCommand({ json: parsed.flags.json, tabId: globalTabId });
        } else {
          await frameCommand(selectorOrMain, { json: parsed.flags.json, tabId: globalTabId });
        }
        break;
      }
      case "dialog": {
        const subCommand = parsed.args[0];
        if (!subCommand) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u5B50\u547D\u4EE4");
          console.error("\u7528\u6CD5\uFF1Abb-browser dialog <accept|dismiss> [text]");
          console.error("\u793A\u4F8B\uFF1Abb-browser dialog accept");
          console.error('      bb-browser dialog accept "my input"');
          console.error("      bb-browser dialog dismiss");
          process.exit(1);
        }
        const promptText = parsed.args[1];
        await dialogCommand(subCommand, promptText, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "network": {
        const subCommand = parsed.args[0] || "requests";
        const urlOrFilter = parsed.args[1];
        const abort = process.argv.includes("--abort");
        const withBody = process.argv.includes("--with-body");
        const bodyIndex = process.argv.findIndex((a) => a === "--body");
        const body = bodyIndex >= 0 ? process.argv[bodyIndex + 1] : void 0;
        await networkCommand(subCommand, urlOrFilter, { json: parsed.flags.json, abort, body, withBody, tabId: globalTabId });
        break;
      }
      case "console": {
        const clear = process.argv.includes("--clear");
        await consoleCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }
      case "errors": {
        const clear = process.argv.includes("--clear");
        await errorsCommand({ json: parsed.flags.json, clear, tabId: globalTabId });
        break;
      }
      case "trace": {
        const subCmd = parsed.args[0];
        if (!subCmd || !["start", "stop", "status"].includes(subCmd)) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u6216\u65E0\u6548\u7684\u5B50\u547D\u4EE4");
          console.error("\u7528\u6CD5\uFF1Abb-browser trace <start|stop|status>");
          console.error("\u793A\u4F8B\uFF1Abb-browser trace start");
          console.error("      bb-browser trace stop");
          console.error("      bb-browser trace status");
          process.exit(1);
        }
        await traceCommand(subCmd, { json: parsed.flags.json, tabId: globalTabId });
        break;
      }
      case "history": {
        const subCmd = parsed.args[0];
        if (!subCmd || !["search", "domains"].includes(subCmd)) {
          console.error("\u9519\u8BEF\uFF1A\u7F3A\u5C11\u6216\u65E0\u6548\u7684\u5B50\u547D\u4EE4");
          console.error("\u7528\u6CD5\uFF1Abb-browser history <search|domains> [query] [--days <n>]");
          console.error("\u793A\u4F8B\uFF1Abb-browser history search github");
          console.error("      bb-browser history domains --days 7");
          process.exit(1);
        }
        const query = parsed.args.slice(1).join(" ");
        await historyCommand(subCmd, {
          json: parsed.flags.json,
          days: parsed.flags.days || 30,
          query
        });
        break;
      }
      case "fetch": {
        const fetchUrl = parsed.args[0];
        if (!fetchUrl) {
          console.error("[error] fetch: <url> is required.");
          console.error("  Usage: bb-browser fetch <url> [--json] [--method POST] [--body '{...}']");
          console.error("  Example: bb-browser fetch https://www.reddit.com/api/me.json --json");
          process.exit(1);
        }
        const methodIdx = process.argv.findIndex((a) => a === "--method");
        const fetchMethod = methodIdx >= 0 ? process.argv[methodIdx + 1] : void 0;
        const fetchBodyIdx = process.argv.findIndex((a) => a === "--body");
        const fetchBody = fetchBodyIdx >= 0 ? process.argv[fetchBodyIdx + 1] : void 0;
        const headersIdx = process.argv.findIndex((a) => a === "--headers");
        const fetchHeaders = headersIdx >= 0 ? process.argv[headersIdx + 1] : void 0;
        const outputIdx = process.argv.findIndex((a) => a === "--output");
        const fetchOutput = outputIdx >= 0 ? process.argv[outputIdx + 1] : void 0;
        await fetchCommand(fetchUrl, {
          json: parsed.flags.json,
          method: fetchMethod,
          body: fetchBody,
          headers: fetchHeaders,
          output: fetchOutput,
          tabId: globalTabId
        });
        break;
      }
      case "site": {
        await siteCommand(parsed.args, {
          json: parsed.flags.json,
          jq: parsed.flags.jq,
          days: parsed.flags.days,
          tabId: globalTabId,
          openclaw: parsed.flags.openclaw
        });
        break;
      }
      case "star": {
        const { execSync: execSync4 } = await import("child_process");
        try {
          execSync4("gh auth status", { stdio: "pipe" });
        } catch {
          console.error("\u9700\u8981\u5148\u5B89\u88C5\u5E76\u767B\u5F55 GitHub CLI: https://cli.github.com");
          console.error("  brew install gh && gh auth login");
          process.exit(1);
        }
        const repos = ["epiral/bb-browser", "epiral/bb-sites"];
        for (const repo of repos) {
          try {
            execSync4(`gh api user/starred/${repo} -X PUT`, { stdio: "pipe" });
            console.log(`\u2B50 Starred ${repo}`);
          } catch {
            console.log(`Already starred or failed: ${repo}`);
          }
        }
        console.log("\nThanks for your support! \u{1F64F}");
        break;
      }
      case "guide": {
        console.log(`How to turn any website into a bb-browser site adapter
=======================================================

1. REVERSE ENGINEER the API
   bb-browser network clear --tab <tabId>
   bb-browser refresh --tab <tabId>
   bb-browser network requests --filter "api" --with-body --json --tab <tabId>

2. TEST if direct fetch works (Tier 1)
   bb-browser eval "fetch('/api/endpoint',{credentials:'include'}).then(r=>r.json())" --tab <tabId>

   If it works \u2192 Tier 1 (Cookie auth, like Reddit/GitHub/Zhihu/Bilibili)
   If needs extra headers \u2192 Tier 2 (like Twitter: Bearer + CSRF token)
   If needs request signing \u2192 Tier 3 (like Xiaohongshu: Pinia store actions)

3. WRITE the adapter (one JS file per operation)

   /* @meta
   {
     "name": "platform/command",
     "description": "What it does",
     "domain": "www.example.com",
     "args": { "query": {"required": true, "description": "Search query"} },
     "readOnly": true,
     "example": "bb-browser site platform/command value"
   }
   */
   async function(args) {
     if (!args.query) return {error: 'Missing argument: query'};
     const resp = await fetch('/api/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
     if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in?'};
     return await resp.json();
   }

4. TEST it
   Save to ~/.bb-browser/sites/platform/command.js (private, takes priority)
   bb-browser site platform/command "test query" --json

5. CONTRIBUTE
   Option A (with gh CLI):
     git clone https://github.com/epiral/bb-sites && cd bb-sites
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     gh pr create --repo epiral/bb-sites

   Option B (without gh CLI, using bb-browser itself):
     bb-browser site github/fork epiral/bb-sites
     git clone https://github.com/YOUR_USER/bb-sites && cd bb-sites
     git checkout -b feat-platform
     # add adapter files
     git push -u origin feat-platform
     bb-browser site github/pr-create epiral/bb-sites --title "feat(platform): add adapters" --head "YOUR_USER:feat-platform"

Private adapters:  ~/.bb-browser/sites/<platform>/<command>.js
Community:         ~/.bb-browser/bb-sites/ (via bb-browser site update)
Full guide:        https://github.com/epiral/bb-sites/blob/main/SKILL.md`);
        break;
      }
      default: {
        console.error(`\u9519\u8BEF\uFF1A\u672A\u77E5\u547D\u4EE4 "${parsed.command}"`);
        console.error("\u8FD0\u884C bb-browser --help \u67E5\u770B\u53EF\u7528\u547D\u4EE4");
        process.exit(1);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parsed.flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: message
        })
      );
    } else {
      console.error(`\u9519\u8BEF\uFF1A${message}`);
    }
    process.exit(1);
  }
}
main().then(() => process.exit(0));
//# sourceMappingURL=cli.js.map
