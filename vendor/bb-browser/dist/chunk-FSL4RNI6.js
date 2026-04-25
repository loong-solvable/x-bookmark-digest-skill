#!/usr/bin/env node

// packages/cli/src/openclaw-json.ts
function buildPreview(raw) {
  return raw.length > 200 ? `${raw.slice(0, 200)}...` : raw;
}
function tryParseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
function tryParseLastJsonLineBlock(raw) {
  const lines = raw.split(/\r?\n/);
  for (let end = lines.length; end > 0; end -= 1) {
    for (let start = end - 1; start >= 0; start -= 1) {
      const candidate = lines.slice(start, end).join("\n").trim();
      if (!candidate) {
        continue;
      }
      const parsed = tryParseJson(candidate);
      if (parsed.ok) {
        return parsed;
      }
    }
  }
  return null;
}
function parseOpenClawJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("OpenClaw returned empty output");
  }
  const direct = tryParseJson(trimmed);
  if (direct.ok) {
    return direct.value;
  }
  const lineBlock = tryParseLastJsonLineBlock(trimmed);
  if (lineBlock) {
    return lineBlock.value;
  }
  throw new Error(`Failed to parse OpenClaw JSON output: ${direct.error.message}
Raw (preview): ${buildPreview(trimmed)}`);
}

export {
  parseOpenClawJson
};
//# sourceMappingURL=chunk-FSL4RNI6.js.map