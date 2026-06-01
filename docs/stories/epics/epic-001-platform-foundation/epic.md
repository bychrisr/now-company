---
epic_id: EPIC-001
title: Platform Foundation
status: InProgress
owner: "@pm (Morgan)"
created: 2026-05-30
blocks_covered: [0, 1, 4A]
brainstorm_ref: docs/plans/content-brand-module-brainstorm.md
---

# EPIC-001: Platform Foundation

**Status:** 🔄 InProgress — Stories 1.1-1.7 Done, Story 1.8 em andamento (gate QA pendente)
**Owner:** @pm (Morgan)
**Created:** 2026-05-30

---

## Objective

Estabelecer a infraestrutura base do módulo Marca/Redes/Conteúdo: Super Admin de Plataformas, Platform Registry global e Social Accounts orgânicas por empresa. Sem este epic, nenhuma empresa consegue conectar suas redes sociais ao Paperclip — bloqueador absoluto para os Epics 2 e 3.

## Business Value

- Habilita o cadastro centralizado e governado de plataformas (Instagram, YouTube, LinkedIn, etc.) por Super Admin
- Permite que cada empresa conecte suas próprias contas de rede social com isolamento total via `company_id`
- Reusa infraestrutura madura existente (`company_secrets`, `routines`, `heartbeat_runs`) — zero duplicação de padrões críticos de segurança e jobs
- Desbloqueia o Epic 3 (Content Operations): sem `company_social_accounts`, não há publicação possível

---

## Stakeholders

- Super Admin (usuário com `instance_user_roles` elevado)
- Empresas (consumidoras finais que conectam suas contas)
- @architect (Aria) — review de design técnico
- @data-engineer (Dara) — modelagem das tabelas
- @dev (Dex) — implementação
- @qa (Quinn) — quality gates

---

## Scope

### In Scope

**Bloco 0 — Super Admin de Plataformas**
- UI em `/instance/settings/*` para Super Admin gerenciar catálogo global de plataformas
- Middleware `assertCanManageInstanceSettings()` (já existe — reutilizar)
- CRUD de plataformas com toggle enabled/disabled
- Health check de configurações por plataforma

**Bloco 1 — Platform Registry (seed completo)**
- Tabela `social_platforms` com 15+ plataformas seed (Instagram, WhatsApp Business, Facebook, Threads, YouTube, TikTok, LinkedIn, Reddit, Hacker News, Indie Hackers, Blog, Twitter/X, Bluesky, Pinterest, Telegram, Discord, Spotify, Apple Podcasts, Google Meu Negócio, Kwai, GitHub, Substack, Product Hunt, Quora, Twitch)
- Campos por plataforma: capabilities, copy_specs, image_specs, estratégia, status
- Migrations + seed inicial

**Bloco 4A — Contas Orgânicas (company_social_accounts)**
- Tabela `company_social_accounts` com isolamento por `company_id`
- Tokens OAuth via `secret_id` (FK → `company_secrets`) — NUNCA token direto na tabela
- Routine de sync de métricas (`follower_count`, `avg_engagement_rate`) com cron trigger
- Campo `last_synced_at` como cache da última execução
- UI para empresa conectar/desconectar contas

### Out of Scope

- Bloco 4B (Tráfego pago / Ad Accounts) — pausado conscientemente, retomar pós-MVP
- Publicação direta (vai no Epic 3 — Content Operations)
- Cross-posting (Epic 3)

---

## Success Criteria

- [ ] Super Admin consegue habilitar/desabilitar plataformas globalmente
- [ ] 15+ plataformas seed carregadas em `social_platforms` com specs completos
- [ ] Empresa consegue conectar uma conta Instagram via OAuth e o token vai parar em `company_secrets` (não na tabela)
- [ ] Routine de sync de métricas executa via cron e atualiza `last_synced_at`
- [ ] Isolamento por `company_id` validado: empresa A não enxerga contas da empresa B
- [ ] Zero duplicação de tokens fora do `company_secrets`

---

## Technical Requirements

- Tabela `social_platforms` (global, gerida por Super Admin)
- Tabela `company_social_accounts` com FK `secret_id → company_secrets`
- Reutilizar `instance_user_roles` + `isInstanceAdmin()` para Super Admin
- Reutilizar `assertCanManageInstanceSettings()` para middleware
- Reutilizar `AdapterManager.tsx` como padrão de UI
- Reutilizar `company_secret_provider_configs` para OAuth credentials
- Routine + cron trigger para sync de métricas (sem criar infra de jobs nova)
- RLS/isolamento por `company_id` em todas as queries de `company_social_accounts`

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth de plataformas com APIs instáveis (Meta, etc.) | High | Health check periódico + fallback graceful |
| Sync de métricas rate-limited | Medium | Cron com intervalo configurável + backoff exponencial |
| Vazamento de token via query acidental | Critical | Token nunca na tabela — sempre via `company_secrets`. Code review obrigatório. |
| Seed inicial desatualizado (specs mudam) | Low | Documentar processo de update do seed por Super Admin |

---

## Dependencies

**Depends on:**
- Nenhuma dependência interna — é o epic base

**Blocks:**
- EPIC-003 (Content Operations) — precisa de `company_social_accounts` para publicar
- EPIC-002 (Brand Identity) NÃO bloqueia, pode rodar em paralelo

---

## Documentation

| Type | Location | Status |
|------|----------|--------|
| Brainstorm origem | `docs/plans/content-brand-module-brainstorm.md` | Completo |
| Status de sessão | `docs/plans/content-brand-session-status.md` | Atualizado |
| Atlas de plataformas | `docs/references/global-content-formats-atlas.md` v3.1 | Completo |

---

## Stories

| ID | Title | Executor | Status |
|----|-------|----------|--------|
| [1.1](../../1.1.social-platforms-table-and-seed.md) | Social Platforms Table + Initial Seed | @data-engineer | Ready |
| [1.2](../../1.2.super-admin-platforms-ui.md) | Super Admin Platforms UI | @dev | Ready |
| [1.3](../../1.3.social-platforms-seed-expansion.md) | Seed Expansion (15+ plataformas) | @data-engineer | Ready |
| [1.4](../../1.4.company-social-accounts-table.md) | company_social_accounts Table | @data-engineer | Ready |
| [1.5](../../1.5.oauth-flow-and-secrets-integration.md) | OAuth Flow + Secrets Integration | @dev | Ready |
| [1.6](../../1.6.metrics-sync-routine.md) | Metrics Sync Routine | @dev | Ready |
| [1.7](../../1.7.company-social-accounts-ui.md) | Company Social Accounts UI | @dev | Ready |
| [1.8](../../1.8.e2e-and-isolation-tests.md) | E2E + Multi-Tenant Isolation Tests | @qa | Ready |

**Sequência de implementação:** 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8

**Paralelizável:**
- 1.2 e 1.3 podem rodar em paralelo após 1.1
- 1.4 pode iniciar após 1.1 (não depende de 1.2/1.3)
- 1.5, 1.6, 1.7 sequenciais após 1.4
- 1.8 só após tudo

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-30 | 1.0 | Epic criado a partir das decisões consolidadas dos Blocos 0, 1, 4A | @pm (Morgan) |
| 2026-05-30 | 1.1 | 8 stories drafted (1.1-1.8) e validadas por PO. Status epic: Planning→In Progress | @po (Pax) |
