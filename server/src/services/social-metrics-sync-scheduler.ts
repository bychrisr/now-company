import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  routineRuns,
  routineTriggers,
  routines,
} from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { nextCronTickFromExpression } from "./cron.js";
import { syncMetricsForCompany } from "./social-metrics-sync.js";

/**
 * Scheduler de sync de métricas sociais (Story 1.6).
 *
 * Por quê este scheduler é separado de `tickScheduledTriggers` em routines.ts:
 * - Aquele dispatcha runs via heartbeat/issue system (agentes AI executam).
 * - Este executa código direto (HTTP fetch + DB update). Não precisa do
 *   pipeline de heartbeat, mas reusa a infraestrutura de routines+triggers+runs
 *   para satisfazer AC1 (Routine cadastrada), AC2 (cron via routine_trigger)
 *   e AC7 (logging em routine_runs.failureReason).
 *
 * Distinção por `kind`:
 * - tickScheduledTriggers filtra `kind = "schedule"`.
 * - Este filtra `kind = "social_metrics_sync"`. Sem conflito.
 *
 * Lazy-create:
 * - ensureMetricsSyncRoutine garante que existe (agent + routine + trigger)
 *   para a empresa. Chamado no oauth-callback ao conectar a 1ª conta e no
 *   trigger manual.
 */

export const METRICS_SYNC_AGENT_NAME = "system-metrics-sync";
export const METRICS_SYNC_ROUTINE_TITLE = "social-metrics-sync";
export const METRICS_SYNC_TRIGGER_KIND = "social_metrics_sync";
export const DEFAULT_CRON_EXPRESSION = "0 */6 * * *"; // a cada 6 horas
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Garante que existe agent + routine + trigger para a empresa.
 * Idempotente: chama várias vezes sem efeito colateral.
 */
export async function ensureMetricsSyncRoutine(db: Db, companyId: string): Promise<{
  agentId: string;
  routineId: string;
  triggerId: string;
}> {
  // 1. Agent placeholder (paused — apenas FK pra satisfazer schema de routines).
  //    Não roda nada em runtime: existe só pra permitir routines.assigneeAgentId.
  let [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyId),
        eq(agents.name, METRICS_SYNC_AGENT_NAME),
      ),
    );

  if (!agent) {
    const [created] = await db
      .insert(agents)
      .values({
        companyId,
        name: METRICS_SYNC_AGENT_NAME,
        role: "system",
        title: "Sistema — Sync de Métricas Sociais",
        icon: "📊",
        status: "paused",
        adapterType: "process",
        pauseReason: "system-managed: executed by social-metrics-sync-scheduler",
      })
      .returning({ id: agents.id });
    agent = created;
    logger.info({ companyId, agentId: agent.id }, "Created system-metrics-sync agent");
  }

  // 2. Routine — uma por empresa
  let [routine] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(
        eq(routines.companyId, companyId),
        eq(routines.title, METRICS_SYNC_ROUTINE_TITLE),
      ),
    );

  if (!routine) {
    const [created] = await db
      .insert(routines)
      .values({
        companyId,
        title: METRICS_SYNC_ROUTINE_TITLE,
        description:
          "Sincronização periódica de métricas (follower_count, avg_engagement_rate) " +
          "das contas sociais conectadas da empresa. Executada por sistema, não por agent AI.",
        assigneeAgentId: agent.id,
        priority: "medium",
        status: "active",
        concurrencyPolicy: "coalesce_if_active",
        catchUpPolicy: "skip_missed",
      })
      .returning({ id: routines.id });
    routine = created;
    logger.info({ companyId, routineId: routine.id }, "Created social-metrics-sync routine");
  }

  // 3. Trigger — cron
  let [trigger] = await db
    .select({ id: routineTriggers.id })
    .from(routineTriggers)
    .where(
      and(
        eq(routineTriggers.companyId, companyId),
        eq(routineTriggers.routineId, routine.id),
        eq(routineTriggers.kind, METRICS_SYNC_TRIGGER_KIND),
      ),
    );

  if (!trigger) {
    const nextRunAt = nextCronTickFromExpression(DEFAULT_CRON_EXPRESSION, new Date());
    const [created] = await db
      .insert(routineTriggers)
      .values({
        companyId,
        routineId: routine.id,
        kind: METRICS_SYNC_TRIGGER_KIND,
        label: "Sync a cada 6 horas",
        enabled: true,
        cronExpression: DEFAULT_CRON_EXPRESSION,
        timezone: DEFAULT_TIMEZONE,
        nextRunAt: nextRunAt ?? null,
      })
      .returning({ id: routineTriggers.id });
    trigger = created;
    logger.info({ companyId, triggerId: trigger.id }, "Created social-metrics-sync trigger");
  }

  return { agentId: agent.id, routineId: routine.id, triggerId: trigger.id };
}

