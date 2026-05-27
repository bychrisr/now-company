# Synkra AIOX Development Rules for Claude Code

You are working with Synkra AIOX, an AI-Orchestrated System for Full Stack Development.

<!-- AIOX-MANAGED-START: core-framework -->
## Core Framework Understanding

Synkra AIOX is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture.
<!-- AIOX-MANAGED-END: core-framework -->

<!-- AIOX-MANAGED-START: constitution -->
## Constitution

O AIOX possui uma **Constitution formal** com princípios inegociáveis e gates automáticos.

**Documento completo:** `.aiox-core/constitution.md`

**Princípios fundamentais:**

| Artigo | Princípio | Severidade |
|--------|-----------|------------|
| I | CLI First | NON-NEGOTIABLE |
| II | Agent Authority | NON-NEGOTIABLE |
| III | Story-Driven Development | MUST |
| IV | No Invention | MUST |
| V | Quality First | MUST |
| VI | Absolute Imports | SHOULD |

**Gates automáticos bloqueiam violações.** Consulte a Constitution para detalhes completos.
<!-- AIOX-MANAGED-END: constitution -->

<!-- AIOX-MANAGED-START: sistema-de-agentes -->
## Sistema de Agentes

### Ativação de Agentes
Use `@agent-name` ou `/AIOX:agents:agent-name`:

| Agente | Persona | Escopo Principal |
|--------|---------|------------------|
| `@dev` | Dex | Implementação de código |
| `@qa` | Quinn | Testes e qualidade |
| `@architect` | Aria | Arquitetura e design técnico |
| `@pm` | Morgan | Product Management |
| `@po` | Pax | Product Owner, stories/epics |
| `@sm` | River | Scrum Master |
| `@analyst` | Alex | Pesquisa e análise |
| `@data-engineer` | Dara | Database design |
| `@ux-design-expert` | Uma | UX/UI design |
| `@devops` | Gage | CI/CD, git push (EXCLUSIVO) |

### Comandos de Agentes
Use prefixo `*` para comandos:
- `*help` - Mostrar comandos disponíveis
- `*create-story` - Criar story de desenvolvimento
- `*task {name}` - Executar task específica
- `*exit` - Sair do modo agente
<!-- AIOX-MANAGED-END: sistema-de-agentes -->

<!-- AIOX-MANAGED-START: agent-system -->
## Agent System

### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst
- The master agent is activated with @aiox-master
- Agent commands use the * prefix: *help, *create-story, *task, *exit

### Agent Context
When an agent is active:
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Maintain the agent's perspective throughout the interaction
<!-- AIOX-MANAGED-END: agent-system -->

## Metodologia de Desenvolvimento

### Story-Driven Development (Desenvolvimento Guiado por Histórias)
1. **Trabalhe a partir de Stories** - Todo desenvolvimento começa com uma história em `docs/stories/`.
2. **Atualize o progresso** - Marque os checkboxes conforme as tarefas são concluídas: `[ ]` → `[x]`.
3. **Monitore alterações** - Mantenha a seção de "File List" atualizada no arquivo da story.
4. **Respeite os critérios** - Implemente exatamente o que os critérios de aceitação especificam, sem inventar features.

### Padrões de Código
- Escreva código limpo, legível e auto-documentado.
- Siga os padrões arquiteturais existentes na base de código do Paperclip.
- Inclua tratamento de erro robusto (nunca deixe blocos catch vazios).
- Adicione testes unitários/funcionais para novas implementações.
- Use TypeScript estrito (evitar `any` sem justificativa forte, preferir `unknown` + type guards).
- Linguagem dos comentários: PT-BR (explicando sempre o **porquê**, não apenas o que o código faz).

### Requisitos de Teste e Validação
- Sempre execute os testes antes de considerar uma tarefa como concluída.
- Comando de verificação de tokens: `pnpm run check:tokens`
- Comando de type checking: `pnpm run typecheck`
- Comando de execução de testes: `pnpm run test`
- Sempre verifique se o build passa limpo: `pnpm run build`

<!-- AIOX-MANAGED-START: framework-structure -->
## AIOX Framework Structure

```
aiox-core/
├── agents/         # Agent persona definitions (YAML/Markdown)
├── tasks/          # Executable task workflows
├── workflows/      # Multi-step workflow definitions
├── templates/      # Document and code templates
├── checklists/     # Validation and review checklists
└── rules/          # Framework rules and patterns

docs/
├── stories/        # Development stories (numbered)
├── prd/            # Product requirement documents
├── architecture/   # System architecture documentation
└── guides/         # User and developer guides
```
<!-- AIOX-MANAGED-END: framework-structure -->

<!-- AIOX-MANAGED-START: framework-boundary -->
## Framework vs Project Boundary

O AIOX usa um modelo de 4 camadas (L1-L4) para separar artefatos do framework e do projeto. Deny rules em `.claude/settings.json` reforçam isso deterministicamente.

