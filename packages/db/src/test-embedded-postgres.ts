import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { applyPendingMigrations, ensurePostgresDatabase } from "./client.js";
import { prepareEmbeddedPostgresNativeRuntime } from "./embedded-postgres-native.js";

// Nome do template database compartilhado, criado pelo run-vitest-stable.mjs antes do loop serializado.
// Cada arquivo de teste serializado clona este template via `CREATE DATABASE ... TEMPLATE`, evitando
// subir um postgres novo e reaplicar 290 migrations por arquivo (gargalo principal do CI).
const SHARED_TEMPLATE_DATABASE_NAME = "paperclip_template";

// Variável de ambiente que aponta para a connection string admin do postgres compartilhado.
// Quando setada, startEmbeddedPostgresTestDatabase entra no modo "clone do template".
const SHARED_TEST_PG_URL_ENV = "PAPERCLIP_SHARED_TEST_PG_URL";

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

export type EmbeddedPostgresTestSupport = {
  supported: boolean;
  reason?: string;
};

export type EmbeddedPostgresTestDatabase = {
  connectionString: string;
  cleanup(): Promise<void>;
};

let embeddedPostgresSupportPromise: Promise<EmbeddedPostgresTestSupport> | null = null;

const DEFAULT_PAPERCLIP_EMBEDDED_POSTGRES_PORT = 54329;

function getReservedTestPorts(): Set<number> {
  const configuredPorts = [
    DEFAULT_PAPERCLIP_EMBEDDED_POSTGRES_PORT,
    Number.parseInt(process.env.PAPERCLIP_EMBEDDED_POSTGRES_PORT ?? "", 10),
    ...String(process.env.PAPERCLIP_TEST_POSTGRES_RESERVED_PORTS ?? "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10)),
  ];
  return new Set(configuredPorts.filter((port) => Number.isInteger(port) && port > 0 && port <= 65535));
}

async function getEmbeddedPostgresCtor(): Promise<EmbeddedPostgresCtor> {
  const mod = await import("embedded-postgres");
  await prepareEmbeddedPostgresNativeRuntime();
  return mod.default as EmbeddedPostgresCtor;
}

async function getAvailablePort(): Promise<number> {
  const reservedPorts = getReservedTestPorts();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close(() => reject(new Error("Failed to allocate test port")));
          return;
        }
        const { port } = address;
        server.close((error) => {
          if (error) reject(error);
          else resolve(port);
        });
      });
    });

    if (!reservedPorts.has(port)) return port;
  }

  throw new Error(
    `Failed to allocate embedded Postgres test port outside reserved Paperclip ports: ${[
      ...reservedPorts,
    ].join(", ")}`,
  );
}

async function createEmbeddedPostgresTestInstance(tempDirPrefix: string) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
  const port = await getAvailablePort();
  const EmbeddedPostgres = await getEmbeddedPostgresCtor();
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: () => {},
    onError: () => {},
  });

  return { dataDir, port, instance };
}

function cleanupEmbeddedPostgresTestDirs(dataDir: string) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

function formatEmbeddedPostgresError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "embedded Postgres startup failed";
}

async function probeEmbeddedPostgresSupport(): Promise<EmbeddedPostgresTestSupport> {
  let dataDir: string | null = null;
  let instance: EmbeddedPostgresInstance | null = null;

  try {
    const created = await createEmbeddedPostgresTestInstance(
      "paperclip-embedded-postgres-probe-",
    );
    dataDir = created.dataDir;
    instance = created.instance;
    await instance.initialise();
    await instance.start();
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: formatEmbeddedPostgresError(error),
    };
  } finally {
    await instance?.stop().catch(() => {});
    if (dataDir) cleanupEmbeddedPostgresTestDirs(dataDir);
  }
}

export async function getEmbeddedPostgresTestSupport(): Promise<EmbeddedPostgresTestSupport> {
  if (!embeddedPostgresSupportPromise) {
    embeddedPostgresSupportPromise = probeEmbeddedPostgresSupport();
  }
  return await embeddedPostgresSupportPromise;
}

// Gera um identificador único e seguro para o nome do database clonado.
// Usa apenas [a-z0-9] para satisfazer o regex de identificadores seguros do client (isSafeIdentifier).
function generateClonedDatabaseName(): string {
  const suffix = randomBytes(8).toString("hex");
  return `paperclip_test_${suffix}`;
}

// Constrói uma connection string trocando o database alvo, preservando credenciais/host/porta do admin URL.
function withDatabaseName(adminUrl: string, databaseName: string): string {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

// Modo compartilhado: clona o template database (já com migrations aplicadas) via cópia física do postgres.
// É muito mais rápido do que subir um postgres novo e reaplicar todas as migrations.
// IMPORTANTE: nenhuma conexão pode ficar aberta no template durante o CREATE DATABASE — por isso o
// cliente SQL admin é encerrado (sql.end()) imediatamente após o comando.
async function cloneSharedTemplateDatabase(
  adminUrl: string,
): Promise<EmbeddedPostgresTestDatabase> {
  const clonedDatabaseName = generateClonedDatabaseName();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clonedDatabaseName)) {
    throw new Error(`Unsafe cloned database name: ${clonedDatabaseName}`);
  }

  const adminSql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    // Cópia física do schema + dados do template. Mais rápido que aplicar migrations do zero.
    await adminSql.unsafe(
      `create database "${clonedDatabaseName}" template "${SHARED_TEMPLATE_DATABASE_NAME}"`,
    );
  } finally {
    // Encerra a conexão admin para não bloquear futuros CREATE DATABASE de outros processos/chamadas.
    await adminSql.end();
  }

  const connectionString = withDatabaseName(adminUrl, clonedDatabaseName);

  return {
    connectionString,
    cleanup: async () => {
      // Dropa o database clonado ao final do teste. Reabre conexão admin pois a anterior já foi encerrada.
      const cleanupSql = postgres(adminUrl, { max: 1, onnotice: () => {} });
      try {
        // WITH (FORCE) derruba conexões remanescentes antes do drop (Postgres >= 13), evitando erro
        // "database is being accessed by other users" caso algum pool de teste não tenha fechado.
        await cleanupSql.unsafe(`drop database if exists "${clonedDatabaseName}" with (force)`);
      } catch (error) {
        // Nunca silenciar: loga o erro para diagnóstico, mas não relança — cleanup não deve quebrar a suite.
        console.error(
          `[test-embedded-postgres] Falha ao dropar database clonado "${clonedDatabaseName}": ${formatEmbeddedPostgresError(error)}`,
        );
      } finally {
        await cleanupSql.end();
      }
    },
  };
}

