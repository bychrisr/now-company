#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, "server");
const serverTestsDir = path.join(repoRoot, "server", "src", "__tests__");
const nonServerProjects = [
  "@paperclipai/shared",
  "@paperclipai/db",
  "@paperclipai/adapter-utils",
  "@paperclipai/adapter-acpx-local",
  "@paperclipai/adapter-codex-local",
  "@paperclipai/adapter-opencode-local",
  "@paperclipai/plugin-sdk",
  "@paperclipai/ui",
  "paperclipai",
];
const routeTestPattern = /[^/]*(?:route|routes|authz)[^/]*\.test\.ts$/;
const additionalSerializedServerTests = new Set([
  "server/src/__tests__/approval-routes-idempotency.test.ts",
  "server/src/__tests__/assets.test.ts",
  "server/src/__tests__/authz-company-access.test.ts",
  "server/src/__tests__/companies-route-path-guard.test.ts",
  "server/src/__tests__/company-portability.test.ts",
  "server/src/__tests__/costs-service.test.ts",
  "server/src/__tests__/express5-auth-wildcard.test.ts",
  "server/src/__tests__/health-dev-server-token.test.ts",
  "server/src/__tests__/health.test.ts",
  "server/src/__tests__/heartbeat-dependency-scheduling.test.ts",
  "server/src/__tests__/heartbeat-issue-liveness-escalation.test.ts",
  "server/src/__tests__/heartbeat-process-recovery.test.ts",
  "server/src/__tests__/invite-accept-existing-member.test.ts",
  "server/src/__tests__/invite-accept-gateway-defaults.test.ts",
  "server/src/__tests__/invite-accept-replay.test.ts",
  "server/src/__tests__/invite-expiry.test.ts",
  "server/src/__tests__/invite-join-manager.test.ts",
  "server/src/__tests__/invite-onboarding-text.test.ts",
  "server/src/__tests__/issues-checkout-wakeup.test.ts",
  "server/src/__tests__/issues-service.test.ts",
  "server/src/__tests__/opencode-local-adapter-environment.test.ts",
  "server/src/__tests__/project-routes-env.test.ts",
  "server/src/__tests__/redaction.test.ts",
  "server/src/__tests__/routines-e2e.test.ts",
]);
let invocationIndex = 0;
const serializedModeName = "serialized";
const generalModeName = "general";
const allModeName = "all";
const generalServerGroupName = "general-server";
const generalWorkspacesAGroupName = "general-workspaces-a";
const generalWorkspacesBGroupName = "general-workspaces-b";
const generalWorkspacesAProjects = ["@paperclipai/ui", "paperclipai"];
const generalWorkspacesBProjects = nonServerProjects.filter((project) => !generalWorkspacesAProjects.includes(project));
const generalGroupNames = [generalServerGroupName, generalWorkspacesAGroupName, generalWorkspacesBGroupName];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      files.push(...walk(absolute));
    } else if (stats.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function toRepoPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function toServerPath(file) {
  return path.relative(serverRoot, file).split(path.sep).join("/");
}

function isRouteOrAuthzTest(file) {
  if (routeTestPattern.test(file)) {
    return true;
  }

  return additionalSerializedServerTests.has(file);
}

function fail(message) {
  console.error(`[test:run] ${message}`);
  process.exit(1);
}

function readOptionValue(argv, index, argName) {
  const value = argv[index + 1];
  if (value === undefined) {
    fail(`Missing value for ${argName}`);
  }

  return value;
}

function parseNonNegativeInteger(value, argName) {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
    fail(`${argName} must be a non-negative integer. Received "${value}".`);
  }

  return parsed;
}

function parsePositiveInteger(value, argName) {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed) || parsed < 1) {
    fail(`${argName} must be a positive integer. Received "${value}".`);
  }

  return parsed;
}

function parseCliOptions(argv) {
  let mode = allModeName;
  let shardIndex = null;
  let shardCount = null;
  let group = null;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }

    if (arg === "--mode") {
      mode = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
      continue;
    }

    if (arg === "--shard-index") {
      shardIndex = parseNonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--shard-index=")) {
      shardIndex = parseNonNegativeInteger(arg.slice("--shard-index=".length), "--shard-index");
      continue;
    }

    if (arg === "--shard-count") {
      shardCount = parsePositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--shard-count=")) {
      shardCount = parsePositiveInteger(arg.slice("--shard-count=".length), "--shard-count");
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--group") {
      group = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--group=")) {
      group = arg.slice("--group=".length);
      continue;
    }

    fail(`Unknown argument "${arg}".`);
  }

  if (!new Set([allModeName, generalModeName, serializedModeName]).has(mode)) {
    fail(`Unknown mode "${mode}". Expected one of: ${allModeName}, ${generalModeName}, ${serializedModeName}.`);
  }

  if ((shardIndex === null) !== (shardCount === null)) {
    fail("--shard-index and --shard-count must be provided together.");
  }

  if (mode !== serializedModeName && shardIndex !== null) {
    fail("--shard-index/--shard-count are only valid with --mode serialized.");
  }

  if (group !== null && mode !== generalModeName) {
    fail("--group is only valid with --mode general.");
  }

  if (group !== null && !generalGroupNames.includes(group)) {
    fail(`Unknown group "${group}". Expected one of: ${generalGroupNames.join(", ")}.`);
  }

  if (mode === serializedModeName) {
    const resolvedShardCount = shardCount ?? 1;
    const resolvedShardIndex = shardIndex ?? 0;
    if (resolvedShardIndex >= resolvedShardCount) {
      fail(`--shard-index must be less than --shard-count. Received ${resolvedShardIndex} of ${resolvedShardCount}.`);
    }

    return {
      mode,
      shardIndex: resolvedShardIndex,
      shardCount: resolvedShardCount,
      group: null,
      dryRun,
    };
  }

  return {
    mode,
    shardIndex: null,
    shardCount: null,
    group,
    dryRun,
  };
}

