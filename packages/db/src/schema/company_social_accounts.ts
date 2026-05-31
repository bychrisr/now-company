import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { socialPlatforms } from "./social_platforms.js";
import { companySecrets } from "./company_secrets.js";

/**
 * Contas de redes sociais conectadas por empresa.
 * Tokens OAuth ficam em company_secrets via secret_id. NUNCA inline.
 * Regra arquitetural (Bloco 4A, 2026-05-30): access_token/refresh_token
 * jamais entram nesta tabela — apenas secret_id como referência ao cofre.
 */
export const companySocialAccounts = pgTable(
  "company_social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Isolamento multi-tenant — cascade: deletou empresa, some as contas
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // FK para catálogo global — restrict: não deleta plataforma com contas conectadas
    platformId: uuid("platform_id")
      .notNull()
      .references(() => socialPlatforms.id, { onDelete: "restrict" }),

    // Cofre de tokens OAuth — set null: secret revogado não destrói a conta
    secretId: uuid("secret_id").references(() => companySecrets.id, {
      onDelete: "set null",
    }),

    // Identificação da conta na plataforma
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    profileUrl: text("profile_url"),
    platformAccountId: text("platform_account_id"),

    // Métricas — atualizadas pela routine de sync (Story 1.6)
    followerCount: integer("follower_count").notNull().default(0),
    avgEngagementRate: numeric("avg_engagement_rate", { precision: 5, scale: 4 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    // Configurações de publicação
    defaultHashtags: text("default_hashtags").array().notNull().default([]),
    defaultCta: text("default_cta"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),

    // Estado
    isActive: boolean("is_active").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Empresa não conecta a mesma conta 2x na mesma plataforma
    companyPlatformAccountUq: uniqueIndex(
      "company_social_accounts_company_platform_account_uq",
    ).on(table.companyId, table.platformId, table.platformAccountId),

    // Listar contas ativas da empresa
    companyActiveIdx: index("company_social_accounts_company_active_idx").on(
      table.companyId,
      table.isActive,
    ),

    // Agrupar por plataforma
    companyPlatformIdx: index("company_social_accounts_company_platform_idx").on(
      table.companyId,
      table.platformId,
    ),

    // Lookup por secret (útil para invalidação em cascade de secrets)
    secretIdx: index("company_social_accounts_secret_idx").on(table.secretId),
  }),
);
