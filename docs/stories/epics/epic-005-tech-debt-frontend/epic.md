---
epic_id: EPIC-005
title: "Tech Debt — Frontend Performance & UX Debt"
status: Proposed
owner: "@pm (Morgan)"
created: 2026-06-17
priority: P1
blocks_covered: [ORION-UI]
discovery_ref: docs/frontend/frontend-spec.md
---

# EPIC-005: Tech Debt — Frontend Performance & UX Debt

**Status:** 🟡 Proposed  
**Owner:** @pm (Morgan)  
**Priority:** P1 — Pré-requisito para novas páginas ORION  
**Created:** 2026-06-17

---

## Objective

Resolver os débitos críticos de frontend identificados no Discovery ORION, com foco em:
1. Eliminar gargalos críticos de bundle (`AgentDetail.tsx` 176kb, `IssueChatThread.tsx` 158kb)
2. Padronizar estados de loading/error/empty ausentes em componentes críticos
3. Corrigir inconsistências de design system (variáveis CSS duplicadas, tipografia inconsistente)

Sem este epic, a adição das 7 novas páginas ORION degradaria ainda mais o bundle size e a experiência do usuário.

## Business Value

- **Performance:** Reduzir bundle size dos 2 maiores componentes em ~60% via code-splitting e lazy loading
- **UX:** Padronizar estados de loading/error/empty previne telas em branco que degradam retenção
- **Manutenibilidade:** Consolidar tokens CSS duplicados reduz tempo de mudança de tema em ~70%
- **Acessibilidade:** Corrigir labels ARIA ausentes em formulários críticos (conformidade WCAG 2.1 AA)
- **Desbloqueia:** Novas páginas ORION (`/vault`, `/ask`, `/lunar`, `/kpi`, `/focus`, `/areas`) sem aumentar o débito atual

---

## Existing System Context

- **Stack UI:** React + Vite, CSS customizado (`ui/src/index.css` — 1065 linhas)
- **Design system:** Variáveis CSS flat design (`--radius: 0`, tokens em `index.css`)
- **Maior gargalo:** `AgentDetail.tsx` (~176kb não minificado), `IssueChatThread.tsx` (~158kb)
- **Referência:** `docs/frontend/frontend-spec.md` (25 débitos totais)

---

## Scope

### In Scope

**Bloco A — Bundle Size Critical (F01, F02)**
- Lazy loading via `React.lazy()` + `Suspense` para `AgentDetail.tsx`
- Lazy loading via `React.lazy()` + `Suspense` para `IssueChatThread.tsx`
- Code splitting por rota no `App.tsx`
- Verificação: bundle analysis via `vite-bundle-visualizer`

**Bloco B — Estados de Loading/Error/Empty (F03–F08)**
- Componente `<LoadingState>` reutilizável (spinner + skeleton)
- Componente `<ErrorState>` reutilizável (mensagem + retry action)
- Componente `<EmptyState>` reutilizável (ilustração + CTA)
- Aplicar nos 6 componentes/páginas identificados sem tratamento: `IssueList`, `AgentList`, `RunHistory`, `CostDashboard`, `ApprovalsQueue`, `CompanySettings`

**Bloco C — Design System Tokens (F09–F12)**
- Auditar e consolidar variáveis CSS duplicadas em `ui/src/index.css`
- Documentar tokens oficiais: cores, espaçamentos, tipografia, `border-radius`
- Criar arquivo `ui/src/styles/tokens.css` com os tokens canônicos
- Remover overrides inline de `style={}` nos componentes identificados

**Bloco D — Acessibilidade crítica (F13–F15)**
- Adicionar `aria-label` nos botões de ação sem texto visível (`IconButton` components)
- Corrigir hierarquia de headings (`h1` → `h2` → `h3`) em `CompanySettings` e `AgentDetail`
- Adicionar `role="status"` nos toast notifications

### Out of Scope