| Camada | Mutabilidade | Paths | Notas |
|--------|-------------|-------|-------|
| **L1** Framework Core | NEVER modify | `.aiox-core/core/`, `.aiox-core/constitution.md`, `bin/aiox.js`, `bin/aiox-init.js` | Protegido por deny rules |
| **L2** Framework Templates | NEVER modify | `.aiox-core/development/tasks/`, `.aiox-core/development/templates/`, `.aiox-core/development/checklists/`, `.aiox-core/development/workflows/`, `.aiox-core/infrastructure/` | Extend-only |
| **L3** Project Config | Mutable (exceptions) | `.aiox-core/data/`, `agents/*/MEMORY.md`, `core-config.yaml` | Allow rules permitem |
| **L4** Project Runtime | ALWAYS modify | `docs/stories/`, `packages/`, `squads/`, `tests/` | Trabalho do projeto |

**Toggle:** `core-config.yaml` → `boundary.frameworkProtection: true/false` controla se deny rules são ativas (default: true para projetos, false para contribuidores do framework).

> **Referência formal:** `.claude/settings.json` (deny/allow rules), `.claude/rules/agent-authority.md`
<!-- AIOX-MANAGED-END: framework-boundary -->

<!-- AIOX-MANAGED-START: rules-system -->
## Rules System

O AIOX carrega regras contextuais de `.claude/rules/` automaticamente. Regras com frontmatter `paths:` só carregam quando arquivos correspondentes são editados.

| Rule File | Description |
|-----------|-------------|
| `agent-authority.md` | Agent delegation matrix and exclusive operations |
| `agent-handoff.md` | Agent switch compaction protocol for context optimization |
| `agent-memory-imports.md` | Agent memory lifecycle and CLAUDE.md ownership |
| `coderabbit-integration.md` | Automated code review integration rules |
| `ids-principles.md` | Incremental Development System principles |
| `mcp-usage.md` | MCP server usage rules and tool selection priority |
| `story-lifecycle.md` | Story status transitions and quality gates |
| `workflow-execution.md` | 4 primary workflows (SDC, QA Loop, Spec Pipeline, Brownfield) |

> **Diretório:** `.claude/rules/` — rules são carregadas automaticamente pelo Claude Code quando relevantes.
<!-- AIOX-MANAGED-END: rules-system -->

<!-- AIOX-MANAGED-START: code-intelligence -->
## Code Intelligence

O AIOX possui um sistema de code intelligence opcional que enriquece operações com dados de análise de código.

| Status | Descrição | Comportamento |
|--------|-----------|---------------|
| **Configured** | Provider ativo e funcional | Enrichment completo disponível |
| **Fallback** | Provider indisponível | Sistema opera normalmente sem enrichment — graceful degradation |
| **Disabled** | Nenhum provider configurado | Funcionalidade de code-intel ignorada silenciosamente |

**Graceful Fallback:** Code intelligence é sempre opcional. `isCodeIntelAvailable()` verifica disponibilidade antes de qualquer operação. Se indisponível, o sistema retorna o resultado base sem modificação — nunca falha.

**Diagnóstico:** `aiox doctor` inclui check de code-intel provider status.

> **Referência:** `.aiox-core/core/code-intel/` — provider interface, enricher, client
<!-- AIOX-MANAGED-END: code-intelligence -->

<!-- AIOX-MANAGED-START: graph-dashboard -->
## Graph Dashboard

O CLI `aiox graph` visualiza dependências, estatísticas de entidades e status de providers.

### Comandos

```bash
aiox graph --deps                        # Dependency tree (ASCII)
aiox graph --deps --format=json          # Output como JSON
aiox graph --deps --format=html          # Interactive HTML (abre browser)
aiox graph --deps --format=mermaid       # Mermaid diagram
aiox graph --deps --format=dot           # DOT format (Graphviz)
aiox graph --deps --watch                # Live mode com auto-refresh
aiox graph --deps --watch --interval=10  # Refresh a cada 10 segundos
aiox graph --stats                       # Entity stats e cache metrics
```

**Formatos de saída:** ascii (default), json, dot, mermaid, html

> **Referência:** `.aiox-core/core/graph-dashboard/` — CLI, renderers, data sources
<!-- AIOX-MANAGED-END: graph-dashboard -->

## Execução de Workflows e Boas Práticas

### Padrão de Execução de Tarefas
1. Leia a definição completa da tarefa/workflow antes de começar.
2. Identifique todos os pontos de eliciação (perguntas ao usuário).
3. Execute os passos de forma sequencial.
4. Trate os erros de forma proativa (nunca ignore falhas).
5. Forneça feedback claro e evidências reais (git diff, testes passing).

