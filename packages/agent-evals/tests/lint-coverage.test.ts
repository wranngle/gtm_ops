import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// These tests exercise scripts/lint-layered-architecture.sh by planting
// scratch files in a throwaway sibling package under packages/ and asserting
// the lint exits non-zero (forbidden) or zero (allowed). The lint scans the
// whole packages/ tree, so the scratch package is the only meaningful surface.
//
// The scratch package is named with a leading underscore so it is obvious it
// is not a real domain. Cleanup runs after every case via `afterEach`.

// Resolve the repo root from a known marker file so the test works whether
// bun is invoked from a Linux path or a Windows UNC path. We then convert it
// into a POSIX path the WSL bash can use directly.
function locateRepoRoot(): string {
  let dir = import.meta.dir;
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(dir, "scripts", "lint-layered-architecture.sh"))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate repo root from ${import.meta.dir}; lint script missing`,
  );
}

function toPosixPath(input: string): string {
  // UNC path from Windows-launched bun: \\wsl.localhost\<distro>\home\...
  // Strip the \\wsl.localhost\<distro> prefix and normalize separators.
  let path = input;
  const uncMatch = path.match(/^\\\\wsl\.localhost\\[^\\]+(.*)$/i);
  if (uncMatch && uncMatch[1]) {
    path = uncMatch[1];
  }
  return path.replace(/\\/g, "/");
}

const repoRoot = locateRepoRoot();
const lintScript = toPosixPath(join(repoRoot, "scripts", "lint-layered-architecture.sh"));
const structuredLoggingScript = toPosixPath(
  join(repoRoot, "scripts", "lint-structured-logging.sh"),
);
const namingConventionsScript = toPosixPath(
  join(repoRoot, "scripts", "lint-naming-conventions.sh"),
);
const repoRootPosix = toPosixPath(repoRoot);
const scratchPkg = join(repoRoot, "packages", "_lint_test_scratch");
const scratchSrc = join(scratchPkg, "src");

const layers = [
  "types",
  "config",
  "repo",
  "providers",
  "service",
  "runtime",
  "ui",
] as const;

type Layer = (typeof layers)[number];

function setupScratchPackage(): void {
  rmSync(scratchPkg, { recursive: true, force: true });
  for (const layer of layers) {
    const dir = join(scratchSrc, layer);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.ts"), `export const x_${layer} = 1;\n`);
  }
}

function plantStatement(layer: Layer, file: string, contents: string): void {
  writeFileSync(join(scratchSrc, layer, file), contents);
}

// Bun on Windows-via-WSL cannot find a Linux `bash` directly, so fall back to
// `wsl.exe bash` when the direct invocation reports ENOENT. That keeps the
// negative-case suite portable across the environments we actually run in.
// Both branches use the POSIX-form repo path so bash can resolve cwd.
const lintInvocations: Array<{ cmd: string; argv: string[] }> = [
  { cmd: "bash", argv: ["-c", `cd "${repoRootPosix}" && "${lintScript}"`] },
  { cmd: "wsl.exe", argv: ["bash", "-c", `cd "${repoRootPosix}" && "${lintScript}"`] },
];

function runLint(): { exitCode: number; stderr: string; stdout: string } {
  for (const inv of lintInvocations) {
    const result = spawnSync(inv.cmd, inv.argv, {
      encoding: "utf-8",
    });
    if (
      result.error &&
      "code" in result.error &&
      (result.error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      continue;
    }
    return {
      exitCode: result.status ?? -1,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  }
  throw new Error(
    "could not invoke scripts/lint-layered-architecture.sh — neither bash nor wsl.exe is on PATH",
  );
}

afterEach(() => {
  rmSync(scratchPkg, { recursive: true, force: true });
});

describe("layered-architecture lint coverage", () => {
  test("lint passes against the real codebase baseline", () => {
    if (existsSync(scratchPkg)) {
      rmSync(scratchPkg, { recursive: true, force: true });
    }
    const { exitCode } = runLint();
    expect(exitCode).toBe(0);
  });

  // Every forbidden edge in the allowed-imports table must be flagged.
  const forbidden: Array<[Layer, Layer]> = [
    ["types", "config"],
    ["types", "repo"],
    ["types", "providers"],
    ["types", "service"],
    ["types", "runtime"],
    ["types", "ui"],
    ["config", "repo"],
    ["config", "providers"],
    ["config", "service"],
    ["config", "runtime"],
    ["config", "ui"],
    ["repo", "providers"],
    ["repo", "service"],
    ["repo", "runtime"],
    ["repo", "ui"],
    ["providers", "config"],
    ["providers", "repo"],
    ["providers", "service"],
    ["providers", "runtime"],
    ["providers", "ui"],
    ["service", "runtime"],
    ["service", "ui"],
    ["ui", "config"],
    ["ui", "repo"],
    ["ui", "providers"],
    ["ui", "runtime"],
  ];

  for (const [from, to] of forbidden) {
    test(`forbidden: ${from} -> ${to}`, () => {
      setupScratchPackage();
      plantStatement(from, "probe.ts", `import { x_${to} } from "../${to}";\n`);
      const { exitCode, stderr } = runLint();
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain(from);
      expect(stderr).toContain(to);
    });
  }

  // Every allowed edge must NOT be flagged.
  const allowed: Array<[Layer, Layer]> = [
    ["config", "types"],
    ["repo", "types"],
    ["repo", "config"],
    ["providers", "types"],
    ["service", "types"],
    ["service", "config"],
    ["service", "repo"],
    ["service", "providers"],
    ["runtime", "types"],
    ["runtime", "config"],
    ["runtime", "repo"],
    ["runtime", "providers"],
    ["runtime", "service"],
    ["runtime", "ui"],
    ["ui", "types"],
    ["ui", "service"],
  ];

  for (const [from, to] of allowed) {
    test(`allowed: ${from} -> ${to}`, () => {
      setupScratchPackage();
      plantStatement(from, "probe.ts", `import { x_${to} } from "../${to}";\n`);
      const { exitCode } = runLint();
      expect(exitCode).toBe(0);
    });
  }

  test("flags multi-line imports", () => {
    setupScratchPackage();
    plantStatement(
      "config",
      "multiline.ts",
      `import {\n  x_service,\n} from "../service";\n`,
    );
    const { exitCode, stderr } = runLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("../service");
  });

  test("flags 'export * from' re-exports", () => {
    setupScratchPackage();
    plantStatement("config", "reexport.ts", `export * from "../service";\n`);
    const { exitCode, stderr } = runLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("../service");
  });

  test("flags 'export { x } from' re-exports", () => {
    setupScratchPackage();
    plantStatement(
      "config",
      "reexport-named.ts",
      `export { x_service } from "../service";\n`,
    );
    const { exitCode } = runLint();
    expect(exitCode).not.toBe(0);
  });

  test("flags dynamic import() with literal paths", () => {
    setupScratchPackage();
    plantStatement(
      "config",
      "dynamic.ts",
      `export async function loader() {\n  return await import("../service");\n}\n`,
    );
    const { exitCode } = runLint();
    expect(exitCode).not.toBe(0);
  });

  test("ignores 'import' inside a comment", () => {
    setupScratchPackage();
    plantStatement(
      "config",
      "comment.ts",
      `// import { x_service } from "../service";\nexport const ok = 1;\n`,
    );
    const { exitCode } = runLint();
    expect(exitCode).toBe(0);
  });

  test("ignores 'import' inside a block comment", () => {
    setupScratchPackage();
    plantStatement(
      "config",
      "block-comment.ts",
      `/* import { x_service } from "../service"; */\nexport const ok = 1;\n`,
    );
    const { exitCode } = runLint();
    expect(exitCode).toBe(0);
  });

  test("flags imports targeting a layer dir that is not in the allowed-imports map", () => {
    setupScratchPackage();
    const bogus = join(scratchSrc, "bogus");
    mkdirSync(bogus, { recursive: true });
    writeFileSync(join(bogus, "index.ts"), `export const x = 1;\n`);
    plantStatement(
      "service",
      "uses-bogus.ts",
      `import { x } from "../bogus";\n`,
    );
    const { exitCode, stderr } = runLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("bogus");
  });

  test("flags cross-domain imports via relative paths", () => {
    setupScratchPackage();
    const otherPkg = join(repoRoot, "packages", "_lint_test_other");
    rmSync(otherPkg, { recursive: true, force: true });
    mkdirSync(join(otherPkg, "src", "service"), { recursive: true });
    writeFileSync(
      join(otherPkg, "src", "service", "index.ts"),
      `export const x = 1;\n`,
    );
    try {
      plantStatement(
        "service",
        "cross.ts",
        `import { x } from "../../../_lint_test_other/src/service";\n`,
      );
      const { exitCode, stderr } = runLint();
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/across the domain boundary/);
      expect(stderr).toContain("_lint_test_other");
    } finally {
      rmSync(otherPkg, { recursive: true, force: true });
    }
  });

  test("flags cross-domain imports via @wranngle scoped paths", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "cross-scoped.ts",
      `import { something } from "@wranngle/agent-evals";\n`,
    );
    const { exitCode, stderr } = runLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("agent-evals");
  });

  test("does not flag external npm package imports", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "external.ts",
      `import { z } from "zod";\n`,
    );
    const { exitCode } = runLint();
    expect(exitCode).toBe(0);
  });
});

