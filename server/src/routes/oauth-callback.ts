import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySocialAccounts, companySecrets, socialPlatforms } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { badRequest, unprocessable } from "../errors.js";
import { secretService } from "../services/index.js";
import { getConfiguredSecretProvider } from "../secrets/configured-provider.js";
import { loadConfig } from "../config.js";
import { validateAndConsumeState } from "./social-accounts.js";
import { ensureMetricsSyncRoutine } from "../services/social-metrics-sync-scheduler.js";

interface InstagramTokenResponse {
  access_token: string;
  token_type: string;
}

interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface InstagramMeResponse {
  id: string;
  username?: string;
  name?: string;
}

async function exchangeInstagramCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<InstagramTokenResponse> {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const tokenApiBase = process.env.INSTAGRAM_TOKEN_API_URL ?? "https://api.instagram.com";
  const response = await fetch(`${tokenApiBase}/oauth/access_token`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    logger.error({ status: response.status, body: text }, "Instagram token exchange failed");
    throw unprocessable("Instagram token exchange failed");
  }

  return response.json() as Promise<InstagramTokenResponse>;
}

/**
 * Troca o short-lived token (1h) por um long-lived token (60d).
 *
 * Por quê: short-lived token não pode ser renovado via refresh endpoint —
 * só long-lived suporta `refresh_access_token`. A Routine de sync de métricas
 * (Story 1.6) precisa renovar o token periodicamente, então só faz sentido
 * persistir o long-lived.
 *
 * Endpoint: GET https://graph.instagram.com/access_token
 *   ?grant_type=ig_exchange_token&client_secret=...&access_token=<short>
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appSecret: string,
): Promise<InstagramLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });

  const graphBase = process.env.INSTAGRAM_GRAPH_API_URL ?? "https://graph.instagram.com";
  const response = await fetch(`${graphBase}/access_token?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    logger.error({ status: response.status, body: text }, "Instagram long-lived token exchange failed");
    throw unprocessable("Instagram long-lived token exchange failed");
  }

  return response.json() as Promise<InstagramLongLivedTokenResponse>;
}

async function fetchInstagramMe(accessToken: string): Promise<InstagramMeResponse> {
  const params = new URLSearchParams({ fields: "id,username,name" });

  const graphBase = process.env.INSTAGRAM_GRAPH_API_URL ?? "https://graph.instagram.com";
  // Token enviado via header — nunca como query param (evita exposição em logs HTTP)
  const response = await fetch(`${graphBase}/me?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    logger.error({ status: response.status, body: text }, "Instagram /me fetch failed");
    throw unprocessable("Failed to fetch Instagram profile");
  }

  return response.json() as Promise<InstagramMeResponse>;
}

export function oauthCallbackRoutes(db: Db) {
  const router = Router();
  const secrets = secretService(db);
  const defaultProvider = getConfiguredSecretProvider();

  // GET /oauth/callback/:platformSlug
  // Sem auth de usuário — fluxo iniciado externamente pelo browser do usuário
  router.get("/oauth/callback/:platformSlug", async (req, res) => {
    const { platformSlug } = req.params;
    const { code, state, error } = req.query as Record<string, string | undefined>;

    if (error) {
      logger.warn({ platformSlug, error }, "OAuth callback received error from platform");
      return res.redirect(
        `/company/settings/social-accounts?status=error&platform=${platformSlug}&reason=${encodeURIComponent(error)}`,
      );
    }

    if (!code || !state) {
      throw badRequest("Missing code or state in OAuth callback");
    }

    // Valida e consome o state token — protege contra CSRF
    const companyId = validateAndConsumeState(state);
    if (!companyId) {
      throw badRequest("Invalid or expired state token");
    }

    if (platformSlug !== "instagram") {
      throw unprocessable(`OAuth callback for platform '${platformSlug}' not yet implemented`);
    }

    const config = loadConfig();
    if (!config.instagramAppId || !config.instagramAppSecret || !config.instagramRedirectUri) {
      throw unprocessable("Instagram OAuth not configured on server");
    }

    // Troca o code pelo short-lived access_token (válido por 1h)
    const shortLivedTokenData = await exchangeInstagramCode(
      code,
      config.instagramAppId,
      config.instagramAppSecret,
      config.instagramRedirectUri,
    );

    // Troca o short-lived (1h) pelo long-lived (60d) — necessário para que a
    // Routine de sync (Story 1.6) possa renovar via /refresh_access_token.
    // Short-lived tokens não são refresháveis.
    const longLivedTokenData = await exchangeForLongLivedToken(
      shortLivedTokenData.access_token,
      config.instagramAppSecret,
    );

    // A partir daqui usamos APENAS o long-lived — é o que será persistido e
    // o que terá vida útil suficiente para sync periódica.
    const accessToken = longLivedTokenData.access_token;

    // Busca perfil do usuário na plataforma
    const profile = await fetchInstagramMe(accessToken);

    const platformAccountId = profile.id;
    const handle = profile.username ?? profile.name ?? platformAccountId;

    // Busca o platform_id pelo slug
    const [platform] = await db
      .select({ id: socialPlatforms.id })
      .from(socialPlatforms)
      .where(eq(socialPlatforms.slug, platformSlug));

    if (!platform) {
      throw unprocessable(`Platform '${platformSlug}' not found in catalog`);
    }

    // Chave do secret: determinística — upsert seguro
    const secretKey = `oauth_${platformSlug}_${platformAccountId}`;
    const secretName = `OAuth ${platformSlug} ${handle}`;

    // Verifica se já existe um secret para esta conta (upsert com rotação de token)
    const existingSecret = await db
      .select({ id: companySecrets.id, key: companySecrets.key, status: companySecrets.status })
      .from(companySecrets)
      .where(
        and(
          eq(companySecrets.companyId, companyId),
          eq(companySecrets.key, secretKey),
        ),
      )
      .then((rows) => rows[0] ?? null);

    let secretId: string;

    if (existingSecret) {
      // Secret existe — reativar se necessário e rotacionar o token com o novo valor
      if (existingSecret.status !== "active") {
        await secrets.update(existingSecret.id, { status: "active" });
      }
      await secrets.rotate(existingSecret.id, { value: accessToken });
      secretId = existingSecret.id;

      logger.info({ companyId, platformSlug, platformAccountId }, "Instagram OAuth: secret rotated with new long-lived token");
    } else {
      // Cria novo secret com o long-lived token cifrado pelo provider
      const created = await secrets.create(
        companyId,
        {
          name: secretName,
          key: secretKey,
          provider: defaultProvider,
          value: accessToken,
          description: `OAuth long-lived access token for ${platformSlug} account @${handle}`,
        },
        { userId: null, agentId: null },
      );
      secretId = created.id;

      logger.info({ companyId, platformSlug, platformAccountId }, "Instagram OAuth: new secret created");
    }

    // Cria ou atualiza a conta social
    const existingAccount = await db
      .select({ id: companySocialAccounts.id })
      .from(companySocialAccounts)
      .where(
        and(
          eq(companySocialAccounts.companyId, companyId),
          eq(companySocialAccounts.platformId, platform.id),
          eq(companySocialAccounts.platformAccountId, platformAccountId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existingAccount) {
      await db
        .update(companySocialAccounts)
        .set({
          handle,
          secretId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(companySocialAccounts.id, existingAccount.id));
    } else {
      await db.insert(companySocialAccounts).values({
        companyId,
        platformId: platform.id,
        platformAccountId,
        handle,
        secretId,
        isActive: true,
      });
    }

    // Garante que a Routine de sync de métricas (Story 1.6) existe pra essa
    // empresa. Idempotente — primeira conexão cria; subsequentes não-op.
    // Erros aqui não devem quebrar o callback OAuth (UX matters).
    try {
      await ensureMetricsSyncRoutine(db, companyId);
    } catch (err) {
      logger.error(
        { companyId, err },
        "Failed to ensure metrics sync routine after OAuth — sync may not run automatically",
      );
    }

    return res.redirect(
      `/company/settings/social-accounts?status=connected&platform=${platformSlug}`,
    );
  });

  return router;
}
