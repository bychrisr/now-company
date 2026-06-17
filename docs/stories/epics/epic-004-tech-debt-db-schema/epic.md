---
epic_id: EPIC-004
title: "Tech Debt — Database Schema Foundation"
status: Done
owner: "@pm (Morgan)"
created: 2026-06-17
closed: 2026-06-17
priority: P0
blocks_covered: [ORION-DB]
discovery_ref: docs/db/DB-AUDIT.md
---

# EPIC-004: Tech Debt — Database Schema Foundation

**Status:** ✅ Done  
**Owner:** @pm (Morgan)  
**Priority:** P0 — Bloqueador para Personal Mode (ORION)  
**Created:** 2026-06-17

---

## Objective

Resolver os débitos técnicos críticos do schema de banco de dados identificados no Discovery ORION. Foco em:
1. Adicionar colunas bloqueadoras em `companies` (P0 — desbloqueia Personal Mode)
2. Corrigir FKs `user_id` sem referência formal (segurança e integridade referencial)
3. Adicionar índices ausentes em colunas de alta frequência de join (performance)

Sem este epic, o modo Personal Company (ORION) não pode ser implementado e o schema permanece com 13 FKs implícitas que violam a integridade referencial declarada.

## Business Value

- **Desbloqueia** o Epic ORION-001 (Personal Company Mode) — sem `companies.kind` não há discriminação personal/business
- **Segurança**: 13 colunas `user_id text` sem FK declarada para `user.id` violam referential integrity
- **Performance**: índices compound ausentes em `projects` e `goals` impactam queries de alta frequência
- **LGPD**: `approvals.decided_by_user_id` sem FK impede rastreabilidade auditável
- **Compliance**: `verification.created_at` e `updated_at` nullable (única tabela do schema) é anomalia arquitetural

---

## Existing System Context

- **Stack DB:** Drizzle ORM + PostgreSQL (PGlite em dev) — 97 tabelas, 87 arquivos de schema
- **Migration atual:** `0097_*` — próxima será `0098`
- **Padrão existente:** Todas as tabelas usam `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` e `created_at timestamp NOT NULL DEFAULT now()`
- **Referência de auditoria:** `docs/db/DB-AUDIT.md` (38 débitos totais, 12 🔴 Alto)

---

## Scope

### In Scope

**Bloco A — companies P0 Blockers (D29, D30)**
- `ALTER TABLE companies ADD COLUMN kind text DEFAULT 'business' NOT NULL`
- `ALTER TABLE companies ADD COLUMN owner_user_id text REFERENCES "user"(id) ON DELETE SET NULL`
- Índice: `CREATE UNIQUE INDEX ON companies(owner_user_id) WHERE kind = 'personal'`

**Bloco B — FKs críticas sem declaração (D01, D04, D05, D14)**
- `instance_user_roles.user_id` → FK para `user.id`
- `approvals.decided_by_user_id` → FK para `user.id`
- `approvals.requested_by_user_id` → FK para `user.id`
- `budget_transactions.authorized_by_user_id` → FK para `user.id`
- `agent_checkouts.last_run_id` → FK para `agent_heartbeat_runs.id`

**Bloco C — Índices de performance ausentes (D31, D32)**
- `CREATE INDEX ON projects(company_id, status)` — join crítico
- `CREATE INDEX ON goals(company_id, status)` — join crítico
- `CREATE UNIQUE INDEX ON "user"(email)` — lookup de autenticação

**Bloco D — Anomalia nullable (D35)**
- `ALTER TABLE verification ALTER COLUMN created_at SET NOT NULL`
- `ALTER TABLE verification ALTER COLUMN updated_at SET NOT NULL`

### Out of Scope

- Tabelas do Vault Obsidian (`vault_notes`, `vault_chunks`, `vault_links`) → ORION-002
- FKs D06–D13 (médio/baixo impacto) → backlog para sprint 2
- `plugins.installed_at` naming → débito cosmético, sprint 3

---

## Stories

