# Frontend Spec — now-company (Paperclip Board UI)

> **Autora:** Uma — @ux-design-expert
> **Data:** 2026-06-17
> **Stack:** React 18 + Vite + Tailwind CSS v4 + shadcn/ui + TanStack Query
> **Arquivo:** `docs/frontend/frontend-spec.md`

---

## 1. Mapa de Rotas / Páginas Existentes

Todas as rotas board são **prefixadas** por `/:companyPrefix/` (ex: `/NOW/dashboard`). Rotas globais não levam o prefixo.

### 1.1 Rotas Públicas / Auth

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/auth` | `AuthPage` | Login / claim de board |
| `/board-claim/:token` | `BoardClaimPage` | Claim de instância via token |
| `/cli-auth/:id` | `CliAuthPage` | Auth do CLI via browser |
| `/invite/:token` | `InviteLandingPage` | Landing de convite |

### 1.2 Rotas Instance Settings

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/instance/settings/profile` | `ProfileSettings` | Perfil do usuário logado |
| `/instance/settings/general` | `InstanceGeneralSettings` | Config geral da instância |
| `/instance/settings/access` | `InstanceAccess` | Usuários e permissões globais |
| `/instance/settings/heartbeats` | `InstanceSettings` | Heartbeats / agentes ativos |
| `/instance/settings/experimental` | `InstanceExperimentalSettings` | Feature flags experimentais |
| `/instance/settings/plugins` | `PluginManager` | Gestão de plugins |
| `/instance/settings/plugins/:pluginId` | `PluginSettings` | Config de plugin individual |
| `/instance/settings/adapters` | `AdapterManager` | Gestão de adapters de agentes |
| `/instance/settings/platforms` | `InstancePlatformsAdmin` | Config de plataformas (GitHub etc.) |

### 1.3 Rotas Board (prefixadas por `/:companyPrefix/`)

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `dashboard` | `Dashboard` | Métricas, atividade recente, tarefas ativas |
| `dashboard/live` | `DashboardLive` | Visualização live de runs |
| `onboarding` | `OnboardingRoutePage` | Wizard de onboarding |
| `companies` | `Companies` | Lista de companies |
| `agents/all` | `Agents` | Lista de agentes (filtros: all/active/paused/error) |
| `agents/new` | `NewAgent` | Criar novo agente |
| `agents/:agentId` | `AgentDetail` | Detalhe do agente (176kb!) |
| `agents/:agentId/runs/:runId` | `AgentDetail` | Run específico dentro do agente |
| `projects` | `Projects` | Lista de projetos |
| `projects/:projectId` | `ProjectDetail` | Detalhe do projeto (overview/issues/workspaces/config/budget) |
| `projects/:projectId/workspaces/:workspaceId` | `ProjectWorkspaceDetail` | Workspace de projeto |
| `workspaces` | `Workspaces` | Lista de workspaces (experimental) |
| `issues` | `Issues` | Lista de issues (all/active/backlog/done/recent) |
| `issues/:issueId` | `IssueDetail` | Detalhe de issue com chat thread (167kb!) |
| `search` | `Search` | Busca global |
| `routines` | `Routines` | Lista de rotinas (agendamentos) |
| `routines/:routineId` | `RoutineDetail` | Detalhe da rotina |
| `execution-workspaces/:workspaceId` | `ExecutionWorkspaceDetail` | Workspace de execução (services/config/logs/issues/routines) |
| `goals` | `Goals` | Arvore de metas |
| `goals/:goalId` | `GoalDetail` | Detalhe de meta |
| `approvals/pending` | `Approvals` | Fila de aprovacoes pendentes |
| `approvals/:approvalId` | `ApprovalDetail` | Detalhe de aprovacao |
| `costs` | `Costs` | Dashboard de custos (52kb!) |
| `activity` | `Activity` | Log de atividades |
| `inbox/mine` | `Inbox` | Inbox pessoal (mine/recent/unread/blocked/all) |
| `inbox/requests` | `JoinRequestQueue` | Fila de join requests |
| `org` | `OrgChart` | Organograma de agentes (21kb) |
| `skills/*` | `CompanySkills` | Skills da company |
| `company/settings` | `CompanySettings` | Config da company |
| `company/settings/environments` | `CompanyEnvironments` | Ambientes de execucao |
| `company/settings/members` | `CompanyAccess` | Membros e permissoes |
| `company/settings/invites` | `CompanyInvites` | Gestao de convites |
| `company/settings/secrets` | `Secrets` | Secrets e variaveis (97kb!) |
| `company/settings/social-accounts` | `CompanySocialAccounts` | Contas sociais |
| `company/settings/cloud-upstream` | `CloudUpstream` | Config de cloud sync |
| `company/export/*` | `CompanyExport` | Exportacao de company |
| `company/import` | `CompanyImport` | Importacao de company |
| `design-guide` | `DesignGuide` | Guia de design interno (58kb!) |
| `u/:userSlug` | `UserProfile` | Perfil de usuario |
| `plugins/:pluginId` | `PluginPage` | Pagina de plugin |

