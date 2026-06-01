import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  companies,
  companySocialAccounts,
  createDb,
  socialPlatforms,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import express from "express";
import supertest from "supertest";
import { socialPlatformsAdminRoutes } from "../routes/social-platforms-admin.js";
import { errorHandler } from "../middleware/index.js";
import { decryptOauthSecret } from "../secrets/platform-oauth-utils.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping social-platforms-admin tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("social-platforms-admin routes — OAuth config", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;
  const secretsTmpDir = path.join(os.tmpdir(), `paperclip-platforms-admin-${randomUUID()}`);

  beforeAll(async () => {
    mkdirSync(secretsTmpDir, { recursive: true });
    // Garante master key isolada para o teste — encrypt/decrypt do oauth secret depende dela.
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = path.join(secretsTmpDir, "master.key");
    const started = await startEmbeddedPostgresTestDatabase("social-platforms-admin");
    stopDb = started.cleanup;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    // Ordem importa: companySocialAccounts referencia socialPlatforms e companies.
    await db.delete(companySocialAccounts);
    await db.delete(socialPlatforms);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
    rmSync(secretsTmpDir, { recursive: true, force: true });
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  });

  // Helper: cria app Express mínimo autenticado como instance admin
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as Record<string, unknown>).actor = {
        type: "board",
        source: "session",
        isInstanceAdmin: true,
        companyIds: [],
        memberships: [],
      };
      next();
    });
    app.use(socialPlatformsAdminRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function seedCompany(name = "Empresa Teste") {
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

  async function seedPlatform(opts?: {
    slug?: string;
    name?: string;
    oauthAppId?: string | null;
    oauthAppSecretEnc?: string | null;
    oauthRedirectUri?: string | null;
    status?: string;
  }) {
    const id = randomUUID();
    await db.insert(socialPlatforms).values({
      id,
      name: opts?.name ?? "Instagram",
      slug: opts?.slug ?? `slug-${id.slice(0, 8)}`,
      category: "social",
      status: opts?.status ?? "enabled",
      sortOrder: 1,
      oauthAppId: opts?.oauthAppId ?? null,
      oauthAppSecretEnc: opts?.oauthAppSecretEnc ?? null,
      oauthRedirectUri: opts?.oauthRedirectUri ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async function seedActiveAccount(companyId: string, platformId: string, lastSyncedAt: Date | null) {
    await db.insert(companySocialAccounts).values({
      id: randomUUID(),
      companyId,
      platformId,
      handle: "test_handle",
      platformAccountId: randomUUID(),
      isActive: true,
      lastSyncedAt: lastSyncedAt ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // -------------------- GET /instance/platforms --------------------

  describe("GET /instance/platforms", () => {
    it("retorna lista com hasOauthSecret e healthStatus, e nunca expõe oauthAppSecretEnc", async () => {
      const app = buildApp();
      await seedPlatform({ slug: "p-no-oauth" });

      const res = await supertest(app).get("/instance/platforms").expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      const item = res.body[0];
      expect(item).toHaveProperty("hasOauthSecret");
      expect(typeof item.hasOauthSecret).toBe("boolean");
      expect(item).toHaveProperty("healthStatus");
      // oauthAppSecretEnc NUNCA deve aparecer no payload
      expect(item.oauthAppSecretEnc).toBeUndefined();
    });

    it("healthStatus = 'error' quando oauthAppId é null", async () => {
      const app = buildApp();
      await seedPlatform({ slug: "p-error", oauthAppId: null });

      const res = await supertest(app).get("/instance/platforms").expect(200);
      const item = res.body.find((p: { slug: string }) => p.slug === "p-error");
      expect(item.healthStatus).toBe("error");
      expect(item.hasOauthSecret).toBe(false);
    });

    it("healthStatus = 'warning' quando OAuth configurado mas sem contas ativas", async () => {
      const app = buildApp();
      await seedPlatform({
        slug: "p-warning",
        oauthAppId: "app-id-123",
        oauthAppSecretEnc: "fake-enc-blob",
        oauthRedirectUri: "https://example.com/cb",
      });

      const res = await supertest(app).get("/instance/platforms").expect(200);
      const item = res.body.find((p: { slug: string }) => p.slug === "p-warning");
      expect(item.healthStatus).toBe("warning");
      expect(item.hasOauthSecret).toBe(true);
    });

    it("healthStatus = 'healthy' quando OAuth + conta ativa + sync < 48h", async () => {
      const app = buildApp();
      const companyId = await seedCompany();
      const platformId = await seedPlatform({
        slug: "p-healthy",
        oauthAppId: "app-id-123",
        oauthAppSecretEnc: "fake-enc-blob",
        oauthRedirectUri: "https://example.com/cb",
      });
      // Sync há 1 hora — dentro da janela de 48h
      await seedActiveAccount(companyId, platformId, new Date(Date.now() - 60 * 60 * 1000));

      const res = await supertest(app).get("/instance/platforms").expect(200);
      const item = res.body.find((p: { slug: string }) => p.slug === "p-healthy");
      expect(item.healthStatus).toBe("healthy");
    });
  });

  // -------------------- PATCH /instance/platforms/:id/oauth-config --------------------

  describe("PATCH /instance/platforms/:id/oauth-config", () => {
    it("salva appId, appSecret encriptado e redirectUri; nunca expõe secret no response", async () => {
      const app = buildApp();
      const platformId = await seedPlatform({ slug: "p-patch" });

      const res = await supertest(app)
        .patch(`/instance/platforms/${platformId}/oauth-config`)
        .send({
          appId: "app-id-xyz",
          appSecret: "super-secret-value",
          redirectUri: "https://example.com/oauth/callback",
        })
        .expect(200);

      expect(res.body.hasOauthSecret).toBe(true);
      expect(res.body.oauthAppId).toBe("app-id-xyz");
      expect(res.body.oauthRedirectUri).toBe("https://example.com/oauth/callback");
      // Garantia: secret NUNCA volta no response
      expect(res.body).not.toHaveProperty("oauthAppSecretEnc");
      expect(res.body).not.toHaveProperty("appSecret");

      // Persistência: secret encriptado no banco e descriptografável
      const [row] = await db
        .select({ enc: socialPlatforms.oauthAppSecretEnc })
        .from(socialPlatforms)
        .where(eq(socialPlatforms.id, platformId));
      expect(row.enc).toBeTruthy();
      expect(decryptOauthSecret(row.enc as string)).toBe("super-secret-value");
    });

    it("falha 400 se redirectUri não for HTTPS", async () => {
      const app = buildApp();
      const platformId = await seedPlatform({ slug: "p-http" });

      await supertest(app)
        .patch(`/instance/platforms/${platformId}/oauth-config`)
        .send({
          appId: "app-id",
          appSecret: "secret",
          redirectUri: "http://example.com/cb",
        })
        .expect(400);
    });

    it("falha 400 se appSecret ausente E plataforma não tem secret ainda", async () => {
      const app = buildApp();
      const platformId = await seedPlatform({ slug: "p-no-secret-yet" });

      await supertest(app)
        .patch(`/instance/platforms/${platformId}/oauth-config`)
        .send({
          appId: "app-id",
          redirectUri: "https://example.com/cb",
        })
        .expect(400);
    });

    it("mantém secret existente quando appSecret não enviado — apenas atualiza appId/redirectUri", async () => {
      const app = buildApp();
      // Primeiro: cadastra secret
      const platformId = await seedPlatform({ slug: "p-keep-secret" });
      await supertest(app)
        .patch(`/instance/platforms/${platformId}/oauth-config`)
        .send({
          appId: "old-app-id",
          appSecret: "secret-original",
          redirectUri: "https://old.example.com/cb",
        })
        .expect(200);

      const [before] = await db
        .select({ enc: socialPlatforms.oauthAppSecretEnc })
        .from(socialPlatforms)
        .where(eq(socialPlatforms.id, platformId));
      expect(before.enc).toBeTruthy();

      // Segundo: atualiza sem appSecret
      const res = await supertest(app)
        .patch(`/instance/platforms/${platformId}/oauth-config`)
        .send({
          appId: "new-app-id",
          redirectUri: "https://new.example.com/cb",
        })
        .expect(200);

      expect(res.body.oauthAppId).toBe("new-app-id");
      expect(res.body.oauthRedirectUri).toBe("https://new.example.com/cb");
      expect(res.body.hasOauthSecret).toBe(true);

      // Secret encriptado permanece idêntico (mantido) e ainda descriptografa para o original
      const [after] = await db
        .select({ enc: socialPlatforms.oauthAppSecretEnc })
        .from(socialPlatforms)
        .where(eq(socialPlatforms.id, platformId));
      expect(after.enc).toBe(before.enc);
      expect(decryptOauthSecret(after.enc as string)).toBe("secret-original");
    });

    it("falha 404 se platform não encontrada", async () => {
      const app = buildApp();
      const fakeId = randomUUID();
      await supertest(app)
        .patch(`/instance/platforms/${fakeId}/oauth-config`)
        .send({
          appId: "app-id",
          appSecret: "secret",
          redirectUri: "https://example.com/cb",
        })
        .expect(404);
    });
  });

  // -------------------- DELETE /instance/platforms/:id/oauth-config --------------------

  describe("DELETE /instance/platforms/:id/oauth-config", () => {
    it("zera oauthAppId, oauthAppSecretEnc, oauthRedirectUri e retorna 204", async () => {
      const app = buildApp();
      const platformId = await seedPlatform({
        slug: "p-del",
        oauthAppId: "app-id",
        oauthAppSecretEnc: "fake-enc",
        oauthRedirectUri: "https://example.com/cb",
      });

      await supertest(app)
        .delete(`/instance/platforms/${platformId}/oauth-config`)
        .expect(204);

      const [row] = await db
        .select({
          oauthAppId: socialPlatforms.oauthAppId,
          oauthAppSecretEnc: socialPlatforms.oauthAppSecretEnc,
          oauthRedirectUri: socialPlatforms.oauthRedirectUri,
        })
        .from(socialPlatforms)
        .where(eq(socialPlatforms.id, platformId));
      expect(row.oauthAppId).toBeNull();
      expect(row.oauthAppSecretEnc).toBeNull();
      expect(row.oauthRedirectUri).toBeNull();
    });

    it("falha 404 se platform não encontrada", async () => {
      const app = buildApp();
      const fakeId = randomUUID();
      await supertest(app)
        .delete(`/instance/platforms/${fakeId}/oauth-config`)
        .expect(404);
    });
  });
});