// scripts/lint-structured-logging.sh — STACK-040.
//
// Reuses the same scratch-package pattern but invokes the structured-logging
// lint script. The lint scans every packages/*/src/<layer>/ for forbidden
// `console.*` and `process.{stderr,stdout}.write` calls outside the runtime
// layer (and outside providers/logger.ts, which IS the structured emitter).
const structuredLoggingInvocations: Array<{ cmd: string; argv: string[] }> = [
  { cmd: "bash", argv: ["-c", `cd "${repoRootPosix}" && "${structuredLoggingScript}"`] },
  {
    cmd: "wsl.exe",
    argv: ["bash", "-c", `cd "${repoRootPosix}" && "${structuredLoggingScript}"`],
  },
];

function runStructuredLoggingLint(): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  for (const inv of structuredLoggingInvocations) {
    const result = spawnSync(inv.cmd, inv.argv, { encoding: "utf-8" });
    if (
      result.error &&
      "code" in result.error &&
      (result.error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      continue;
    }
    return {
      exitCode: result.status ?? -1,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  }
  throw new Error(
    "could not invoke scripts/lint-structured-logging.sh — neither bash nor wsl.exe is on PATH",
  );
}

describe("structured-logging lint coverage (STACK-040)", () => {
  test("lint passes against the real codebase baseline", () => {
    if (existsSync(scratchPkg)) {
      rmSync(scratchPkg, { recursive: true, force: true });
    }
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  // Every non-runtime layer + console method must be flagged.
  const forbiddenLayers: Layer[] = [
    "types",
    "config",
    "repo",
    "providers",
    "service",
    "ui",
  ];
  const consoleMethods = ["log", "info", "warn", "error", "debug", "trace"];

  for (const layer of forbiddenLayers) {
    for (const method of consoleMethods) {
      test(`forbidden: console.${method} in ${layer}/`, () => {
        setupScratchPackage();
        plantStatement(
          layer,
          `console-${method}.ts`,
          `export function emit() { console.${method}("nope"); }\n`,
        );
        const { exitCode, stderr } = runStructuredLoggingLint();
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain(`console.${method}`);
        expect(stderr).toContain(layer);
      });
    }

    test(`forbidden: process.stderr.write in ${layer}/`, () => {
      setupScratchPackage();
      plantStatement(
        layer,
        "stderr.ts",
        `export function emit() { process.stderr.write("nope\\n"); }\n`,
      );
      const { exitCode, stderr } = runStructuredLoggingLint();
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("process.stderr.write");
    });

    test(`forbidden: process.stdout.write in ${layer}/`, () => {
      setupScratchPackage();
      plantStatement(
        layer,
        "stdout.ts",
        `export function emit() { process.stdout.write("nope\\n"); }\n`,
      );
      const { exitCode, stderr } = runStructuredLoggingLint();
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("process.stdout.write");
    });
  }

  test("allowed: console.log in runtime/", () => {
    setupScratchPackage();
    plantStatement(
      "runtime",
      "boot.ts",
      `export function boot() { console.log("starting"); }\n`,
    );
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  test("allowed: process.stderr.write in runtime/", () => {
    setupScratchPackage();
    plantStatement(
      "runtime",
      "cli.ts",
      `export function cli() { process.stderr.write("usage\\n"); }\n`,
    );
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  test("allowed: process.stderr.write in providers/logger.ts (the structured emitter)", () => {
    setupScratchPackage();
    plantStatement(
      "providers",
      "logger.ts",
      `export const sink = { write(line: string) { process.stderr.write(line); } };\n`,
    );
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  test("ignores 'console.log' inside a line comment", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "comment.ts",
      `// console.log("nope");\nexport const ok = 1;\n`,
    );
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  test("ignores 'console.log' inside a block comment (multi-line)", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "block-comment.ts",
      `/*\n  console.log("nope");\n*/\nexport const ok = 1;\n`,
    );
    const { exitCode } = runStructuredLoggingLint();
    expect(exitCode).toBe(0);
  });

  test("violation message includes a remediation hint pointing at the logger provider", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "noisy.ts",
      `export function noisy() { console.error("oops"); }\n`,
    );
    const { stderr } = runStructuredLoggingLint();
    expect(stderr).toContain("providers/logger");
    expect(stderr).toContain("docs/references/layered-domain-architecture.md");
  });
});

// scripts/lint-naming-conventions.sh — STACK-041.
//
// Reuses the same scratch-package pattern but invokes the naming-conventions
// lint, which scans packages/*/src/{types,config}/ for schema/type pair drift.
const namingConventionsInvocations: Array<{ cmd: string; argv: string[] }> = [
  { cmd: "bash", argv: ["-c", `cd "${repoRootPosix}" && "${namingConventionsScript}"`] },
  {
    cmd: "wsl.exe",
    argv: ["bash", "-c", `cd "${repoRootPosix}" && "${namingConventionsScript}"`],
  },
];

function runNamingConventionsLint(): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  for (const inv of namingConventionsInvocations) {
    const result = spawnSync(inv.cmd, inv.argv, { encoding: "utf-8" });
    if (
      result.error &&
      "code" in result.error &&
      (result.error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      continue;
    }
    return {
      exitCode: result.status ?? -1,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    };
  }
  throw new Error(
    "could not invoke scripts/lint-naming-conventions.sh — neither bash nor wsl.exe is on PATH",
  );
}

describe("naming-conventions lint coverage (STACK-041)", () => {
  test("lint passes against the real codebase baseline", () => {
    if (existsSync(scratchPkg)) {
      rmSync(scratchPkg, { recursive: true, force: true });
    }
    const { exitCode } = runNamingConventionsLint();
    expect(exitCode).toBe(0);
  });

  test("forbidden: schema constant with lowercase first letter", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "lower-schema.ts",
      `import { z } from "zod";\nexport const fooSchema = z.object({});\n`,
    );
    const { exitCode, stderr } = runNamingConventionsLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("fooSchema");
    expect(stderr).toContain("FooSchema");
  });

  test("forbidden: schema constant missing the Schema suffix", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "no-suffix.ts",
      `import { z } from "zod";\nexport const Bar = z.string();\n`,
    );
    const { exitCode, stderr } = runNamingConventionsLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("BarSchema");
  });

  test("forbidden: inferred type with lowercase first letter", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "lower-type.ts",
      `import { z } from "zod";\nexport const FooSchema = z.string();\nexport type foo = z.infer<typeof FooSchema>;\n`,
    );
    const { exitCode, stderr } = runNamingConventionsLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('inferred type "foo"');
  });

  test("forbidden: type name does not match schema name minus Schema suffix", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "mismatch.ts",
      `import { z } from "zod";\nexport const FooSchema = z.string();\nexport type Bar = z.infer<typeof FooSchema>;\n`,
    );
    const { exitCode, stderr } = runNamingConventionsLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('"Bar"');
    expect(stderr).toContain('"Foo"');
  });

  test("forbidden: Hungarian-prefix interface", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "hungarian.ts",
      `export interface IUser { id: string; }\n`,
    );
    const { exitCode, stderr } = runNamingConventionsLint();
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("IUser");
    expect(stderr).toContain("Hungarian");
  });

  test("allowed: canonical FooSchema + Foo pair", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "canonical.ts",
      `import { z } from "zod";\nexport const ConversationSchema = z.object({});\nexport type Conversation = z.infer<typeof ConversationSchema>;\n`,
    );
    const { exitCode } = runNamingConventionsLint();
    expect(exitCode).toBe(0);
  });

  test("allowed: forbidden patterns inside a line comment do not trigger", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "comment.ts",
      `// export const fooSchema = z.string();\nexport const ok = 1;\n`,
    );
    const { exitCode } = runNamingConventionsLint();
    expect(exitCode).toBe(0);
  });

  test("allowed: forbidden patterns inside a block comment do not trigger", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "block-comment.ts",
      `/*\n  export const fooSchema = z.string();\n  export interface IUser {}\n*/\nexport const ok = 1;\n`,
    );
    const { exitCode } = runNamingConventionsLint();
    expect(exitCode).toBe(0);
  });

  test("does not scan files outside types/ or config/", () => {
    setupScratchPackage();
    plantStatement(
      "service",
      "schemas.ts",
      `import { z } from "zod";\nexport const fooSchema = z.string();\nexport interface IUser {}\n`,
    );
    const { exitCode } = runNamingConventionsLint();
    expect(exitCode).toBe(0);
  });

  test("violation message references the docs anchor", () => {
    setupScratchPackage();
    plantStatement(
      "types",
      "bad.ts",
      `import { z } from "zod";\nexport const fooSchema = z.string();\n`,
    );
    const { stderr } = runNamingConventionsLint();
    expect(stderr).toContain("docs/references/layered-domain-architecture.md");
  });
});