### 1.4 Rotas AUSENTES — a adicionar (briefing)

| Rota Planejada | Descricao | Prioridade |
|----------------|-----------|-----------|
| `/vault` | Vault Browser — navegacao tipo Obsidian | Alta |
| `/vault/graph` | Knowledge Graph de wikilinks | Alta |
| `/ask` | Ask Vault — chat com RAG | Alta |
| `/lunar` | Lunar Planning (ciclos lunares) | Media |
| `/kpi` | KPI Dashboard personalizado | Media |
| `/focus` | Focus Log — registro de foco/tempo | Media |
| `/areas` | Life Areas — 14 areas Roda da Vida | Media |

---

## 2. Design System Atual

### 2.1 Fonte de tokens

O projeto usa **Tailwind CSS v4** com `@theme inline` + variaveis CSS personalizadas importadas de `ui/src/styles/tokens.css` (Resolvido na Story 5.3 - F09-F12).

### 2.2 Cores — Light Mode (oklch)

| Token CSS | Valor oklch | Uso |
|-----------|-------------|-----|
| `--background` | `oklch(1 0 0)` | Fundo principal (branco puro) |
| `--foreground` | `oklch(0.145 0 0)` | Texto principal |
| `--card` | `oklch(1 0 0)` | Fundo de cards |
| `--primary` | `oklch(0.205 0 0)` | Acoes primarias |
| `--primary-foreground` | `oklch(0.985 0 0)` | Texto sobre primario |
| `--secondary` | `oklch(0.97 0 0)` | Backgrounds secundarios |
| `--muted` | `oklch(0.97 0 0)` | Muted background |
| `--muted-foreground` | `oklch(0.556 0 0)` | Texto muted (subtitulos) |
| `--accent` | `oklch(0.97 0 0)` | Accent/hover states |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Erros / acoes destrutivas |
| `--border` | `oklch(0.922 0 0)` | Bordas |
| `--ring` | `oklch(0.708 0 0)` | Focus rings |
| `--sidebar` | `oklch(0.985 0 0)` | Fundo da sidebar |

### 2.3 Cores — Dark Mode (oklch)

| Token | Valor oklch |
|-------|-------------|
| `--background` | `oklch(0.145 0 0)` |
| `--card` | `oklch(0.205 0 0)` |
| `--primary` | `oklch(0.985 0 0)` |
| `--muted` | `oklch(0.269 0 0)` |
| `--border` | `oklch(0.269 0 0)` |
| `--sidebar-primary` | `oklch(0.488 0.243 264.376)` — unico acento colorido no dark! |

### 2.4 Tokens Especiais

```css
/* Search chip highlights */
--chip-match-title-bg/fg/border     (hue 265 - azul)
--chip-match-comment-bg/fg/border   (hue 145 - verde)
--chip-match-document-bg/fg/border  (hue 295 - roxo)

/* Document annotations */
--paperclip-doc-annotation-highlight-open    (#fef08a)
--paperclip-doc-annotation-highlight-focused (#fde047)
--paperclip-doc-annotation-highlight-stale   (#fef08a)
--paperclip-doc-annotation-highlight-resolved(#fef9c3)
```

### 2.5 Tipografia

