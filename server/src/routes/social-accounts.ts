import { randomBytes } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { companySocialAccounts, companySecrets, socialPlatforms } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest, notFound, tooManyRequests, unprocessable } from "../errors.js";
import { loadConfig } from "../config.js";
import { syncOneAccountById } from "../services/social-metrics-sync.js";
import { ensureMetricsSyncRoutine } from "../services/social-metrics-sync-scheduler.js";

// State tokens em memória com TTL de 10 minutos
// Map: stateToken → { companyId, expiresAt }
const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, { companyId: string; expiresAt: number }>();

function generateState(companyId: string): string {
  const token = randomBytes(32).toString("hex");
  stateStore.set(token, { companyId, expiresAt: Date.now() + STATE_TTL_MS });
  return token;
}

function validateAndConsumeState(token: string): string | null {
  const entry = stateStore.get(token);
  if (!entry) return null;
  stateStore.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.companyId;
}

// Limpeza periódica de states expirados (a cada 5 minutos)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of stateStore) {
    if (now > entry.expiresAt) stateStore.delete(token);
  }
}, 5 * 60 * 1000).unref();

// Rate limit simples em memória pro endpoint POST /connect — 5 req/min por companyId.
// Evita abuso (loops de OAuth) sem dependência externa. Reset por janela fixa de 60s.
const CONNECT_RATE_WINDOW_MS = 60_000;
const CONNECT_RATE_MAX = 5;
const connectRateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkConnectRateLimit(companyId: string): boolean {
  const now = Date.now();
  const entry = connectRateLimitStore.get(companyId);
  if (!entry || now > entry.resetAt) {
    connectRateLimitStore.set(companyId, { count: 1, resetAt: now + CONNECT_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= CONNECT_RATE_MAX) return false;
  entry.count++;
  return true;
}

// Limpeza periódica de entradas expiradas (a cada 5 minutos)
setInterval(() => {
  const now = Date.now();
  for (const [companyId, entry] of connectRateLimitStore) {
    if (now > entry.resetAt) connectRateLimitStore.delete(companyId);
  }
}, 5 * 60 * 1000).unref();

const INSTAGRAM_SCOPE = "instagram_basic,pages_show_list,business_management";

function buildInstagramAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: INSTAGRAM_SCOPE,
    response_type: "code",
    state,
  });
  const authBase = process.env.INSTAGRAM_AUTH_BASE_URL ?? "https://www.facebook.com";
  return `${authBase}/v21.0/dialog/oauth?${params.toString()}`;
}

const listQuerySchema = z.object({
  platform: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export function socialAccountRoutes(db: Db) {
  const router = Router();

  // GET /companies/:companyId/social-accounts — lista contas da empresa
  router.get("/companies/:companyId/social-accounts", async (req, res) => {
    assertBoard(req);
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest("Invalid query params");

    const { active } = parsed.data;

    const rows = await db
      .select({
        id: companySocialAccounts.id,
        companyId: companySocialAccounts.companyId,
        platformId: companySocialAccounts.platformId,
        handle: companySocialAccounts.handle,
        displayName: companySocialAccounts.displayName,
        profileUrl: companySocialAccounts.profileUrl,
        platformAccountId: companySocialAccounts.platformAccountId,
        followerCount: companySocialAccounts.followerCount,
        avgEngagementRate: companySocialAccounts.avgEngagementRate,
        lastSyncedAt: companySocialAccounts.lastSyncedAt,
        defaultHashtags: companySocialAccounts.defaultHashtags,
        defaultCta: companySocialAccounts.defaultCta,
        timezone: companySocialAccounts.timezone,
        isActive: companySocialAccounts.isActive,
        isVerified: companySocialAccounts.isVerified,
        needsReauth: companySocialAccounts.needsReauth,
        syncError: companySocialAccounts.syncError,
        createdAt: companySocialAccounts.createdAt,
        updatedAt: companySocialAccounts.updatedAt,
        platformSlug: socialPlatforms.slug,
        platformName: socialPlatforms.name,
      })
      .from(companySocialAccounts)
      .innerJoin(socialPlatforms, eq(companySocialAccounts.platformId, socialPlatforms.id))
      .where(
        and(
          eq(companySocialAccounts.companyId, companyId),
          active ? eq(companySocialAccounts.isActive, true) : undefined,
        ),
      );

    res.json(rows);
  });

  // POST /companies/:companyId/social-accounts/connect/:platformSlug — inicia OAuth
  router.post(
    "/companies/:companyId/social-accounts/connect/:platformSlug",
    async (req, res) => {
      assertBoard(req);
      const { companyId, platformSlug } = req.params;
      assertCompanyAccess(req, companyId);

      if (!checkConnectRateLimit(companyId)) {
        throw tooManyRequests("Too many connect attempts. Try again in a minute.");
      }

      if (platformSlug !== "instagram") {
        throw unprocessable(`OAuth for platform '${platformSlug}' not yet implemented`);
      }

      const config = loadConfig();
      if (!config.instagramAppId || !config.instagramAppSecret || !config.instagramRedirectUri) {
        throw unprocessable(
          "Instagram OAuth not configured — set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI",
        );
      }

      const state = generateState(companyId);
      const authUrl = buildInstagramAuthUrl(
        config.instagramAppId,
        config.instagramRedirectUri,
        state,
      );

      res.json({ authUrl });
    },
  );

  // DELETE /companies/:companyId/social-accounts/:id — soft delete + revoke secret
  router.delete("/companies/:companyId/social-accounts/:id", async (req, res) => {
    assertBoard(req);
    const { companyId, id } = req.params;
    assertCompanyAccess(req, companyId);

    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) throw badRequest("Invalid account ID");

    // Garante isolamento: conta DEVE pertencer à empresa logada
    const [account] = await db
      .select()
      .from(companySocialAccounts)
      .where(
        and(
          eq(companySocialAccounts.id, parsedId.data),
          eq(companySocialAccounts.companyId, companyId),
        ),
      );

    if (!account) throw notFound("Social account not found");
    if (!account.isActive) throw badRequest("Social account is already inactive");

    // Soft delete da conta
    await db
      .update(companySocialAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(companySocialAccounts.id, parsedId.data));

    // Revogar secret (status = 'revoked') sem deletar — mantém audit trail
    if (account.secretId) {
      await db
        .update(companySecrets)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(
          and(
            eq(companySecrets.id, account.secretId),
            eq(companySecrets.companyId, companyId),
          ),
        );
    }

    res.status(204).send();
  });

  // POST /companies/:companyId/social-accounts/:id/sync — trigger manual de sync
  // (Story 1.6, AC10). Útil pra debug e UX (botão "atualizar agora").
  router.post(
    "/companies/:companyId/social-accounts/:id/sync",
    async (req, res) => {
      assertBoard(req);
      const { companyId, id } = req.params;
      assertCompanyAccess(req, companyId);

      const parsedId = z.string().uuid().safeParse(id);
      if (!parsedId.success) throw badRequest("Invalid account ID");

      // Garante que a Routine de sync existe (idempotente). Útil se a empresa
      // foi criada antes desta feature ou se a Routine foi removida.
      await ensureMetricsSyncRoutine(db, companyId);

      const result = await syncOneAccountById(db, companyId, parsedId.data);
      if (!result) throw notFound("Social account not found or inactive");

      res.json(result);
    },
  );

  return router;
}

// Exporta o stateStore para uso no callback
export { validateAndConsumeState };