/**
 * Tick periódico: encontra triggers vencidos, executa sync e atualiza estado.
 * Retorna contagem de triggers processados (útil pra logs/telemetria).
 *
 * Garantias:
 * - Claim atômico do trigger (CAS no nextRunAt) — concorrência segura.
 * - routine_run inserido independente de sucesso/falha.
 * - Failure isolation: erro em uma empresa não impede outras.
 */
export async function tickMetricsSyncScheduler(db: Db, now: Date = new Date()): Promise<{
  triggered: number;
}> {
  const due = await db
    .select({
      trigger: routineTriggers,
      routine: routines,
    })
    .from(routineTriggers)
    .innerJoin(routines, eq(routineTriggers.routineId, routines.id))
    .where(
      and(
        eq(routineTriggers.kind, METRICS_SYNC_TRIGGER_KIND),
        eq(routineTriggers.enabled, true),
        eq(routines.status, "active"),
        isNotNull(routineTriggers.nextRunAt),
        lte(routineTriggers.nextRunAt, now),
      ),
    );

  let triggered = 0;

  for (const row of due) {
    const { trigger, routine } = row;
    if (!trigger.cronExpression || !trigger.nextRunAt) continue;

    const newNextRunAt = nextCronTickFromExpression(trigger.cronExpression, now);

    // Claim atômico: só este worker avança o nextRunAt; outros falham o update.
    const claimed = await db
      .update(routineTriggers)
      .set({
        nextRunAt: newNextRunAt,
        lastFiredAt: now,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(routineTriggers.id, trigger.id),
          eq(routineTriggers.enabled, true),
          eq(routineTriggers.nextRunAt, trigger.nextRunAt),
        ),
      )
      .returning({ id: routineTriggers.id });

    if (claimed.length === 0) continue; // outro worker pegou
    triggered += 1;

    // Insere routine_run em status received → running → succeeded/failed
    const [run] = await db
      .insert(routineRuns)
      .values({
        companyId: routine.companyId,
        routineId: routine.id,
        triggerId: trigger.id,
        source: "schedule",
        status: "running",
        triggeredAt: now,
      })
      .returning({ id: routineRuns.id });

    try {
      const result = await syncMetricsForCompany(db, routine.companyId);
      const hasErrors = result.errors > 0 || result.needsReauth > 0;
      await db
        .update(routineRuns)
        .set({
          status: hasErrors ? "failed" : "succeeded",
          failureReason: hasErrors
            ? `accounts_with_issues: errors=${result.errors}, needs_reauth=${result.needsReauth}, ok=${result.ok}/${result.totalAccounts}`
            : null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(routineRuns.id, run.id));

      await db
        .update(routines)
        .set({
          lastTriggeredAt: now,
          updatedAt: new Date(),
        })
        .where(eq(routines.id, routine.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { companyId: routine.companyId, routineId: routine.id, err },
        "Metrics sync routine run failed unexpectedly",
      );
      await db
        .update(routineRuns)
        .set({
          status: "failed",
          failureReason: `unexpected_error: ${msg.slice(0, 500)}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(routineRuns.id, run.id));
    }
  }

  return { triggered };
}