Sem fonte customizada — usa stack do sistema via Tailwind:
- **Sans:** `font-sans` (system-ui default)
- **Mono:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`
- **Tamanhos:** via classes Tailwind (text-xs, text-sm, text-base)
- Markdown content: `font-size: 0.9375rem` / `line-height: 1.6`

### 2.6 Espacamento e Bordas

| Token | Valor |
|-------|-------|
| `--radius` | `0` (flat design intencional!) |
| `--radius-sm` | `0.375rem` |
| `--radius-md` | `0.5rem` |
| `--radius-lg` | `0px` |
| `--radius-xl` | `0px` |

> ATENCAO: `--radius: 0` — design majoritariamente flat. Chips/pills usam `border-radius: 999px`. Alguns `calc(var(--radius) - Npx)` resultam em valores negativos, o que pode ser bug silencioso.

### 2.7 Animacoes CSS

| Classe / Keyframe | Uso |
|-------------------|-----|
| `.activity-row-enter` | Entrada de nova atividade no dashboard (slide + highlight) |
| `.cot-line-enter / exit` | Ticker de chain-of-thought reasoning |
| `.shimmer-text` | Estado "Working" ativo — estilo Cursor IDE |
| `dashboard-activity-highlight` | Flash de acento ao entrar item novo |

Todas suportam `prefers-reduced-motion`.

### 2.8 Classes utilitarias custom

```
.scrollbar-auto-hide       — scrollbar oculta, aparece no hover
.paperclip-mdxeditor-*    — scope do MDXEditor customizado
.paperclip-markdown-*     — renderizacao de markdown
.paperclip-mention-chip   — pill de @mention inline
.paperclip-mermaid        — blocos Mermaid
```

### 2.9 Componentes shadcn/ui presentes

`avatar`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `collapsible`, `command`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `tabs`, `textarea`, `toggle-switch`, `tooltip`

---

## 3. Inventario de Componentes Principais

### 3.1 Layout e Navegacao

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `Layout` | `Layout.tsx` (16kb) | Shell principal: sidebar + breadcrumb + main + mobile nav |
| `Sidebar` | `Sidebar.tsx` | Navegacao lateral: Work, Projects, Agents, Company |
| `MobileBottomNav` | `MobileBottomNav.tsx` | 5 tabs fixas mobile (Home/Issues/Create/Agents/Inbox) |
| `BreadcrumbBar` | `BreadcrumbBar.tsx` | Barra superior com breadcrumbs + toggle sidebar |
| `InstanceSidebar` | `InstanceSidebar.tsx` | Sidebar de configuracoes de instancia |
| `CompanySettingsSidebar` | `CompanySettingsSidebar.tsx` | Sidebar de configuracoes de company |
| `ResizableSidebarPane` | `ResizableSidebarPane.tsx` | Sidebar redimensionavel via drag |
| `SidebarSection` | `SidebarSection.tsx` | Secao colapsavel na sidebar |
| `SidebarNavItem` | `SidebarNavItem.tsx` | Item de nav com badge e active state |
| `SidebarProjects` | `SidebarProjects.tsx` (15kb) | Lista de projetos na sidebar |
| `SidebarAgents` | `SidebarAgents.tsx` (15kb) | Lista de agentes na sidebar |
| `SidebarCompanyMenu` | `SidebarCompanyMenu.tsx` | Dropdown de selecao de company |
| `SidebarAccountMenu` | `SidebarAccountMenu.tsx` | Menu de conta no bottom da sidebar |

### 3.2 Issues / Tasks

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `IssuesList` | `IssuesList.tsx` (83kb) | Lista de issues com filtros, agrupamento, kanban |
| `IssueRow` | `IssueRow.tsx` | Linha de issue em lista |
| `IssueChatThread` | `IssueChatThread.tsx` (158kb!) | Thread de chat do issue com agente |
| `IssueProperties` | `IssueProperties.tsx` (83kb) | Painel de propriedades do issue |
| `IssueDocumentsSection` | `IssueDocumentsSection.tsx` (57kb) | Secao de documentos do issue |
| `IssueBlockedNotice` | `IssueBlockedNotice.tsx` | Aviso de issue bloqueado |
| `IssueRecoveryActionCard` | `IssueRecoveryActionCard.tsx` | Card de acao de recovery |
| `IssueWorkspaceCard` | `IssueWorkspaceCard.tsx` | Card de workspace ligado ao issue |
| `KanbanBoard` | `KanbanBoard.tsx` | Board kanban de issues |
| `IssueRunLedger` | `IssueRunLedger.tsx` (34kb) | Ledger de runs do issue |
| `NewIssueDialog` | `NewIssueDialog.tsx` (87kb!) | Dialog de criacao de issue |

### 3.3 Agentes

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `AgentConfigForm` | `AgentConfigForm.tsx` (74kb!) | Formulario de configuracao de agente |
| `AgentProperties` | `AgentProperties.tsx` | Painel de propriedades do agente |
| `AgentIconPicker` | `AgentIconPicker.tsx` | Picker de icone do agente |
| `ActiveAgentsPanel` | `ActiveAgentsPanel.tsx` | Painel de agentes ativos no dashboard |
| `NewAgentDialog` | `NewAgentDialog.tsx` | Dialog de novo agente |

### 3.4 Aprovacoes e Budget

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `ApprovalCard` | `ApprovalCard.tsx` | Card de aprovacao pendente |
| `ApprovalPayload` | `ApprovalPayload.tsx` | Payload detalhado de uma aprovacao |
| `BudgetPolicyCard` | `BudgetPolicyCard.tsx` | Card de politica de budget |
| `BudgetIncidentCard` | `BudgetIncidentCard.tsx` | Card de incidente de budget |
| `BudgetSidebarMarker` | `BudgetSidebarMarker.tsx` | Marcador de budget na sidebar |

### 3.5 Markdown e Editor

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `MarkdownBody` | `MarkdownBody.tsx` (23kb) | Renderizacao de markdown |
| `MarkdownEditor` | `MarkdownEditor.tsx` (47kb) | Editor MDX rich-text (MDXEditor) |
| `InlineEditor` | `InlineEditor.tsx` | Editor inline para titulos/campos |
| `CommentThread` | `CommentThread.tsx` (38kb) | Thread de comentarios |

### 3.6 Feedback / Estado

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `EmptyState` | `EmptyState.tsx` | Estado vazio generico (icone + mensagem + botao) |
| `PageSkeleton` | `PageSkeleton.tsx` | Skeletons para loading states (7 variantes) |
| `StatusIcon` | `StatusIcon.tsx` | Icone de status de issue |
| `StatusBadge` | `StatusBadge.tsx` | Badge de status |
| `BlockedReasonChip` | `BlockedReasonChip.tsx` | Chip de razao de bloqueio |
| `ToastViewport` | `ToastViewport.tsx` | Viewport de toasts |

### 3.7 Utilitarios e Misc

| Componente | Arquivo | Descricao |
|-----------|---------|-----------|
| `CommandPalette` | `CommandPalette.tsx` | Paleta de comandos (cmd+K) |
| `OnboardingWizard` | `OnboardingWizard.tsx` (54kb) | Wizard de onboarding multi-step |
| `FileTree` | `FileTree.tsx` | Arvore de arquivos |
| `CompanyPatternIcon` | `CompanyPatternIcon.tsx` | Icone de company com pattern SVG |
| `SwipeToArchive` | `SwipeToArchive.tsx` | Swipe gesture mobile para arquivar |
| `ScrollToBottom` | `ScrollToBottom.tsx` | Botao de scroll para o fundo |
| `FoldCurtain` | `FoldCurtain.tsx` | Animacao de fold/unfold |
| `AsciiArtAnimation` | `AsciiArtAnimation.tsx` | Animacao ASCII decorativa |

---

## 4. Context e Hooks

### 4.1 Contexts disponiveis

| Context | Arquivo | Responsabilidade |
|---------|---------|-----------------|
| `CompanyContext` | `CompanyContext.tsx` | Company selecionada, lista de companies, CRUD |
| `DialogContext` | `DialogContext.tsx` | Abertura de dialogs globais (newIssue, onboarding, newAgent, newGoal, newProject) |
| `BreadcrumbContext` | `BreadcrumbContext.tsx` | Breadcrumbs dinamicos por pagina |
| `SidebarContext` | `SidebarContext.tsx` | Estado open/closed da sidebar, isMobile |
| `PanelContext` | `PanelContext.tsx` | Painel lateral de propriedades |
| `ThemeContext` | `ThemeContext.tsx` | Tema light/dark |
| `ToastContext` | `ToastContext.tsx` | Sistema de toasts |
| `EditorAutocompleteContext` | `EditorAutocompleteContext.tsx` | Autocomplete do editor |
| `GeneralSettingsContext` | `GeneralSettingsContext.tsx` | Config geral (keyboard shortcuts) |
| `LiveUpdatesProvider` | `LiveUpdatesProvider.tsx` (37kb!) | WebSocket/SSE updates em tempo real |

### 4.2 Hooks customizados

| Hook | Arquivo | Responsabilidade |
|------|---------|-----------------|
| `useAgentOrder` | `useAgentOrder.ts` | Ordem de agentes na sidebar |
| `useCompanyOrder` | `useCompanyOrder.ts` | Ordem de companies |
| `useProjectOrder` | `useProjectOrder.ts` | Ordem de projetos |
| `useInboxBadge` | `useInboxBadge.ts` | Badge contador do inbox |
| `useKeyboardShortcuts` | `useKeyboardShortcuts.ts` | Atalhos de teclado globais |
| `useCompanyPageMemory` | `useCompanyPageMemory.ts` | Memoria de ultima pagina visitada por company |
| `useDateRange` | `useDateRange.ts` | Range de datas para filtros |
| `useRetryNowMutation` | `useRetryNowMutation.ts` | Mutation de retry de issue |
| `useResourceMemberships` | `useResourceMemberships.ts` | Memberships de recursos |
| `usePaperclipIssueRuntime` | `usePaperclipIssueRuntime.ts` | Runtime de execucao de issue |
| `useAutosaveIndicator` | `useAutosaveIndicator.ts` | Indicador de autosave |

---

## 5. Adapters UI

Cada adapter de agente possui `config-fields.tsx` que renderiza campos de configuracao especificos:

| Adapter | Obs |
|---------|-----|
| `claude-local` | Claude Anthropic local |
| `codex-local` | OpenAI Codex local |
| `cursor` | Cursor IDE |
| `gemini-local` | Google Gemini local |
| `grok-local` | xAI Grok local |
| `hermes-local` | Hermes (fork-only — externo) |
| `http` | Adapter HTTP generico |
| `openclaw-gateway` | OpenClaw Gateway |
| `opencode-local` | OpenCode local |
| `pi-local` | Pi local |
| `process` | Processo local generico |
| `schema-config-fields.tsx` | Config via JSON Schema (generico) |
| `runtime-json-fields.tsx` | Campos de runtime em JSON |

`adapter-display-registry.ts` centraliza o registro. `dynamic-loader.ts` suporta adapters externos (plugins).

---

## 6. APIs Consumidas

| Modulo API | Endpoints principais |
|-----------|---------------------|
| `accessApi` | Membros, permissoes, user directory |
| `activityApi` | Log de atividades da company |
| `adaptersApi` | Listing e config de adapters |
| `agentsApi` | CRUD de agentes, org chart |
| `approvalsApi` | Aprovacoes pendentes |
| `assetsApi` | Upload de assets (logos) |
| `authApi` | Auth, claim, CLI auth |
| `budgetsApi` | Budgets e incidents |
| `cloudUpstreamsApi` | Config cloud sync |
| `companiesApi` | CRUD de companies |
| `companySkillsApi` | Skills da company |
| `costsApi` | Custos e spending |
| `dashboardApi` | Summary do dashboard |
| `environmentsApi` | Ambientes de execucao |
| `executionWorkspacesApi` | Workspaces de execucao |
| `goalsApi` | CRUD de metas |
| `healthApi` | Health check + versao |
| `heartbeatsApi` | Live runs e heartbeats |
| `instanceSettingsApi` | Settings da instancia |
| `issuesApi` | CRUD de issues, filtros, chat |
| `pluginsApi` | Plugins e settings |
| `projectsApi` | CRUD de projetos |
| `resourceMembershipsApi` | Memberships de projetos |
| `routinesApi` | Routines e triggers |
| `searchApi` | Busca global |
| `secretsApi` | Secrets e env vars |
| `sidebarBadgesApi` | Badges da sidebar |
| `socialAccountsApi` | Contas sociais |
| `userProfilesApi` | Perfis de usuario |

---

## 7. Padroes de Estado (Loading / Error / Empty)

### 7.1 Loading

Padrao principal: `PageSkeleton` com variantes especificas por pagina.

Variantes existentes em `PageSkeleton.tsx`:
- `list` — lista generica
- `issues-list` — lista de issues com filtros
- `detail` — pagina de detalhe
- `dashboard` — grid de metricas + charts
- `approvals` — cards de aprovacao
- `costs` — filtros + charts de custos
- `inbox` — secoes de inbox
- `org-chart` — organograma

Paginas SEM skeleton customizado:
- `Goals` — usa `list` generico, deveria ter variant proprio
- `Activity` — sem skeleton definido
- `Routines` — loading state proprio embutido no componente

### 7.2 Error

Padrao INCONSISTENTE — sem componente centralizado:
- Inline: `{error && <p className="text-sm text-destructive">{error.message}</p>}`
- Sem `ErrorState` ou `ErrorBoundary` em lugar algum
- Alguns componentes ignoram erros silenciosamente

### 7.3 Empty State

Componente `EmptyState` com props: `icon`, `message`, `action?`, `onAction?`

Limitacao: props sao apenas `string` — nao suporta ReactNode, links inline, ou multiplas acoes.

---

## 8. Analise de Acessibilidade (a11y)

### 8.1 Pontos positivos

- Skip link `#main-content` implementado no `Layout`
- `aria-label` presente na maioria dos botoes icon-only
- `role="tree"` correto no `FileTree` com `aria-busy`
- `aria-label="Mobile navigation"` no `MobileBottomNav`
- `touch-action: manipulation` para evitar double-tap-to-zoom
- `min-height: 44px` em elementos interativos no touch
- `prefers-reduced-motion` respeitado em TODAS as animacoes

