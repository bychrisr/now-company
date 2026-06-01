---
epic_id: EPIC-003
title: Content Operations
status: Planning
owner: "@pm (Morgan)"
created: 2026-05-30
blocks_covered: [5]
brainstorm_ref: docs/plans/content-brand-module-brainstorm.md
depends_on: [EPIC-001, EPIC-002]
---

# EPIC-003: Content Operations

**Status:** 📋 Planning
**Owner:** @pm (Morgan)
**Created:** 2026-05-30

---

## Objective

Implementar o módulo completo de produção de conteúdo do Paperclip, baseado no blueprint CompanyOS Content Operations v0.5 adaptado: calendários, briefs, peças (state machine IDEA→PUBLISHED), reviews multi-level (Planable pattern), assets de conteúdo, performances e pipeline de tasks automáticas. Este epic consome `company_social_accounts` (EPIC-001) para publicação e `company_brand_kits` + `company_brand_people` (EPIC-002) como contexto criativo.

## Business Value

- Empresa orquestra ciclo completo de conteúdo: ideia → brief → criação → review → agendamento → publicação → métricas
- Approval chain por calendário permite fluxos distintos (cliente externo vs. interno)
- ContentAsset com metadados específicos de plataforma (formato, dimensões, duração) — qualidade técnica garantida
- AI virality score por empresa + benchmark global no Super Admin — Super Admin vê padrões cross-empresa por nicho
- Cross-posting: uma ContentPiece → múltiplas contas simultaneamente
- Agendamento via OAuth direto das contas (sem intermediário)

---

## Stakeholders

- Empresas (produzem conteúdo)
- Clientes das empresas (aprovam conteúdo via review chain)
- Super Admin (vê benchmark global de performance por nicho)
- @architect (Aria) — state machine + pipeline tasks
- @data-engineer (Dara) — modelagem das 7+ tabelas de conteúdo
- @ux-design-expert (Uma) — UI de calendar/editor/review
- @dev (Dex) — implementação
- @qa (Quinn) — quality gates

---

## Scope

### In Scope

**Base: CompanyOS Content Operations v0.5 (adaptado)**

**Adaptação crítica:** `ContentPiece.primaryChannelId` aponta para `company_social_accounts.id` (não para `publication_channels` como no CompanyOS).

**Entidades a implementar:**
- `content_calendars` (1:N por empresa, N:1 opcional com clients)
- `content_briefs` (brief estratégico — objetivo, audiência, tom, KPIs)
- `content_pieces` (entidade central — state machine IDEA → BRIEF → IN_CREATION → IN_REVIEW → SCHEDULED → PUBLISHED → ARCHIVED)
- `content_assets` (TABELA SEPARADA da `assets` existente — metadados específicos de plataforma)
- `content_reviews` (approval chain multi-level — configurado POR CALENDÁRIO)
- `content_performances` (métricas por peça/canal/período)
- `content_status_history` (audit trail de cada transição)
- `content_pipeline_tasks` (tasks automáticas por transição de status)

**Enums:**
- `ContentType`: ARTICLE, SOCIAL_POST, VIDEO_SHORT, VIDEO_LONG, PODCAST, NEWSLETTER, THREAD, CAROUSEL, INFOGRAPHIC, LANDING_PAGE, CASE_STUDY, EBOOK
- `ContentStatus`: IDEA → BRIEF → IN_CREATION → IN_REVIEW → SCHEDULED → PUBLISHED → ARCHIVED

**AI virality score (decisão 2026-05-30):**
- Tabela `company_ai_config` com modelo e parâmetros por empresa (configurável)
- View/agregação para Super Admin com scores por nicho (benchmark cross-empresa)

**Marketing Calendar (decisão 2026-05-30):**
- `content_calendars` é por empresa
- Super Admin tem acesso transversal (panorama, não gerência)

**Integrações:**
- Remotion: renderizar ContentPiece + BrandKit → vídeo exportável
- Agentes de geração: criam draft de ContentBrief e ContentPiece consumindo BrandKit
- Cross-posting: uma ContentPiece → múltiplos `company_social_accounts`
- Agendamento: `ContentPiece.scheduledAt` → publicação direta via OAuth

### Out of Scope

