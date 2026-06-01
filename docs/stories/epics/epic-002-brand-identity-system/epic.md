---
epic_id: EPIC-002
title: Brand Identity System
status: Planning
owner: "@pm (Morgan)"
created: 2026-05-30
blocks_covered: [2, 3]
brainstorm_ref: docs/plans/content-brand-module-brainstorm.md
---

# EPIC-002: Brand Identity System

**Status:** 📋 Planning
**Owner:** @pm (Morgan)
**Created:** 2026-05-30

---

## Objective

Construir o sistema completo de identidade visual por empresa: BrandKit (tokens DTCG W3C, logo variants, pipeline de renderização Satori/Remotion) e BrandPerson (pessoas que são o rosto da marca, com múltiplas fotos contextualizadas). Este epic é a fonte de verdade visual que alimenta toda a geração de conteúdo no Epic 3.

## Business Value

- Cada empresa tem identidade visual versionada e consistente cross-plataforma
- Tokens DTCG W3C como formato canônico — interoperabilidade com Figma, Style Dictionary, ferramentas de design
- 4 modos de onboarding (URL, Logo+IA, Brandfetch, Manual) — reduz fricção
- Pipeline de renderização <50ms (Satori) habilita preview em tempo real
- BrandPerson permite consistência de rosto em campanhas (CEO, influenciadores, apresentadores)
- Multi-marca: agências podem gerenciar múltiplos clientes com isolamento

---

## Stakeholders

- Empresas (definem sua identidade visual)
- Agentes de geração de conteúdo (consomem BrandKit como contexto)
- @ux-design-expert (Uma) — design da UI de Brand Kits
- @architect (Aria) — pipeline de renderização (Satori/Remotion)
- @data-engineer (Dara) — modelagem de `company_brand_kits` + filhas
- @dev (Dex) — implementação
- @qa (Quinn) — quality gates

---

## Scope

### In Scope

**Bloco 2 — BrandKit (decisões consolidadas)**
- Tabela `company_brand_kits` (separada de companies, versionada, multi-brand)
- Formato canônico: DTCG W3C (`tokens_json`)
- Tabela `company_logo_variants` (8 variantes: primary/dark/light/mono/symbol/wordmark/horizontal/vertical/favicon)
- 4 origens de onboarding:
  - URL (via skill `alan-design-system`)
  - Logo + IA (sharp + OKLCH para derivar paleta)
  - Brandfetch API
  - Manual
- Pipeline de renderização:
  - Imagens estáticas: Satori (@vercel/og) — TTF obrigatório
  - Vídeos: Remotion (Lambda em fase futura, MVP local)
  - Preview UI: CSS vars + iframe sandbox
- Composições Remotion: ReelVertical, FeedSquare, FeedPortrait, ThumbnailYT, CarrosselSlide, StoryAnimated
- Stack UI: react-colorful, cmdk, culori (OKLCH), style-dictionary v4, apca-w3, Zustand+immer
- Nav: Content › Brand Kits (não Settings)

**Bloco 3 — BrandPerson (decisões consolidadas 2026-05-30)**
- Tabela `company_brand_people` (N pessoas por empresa, sem vínculo obrigatório com user_id)
- Tabela filha `company_brand_person_photos` (múltiplas fotos por pessoa com label, tags, metadata)
- Campos: `name, role, bio, voice_style, content_pillars, is_public_face, is_active, sort_order`
- Fotos com contextos: fundo branco, formal, casual, etc. (granularidade para futura engine de seleção)
- UI MVP: picker manual simples
- Schema projetado para suportar futura engine de composição por parâmetros (escala, resolução, estilo)

### Out of Scope

- Bloco 2.5 (Tom de voz + Squads) — bloqueado por epic separado de infraestrutura de Squads
- Remotion Lambda em cloud — fase futura (MVP roda local)
- Brandfetch API integração paga — fase futura (MVP com plano free)
- Figma sync — fase futura
- Engine de seleção automática de foto — fase futura (MVP é picker manual)

---

## Success Criteria

- [ ] Empresa cria BrandKit via URL e a skill `alan-design-system` extrai tokens automaticamente
- [ ] Tokens DTCG W3C válidos, exportáveis como CSS, JSON e Style Dictionary
- [ ] 8 variantes de logo geradas automaticamente via sharp (dark/light/mono derivados do primary)
- [ ] Preview Satori renderiza em <50ms
- [ ] Empresa cadastra BrandPerson com múltiplas fotos contextualizadas
- [ ] Picker de foto funciona no MVP (seleção manual)
- [ ] Multi-brand validado: empresa pode ter 2+ brand kits ativos

---

## Technical Requirements

- Tabela `company_brand_kits` com `tokens_json JSONB` (formato DTCG W3C)
- Tabela `company_logo_variants` com FK para `assets` ou storage próprio
- Tabela `company_brand_people` (entidade pai)
- Tabela `company_brand_person_photos` (filha — múltiplas fotos com label/tags)
- Reutilizar `ui-branding.ts` (`deriveColorFromSeed`, `pickReadableTextColor`, `createFaviconDataUrl`)
- Reutilizar `CompanyPatternIcon.tsx` (Bayer dither + OKLCH)
- Reutilizar `sharp@0.34.5` para manipulação raster
- Reutilizar Tailwind 4.0 + OKLCH + CSS custom properties
- Integração com skill `alan-design-system` para extração por URL
- Pipeline Satori configurado com TTF (não WOFF2)

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Extração via `alan-design-system` falhar em URLs complexas | Medium | Fallback manual + log de URLs problemáticas |
| Tokens DTCG W3C com edge cases não cobertos | Low | Validação Zod + testes com kits reais |
| Performance Satori degradar com fontes pesadas | Medium | Cache de fontes + lazy load |
| Multi-brand causar confusão UX | Medium | UI clara de "kit ativo" + toggle entre kits |
| Logo upload sem variants gera output ruim | Low | Auto-geração via sharp como fallback |

---

## Dependencies

**Depends on:**
- Companies table (já existe)
- Assets table (já existe — para logo storage)

**Blocks:**
- EPIC-003 (Content Operations) — consome BrandKit e BrandPerson como contexto de geração

**Não bloqueia:**
- EPIC-001 (Platform Foundation) — independente, pode rodar em paralelo

---

## Documentation

| Type | Location | Status |
|------|----------|--------|
| Brainstorm origem | `docs/plans/content-brand-module-brainstorm.md` (Bloco 2 + Bloco 3) | Completo |
| Decisões fechadas Bloco 3 | `docs/plans/content-brand-module-brainstorm.md#bloco-3` | 2026-05-30 |
| Atlas técnico | `docs/references/global-content-formats-atlas.md` v3.1 | Completo |

---

## Stories

_Stories serão criadas pelo @sm (River) usando `*create-story` a partir deste epic._

Sugestão de divisão em fases (vinda do brainstorm):
1. MVP: `company_brand_kits` + API + editor cores + tipografia + export DTCG/CSS
2. Logo variants + auto-geração dark/mono via sharp
3. `alan-design-system` integration (extração por URL)
4. Satori preview inline + Remotion player preview
5. BrandPerson MVP (pessoa + fotos + picker manual)

| ID | Title | Status |
|----|-------|--------|
| _TBD_ | _A ser criada por @sm_ | Draft |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-30 | 1.0 | Epic criado a partir das decisões consolidadas dos Blocos 2 e 3 | @pm (Morgan) |