### Convenções de Git e Integração
- Branches: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`.
- Commits: Sempre em inglês (EN), Conventional Commits (ex: `feat(server): add ide detection [Story 2.1]`), curtos (≤72 caracteres), atômicos e focados.
- Nunca faça `push --force` ou envie secrets para o repositório remoto.

---

## MCP Pipeline — Uso Proativo

Sempre use os servidores MCP integrados ANTES de responder com base em memória. O custo de pesquisa é zero; o custo de uma resposta imprecisa é o retrabalho.

### Servidores MCP Disponíveis no Ambiente

| Serviço | Porta / Endpoint | Finalidade Principal | Quando Usar |
|---|---|---|---|
| **probe** | `:8200/sse` | Busca semântica AST | Localizar trechos de código, lógica de funções e arquivos relevantes. |
| **tavily** | `:8300/sse` | Busca na Web | Validar APIs externas, pesquisar erros de runtime e novas specs. |
| **codebase-memory** | `:8400/sse` | Grafo de dependências | Entender a arquitetura geral do projeto e interdependências. |
| **memory-wrapper** | `:8599/mcp` | Memória de decisões | Buscar precedentes arquiteturais e salvar decisões da sessão. |
| **serena** | `:9121/sse` | LSP & Análise estática | Localizar definições de tipos, referências, diagnosticar erros de digitação. |
| **docker-gateway** | `:8080/sse` | Gateway Docker | Acesso seguro e isolado a ferramentas e execução dentro de containers. |

### Fluxo de Reconhecimento do Projeto
```
1. codebase-memory ──> Entender o mapa de dependências e arquitetura de pastas.
2. probe ───────────> Localizar onde está implementada a lógica específica.
3. serena ──────────> Analisar os tipos TypeScript, referências cruzadas e assinaturas de funções.
```

### Anti-Padrões
- ❌ Nunca afirme onde está ou o que faz um arquivo sem ler seu conteúdo ou usar o `probe`.
- ❌ Nunca chute a solução de um erro de dependência ou runtime sem pesquisar via `tavily` primeiro.
- ❌ Nunca faça refatorações cegas sem consultar as referências por `serena`.
- ❌ Nunca esqueça de salvar padrões arquiteturais novos no `memory-wrapper`.


<!-- AIOX-MANAGED-START: aiox-patterns -->
## AIOX-Specific Patterns

### Working with Templates
```javascript
const template = await loadTemplate('template-name');
const rendered = await renderTemplate(template, context);
```

### Agent Command Handling
```javascript
if (command.startsWith('*')) {
  const agentCommand = command.substring(1);
  await executeAgentCommand(agentCommand, args);
}
```

### Story Updates
```javascript
// Update story progress
const story = await loadStory(storyId);
story.updateTask(taskId, { status: 'completed' });
await story.save();
```
<!-- AIOX-MANAGED-END: aiox-patterns -->

## Configuração do Ambiente

### Ferramentas Requeridas
- Node.js >=20
- GitHub CLI
- Git
- pnpm (gerenciador de pacotes padrão)

### Arquivos de Configuração
- `.aiox/config.yaml` - Configuração do framework AIOX
- `.env` - Variáveis de ambiente locais
- `aiox.config.js` - Configurações específicas do projeto

<!-- AIOX-MANAGED-START: common-commands -->
## Common Commands

### AIOX Master Commands
- `*help` - Show available commands
- `*create-story` - Create new story
- `*task {name}` - Execute specific task
- `*workflow {name}` - Run workflow

### Development Commands
- `npm run dev` - Start development
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run build` - Build project
<!-- AIOX-MANAGED-END: common-commands -->

## Depuração e Logs

### Ativar Modo Debug do AIOX
```bash
export AIOX_DEBUG=true
```

### Visualizar Logs de Agentes
```bash
tail -f .aiox/logs/agent.log
```

### Rastrear Execução de Workflows
```bash
pnpm run trace -- workflow-name
```

---

## Comportamento do Claude Code (Regras Locais)

### 1. Estilo de Resposta e Comunicação
- **Responda sempre em Português do Brasil (PT-BR)**, exceto para código, commits e comandos (EN).
- **Sem disclaimers, desculpas ou conversas fiadas.** Seja direto ao ponto.
- **Máximo 3 opções:** Ao apresentar escolhas ou propor caminhos de solução, restrinja a lista a no máximo 3 opções claras para facilitar a tomada de decisão rápida.

### 2. Governança e Segurança (Sem YOLO Mode)
- **NUNCA execute ações destrutivas ou alterações estruturais complexas autonomamente (sem YOLO).** Sempre valide o plano com o usuário antes de prosseguir.
- **Git Branch Warning:** Se a branch ativa for `main` ou `master`, alerte o usuário imediatamente antes de fazer alterações de código ou tentar commits locais.
- **Commits Incrementais:** Realize commits pequenos e focados ao concluir pequenas partes do trabalho (Conventional Commits em EN, ex: `feat(db): update schema`).

### 3. Hooks Locais Ativos
O projeto possui hooks automáticos configurados em `.claude/hooks/` e registrados em `.claude/settings.local.json`:
- `SessionStart.sh`: Executado no início da sessão para validar a branch Git, o status do grafo de conhecimento (Graphify) e dependências (`node_modules`).
- `PreCompact.sh`: Executado antes do Claude compactar o histórico de mensagens, salvando o estado atual em `.claude/session_state.json`.
- `PostToolUse.sh`: Executado após o uso de ferramentas de escrita/edição para fazer auto-commit de arquivos quando ativado via flag `.claude/auto-commit` ou variável `CLAUDE_AUTO_COMMIT=true`.

---
*Synkra AIOX & Paperclip Claude Code Configuration v4.0.0*
