import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  PlatformCapabilities,
  PlatformCopySpecs,
  PlatformImageSpecs,
} from "@paperclipai/shared";

/**
 * Global platform registry managed by Super Admin.
 * No company_id — this is an instance-level catalogue.
 * Story 1.3 will expand capabilities/copySpecs/imageSpecs with detailed specs.
 */
export const socialPlatforms = pgTable(
  "social_platforms",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identification
    slug: text("slug").notNull(), // 'instagram', 'youtube' — globally unique
    name: text("name").notNull(), // 'Instagram', 'YouTube' — display name
    category: text("category").notNull(), // 'social', 'video', 'audio', 'blog', 'community'

    // Super Admin governance
    status: text("status").notNull().default("enabled"), // enabled | disabled
    sortOrder: integer("sort_order").notNull().default(0),

    capabilities: jsonb("capabilities")
      .$type<PlatformCapabilities>()
      .notNull()
      .default({} as PlatformCapabilities),
    copySpecs: jsonb("copy_specs")
      .$type<PlatformCopySpecs>()
      .notNull()
      .default({} as PlatformCopySpecs),
    imageSpecs: jsonb("image_specs")
      .$type<PlatformImageSpecs>()
      .notNull()
      .default([] as PlatformImageSpecs),

    // OAuth app credentials (instance-level, encrypted at rest)
    oauthAppId: text("oauth_app_id"),
    // Encriptado com PAPERCLIP_SECRETS_MASTER_KEY (AES-256-GCM, formato local_encrypted_v1 JSON).
    // NUNCA expor em responses de API — usar hasOauthSecret: boolean no lugar.
    oauthAppSecretEnc: text("oauth_app_secret_enc"),
    oauthRedirectUri: text("oauth_redirect_uri"),

    // Estado da implementação do fluxo OAuth para esta plataforma
    implementationStatus: text("implementation_status")
      .notNull()
      .default("not_implemented"), // 'implemented' | 'in_progress' | 'not_implemented'

    // Metadata
    iconUrl: text("icon_url"),
    description: text("description"),
    websiteUrl: text("website_url"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUq: uniqueIndex("social_platforms_slug_uq").on(table.slug),
    statusSortIdx: index("social_platforms_status_sort_idx").on(
      table.status,
      table.sortOrder,
    ),
    categoryIdx: index("social_platforms_category_idx").on(table.category),
  }),
);