### 8.2 Problemas identificados

- **[RESOLVIDO - Story 5.3 - F13-F15]** Sidebar usa `<aside>` sem `aria-label` — adicionados `aria-label` descritivos às sidebars principal, de instância e de configurações.
- `OrgChart` e SVG customizado sem roles ou labels ARIA — keyboard navigation impossivel
- `KanbanBoard` sem roles ARIA de `grid` ou `listbox`
- `EmptyState` renderiza `LucideIcon` sem `aria-hidden={true}` — sera anunciado como "image"
- `FoldCurtain` (animacao) sem `aria-hidden` durante transicao
- Gerenciamento de foco ao abrir dialogs nao e explicito em todos os casos

---

## 9. Responsividade / Mobile

### 9.1 Padrao de layout

- **Desktop:** sidebar fixa a esquerda + main scrollavel, `height: 100dvh`
- **Mobile:** sidebar como overlay, `MobileBottomNav` 5 tabs no bottom

### 9.2 Deteccao mobile

- `isMobile` via `SidebarContext` (breakpoint ~768px via Tailwind `md:`)
- Body `overflow: hidden` desktop / `overflow: visible` mobile
- Swipe gesture para abrir/fechar sidebar (edge zone 30px, min distance 50px)
- Scroll-to-hide bottom nav (delta > 8px esconde, < -8px mostra)

