import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySocialAccounts, socialPlatforms } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { secretService } from "./secrets.js";

/**
 * Service de sincronização de métricas de contas sociais (Story 1.6).
 *
 * Por quê: cada empresa precisa que `follower_count` e `avg_engagement_rate`
 * fiquem atualizados no dashboard sem ação manual do usuário. A sync é
 * disparada por uma Routine cron (a cada 6h) ou por endpoint manual.
 *
 * Premissas arquiteturais:
 * - Tokens NUNCA viajam pelos parâmetros — sempre resolvidos via secretService.
 * - Erro em uma conta NÃO impede sync das demais (error isolation por conta).
 * - 401/invalid_token → tenta refresh; falha → marca conta needs_reauth=true.
 * - 429 → backoff exponencial (1s, 2s, 4s, 8s, 16s, 32s, 60s max).
 * - avg_engagement_rate=NULL quando followers=0 ou conta sem posts.
 */

const MAX_BACKOFF_MS = 60_000;
const MAX_429_RETRIES = 5;
const POSTS_FOR_ENGAGEMENT_SAMPLE = 10;

type SocialAccountRow = typeof companySocialAccounts.$inferSelect;

export interface SyncAccountResult {
  accountId: string;
  status: "ok" | "needs_reauth" | "error";
  followerCount?: number;
  avgEngagementRate?: number | null;
  error?: string;
}

export interface SyncCompanyResult {
  companyId: string;
  totalAccounts: number;
  ok: number;
  needsReauth: number;
  errors: number;
  results: SyncAccountResult[];
}

interface InstagramMeMetrics {
  id: string;
  username?: string;
  followers_count?: number;
  media_count?: number;
}

interface InstagramMediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramMediaResponse {
  data: InstagramMediaItem[];
}

interface FetchOptions {
  /** Injetado em testes; default usa fetch global. */
  fetchImpl?: typeof fetch;
  /** Injetado em testes; default usa setTimeout real. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Erro estruturado pra distinguir cenários de auth vs erro genérico vs throttling.
 */
class InstagramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly kind: "auth" | "rate_limit" | "other",
  ) {
    super(`Instagram API error ${status}: ${body.slice(0, 200)}`);
    this.name = "InstagramApiError";
  }
}

function classifyResponse(status: number): "auth" | "rate_limit" | "other" {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "other";
}

/**
 * Wrapper de fetch com backoff exponencial em 429.
 * Retries até MAX_429_RETRIES; depois propaga erro.
 */
async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  opts: Required<Pick<FetchOptions, "fetchImpl" | "sleep">>,
): Promise<Response> {
  let attempt = 0;
  let delayMs = 1000;
  while (true) {
    const response = await opts.fetchImpl(url, init);
    if (response.status !== 429 || attempt >= MAX_429_RETRIES) return response;
    await opts.sleep(Math.min(delayMs, MAX_BACKOFF_MS));
    delayMs *= 2;
    attempt += 1;
  }
}

async function instagramFetchJson<T>(
  url: string,
  accessToken: string,
  opts: Required<Pick<FetchOptions, "fetchImpl" | "sleep">>,
): Promise<T> {
  const response = await fetchWithBackoff(
    url,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    opts,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new InstagramApiError(response.status, body, classifyResponse(response.status));
  }

  return (await response.json()) as T;
}

async function fetchInstagramMetrics(
  accessToken: string,
  opts: Required<Pick<FetchOptions, "fetchImpl" | "sleep">>,
): Promise<InstagramMeMetrics> {
  const params = new URLSearchParams({
    fields: "id,username,followers_count,media_count",
  });
  return instagramFetchJson<InstagramMeMetrics>(
    `https://graph.instagram.com/me?${params.toString()}`,
    accessToken,
    opts,
  );
}

async function fetchInstagramMedia(
  accessToken: string,
  limit: number,
  opts: Required<Pick<FetchOptions, "fetchImpl" | "sleep">>,
): Promise<InstagramMediaResponse> {
  const params = new URLSearchParams({
    fields: "id,like_count,comments_count",
    limit: String(limit),
  });
  return instagramFetchJson<InstagramMediaResponse>(
    `https://graph.instagram.com/me/media?${params.toString()}`,
    accessToken,
    opts,
  );
}

