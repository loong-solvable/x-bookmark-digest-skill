const DEFAULT_DAEMON_PORT = 19824;
const DEFAULT_DAEMON_HOST = "localhost";
const DEFAULT_DAEMON_BASE_URL = `http://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}`;
const SSE_RECONNECT_DELAY = 3e3;
const STORAGE_KEY = "upstreamUrl";
async function getUpstreamUrl() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const url = result[STORAGE_KEY];
    if (url && typeof url === "string" && url.trim()) {
      return url.trim().replace(/\/+$/, "");
    }
  } catch {
  }
  return DEFAULT_DAEMON_BASE_URL;
}

class SSEClient {
  constructor() {
    this.abortController = null;
    this.reconnectAttempts = 0;
    this.isConnectedFlag = false;
    this.onCommandHandler = null;
  }
  /**
   * 连接到 Daemon SSE 端点
   */
  async connect() {
    if (this.abortController) {
      console.warn("[SSEClient] Already connected");
      return;
    }
    const baseUrl = await getUpstreamUrl();
    const sseUrl = `${baseUrl}/sse`;
    console.log("[SSEClient] Connecting to:", sseUrl);
    this.abortController = new AbortController();
    try {
      const response = await fetch(sseUrl, {
        signal: this.abortController.signal,
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache"
        },
        keepalive: true
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error("Response body is null");
      }
      const contentType = response.headers.get("Content-Type");
      console.log("[SSEClient] Connection established, Content-Type:", contentType);
      this.isConnectedFlag = true;
      this.reconnectAttempts = 0;
      await this.readStream(response.body);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[SSEClient] Connection aborted");
        return;
      }
      this.isConnectedFlag = false;
      this.reconnect();
    }
  }
  /**
   * 读取并解析 SSE 流
   */
  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "";
    let data = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[SSEClient] Stream ended");
          this.isConnectedFlag = false;
          this.reconnect();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("event:")) {
            event = trimmedLine.substring(6).trim();
          } else if (trimmedLine.startsWith("data:")) {
            data = trimmedLine.substring(5).trim();
          } else if (trimmedLine === "") {
            if (event && data) {
              this.handleMessage(event, data).catch(
                (err) => console.error("[SSEClient] handleMessage error:", err)
              );
              event = "";
              data = "";
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[SSEClient] Stream reading aborted");
        return;
      }
      console.error("[SSEClient] Stream reading error:", error);
      this.isConnectedFlag = false;
      this.reconnect();
    } finally {
      reader.releaseLock();
    }
  }
  /**
   * 处理 SSE 消息
   */
  async handleMessage(event, data) {
    try {
      const parsed = JSON.parse(data);
      switch (event) {
        case "connected":
          console.log("[SSEClient] Connection confirmed:", parsed);
          break;
        case "heartbeat":
          console.log("[SSEClient] Heartbeat:", new Date(parsed.time * 1e3).toISOString());
          break;
        case "command":
          console.log("[SSEClient] Command received:", parsed.id, parsed.action);
          if (this.onCommandHandler) {
            await this.onCommandHandler(parsed);
          } else {
            console.warn("[SSEClient] No command handler registered");
          }
          break;
        default:
          console.log("[SSEClient] Unknown event type:", event);
      }
    } catch (error) {
      console.error("[SSEClient] Error handling message:", error);
    }
  }
  /**
   * 指数退避重连
   */
  reconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(SSE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1), 6e4);
    setTimeout(() => {
      this.disconnect();
      this.connect();
    }, delay);
  }
  /**
   * 注册命令处理器
   */
  onCommand(handler) {
    this.onCommandHandler = handler;
  }
  /**
   * 断开连接
   */
  disconnect() {
    if (this.abortController) {
      console.log("[SSEClient] Disconnecting...");
      this.abortController.abort();
      this.abortController = null;
      this.isConnectedFlag = false;
    }
  }
  /**
   * 检查连接状态
   */
  isConnected() {
    return this.isConnectedFlag;
  }
}

async function sendResult(result) {
  const baseUrl = await getUpstreamUrl();
  const url = `${baseUrl}/result`;
  console.log("[APIClient] Sending result:", result.id, result.success);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(result)
    });
    if (!response.ok) {
      console.error("[APIClient] Failed to send result:", response.status, response.statusText);
      return;
    }
    const data = await response.json();
    console.log("[APIClient] Result sent successfully:", data);
  } catch (error) {
    console.error("[APIClient] Error sending result:", error);
  }
}

