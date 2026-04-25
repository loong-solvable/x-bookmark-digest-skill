#!/usr/bin/env node
import {
  COMMAND_TIMEOUT,
  DAEMON_HOST,
  DAEMON_PORT,
  SSE_HEARTBEAT_INTERVAL
} from "./chunk-XYKHDJST.js";
import "./chunk-D4HDZEJT.js";

// packages/daemon/src/index.ts
import { parseArgs } from "util";
import { writeFileSync, unlinkSync, existsSync } from "fs";

// packages/daemon/src/http-server.ts
import { createServer } from "http";

// packages/daemon/src/sse-manager.ts
var SSEManager = class {
  connection = null;
  heartbeatTimer = null;
  /**
   * 检查是否有活跃连接
   */
  get isConnected() {
    return this.connection !== null && !this.connection.writableEnded;
  }
  /**
   * 建立 SSE 连接
   */
  connect(res) {
    if (this.connection) {
      this.disconnect();
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    this.connection = res;
    this.sendEvent("connected", { time: Date.now() });
    this.startHeartbeat();
    res.on("close", () => {
      this.cleanupConnection();
    });
  }
  /**
   * 断开连接
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.connection && !this.connection.writableEnded) {
      this.connection.end();
    }
    this.connection = null;
  }
  /**
   * 发送命令给扩展
   */
  sendCommand(request) {
    return this.sendEvent("command", request);
  }
  /**
   * 发送 SSE 事件
   */
  sendEvent(eventType, data) {
    if (!this.connection || this.connection.writableEnded) {
      return false;
    }
    try {
      this.connection.write(`event: ${eventType}
`);
      this.connection.write(`data: ${JSON.stringify(data)}

`);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * 启动心跳定时器
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const sent = this.sendEvent("heartbeat", { time: Date.now() });
      if (!sent) {
        this.cleanupConnection();
      }
    }, SSE_HEARTBEAT_INTERVAL);
  }
  /**
   * 停止心跳定时器
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  /**
   * 清理连接
   */
  cleanupConnection() {
    this.stopHeartbeat();
    this.connection = null;
  }
};

// packages/daemon/src/request-manager.ts
var RequestManager = class {
  pending = /* @__PURE__ */ new Map();
  /**
   * 获取等待中的请求数量
   */
  get pendingCount() {
    return this.pending.size;
  }
  /**
   * 添加一个 pending 请求
   */
  add(requestId, resolve, reject) {
    const timeout = setTimeout(() => {
      this.timeout(requestId);
    }, COMMAND_TIMEOUT);
    this.pending.set(requestId, { resolve, reject, timeout });
  }
  /**
   * 解决一个 pending 请求
   * @returns 是否找到并解决了请求
   */
  resolve(requestId, response) {
    const pendingRequest = this.pending.get(requestId);
    if (!pendingRequest) {
      return false;
    }
    clearTimeout(pendingRequest.timeout);
    this.pending.delete(requestId);
    pendingRequest.resolve(response);
    return true;
  }
  /**
   * 请求超时处理
   */
  timeout(requestId) {
    const pendingRequest = this.pending.get(requestId);
    if (!pendingRequest) {
      return;
    }
    this.pending.delete(requestId);
    pendingRequest.reject(new Error("Command timeout"));
  }
  /**
   * 清理所有 pending 请求
   */
  clear() {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Daemon shutting down"));
    }
    this.pending.clear();
  }
};