### 9.3 MobileBottomNav — problema critico

5 itens hardcoded: Home / Issues / Create / Agents / Inbox

As 7 novas paginas (`/vault`, `/ask`, `/lunar`, `/kpi`, `/focus`, `/areas`) NAO terao acesso mobile sem redesenho da navegacao.

---

## 10. Debitos de UX/UI

| ID | Componente / Pagina | Debito | Impacto UX | Esforco |
|----|---------------------|--------|-----------|---------|
| D01 | `EmptyState` | Props so aceitam `string` — sem ReactNode, links, multiplas acoes | Alto | Baixo |
| D02 | Todas as paginas | Sem `ErrorBoundary` centralizado — erros de render quebram UI silenciosamente | Alto | Medio |
| D03 | Multiplas paginas | Padrao de erro inline inconsistente — nao ha `ErrorState` component | Medio | Baixo |
| D04 | `Goals`, `Activity` | Sem skeleton de loading adequado para o conteudo real | Medio | Baixo |
| D05 | `OrgChart` | SVG/canvas sem ARIA — keyboard navigation impossivel | Alto | Alto |
| D06 | `KanbanBoard` | Sem roles ARIA de grid/listbox — nao anunciavel por screen readers | Alto | Medio |
| D07 | `Sidebar` | [RESOLVIDO na Story 5.3] `<aside>` sem `aria-label` — adicionados labels | Medio | Baixo |
| D08 | `MobileBottomNav` | 5 itens hardcoded — novas paginas inacessiveis no mobile | Alto | Medio |
| D09 | Design System | `--radius: 0` flat com excecoes em chips/pills — inconsistencia visual | Medio | Medio |
| D10 | Design System | Sem tokens de tipografia formais (tamanhos/pesos nao nomeados) | Medio | Medio |
| D11 | Design System | Sem escala de espacamento semantica — tudo via Tailwind ad-hoc | Baixo | Alto |
| D12 | `IssueChatThread` (158kb) | Arquivo gigante — impacto em bundle e manutenibilidade | Medio | Alto |
| D13 | `IssueDetail` (167kb) | Arquivo gigante — precisa de code splitting com React.lazy | Medio | Alto |
| D14 | `AgentConfigForm` (74kb) | Arquivo gigante — sem lazy loading | Medio | Alto |
| D15 | Dashboard | Banner "no agents" usa hardcoded amber — nao usa token semantico de warning | Baixo | Baixo |
| D16 | Dashboard | Budget incident usa `bg-[linear-gradient(...)]` com hex hardcoded — nao themed | Medio | Baixo |
| D17 | `CompanyContext` | `company.kind` NAO existe no tipo `Company` — condicional `personal` nao implementada | Alto | Medio |
| D18 | `Sidebar`/OrgChart/Invites | Elementos team-only nao sao ocultados para `company.kind === 'personal'` — campo nem existe no schema | Alto | Alto |
| D19 | `DesignGuide` (58kb) | Guia de design existe mas nao e referenciado no fluxo de dev | Baixo | Baixo |
| D20 | `index.css` | [RESOLVIDO na Story 5.3] Tokens extraídos para tokens.css, index.css limpo | Baixo | Medio |
| D21 | Mobile geral | Novas paginas planejadas nao tem design mobile definido | Alto | Alto |
| D22 | `EmptyState` | Icone `LucideIcon` sem `aria-hidden={true}` — sera anunciado como "image" | Medio | Baixo |
| D23 | `PageSkeleton` | Sem variant para vault, ask, kpi, focus, areas | Medio | Baixo |
| D24 | `CommandPalette` | Sem integracao com novas paginas no indice de busca | Medio | Medio |
| D25 | Geral | Goals, Activity e Routines tem strings hardcoded em EN sem `t()` | Baixo | Medio |