- Repurposing (video_long → múltiplos video_short) — fase futura, projeto externo especializado
- Integração com módulo de marketing dedicado (ainda inexistente) — `content_calendars` cobre o necessário
- Reutilizar tabela `assets` existente — decisão foi tabela SEPARADA
- Bloco 2.5 (Squads/Tom de voz) — bloqueado por epic separado

---

## Success Criteria

- [ ] Empresa cria calendar com approval chain customizada
- [ ] ContentPiece transita por todos os estados (IDEA → PUBLISHED) com audit trail
- [ ] Review multi-level funciona conforme config do calendário
- [ ] Cross-posting: uma peça publica em 2+ contas simultaneamente
- [ ] Agendamento automático dispara publicação via OAuth no horário programado
- [ ] AI virality score gerado por peça via modelo configurável da empresa
- [ ] Super Admin vê benchmark de score agrupado por nicho cross-empresa
- [ ] ContentAsset valida formato/dimensões por plataforma antes de publicação

---

## Technical Requirements

- 8 tabelas novas: `content_calendars`, `content_briefs`, `content_pieces`, `content_assets`, `content_reviews`, `content_performances`, `content_status_history`, `content_pipeline_tasks`
- Tabela `company_ai_config` (modelo de IA por empresa)
- View/materialized view para benchmark cross-empresa por nicho
- State machine implementada com guards (não permitir IDEA → PUBLISHED direto)
- Pipeline tasks (`content_pipeline_tasks`) disparadas por transições de status
- FK `content_pieces.primary_channel_id → company_social_accounts.id`
- FK `content_pieces.brand_kit_id → company_brand_kits.id`
- FK `content_pieces.author_id → company_brand_people.id` (opcional)
- Validação de assets por `social_platforms.image_specs` / `copy_specs`

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| State machine complexa gerar bugs de transição | High | Testes exaustivos + guards explícitos + transição via função única |
| Cross-posting com falha parcial (1 conta OK, outra falha) | High | Status por canal (não único da peça) + retry com backoff |
| Review chain configurável gerar UX confusa | Medium | UI clara + templates de chains comuns |
| Benchmark cross-empresa expor dados sensíveis | Critical | Agregação obrigatória, sem identificação individual de empresa |
| AI score com modelos diferentes por empresa gerar comparação injusta | Medium | Normalização do score antes de comparar entre empresas |
| Tabela `content_assets` duplicar dados de `assets` | Low | Justificado: metadados específicos. Documentar diferença |

---

## Dependencies

**Depends on:**
- EPIC-001 (Platform Foundation) — `company_social_accounts` é FK obrigatória
- EPIC-002 (Brand Identity System) — `company_brand_kits` e `company_brand_people` são contexto
- Companies table (já existe)

**Blocks:**
- Nada — é o último epic da cadeia

---

## Documentation

| Type | Location | Status |
|------|----------|--------|
| Brainstorm origem | `docs/plans/content-brand-module-brainstorm.md` (Bloco 5) | Completo |
| Decisões fechadas Bloco 5 | `docs/plans/content-brand-module-brainstorm.md#bloco-5` | 2026-05-30 |
| Blueprint CompanyOS | `brainOS/03_projects/1_work/company-os/02_knowledge/CompanyOS-Master-Part3-Modules13-19.md` | Aprovado, 0% implementado |
| Atlas técnico de plataformas | `docs/references/global-content-formats-atlas.md` v3.1 | Completo |

---

## Stories

_Stories serão criadas pelo @sm (River) usando `*create-story` a partir deste epic._

Sugestão de divisão em fases:
1. Schema base: `content_calendars` + `content_briefs` + `content_pieces` (state machine)
2. Review chain: `content_reviews` + UI de approval
3. Assets: `content_assets` + validação por plataforma
4. Cross-posting + agendamento via OAuth
5. Performances: `content_performances` + sync via Routine (padrão EPIC-001)
6. AI score: `company_ai_config` + geração de score
7. Super Admin benchmark: view agregada por nicho

| ID | Title | Status |
|----|-------|--------|
| _TBD_ | _A ser criada por @sm_ | Draft |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-30 | 1.0 | Epic criado a partir das decisões consolidadas do Bloco 5 | @pm (Morgan) |
