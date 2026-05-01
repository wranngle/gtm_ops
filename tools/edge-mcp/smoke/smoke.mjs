#!/usr/bin/env node
// smoke.mjs — drive the @playwright/mcp server through tools/edge-mcp/launch-mcp.sh
// over JSON-RPC (newline-delimited) on stdio. Verifies the full attach loop:
//   initialize -> tools/list -> browser_navigate -> browser_snapshot.
//
// This is the real MCP attach exercise the task requires. It does not depend
// on @modelcontextprotocol/sdk so it runs without any local deps.
//
// Run: node tools/edge-mcp/smoke/smoke.mjs
// Exit 0 on full pass; non-zero with diagnostic stderr otherwise.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const launcher = resolve(here, "..", "launch-mcp.sh");

const REQUEST_TIMEOUT_MS = 60_000;
const NAV_TIMEOUT_MS = 120_000;

function log(level, msg, extra = {}) {
  const ts = new Date().toISOString();
  const line = JSON.stringify({ "@timestamp": ts, "log.level": level, message: msg, ...extra });
  process.stderr.write(line + "\n");
}

class McpClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = "";
    this.exited = false;
    this.serverStderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this._onStdout(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.serverStderr += chunk;
      // Surface server stderr with a prefix so it doesn't confuse our own logs.
      for (const line of chunk.split(/\r?\n/)) {
        if (line) process.stderr.write(`[mcp.stderr] ${line}\n`);
      }
    });
    child.on("exit", (code, signal) => {
      this.exited = true;
      log("info", "mcp.child.exit", { code, signal });
      // Reject every outstanding request so we don't hang.
      for (const [, { reject }] of this.pending) {
        reject(new Error(`mcp child exited code=${code} signal=${signal}`));
      }
      this.pending.clear();
    });
  }

  _onStdout(chunk) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        log("warn", "mcp.stdout.unparseable", { line });
        continue;
      }
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, method } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(`${method} -> error ${JSON.stringify(msg.error)}`));
      } else {
        resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      // Server-initiated request or notification. We are a minimal client; ignore.
      log("debug", "mcp.server.notification", { method: msg.method });
      return;
    }
    log("warn", "mcp.unmatched", { msg });
  }

  notify(method, params) {
    const env = { jsonrpc: "2.0", method, params };
    this.child.stdin.write(JSON.stringify(env) + "\n");
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    const id = this.nextId++;
    const env = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child.stdin.write(JSON.stringify(env) + "\n");
    });
  }

  async close() {
    try {
      this.child.stdin.end();
    } catch {}
    if (!this.exited) {
      const exited = new Promise((resolve) =>
        this.child.once("exit", () => resolve()),
      );
      const t = setTimeout(() => {
        try {
          this.child.kill("SIGTERM");
        } catch {}
      }, 3_000);
      await exited;
      clearTimeout(t);
    }
  }
}

function summarizeContent(result) {
  // The MCP tools/call result has a `content` array of parts; each part has a
  // `type` ("text" | "image" | "resource") and content fields. For our
  // assertions we flatten all text into one string.
  if (!result || !Array.isArray(result.content)) return "";
  return result.content
    .filter((p) => p && (p.type === "text" || typeof p.text === "string"))
    .map((p) => p.text || "")
    .join("\n");
}

async function main() {
  log("info", "spawn", { launcher });
  const child = spawn(launcher, [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  const client = new McpClient(child);

  const failures = [];
  let toolNames = [];

  try {
    // 1. initialize
    log("info", "step.initialize");
    const initResult = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "edge-mcp-smoke", version: "0.1.0" },
    });
    log("info", "initialize.result", {
      protocolVersion: initResult.protocolVersion,
      serverInfo: initResult.serverInfo,
      capabilityKeys: Object.keys(initResult.capabilities || {}),
    });
    if (!initResult.protocolVersion) {
      failures.push("initialize: missing protocolVersion");
    }
    if (!initResult.capabilities || typeof initResult.capabilities !== "object") {
      failures.push("initialize: missing capabilities");
    }

    // Per spec, send the `notifications/initialized` notification once init is acked.
    client.notify("notifications/initialized", {});

    // 2. tools/list
    log("info", "step.tools.list");
    const listResult = await client.request("tools/list", {});
    if (!Array.isArray(listResult.tools)) {
      failures.push("tools/list: missing tools array");
    } else {
      toolNames = listResult.tools.map((t) => t.name).sort();
      log("info", "tools.list.names", { count: toolNames.length, names: toolNames });
    }
    const expected = ["browser_navigate", "browser_snapshot", "browser_take_screenshot"];
    const missing = expected.filter((name) => !toolNames.includes(name));
    if (missing.length) {
      failures.push(`tools/list: missing expected tools: ${missing.join(", ")}`);
    }

    // 3. browser_navigate -> example.com
    log("info", "step.browser_navigate");
    const navResult = await client.request(
      "tools/call",
      {
        name: "browser_navigate",
        arguments: { url: "https://example.com" },
      },
      NAV_TIMEOUT_MS,
    );
    if (navResult.isError) {
      failures.push(`browser_navigate: server returned isError=true: ${summarizeContent(navResult)}`);
    } else {
      const navText = summarizeContent(navResult);
      log("info", "browser_navigate.ok", { textPreview: navText.slice(0, 200) });
    }

    // 4. browser_snapshot
    log("info", "step.browser_snapshot");
    const snapResult = await client.request(
      "tools/call",
      { name: "browser_snapshot", arguments: {} },
      NAV_TIMEOUT_MS,
    );
    if (snapResult.isError) {
      failures.push(`browser_snapshot: server returned isError=true: ${summarizeContent(snapResult)}`);
    } else {
      const snapText = summarizeContent(snapResult);
      log("info", "browser_snapshot.ok", {
        textLen: snapText.length,
        textPreview: snapText.slice(0, 400),
      });
      if (!/Example Domain/i.test(snapText)) {
        failures.push("browser_snapshot: accessibility tree did not mention 'Example Domain'");
      }
    }
  } catch (err) {
    failures.push(`exception: ${err.message}`);
  } finally {
    await client.close();
  }

  // Report
  const report = {
    pass: failures.length === 0,
    failures,
    toolNames,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  log("error", "fatal", { err: err.stack || String(err) });
  process.exit(2);
});
