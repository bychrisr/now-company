import { Router } from "express";
import { and, count, eq, asc, max } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { socialPlatforms, companySocialAccounts } from "@paperclipai/db";
import { patchSocialPlatformSchema } from "@paperclipai/shared";
import { assertInstanceAdmin, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity, instanceSettingsService } from "../services/index.js";
import { encryptOauthSecret } from "../secrets/platform-oauth-utils.js";

const patchOAuthConfigSchema = z.object({
  appId: z.string().min(1, "App ID is required"),
  appSecret: z.string().optional(), // Opcional ao atualizar se secret já existe
  redirectUri: z.string().url("Redirect URI must be a valid HTTPS URL").startsWith("https://"),
});

type PlatformHealthStatus = "healthy" | "warning" | "error";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function computeHealthStatus(
  platform: { oauthAppId: string | null; oauthAppSecretEnc: string | null; oauthRedirectUri: string | null; status: string },
  stats: { activeAccountsCount: number; lastSyncedAt: Date | null },
): PlatformHealthStatus {
  if (!platform.oauthAppId || !platform.oauthAppSecretEnc || !platform.oauthRedirectUri) {
    return "error";
  }
  if (platform.status === "disabled") {
    return "error";
  }
  if (
    stats.activeAccountsCount > 0 &&
    stats.lastSyncedAt &&
    Date.now() - stats.lastSyncedAt.getTime() < FORTY_EIGHT_HOURS_MS
  ) {
    return "healthy";
  }
  return "warning";
}

export function socialPlatformsAdminRoutes(db: Db) {
  const router = Router();

  router.get("/instance/platforms", async (req, res) => {
    assertInstanceAdmin(req);

    const platforms = await db
      .select()
      .from(socialPlatforms)
      .orderBy(asc(socialPlatforms.sortOrder), asc(socialPlatforms.name));

    // Agrega stats de contas por plataforma para calcular healthStatus
    const statsRows = await db
      .select({
        platformId: companySocialAccounts.platformId,
        activeAccountsCount: count(companySocialAccounts.id),
        lastSyncedAt: max(companySocialAccounts.lastSyncedAt),
      })
      .from(companySocialAccounts)
      .where(eq(companySocialAccounts.isActive, true))
      .groupBy(companySocialAccounts.platformId);

    const statsMap = new Map(
      statsRows.map((r) => [
        r.platformId,
        { activeAccountsCount: Number(r.activeAccountsCount), lastSyncedAt: r.lastSyncedAt ?? null },
      ]),
    );

    const result = platforms.map((p) => {
      const stats = statsMap.get(p.id) ?? { activeAccountsCount: 0, lastSyncedAt: null };
      return {
        ...p,
        oauthAppSecretEnc: undefined, // NUNCA expor o secret encriptado
        hasOauthSecret: !!p.oauthAppSecretEnc,
        healthStatus: computeHealthStatus(p, stats),
      };
    });

    res.json(result);
  });

  router.patch(
    "/instance/platforms/:id",
    validate(patchSocialPlatformSchema),
    async (req, res) => {
      assertInstanceAdmin(req);

      const id = req.params.id;
      const parsedId = z.string().uuid().safeParse(id);
      if (!parsedId.success) {
        throw badRequest("Invalid UUID format");
      }

      const [updated] = await db
        .update(socialPlatforms)
        .set({
          ...(req.body.status !== undefined ? { status: req.body.status } : {}),
          ...(req.body.sortOrder !== undefined ? { sortOrder: req.body.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(socialPlatforms.id, parsedId.data))
        .returning();

      if (!updated) {
        throw notFound("Social platform not found");
      }

      const svc = instanceSettingsService(db);
      const actor = getActorInfo(req);
      const companyIds = await svc.listCompanyIds();

      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "instance.social_platform_updated",
            entityType: "social_platform",
            entityId: updated.id,
            details: {
              platformSlug: updated.slug,
              status: updated.status,
              sortOrder: updated.sortOrder,
            },
          }),
        ),
      );

      res.json({ ...updated, oauthAppSecretEnc: undefined, hasOauthSecret: !!updated.oauthAppSecretEnc });
    },
  );

  // PATCH /instance/platforms/:id/oauth-config — configura credenciais OAuth da plataforma
  router.patch(
    "/instance/platforms/:id/oauth-config",
    async (req, res) => {
      assertInstanceAdmin(req);

      const parsedId = z.string().uuid().safeParse(req.params.id);
      if (!parsedId.success) throw badRequest("Invalid UUID format");

      const parsed = patchOAuthConfigSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest(parsed.error.errors[0]?.message ?? "Invalid body");

      const { appId, appSecret, redirectUri } = parsed.data;

      // Busca a plataforma existente para saber se já tem secret
      const [existing] = await db
        .select({ id: socialPlatforms.id, slug: socialPlatforms.slug, oauthAppSecretEnc: socialPlatforms.oauthAppSecretEnc })
        .from(socialPlatforms)
        .where(eq(socialPlatforms.id, parsedId.data));

      if (!existing) throw notFound("Social platform not found");

      // Se não foi enviado novo appSecret e já existe um, mantém o existente
      const secretEncToStore: string | null =
        appSecret
          ? encryptOauthSecret(appSecret)
          : (existing.oauthAppSecretEnc ?? null);

      if (!secretEncToStore) {
        throw badRequest("App Secret is required when configuring OAuth for the first time");
      }

      const [updated] = await db
        .update(socialPlatforms)
        .set({
          oauthAppId: appId,
          oauthAppSecretEnc: secretEncToStore,
          oauthRedirectUri: redirectUri,
          updatedAt: new Date(),
        })
        .where(eq(socialPlatforms.id, parsedId.data))
        .returning();

      res.json({
        id: updated.id,
        slug: updated.slug,
        oauthAppId: updated.oauthAppId,
        oauthRedirectUri: updated.oauthRedirectUri,
        hasOauthSecret: true,
        updatedAt: updated.updatedAt.toISOString(),
      });
    },
  );

  // DELETE /instance/platforms/:id/oauth-config — limpa credenciais OAuth
  router.delete("/instance/platforms/:id/oauth-config", async (req, res) => {
    assertInstanceAdmin(req);

    const parsedId = z.string().uuid().safeParse(req.params.id);
    if (!parsedId.success) throw badRequest("Invalid UUID format");

    const [existing] = await db
      .select({ id: socialPlatforms.id })
      .from(socialPlatforms)
      .where(eq(socialPlatforms.id, parsedId.data));

    if (!existing) throw notFound("Social platform not found");

    await db
      .update(socialPlatforms)
      .set({ oauthAppId: null, oauthAppSecretEnc: null, oauthRedirectUri: null, updatedAt: new Date() })
      .where(eq(socialPlatforms.id, parsedId.data));

    res.status(204).send();
  });

  return router;
}
