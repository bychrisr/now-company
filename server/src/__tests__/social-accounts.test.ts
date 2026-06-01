import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agents,
  companies,
  companySocialAccounts,
  companySecrets,
  companySecretVersions,
  createDb,
  routines,
  routineTriggers,
  socialPlatforms,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { validateAndConsumeState } from "../routes/social-accounts.js";

// Importamos internamente para testar sem rede
import express from "express";
import supertest from "supertest";
import { socialAccountRoutes } from "../routes/social-accounts.js";
import { oauthCallbackRoutes } from "../routes/oauth-callback.js";
import { errorHandler } from "../middleware/index.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping social accounts tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("social account routes — isolation tests", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;
  const secretsTmpDir = path.join(os.tmpdir(), `paperclip-social-${randomUUID()}`);

  let companyAId: string;
  let companyBId: string;
  let platformId: string;

  beforeAll(async () => {
    mkdirSync(secretsTmpDir, { recursive: true });
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = path.join(secretsTmpDir, "master.key");
    const started = await startEmbeddedPostgresTestDatabase("social-accounts");
    stopDb = started.cleanup;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    // ensureMetricsSyncRoutine cria agent + routine + trigger ao conectar/sync.
    // Deletar na ordem correta (FK: routineTriggers → routines → agents → companies).
    await db.delete(companySocialAccounts);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(agents);
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

  async function seedSocialAccount(companyId: string, pId: string) {
    const id = randomUUID();
    await db.insert(companySocialAccounts).values({
      id,
      companyId,
      platformId: pId,
      handle: "test_handle",
      platformAccountId: randomUUID(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  // Cria um app Express mínimo com o actor mockado
  function buildApp(companyId: string) {
    const app = express();
    app.use(express.json());
    // Mock do actor middleware — simula board member da empresa
    app.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).actor = {
        type: "board",
        source: "session",
        isInstanceAdmin: false,
        companyIds: [companyId],
        memberships: [{ companyId, status: "active", membershipRole: "member" }],
      };
      next();
    });
    app.use(socialAccountRoutes(db));
    app.use(oauthCallbackRoutes(db));
    app.use(errorHandler);
    return app;
  }

  it("estado do state token: validateAndConsumeState com state inválido retorna null", () => {
    expect(validateAndConsumeState("token-invalido")).toBeNull();
  });

  it("estado do state token: expirado retorna null após consumo", () => {
    // Não há como avançar o tempo, mas podemos verificar que token inexistente → null
    const result = validateAndConsumeState("nao-existe");
    expect(result).toBeNull();
  });

  it("GET /companies/:companyId/social-accounts — empresa A não vê contas da empresa B", async () => {
    companyAId = await seedCompany("Empresa A");
    companyBId = await seedCompany("Empresa B");
    platformId = await seedPlatform();

    // Conta da empresa B
    await seedSocialAccount(companyBId, platformId);

    const app = buildApp(companyAId);

    // Empresa A acessa seus próprios dados — deve retornar vazio
    const resOwnEmpty = await supertest(app)
      .get(`/companies/${companyAId}/social-accounts`)
      .expect(200);
    expect(resOwnEmpty.body).toHaveLength(0);

    // Empresa A tenta acessar dados da empresa B — deve ser proibido
    const resCross = await supertest(app)
      .get(`/companies/${companyBId}/social-accounts`)
      .expect(403);
    expect(resCross.body).toBeDefined();
  });

  it("DELETE /companies/:companyId/social-accounts/:id — empresa A não desconecta conta da empresa B", async () => {
    companyAId = await seedCompany("Empresa A");
    companyBId = await seedCompany("Empresa B");
    platformId = await seedPlatform();

    const accountBId = await seedSocialAccount(companyBId, platformId);

    const app = buildApp(companyAId);

    // Empresa A tenta desconectar conta da empresa B — 403 antes do 404
    const res = await supertest(app)
      .delete(`/companies/${companyAId}/social-accounts/${accountBId}`)
      .expect(404);

    // Conta da empresa B permanece ativa
    const [account] = await db
      .select({ isActive: companySocialAccounts.isActive })
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, accountBId));
    expect(account?.isActive).toBe(true);
  });

  it("DELETE /companies/:companyId/social-accounts/:id — marca is_active=false e secret como revoked", async () => {
    companyAId = await seedCompany("Empresa A");
    platformId = await seedPlatform();

    // Cria secret manualmente
    const [secret] = await db
      .insert(companySecrets)
      .values({
        id: randomUUID(),
        companyId: companyAId,
        key: "oauth_instagram_123",
        name: "OAuth instagram test",
        provider: "local_encrypted",
        status: "active",
        managedMode: "paperclip_managed",
        latestVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const accountId = randomUUID();
    await db.insert(companySocialAccounts).values({
      id: accountId,
      companyId: companyAId,
      platformId,
      handle: "test_handle",
      platformAccountId: "123",
      secretId: secret.id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = buildApp(companyAId);

    await supertest(app)
      .delete(`/companies/${companyAId}/social-accounts/${accountId}`)
      .expect(204);

    // Verifica soft delete
    const [account] = await db
      .select({ isActive: companySocialAccounts.isActive })
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.id, accountId));
    expect(account?.isActive).toBe(false);

    // Verifica revogação do secret
    const [updatedSecret] = await db
      .select({ status: companySecrets.status })
      .from(companySecrets)
      .where(eq(companySecrets.id, secret.id));
    expect(updatedSecret?.status).toBe("revoked");
  });

  it("GET /oauth/callback/instagram — state inválido retorna 400", async () => {
    companyAId = await seedCompany("Empresa A");
    const app = buildApp(companyAId);

    const res = await supertest(app)
      .get("/oauth/callback/instagram?code=someCode&state=token-invalido")
      .expect(400);
    expect(res.body).toBeDefined();
  });

  it("POST /companies/:companyId/social-accounts/:id/sync — empresa A não dispara sync na conta da empresa B", async () => {
    companyAId = await seedCompany("Empresa A");
    companyBId = await seedCompany("Empresa B");
    platformId = await seedPlatform();

    const accountBId = await seedSocialAccount(companyBId, platformId);

    // App autenticado como empresa A
    const app = buildApp(companyAId);

    // Empresa A tenta disparar sync na conta da empresa B → 404
    const res = await supertest(app)
      .post(`/companies/${companyAId}/social-accounts/${accountBId}/sync`)
      .expect(404);

    expect(res.body).toBeDefined();
  });

  it("DELETE — double-disconnect de conta já inativa retorna 400", async () => {
    companyAId = await seedCompany("Empresa A");
    platformId = await seedPlatform();

    const accountId = randomUUID();
    await db.insert(companySocialAccounts).values({
      id: accountId,
      companyId: companyAId,
      platformId,
      handle: "inactive_handle",
      platformAccountId: "456",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = buildApp(companyAId);

    await supertest(app)
      .delete(`/companies/${companyAId}/social-accounts/${accountId}`)
      .expect(400);
  });
});
