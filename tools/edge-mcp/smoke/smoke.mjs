#!/usr/bin/env node
// smoke.mjs — drive the @playwright/mcp server through tools/edge-mcp/launch-mcp.sh
// over JSON-RPC (newline-delimited) on stdio. Verifies the full attach loop the
// Harness Engineering "Codex drives the app with Chrome DevTools MCP" diagram
// describes:
//
//   initialize -> tools/list -> browser_navigate -> browser_console_messages ->
//   browser_take_screenshot -> browser_snapshot
//
// In addition to the happy path, this smoke also fails LOUDLY when the
// upstream tool inventory changes in ways an agent author needs to know about:
//
//   - Any expected advertised tool disappears (regression / breaking change).
//   - The advertised tool set differs from EXPECTED_BASE_TOOLS after applying
//     the EDGE_MCP_NO_UNSAFE_TOOLS filter (new tools must be acknowledged
//     intentionally, with docs updated to match).
//   - browser_run_code_unsafe disappears or appears unexpectedly relative to
//     EDGE_MCP_NO_UNSAFE_TOOLS (security posture change — see
//     docs/references/edge-devtools-mcp.md "Security").
//
// Run: node tools/edge-mcp/smoke/smoke.mjs
//   --skip-screenshot   skip the screenshot step (slow on cold profiles)
//   --tool-snapshot     print the full tool list as JSON and exit 0
//   --record-last-run   write tools/edge-mcp/smoke/LAST_RUN.md
//
// Exit 0 on full pass; non-zero with diagnostic stderr otherwise.

import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const launcher = resolve(here, "..", "launch-mcp.sh");

const REQUEST_TIMEOUT_MS = 60_000;
const NAV_TIMEOUT_MS = 120_000;

// The 23 tools the @playwright/mcp `core` capability advertises. Locked here
// so changes to upstream that drop or add tools fail the smoke loudly. To
// intentionally update this list (e.g., upstream added a useful tool we want
// to depend on), update both this constant AND the "Tools advertised" tables
// in tools/edge-mcp/README.md and docs/references/edge-devtools-mcp.md in
// the same commit.
const EXPECTED_BASE_TOOLS = [
  "browser_click",
  "browser_close",
  "browser_console_messages",
  "browser_drag",
  "browser_drop",
  "browser_evaluate",
  "browser_file_upload",
  "browser_fill_form",
  "browser_handle_dialog",
  "browser_hover",
  "browser_navigate",
  "browser_navigate_back",
  "browser_network_request",
  "browser_network_requests",
  "browser_press_key",
  "browser_resize",
  "browser_run_code_unsafe",
  "browser_select_option",
  "browser_snapshot",
  "browser_tabs",
  "browser_take_screenshot",
  "browser_type",
  "browser_wait_for",
];

// Tools whose presence/absence has security implications. If the upstream
// removes browser_run_code_unsafe (good news!) or renames it, an agent with
// gating logic that depends on the name needs to know.
const SECURITY_GATED_TOOLS = ["browser_run_code_unsafe"];

const args = new Set(process.argv.slice(2));
const skipScreenshot = args.has("--skip-screenshot");
const toolSnapshotOnly = args.has("--tool-snapshot");
const recordLastRun = args.has("--record-last-run");
const noUnsafeTools = process.env.EDGE_MCP_NO_UNSAFE_TOOLS !== "0";
const EXPECTED_ADVERTISED_TOOLS = noUnsafeTools
  ? EXPECTED_BASE_TOOLS.filter((name) => !SECURITY_GATED_TOOLS.includes(name))
  : EXPECTED_BASE_TOOLS;
const lastRunPath = resolve(here, "LAST_RUN.md");
const repoRoot = resolve(here, "..", "..", "..");

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

function contentImageCount(result) {
  if (!result || !Array.isArray(result.content)) return 0;
  return result.content.filter((p) => p && p.type === "image").length;
}

function diffSets(actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((n) => !actualSet.has(n));
  const extra = actual.filter((n) => !expectedSet.has(n));
  return { missing, extra };
}

