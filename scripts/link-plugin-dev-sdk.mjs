#!/usr/bin/env node

import { existsSync, mkdirSync, lstatSync, rmSync, symlinkSync, readlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const packageDir = process.cwd();
const sdkDir = join(repoRoot, "packages", "plugins", "sdk");
const scopeDir = join(packageDir, "node_modules", "@paperclipai");
const linkTarget = join(scopeDir, "plugin-sdk");

if (!existsSync(join(packageDir, "package.json"))) {
  throw new Error(`No package.json found in plugin directory: ${packageDir}`);
}

mkdirSync(scopeDir, { recursive: true });

const relativeSdkDir = relative(scopeDir, sdkDir);

try {
  const stat = lstatSync(linkTarget);
  if (stat.isSymbolicLink()) {
    const existingTarget = readlinkSync(linkTarget);
    if (existingTarget === relativeSdkDir) {
      console.log(`  ✓ Local @paperclipai/plugin-sdk link already correct for ${packageDir}`);
      process.exit(0);
    }
    rmSync(linkTarget, { force: true });
  } else {
    console.log("  i Keeping existing installed @paperclipai/plugin-sdk directory in place");
    process.exit(0);
  }
} catch {
  // target does not exist yet
}

try {
  symlinkSync(relativeSdkDir, linkTarget, "dir");
  console.log(`  ✓ Linked local @paperclipai/plugin-sdk for ${packageDir}`);
} catch (e) {
  if (e.code === "EEXIST") {
    // Double check if it's now correct (race condition win)
    const stat = lstatSync(linkTarget);
    if (stat.isSymbolicLink() && readlinkSync(linkTarget) === relativeSdkDir) {
      console.log(`  ✓ Local @paperclipai/plugin-sdk link was concurrently created for ${packageDir}`);
      process.exit(0);
    }
  }
  throw e;
}