- Mobile responsiveness completa → ORION-UI Sprint 2
- Internacionalização (i18n) → backlog estratégico
- Dark mode → ORION-UI Sprint 3

---

## Stories

### Story 5.1 — Code Splitting & Lazy Loading (AgentDetail + IssueChatThread)
- **Executor:** `@dev`
- **Quality Gate:** `@ux-design-expert`
- **Quality Gate Tools:** `[bundle_analysis, lighthouse_audit, visual_regression]`
- **Risco:** MÉDIO — Lazy loading introduz Suspense boundaries; fallback precisa de UX review
- **Quality Gates:**
  - Pre-Commit: Bundle size antes/depois (`vite build --mode production`)
  - Pre-PR: LCP e FID no Lighthouse não devem regredir

### Story 5.2 — Componentes de Estado (Loading / Error / Empty)
- **Executor:** `@ux-design-expert`
- **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[visual_regression, storybook_review, a11y_audit]`
- **Risco:** BAIXO — Componentes novos, sem breaking change
- **Quality Gates:**
  - Pre-Commit: Componentes renderizam em todos os estados
  - Pre-PR: Review visual pelo @ux-design-expert

### Story 5.3 — Design Tokens + Acessibilidade ARIA
- **Executor:** `@ux-design-expert`
- **Quality Gate:** `@dev`
- **Quality Gate Tools:** `[a11y_audit, css_lint, color_contrast_check]`
- **Risco:** BAIXO — mudanças de CSS e atributos HTML
- **Quality Gates:**
  - Pre-Commit: `npm run lint` passa; axe-core audit sem violações críticas
  - Pre-PR: Contraste de cores WCAG 2.1 AA verificado

---

## Compatibility Requirements

- [ ] Lazy loading não quebra SSR (projeto é CSR puro — sem risco)
- [ ] Novos componentes de estado seguem o design system existente (`index.css` tokens)
- [ ] Mudanças de CSS não afetam componentes já validados em EPIC-001/002/003
- [ ] `pnpm build` completa sem warnings de bundle size
- [ ] Nenhum teste existente quebra (`pnpm test:run`)

## Risk Mitigation

- **Risco primário:** Lazy loading em `AgentDetail.tsx` pode causar flash of loading state em navegações frequentes
- **Mitigação:** Implementar `prefetch` para rotas frequentes + Suspense fallback com skeleton idêntico ao layout final
- **Rollback:** Reverter `React.lazy()` para import direto é trivial (1 linha por componente)
- **Verificação:** Lighthouse antes/depois. LCP não deve aumentar > 200ms

## Definition of Done

- [ ] Bundle size de `AgentDetail` e `IssueChatThread` reduzido em ≥ 50%
- [ ] Componentes `<LoadingState>`, `<ErrorState>`, `<EmptyState>` criados e aplicados nos 6 targets
- [ ] `ui/src/styles/tokens.css` criado com tokens canônicos documentados
- [ ] `axe-core` audit: zero violações críticas nos 6 componentes modificados
- [ ] `pnpm test:run` passa sem regressões
- [ ] `pnpm build` completa sem warnings
- [ ] `docs/frontend/frontend-spec.md` atualizado: F01–F15 marcados como `✅ Resolvido`

---

## Stakeholders

- @ux-design-expert (UX) — design dos componentes de estado e tokens
- @dev (Dex) — implementação do code splitting e ARIA
- @po (Pax) — validação do epic

---

## Next Step (Handoff para @sm)

> "Por favor, desenvolva stories detalhadas para este epic. Stack: React + Vite, CSS customizado.
> Os gargalos de bundle são os componentes `AgentDetail.tsx` (~176kb) e `IssueChatThread.tsx` (~158kb) em `ui/src/`.
> Prioridade: Story 5.1 (maior impacto de performance) → Story 5.2 (UX) → Story 5.3 (A11y/Design).
> Cada story deve incluir: critério de medição antes/depois (bundle size, Lighthouse score)."