export async function startEmbeddedPostgresTestDatabase(
  tempDirPrefix: string,
): Promise<EmbeddedPostgresTestDatabase> {
  // Se o postgres compartilhado estiver ativo (setado pelo run-vitest-stable.mjs), clona o template
  // ao invés de subir um postgres novo. Comportamento original é 100% preservado quando a env não existe.
  const sharedAdminUrl = process.env[SHARED_TEST_PG_URL_ENV];
  if (sharedAdminUrl && sharedAdminUrl.length > 0) {
    return await cloneSharedTemplateDatabase(sharedAdminUrl);
  }

  let dataDir: string | null = null;
  let instance: EmbeddedPostgresInstance | null = null;

  try {
    const created = await createEmbeddedPostgresTestInstance(tempDirPrefix);
    dataDir = created.dataDir;
    instance = created.instance;
    const { port } = created;
    await instance.initialise();
    await instance.start();

    const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
    await ensurePostgresDatabase(adminConnectionString, "paperclip");
    const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
    await applyPendingMigrations(connectionString);

    return {
      connectionString,
      cleanup: async () => {
        await instance?.stop().catch(() => {});
        if (dataDir) cleanupEmbeddedPostgresTestDirs(dataDir);
      },
    };
  } catch (error) {
    await instance?.stop().catch(() => {});
    if (dataDir) cleanupEmbeddedPostgresTestDirs(dataDir);
    throw new Error(
      `Failed to start embedded PostgreSQL test database: ${formatEmbeddedPostgresError(error)}`,
    );
  }
}

export type SharedTemplatePostgres = {
  // Connection string admin (database "postgres") usada pelos processos filhos para clonar o template.
  adminUrl: string;
  // Encerra o postgres compartilhado e remove os diretórios de dados temporários.
  stop(): Promise<void>;
};

// Sobe UM postgres embutido compartilhado e prepara o template database (paperclip_template) com todas
// as migrations já aplicadas. Chamado UMA vez pelo run-vitest-stable.mjs antes do loop serializado.
// Os processos filhos (spawnSync de cada arquivo de teste) recebem `adminUrl` via env e apenas clonam
// o template — sem subir postgres novo, sem reaplicar migrations. Esse é o ganho de performance.
export async function startSharedTemplatePostgres(): Promise<SharedTemplatePostgres> {
  let dataDir: string | null = null;
  let instance: EmbeddedPostgresInstance | null = null;

  try {
    const created = await createEmbeddedPostgresTestInstance("paperclip-shared-template-pg-");
    dataDir = created.dataDir;
    instance = created.instance;
    const { port } = created;
    await instance.initialise();
    await instance.start();

    const adminUrl = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;

    // Cria o template database e aplica as migrations uma única vez.
    await ensurePostgresDatabase(adminUrl, SHARED_TEMPLATE_DATABASE_NAME);
    const templateConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/${SHARED_TEMPLATE_DATABASE_NAME}`;
    await applyPendingMigrations(templateConnectionString);

    // CRÍTICO: o Postgres recusa `CREATE DATABASE ... TEMPLATE x` se houver QUALQUER conexão ativa em x.
    // applyPendingMigrations encerra suas conexões ao retornar, mas marcamos o template como não-conectável
    // de forma defensiva: garantimos que nenhum pool fique pendurado encerrando explicitamente abaixo.
    const finalizeSql = postgres(adminUrl, { max: 1, onnotice: () => {} });
    try {
      // Marca o template como template oficial (datistemplate) — permite clone concorrente e protege contra
      // conexões acidentais de aplicações que não sejam o clone.
      await finalizeSql.unsafe(
        `update pg_database set datistemplate = true where datname = '${SHARED_TEMPLATE_DATABASE_NAME}'`,
      );
    } finally {
      await finalizeSql.end();
    }

    const capturedInstance = instance;
    const capturedDataDir = dataDir;

    return {
      adminUrl,
      stop: async () => {
        await capturedInstance?.stop().catch((error) => {
          // Nunca silenciar: loga, mas não relança — teardown não deve quebrar o pipeline.
          console.error(
            `[test-embedded-postgres] Falha ao parar postgres compartilhado: ${formatEmbeddedPostgresError(error)}`,
          );
        });
        if (capturedDataDir) cleanupEmbeddedPostgresTestDirs(capturedDataDir);
      },
    };
  } catch (error) {
    await instance?.stop().catch(() => {});
    if (dataDir) cleanupEmbeddedPostgresTestDirs(dataDir);
    throw new Error(
      `Failed to start shared template PostgreSQL: ${formatEmbeddedPostgresError(error)}`,
    );
  }
}