// packages/daemon/src/http-server.ts
var HttpServer = class {
  server = null;
  host;
  port;
  startTime = 0;
  onShutdown;
  sseManager = new SSEManager();
  requestManager = new RequestManager();
  constructor(options = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? DAEMON_PORT;
    this.onShutdown = options.onShutdown;
  }
  /**
   * 启动服务器
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });
      this.server.on("error", (error) => {
        reject(error);
      });
      this.server.listen(this.port, this.host, () => {
        this.startTime = Date.now();
        resolve();
      });
    });
  }
  /**
   * 停止服务器
   */
  async stop() {
    this.requestManager.clear();
    this.sseManager.disconnect();
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });
    }
  }
  /**
   * 获取运行时间（秒）
   */
  get uptime() {
    if (this.startTime === 0) {
      return 0;
    }
    return Math.floor((Date.now() - this.startTime) / 1e3);
  }
  /**
   * 路由请求
   */
  handleRequest(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = req.url ?? "/";
    if (req.method === "POST" && url === "/command") {
      this.handleCommand(req, res);
    } else if (req.method === "GET" && url === "/sse") {
      this.handleSSE(req, res);
    } else if (req.method === "POST" && url === "/result") {
      this.handleResult(req, res);
    } else if (req.method === "GET" && url === "/status") {
      this.handleStatus(req, res);
    } else if (req.method === "POST" && url === "/shutdown") {
      this.handleShutdown(req, res);
    } else {
      this.sendJson(res, 404, { error: "Not found" });
    }
  }
  /**
   * POST /command - CLI 发送命令
   */
  async handleCommand(req, res) {
    try {
      const body = await this.readBody(req);
      const request = JSON.parse(body);
      if (!this.sseManager.isConnected) {
        this.sendJson(res, 503, {
          id: request.id,
          success: false,
          error: "Extension not connected"
        });
        return;
      }
      const responsePromise = new Promise((resolve, reject) => {
        this.requestManager.add(request.id, resolve, reject);
      });
      const sent = this.sseManager.sendCommand(request);
      if (!sent) {
        this.requestManager.resolve(request.id, {
          id: request.id,
          success: false,
          error: "Failed to send command to extension"
        });
        this.sendJson(res, 503, {
          id: request.id,
          success: false,
          error: "Failed to send command to extension"
        });
        return;
      }
      try {
        const response = await responsePromise;
        this.sendJson(res, 200, response);
      } catch (error) {
        this.sendJson(res, 408, {
          id: request.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    } catch (error) {
      this.sendJson(res, 400, {
        success: false,
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  }
  /**
   * GET /sse - 扩展订阅命令流
   */
  handleSSE(_req, res) {
    this.sseManager.connect(res);
  }
  /**
   * POST /result - 扩展回传结果
   */
  async handleResult(req, res) {
    try {
      const body = await this.readBody(req);
      const result = JSON.parse(body);
      const resolved = this.requestManager.resolve(result.id, result);
      if (resolved) {
        this.sendJson(res, 200, { code: 0, message: "ok" });
      } else {
        this.sendJson(res, 200, { code: 1, message: "Request not found or already expired" });
      }
    } catch (error) {
      this.sendJson(res, 400, {
        code: -1,
        message: error instanceof Error ? error.message : "Invalid request"
      });
    }
  }
  /**
   * GET /status - 查询状态
   */
  handleStatus(_req, res) {
    this.sendJson(res, 200, {
      running: true,
      extensionConnected: this.sseManager.isConnected,
      pendingRequests: this.requestManager.pendingCount,
      uptime: this.uptime
    });
  }
  /**
   * POST /shutdown - 关闭服务器
   */
  handleShutdown(_req, res) {
    this.sendJson(res, 200, { code: 0, message: "Shutting down" });
    setTimeout(() => {
      if (this.onShutdown) {
        this.onShutdown();
      }
    }, 100);
  }
  /**
   * 读取请求体
   */
  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });
      req.on("error", (error) => {
        reject(error);
      });
    });
  }
  /**
   * 发送 JSON 响应
   */
  sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
};

// packages/daemon/src/index.ts
var PID_FILE_PATH = "/tmp/bb-browser.pid";
function parseOptions() {
  const { values } = parseArgs({
    allowPositionals: true,
    options: {
      host: {
        type: "string",
        short: "H",
        default: DAEMON_HOST
      },
      port: {
        type: "string",
        short: "p",
        default: String(DAEMON_PORT)
      },
      help: {
        type: "boolean",
        short: "h",
        default: false
      }
    }
  });
  if (values.help) {
    console.error(`
bb-browser-daemon - HTTP Server Daemon for bb-browser

Usage:
  bb-browser-daemon [options]

Options:
  -H, --host <host>  HTTP server host (default: ${DAEMON_HOST})
  -p, --port <port>  HTTP server port (default: ${DAEMON_PORT})
  -h, --help         Show this help message

Endpoints:
  POST /command      Send command and wait for result (CLI)
  GET  /sse          Subscribe to command stream (Extension)
  POST /result       Report command result (Extension)
  GET  /status       Query daemon status
`);
    process.exit(0);
  }
  return {
    host: values.host ?? DAEMON_HOST,
    port: parseInt(values.port ?? String(DAEMON_PORT), 10)
  };
}
function writePidFile() {
  writeFileSync(PID_FILE_PATH, String(process.pid), "utf-8");
}
function cleanupPidFile() {
  if (existsSync(PID_FILE_PATH)) {
    try {
      unlinkSync(PID_FILE_PATH);
    } catch {
    }
  }
}
async function main() {
  const options = parseOptions();
  const shutdown = async () => {
    console.error("[Daemon] Shutting down...");
    await httpServer.stop();
    cleanupPidFile();
    process.exit(0);
  };
  const httpServer = new HttpServer({
    host: options.host,
    port: options.port,
    onShutdown: shutdown
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await httpServer.start();
  writePidFile();
  console.error(`[Daemon] HTTP server listening on http://${options.host}:${options.port}`);
  console.error("[Daemon] Waiting for extension connection...");
}
main().catch((error) => {
  console.error("[Daemon] Fatal error:", error);
  cleanupPidFile();
  process.exit(1);
});
//# sourceMappingURL=daemon.js.map