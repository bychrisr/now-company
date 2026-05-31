# Status da Sessão — Módulo Marca/Redes/Conteúdo
> 2026-05-30 | Epics criados, próximo passo: @sm gera stories

## Epics criados (2026-05-30)

| Epic | Path | Blocos | Status |
|---|---|---|---|
| EPIC-001 Platform Foundation | `docs/stories/epics/epic-001-platform-foundation/epic.md` | 0, 1, 4A | ✅ Stories prontas (8 stories, todas Approved) |
| EPIC-002 Brand Identity System | `docs/stories/epics/epic-002-brand-identity-system/epic.md` | 2, 3 | 📋 Planning |
| EPIC-003 Content Operations | `docs/stories/epics/epic-003-content-operations/epic.md` | 5 | 📋 Planning |

**Ordem de execução técnica:** [EPIC-001 + EPIC-002 em paralelo] → EPIC-003

**Branch:** `feat/content-brand-epics`

## Arquivo principal
`docs/plans/content-brand-module-brainstorm.md`

## Referência interna (atlas auto-suficiente)
`docs/references/global-content-formats-atlas.md` — v3.1, expandido com specs técnicos completos de 15+ plataformas (10 seções na Parte I)

## Status por bloco

| Bloco | Status | Próxima ação |
|---|---|---|
| 0 — Super Admin de Plataformas | ✅ Detalhado | Pronto para story |
| 1 — Platform Registry (seed) | ✅ **Completo** — 15+ plataformas com capabilities+copy_specs+image_specs+estratégia | Pronto para stories |
| 2 — BrandKit | ✅ **Investigado e documentado** — schema, pipeline, UX, DTCG, Remotion, Satori | Pronto para stories (fases abaixo) |
| 2.5 — Tom/Voz + MMOS Squad | 🔴 **P0** — Investigado, schema pendente | Ver seção "Bloco 2.5" abaixo — depende do epic de Squads/Agents |
| 3 — BrandPerson | ✅ **Decisões fechadas** — tabela filha fotos, N pessoas por empresa, picker simples MVP | Pronto para story |
| 4 — Social Accounts + Ads | ✅ **Parte A fechada** / ⏸️ Parte B pausada | Parte B (tráfego pago) adiada conscientemente — retomar após MVP orgânico + Content Module |
| 5 — Content Module | ✅ **Decisões fechadas** — approval por calendário, assets separado, repurposing futuro, AI score por empresa + Super Admin global | Pronto para story |

## Bloco 1 — Plataformas mapeadas (seed completo)

15 plataformas com entradas completas no brainstorm:
Instagram, WhatsApp Business, Facebook, Threads, YouTube, TikTok, LinkedIn, Reddit, Hacker News, Indie Hackers, Blog, Twitter/X, Bluesky, Pinterest, Snapchat (BAIXA BR), Telegram, Discord, Spotify, Apple Podcasts, Google Meu Negócio, Kwai, GitHub, Substack, Product Hunt, Quora, Twitch

Excluídas: Koo (encerrado), Nimo TV (encerrado), Rumble (STF), Band.us (sem tração BR)

## Bloco 2 — BrandKit (decisões consolidadas)

**Escopo:** por empresa (`company_id`), não por instância. Cada cliente tem seus próprios brand kits.

**Formato canônico:** DTCG W3C (tokens.json) — única fonte de verdade
**Tabela:** `company_brand_kits` (separada de companies, versionada, multi-brand)
**Logo:** migrar para `company_logo_variants` (8 variantes: primary/dark/light/mono/symbol/wordmark/horizontal/vertical/favicon)

**Pipeline de renderização:**
- Imagens estáticas → Satori (@vercel/og) — <50ms, TTF obrigatório (não WOFF2)
- Vídeos → Remotion Lambda — $0.001-0.02/render, inputProps + Zod schema
- Preview UI → CSS vars + iframe sandbox

**Composições Remotion:** ReelVertical, FeedSquare, FeedPortrait, ThumbnailYT, CarrosselSlide, StoryAnimated

**Stack UI:** react-colorful, cmdk, culori (OKLCH), style-dictionary v4, apca-w3, Zustand+immer
**Nav:** Content › Brand Kits (não Settings)

**Skill alan-design-system:** extração automática de design system de qualquer URL pública → alimenta `company_brand_kits.tokens_json`

**4 origens de onboarding:** URL (alan-design-system) / Logo+IA (sharp+OKLCH) / Brandfetch / Manual

