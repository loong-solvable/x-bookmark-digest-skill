#!/usr/bin/env node
import {
  parseOpenClawJson
} from "./chunk-FSL4RNI6.js";
import "./chunk-D4HDZEJT.js";

// packages/cli/src/openclaw-bridge.ts
import { execFileSync } from "child_process";
var OPENCLAW_EVALUATE_TIMEOUT_MS = 12e4;
var EXEC_TIMEOUT_BUFFER_MS = 5e3;
function buildOpenClawArgs(args, timeout) {
  const [subcommand, ...rest] = args;
  if (!subcommand) {
    throw new Error("OpenClaw browser command requires a subcommand");
  }
  const globalFlags = rest.filter(a => a === "--json");
  const subcmdArgs = rest.filter(a => a !== "--json");
  return ["openclaw", "browser", "--timeout", String(timeout), ...globalFlags, subcommand, ...subcmdArgs];
}
function getOpenClawExecTimeout(timeout) {
  return timeout + EXEC_TIMEOUT_BUFFER_MS;
}
function runOpenClaw(args, timeout) {
  return execFileSync("npx", buildOpenClawArgs(args, timeout), {
    encoding: "utf-8",
    timeout: getOpenClawExecTimeout(timeout),
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
}
function ocGetTabs() {
  const raw = runOpenClaw(["tabs", "--json"], 15e3);
  const data = parseOpenClawJson(raw);
  return (data.tabs || []).filter((tab) => tab.type === "page");
}
function ocFindTabByDomain(tabs, domain) {
  return tabs.find((tab) => {
    try {
      const hostname = new URL(tab.url).hostname;
      return hostname === domain || hostname.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  });
}
function ocOpenTab(url) {
  const raw = runOpenClaw(["open", url, "--json"], 3e4);
  const data = parseOpenClawJson(raw);
  return data.id || data.targetId;
}
function ocEvaluate(targetId, fn) {
  const raw = runOpenClaw(["evaluate", "--fn", fn, "--target-id", targetId], OPENCLAW_EVALUATE_TIMEOUT_MS);
  return parseOpenClawJson(raw);
}
export {
  buildOpenClawArgs,
  getOpenClawExecTimeout,
  ocEvaluate,
  ocFindTabByDomain,
  ocGetTabs,
  ocOpenTab
};
//# sourceMappingURL=openclaw-bridge-7BW5M4YX.js.map