function selectSerializedSuites(routeTests, shardIndex, shardCount) {
  return routeTests.filter((_, index) => index % shardCount === shardIndex);
}

// URL admin do postgres compartilhado (template). Quando setada, é propagada para os processos filhos
// de teste via env PAPERCLIP_SHARED_TEST_PG_URL — eles clonam o template ao invés de subir postgres novo.
let sharedTemplatePgAdminUrl = null;

function runVitest(args, label) {
  console.log(`\n[test:run] ${label}`);
  invocationIndex += 1;
  const tempRootParent = process.platform === "win32" ? os.tmpdir() : "/tmp";
  const testRoot = mkdtempSync(path.join(tempRootParent, `pcvt-${process.pid}-${invocationIndex}-`));
  // Keep per-run paths compact so Unix socket fixtures stay under macOS path limits.
  const env = {
    ...process.env,
    PAPERCLIP_HOME: path.join(testRoot, "h"),
    PAPERCLIP_INSTANCE_ID: `vt-${process.pid}-${invocationIndex}`,
    TMPDIR: path.join(testRoot, "t"),
  };
  // Propaga a URL do postgres compartilhado para o processo filho, se o sidecar estiver ativo.
  if (sharedTemplatePgAdminUrl) {
    env.PAPERCLIP_SHARED_TEST_PG_URL = sharedTemplatePgAdminUrl;
  }
  mkdirSync(env.PAPERCLIP_HOME, { recursive: true });
  mkdirSync(env.TMPDIR, { recursive: true });
  const result = spawnSync("pnpm", ["exec", "vitest", "run", ...args], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[test:run] Failed to start Vitest: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runGeneralSuites(routeTests) {
  for (const groupName of generalGroupNames) {
    runGeneralGroup(routeTests, groupName);
  }
}

function runProjectGroup(projects, groupName) {
  for (const project of projects) {
    runVitest(["--project", project], `${groupName} project ${project}`);
  }
}

function runGeneralGroup(routeTests, groupName) {
  if (groupName === generalServerGroupName) {
    const excludeRouteArgs = routeTests.flatMap((file) => ["--exclude", file.serverPath]);
    runVitest(
      ["--project", "@paperclipai/server", ...excludeRouteArgs],
      `${groupName} server suites excluding ${routeTests.length} serialized suites`,
    );
    return;
  }

  if (groupName === generalWorkspacesAGroupName) {
    runProjectGroup(generalWorkspacesAProjects, groupName);
    return;
  }

  if (groupName === generalWorkspacesBGroupName) {
    runProjectGroup(generalWorkspacesBProjects, groupName);
    return;
  }

  fail(`Unknown group "${groupName}".`);
}

function runSerializedSuites(routeTests, shardIndex, shardCount) {
  const shardTests = selectSerializedSuites(routeTests, shardIndex, shardCount);
  console.log(
    `\n[test:run] serialized shard ${shardIndex + 1}/${shardCount} running ${shardTests.length} of ${routeTests.length} suites`,
  );

  for (const routeTest of shardTests) {
    runVitest(
      [
        "--project",
        "@paperclipai/server",
        routeTest.repoPath,
        "--pool=forks",
        "--poolOptions.forks.isolate=true",
      ],
      routeTest.repoPath,
    );
  }
}

// Referência ao processo sidecar do postgres compartilhado, para teardown garantido em qualquer saída.
let sharedTemplatePgProcess = null;

// Mata o sidecar de forma síncrona. Registrado em process.on("exit") porque runVitest pode chamar
// process.exit() ao falhar um teste — sem isso, o postgres compartilhado vazaria.
function killSharedTemplatePgSync() {
  if (sharedTemplatePgProcess && !sharedTemplatePgProcess.killed) {
    try {
      sharedTemplatePgProcess.kill("SIGTERM");
    } catch (error) {
      // Nunca silenciar: loga, mas não relança — estamos em handler de saída.
      console.error(`[test:run] Falha ao encerrar sidecar do postgres compartilhado: ${error.message}`);
    }
  }
}

process.on("exit", killSharedTemplatePgSync);

// Sobe o sidecar do postgres compartilhado e aguarda a linha "SHARED_PG_READY <url>" no stdout.
// Retorna a URL admin, que é exportada para os processos filhos de teste via runVitest.
function startSharedTemplatePostgres() {
  // tsx resolve dentro do pacote @paperclipai/db, não no root. Usa o mesmo padrão do dev-runner:
  // `pnpm --filter @paperclipai/db exec tsx <path>` garante que tsx e os imports do workspace resolvam.
  const sidecarPath = path.join("src", "shared-template-pg-sidecar.ts");
  console.log("\n[test:run] iniciando postgres compartilhado (template) para suite serializada...");

  const child = spawn(
    "pnpm",
    ["--filter", "@paperclipai/db", "exec", "tsx", sidecarPath],
    {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  sharedTemplatePgProcess = child;

  // Espera bloqueante pela linha de "pronto". Usa Atomics.wait sobre o stream não seria trivial;
  // ao invés disso, fazemos um loop síncrono lendo eventos via deasync-free approach: spawnSync não
  // serve aqui (o processo precisa ficar vivo). Resolvemos com uma Promise + execução top-level await.
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const onData = (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      const line = buffer.slice(0, newlineIndex).trim();
      if (line.startsWith("SHARED_PG_READY ")) {
        settled = true;
        child.stdout.off("data", onData);
        const url = line.slice("SHARED_PG_READY ".length).trim();
        console.log("[test:run] postgres compartilhado pronto.");
        resolve(url);
      }
    };

    child.stdout.on("data", onData);

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Sidecar do postgres compartilhado saiu antes de ficar pronto (code ${code}).`));
      }
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Falha ao iniciar sidecar do postgres compartilhado: ${error.message}`));
      }
    });
  });
}