const attachedTabs = /* @__PURE__ */ new Set();
const pendingDialogs = /* @__PURE__ */ new Map();
const networkRequests = /* @__PURE__ */ new Map();
const consoleMessages = /* @__PURE__ */ new Map();
const jsErrors = /* @__PURE__ */ new Map();
const networkRoutes = /* @__PURE__ */ new Map();
const networkEnabledTabs = /* @__PURE__ */ new Set();
const networkBodyBytes = /* @__PURE__ */ new Map();
const MAX_REQUESTS = 500;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;
const MAX_TAB_BODY_BYTES = 8 * 1024 * 1024;
const MAX_CONSOLE_MESSAGES = 500;
const MAX_ERRORS = 100;
async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) {
    return;
  }
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attachedTabs.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
    await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
    console.log("[CDPService] Attached to tab:", tabId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Another debugger is already attached")) {
      attachedTabs.add(tabId);
      return;
    }
    throw error;
  }
}
async function sendCommand(tabId, method, params) {
  await ensureAttached(tabId);
  const result = await chrome.debugger.sendCommand({ tabId }, method, params);
  return result;
}
async function evaluate(tabId, expression, options = {}) {
  const result = await sendCommand(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: options.returnByValue ?? true,
    awaitPromise: options.awaitPromise ?? true,
    replMode: true
  });
  if (result.exceptionDetails) {
    const errorMsg = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Unknown error";
    throw new Error(`Eval error: ${errorMsg}`);
  }
  return result.result?.value;
}
async function callFunctionOn(tabId, objectId, functionDeclaration, args = []) {
  const result = await sendCommand(tabId, "Runtime.callFunctionOn", {
    objectId,
    functionDeclaration,
    arguments: args.map((arg) => ({ value: arg })),
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "Call failed");
  }
  return result.result?.value;
}
async function getDocument(tabId, options = {}) {
  const result = await sendCommand(tabId, "DOM.getDocument", {
    depth: options.depth ?? -1,
    // -1 表示获取整个树
    pierce: options.pierce ?? true
    // 穿透 shadow DOM 和 iframe
  });
  return result.root;
}
async function querySelector(tabId, nodeId, selector) {
  const result = await sendCommand(tabId, "DOM.querySelector", {
    nodeId,
    selector
  });
  return result.nodeId;
}
async function resolveNodeByBackendId(tabId, backendNodeId) {
  const result = await sendCommand(tabId, "DOM.resolveNode", {
    backendNodeId
  });
  return result.object.objectId;
}
async function dispatchMouseEvent(tabId, type, x, y, options = {}) {
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: options.button ?? "left",
    clickCount: options.clickCount ?? 1,
    deltaX: options.deltaX ?? 0,
    deltaY: options.deltaY ?? 0,
    modifiers: options.modifiers ?? 0
  });
}
async function click(tabId, x, y) {
  await dispatchMouseEvent(tabId, "mousePressed", x, y, { button: "left", clickCount: 1 });
  await dispatchMouseEvent(tabId, "mouseReleased", x, y, { button: "left", clickCount: 1 });
}
async function moveMouse(tabId, x, y) {
  await dispatchMouseEvent(tabId, "mouseMoved", x, y);
}
async function scroll(tabId, x, y, deltaX, deltaY) {
  await dispatchMouseEvent(tabId, "mouseWheel", x, y, { deltaX, deltaY });
}
async function dispatchKeyEvent(tabId, type, options = {}) {
  await sendCommand(tabId, "Input.dispatchKeyEvent", {
    type,
    ...options
  });
}
async function pressKey$1(tabId, key, options = {}) {
  const keyCodeMap = {
    Enter: 13,
    Tab: 9,
    Backspace: 8,
    Escape: 27,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Delete: 46,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34
  };
  const keyCode = keyCodeMap[key] || key.charCodeAt(0);
  await dispatchKeyEvent(tabId, "rawKeyDown", {
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: options.modifiers
  });
  if (key.length === 1) {
    await dispatchKeyEvent(tabId, "char", {
      text: key,
      key,
      modifiers: options.modifiers
    });
  }
  await dispatchKeyEvent(tabId, "keyUp", {
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: options.modifiers
  });
}
async function insertText(tabId, text) {
  await sendCommand(tabId, "Input.insertText", { text });
}
async function handleJavaScriptDialog(tabId, accept, promptText) {
  await sendCommand(tabId, "Page.handleJavaScriptDialog", {
    accept,
    promptText
  });
}
function getPendingDialog(tabId) {
  return pendingDialogs.get(tabId);
}
async function getFullAccessibilityTree(tabId, options = {}) {
  await sendCommand(tabId, "Accessibility.enable");
  const result = await sendCommand(
    tabId,
    "Accessibility.getFullAXTree",
    {
      depth: options.depth,
      frameId: options.frameId
    }
  );
  return result.nodes;
}
async function getPartialAccessibilityTree(tabId, nodeId, backendNodeId, options = {}) {
  await sendCommand(tabId, "Accessibility.enable");
  const result = await sendCommand(
    tabId,
    "Accessibility.getPartialAXTree",
    {
      nodeId,
      backendNodeId,
      fetchRelatives: options.fetchRelatives ?? true,
      depth: options.depth
    }
  );
  return result.nodes;
}
async function enableNetwork(tabId) {
  if (networkEnabledTabs.has(tabId)) return;
  await ensureAttached(tabId);
  await sendCommand(tabId, "Network.enable");
  await sendCommand(tabId, "Fetch.enable", {
    patterns: [{ urlPattern: "*" }]
  });
  networkEnabledTabs.add(tabId);
  if (!networkRequests.has(tabId)) {
    networkRequests.set(tabId, []);
  }
  if (!networkBodyBytes.has(tabId)) {
    networkBodyBytes.set(tabId, 0);
  }
  console.log("[CDPService] Network enabled for tab:", tabId);
}
function getNetworkRequests(tabId, filter, withBody = false) {
  const requests = networkRequests.get(tabId) || [];
  const filtered = !filter ? requests : requests.filter(
    (r) => r.url.toLowerCase().includes(filter.toLowerCase()) || r.method.toLowerCase().includes(filter.toLowerCase()) || r.type.toLowerCase().includes(filter.toLowerCase())
  );
  if (withBody) return filtered;
  return filtered.map((r) => ({
    requestId: r.requestId,
    url: r.url,
    method: r.method,
    type: r.type,
    timestamp: r.timestamp,
    response: r.response ? {
      status: r.response.status,
      statusText: r.response.statusText
    } : void 0,
    failed: r.failed,
    failureReason: r.failureReason
  }));
}
function clearNetworkRequests(tabId) {
  networkRequests.set(tabId, []);
  networkBodyBytes.set(tabId, 0);
}
async function addNetworkRoute(tabId, urlPattern, options = {}) {
  await enableNetwork(tabId);
  const route = {
    urlPattern,
    action: options.abort ? "abort" : options.body ? "fulfill" : "continue",
    body: options.body,
    status: options.status ?? 200,
    headers: options.headers
  };
  const routes = networkRoutes.get(tabId) || [];
  const filtered = routes.filter((r) => r.urlPattern !== urlPattern);
  filtered.push(route);
  networkRoutes.set(tabId, filtered);
  console.log("[CDPService] Added network route:", route);
}
function removeNetworkRoute(tabId, urlPattern) {
  if (!urlPattern) {
    networkRoutes.delete(tabId);
    console.log("[CDPService] Removed all network routes for tab:", tabId);
  } else {
    const routes = networkRoutes.get(tabId) || [];
    networkRoutes.set(tabId, routes.filter((r) => r.urlPattern !== urlPattern));
    console.log("[CDPService] Removed network route:", urlPattern);
  }
}
function getNetworkRoutes(tabId) {
  return networkRoutes.get(tabId) || [];
}
async function enableConsole(tabId) {
  await ensureAttached(tabId);
  await sendCommand(tabId, "Runtime.enable");
  await sendCommand(tabId, "Log.enable");
  if (!consoleMessages.has(tabId)) {
    consoleMessages.set(tabId, []);
  }
  if (!jsErrors.has(tabId)) {
    jsErrors.set(tabId, []);
  }
  console.log("[CDPService] Console enabled for tab:", tabId);
}
function getConsoleMessages(tabId) {
  return consoleMessages.get(tabId) || [];
}
function clearConsoleMessages(tabId) {
  consoleMessages.set(tabId, []);
}
function getJSErrors(tabId) {
  return jsErrors.get(tabId) || [];
}
function clearJSErrors(tabId) {
  jsErrors.set(tabId, []);
}
function initEventListeners() {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId) return;
    if (method === "Page.javascriptDialogOpening") {
      const dialogParams = params;
      console.log("[CDPService] Dialog opened:", dialogParams);
      pendingDialogs.set(tabId, dialogParams);
    } else if (method === "Page.javascriptDialogClosed") {
      console.log("[CDPService] Dialog closed");
      pendingDialogs.delete(tabId);
    } else if (method === "Network.requestWillBeSent") {
      handleNetworkRequest(tabId, params);
    } else if (method === "Network.responseReceived") {
      handleNetworkResponse(tabId, params);
    } else if (method === "Network.loadingFailed") {
      handleNetworkFailed(tabId, params);
    } else if (method === "Network.loadingFinished") {
      void handleNetworkLoadingFinished(tabId, params);
    } else if (method === "Fetch.requestPaused") {
      handleFetchPaused(tabId, params);
    } else if (method === "Runtime.consoleAPICalled") {
      handleConsoleAPI(tabId, params);
    } else if (method === "Log.entryAdded") {
      handleLogEntry(tabId, params);
    } else if (method === "Runtime.exceptionThrown") {
      handleException(tabId, params);
    }
  });
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId) {
      cleanupTab$2(source.tabId);
      console.log("[CDPService] Debugger detached from tab:", source.tabId);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    cleanupTab$2(tabId);
  });
}
function cleanupTab$2(tabId) {
  attachedTabs.delete(tabId);
  pendingDialogs.delete(tabId);
  networkRequests.delete(tabId);
  networkRoutes.delete(tabId);
  networkEnabledTabs.delete(tabId);
  networkBodyBytes.delete(tabId);
  consoleMessages.delete(tabId);
  jsErrors.delete(tabId);
}
function estimateBodyBytes(value) {
  return value ? value.length * 2 : 0;
}
function truncateBody(value, maxBytes) {
  const maxChars = Math.max(0, Math.floor(maxBytes / 2));
  if (value.length <= maxChars) {
    return { body: value, truncated: false };
  }
  return { body: value.slice(0, maxChars), truncated: true };
}
function getStoredBodyBytes(request) {
  return estimateBodyBytes(request.requestBody) + estimateBodyBytes(request.response?.body);
}
function updateTabBodyBytes(tabId) {
  const requests = networkRequests.get(tabId) || [];
  let total = 0;
  for (const request of requests) {
    total += getStoredBodyBytes(request);
  }
  networkBodyBytes.set(tabId, total);
}
function enforceBodyBudget(tabId) {
  const requests = networkRequests.get(tabId) || [];
  let total = networkBodyBytes.get(tabId) || 0;
  for (const request of requests) {
    if (total <= MAX_TAB_BODY_BYTES) break;
    if (request.requestBody) {
      total -= estimateBodyBytes(request.requestBody);
      delete request.requestBody;
      request.requestBodyTruncated = true;
    }
    if (total <= MAX_TAB_BODY_BYTES) break;
    if (request.response?.body) {
      total -= estimateBodyBytes(request.response.body);
      delete request.response.body;
      request.response.bodyTruncated = true;
    }
  }
  networkBodyBytes.set(tabId, Math.max(0, total));
}
function handleNetworkRequest(tabId, params) {
  const requests = networkRequests.get(tabId) || [];
  if (requests.length >= MAX_REQUESTS) {
    requests.shift();
  }
  const truncatedRequestBody = params.request.postData ? truncateBody(params.request.postData, MAX_REQUEST_BODY_BYTES) : void 0;
  requests.push({
    requestId: params.requestId,
    url: params.request.url,
    method: params.request.method,
    type: params.type,
    timestamp: params.timestamp * 1e3,
    requestHeaders: params.request.headers,
    requestBody: truncatedRequestBody?.body,
    requestBodyTruncated: truncatedRequestBody?.truncated
  });
  networkRequests.set(tabId, requests);
  updateTabBodyBytes(tabId);
  enforceBodyBudget(tabId);
}
function handleNetworkResponse(tabId, params) {
  const requests = networkRequests.get(tabId) || [];
  const request = requests.find((r) => r.requestId === params.requestId);
  if (request) {
    request.response = {
      status: params.response.status,
      statusText: params.response.statusText,
      headers: params.response.headers,
      mimeType: params.response.mimeType,
      body: request.response?.body,
      bodyBase64: request.response?.bodyBase64,
      bodyTruncated: request.response?.bodyTruncated
    };
  }
}
async function handleNetworkLoadingFinished(tabId, params) {
  const requests = networkRequests.get(tabId) || [];
  const request = requests.find((r) => r.requestId === params.requestId);
  if (!request || request.failed) {
    return;
  }
  try {
    const result = await sendCommand(tabId, "Network.getResponseBody", { requestId: params.requestId });
    const truncatedResponseBody = truncateBody(result.body, MAX_RESPONSE_BODY_BYTES);
    request.response = {
      status: request.response?.status ?? 0,
      statusText: request.response?.statusText ?? "",
      headers: request.response?.headers,
      mimeType: request.response?.mimeType,
      body: truncatedResponseBody.body,
      bodyBase64: result.base64Encoded,
      bodyTruncated: truncatedResponseBody.truncated
    };
    request.bodyError = void 0;
    updateTabBodyBytes(tabId);
    enforceBodyBudget(tabId);
  } catch (error) {
    request.bodyError = error instanceof Error ? error.message : String(error);
  }
}
function handleNetworkFailed(tabId, params) {
  const requests = networkRequests.get(tabId) || [];
  const request = requests.find((r) => r.requestId === params.requestId);
  if (request) {
    request.failed = true;
    request.failureReason = params.errorText;
  }
}
async function handleFetchPaused(tabId, params) {
  const routes = networkRoutes.get(tabId) || [];
  const url = params.request.url;
  const matchedRoute = routes.find((route) => {
    if (route.urlPattern === "*") return true;
    if (route.urlPattern.includes("*")) {
      const regex = new RegExp(route.urlPattern.replace(/\*/g, ".*"));
      return regex.test(url);
    }
    return url.includes(route.urlPattern);
  });
  try {
    if (matchedRoute) {
      if (matchedRoute.action === "abort") {
        await sendCommand(tabId, "Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient"
        });
        console.log("[CDPService] Blocked request:", url);
      } else if (matchedRoute.action === "fulfill") {
        await sendCommand(tabId, "Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: matchedRoute.status || 200,
          responseHeaders: Object.entries(matchedRoute.headers || {}).map(([name, value]) => ({ name, value })),
          body: matchedRoute.body ? btoa(matchedRoute.body) : void 0
        });
        console.log("[CDPService] Fulfilled request with mock:", url);
      } else {
        await sendCommand(tabId, "Fetch.continueRequest", {
          requestId: params.requestId
        });
      }
    } else {
      await sendCommand(tabId, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    }
  } catch (error) {
    console.error("[CDPService] Fetch handling error:", error);
    try {
      await sendCommand(tabId, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    } catch {
    }
  }
}
function handleConsoleAPI(tabId, params) {
  const messages = consoleMessages.get(tabId) || [];
  if (messages.length >= MAX_CONSOLE_MESSAGES) {
    messages.shift();
  }
  const text = params.args.map((arg) => arg.value !== void 0 ? String(arg.value) : arg.description || "").join(" ");
  const typeMap = {
    log: "log",
    info: "info",
    warning: "warn",
    error: "error",
    debug: "debug"
  };
  messages.push({
    type: typeMap[params.type] || "log",
    text,
    timestamp: params.timestamp,
    url: params.stackTrace?.callFrames[0]?.url,
    lineNumber: params.stackTrace?.callFrames[0]?.lineNumber
  });
  consoleMessages.set(tabId, messages);
}
function handleLogEntry(tabId, params) {
  const messages = consoleMessages.get(tabId) || [];
  if (messages.length >= MAX_CONSOLE_MESSAGES) {
    messages.shift();
  }
  const typeMap = {
    verbose: "debug",
    info: "info",
    warning: "warn",
    error: "error"
  };
  messages.push({
    type: typeMap[params.entry.level] || "log",
    text: params.entry.text,
    timestamp: params.entry.timestamp,
    url: params.entry.url,
    lineNumber: params.entry.lineNumber
  });
  consoleMessages.set(tabId, messages);
}
function handleException(tabId, params) {
  const errors = jsErrors.get(tabId) || [];
  if (errors.length >= MAX_ERRORS) {
    errors.shift();
  }
  const details = params.exceptionDetails;
  const stackTrace = details.stackTrace?.callFrames.map((f) => `  at ${f.url}:${f.lineNumber}:${f.columnNumber}`).join("\n");
  errors.push({
    message: details.exception?.description || details.text,
    url: details.url,
    lineNumber: details.lineNumber,
    columnNumber: details.columnNumber,
    stackTrace,
    timestamp: params.timestamp
  });
  jsErrors.set(tabId, errors);
}

const INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "treeitem"
]);
const SKIP_ROLES = /* @__PURE__ */ new Set([
  "none",
  "InlineTextBox",
  "LineBreak",
  "Ignored"
]);
const CONTENT_ROLES_WITH_REF = /* @__PURE__ */ new Set([
  "heading",
  "img",
  "cell",
  "columnheader",
  "rowheader"
]);
function createRoleNameTracker() {
  const counts = /* @__PURE__ */ new Map();
  const refsByKey = /* @__PURE__ */ new Map();
  return {
    counts,
    refsByKey,
    getKey(role, name) {
      return `${role}:${name ?? ""}`;
    },
    getNextIndex(role, name) {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role, name, ref) {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys() {
      const duplicates = /* @__PURE__ */ new Set();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) duplicates.add(key);
      }
      return duplicates;
    }
  };
}
function removeNthFromNonDuplicates(refs, tracker) {
  const duplicateKeys = tracker.getDuplicateKeys();
  for (const refInfo of Object.values(refs)) {
    const key = tracker.getKey(refInfo.role, refInfo.name);
    if (!duplicateKeys.has(key)) {
      delete refInfo.nth;
    }
  }
}
function getProperty(node, propName) {
  const prop = node.properties?.find((p) => p.name === propName);
  return prop?.value?.value;
}
function truncate(text, max = 80) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}
function indent(depth) {
  return "  ".repeat(depth);
}
function getIndentLevel(line) {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}
function formatAXTree(nodes, urlMap, options = {}) {
  const nodeMap = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
  }
  const rootNode = nodes[0];
  if (!rootNode) {
    return { snapshot: "(empty)", refs: {} };
  }
  const lines = [];
  const refs = {};
  const tracker = createRoleNameTracker();
  let refCounter = 0;
  function nextRef() {
    return String(refCounter++);
  }
  function shouldAssignRef(role) {
    if (options.interactive) {
      return INTERACTIVE_ROLES.has(role);
    }
    return INTERACTIVE_ROLES.has(role) || CONTENT_ROLES_WITH_REF.has(role);
  }
  function traverse(nodeId, depth) {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    if (node.ignored) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }
    if (options.maxDepth !== void 0 && depth > options.maxDepth) return;
    const role = node.role?.value || "";
    if (SKIP_ROLES.has(role)) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }
    const name = node.name?.value?.trim() || "";
    const isInteractive = INTERACTIVE_ROLES.has(role);
    if (options.interactive && !isInteractive) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }
    if (role === "StaticText") {
      if (name) {
        const displayText = truncate(name, 100);
        lines.push(`${indent(depth)}- text: ${displayText}`);
      }
      return;
    }
    if ((role === "GenericContainer" || role === "generic") && !name) {
      for (const childId of node.childIds || []) {
        traverse(childId, depth);
      }
      return;
    }
    const displayRole = role.charAt(0).toLowerCase() + role.slice(1);
    let line = `${indent(depth)}- ${displayRole}`;
    if (name) {
      line += ` "${truncate(name, 50)}"`;
    }
    const level = getProperty(node, "level");
    if (level !== void 0) {
      line += ` [level=${level}]`;
    }
    const hasBackendId = node.backendDOMNodeId !== void 0;
    if (shouldAssignRef(role) && hasBackendId) {
      const ref = nextRef();
      const nth = tracker.getNextIndex(role, name || void 0);
      tracker.trackRef(role, name || void 0, ref);
      line += ` [ref=${ref}]`;
      if (nth > 0) line += ` [nth=${nth}]`;
      refs[ref] = {
        backendDOMNodeId: node.backendDOMNodeId,
        role: displayRole,
        name: name || void 0,
        nth
      };
    }
    if (!options.interactive && role === "link" && node.backendDOMNodeId !== void 0) {
      const url = urlMap.get(node.backendDOMNodeId);
      if (url) {
        lines.push(line);
        lines.push(`${indent(depth + 1)}- /url: ${url}`);
        for (const childId of node.childIds || []) {
          traverse(childId, depth + 1);
        }
        return;
      }
    }
    lines.push(line);
    if (options.interactive) return;
    for (const childId of node.childIds || []) {
      traverse(childId, depth + 1);
    }
  }
  traverse(rootNode.nodeId, 0);
  removeNthFromNonDuplicates(refs, tracker);
  const duplicateKeys = tracker.getDuplicateKeys();
  const cleanedLines = lines.map((line) => {
    const nthMatch = line.match(/\[nth=0\]/);
    if (nthMatch) {
      return line.replace(" [nth=0]", "");
    }
    const refMatch = line.match(/\[ref=(\d+)\].*\[nth=\d+\]/);
    if (refMatch) {
      const refId = refMatch[1];
      const refInfo = refs[refId];
      if (refInfo) {
        const key = tracker.getKey(refInfo.role, refInfo.name);
        if (!duplicateKeys.has(key)) {
          return line.replace(/\s*\[nth=\d+\]/, "");
        }
      }
    }
    return line;
  });
  let snapshot = cleanedLines.join("\n");
  if (options.compact) {
    snapshot = compactTree(snapshot);
  }
  return { snapshot: snapshot || "(empty)", refs };
}
function compactTree(tree) {
  const lines = tree.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("[ref=")) {
      result.push(line);
      continue;
    }
    if (line.includes("- text:") || line.includes("- /url:")) {
      result.push(line);
      continue;
    }
    if (line.includes('"')) {
      result.push(line);
      continue;
    }
    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;
    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]);
      if (childIndent <= currentIndent) break;
      if (lines[j].includes("[ref=") || lines[j].includes('"') || lines[j].includes("- text:")) {
        hasRelevantChildren = true;
        break;
      }
    }
    if (hasRelevantChildren) {
      result.push(line);
    }
  }
  return result.join("\n");
}

