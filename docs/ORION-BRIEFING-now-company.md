# Briefing para Orion — Migração brainOS → now-company

> Preparado por: sessão de planejamento estratégico | 2026-06-17
> Destino: `@aiox-master` (Orion) no projeto `/home/bychrisr/projects/work/now-company/`
> Objetivo: Orion planeja e executa tudo a partir deste documento.

---

## 1. Contexto — Quem é o Chris e o que ele quer

**Christian Rodrigues** — empreendedor solo brasileiro, autista nível 1 + TDAH combinado + Altas Habilidades. Múltiplos projetos simultâneos (SaaS, agência, sistemas pessoais). Pensa em sistemas, camadas e alavancagem.

Ele mantém dois sistemas paralelos hoje:
- **brainOS** — OS pessoal: vault Obsidian com 14 áreas de vida (Roda da Vida), KPIs, Lunar Planning, focus logs, wiki de conhecimento
- **companyOS** — operação de negócios: hierarquia agêntica, squads, organograma

**Decisão estratégica tomada:** unificar tudo em uma única plataforma usando **now-company** (`/home/bychrisr/projects/work/now-company/`) como base, em vez de construir do zero no brainOS.

---

## 2. O que é o now-company

Fork do [PaperClip](https://github.com/paperclipai/paperclip) (69k stars, MIT, lançado março 2026) com **Synkra AIOX integrado**. Já tem:

**Core do PaperClip (manter intacto):**
- Multi-company com isolamento total por `companyId`
- Org chart hierárquico (`agents.reportsTo` self-ref)
- Heartbeat scheduler (agentes acordam em ciclos: 4h, 8h, 12h)
- Task checkout atômico (só 1 agente por task, sem conflito)
- Cadeia de contexto (task → goal → missão da empresa)
- Budget mensal por agente (aviso 80%, hard-stop 100%)
- Approval gates + audit trail append-only
- Cost tracking granular (por agent/issue/model/tokens)
- 11 adapters de runtime (Claude, Gemini, Codex, etc.)
- Plugin system via npm

**AIOX já integrado no fork (manter e expandir):**
- 12 agent personas: @dev (Dex), @qa (Quinn), @architect (Aria), @pm (Morgan), @po (Pax), @sm (River), @analyst (Alex), @data-engineer (Dara), @ux-design-expert (Uma), @devops (Gage), @squad-creator, @aiox-master
- Constitution formal com princípios inegociáveis
- Story Development Cycle (4 fases: @sm → @po → @dev → @qa → @devops)
- QA Loop, Spec Pipeline, Brownfield Discovery
- Agent authority matrix + handoff protocol

**Stack técnica:**
- Server: Express REST API + Node.js
- DB: Drizzle ORM + PostgreSQL (PGlite embarcado para dev)
- UI: React + Vite
- Auth: better-auth
- Monorepo: pnpm (`packages/db`, `packages/server`, `packages/ui`, `packages/cli`)

---

## 3. Decisão Estratégica — Modelo de Conta Pessoal + Business

### O problema

O PaperClip não tem conceito nativo de "espaço pessoal". Tudo é filho de uma `company` (`companyId NOT NULL` em ~80 tabelas). Não existe distinção pessoal vs. business.

### A solução (migration leve — Opção B)

Adicionar discriminador de tipo na tabela `companies`:

```sql
ALTER TABLE companies ADD COLUMN kind text DEFAULT 'business';
-- valores: 'personal' | 'business'

ALTER TABLE companies ADD COLUMN owner_user_id text REFERENCES user(id);

CREATE UNIQUE INDEX companies_personal_per_user
  ON companies(owner_user_id) WHERE kind = 'personal';
```

**Comportamento esperado:**
- Onboarding auto-cria a company pessoal para cada novo usuário
- UI esconde org-chart corporativo, invites, approval gates quando `kind='personal'`
- Toda a infra de isolamento, budget, cost tracking reutilizada sem mudança
- `instance_admin` (Chris) consegue ver e acessar tudo

### Hierarquia de acesso

```
Chris (instance_admin — super admin da instância)
├── [Conta Pessoal]   kind='personal', só Chris acessa
│     ├── Vault (14 áreas de vida)
│     ├── Lunar Planning / KPIs
│     ├── Focus logs
│     └── Agents pessoais (scope limitado à conta pessoal)
├── Empresa A         kind='business'
│     └── Chris (owner) + convidados com roles
└── Empresa B         kind='business'
      └── Chris (owner) + convidados com roles
```

**Paths de código afetados:**
- `packages/db/src/schema/companies.ts` — adicionar colunas `kind` e `ownerUserId`
- `packages/db/src/migrations/` — nova migration (próximo número após 0097)
- `server/src/services/companies.ts` (~linha 177) — auto-criar personal company no onboarding
- UI — condicionar elementos de governance/invite quando `kind='personal'`

---

## 4. O que precisa ser ADICIONADO ao now-company

### 4.1 Vault + Obsidian Integration (Alta Prioridade)

**Contexto:** Chris tem um vault Obsidian em `~/brainOS/` com 14 áreas de vida. O vault está sincronizado via Obsidian Sync (celular + nuvem). O vault NÃO vai para o git — questão de segurança (dados pessoais, finanças, saúde).

**O que construir:**

**Fase 1 — Local (agora):**
- `VAULT_PATH` via env var apontando para `~/brainOS/`
- Indexer que lê o vault: walker recursivo de `.md`, extrai frontmatter (gray-matter), title, folder, tags, wikilinks `[[...]]`, mtime
- Schema SQLite adicional (ou tabelas no PostgreSQL): `notes`, `note_links`, `notes_fts` (FTS5 equivalente), `note_chunks`, `chunk_embeddings`
- Pastas a excluir do índice: `.obsidian`, `.trash`, `.git`, `node_modules`, `07_journal`, `08_health`, `09_finance` (áreas sensíveis)
- Watcher com debounce 1500ms via chokidar (reindexação incremental)

**Vault RAG — busca híbrida (3 métodos + RRF):**
1. Vector search — Gemini embedding, cosine similarity ≥ 0.1, top 24
2. FTS5 full-text search — title + body, top 24
3. Graph expansion — top 6, expande 1 hop de wikilinks, score decai 0.5x
4. Reciprocal Rank Fusion (RRF) → top K chunks (default 8)

**Chunking strategy:**
- Target: ~1600 chars/chunk | Hard max: 2400 | Min: 300 (merged)
- Overlap: 200 chars entre chunks
- Content Hash: SHA256(embedText) — sem re-embedding se hash igual

**Fase 2 — Acesso remoto:**
- Cloudflare Tunnel expõe o dashboard localmente via HTTPS
- Vault permanece local (sem conflito de sync)
- Mobile vira painel de controle (não terminal)
- Auth layer mínima (token ou magic link)

**Referência técnica:** Agentic-OS já implementou isso em `dashboard/lib/vault/indexer.ts` — adaptação estimada em ~2h15, 2 arquivos, ~10 linhas de código.

### 4.2 Estrutura do Vault — 14 Áreas (Roda da Vida)

**NUNCA modificar esta estrutura.** É o mapa mental do Chris.

```
~/brainOS/
├── 00_inbox/          ← captura rápida (sem triagem)
├── 01_areas/          ← definição das 14 áreas
├── 02_business/       ← BUs, portfólio, operações
├── 03_projects/       ← projetos ativos
├── 04_focus/logs/     ← logs de foco (40min)
├── 05_kpi/            ← métricas, snapshots, moon reviews
├── 06_habits/         ← hábitos e gamificação
├── 07_journal/        ← 🔒 NUNCA indexar
├── 08_health/         ← 🔒 NUNCA indexar
├── 09_finance/        ← 🔒 NUNCA indexar
├── 10_learning/       ← aprendizado ativo
├── 11_creative/       ← criatividade e arte
├── 12_relationships/  ← relacionamentos
├── 13_network/        ← rede profissional [DORMANT]
├── 14_brand/          ← marca pessoal
├── 15_experiments/    ← experimentos N=1
├── 16_home/           ← casa e infraestrutura
├── 17_spirituality/   ← Ifá, Candomblé, Cabala
├── 18_neuro/          ← TDAH, AH/SD, terapia
├── 19_mobility/       ← mobilidade [DORMANT]
├── 20_garden/         ← digital garden
└── wiki/              ← conhecimento codificado por domínio
    ├── business/
    ├── tech/
    ├── learning/
    ├── brand/
    ├── spirituality/
    ├── neuro/
    ├── creative/
    └── finance/
```

### 4.3 Páginas de UI a Adicionar

As páginas abaixo existem no brainOS e precisam ser portadas/recriadas no now-company UI (React + Vite):

| Página | O que faz | Prioridade |
|---|---|---|
| **Vault Browser** | Navegação e busca no vault Obsidian | P0 |
| **Ask Vault** (`/ask`) | Chat com RAG do vault | P0 |
| **Knowledge Graph** | Grafo de wikilinks do vault | P1 |
| **Lunar Planning** | Planejamento por ciclos lunares (Bloco 0-3) | P1 |
| **KPI Dashboard** | Métricas pessoais, snapshots, OKRs | P1 |
| **Focus Log** | Logs de blocos de foco de 40min | P1 |
| **Life Areas** | Visão das 14 áreas da Roda da Vida | P2 |

**Referência:** código fonte do brainOS em `/home/bychrisr/projects/work/brainOS-new/dashboard/`

### 4.4 CLI Sessions In-Browser (Alta Prioridade)

Agents rodando como sessões reais de CLI no browser, streamadas em tempo real:
- **node-pty** para spawnar processos CLI reais
- **xterm.js** para renderizar o terminal no browser
- **WebSocket** para streaming bidirecional
- Uma sessão por issue/worktree (já existe conceito no PaperClip de worktrees por issue)

O PaperClip usa execução headless (`claude -p` + SSE). A migração para node-pty + xterm.js muda o paradigma: o agente vira uma sessão de terminal real visível ao vivo.

### 4.5 Multi-runtime (Decisão Firme)

Chris quer usar Gemini CLI + Antigravity CLI (`agy`) para cortar custo de tokens. É decisão firme.

**O que implementar:**
- `lib/runtime/` com contrato de capability flags
- Registry de runtimes disponíveis
- `--model` passado ao spawn por agent/task
- Role-based model assignment:
  - `@dev` → Claude Opus (high-effort, implementação)
  - `@qa` → Claude Sonnet (low-effort, review)
  - `@analyst` → Gemini CLI (cost-optimized, research)
  - `@architect` → Claude Opus (decisões de arquitetura)
- Override pontual por task (interface no dashboard)

Economia estimada: ~40% em token spend.

**Referências:** Agentic-OS `specs/0007`, `0030`, `0033`; now-company já tem adapters para Claude e Gemini no `packages/server/src/adapters/`.

### 4.6 Hierarquia Agêntica — Organogram (7 Níveis)

A arquitetura agêntica do Chris vai além do org chart padrão do PaperClip. Baseada em `AGENTIC-OS-ARCHITECTURE-v1.0.md` (universal, supersede todos os anteriores):

```
L0  Mind Bank (horizontal)    mmos-squad (40+ minds cognitivas)
L1  CEO                       Christian Rodrigues (humano)
L2  Orchestrator              @steave (meta-agent)
L3  Squad                     Engineering, Sales, Marketing, CS, Product, Administration
L4  C-Level                   CTO, CRO, CMO, CCO, CPO, CFO, CHRO
L5  Functional Agent          @sdr, @architect, @csm, etc.
L6  Atomic Task               *qualify-lead, *design-architecture, etc.
```

**3 princípios inegociáveis:**
1. **Function over Person** — agents representam papéis, não personalidades
2. **Mind on Demand** — `*load-mind [mind-name]` carrega expertise on-demand (stateless)
3. **Atomic Execution** — toda operação tem nome, trigger e output esperado

**6 Squads Funcionais:**

| Squad | C-Level | Agents principais |
|---|---|---|
| Engineering | CTO/COO | @process-mapper, @architect, @automation-architect, @qa, @observability-engineer, @security-engineer |
| Sales | CRO | @sdr, @outbound-specialist, @inbound-qualifier, @closer, @account-executive, @sales-analyst |
| Marketing | CMO | @social-media-manager, @media-buyer, @email-strategist, @content-manager, @research-analyst, @growth-hacker |
| Customer Success | CCO | @onboarding-specialist, @support, @csm, @customer-intelligence, @renewal-manager |
| Product | CPO | @product-manager, @content-creator, @product-qa, @service-designer, @data-analyst, @ux-researcher |
| Administration | CFO/CHRO | @financial-controller, @financial-analyst, @hr-recruiter, @hr-operations, @legal-counsel, @compliance-officer |

**Council System (on-demand):** mecanismos deliberativos convocados por auto-trigger, produzem recomendações, dissolvem após entregar. Ex: Growth Council (revenue abaixo de OKR), Finance Council (runway < 6 meses), etc.

**Modelo 3 camadas por agent:**
- Layer 1: Functional Agent (Atomic Tasks — capacidade de fazer)
- Layer 2: Mind on demand (expertise carregada on-demand)
- Layer 3: Framework (método/processo — ex: CLOSER Framework para @closer)

**Como se encaixa no PaperClip:**
- L3-L5 mapeiam diretamente para `agents` com `reportsTo` hierárquico
- L6 Atomic Tasks mapeiam para `issues` com tiposde execução
- Mind Bank (L0) = skills/markdown carregadas on-demand pelo adapter
- Council System = approval gates + grupos de agents temporários

**Referência:** `/home/bychrisr/projects/work/squads-aios/organogram/AGENTIC-OS-ARCHITECTURE-v1.0.md`

### 4.7 Standards e Specs (AIOX → Agentic-OS Format)

Migrar formato de agents e skills para padrão portável:

**Formato de agent (migrar para):**
```yaml
---
name: dev
slug: dev
description: Implementa código seguindo stories do AIOX
runtime: claude-code
model: claude-opus-4-8
skills: [coding, tdd-loop, dev-develop-story]
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
# System Prompt

Você é Dex, o developer do AIOX...
```

**Formato de skill (migrar para SKILL.md spec Anthropic):**
```yaml
---
name: kebab-case-name
description: Uma linha clara
metadata:
  status: stable | experimental
  domain: engineering | research | ...
  outputs: [path/to/output]
  cadence: M | L | R | A
---
```

**7 standards a adotar do Agentic-OS:**
1. `skill-authoring.md` → `.aiox-core/standards/`
2. `agent-authoring.md` → `.aiox-core/standards/`
3. `agentic-workflow.md` → `.aiox-core/standards/` (vertical slices + TDD loop)
4. `code-style.md` → adaptar para stack now-company (React + Vite + Tailwind)
5. `dashboard-ui.md` → adaptar para now-company UI
6. `automation-authoring.md` → `.aiox-core/standards/`
7. `vault-conventions.md` → manter em vault/CLAUDE.md, extrair para standards/ também

**Implementar:** `validate-skills.mjs` como CI gate para contratos SKILL.md

**Referência:** `/home/bychrisr/projects/learning/Agentic-OS/standards/`

---

## 5. Restrições Absolutas (NUNCA violar)

- Vault NÃO vai para o git — separação estrutural, não só `.gitignore`
- 14 áreas numeradas intocáveis — Roda da Vida é o mapa mental
- `00_inbox/` não vira arquivo diário monolítico
- `05_kpi/` e rituais de revisão intocáveis
- Áreas 🔒 (`07_journal/`, `08_health/`, `09_finance/`) — NUNCA indexar, NUNCA escrever sem instrução explícita
- Qualquer mudança estrutural no vault exige plano de migração antes de executar
- @devops é EXCLUSIVO para git push / gh pr create / MCP management

---

## 6. Priorização (P0 → P2)

| # | Iniciativa | Prioridade | Depende de | Esforço |
|---|---|---|---|---|
| 1 | Migration DB: `companies.kind` (personal/business) | **P0** | — | Baixo (~1h) |
| 2 | Vault fora do git + `VAULT_PATH` env var | **P0** | — | Baixo (~20min) |
| 3 | Vault indexer + schema SQLite/PG | **P0** | #2 | ~2h |
| 4 | Vault RAG (FTS + vector + graph + RRF) | **P0** | #3, Gemini runtime | ~3h |
| 5 | Multi-runtime (Gemini CLI + Antigravity) | **P0** | — | Médio |
| 6 | Role-based model assignment | **P0** | #5 | Médio |
| 7 | CLI sessions in-browser (node-pty + xterm.js) | **P1** | deploy model | Médio-alto |
| 8 | UI: Vault Browser + Ask Vault | **P1** | #3, #4 | Médio |
| 9 | UI: Lunar Planning | **P1** | #1 (personal company) | Médio |
| 10 | UI: KPI Dashboard | **P1** | #1 | Médio |
| 11 | Hierarquia agêntica 7 níveis (Organogram) | **P1** | #1, decisão squads | Alto |
| 12 | Standards + SKILL.md migration | **P1** | — | Médio |
| 13 | UI: Knowledge Graph | **P2** | #3 | Médio |
| 14 | UI: Focus Log + Life Areas | **P2** | #1 | Baixo |
| 15 | Cloudflare Tunnel + auth layer (acesso remoto) | **P2** | #7 | Médio |

---

## 7. Decisões Ainda Abertas (Orion deve propor solução)

1. **Deploy remoto:** Cloudflare Tunnel (PC precisa estar ligado) vs. VPS + Rclone Bisync (24/7, eventual consistency 5-15min). Impacta onde o node-pty roda.
2. **Auth layer:** token estático vs. magic link vs. OAuth para acesso mobile.
3. **Vault source of truth:** quando dashboard escreve no vault e Obsidian Sync também escreve (mobile), quem ganha em conflito?
4. **Squads ↔ agents reconciliação:** como xsquads (`/home/bychrisr/projects/work/squads-aios/`) se encaixam no formato `agents/<slug>.md` e na hierarquia de 7 níveis.
5. **Pente fino no now-company:** quais adapters/pacotes/features do PaperClip upstream remover sem impactar o que importa (Hermes, Codex, OpenClaw, `evals/`, `cli/`).

---

## 8. Referências e Paths

### Projeto base
- `now-company`: `/home/bychrisr/projects/work/now-company/`
- `brainOS-new` (fonte de componentes/lógica): `/home/bychrisr/projects/work/brainOS-new/`
- `Agentic-OS` (referência de specs/standards): `/home/bychrisr/projects/learning/Agentic-OS/`
- `squads-aios` (organogram): `/home/bychrisr/projects/work/squads-aios/`
- Vault Obsidian: `~/brainOS/`

### Arquivos de investigação (leia antes de planejar)
- `brainOS-new/docs/epics/research/inv-vault-rag.md` — indexer, schema, busca híbrida, adaptação
- `brainOS-new/docs/epics/research/inv-obsidian-api.md` — opções de acesso ao vault sem git
- `brainOS-new/docs/epics/research/inv-organogram.md` — hierarquia 7 níveis, squads, Mind Bank
- `brainOS-new/docs/epics/research/inv-now-company.md` — análise do fork PaperClip
- `brainOS-new/docs/epics/research/inv-now-company-schema.md` — schema DB completo, 87 tabelas
- `brainOS-new/docs/epics/research/inv-aiox-vs-agenticos.md` — overlap spec layer, lacunas, migração de formato
- `brainOS-new/docs/epics/epic-vault-evolution-synthesis.md` — síntese master de todas as iniciativas

### Código de referência no brainOS a portar
- `brainOS-new/dashboard/` — DS completo (páginas, componentes, design system)
- `brainOS-new/dashboard/lib/vault/` — lógica de vault (se existir)
- `brainOS-new/.aiox-core/` — AIOX framework completo
- `brainOS-new/.claude/skills/` — skills existentes

### Specs do Agentic-OS relevantes
- `Agentic-OS/specs/0007-gemini-second-runtime.md`
- `Agentic-OS/specs/0013-vault-rag-foundation.md`
- `Agentic-OS/specs/0030-antigravity-third-runtime.md`
- `Agentic-OS/specs/0033-role-based-model-assignment.md`
- `Agentic-OS/specs/0034-mission-epic-layer.md`
- `Agentic-OS/standards/skill-authoring.md`
- `Agentic-OS/standards/agent-authoring.md`
- `Agentic-OS/standards/agentic-workflow.md`
- `Agentic-OS/dashboard/lib/vault/indexer.ts` — implementação de referência do RAG
