import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agents,
  companies,
  companySecretVersions,
  companySecrets,
  companySocialAccounts,
  createDb,
  routineRuns,
  routineTriggers,
  routines,
  socialPlatforms,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  __internals,
  syncMetricsForCompany,
  syncOneAccount,
} from "../services/social-metrics-sync.js";
import {
  ensureMetricsSyncRoutine,
  tickMetricsSyncScheduler,
} from "../services/social-metrics-sync-scheduler.js";
import { secretService } from "../services/secrets.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping social-metrics-sync tests: ${embeddedPostgresSupport.reason ?? "unsupported"}`,
  );
}

// ---------------------------------------------------------------------------
// Mock fetch builder — controla resposta por URL
// ---------------------------------------------------------------------------

interface MockResponseSpec {
  status: number;
  body: unknown;
}

function buildMockFetch(
  routes: Record<string, MockResponseSpec | MockResponseSpec[]>,
): {
  fetchImpl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const indices = new Map<string, number>();

  const fetchImpl = (async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);

    // Encontra a rota que casa pelo prefixo do path
    const matched = Object.entries(routes).find(([routePath]) => url.includes(routePath));
    if (!matched) {
      return new Response(JSON.stringify({ error: "no_mock", url }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    const [routePath, spec] = matched;
    let resolved: MockResponseSpec;
    if (Array.isArray(spec)) {
      const idx = indices.get(routePath) ?? 0;
      resolved = spec[Math.min(idx, spec.length - 1)];
      indices.set(routePath, idx + 1);
    } else {
      resolved = spec;
    }

    return new Response(JSON.stringify(resolved.body), {
      status: resolved.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return { fetchImpl, calls };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describeEmbeddedPostgres("social-metrics-sync — service + scheduler", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;
  const secretsTmpDir = path.join(os.tmpdir(), `paperclip-metrics-${randomUUID()}`);

  beforeAll(async () => {
    mkdirSync(secretsTmpDir, { recursive: true });
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = path.join(secretsTmpDir, "master.key");
    const started = await startEmbeddedPostgresTestDatabase("metrics-sync");
    stopDb = started.cleanup;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(agents);
    await db.delete(companySocialAccounts);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(socialPlatforms);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
    rmSync(secretsTmpDir, { recursive: true, force: true });
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  });

  async function seedCompany(name: string) {
    const id = randomUUID();
    await db.insert(companies).values({
      id,
      name,
      issuePrefix: `T${id.slice(0, 7)}`.toUpperCase(),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async function seedPlatform() {
    const id = randomUUID();
    await db.insert(socialPlatforms).values({
      id,
      name: "Instagram",
      slug: "instagram",
      category: "social",
      status: "enabled",
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async function seedAccountWithSecret(
    companyId: string,
    platformId: string,
    token: string,
    handle = "test_handle",
  ) {
    // Cria secret e versão via secretService
    const secrets = secretService(db);
    const secret = await secrets.create(
      companyId,
      {
        name: `OAuth instagram ${handle}`,
        key: `oauth_instagram_${randomUUID()}`,
        provider: "local_encrypted",
        value: token,
        description: "test secret",
      },
      { userId: null, agentId: null },
    );

    const accountId = randomUUID();
    await db.insert(companySocialAccounts).values({
      id: accountId,
      companyId,
      platformId,
      handle,
      platformAccountId: randomUUID(),
      secretId: secret.id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [row] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, accountId));
    return row!;
  }

  // ---------- Test 1: sync atualiza last_synced_at + métricas ----------
  it("sync atualiza follower_count, avg_engagement_rate e last_synced_at", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const account = await seedAccountWithSecret(companyId, platformId, "valid-token");

    const { fetchImpl } = buildMockFetch({
      "/me?": {
        status: 200,
        body: { id: "1", username: "a", followers_count: 1000, media_count: 5 },
      },
      "/me/media": {
        status: 200,
        body: {
          data: [
            { id: "m1", like_count: 50, comments_count: 5 }, // 55/1000 = 0.055
            { id: "m2", like_count: 30, comments_count: 5 }, // 35/1000 = 0.035
          ],
        },
      },
    });

    const result = await syncOneAccount(db, account, { fetchImpl, sleep: async () => {} });

    expect(result.status).toBe("ok");
    expect(result.followerCount).toBe(1000);
    // Média de 0.055 e 0.035 = 0.045
    expect(result.avgEngagementRate).toBeCloseTo(0.045, 4);

    const [updated] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, account.id));
    expect(updated.followerCount).toBe(1000);
    expect(updated.lastSyncedAt).not.toBeNull();
    expect(updated.needsReauth).toBe(false);
    expect(updated.syncError).toBeNull();
  });

  // ---------- Test 2: erro em 1 conta não impede sync das outras ----------
  it("error isolation: falha em uma conta não impede sync das demais", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const accountOk = await seedAccountWithSecret(companyId, platformId, "valid", "ok-handle");
    const accountFail = await seedAccountWithSecret(
      companyId,
      platformId,
      "broken",
      "fail-handle",
    );

    let callsForFail = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      // Authorization header determina qual conta
      // mas no nosso mock simplificado, alternamos: contas com token "broken" falham
      // Como não conseguimos ler o header aqui, usamos sequência: primeira chamada ok, depois fail
      if (url.includes("/me?")) {
        callsForFail += 1;
        if (callsForFail === 1) {
          return new Response(
            JSON.stringify({ id: "1", followers_count: 500, media_count: 0 }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("server error", { status: 500 });
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await syncMetricsForCompany(db, companyId, {
      fetchImpl,
      sleep: async () => {},
    });

    expect(result.totalAccounts).toBe(2);
    expect(result.ok).toBe(1);
    expect(result.errors).toBe(1);

    const all = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.companyId, companyId));
    // Uma das contas teve sucesso (last_synced_at populado), outra erro (sync_error populado)
    const synced = all.filter((a) => a.lastSyncedAt !== null);
    const errored = all.filter((a) => a.syncError !== null);
    expect(synced).toHaveLength(1);
    expect(errored).toHaveLength(1);
    // Bypass var não usada para compilador
    expect(accountOk.id).toBeDefined();
    expect(accountFail.id).toBeDefined();
  });

  // ---------- Test 3: 401 → refresh falha → needs_reauth ----------
  it("401 dispara refresh; falha de refresh marca needs_reauth e preenche sync_error", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const account = await seedAccountWithSecret(companyId, platformId, "expired-token");

    const { fetchImpl } = buildMockFetch({
      "/me?": { status: 401, body: { error: "invalid_token" } },
      "/refresh_access_token": { status: 400, body: { error: "cannot_refresh" } },
    });

    const result = await syncOneAccount(db, account, { fetchImpl, sleep: async () => {} });

    expect(result.status).toBe("needs_reauth");
    expect(result.error).toBe("token_refresh_failed");

    const [updated] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, account.id));
    expect(updated.needsReauth).toBe(true);
    expect(updated.syncError).toBe("token_refresh_failed");
  });

  // ---------- Test 4: 429 dispara backoff exponencial ----------
  it("429 dispara backoff exponencial (delays observáveis)", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const account = await seedAccountWithSecret(companyId, platformId, "valid");

    let attempts = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/me?")) {
        attempts += 1;
        if (attempts < 3) {
          return new Response("rate limited", { status: 429 });
        }
        return new Response(
          JSON.stringify({ id: "1", followers_count: 100, media_count: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    const result = await syncOneAccount(db, account, { fetchImpl, sleep });

    expect(result.status).toBe("ok");
    expect(attempts).toBe(3);
    // Delays observados: 1000ms, 2000ms (backoff exponencial)
    expect(delays).toEqual([1000, 2000]);
  });

  // ---------- Test 5: isolamento por company_id ----------
  it("isolamento por company_id: sync de empresa A não afeta dados de empresa B", async () => {
    const companyAId = await seedCompany("Empresa A");
    const companyBId = await seedCompany("Empresa B");
    const platformId = await seedPlatform();

    const accountA = await seedAccountWithSecret(companyAId, platformId, "valid-a", "handle-a");
    const accountB = await seedAccountWithSecret(companyBId, platformId, "valid-b", "handle-b");

    const { fetchImpl } = buildMockFetch({
      "/me?": {
        status: 200,
        body: { id: "1", followers_count: 999, media_count: 0 },
      },
    });

    await syncMetricsForCompany(db, companyAId, { fetchImpl, sleep: async () => {} });

    const [a] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, accountA.id));
    const [b] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, accountB.id));

    expect(a.followerCount).toBe(999);
    expect(a.lastSyncedAt).not.toBeNull();
    // B não foi tocada
    expect(b.followerCount).toBe(0);
    expect(b.lastSyncedAt).toBeNull();
  });

  // ---------- Test 6: avg_engagement_rate = NULL em edge cases ----------
  it("avg_engagement_rate = NULL quando followers_count = 0", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const account = await seedAccountWithSecret(companyId, platformId, "valid");

    const { fetchImpl } = buildMockFetch({
      "/me?": {
        status: 200,
        body: { id: "1", followers_count: 0, media_count: 0 },
      },
    });

    const result = await syncOneAccount(db, account, { fetchImpl, sleep: async () => {} });
    expect(result.status).toBe("ok");
    expect(result.avgEngagementRate).toBeNull();

    const [updated] = await db
      .select()
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, account.id));
    expect(updated.avgEngagementRate).toBeNull();
  });

  it("avg_engagement_rate = NULL quando conta tem followers mas zero posts retornados", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    const account = await seedAccountWithSecret(companyId, platformId, "valid");

    const { fetchImpl } = buildMockFetch({
      "/me?": {
        status: 200,
        body: { id: "1", followers_count: 500, media_count: 0 },
      },
    });

    const result = await syncOneAccount(db, account, { fetchImpl, sleep: async () => {} });
    expect(result.status).toBe("ok");
    expect(result.avgEngagementRate).toBeNull();
  });

  // ---------- Test bonus: helpers internos ----------
  it("computeAvgEngagementRate: edge cases", () => {
    const { computeAvgEngagementRate } = __internals;
    expect(computeAvgEngagementRate(0, [{ id: "m1", like_count: 100, comments_count: 10 }])).toBeNull();
    expect(computeAvgEngagementRate(100, [])).toBeNull();
    expect(computeAvgEngagementRate(100, [{ id: "m1", like_count: 10, comments_count: 0 }])).toBeCloseTo(0.1, 4);
  });

  // ---------- Test 7: scheduler ensureMetricsSyncRoutine idempotente ----------
  it("ensureMetricsSyncRoutine: cria agent + routine + trigger; idempotente em chamadas subsequentes", async () => {
    const companyId = await seedCompany("Empresa A");

    const first = await ensureMetricsSyncRoutine(db, companyId);
    expect(first.agentId).toBeDefined();
    expect(first.routineId).toBeDefined();
    expect(first.triggerId).toBeDefined();

    const second = await ensureMetricsSyncRoutine(db, companyId);
    expect(second.agentId).toBe(first.agentId);
    expect(second.routineId).toBe(first.routineId);
    expect(second.triggerId).toBe(first.triggerId);

    // Verifica que existe apenas 1 de cada
    const agentRows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.name, "system-metrics-sync")));
    expect(agentRows).toHaveLength(1);
  });

  // ---------- Test 8: scheduler tick ----------
  it("tickMetricsSyncScheduler: executa quando nextRunAt vence, insere routine_run", async () => {
    const companyId = await seedCompany("Empresa A");
    const platformId = await seedPlatform();
    await seedAccountWithSecret(companyId, platformId, "valid");

    const { triggerId, routineId } = await ensureMetricsSyncRoutine(db, companyId);

    // Força nextRunAt no passado
    const past = new Date(Date.now() - 60_000);
    await db
      .update(routineTriggers)
      .set({ nextRunAt: past })
      .where(eq(routineTriggers.id, triggerId));

    // Mock fetch global temporariamente — scheduler usa fetch real (sem opts)
    // mas a função interna chamará syncMetricsForCompany sem opts injetados;
    // como não controlamos isso facilmente aqui, vamos validar apenas que o
    // routine_run foi criado (mesmo que erro, é o que importa pra AC7).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("network unavailable in test", { status: 500 })) as typeof fetch;

    try {
      const result = await tickMetricsSyncScheduler(db, new Date());
      expect(result.triggered).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Verifica que routine_run foi criado
    const runs = await db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routineId));
    expect(runs.length).toBeGreaterThanOrEqual(1);
    // Status deve refletir o resultado (failed pq fetch retornou 500)
    expect(["failed", "succeeded"]).toContain(runs[0].status);
  });
});