**Total de debitos identificados: 25**

---

## 11. Gap Analysis — O que falta vs. O que existe

### 11.1 Features de UI Ausentes

| Funcionalidade | Status | Notas |
|----------------|--------|-------|
| Vault Browser (`/vault`) | Inexistente | Precisa de file browser tipo Obsidian |
| Graph View (`/vault/graph`) | Inexistente | Precisa de renderizacao de grafo (d3/vis) |
| Ask Vault (`/ask`) | Inexistente | Interface de chat com RAG |
| Lunar Planning (`/lunar`) | Inexistente | UI de calendario lunar + planejamento |
| KPI Dashboard (`/kpi`) | Inexistente | Charts e metricas customizaveis |
| Focus Log (`/focus`) | Inexistente | Timer/log de foco estilo Pomodoro |
| Life Areas (`/areas`) | Inexistente | 14 areas, Roda da Vida |
| `company.kind` conditional | Inexistente | Campo nao existe no schema `Company` |
| Ocultar Org/Invites para `personal` | Inexistente | Sem logica de condicional |

### 11.2 O que existe e pode ser reutilizado

| Componente / Padrao | Pode ser reutilizado para |
|---------------------|--------------------------|
| `EmptyState` | Todos os novos pages quando vazio |
| `PageSkeleton` + Skeleton primitivo | Loading states das novas paginas |
| `MetricCard` | KPI dashboard tiles |
| `ChartCard` + charts (Recharts) | KPI dashboard charts |
| `MarkdownBody` | Notas do Vault renderizadas |
| `MarkdownEditor` | Editor de notas do Vault |
| `ActivityRow` | Focus Log entries |
| `SidebarSection` | Secoes sidebar das novas paginas |
| `SidebarNavItem` | Links das novas paginas na sidebar |
| Plugin slot `dashboardWidget` | Extensao futura do KPI Dashboard |
| `CommandPalette` | Navegacao rapida no Vault |