### Story 4.1 — companies: kind + owner_user_id (Migration 0098)
- **Executor:** `@data-engineer`
- **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[schema_validation, migration_review, drizzle_typecheck]`
- **Risco:** MÉDIO — ALTER TABLE em produção com dados existentes. Requer DEFAULT para não quebrar rows existentes.
- **Quality Gates:**
  - Pre-Commit: Schema validation, typecheck `pnpm -r typecheck`
  - Pre-PR: Migration safety check, ensure `DEFAULT 'business'` não é breaking

### Story 4.2 — FKs críticas + índices de performance (Migration 0099)
- **Executor:** `@data-engineer`
- **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[fk_validation, index_review, explain_analyze]`
- **Risco:** BAIXO — ADD CONSTRAINT é transacional, rollback fácil
- **Quality Gates:**
  - Pre-Commit: FK validation (existência de dados órfãos antes de aplicar constraint)
  - Pre-PR: `EXPLAIN ANALYZE` em queries beneficiadas pelos índices

### Story 4.3 — Anomalias de nullable + audit trail (Migration 0100)
- **Executor:** `@data-engineer`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[schema_validation, nullability_audit]`
- **Risco:** BAIXO — verificação de dados existentes antes de SET NOT NULL

---

## Compatibility Requirements

- [ ] Todas as migrations são reversíveis (rollback plan documentado em cada story)
- [ ] `companies.kind DEFAULT 'business'` garante backward compatibility para rows existentes
- [ ] FKs aplicadas somente após verificação de dados órfãos (`SELECT COUNT(*) WHERE user_id NOT IN (SELECT id FROM "user")`)
- [ ] Drizzle schema atualizado em `packages/db/src/schema/companies.ts` junto com cada migration

## Risk Mitigation

- **Risco primário:** Migration 0098 em tabela `companies` com dados reais de produção
- **Mitigação:** Migration com `DEFAULT 'business'` (não nullable sem default = breaking) + transação explícita
- **Rollback:** `ALTER TABLE companies DROP COLUMN kind; ALTER TABLE companies DROP COLUMN owner_user_id;`
- **Verificação:** `pnpm -r typecheck` + `pnpm test:run` antes de qualquer merge

## Definition of Done

- [x] Migrations 0098–0100 geradas via `pnpm db:generate` e aplicadas com sucesso
- [x] `pnpm -r typecheck` passa sem erros
- [x] `pnpm test:run` passa sem regressões
- [x] `packages/db/src/schema/companies.ts` atualizado com os novos campos
- [x] `docs/db/DB-AUDIT.md` atualizado: D29, D30, D31, D32, D35 marcados como `✅ Resolvido`
- [x] QA gate formal por Quinn (@qa): 4.1 PASS · 4.2 CONCERNS (D05 audit corrigido) · 4.3 PASS

## Scope Items Moved to Backlog

Os seguintes itens estavam no scope original mas foram explicitamente deixados para sprint futuro durante o desenvolvimento:

| Item | Débito | Motivo | Follow-up |
|------|--------|--------|-----------|
| `companies.feedback_data_sharing_consent_by_user_id` FK | D05 | `companies.ts` já modificado em 4.1; decidido não reabrí-lo | Story 4.4 |
| `budget_transactions.authorized_by_user_id` FK | — | Citado no scope inicial; não coberto por nenhuma story | Backlog P2 |
| `agent_checkouts.last_run_id` FK | — | Scope inicial citou `agent_checkouts`; Story 4.2 fez `agent_runtime_state` (tabela correta conforme schema real) | Verificar se `agent_checkouts` existe — pode ser scope equivocado |

---

## Stakeholders

- @data-engineer (Dara) — execução das migrations
- @dev (Dex) — quality gate review
- @architect (Aria) — validação de integridade arquitetural
- @po (Pax) — validação do epic antes do desenvolvimento

---

## Next Step (Handoff para @sm)

> "Por favor, desenvolva stories detalhadas para este epic. Sistema existente: Drizzle ORM + PostgreSQL com 97 tabelas.
> Padrão de migration: `pnpm db:generate` gera o SQL automaticamente a partir do schema Drizzle.
> Prioridade absoluta: Story 4.1 (bloqueador de feature ORION). Story 4.2 e 4.3 podem ser paralelas.
> Cada story deve incluir: checklist de verificação de dados órfãos antes de aplicar constraints."