// Encerra o sidecar de forma limpa e aguarda sua saída, garantindo teardown do postgres.
function stopSharedTemplatePostgres() {
  const child = sharedTemplatePgProcess;
  if (!child || child.killed) return Promise.resolve();
  console.log("\n[test:run] encerrando postgres compartilhado...");
  return new Promise((resolve) => {
    child.on("exit", () => resolve());
    try {
      child.kill("SIGTERM");
    } catch (error) {
      console.error(`[test:run] Falha ao encerrar sidecar: ${error.message}`);
      resolve();
    }
  });
}

const routeTests = walk(serverTestsDir)
  .filter((file) => isRouteOrAuthzTest(toRepoPath(file)))
  .map((file) => ({
    repoPath: toRepoPath(file),
    serverPath: toServerPath(file),
  }))
  .sort((a, b) => a.repoPath.localeCompare(b.repoPath));

const options = parseCliOptions(process.argv.slice(2));
if (options.dryRun) {
  const serializedSuites =
    options.mode === serializedModeName
      ? selectSerializedSuites(routeTests, options.shardIndex, options.shardCount)
      : routeTests;
  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        shardIndex: options.shardIndex,
        shardCount: options.shardCount,
        group: options.group,
        availableGeneralGroups: generalGroupNames,
        serializedSuiteCount: routeTests.length,
        selectedSerializedSuites: serializedSuites.map((routeTest) => routeTest.repoPath),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (options.mode === generalModeName || options.mode === allModeName) {
  if (options.group) {
    runGeneralGroup(routeTests, options.group);
  } else {
    runGeneralSuites(routeTests);
  }
}

if (options.mode === serializedModeName || options.mode === allModeName) {
  // Otimização: sobe UM postgres compartilhado (template com migrations) antes do loop serializado.
  // Cada arquivo de teste clona o template (CREATE DATABASE ... TEMPLATE) ao invés de subir postgres
  // novo e reaplicar 290 migrations — reduzindo drasticamente o tempo total da suite serializada.
  // Pode ser desativado via PAPERCLIP_DISABLE_SHARED_TEST_PG=1 (fallback ao comportamento original).
  const sharedPgDisabled = process.env.PAPERCLIP_DISABLE_SHARED_TEST_PG === "1";
  if (!sharedPgDisabled) {
    try {
      sharedTemplatePgAdminUrl = await startSharedTemplatePostgres();
    } catch (error) {
      // Falha ao subir o postgres compartilhado: aborta com erro claro (não cai silenciosamente
      // no modo lento, para que o problema seja visível e corrigido).
      console.error(`[test:run] ${error.message}`);
      process.exit(1);
    }
  }

  try {
    runSerializedSuites(routeTests, options.shardIndex ?? 0, options.shardCount ?? 1);
  } finally {
    // Teardown limpo no caminho feliz. Em caso de falha de teste, runVitest chama process.exit()
    // e o handler process.on("exit") -> killSharedTemplatePgSync garante o encerramento do sidecar.
    await stopSharedTemplatePostgres();
  }
}
