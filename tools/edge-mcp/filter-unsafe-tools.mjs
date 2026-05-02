#!/usr/bin/env node
// JSON-RPC stdio mediator for @playwright/mcp.
//
// When EDGE_MCP_NO_UNSAFE_TOOLS=1 is enabled by launch-mcp.sh, this wrapper
// hides browser_run_code_unsafe from tools/list and rejects tools/call before
// the request can reach the upstream MCP server.

import { spawn } from "node:child_process";

const UNSAFE_TOOLS = new Set(["browser_run_code_unsafe"]);
const DENY_ERROR_CODE = -32001;

function log(message, extra = {}) {
  process.stderr.write(
    JSON.stringify({
      "@timestamp": new Date().toISOString(),
      "log.level": "info",
      message,
      ...extra,
    }) + "\n",
  );
}

function parseLine(line, side) {
  try {
    return JSON.parse(line);
  } catch {
    log("edge-mcp.filter.unparseable", { side, line });
    return null;
  }
}

function isUnsafeToolsCall(msg) {
  return msg?.method === "tools/call" && UNSAFE_TOOLS.has(msg?.params?.name);
}

function deniedResponse(id, toolName) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: DENY_ERROR_CODE,
      message: `MCP tool "${toolName}" is disabled by EDGE_MCP_NO_UNSAFE_TOOLS=1`,
      data: {
        toolName,
        policy: "EDGE_MCP_NO_UNSAFE_TOOLS",
      },
    },
  };
}

function filterToolList(msg) {
  if (!Array.isArray(msg?.result?.tools)) return msg;
  const before = msg.result.tools.length;
  msg.result.tools = msg.result.tools.filter((tool) => !UNSAFE_TOOLS.has(tool?.name));
  const removed = before - msg.result.tools.length;
  if (removed > 0) {
    log("edge-mcp.filter.tools-list", { removed });
  }
  return msg;
}

function writeJson(stream, msg) {
  stream.write(JSON.stringify(msg) + "\n");
}

function pipeJsonLines(readable, onMessage, onRawLine) {
  let buf = "";
  readable.setEncoding("utf8");
  readable.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = parseLine(line.trim(), onRawLine);
      if (msg) onMessage(msg);
    }
  });
}

function runMediator(argv) {
  const sep = argv.indexOf("--");
  const command = sep >= 0 ? argv[sep + 1] : argv[0];
  const args = sep >= 0 ? argv.slice(sep + 2) : argv.slice(1);

  if (!command) {
    process.stderr.write("usage: filter-unsafe-tools.mjs -- <mcp-command> [args...]\n");
    process.exit(2);
  }

  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  child.stderr.pipe(process.stderr);

  pipeJsonLines(process.stdin, (msg) => {
    if (isUnsafeToolsCall(msg)) {
      log("edge-mcp.filter.denied", { toolName: msg.params.name });
      if (msg.id !== undefined) {
        writeJson(process.stdout, deniedResponse(msg.id, msg.params.name));
      }
      return;
    }
    writeJson(child.stdin, msg);
  }, "client");

  pipeJsonLines(child.stdout, (msg) => {
    if (msg?.id !== undefined && Array.isArray(msg?.result?.tools)) {
      writeJson(process.stdout, filterToolList(msg));
      return;
    }
    writeJson(process.stdout, msg);
  }, "server");

  process.stdin.on("end", () => child.stdin.end());
  process.stdin.on("error", () => child.stdin.end());

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

async function runSelfTest() {
  const toolsList = filterToolList({
    jsonrpc: "2.0",
    id: 1,
    result: {
      tools: [
        { name: "browser_navigate" },
        { name: "browser_run_code_unsafe" },
        { name: "browser_snapshot" },
      ],
    },
  });

  const visibleNames = toolsList.result.tools.map((tool) => tool.name);
  if (visibleNames.includes("browser_run_code_unsafe")) {
    throw new Error("self-test: unsafe tool remained visible");
  }

  const denied = deniedResponse(2, "browser_run_code_unsafe");
  if (denied.error?.code !== DENY_ERROR_CODE || !/disabled/.test(denied.error.message)) {
    throw new Error("self-test: denied response shape changed");
  }

  if (!isUnsafeToolsCall({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "browser_run_code_unsafe", arguments: { code: "1 + 1" } },
  })) {
    throw new Error("self-test: unsafe tools/call was not detected");
  }

  process.stdout.write(JSON.stringify({ pass: true, filteredTools: visibleNames }, null, 2) + "\n");
}

if (process.argv.includes("--self-test")) {
  runSelfTest().catch((err) => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exit(1);
  });
} else {
  runMediator(process.argv.slice(2));
}
