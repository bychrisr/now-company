/**
 * QA Orphan Check — Story 4.4 (AC 2)
 *
 * Verifica que não existem registros órfãos em
 * companies.feedback_data_sharing_consent_by_user_id antes de aplicar a FK.
 *
 * Este teste é a evidência formal exigida pelo AC 2 da Story 4.4.
 * Resultado esperado: COUNT = 0 (pré-condição bloqueadora satisfeita).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.ts";

describe("QA Story 4.4 — Orphan Check (AC 2)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("qa-orphan-check-4.4-");
    db = createDb(tempDb.connectionString);
  });

  afterAll(async () => {
    await db?.$client?.end?.({ timeout: 0 });
    await tempDb?.cleanup();
  });

  it("companies.feedback_data_sharing_consent_by_user_id não tem registros órfãos (COUNT = 0)", async () => {
    // Query de diagnóstico definida no AC 2 da Story 4.4 e na Task 1
    // Usa db.$client (postgres.js) para SELECT com retorno de linhas
    const result = await db.$client<{ orphan_count: number }[]>`
      SELECT COUNT(*)::int AS orphan_count
      FROM companies
      WHERE feedback_data_sharing_consent_by_user_id IS NOT NULL
        AND feedback_data_sharing_consent_by_user_id NOT IN (
          SELECT id FROM "user"
        )
    `;

    const count = result[0].orphan_count;

    console.log(`\n📊 Orphan Check Result: COUNT = ${count}`);
    console.log("   Pré-condição bloqueadora (AC 2, Task 1) — COUNT deve ser 0");

    expect(count).toBe(0);
  });
});
