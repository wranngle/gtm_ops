# TypeScript Environment Modernization - Testing Guide

This document provides testing instructions for validating the modernized TypeScript environment in child projects.

## Environment Summary

| Component | Before | After |
|-----------|--------|-------|
| Runtime | Node.js | Bun v1.3.6+ |
| Language | JavaScript (.js) | TypeScript (.ts) |
| Validation | Zod (unused) | ArkType v2.1.29 |
| Linting | ESLint (basic) | XO v1.2.3 |
| Package Manager | npm | Bun |

---

## Prerequisites

### 1. Verify Bun Installation
```bash
bun --version
# Expected: 1.3.6 or higher
```

If not installed:
```powershell
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Dependencies
```bash
cd ~/.claude
bun install
```

---

## Test Suite

### Test 1: Lint Passes
```bash
bun run lint
```
**Expected**: 0 errors (warnings are acceptable)

### Test 2: TypeScript Compiles
```bash
bun run typecheck
```
**Expected**: No errors

### Test 3: Hook Execution
```bash
# Test a single hook
echo '{"tool_name":"Write","tool_input":{"file_path":"test.ts"}}' | bun run hooks/on-tool-invoke/tool_router.ts
```
**Expected**: JSON output with `{ "continue": true }` or similar

### Test 4: Bun Test Runner
```bash
bun test
```
**Expected**: Test suite passes

### Test 5: Script Execution
```bash
bun run scripts/validate-hooks.ts
```
**Expected**: Hook validation report

---

## Hook Categories to Test

### Session Start Hooks
```bash
# These run automatically on Claude Code session start
ls hooks/on-session-start/*.ts
```
- `mcp_health_check.ts` - Credential validation
- `global_authority_enforcer.ts` - Config absorption
- `hook_self_audit.ts` - Hook health check

### Prompt Submit Hooks
```bash
# Test with sample prompt
echo '{"prompt":"create a new workflow"}' | bun run hooks/on-prompt-submit/detect_workflow_intent.ts
```

### Tool Invoke Hooks
```bash
# Test file creation gate
echo '{"tool_name":"Write","tool_input":{"file_path":"hooks/test.js","content":"// test"}}' | bun run hooks/on-tool-invoke/file_creation_gate.ts
```
**Expected**: Should warn/block .js file in hooks/ directory

---

## Technology Standards Enforcement

### Test: JavaScript Blocked in hooks/
```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"hooks/new_hook.js"}}' | bun run hooks/on-tool-invoke/technology_standards_enforcer.ts
```
**Expected**: Advisory warning about using TypeScript instead

### Test: ArkType Required at I/O Boundaries
```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"utils/api_handler.ts","content":"export function handle(req) { return req; }"}}' | bun run hooks/on-tool-invoke/technology_standards_enforcer.ts
```
**Expected**: Advisory about missing ArkType validation

---

## Child Project Integration

### Inheriting Parent Config
Child projects should use the parent's credentials:

```typescript
// In child project
import { loadParentCredentials } from '~/.claude/utils/load_parent_credentials';

const creds = loadParentCredentials();
```

### Running Parent Hooks from Child
```bash
# From child project directory
bun run ~/.claude/hooks/on-tool-invoke/file_creation_gate.ts < input.json
```

---

## Common Issues & Solutions

### Issue: "bun: command not found"
```bash
# Add to PATH
export PATH="$HOME/.bun/bin:$PATH"
```

### Issue: TypeScript compilation errors
```bash
# Check tsconfig is being used
bun run tsc --showConfig
```

### Issue: Hook returns invalid JSON
```bash
# Validate hook output format
echo '{}' | bun run hooks/on-tool-invoke/tool_router.ts | jq .
```
**Expected**: Valid JSON with `continue` property

### Issue: XO lint fails on imports
The XO config disables strict import rules. If you see import errors:
```json
// In package.json xo config
"import-x/extensions": "off",
"import-x/order": "off"
```

---

## Validation Checklist

- [ ] `bun --version` returns 1.3.6+
- [ ] `bun install` completes without errors
- [ ] `bun run lint` returns 0 errors
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] Hook stdin/stdout protocol works
- [ ] technology_standards_enforcer blocks .js in hooks/
- [ ] Desktop Commander MCP is available in Claude Code

---

## File Inventory

### TypeScript Hooks (45 total)
```
hooks/
├── on-session-start/     # 8 hooks
├── on-prompt-submit/     # 8 hooks
├── on-tool-invoke/       # 20 hooks
├── on-tool-result/       # 6 hooks
├── on-task-complete/     # 2 hooks
└── *.ts                  # 3 shared utilities
```

### TypeScript Utilities (11 total)
```
utils/
├── credential-*.ts       # 2 credential utilities
├── schema_*.ts           # 3 schema utilities
├── config-merger.ts
├── get_paths.ts
├── hook_dashboard.ts
├── index.ts
├── load_parent_credentials.ts
└── mock_data_generator.ts
```

### TypeScript Scripts (17 total)
```
scripts/
├── test-hook.ts
├── validate-hooks.ts
├── scaffold_test.ts
└── ... (14 more)
```

---

## Support

If tests fail, check:
1. Bun version compatibility
2. Missing dependencies (`bun install`)
3. Hook audit log: `~/.claude/logs/hook_audit.log`
4. Circuit breaker status: `bun run scripts/reset_circuit_breaker.ts`