const tabSnapshotRefs$1 = /* @__PURE__ */ new Map();
const tabActiveFrameId$2 = /* @__PURE__ */ new Map();
async function loadRefsFromStorage() {
  try {
    const result = await chrome.storage.session.get("tabSnapshotRefs");
    if (result.tabSnapshotRefs) {
      const stored = result.tabSnapshotRefs;
      for (const [tabIdStr, refs] of Object.entries(stored)) {
        tabSnapshotRefs$1.set(Number(tabIdStr), refs);
      }
      console.log("[CDPDOMService] Loaded refs from storage:", tabSnapshotRefs$1.size, "tabs");
    }
  } catch (e) {
    console.warn("[CDPDOMService] Failed to load refs from storage:", e);
  }
}
async function saveRefsToStorage(tabId, refs) {
  try {
    const result = await chrome.storage.session.get("tabSnapshotRefs");
    const stored = result.tabSnapshotRefs || {};
    stored[String(tabId)] = refs;
    await chrome.storage.session.set({ tabSnapshotRefs: stored });
  } catch (e) {
    console.warn("[CDPDOMService] Failed to save refs to storage:", e);
  }
}
loadRefsFromStorage();
async function buildURLMap(tabId, linkBackendIds) {
  if (linkBackendIds.size === 0) return /* @__PURE__ */ new Map();
  const urlMap = /* @__PURE__ */ new Map();
  try {
    let walk = function(node) {
      if (linkBackendIds.has(node.backendNodeId)) {
        const attrs = node.attributes || [];
        for (let i = 0; i < attrs.length; i += 2) {
          if (attrs[i] === "href") {
            urlMap.set(node.backendNodeId, attrs[i + 1]);
            break;
          }
        }
      }
      for (const child of node.children || []) walk(child);
      if (node.contentDocument) walk(node.contentDocument);
      for (const shadow of node.shadowRoots || []) walk(shadow);
    };
    const doc = await getDocument(tabId, { depth: -1, pierce: true });
    walk(doc);
  } catch (e) {
    console.warn("[CDPDOMService] Failed to build URL map:", e);
  }
  return urlMap;
}
async function getSnapshot(tabId, options = {}) {
  console.log("[CDPDOMService] Getting snapshot via AX tree for tab:", tabId, options);
  let axNodes;
  if (options.selector) {
    try {
      const doc = await getDocument(tabId, { depth: 0 });
      const nodeId = await querySelector(tabId, doc.nodeId, options.selector);
      if (!nodeId) throw new Error(`Selector "${options.selector}" not found`);
      axNodes = await getPartialAccessibilityTree(tabId, nodeId);
    } catch (e) {
      throw new Error(`Selector "${options.selector}" failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    axNodes = await getFullAccessibilityTree(tabId);
  }
  const linkBackendIds = /* @__PURE__ */ new Set();
  for (const node of axNodes) {
    if (node.role?.value === "link" && node.backendDOMNodeId !== void 0) {
      linkBackendIds.add(node.backendDOMNodeId);
    }
  }
  const urlMap = await buildURLMap(tabId, linkBackendIds);
  const result = formatAXTree(axNodes, urlMap, {
    interactive: options.interactive,
    compact: options.compact,
    maxDepth: options.maxDepth
  });
  const convertedRefs = {};
  for (const [refId, axRef] of Object.entries(result.refs)) {
    convertedRefs[refId] = {
      backendDOMNodeId: axRef.backendDOMNodeId,
      role: axRef.role,
      name: axRef.name
    };
  }
  tabSnapshotRefs$1.set(tabId, convertedRefs);
  await saveRefsToStorage(tabId, convertedRefs);
  console.log("[CDPDOMService] Snapshot complete:", {
    linesCount: result.snapshot.split("\n").length,
    refsCount: Object.keys(convertedRefs).length
  });
  return { snapshot: result.snapshot, refs: convertedRefs };
}
async function getElementCenter(tabId, backendNodeId) {
  const objectId = await resolveNodeByBackendId(tabId, backendNodeId);
  if (!objectId) throw new Error("Failed to resolve node");
  const result = await callFunctionOn(tabId, objectId, `function() {
    this.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    const rect = this.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }`);
  if (!result || typeof result !== "object") throw new Error("Failed to get element center");
  return result;
}
async function evaluateOnElement(tabId, backendNodeId, fn, args = []) {
  const objectId = await resolveNodeByBackendId(tabId, backendNodeId);
  if (!objectId) throw new Error("Failed to resolve node");
  return callFunctionOn(tabId, objectId, fn, args);
}
function getBackendNodeId(refInfo) {
  return refInfo.backendDOMNodeId ?? null;
}
async function getElementCenterByXPath(tabId, xpath) {
  const result = await evaluate(tabId, `
    (function() {
      const result = document.evaluate(
        ${JSON.stringify(xpath)},
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      );
      const element = result.singleNodeValue;
      if (!element) return null;
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()
  `, { returnByValue: true });
  if (!result) throw new Error(`Element not found by xpath: ${xpath}`);
  return result;
}
async function getRefInfo(tabId, ref) {
  const refId = ref.startsWith("@") ? ref.slice(1) : ref;
  const refs = tabSnapshotRefs$1.get(tabId);
  if (refs?.[refId]) return refs[refId];
  if (!tabSnapshotRefs$1.has(tabId)) {
    await loadRefsFromStorage();
    const loaded = tabSnapshotRefs$1.get(tabId);
    if (loaded?.[refId]) return loaded[refId];
  }
  return null;
}
function cleanupTab$1(tabId) {
  tabSnapshotRefs$1.delete(tabId);
  tabActiveFrameId$2.delete(tabId);
}
async function clickElement(tabId, ref) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  let x, y;
  if (backendNodeId !== null) {
    ({ x, y } = await getElementCenter(tabId, backendNodeId));
  } else if (refInfo.xpath) {
    ({ x, y } = await getElementCenterByXPath(tabId, refInfo.xpath));
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  await click(tabId, x, y);
  console.log("[CDPDOMService] Clicked element:", { ref, role, name, x, y });
  return { role, name };
}
async function hoverElement(tabId, ref) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  let x, y;
  if (backendNodeId !== null) {
    ({ x, y } = await getElementCenter(tabId, backendNodeId));
  } else if (refInfo.xpath) {
    ({ x, y } = await getElementCenterByXPath(tabId, refInfo.xpath));
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  await moveMouse(tabId, x, y);
  console.log("[CDPDOMService] Hovered element:", { ref, role, name, x, y });
  return { role, name };
}
async function fillElement(tabId, ref, text) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  if (backendNodeId !== null) {
    await evaluateOnElement(tabId, backendNodeId, `function() {
      this.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      this.focus();
      if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA') {
        this.value = '';
      } else if (this.isContentEditable) {
        this.textContent = '';
      }
    }`);
  } else if (refInfo.xpath) {
    await evaluate(tabId, `
      (function() {
        const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (!element) throw new Error('Element not found');
        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        element.focus();
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') { element.value = ''; }
        else if (element.isContentEditable) { element.textContent = ''; }
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  await insertText(tabId, text);
  console.log("[CDPDOMService] Filled element:", { ref, role, name, textLength: text.length });
  return { role, name };
}
async function typeElement(tabId, ref, text) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  if (backendNodeId !== null) {
    await evaluateOnElement(tabId, backendNodeId, `function() {
      this.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      this.focus();
    }`);
  } else if (refInfo.xpath) {
    await evaluate(tabId, `
      (function() {
        const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (!element) throw new Error('Element not found');
        element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
        element.focus();
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  for (const char of text) {
    await pressKey$1(tabId, char);
  }
  console.log("[CDPDOMService] Typed in element:", { ref, role, name, textLength: text.length });
  return { role, name };
}
async function getElementText(tabId, ref) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const backendNodeId = getBackendNodeId(refInfo);
  let text;
  if (backendNodeId !== null) {
    text = await evaluateOnElement(tabId, backendNodeId, `function() {
      return (this.textContent || '').trim();
    }`);
  } else if (refInfo.xpath) {
    text = await evaluate(tabId, `
      (function() {
        const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (!element) return '';
        return (element.textContent || '').trim();
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  return text || "";
}
async function checkElement(tabId, ref) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  let wasChecked;
  if (backendNodeId !== null) {
    wasChecked = await evaluateOnElement(tabId, backendNodeId, `function() {
      if (this.type !== 'checkbox' && this.type !== 'radio') throw new Error('Element is not a checkbox or radio');
      const was = this.checked;
      if (!was) { this.checked = true; this.dispatchEvent(new Event('change', { bubbles: true })); }
      return was;
    }`);
  } else if (refInfo.xpath) {
    wasChecked = await evaluate(tabId, `
      (function() {
        const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (!element) throw new Error('Element not found');
        if (element.type !== 'checkbox' && element.type !== 'radio') throw new Error('Element is not a checkbox or radio');
        const was = element.checked;
        if (!was) { element.checked = true; element.dispatchEvent(new Event('change', { bubbles: true })); }
        return was;
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  return { role, name, wasAlreadyChecked: wasChecked };
}
async function uncheckElement(tabId, ref) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  let wasUnchecked;
  if (backendNodeId !== null) {
    wasUnchecked = await evaluateOnElement(tabId, backendNodeId, `function() {
      if (this.type !== 'checkbox' && this.type !== 'radio') throw new Error('Element is not a checkbox or radio');
      const was = !this.checked;
      if (!was) { this.checked = false; this.dispatchEvent(new Event('change', { bubbles: true })); }
      return was;
    }`);
  } else if (refInfo.xpath) {
    wasUnchecked = await evaluate(tabId, `
      (function() {
        const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = result.singleNodeValue;
        if (!element) throw new Error('Element not found');
        if (element.type !== 'checkbox' && element.type !== 'radio') throw new Error('Element is not a checkbox or radio');
        const was = !element.checked;
        if (!was) { element.checked = false; element.dispatchEvent(new Event('change', { bubbles: true })); }
        return was;
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  return { role, name, wasAlreadyUnchecked: wasUnchecked };
}
async function selectOption(tabId, ref, value) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const { role, name } = refInfo;
  const backendNodeId = getBackendNodeId(refInfo);
  const selectFn = `function(selectValue) {
    if (this.tagName !== 'SELECT') throw new Error('Element is not a <select> element');
    let matched = null;
    for (const opt of this.options) {
      if (opt.value === selectValue || opt.textContent.trim() === selectValue) { matched = opt; break; }
    }
    if (!matched) {
      const lower = selectValue.toLowerCase();
      for (const opt of this.options) {
        if (opt.value.toLowerCase() === lower || opt.textContent.trim().toLowerCase() === lower) { matched = opt; break; }
      }
    }
    if (!matched) {
      const available = Array.from(this.options).map(o => ({ value: o.value, label: o.textContent.trim() }));
      throw new Error('Option not found: ' + selectValue + '. Available: ' + JSON.stringify(available));
    }
    this.value = matched.value;
    this.dispatchEvent(new Event('change', { bubbles: true }));
    return { selectedValue: matched.value, selectedLabel: matched.textContent.trim() };
  }`;
  let result;
  if (backendNodeId !== null) {
    result = await evaluateOnElement(tabId, backendNodeId, selectFn, [value]);
  } else if (refInfo.xpath) {
    result = await evaluate(tabId, `
      (function() {
        const selectValue = ${JSON.stringify(value)};
        const xpathResult = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const element = xpathResult.singleNodeValue;
        if (!element) throw new Error('Element not found');
        return (${selectFn}).call(element, selectValue);
      })()
    `);
  } else {
    throw new Error(`No locator for ref "${ref}"`);
  }
  const { selectedValue, selectedLabel } = result;
  return { role, name, selectedValue, selectedLabel };
}
async function waitForElement(tabId, ref, maxWait = 1e4, interval = 200) {
  const refInfo = await getRefInfo(tabId, ref);
  if (!refInfo) throw new Error(`Ref "${ref}" not found. Run snapshot first to get available refs.`);
  const backendNodeId = getBackendNodeId(refInfo);
  let elapsed = 0;
  while (elapsed < maxWait) {
    try {
      if (backendNodeId !== null) {
        const objectId = await resolveNodeByBackendId(tabId, backendNodeId);
        if (objectId) return;
      } else if (refInfo.xpath) {
        const found = await evaluate(tabId, `
          (function() {
            const result = document.evaluate(${JSON.stringify(refInfo.xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue !== null;
          })()
        `);
        if (found) return;
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    elapsed += interval;
  }
  throw new Error(`Timeout waiting for element @${ref} after ${maxWait}ms`);
}
function setActiveFrameId(tabId, frameId) {
  tabActiveFrameId$2.set(tabId, frameId);
}
async function pressKey(tabId, key, modifiers = []) {
  let modifierFlags = 0;
  if (modifiers.includes("Alt")) modifierFlags |= 1;
  if (modifiers.includes("Control")) modifierFlags |= 2;
  if (modifiers.includes("Meta")) modifierFlags |= 4;
  if (modifiers.includes("Shift")) modifierFlags |= 8;
  await pressKey$1(tabId, key, { modifiers: modifierFlags });
}
async function scrollPage(tabId, direction, pixels) {
  const result = await evaluate(
    tabId,
    "JSON.stringify({ width: window.innerWidth, height: window.innerHeight })"
  );
  const { width, height } = JSON.parse(result);
  const x = width / 2;
  const y = height / 2;
  let deltaX = 0;
  let deltaY = 0;
  switch (direction) {
    case "up":
      deltaY = -pixels;
      break;
    case "down":
      deltaY = pixels;
      break;
    case "left":
      deltaX = -pixels;
      break;
    case "right":
      deltaX = pixels;
      break;
  }
  await scroll(tabId, x, y, deltaX, deltaY);
}

const tabSnapshotRefs = /* @__PURE__ */ new Map();
const tabActiveFrameId$1 = /* @__PURE__ */ new Map();
function cleanupTab(tabId) {
  tabSnapshotRefs.delete(tabId);
  tabActiveFrameId$1.delete(tabId);
}

let isRecording = false;
let recordingTabId = null;
let events = [];
async function startRecording(tabId) {
  console.log("[TraceService] Starting recording on tab:", tabId);
  isRecording = true;
  recordingTabId = tabId;
  events = [];
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      events.push({
        type: "navigation",
        timestamp: Date.now(),
        url: tab.url,
        elementRole: "document",
        elementName: tab.title || "",
        elementTag: "document"
      });
    }
  } catch (error) {
    console.error("[TraceService] Error getting tab info:", error);
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: "TRACE_START" });
  } catch (error) {
    console.log("[TraceService] Content script not ready, will record on next event");
  }
}
async function stopRecording() {
  console.log("[TraceService] Stopping recording, events:", events.length);
  const recordedEvents = [...events];
  if (recordingTabId !== null) {
    try {
      await chrome.tabs.sendMessage(recordingTabId, { type: "TRACE_STOP" });
    } catch (error) {
      console.log("[TraceService] Could not notify content script:", error);
    }
  }
  isRecording = false;
  recordingTabId = null;
  events = [];
  return recordedEvents;
}
function getStatus() {
  return {
    recording: isRecording,
    eventCount: events.length,
    tabId: recordingTabId ?? void 0
  };
}
function addEvent(event) {
  if (!isRecording) return;
  console.log("[TraceService] Adding event:", event.type, event);
  events.push(event);
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRACE_EVENT") {
    if (isRecording && sender.tab?.id === recordingTabId) {
      addEvent(message.payload);
    }
    sendResponse({ received: true });
    return true;
  }
  if (message.type === "GET_TRACE_STATUS") {
    sendResponse({
      recording: isRecording && sender.tab?.id === recordingTabId,
      tabId: recordingTabId
    });
    return true;
  }
  return false;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId) {
    console.log("[TraceService] Recording tab closed, stopping recording");
    isRecording = false;
    recordingTabId = null;
  }
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (tabId === recordingTabId && isRecording) {
    if (changeInfo.url) {
      events.push({
        type: "navigation",
        timestamp: Date.now(),
        url: changeInfo.url,
        elementRole: "document",
        elementName: _tab.title || "",
        elementTag: "document"
      });
      console.log("[TraceService] Navigation event:", changeInfo.url);
    }
    if (changeInfo.status === "complete") {
      console.log("[TraceService] Page loaded, notifying content script to start recording");
      try {
        await chrome.tabs.sendMessage(tabId, { type: "TRACE_START" });
      } catch (error) {
        console.log("[TraceService] Could not notify content script:", error);
      }
    }
  }
});
console.log("[TraceService] Initialized");

initEventListeners();
const tabActiveFrameId = /* @__PURE__ */ new Map();
async function resolveTab(command) {
  if (command.tabId !== void 0 && typeof command.tabId === "number") {
    return chrome.tabs.get(command.tabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }
  return tab;
}
async function handleCommand(command) {
  console.log("[CommandHandler] Processing command:", command.id, command.action);
  let result;
  try {
    switch (command.action) {
      case "open":
        result = await handleOpen(command);
        break;
      case "snapshot":
        result = await handleSnapshot(command);
        break;
      case "click":
        result = await handleClick(command);
        break;
      case "hover":
        result = await handleHover(command);
        break;
      case "fill":
        result = await handleFill(command);
        break;
      case "type":
        result = await handleType(command);
        break;
      case "check":
        result = await handleCheck(command);
        break;
      case "uncheck":
        result = await handleUncheck(command);
        break;
      case "close":
        result = await handleClose(command);
        break;
      case "get":
        result = await handleGet(command);
        break;
      case "screenshot":
        result = await handleScreenshot(command);
        break;
      case "wait":
        result = await handleWait(command);
        break;
      case "press":
        result = await handlePress(command);
        break;
      case "scroll":
        result = await handleScroll(command);
        break;
      case "back":
        result = await handleBack(command);
        break;
      case "forward":
        result = await handleForward(command);
        break;
      case "refresh":
        result = await handleRefresh(command);
        break;
      case "eval":
        result = await handleEval(command);
        break;
      case "select":
        result = await handleSelect(command);
        break;
      case "tab_list":
        result = await handleTabList(command);
        break;
      case "tab_new":
        result = await handleTabNew(command);
        break;
      case "tab_select":
        result = await handleTabSelect(command);
        break;
      case "tab_close":
        result = await handleTabClose(command);
        break;
      case "frame":
        result = await handleFrame(command);
        break;
      case "frame_main":
        result = await handleFrameMain(command);
        break;
      case "dialog":
        result = await handleDialog(command);
        break;
      case "network":
        result = await handleNetwork(command);
        break;
      case "console":
        result = await handleConsole(command);
        break;
      case "errors":
        result = await handleErrors(command);
        break;
      case "trace":
        result = await handleTrace(command);
        break;
      case "history":
        result = await handleHistory(command);
        break;
      default:
        result = {
          id: command.id,
          success: false,
          error: `Unknown action: ${command.action}`
        };
    }
  } catch (error) {
    result = {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  await sendResult(result);
}
async function handleOpen(command) {
  const url = command.url;
  const tabIdParam = command.tabId;
  if (!url) {
    return {
      id: command.id,
      success: false,
      error: "Missing url parameter"
    };
  }
  console.log("[CommandHandler] Opening URL:", url, "tabId:", tabIdParam);
  let tab;
  if (tabIdParam === void 0) {
    tab = await chrome.tabs.create({ url, active: true });
  } else if (tabIdParam === "current") {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      tab = await chrome.tabs.update(activeTab.id, { url });
    } else {
      tab = await chrome.tabs.create({ url, active: true });
    }
  } else {
    const targetTabId = typeof tabIdParam === "number" ? tabIdParam : parseInt(String(tabIdParam), 10);
    if (isNaN(targetTabId)) {
      return {
        id: command.id,
        success: false,
        error: `Invalid tabId: ${tabIdParam}`
      };
    }
    try {
      tab = await chrome.tabs.update(targetTabId, { url, active: true });
    } catch (error) {
      return {
        id: command.id,
        success: false,
        error: `Tab ${targetTabId} not found or cannot be updated`
      };
    }
  }
  await waitForTabLoad(tab.id);
  const updatedTab = await chrome.tabs.get(tab.id);
  return {
    id: command.id,
    success: true,
    data: {
      tabId: tab.id,
      title: updatedTab.title || "",
      url: updatedTab.url || url
    }
  };
}
async function handleSnapshot(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const url = activeTab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
    return {
      id: command.id,
      success: false,
      error: `Cannot take snapshot of restricted page: ${url}`
    };
  }
  const interactive = command.interactive;
  const compact = command.compact;
  const maxDepth = command.maxDepth;
  const selector = command.selector;
  console.log("[CommandHandler] Taking snapshot of tab:", activeTab.id, activeTab.url, { interactive, compact, maxDepth, selector });
  try {
    const snapshotResult = await getSnapshot(activeTab.id, { interactive, compact, maxDepth, selector });
    return {
      id: command.id,
      success: true,
      data: {
        title: activeTab.title || "",
        url: activeTab.url || "",
        snapshotData: snapshotResult
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Snapshot failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Snapshot failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleClick(command) {
  const ref = command.ref;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Clicking element:", ref);
  try {
    const elementInfo = await clickElement(activeTab.id, ref);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Click failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Click failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleHover(command) {
  const ref = command.ref;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Hovering element:", ref);
  try {
    const elementInfo = await hoverElement(activeTab.id, ref);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Hover failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Hover failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleFill(command) {
  const ref = command.ref;
  const text = command.text;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  if (text === void 0 || text === null) {
    return {
      id: command.id,
      success: false,
      error: "Missing text parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Filling element:", ref, "with text length:", text.length);
  try {
    const elementInfo = await fillElement(activeTab.id, ref, text);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        filledText: text
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Fill failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Fill failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleType(command) {
  const ref = command.ref;
  const text = command.text;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  if (text === void 0 || text === null) {
    return {
      id: command.id,
      success: false,
      error: "Missing text parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Typing in element:", ref, "text length:", text.length);
  try {
    const elementInfo = await typeElement(activeTab.id, ref, text);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        typedText: text
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Type failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Type failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleCheck(command) {
  const ref = command.ref;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Checking element:", ref);
  try {
    const elementInfo = await checkElement(activeTab.id, ref);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        wasAlreadyChecked: elementInfo.wasAlreadyChecked
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Check failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleUncheck(command) {
  const ref = command.ref;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Unchecking element:", ref);
  try {
    const elementInfo = await uncheckElement(activeTab.id, ref);
    return {
      id: command.id,
      success: true,
      data: {
        role: elementInfo.role,
        name: elementInfo.name,
        wasAlreadyUnchecked: elementInfo.wasAlreadyUnchecked
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Uncheck failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Uncheck failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleSelect(command) {
  const ref = command.ref;
  const value = command.value;
  if (!ref) {
    return {
      id: command.id,
      success: false,
      error: "Missing ref parameter"
    };
  }
  if (value === void 0 || value === null) {
    return {
      id: command.id,
      success: false,
      error: "Missing value parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Selecting option:", ref, "value:", value);
  try {
    const result = await selectOption(activeTab.id, ref, value);
    return {
      id: command.id,
      success: true,
      data: {
        role: result.role,
        name: result.name,
        selectedValue: result.selectedValue,
        selectedLabel: result.selectedLabel
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Select failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Select failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleClose(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  const title = activeTab.title || "";
  const url = activeTab.url || "";
  console.log("[CommandHandler] Closing tab:", tabId, url);
  try {
    await chrome.tabs.remove(tabId);
    cleanupTab(tabId);
    cleanupTab$1(tabId);
    tabActiveFrameId.delete(tabId);
    return {
      id: command.id,
      success: true,
      data: {
        tabId,
        title,
        url
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Close failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Close failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleGet(command) {
  const attribute = command.attribute;
  if (!attribute) {
    return {
      id: command.id,
      success: false,
      error: "Missing attribute parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Getting:", attribute);
  try {
    let value;
    switch (attribute) {
      case "url":
        value = activeTab.url || "";
        break;
      case "title":
        value = activeTab.title || "";
        break;
      case "text": {
        const ref = command.ref;
        if (!ref) {
          return {
            id: command.id,
            success: false,
            error: "Missing ref parameter for get text"
          };
        }
        value = await getElementText(activeTab.id, ref);
        break;
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown attribute: ${attribute}`
        };
    }
    return {
      id: command.id,
      success: true,
      data: {
        value
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Get failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Get failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleScreenshot(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id || !activeTab.windowId) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Taking screenshot of tab:", activeTab.id, activeTab.url);
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: "png" });
    return {
      id: command.id,
      success: true,
      data: {
        dataUrl,
        title: activeTab.title || "",
        url: activeTab.url || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Screenshot failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleWait(command) {
  const waitType = command.waitType;
  if (waitType === "time") {
    const ms = command.ms;
    if (!ms || ms < 0) {
      return {
        id: command.id,
        success: false,
        error: "Invalid ms parameter"
      };
    }
    console.log("[CommandHandler] Waiting for", ms, "ms");
    await new Promise((resolve) => setTimeout(resolve, ms));
    return {
      id: command.id,
      success: true,
      data: { waited: ms }
    };
  } else if (waitType === "element") {
    const ref = command.ref;
    if (!ref) {
      return {
        id: command.id,
        success: false,
        error: "Missing ref parameter"
      };
    }
    const activeTab = await resolveTab(command);
    if (!activeTab.id) {
      return {
        id: command.id,
        success: false,
        error: "No active tab found"
      };
    }
    console.log("[CommandHandler] Waiting for element:", ref);
    try {
      await waitForElement(activeTab.id, ref);
      return {
        id: command.id,
        success: true,
        data: { ref }
      };
    } catch (error) {
      console.error("[CommandHandler] Wait failed:", error);
      return {
        id: command.id,
        success: false,
        error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  } else {
    return {
      id: command.id,
      success: false,
      error: `Unknown wait type: ${waitType}`
    };
  }
}
async function handlePress(command) {
  const key = command.key;
  const modifiers = command.modifiers || [];
  if (!key) {
    return {
      id: command.id,
      success: false,
      error: "Missing key parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const url = activeTab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
    return {
      id: command.id,
      success: false,
      error: `Cannot send keys to restricted page: ${url}`
    };
  }
  console.log("[CommandHandler] Pressing key:", key, "modifiers:", modifiers);
  try {
    await pressKey(activeTab.id, key, modifiers);
    const displayKey = modifiers.length > 0 ? `${modifiers.join("+")}+${key}` : key;
    return {
      id: command.id,
      success: true,
      data: {
        key: displayKey
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Press failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Press failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleScroll(command) {
  const direction = command.direction;
  const pixels = command.pixels || 300;
  if (!direction) {
    return {
      id: command.id,
      success: false,
      error: "Missing direction parameter"
    };
  }
  if (!["up", "down", "left", "right"].includes(direction)) {
    return {
      id: command.id,
      success: false,
      error: `Invalid direction: ${direction}`
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Scrolling:", direction, pixels, "px");
  try {
    await scrollPage(activeTab.id, direction, pixels);
    return {
      id: command.id,
      success: true,
      data: {
        direction,
        pixels
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Scroll failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleBack(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  console.log("[CommandHandler] Going back in tab:", tabId);
  try {
    const canGoBack = await evaluate(tabId, "window.history.length > 1");
    if (!canGoBack) {
      return {
        id: command.id,
        success: false,
        error: "No previous page in history"
      };
    }
    await evaluate(tabId, "window.history.back()");
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    const updatedTab = await chrome.tabs.get(tabId);
    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || "",
        title: updatedTab.title || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Back failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Back failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleForward(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  console.log("[CommandHandler] Going forward in tab:", tabId);
  try {
    await evaluate(tabId, "window.history.forward()");
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    const updatedTab = await chrome.tabs.get(tabId);
    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || "",
        title: updatedTab.title || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Forward failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Forward failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleRefresh(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  console.log("[CommandHandler] Refreshing tab:", activeTab.id);
  try {
    await chrome.tabs.reload(activeTab.id);
    await waitForTabLoad(activeTab.id);
    const updatedTab = await chrome.tabs.get(activeTab.id);
    return {
      id: command.id,
      success: true,
      data: {
        url: updatedTab.url || "",
        title: updatedTab.title || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Refresh failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Refresh failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleEval(command) {
  const script = command.script;
  if (!script) {
    return {
      id: command.id,
      success: false,
      error: "Missing script parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const url = activeTab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
    return {
      id: command.id,
      success: false,
      error: `Cannot execute script on restricted page: ${url}`
    };
  }
  console.log("[CommandHandler] Evaluating script:", script.substring(0, 100));
  const tabId = activeTab.id;
  try {
    const result = await evaluate(tabId, script);
    console.log("[CommandHandler] Eval result:", JSON.stringify(result));
    return {
      id: command.id,
      success: true,
      data: {
        result
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Eval failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Eval failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleTabList(command) {
  console.log("[CommandHandler] Listing all tabs");
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabInfos = tabs.map((tab) => ({
      index: tab.index,
      url: tab.url || "",
      title: tab.title || "",
      active: tab.active || false,
      tabId: tab.id || 0
    }));
    const activeTab = tabInfos.find((t) => t.active);
    const activeIndex = activeTab?.index ?? 0;
    return {
      id: command.id,
      success: true,
      data: {
        tabs: tabInfos,
        activeIndex
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Tab list failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Tab list failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleTabNew(command) {
  const url = command.url;
  console.log("[CommandHandler] Creating new tab:", url || "about:blank");
  try {
    const createOptions = { active: true };
    if (url) {
      createOptions.url = url;
    }
    const tab = await chrome.tabs.create(createOptions);
    if (url && tab.id) {
      await waitForTabLoad(tab.id);
    }
    const updatedTab = tab.id ? await chrome.tabs.get(tab.id) : tab;
    return {
      id: command.id,
      success: true,
      data: {
        tabId: updatedTab.id,
        title: updatedTab.title || "",
        url: updatedTab.url || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Tab new failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Tab new failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleTabSelect(command) {
  const index = command.index;
  const tabIdParam = command.tabId;
  if (index === void 0 && tabIdParam === void 0) {
    return {
      id: command.id,
      success: false,
      error: "Missing index or tabId parameter"
    };
  }
  console.log("[CommandHandler] Selecting tab:", tabIdParam !== void 0 ? `tabId=${tabIdParam}` : `index=${index}`);
  try {
    let targetTab;
    if (tabIdParam !== void 0) {
      targetTab = await chrome.tabs.get(tabIdParam);
    } else {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const found = tabs.find((t) => t.index === index);
      if (!found || !found.id) {
        return {
          id: command.id,
          success: false,
          error: `No tab found at index ${index} (total tabs: ${tabs.length})`
        };
      }
      targetTab = found;
    }
    await chrome.tabs.update(targetTab.id, { active: true });
    return {
      id: command.id,
      success: true,
      data: {
        tabId: targetTab.id,
        title: targetTab.title || "",
        url: targetTab.url || ""
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Tab select failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Tab select failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleTabClose(command) {
  const index = command.index;
  const tabIdParam = command.tabId;
  console.log("[CommandHandler] Closing tab:", tabIdParam !== void 0 ? `tabId=${tabIdParam}` : index !== void 0 ? `index=${index}` : "current");
  try {
    let targetTab;
    if (tabIdParam !== void 0) {
      targetTab = await chrome.tabs.get(tabIdParam);
    } else if (index !== void 0) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const found = tabs.find((t) => t.index === index);
      if (!found || !found.id) {
        return {
          id: command.id,
          success: false,
          error: `No tab found at index ${index} (total tabs: ${tabs.length})`
        };
      }
      targetTab = found;
    } else {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        return {
          id: command.id,
          success: false,
          error: "No active tab found"
        };
      }
      targetTab = activeTab;
    }
    const tabId = targetTab.id;
    const title = targetTab.title || "";
    const url = targetTab.url || "";
    await chrome.tabs.remove(tabId);
    cleanupTab(tabId);
    cleanupTab$1(tabId);
    tabActiveFrameId.delete(tabId);
    return {
      id: command.id,
      success: true,
      data: {
        tabId,
        title,
        url
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Tab close failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Tab close failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleFrame(command) {
  const selector = command.selector;
  if (!selector) {
    return {
      id: command.id,
      success: false,
      error: "Missing selector parameter"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  console.log("[CommandHandler] Switching to frame:", selector);
  try {
    const iframeInfoResults = await chrome.scripting.executeScript({
      target: { tabId, frameIds: tabActiveFrameId.get(tabId) !== null && tabActiveFrameId.get(tabId) !== void 0 ? [tabActiveFrameId.get(tabId)] : [0] },
      func: (sel) => {
        const iframe = document.querySelector(sel);
        if (!iframe) {
          return { found: false, error: `找不到 iframe: ${sel}` };
        }
        if (iframe.tagName.toLowerCase() !== "iframe" && iframe.tagName.toLowerCase() !== "frame") {
          return { found: false, error: `元素不是 iframe: ${iframe.tagName}` };
        }
        return {
          found: true,
          name: iframe.name || "",
          src: iframe.src || "",
          // 获取 iframe 在页面中的位置用于匹配
          rect: iframe.getBoundingClientRect()
        };
      },
      args: [selector]
    });
    const iframeInfo = iframeInfoResults[0]?.result;
    if (!iframeInfo || !iframeInfo.found) {
      return {
        id: command.id,
        success: false,
        error: iframeInfo?.error || `找不到 iframe: ${selector}`
      };
    }
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || frames.length === 0) {
      return {
        id: command.id,
        success: false,
        error: "无法获取页面 frames"
      };
    }
    let targetFrameId = null;
    if (iframeInfo.src) {
      const matchedFrame = frames.find(
        (f) => f.url === iframeInfo.src || f.url.includes(iframeInfo.src) || iframeInfo.src.includes(f.url)
      );
      if (matchedFrame) {
        targetFrameId = matchedFrame.frameId;
      }
    }
    if (targetFrameId === null) {
      const childFrames = frames.filter((f) => f.frameId !== 0);
      if (childFrames.length === 1) {
        targetFrameId = childFrames[0].frameId;
      } else if (childFrames.length > 1) {
        if (iframeInfo.name) {
          console.log("[CommandHandler] Multiple frames found, using URL matching");
        }
        if (targetFrameId === null) {
          return {
            id: command.id,
            success: false,
            error: `找到多个子 frame，无法确定目标。请使用更精确的 selector 或确保 iframe 有 src 属性。`
          };
        }
      } else {
        return {
          id: command.id,
          success: false,
          error: "页面中没有子 frame"
        };
      }
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [targetFrameId] },
        func: () => true
      });
    } catch (e) {
      return {
        id: command.id,
        success: false,
        error: `无法访问 frame (frameId: ${targetFrameId})，可能是跨域 iframe`
      };
    }
    tabActiveFrameId.set(tabId, targetFrameId);
    setActiveFrameId(tabId, String(targetFrameId));
    const matchedFrameInfo = frames.find((f) => f.frameId === targetFrameId);
    return {
      id: command.id,
      success: true,
      data: {
        frameInfo: {
          selector,
          name: iframeInfo.name,
          url: matchedFrameInfo?.url || iframeInfo.src,
          frameId: targetFrameId
        }
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Frame switch failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Frame switch failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleFrameMain(command) {
  console.log("[CommandHandler] Switching to main frame");
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  tabActiveFrameId.set(tabId, null);
  setActiveFrameId(tabId, null);
  return {
    id: command.id,
    success: true,
    data: {
      frameInfo: {
        frameId: 0
      }
    }
  };
}
async function handleDialog(command) {
  const dialogResponse = command.dialogResponse;
  const promptText = command.promptText;
  if (!dialogResponse || !["accept", "dismiss"].includes(dialogResponse)) {
    return {
      id: command.id,
      success: false,
      error: "Missing or invalid dialogResponse parameter (accept/dismiss)"
    };
  }
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  console.log("[CommandHandler] Handling dialog:", dialogResponse, "promptText:", promptText);
  try {
    const pendingDialog = getPendingDialog(tabId);
    if (!pendingDialog) {
      return {
        id: command.id,
        success: false,
        error: "没有待处理的对话框"
      };
    }
    await handleJavaScriptDialog(
      tabId,
      dialogResponse === "accept",
      dialogResponse === "accept" ? promptText : void 0
    );
    const dialogInfo = {
      type: pendingDialog.type,
      message: pendingDialog.message,
      handled: true
    };
    return {
      id: command.id,
      success: true,
      data: {
        dialogInfo
      }
    };
  } catch (error) {
    console.error("[CommandHandler] Dialog handling failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Dialog failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
function waitForTabLoad(tabId, timeout = 3e4) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeout);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function handleNetwork(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  const subCommand = command.networkCommand;
  const urlPattern = command.url;
  console.log("[CommandHandler] Network command:", subCommand, urlPattern);
  try {
    switch (subCommand) {
      case "requests": {
        await enableNetwork(tabId);
        const filter = command.filter;
        const withBody = command.withBody === true;
        const requests = getNetworkRequests(tabId, filter, withBody);
        const networkRequests = requests.map((r) => ({
          requestId: r.requestId,
          url: r.url,
          method: r.method,
          type: r.type,
          timestamp: r.timestamp,
          status: r.response?.status,
          statusText: r.response?.statusText,
          failed: r.failed,
          failureReason: r.failureReason,
          ...withBody ? {
            requestHeaders: r.requestHeaders,
            requestBody: r.requestBody,
            requestBodyTruncated: r.requestBodyTruncated,
            responseHeaders: r.response?.headers,
            responseBody: r.response?.body,
            responseBodyBase64: r.response?.bodyBase64,
            responseBodyTruncated: r.response?.bodyTruncated,
            mimeType: r.response?.mimeType,
            bodyError: r.bodyError
          } : {}
        }));
        return {
          id: command.id,
          success: true,
          data: {
            networkRequests
          }
        };
      }
      case "route": {
        if (!urlPattern) {
          return {
            id: command.id,
            success: false,
            error: "URL pattern required for route command"
          };
        }
        const options = command.routeOptions || {};
        await addNetworkRoute(tabId, urlPattern, options);
        const routeCount = getNetworkRoutes(tabId).length;
        return {
          id: command.id,
          success: true,
          data: {
            routeCount
          }
        };
      }
      case "unroute": {
        removeNetworkRoute(tabId, urlPattern);
        const routeCount = getNetworkRoutes(tabId).length;
        return {
          id: command.id,
          success: true,
          data: {
            routeCount
          }
        };
      }
      case "clear": {
        clearNetworkRequests(tabId);
        return {
          id: command.id,
          success: true,
          data: {}
        };
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown network subcommand: ${subCommand}`
        };
    }
  } catch (error) {
    console.error("[CommandHandler] Network command failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Network command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleConsole(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  const subCommand = command.consoleCommand || "get";
  console.log("[CommandHandler] Console command:", subCommand);
  try {
    await enableConsole(tabId);
    switch (subCommand) {
      case "get": {
        const messages = getConsoleMessages(tabId);
        return {
          id: command.id,
          success: true,
          data: {
            consoleMessages: messages
          }
        };
      }
      case "clear": {
        clearConsoleMessages(tabId);
        return {
          id: command.id,
          success: true,
          data: {}
        };
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown console subcommand: ${subCommand}`
        };
    }
  } catch (error) {
    console.error("[CommandHandler] Console command failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Console command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleErrors(command) {
  const activeTab = await resolveTab(command);
  if (!activeTab.id) {
    return {
      id: command.id,
      success: false,
      error: "No active tab found"
    };
  }
  const tabId = activeTab.id;
  const subCommand = command.errorsCommand || "get";
  console.log("[CommandHandler] Errors command:", subCommand);
  try {
    await enableConsole(tabId);
    switch (subCommand) {
      case "get": {
        const errors = getJSErrors(tabId);
        return {
          id: command.id,
          success: true,
          data: {
            jsErrors: errors
          }
        };
      }
      case "clear": {
        clearJSErrors(tabId);
        return {
          id: command.id,
          success: true,
          data: {}
        };
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown errors subcommand: ${subCommand}`
        };
    }
  } catch (error) {
    console.error("[CommandHandler] Errors command failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Errors command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleTrace(command) {
  const subCommand = command.traceCommand || "status";
  console.log("[CommandHandler] Trace command:", subCommand);
  try {
    switch (subCommand) {
      case "start": {
        const activeTab = await resolveTab(command);
        if (!activeTab.id) {
          return {
            id: command.id,
            success: false,
            error: "No active tab found"
          };
        }
        const url = activeTab.url || "";
        if (url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
          return {
            id: command.id,
            success: false,
            error: `Cannot record on restricted page: ${url}`
          };
        }
        await startRecording(activeTab.id);
        const status = getStatus();
        return {
          id: command.id,
          success: true,
          data: {
            traceStatus: status
          }
        };
      }
      case "stop": {
        const events = await stopRecording();
        return {
          id: command.id,
          success: true,
          data: {
            traceEvents: events,
            traceStatus: {
              recording: false,
              eventCount: events.length
            }
          }
        };
      }
      case "status": {
        const status = getStatus();
        return {
          id: command.id,
          success: true,
          data: {
            traceStatus: status
          }
        };
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown trace subcommand: ${subCommand}`
        };
    }
  } catch (error) {
    console.error("[CommandHandler] Trace command failed:", error);
    return {
      id: command.id,
      success: false,
      error: `Trace command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function handleHistory(command) {
  const subCommand = command.historyCommand || "search";
  const days = typeof command.ms === "number" && command.ms > 0 ? command.ms : 30;
  const startTime = Date.now() - days * 24 * 60 * 60 * 1e3;
  console.log("[CommandHandler] History command:", subCommand, "days:", days);
  try {
    switch (subCommand) {
      case "search": {
        const items = await chrome.history.search({
          text: command.text || "",
          maxResults: command.maxResults || 100,
          startTime
        });
        return {
          id: command.id,
          success: true,
          data: {
            historyItems: items.map((item) => ({
              url: item.url || "",
              title: item.title || "",
              visitCount: item.visitCount || 0,
              lastVisitTime: item.lastVisitTime || 0
            }))
          }
        };
      }
      case "domains": {
        const items = await chrome.history.search({
          text: "",
          maxResults: 5e3,
          startTime
        });
        const domainMap = /* @__PURE__ */ new Map();
        for (const item of items) {
          if (!item.url) continue;
          let domain;
          try {
            domain = new URL(item.url).hostname;
          } catch {
            continue;
          }
          const current = domainMap.get(domain) || { visits: 0, titles: /* @__PURE__ */ new Set() };
          current.visits += item.visitCount || 0;
          if (item.title) {
            current.titles.add(item.title);
          }
          domainMap.set(domain, current);
        }
        const historyDomains = Array.from(domainMap.entries()).map(([domain, value]) => ({
          domain,
          visits: value.visits,
          titles: Array.from(value.titles)
        })).sort((a, b) => b.visits - a.visits);
        return {
          id: command.id,
          success: true,
          data: {
            historyDomains
          }
        };
      }
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown history subcommand: ${subCommand}`
        };
    }
  } catch (error) {
    console.error("[CommandHandler] History command failed:", error);
    return {
      id: command.id,
      success: false,
      error: `History command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

const KEEPALIVE_ALARM = "bb-browser-keepalive";
const sseClient = new SSEClient();
sseClient.onCommand(handleCommand);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.upstreamUrl) {
    const newUrl = changes.upstreamUrl.newValue || "default";
    console.log("[bb-browser] Upstream URL changed to:", newUrl, "— reconnecting...");
    sseClient.disconnect();
    sseClient.connect();
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[bb-browser] Message from content script:", message, "sender:", sender.tab?.id);
  sendResponse({ received: true });
  return true;
});
async function setupKeepaliveAlarm() {
  await chrome.alarms.clear(KEEPALIVE_ALARM);
  await chrome.alarms.create(KEEPALIVE_ALARM, {
    periodInMinutes: 0.4
    // 24 秒
  });
  console.log("[bb-browser] Keepalive alarm set (every 24s)");
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    console.log("[bb-browser] Keepalive alarm triggered, checking connection...");
    if (!sseClient.isConnected()) {
      console.log("[bb-browser] SSE disconnected, reconnecting...");
      sseClient.connect();
    }
  }
});
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[bb-browser] Extension installed/updated:", details.reason);
  sseClient.connect();
  setupKeepaliveAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  console.log("[bb-browser] Browser started, connecting to daemon...");
  sseClient.connect();
  setupKeepaliveAlarm();
});
console.log("[bb-browser] Background service worker started, connecting to daemon...");
sseClient.connect();
setupKeepaliveAlarm();
//# sourceMappingURL=background.js.map