function gitOutput(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function formatList(items) {
  if (!items.length) return "- none\n";
  return items.map((item) => `- ${item}`).join("\n") + "\n";
}

function writeLastRun(report) {
  const timestamp = new Date().toISOString();
  const commitSha = gitOutput(["rev-parse", "HEAD"], "unknown");
  const worktreeStatus = gitOutput(["status", "--short"], "");
  const status = report.pass ? "pass" : "fail";
  const content =
    `---\n` +
    `schema_version: 1\n` +
    `commit_sha: ${commitSha}\n` +
    `timestamp_utc: ${timestamp}\n` +
    `status: ${status}\n` +
    `command: node tools/edge-mcp/smoke/smoke.mjs --record-last-run\n` +
    `tool_count: ${report.toolCount}\n` +
    `expected_tool_count: ${report.expectedToolCount}\n` +
    `no_unsafe_tools: ${report.noUnsafeTools}\n` +
    `unsafe_tool_denied: ${report.unsafeToolDenied}\n` +
    `worktree_dirty: ${worktreeStatus ? "true" : "false"}\n` +
    `---\n` +
    `# Edge MCP Smoke LAST_RUN\n\n` +
    `This file is the checked-in ratchet for the local-only Edge MCP live smoke.\n` +
    `Update it by running:\n\n` +
    `\`\`\`bash\n` +
    `node tools/edge-mcp/smoke/smoke.mjs --record-last-run\n` +
    `\`\`\`\n\n` +
    `## Recorded Result\n\n` +
    `- Status: ${status}\n` +
    `- Commit: ${commitSha}\n` +
    `- Timestamp UTC: ${timestamp}\n` +
    `- Tool count: ${report.toolCount}\n` +
    `- Expected tool count: ${report.expectedToolCount}\n` +
    `- EDGE_MCP_NO_UNSAFE_TOOLS active: ${report.noUnsafeTools}\n` +
    `- Direct unsafe-tool call denied: ${report.unsafeToolDenied}\n` +
    `- Worktree dirty during run: ${worktreeStatus ? "true" : "false"}\n\n` +
    `## Failures\n\n` +
    formatList(report.failures) +
    `\n## Tool Names\n\n` +
    formatList(report.toolNames);

  writeFileSync(lastRunPath, content);
  log("info", "last_run.recorded", { path: lastRunPath, status, commitSha });
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
  let unsafeToolDenied = false;

  try {
    // 1. initialize
    log("info", "step.initialize");
    const initResult = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "edge-mcp-smoke", version: "0.2.0" },
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
    if (!initResult.serverInfo || initResult.serverInfo.name !== "Playwright") {
      failures.push(
        `initialize: serverInfo.name !== "Playwright" (got ${JSON.stringify(initResult.serverInfo)})`,
      );
    }

    // Per spec, send the `notifications/initialized` notification once init is acked.
    client.notify("notifications/initialized", {});

    // 2. tools/list — assert the inventory matches what our docs claim.
    log("info", "step.tools.list");
    const listResult = await client.request("tools/list", {});
    if (!Array.isArray(listResult.tools)) {
      failures.push("tools/list: missing tools array");
    } else {
      toolNames = listResult.tools.map((t) => t.name).sort();
      log("info", "tools.list.names", { count: toolNames.length, names: toolNames });
    }

    if (toolSnapshotOnly) {
      // Used by ops to update the EXPECTED_BASE_TOOLS list intentionally.
      process.stdout.write(JSON.stringify({ count: toolNames.length, names: toolNames }, null, 2) + "\n");
      await client.close();
      process.exit(0);
    }

    // Loud failure if the inventory drifted from what our docs/this constant claim.
    const { missing, extra } = diffSets(toolNames, EXPECTED_ADVERTISED_TOOLS);
    if (missing.length) {
      failures.push(
        `tools/list: SHRUNK — expected tools missing: ${missing.join(", ")}. ` +
          `Update upstream pin or remove from EXPECTED_BASE_TOOLS / EXPECTED_ADVERTISED_TOOLS + docs.`,
      );
    }
    if (extra.length) {
      failures.push(
        `tools/list: EXPANDED — new tools advertised that we don't track: ${extra.join(", ")}. ` +
          `Decide whether to depend on them, then update EXPECTED_BASE_TOOLS + ` +
          `tools/edge-mcp/README.md + docs/references/edge-devtools-mcp.md.`,
      );
    }

    // Security-gated tools: presence/absence both need explicit acknowledgement.
    for (const name of SECURITY_GATED_TOOLS) {
      const present = toolNames.includes(name);
      const expectedPresent = EXPECTED_ADVERTISED_TOOLS.includes(name);
      if (present !== expectedPresent) {
        failures.push(
          `security-gated tool drift: "${name}" present=${present} expected=${expectedPresent}. ` +
            `Update SECURITY_GATED_TOOLS / EXPECTED_BASE_TOOLS + docs.`,
        );
      }
    }

    if (noUnsafeTools) {
      log("info", "step.browser_run_code_unsafe.denied");
      try {
        await client.request(
          "tools/call",
          {
            name: "browser_run_code_unsafe",
            arguments: { code: "return 1 + 1;" },
          },
          REQUEST_TIMEOUT_MS,
        );
        failures.push("browser_run_code_unsafe: call unexpectedly succeeded with EDGE_MCP_NO_UNSAFE_TOOLS enabled");
      } catch (err) {
        if (!/EDGE_MCP_NO_UNSAFE_TOOLS|disabled/.test(err.message)) {
          failures.push(`browser_run_code_unsafe: denial error had unexpected shape: ${err.message}`);
        } else {
          unsafeToolDenied = true;
          log("info", "browser_run_code_unsafe.denied.ok");
        }
      }
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
      if (!/Page URL: https:\/\/example\.com\/?/i.test(navText)) {
        failures.push("browser_navigate: response did not include Page URL https://example.com/");
      }
    }

    // 4. browser_console_messages — proves we can pull console state in addition
    //    to DOM. Image #3 step "observe runtime events during interaction" maps
    //    to this tool plus browser_network_requests. example.com has no
    //    console output, so we just assert the call returns a textual
    //    response without isError; that's enough to confirm wiring.
    log("info", "step.browser_console_messages");
    const consoleResult = await client.request(
      "tools/call",
      { name: "browser_console_messages", arguments: { all: true } },
      REQUEST_TIMEOUT_MS,
    );
    if (consoleResult.isError) {
      failures.push(
        `browser_console_messages: server returned isError=true: ${summarizeContent(consoleResult)}`,
      );
    } else {
      const consoleText = summarizeContent(consoleResult);
      log("info", "browser_console_messages.ok", {
        textLen: consoleText.length,
        textPreview: consoleText.slice(0, 200),
      });
    }

    // 5. browser_take_screenshot — confirms screenshot tool works against the
    //    same session. Skipped under --skip-screenshot for cold-profile speed.
    if (!skipScreenshot) {
      log("info", "step.browser_take_screenshot");
      const shotResult = await client.request(
        "tools/call",
        { name: "browser_take_screenshot", arguments: {} },
        NAV_TIMEOUT_MS,
      );
      if (shotResult.isError) {
        failures.push(
          `browser_take_screenshot: server returned isError=true: ${summarizeContent(shotResult)}`,
        );
      } else {
        const text = summarizeContent(shotResult);
        const imgs = contentImageCount(shotResult);
        log("info", "browser_take_screenshot.ok", { textLen: text.length, images: imgs });
        // The current @playwright/mcp returns the screenshot as a saved-file
        // reference in text content (".playwright-mcp/page-...jpeg") rather
        // than an embedded image part. Either is acceptable.
        const looksLikeFile = /\.playwright-mcp\/page-.*\.(jpe?g|png)/i.test(text);
        if (imgs === 0 && !looksLikeFile) {
          failures.push(
            "browser_take_screenshot: response had no image part and no saved-file reference",
          );
        }
      }
    } else {
      log("info", "step.browser_take_screenshot.skipped");
    }

    // 6. browser_snapshot — accessibility tree assertion (the "snapshot AFTER"
    //    step in image #3).
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
      if (!/heading\s+"Example Domain"/i.test(snapText)) {
        failures.push("browser_snapshot: accessibility tree missing heading node for 'Example Domain'");
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
    toolCount: toolNames.length,
    toolNames,
    expectedToolCount: EXPECTED_ADVERTISED_TOOLS.length,
    noUnsafeTools,
    unsafeToolDenied: noUnsafeTools ? unsafeToolDenied : null,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (recordLastRun) {
    writeLastRun(report);
  }
  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  log("error", "fatal", { err: err.stack || String(err) });
  process.exit(2);
});