### 11.3 Componentes novos a criar

| Componente Novo | Para qual pagina |
|----------------|-----------------|
| `VaultFileTree` | `/vault` — baseado em `FileTree` mas para notas md |
| `WikilinkGraph` | `/vault/graph` — grafo de wikilinks (D3 force layout) |
| `AskChatInterface` | `/ask` — chat RAG, similar a `IssueChatThread` simplificado |
| `LunarCalendar` | `/lunar` — calendario com fases lunares |
| `KPICard` | `/kpi` — card de KPI com trend indicator |
| `KPIBoard` | `/kpi` — grid de KPIs configuravel |
| `FocusTimer` | `/focus` — timer Pomodoro + log de sessoes |
| `LifeAreaWheel` | `/areas` — roda da vida em SVG/Canvas |
| `LifeAreaCard` | `/areas` — card de area individual |
| `ErrorState` | Global — estado de erro centralizado |
| `ErrorBoundary` | Global — boundary para erros de render |

---

## 12. Perguntas para @architect

1. **`company.kind`** — O campo `kind` (valor `'personal'`) esta no roadmap do schema DB? Precisa de migration + type update em `@paperclipai/shared`. Quando entra?

2. **Vault Backend** — As rotas `/vault`, `/vault/graph`, `/ask` tem APIs definidas ou sao frontend-only inicialmente?