**Fases de implementação:**
1. MVP: company_brand_kits table + API + editor cores + tipografia + export DTCG/CSS
2. Logo variants + auto-geração dark/mono via sharp
3. alan-design-system integration (extração por URL)
4. Satori preview inline + Remotion player preview
5. Tom de voz + integração agentes (Bloco 2.5)
6. Futuro: Remotion Lambda, multi-brand avançado, Brandfetch, Figma sync

## Infraestrutura existente confirmada (via probe)

- `instance_user_roles` + `isInstanceAdmin()` — funcional
- `assertCanManageInstanceSettings()` — middleware pronto
- `InstanceSidebar` em `/instance/settings/*` — Super Admin entra aqui
- `AdapterManager.tsx` — padrão de UI para gestão de plataformas
- `company_secret_provider_configs` — padrão para OAuth credentials com health check
- `ui-branding.ts` — `deriveColorFromSeed`, `pickReadableTextColor`, `createFaviconDataUrl`, `hslToHex` já prontos
- `CompanyPatternIcon.tsx` — geração procedural Bayer dither + OKLCH
- `sharp@0.34.5` instalado — manipulação raster disponível
- Tailwind 4.0 + OKLCH + CSS custom properties — em uso

## Bloco 2.5 — Tom/Voz + Squads (investigado em 2026-05-29)

### Decisão de arquitetura
- Tom/Voz segue **exatamente o mesmo padrão do BrandKit** — por empresa (`company_id`), versionado, com onboarding em 3 modos:
  1. Empresa traz definido → importa/ajusta
  2. Empresa não tem → agente guia descoberta (interativo)
  3. Gerado com base em dados da empresa (escalável)
- Tabela futura: `company_tone_voice` (análoga a `company_brand_kits`)

### Dependência crítica: Epic de Squads/Agents (P0)
O Bloco 2.5 depende de um epic inteiro de infraestrutura que precisa ser criado antes.

**Contexto:** O Paperclip já tem tabela `agents` funcional, mas sem conceito de Squad.
O ecossistema AIOX (`/squads-aios/`) tem 15+ squads com estrutura complexa (tiers, routing matrix, workflows, hooks) que precisam virar entidades de DB no Paperclip.

**Fonte de verdade dos squads:** `/home/bychrisr/projects/work/squads-aios/`
- `mmos-squad/` — MMOS (mind cloning, tom de voz)
- `xquads/brand-squad/` — Brand strategy
- `xquads/copy-squad/` — Copywriting
- + 12 outros squads

### Schema necessário — 15 tabelas novas (4 fases)

**Fase 1 — MVP (bloqueante):**
- `squads` — entidade principal com metadados do squad.yaml
- `squad_memberships` — agente ↔ squad com tier e sub_group
- `squad_config_revisions` — versionamento (padrão agent_config_revisions)
- ALTER `agents`: adicionar `tier`, `sub_group`

**Fase 2 — Core:**
- `agent_tasks` — tasks como entidades first-class (com elicit flag)
- `workflow_definitions` — workflows de squad
- `workflow_phases` — fases com dependências entre si
- `agent_routing_matrix` — routing inteligente por domínio + keywords

**Fase 3 — Lifecycle:**
- `agent_personas` — persona normalizada (tom, greeting, princípios)
- `agent_lifecycle_hooks` — activation, transition, handoff, greenfield guard
- `agent_handoffs` — artefatos de handoff entre agentes
- `agent_tools_access` — tools permitidos/bloqueados por agente

**Fase 4 — Versionamento avançado:**
- `workflow_definition_revisions`
- `agent_tiers` (tier definitions por squad)
- `agent_sub_groups`

### Próximos passos para este bloco
1. Criar epic de Squads/Agents no Linear
2. Fechar stories das Fases 1-4
3. Só depois retornar ao Bloco 2.5 (company_tone_voice table)

---

## Investigações pendentes (próxima sessão)

1. **Epic Squads/Agents** — criar epic + stories Fase 1 (squads + squad_memberships + ALTER agents)
2. **Meta MCP** — endpoints, capacidades, hierarquia Campaign>AdSet>Ad>Creative (Bloco 4B)
3. **Bloco 5 (Content Module)** — adaptações específicas para Paperclip a partir do CompanyOS blueprint
4. **Remotion Lambda AWS** — conta por instância ou por empresa? billing model
5. **Brandfetch API** — plano self-serve, pricing, rate limits
