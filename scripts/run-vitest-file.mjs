#!/usr/bin/env node
/**
 * run-vitest-file.mjs — Run Vitest for a specific file or directory,
 * automatically resolving which workspace project it belongs to.
 *
 * Usage:
 *   pnpm test:file server/src/__tests__/health.test.ts
 *   pnpm test:file packages/shared/src/utils.test.ts
 *   pnpm test:file server/src/__tests__/             # all tests in directory
 *   pnpm test:file server/src/__tests__/health.test.ts --watch
 *
 * How it works:
 *   1. Resolves the given path to an absolute path
 *   2. Reads the root vitest.config.ts `projects` list
 *   3. Finds which project directory contains the target file/dir
 *   4. Reads the project's package.json to get its `name`
 *   5. Runs vitest with `--project <name>` and the file path filter
 *
 * This fixes DEBT-001: without --project, Vitest workspace mode runs ALL
 * projects and ignores the file argument, causing slow and noisy test runs.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = findRepoRoot();
const rootConfig = path.join(repoRoot, "vitest.config.ts");

// --- Project directory → package name mapping ---
// Built from root vitest.config.ts `projects` array + each project's package.json.
// We parse this statically to avoid eval'ing TypeScript at runtime.
const PROJECT_DIRS = parseProjectDirs();

function findRepoRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "vitest.config.ts")) && existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: cwd
  return process.cwd();
}

/**
 * Parse the root vitest.config.ts to extract the `projects` array.
 * We use a simple regex rather than eval'ing TypeScript.
 */
function parseProjectDirs() {
  const configContent = readFileSync(rootConfig, "utf-8");
  // Match the projects array: projects: ["packages/shared", ...]
  const match = configContent.match(/projects:\s*\[([\s\S]*?)\]/);
  if (!match) {
    console.error("[test:file] Could not parse projects from vitest.config.ts");
    process.exit(1);
  }

  const entries = [];
  // Extract quoted strings from the array
  const stringPattern = /["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = stringPattern.exec(match[1])) !== null) {
    const dir = m[1];
    const absDir = path.resolve(repoRoot, dir);
    const pkgJsonPath = path.join(absDir, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        entries.push({ dir: absDir, relDir: dir, name: pkg.name });
      } catch {
        // Skip malformed package.json
      }
    }
  }

  return entries;
}

/**
 * Find which project contains the given absolute path.
 */
function findProject(absPath) {
  // Normalize to compare
  const normalized = absPath.endsWith(path.sep) ? absPath : absPath + path.sep;

  // Sort by dir length descending so deeper paths match first
  // (e.g., packages/adapters/claude-local before packages/adapters)
  const sorted = [...PROJECT_DIRS].sort((a, b) => b.dir.length - a.dir.length);

  for (const project of sorted) {
    const projectPrefix = project.dir + path.sep;
    if (normalized.startsWith(projectPrefix) || absPath === project.dir) {
      return project;
    }
  }

  return null;
}

function printUsage() {
  console.log(`
Usage: pnpm test:file <path> [vitest-options]

Run Vitest for a specific test file or directory, automatically resolving
which workspace project it belongs to.

Examples:
  pnpm test:file server/src/__tests__/health.test.ts
  pnpm test:file packages/shared/src/
  pnpm test:file server/src/__tests__/health.test.ts --watch

Available projects:`);

  for (const p of PROJECT_DIRS) {
    console.log(`  ${p.relDir.padEnd(45)} → ${p.name}`);
  }

  console.log(`
Why this exists:
  Vitest workspace mode (with \`projects\` in vitest.config.ts) runs ALL
  projects when you specify a file path. This script detects which project
  owns the file and passes --project automatically for fast, isolated runs.
`);
}

// --- Main ---
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  printUsage();
  process.exit(0);
}

const targetPath = args[0];
const extraArgs = args.slice(1);

// Resolve the target path relative to cwd
const absTarget = path.resolve(process.cwd(), targetPath);

if (!existsSync(absTarget)) {
  console.error(`[test:file] Path not found: ${absTarget}`);
  console.error(`[test:file] Hint: paths are relative to cwd (${process.cwd()})`);
  process.exit(1);
}

const project = findProject(absTarget);

if (!project) {
  console.error(`[test:file] Could not determine project for: ${targetPath}`);
  console.error(`[test:file] The file must be inside one of the workspace projects.`);
  console.error(`[test:file] Run 'pnpm test:file --help' to see available projects.`);
  process.exit(1);
}

// Build the relative path from repo root for vitest
const relPath = path.relative(repoRoot, absTarget).split(path.sep).join("/");
const isDir = statSync(absTarget).isDirectory();

// Determine run mode: --watch if passed, otherwise 'run'
const isWatch = extraArgs.includes("--watch") || extraArgs.includes("-w");
const filteredExtra = extraArgs.filter((a) => a !== "--watch" && a !== "-w");

const vitestCmd = isWatch ? [] : ["run"];
const vitestArgs = [
  ...vitestCmd,
  "--project",
  project.name,
  ...(isDir ? [] : [relPath]),
  ...filteredExtra,
];

console.log(`[test:file] 🎯 Project: ${project.name} (${project.relDir})`);
console.log(`[test:file] 📂 Target:  ${relPath}${isDir ? " (directory)" : ""}`);
console.log(`[test:file] ▶  Command: pnpm exec vitest ${vitestArgs.join(" ")}`);
console.log();

// Create isolated temp dirs same as run-vitest-stable.mjs
const tempRootParent = process.platform === "win32" ? os.tmpdir() : "/tmp";
const testRoot = mkdtempSync(path.join(tempRootParent, `pcvt-file-${process.pid}-`));
const env = {
  ...process.env,
  PAPERCLIP_HOME: path.join(testRoot, "h"),
  PAPERCLIP_INSTANCE_ID: `vt-file-${process.pid}`,
  TMPDIR: path.join(testRoot, "t"),
};
mkdirSync(env.PAPERCLIP_HOME, { recursive: true });
mkdirSync(env.TMPDIR, { recursive: true });

const result = spawnSync("pnpm", ["exec", "vitest", ...vitestArgs], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`[test:file] Failed to start Vitest: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
