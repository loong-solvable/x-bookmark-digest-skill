#!/usr/bin/env node

// packages/shared/dist/index.js
import { randomUUID } from "crypto";
function generateId() {
  return randomUUID();
}
var DAEMON_PORT = 19824;
var DAEMON_HOST = "localhost";
var DAEMON_BASE_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}`;
var SSE_HEARTBEAT_INTERVAL = 15e3;
var COMMAND_TIMEOUT = 3e4;

export {
  generateId,
  DAEMON_PORT,
  DAEMON_HOST,
  DAEMON_BASE_URL,
  SSE_HEARTBEAT_INTERVAL,
  COMMAND_TIMEOUT
};
//# sourceMappingURL=chunk-XYKHDJST.js.map