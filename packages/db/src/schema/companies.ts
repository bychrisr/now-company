import { pgTable, uuid, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// Importa authUsers para estabelecer a relação de propriedade da empresa (D30)
import { authUsers } from "./auth.js";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    pauseReason: text("pause_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    issuePrefix: text("issue_prefix").notNull().default("PAP"),
    issueCounter: integer("issue_counter").notNull().default(0),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    attachmentMaxBytes: integer("attachment_max_bytes")
      .notNull()
      .default(10 * 1024 * 1024),
    requireBoardApprovalForNewAgents: boolean("require_board_approval_for_new_agents")
      .notNull()
      .default(false),
    feedbackDataSharingEnabled: boolean("feedback_data_sharing_enabled")
      .notNull()
      .default(false),
    feedbackDataSharingConsentAt: timestamp("feedback_data_sharing_consent_at", { withTimezone: true }),
    // FK para preservar integridade do registro de consentimento LGPD (D05).
    // ON DELETE SET NULL: dado de auditoria deve sobreviver à exclusão do usuário que consentiu.
    feedbackDataSharingConsentByUserId: text("feedback_data_sharing_consent_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" },
    ),
    feedbackDataSharingTermsVersion: text("feedback_data_sharing_terms_version"),
    brandColor: text("brand_color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Coluna 'kind' indica se a empresa é do tipo pessoal ('personal') ou corporativa ('business') (D29)
    kind: text("kind").notNull().default("business"),
    // Coluna 'owner_user_id' guarda a referência do usuário proprietário da empresa, necessário para o modo pessoal (D30)
    ownerUserId: text("owner_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  },
  (table) => ({
    issuePrefixUniqueIdx: uniqueIndex("companies_issue_prefix_idx").on(table.issuePrefix),
    // Índice parcial único para garantir que um usuário seja dono de no máximo uma empresa pessoal (modo ORION/Personal)
    personalOwnerUniqueIdx: uniqueIndex("companies_personal_owner_idx")
      .on(table.ownerUserId)
      .where(sql`kind = 'personal'`),
  }),
);
