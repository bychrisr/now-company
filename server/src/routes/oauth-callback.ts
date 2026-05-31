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

interface InstagramTokenResponse {
  access_token: string;
  token_type: string;
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

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
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

async function fetchInstagramMe(accessToken: string): Promise<InstagramMeResponse> {
  const params = new URLSearchParams({
    fields: "id,username,name",
    access_token: accessToken,
  });

  const response = await fetch(`https://graph.instagram.com/me?${params.toString()}`);

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

    // Troca o code pelo access_token
    const tokenData = await exchangeInstagramCode(
      code,
      config.instagramAppId,
      config.instagramAppSecret,
      config.instagramRedirectUri,
    );

    // Busca perfil do usuário na plataforma
    const profile = await fetchInstagramMe(tokenData.access_token);

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

    // Verifica se já existe um secret para esta conta (upsert)
    const existingSecret = await db
      .select({ id: companySecrets.id, key: companySecrets.key })
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
      // Reativa secret existente com novo token
      await db
        .update(companySecrets)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(companySecrets.id, existingSecret.id));
      secretId = existingSecret.id;

      logger.info({ companyId, platformSlug, platformAccountId }, "Instagram OAuth: secret reactivated");
    } else {
      // Cria novo secret com o token cifrado pelo provider
      const created = await secrets.create(
        companyId,
        {
          name: secretName,
          key: secretKey,
          provider: defaultProvider,
          value: tokenData.access_token,
          description: `OAuth access token for ${platformSlug} account @${handle}`,
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

    return res.redirect(
      `/company/settings/social-accounts?status=connected&platform=${platformSlug}`,
    );
  });

  return router;
}