/**
 * Tenta renovar o long-lived token via /refresh_access_token.
 * Retorna o novo token em sucesso, null se a renovação falhar.
 */
async function refreshInstagramToken(
  currentToken: string,
  opts: Required<Pick<FetchOptions, "fetchImpl" | "sleep">>,
): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: currentToken,
  });
  try {
    const response = await fetchWithBackoff(
      `https://graph.instagram.com/refresh_access_token?${params.toString()}`,
      { method: "GET" },
      opts,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Calcula engagement rate médio a partir das últimas N posts.
 * Edge cases: zero followers → NULL; sem posts → NULL.
 * Fórmula: avg((likes + comments) / followers) sobre as posts amostradas.
 */
function computeAvgEngagementRate(
  followersCount: number,
  media: InstagramMediaItem[],
): number | null {
  if (followersCount <= 0) return null;
  if (media.length === 0) return null;

  const sum = media.reduce((acc, m) => {
    const likes = m.like_count ?? 0;
    const comments = m.comments_count ?? 0;
    return acc + (likes + comments) / followersCount;
  }, 0);

  return sum / media.length;
}

/**
 * Sincroniza uma conta específica. Encapsula:
 * - Resolução do token
 * - Fetch /me + /me/media
 * - Cálculo de engagement
 * - Refresh em 401, marca needs_reauth se refresh falhar
 * - Update na tabela (limpa sync_error em sucesso)
 */
export async function syncOneAccount(
  db: Db,
  account: SocialAccountRow,
  options: FetchOptions = {},
): Promise<SyncAccountResult> {
  const opts = {
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? defaultSleep,
  };

  const accountId = account.id;
  const companyId = account.companyId;

  if (!account.secretId) {
    const msg = "Account has no secret bound — cannot sync";
    logger.error({ companyId, accountId }, msg);
    await db
      .update(companySocialAccounts)
      .set({ syncError: msg, updatedAt: new Date() })
      .where(eq(companySocialAccounts.id, accountId));
    return { accountId, status: "error", error: msg };
  }

  const secrets = secretService(db);
  let accessToken: string;
  try {
    accessToken = await secrets.resolveSecretValue(companyId, account.secretId, "latest");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ companyId, accountId, err }, "Failed to resolve secret for sync");
    await db
      .update(companySocialAccounts)
      .set({ syncError: `secret_resolution_failed: ${msg.slice(0, 200)}`, updatedAt: new Date() })
      .where(eq(companySocialAccounts.id, accountId));
    return { accountId, status: "error", error: msg };
  }

  // Tenta sync. Se 401, tenta refresh e retry. Se refresh falhar, needs_reauth.
  const performSync = async (token: string) => {
    const me = await fetchInstagramMetrics(token, opts);
    const followers = me.followers_count ?? 0;
    let avgEngagement: number | null = null;
    if (followers > 0 && (me.media_count ?? 0) > 0) {
      const mediaResponse = await fetchInstagramMedia(token, POSTS_FOR_ENGAGEMENT_SAMPLE, opts);
      avgEngagement = computeAvgEngagementRate(followers, mediaResponse.data ?? []);
    }
    return { followers, avgEngagement };
  };

  try {
    const { followers, avgEngagement } = await performSync(accessToken);
    await db
      .update(companySocialAccounts)
      .set({
        followerCount: followers,
        avgEngagementRate: avgEngagement === null ? null : String(avgEngagement),
        lastSyncedAt: new Date(),
        needsReauth: false,
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(companySocialAccounts.id, accountId));

    return {
      accountId,
      status: "ok",
      followerCount: followers,
      avgEngagementRate: avgEngagement,
    };
  } catch (err) {
    if (err instanceof InstagramApiError && err.kind === "auth") {
      // Tenta renovar o token e retry
      const newToken = await refreshInstagramToken(accessToken, opts);
      if (newToken) {
        try {
          await secrets.rotate(account.secretId, { value: newToken });
          const { followers, avgEngagement } = await performSync(newToken);
          await db
            .update(companySocialAccounts)
            .set({
              followerCount: followers,
              avgEngagementRate: avgEngagement === null ? null : String(avgEngagement),
              lastSyncedAt: new Date(),
              needsReauth: false,
              syncError: null,
              updatedAt: new Date(),
            })
            .where(eq(companySocialAccounts.id, accountId));
          logger.info({ companyId, accountId }, "Token refreshed and sync succeeded");
          return {
            accountId,
            status: "ok",
            followerCount: followers,
            avgEngagementRate: avgEngagement,
          };
        } catch (retryErr) {
          const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          logger.error(
            { companyId, accountId, err: retryErr },
            "Sync failed after token refresh",
          );
          await db
            .update(companySocialAccounts)
            .set({
              syncError: `retry_failed: ${msg.slice(0, 200)}`,
              updatedAt: new Date(),
            })
            .where(eq(companySocialAccounts.id, accountId));
          return { accountId, status: "error", error: msg };
        }
      }

      // Refresh falhou — marca needs_reauth
      logger.warn(
        { companyId, accountId },
        "Token refresh failed — marking account needs_reauth",
      );
      await db
        .update(companySocialAccounts)
        .set({
          needsReauth: true,
          syncError: "token_refresh_failed",
          updatedAt: new Date(),
        })
        .where(eq(companySocialAccounts.id, accountId));
      return { accountId, status: "needs_reauth", error: "token_refresh_failed" };
    }

    // Erro genérico — registra mas não propaga
    const msg = err instanceof Error ? err.message : String(err);
    const errorCode = err instanceof InstagramApiError ? `http_${err.status}` : "fetch_error";
    logger.error(
      { companyId, accountId, errorCode, err },
      "Instagram metrics sync failed for account",
    );
    await db
      .update(companySocialAccounts)
      .set({
        syncError: `${errorCode}: ${msg.slice(0, 200)}`,
        updatedAt: new Date(),
      })
      .where(eq(companySocialAccounts.id, accountId));
    return { accountId, status: "error", error: msg };
  }
}

/**
 * Sincroniza todas as contas ATIVAS de uma empresa. Error isolation por conta:
 * falha em uma não impede as outras. Filtra também pela plataforma slug
 * 'instagram' — Story 1.6 cobre apenas Instagram; outras plataformas seguem
 * o mesmo padrão em stories futuras.
 */
export async function syncMetricsForCompany(
  db: Db,
  companyId: string,
  options: FetchOptions = {},
): Promise<SyncCompanyResult> {
  const accounts = await db
    .select({
      account: companySocialAccounts,
      platformSlug: socialPlatforms.slug,
    })
    .from(companySocialAccounts)
    .innerJoin(socialPlatforms, eq(companySocialAccounts.platformId, socialPlatforms.id))
    .where(
      and(
        eq(companySocialAccounts.companyId, companyId),
        eq(companySocialAccounts.isActive, true),
        eq(socialPlatforms.slug, "instagram"),
      ),
    );

  const results: SyncAccountResult[] = [];
  for (const row of accounts) {
    // Try/catch defensivo extra — syncOneAccount não deveria lançar, mas se
    // lançar por bug inesperado, mantemos a iteração das outras contas.
    try {
      const result = await syncOneAccount(db, row.account, options);
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { companyId, accountId: row.account.id, err },
        "Unexpected error in syncOneAccount — isolating",
      );
      results.push({ accountId: row.account.id, status: "error", error: msg });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const needsReauth = results.filter((r) => r.status === "needs_reauth").length;
  const errors = results.filter((r) => r.status === "error").length;

  logger.info(
    { companyId, totalAccounts: accounts.length, ok, needsReauth, errors },
    "syncMetricsForCompany completed",
  );

  return {
    companyId,
    totalAccounts: accounts.length,
    ok,
    needsReauth,
    errors,
    results,
  };
}

/**
 * Sincroniza apenas UMA conta. Usado pelo endpoint manual.
 * Verifica isolamento por company_id internamente (a query exige ambos).
 */
export async function syncOneAccountById(
  db: Db,
  companyId: string,
  accountId: string,
  options: FetchOptions = {},
): Promise<SyncAccountResult | null> {
  const [row] = await db
    .select()
    .from(companySocialAccounts)
    .where(
      and(
        eq(companySocialAccounts.id, accountId),
        eq(companySocialAccounts.companyId, companyId),
        eq(companySocialAccounts.isActive, true),
      ),
    );
  if (!row) return null;
  return syncOneAccount(db, row, options);
}

// Helpers expostos pra testes
export const __internals = {
  computeAvgEngagementRate,
  classifyResponse,
  InstagramApiError,
};
