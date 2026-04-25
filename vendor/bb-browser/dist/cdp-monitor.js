#!/usr/bin/env node
import "./chunk-D4HDZEJT.js";

// packages/cli/src/cdp-monitor.ts
import { createServer } from "http";
import { request as httpRequest } from "http";
import { mkdir, writeFile, unlink } from "fs/promises";
import os from "os";
import path from "path";
import WebSocket from "ws";

// packages/cli/src/cdp-monitor-state.ts
function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return void 0;
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  );
}
var MonitorState = class {
  networkRequests = /* @__PURE__ */ new Map();
  networkEnabled = false;
  consoleMessages = [];
  consoleEnabled = false;
  jsErrors = [];
  errorsEnabled = false;
  traceRecording = false;
  traceEvents = [];
  /**
   * Feed a CDP session event (from any attached target) into the monitor
   * state.  The method + params mirror what cdp-client.ts handles inside
   * its own handleSessionEvent, but without any connection‐specific logic
   * (dialog handling, etc.) that the monitor does not need.
   */
  handleSessionEvent(method, params) {
    if (method === "Network.requestWillBeSent") {
      const requestId = typeof params.requestId === "string" ? params.requestId : void 0;
      const request = params.request;
      if (!requestId || !request) return;
      this.networkRequests.set(requestId, {
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
      const existing = this.networkRequests.get(requestId);
      if (!existing) return;
      existing.status = typeof response.status === "number" ? response.status : void 0;
      existing.statusText = typeof response.statusText === "string" ? response.statusText : void 0;
      existing.responseHeaders = normalizeHeaders(response.headers);
      existing.mimeType = typeof response.mimeType === "string" ? response.mimeType : void 0;
      this.networkRequests.set(requestId, existing);
      return;
    }
    if (method === "Network.loadingFailed") {
      const requestId = typeof params.requestId === "string" ? params.requestId : void 0;
      if (!requestId) return;
      const existing = this.networkRequests.get(requestId);
      if (!existing) return;
      existing.failed = true;
      existing.failureReason = typeof params.errorText === "string" ? params.errorText : "Unknown error";
      this.networkRequests.set(requestId, existing);
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
      this.consoleMessages.push({
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
      this.jsErrors.push({
        message: typeof exception?.description === "string" ? exception.description : String(details.text ?? "JavaScript exception"),
        url: typeof details.url === "string" ? details.url : typeof callFrames[0]?.url === "string" ? String(callFrames[0].url) : void 0,
        lineNumber: typeof details.lineNumber === "number" ? details.lineNumber : void 0,
        columnNumber: typeof details.columnNumber === "number" ? details.columnNumber : void 0,
        stackTrace: callFrames.length > 0 ? callFrames.map(
          (frame) => `${String(frame.functionName ?? "<anonymous>")} (${String(frame.url ?? "")}:${String(frame.lineNumber ?? 0)}:${String(frame.columnNumber ?? 0)})`
        ).join("\n") : void 0,
        timestamp: Date.now()
      });
    }
  }
  // --------------- clear helpers ---------------
  clearNetwork() {
    this.networkRequests.clear();
  }
  clearConsole() {
    this.consoleMessages.length = 0;
  }
  clearErrors() {
    this.jsErrors.length = 0;
  }
  // --------------- query helpers ---------------
  getNetworkRequests(filter) {
    const all = Array.from(this.networkRequests.values());
    if (!filter) return all;
    return all.filter((item) => item.url.includes(filter));
  }
  getConsoleMessages(filter) {
    if (!filter) return this.consoleMessages;
    return this.consoleMessages.filter((item) => item.text.includes(filter));
  }
  getJsErrors(filter) {
    if (!filter) return this.jsErrors;
    return this.jsErrors.filter(
      (item) => item.message.includes(filter) || item.url?.includes(filter)
    );
  }
};

// packages/cli/src/cdp-monitor.ts
function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}
var CDP_HOST = getArg("--cdp-host", "127.0.0.1");
var CDP_PORT = Number(getArg("--cdp-port", "19825"));
var MONITOR_PORT = Number(getArg("--monitor-port", "19826"));
var AUTH_TOKEN = getArg("--token", "");
if (!AUTH_TOKEN) {
  process.stderr.write("cdp-monitor: --token is required\n");
  process.exit(1);
}
var MONITOR_DIR = path.join(os.homedir(), ".bb-browser");
var PID_FILE = path.join(MONITOR_DIR, "monitor.pid");
var PORT_FILE = path.join(MONITOR_DIR, "monitor.port");
var TOKEN_FILE = path.join(MONITOR_DIR, "monitor.token");
var IDLE_TIMEOUT_MS = 30 * 60 * 1e3;
var idleTimer = null;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    shutdown("idle timeout");
  }, IDLE_TIMEOUT_MS);
  if (idleTimer && typeof idleTimer === "object" && "unref" in idleTimer) {
  }
}
var browserSocket = null;
var nextMessageId = 1;
var browserPending = /* @__PURE__ */ new Map();
var sessions = /* @__PURE__ */ new Map();
var attachedTargets = /* @__PURE__ */ new Map();
var state = new MonitorState();
var startTime = Date.now();
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode ?? 500}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}
function browserCommand(method, params = {}) {
  if (!browserSocket) throw new Error("CDP not connected");
  const id = nextMessageId++;
  const payload = JSON.stringify({ id, method, params });
  return new Promise((resolve, reject) => {
    browserPending.set(id, {
      resolve,
      reject,
      method
    });
    browserSocket.send(payload);
  });
}
function sessionCommand(targetId, method, params = {}) {
  if (!browserSocket) throw new Error("CDP not connected");
  const sessionId = sessions.get(targetId);
  if (!sessionId) throw new Error(`No session for target ${targetId}`);
  const id = nextMessageId++;
  const payload = JSON.stringify({ id, method, params, sessionId });
  return new Promise((resolve, reject) => {
    const check = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id && msg.sessionId === sessionId) {
        browserSocket.off("message", check);
        if (msg.error) {
          reject(new Error(`${method}: ${msg.error.message ?? "Unknown CDP error"}`));
        } else {
          resolve(msg.result);
        }
      }
    };
    browserSocket.on("message", check);
    browserSocket.send(payload);
  });
}
async function attachAndEnable(targetId) {
  if (sessions.has(targetId)) return;
  const result = await browserCommand("Target.attachToTarget", {
    targetId,
    flatten: true
  });
  sessions.set(targetId, result.sessionId);
  attachedTargets.set(result.sessionId, targetId);
  await sessionCommand(targetId, "Network.enable").catch(() => {
  });
  await sessionCommand(targetId, "Runtime.enable").catch(() => {
  });
}
function setupSocketListeners(ws) {
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (typeof message.id === "number") {
      const pending = browserPending.get(message.id);
      if (!pending) return;
      browserPending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `${pending.method}: ${message.error.message ?? "Unknown CDP error"}`
          )
        );
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
        sessions.set(targetInfo.targetId, sessionId);
        attachedTargets.set(sessionId, targetInfo.targetId);
      }
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      const params = message.params;
      const sessionId = params.sessionId;
      if (typeof sessionId === "string") {
        const targetId = attachedTargets.get(sessionId);
        if (targetId) {
          sessions.delete(targetId);
          attachedTargets.delete(sessionId);
        }
      }
      return;
    }
    if (message.method === "Target.targetCreated") {
      const params = message.params;
      const targetInfo = params.targetInfo;
      if (targetInfo?.type === "page" && typeof targetInfo.targetId === "string") {
        attachAndEnable(targetInfo.targetId).catch(() => {
        });
      }
      return;
    }
    if (typeof message.sessionId === "string" && typeof message.method === "string") {
      state.handleSessionEvent(message.method, message.params ?? {});
    }
  });
  ws.on("close", () => {
    log("CDP connection closed \u2014 shutting down");
    shutdown("cdp closed");
  });
  ws.on("error", (err) => {
    log(`CDP error: ${err.message}`);
  });
}
async function connectCdp() {
  const versionData = await fetchJson(`http://${CDP_HOST}:${CDP_PORT}/json/version`);
  const wsUrl = versionData.webSocketDebuggerUrl;
  if (typeof wsUrl !== "string" || !wsUrl) {
    throw new Error("CDP endpoint missing webSocketDebuggerUrl");
  }
  const ws = await connectWebSocket(wsUrl);
  browserSocket = ws;
  setupSocketListeners(ws);
  await browserCommand("Target.setDiscoverTargets", { discover: true });
  const result = await browserCommand("Target.getTargets");
  const pages = (result.targetInfos || []).filter((t) => t.type === "page");
  for (const page of pages) {
    await attachAndEnable(page.targetId).catch(() => {
    });
  }
  state.networkEnabled = true;
  state.consoleEnabled = true;
  state.errorsEnabled = true;
  log(`Connected to CDP, monitoring ${pages.length} page(s)`);
}
function ok(id, data) {
  return { id, success: true, data };
}
function fail(id, error) {
  const msg = error instanceof Error ? error.message : String(error);
  return { id, success: false, error: msg };
}
function handleCommand(request) {
  try {
    switch (request.action) {
      case "network": {
        const sub = request.networkCommand ?? "requests";
        switch (sub) {
          case "requests": {
            const requests = state.getNetworkRequests(request.filter);
            return ok(request.id, { networkRequests: requests });
          }
          case "clear":
            state.clearNetwork();
            return ok(request.id, {});
          case "route":
            return ok(request.id, { routeCount: 0 });
          case "unroute":
            return ok(request.id, { routeCount: 0 });
          default:
            return fail(request.id, `Unknown network subcommand: ${sub}`);
        }
      }
      case "console": {
        const sub = request.consoleCommand ?? "get";
        switch (sub) {
          case "get":
            return ok(request.id, {
              consoleMessages: state.getConsoleMessages(request.filter)
            });
          case "clear":
            state.clearConsole();
            return ok(request.id, {});
          default:
            return fail(request.id, `Unknown console subcommand: ${sub}`);
        }
      }
      case "errors": {
        const sub = request.errorsCommand ?? "get";
        switch (sub) {
          case "get":
            return ok(request.id, {
              jsErrors: state.getJsErrors(request.filter)
            });
          case "clear":
            state.clearErrors();
            return ok(request.id, {});
          default:
            return fail(request.id, `Unknown errors subcommand: ${sub}`);
        }
      }
      case "trace": {
        const sub = request.traceCommand ?? "status";
        switch (sub) {
          case "start":
            state.traceRecording = true;
            state.traceEvents.length = 0;
            return ok(request.id, {
              traceStatus: { recording: true, eventCount: 0 }
            });
          case "stop": {
            state.traceRecording = false;
            return ok(request.id, {
              traceEvents: [...state.traceEvents],
              traceStatus: {
                recording: false,
                eventCount: state.traceEvents.length
              }
            });
          }
          case "status":
            return ok(request.id, {
              traceStatus: {
                recording: state.traceRecording,
                eventCount: state.traceEvents.length
              }
            });
          default:
            return fail(request.id, `Unknown trace subcommand: ${sub}`);
        }
      }
      default:
        return fail(request.id, `Monitor does not handle action: ${request.action}`);
    }
  } catch (error) {
    return fail(request.id, error);
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function jsonResponse(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}
function handleHttp(req, res) {
  resetIdleTimer();
  const authHeader = req.headers.authorization ?? "";
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    jsonResponse(res, 401, { error: "Unauthorized" });
    return;
  }
  const url = req.url ?? "/";
  if (req.method === "GET" && url === "/status") {
    jsonResponse(res, 200, {
      running: true,
      cdpConnected: browserSocket !== null && browserSocket.readyState === WebSocket.OPEN,
      uptimeMs: Date.now() - startTime,
      counts: {
        network: state.networkRequests.size,
        console: state.consoleMessages.length,
        errors: state.jsErrors.length
      }
    });
    return;
  }
  if (req.method === "POST" && url === "/command") {
    readBody(req).then((body) => {
      const request = JSON.parse(body);
      const response = handleCommand(request);
      jsonResponse(res, 200, response);
    }).catch((err) => {
      jsonResponse(res, 400, { error: String(err) });
    });
    return;
  }
  if (req.method === "POST" && url === "/shutdown") {
    jsonResponse(res, 200, { ok: true });
    setTimeout(() => shutdown("shutdown requested"), 100);
    return;
  }
  jsonResponse(res, 404, { error: "Not found" });
}
function log(msg) {
  process.stderr.write(`[cdp-monitor] ${msg}
`);
}
async function writePidFiles() {
  await mkdir(MONITOR_DIR, { recursive: true });
  await writeFile(PID_FILE, String(process.pid), { mode: 420 });
  await writeFile(PORT_FILE, String(MONITOR_PORT), { mode: 420 });
  await writeFile(TOKEN_FILE, AUTH_TOKEN, { mode: 384 });
}
async function cleanupPidFiles() {
  await unlink(PID_FILE).catch(() => {
  });
  await unlink(PORT_FILE).catch(() => {
  });
  await unlink(TOKEN_FILE).catch(() => {
  });
}
var shuttingDown = false;
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Shutting down: ${reason}`);
  if (browserSocket) {
    try {
      browserSocket.close();
    } catch {
    }
  }
  if (httpServer) {
    httpServer.close();
  }
  cleanupPidFiles().finally(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
var httpServer = null;
async function main() {
  try {
    await connectCdp();
  } catch (error) {
    log(`Failed to connect to CDP: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  httpServer = createServer(handleHttp);
  httpServer.listen(MONITOR_PORT, "127.0.0.1", async () => {
    log(`HTTP server listening on 127.0.0.1:${MONITOR_PORT}`);
    await writePidFiles();
    resetIdleTimer();
  });
}
main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
//# sourceMappingURL=cdp-monitor.js.map