3. **Graph Engine** — Para `/vault/graph`, qual biblioteca de grafo? D3 force-layout? Vis.js? Ha preferencia de peso de bundle?

4. **Code Splitting** — `IssueDetail` (167kb), `IssueChatThread` (158kb), `AgentConfigForm` (74kb) pesam o bundle. Pode-se usar `React.lazy` + `Suspense`? Ha algum blocker de roteamento?

5. **Mobile Nav Expandido** — 7 novas paginas nao cabem nos 5 itens do `MobileBottomNav`. Preferencia: (a) "More" menu expansivel, (b) grupos por modo (agent vs personal), ou (c) bottom nav diferente para `company.kind === 'personal'`?

6. **Design System Formal** — Ha plano de extrair tokens para um arquivo separado (`tokens.css`)? O flat design (`--radius: 0`) e intencional e permanente?

7. **ErrorBoundary** — Posso adicionar um `ErrorBoundary` global no `main.tsx` e um `RouteErrorBoundary` no `Layout`? Qual UI preferida para erros (Reload button? Go home?)?

8. **i18n Coverage** — Goals, Activity e Routines tem strings hardcoded em EN sem `t()`. Deve-se cobrir agora ou e tech debt aceitavel para MVP?

9. **Plugin Slots para novas paginas** — As paginas `/vault`, `/ask` etc devem expor plugin slots (ex: `vaultWidget`, `askSidebar`)? Ou sao fechadas inicialmente?

10. **Sidebar das novas paginas** — As 7 novas rotas devem aparecer na `Sidebar` principal (secao propria "Personal"?) ou via plugin slot?

---

## Apendice A — Arquivos por Tamanho (Top 15)

| Arquivo | Tamanho |
|---------|---------|
| `AgentDetail.tsx` | 176 kb |
| `IssueDetail.tsx` | 167 kb |
| `IssueChatThread.tsx` | 158 kb |
| `Inbox.tsx` | 110 kb |
| `Secrets.tsx` | 97 kb |
| `NewIssueDialog.tsx` | 87 kb |
| `IssuesList.tsx` | 83 kb |
| `IssueProperties.tsx` | 83 kb |
| `AgentConfigForm.tsx` | 74 kb |
| `DesignGuide.tsx` | 58 kb |
| `IssueDocumentsSection.tsx` | 57 kb |
| `RoutineDetail.tsx` | 54 kb |
| `OnboardingWizard.tsx` | 54 kb |
| `ExecutionWorkspaceDetail.tsx` | 54 kb |
| `Costs.tsx` | 52 kb |

> NOTA: `AgentDetail.tsx` em 176kb e o maior arquivo — candidato prioritario para code splitting.

---

## Apendice B — Estrutura de Diretorios

```
ui/src/
├── App.tsx              # Roteamento principal (346 linhas)
├── main.tsx             # Entry point
├── index.css            # Design system (28kb, 1065 linhas)
├── adapters/            # Config UI por adapter (13 adapters)
├── api/                 # Clients de API (42 arquivos)
├── components/          # ~196 componentes
│   └── ui/              # shadcn/ui (22 componentes base)
├── context/             # 15 contexts/providers
├── hooks/               # 14 hooks customizados
├── i18n/                # Internacionalizacao
├── lib/                 # Utilitarios (router, utils, queryKeys...)
├── pages/               # 87 arquivos de pagina
├── plugins/             # Sistema de plugins
└── fixtures/            # Fixtures de teste
```

---

*Documento gerado por Uma — @ux-design-expert | AIOX | 2026-06-17*
