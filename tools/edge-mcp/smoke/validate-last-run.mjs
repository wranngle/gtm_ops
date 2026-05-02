#!/usr/bin/env node
// validate-last-run.mjs — non-live ratchet for the Edge MCP smoke.
//
// This script validates tools/edge-mcp/smoke/LAST_RUN.md without launching
// Edge. It lets CI and the doc gardener fail on stale live-smoke evidence while
// keeping the actual browser smoke local-only.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const lastRunPath = resolve(repoRoot, readArg("--path", "tools/edge-mcp/smoke/LAST_RUN.md"));
const maxAgeDays = Number(readArg("--max-age-days", process.env.EDGE_MCP_LAST_RUN_MAX_AGE_DAYS || "30"));

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("missing leading YAML-style front matter");

  const fields = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    fields[key] = value;
  }
  return fields;
}

function requireField(fields, key, problems) {
  if (!Object.prototype.hasOwnProperty.call(fields, key) || fields[key] === "") {
    problems.push(`LAST_RUN is missing required field "${key}"`);
  }
}

function toBool(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function daysBetweenSeconds(newer, older) {
  return (newer - older) / 86_400;
}

function main() {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new Error(`invalid --max-age-days value: ${maxAgeDays}`);
  }

  const content = readFileSync(lastRunPath, "utf8");
  const fields = parseFrontMatter(content);
  const problems = [];

  for (const key of [
    "schema_version",
    "commit_sha",
    "timestamp_utc",
    "status",
    "tool_count",
    "expected_tool_count",
    "no_unsafe_tools",
    "unsafe_tool_denied",
  ]) {
    requireField(fields, key, problems);
  }

  if (fields.schema_version !== "1") {
    problems.push(`schema_version must be 1, got "${fields.schema_version}"`);
  }

  if (!/^[0-9a-f]{40}$/i.test(fields.commit_sha || "")) {
    problems.push(`commit_sha must be a full 40-character Git SHA, got "${fields.commit_sha}"`);
  }

  const timestampMs = Date.parse(fields.timestamp_utc || "");
  if (!Number.isFinite(timestampMs)) {
    problems.push(`timestamp_utc must be an ISO timestamp, got "${fields.timestamp_utc}"`);
  }

  if (fields.status !== "pass") {
    problems.push(`last live smoke status must be pass, got "${fields.status}"`);
  }

  const toolCount = Number(fields.tool_count);
  const expectedToolCount = Number(fields.expected_tool_count);
  if (!Number.isInteger(toolCount) || toolCount <= 0) {
    problems.push(`tool_count must be a positive integer, got "${fields.tool_count}"`);
  }
  if (!Number.isInteger(expectedToolCount) || expectedToolCount <= 0) {
    problems.push(`expected_tool_count must be a positive integer, got "${fields.expected_tool_count}"`);
  }
  if (Number.isInteger(toolCount) && Number.isInteger(expectedToolCount) && toolCount !== expectedToolCount) {
    problems.push(`tool_count (${toolCount}) must equal expected_tool_count (${expectedToolCount})`);
  }

  const noUnsafeTools = toBool(fields.no_unsafe_tools);
  const unsafeToolDenied = toBool(fields.unsafe_tool_denied);
  if (noUnsafeTools !== true) {
    problems.push(`no_unsafe_tools must be true for the default policy, got "${fields.no_unsafe_tools}"`);
  }
  if (unsafeToolDenied !== true) {
    problems.push(`unsafe_tool_denied must be true, got "${fields.unsafe_tool_denied}"`);
  }

  let headSha = "";
  let commitLagDays = 0;
  let recordAgeDays = 0;
  if (/^[0-9a-f]{40}$/i.test(fields.commit_sha || "")) {
    try {
      gitOutput(["cat-file", "-e", `${fields.commit_sha}^{commit}`]);
      headSha = gitOutput(["rev-parse", "HEAD"]);
      gitOutput(["merge-base", "--is-ancestor", fields.commit_sha, "HEAD"]);
      const headCommitSeconds = Number(gitOutput(["show", "-s", "--format=%ct", "HEAD"]));
      const runCommitSeconds = Number(gitOutput(["show", "-s", "--format=%ct", fields.commit_sha]));
      commitLagDays = daysBetweenSeconds(headCommitSeconds, runCommitSeconds);
      if (commitLagDays > maxAgeDays) {
        problems.push(
          `recorded commit is ${commitLagDays.toFixed(1)} days behind HEAD; max is ${maxAgeDays}`,
        );
      }
    } catch (err) {
      problems.push(`commit_sha is not an ancestor commit of HEAD: ${err.message.trim()}`);
    }
  }

  if (Number.isFinite(timestampMs)) {
    recordAgeDays = (Date.now() - timestampMs) / 86_400_000;
    if (recordAgeDays > maxAgeDays) {
      problems.push(`LAST_RUN timestamp is ${recordAgeDays.toFixed(1)} days old; max is ${maxAgeDays}`);
    }
  }

  const summary =
    `edge-mcp LAST_RUN commit=${fields.commit_sha || "missing"}` +
    ` head=${headSha || "unknown"}` +
    ` status=${fields.status || "missing"}` +
    ` record_age_days=${recordAgeDays.toFixed(1)}` +
    ` commit_lag_days=${commitLagDays.toFixed(1)}`;

  if (problems.length) {
    process.stderr.write(`${summary}\n`);
    for (const problem of problems) {
      process.stderr.write(`edge-mcp LAST_RUN invalid: ${problem}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`${summary}\n`);
}

main();
