# Débito Técnico: God Files no Domínio de Issues

**ID:** DEBT-002
**Data:** 2026-05-27
**Agente que Registrou:** @architect (Aria)
**Severidade:** Média
**Origem:** Análise graphify — Community 0 (462 nós, coesão 0.008)

## Título
God Files em `routes/issues.ts` e `services/issues.ts` emaranhando 7 subdomínios num único arquivo.

## Descrição

A análise do grafo de dependências (graphify) identificou que `Community 0` agrupa 462 nós com coesão de `0.008` (escala 0–1). A causa raiz não é mixing de domínios entre módulos separados — é a existência de **God Files** que cresceram organicamente incorporando responsabilidades de subdomínios distintos.

### Arquivos afetados

| Arquivo | Tamanho | Linhas |
|---------|---------|--------|
| `server/src/routes/issues.ts` | 219KB | 6.059 |
| `server/src/services/issues.ts` | — | 5.536 |

### Subdomínios misturados em `routes/issues.ts`

- **Issues CRUD** — criação, leitura, atualização, remoção (~linhas 3500–4500)
- **Interactions** — thread interactions, confirmações (~linhas 4968–5100) ← já tem `services/issue-thread-interactions.ts` próprio
- **Documents** — snapshots, annotations (~linhas 2800–3200)
- **Workspace** — execution workspace management (disperso)
- **Comments** — criação e leitura (disperso)
- **Attachments** — upload e listagem (disperso)
- **Annotations** — document annotations (~linhas 2600+)

### Observação sobre o diagnóstico do graphify

As funções destacadas pelo graphify como "emaranhadas" (`applyCreateIssueStatusDefault`, `hydrateInteraction`, `assertRequestConfirmationTargetIsCurrent`) estão, de fato, **nos arquivos corretos**. O clustering fraco de Community 0 é artefato do tamanho dos arquivos, não de acoplamento cross-módulo real.

O acoplamento real e endereçável: **rotas de interactions estão dentro de `routes/issues.ts`** apesar do serviço correspondente já existir de forma isolada em `services/issue-thread-interactions.ts`.

## Impacto

- **Manutenibilidade:** Arquivos de 6K+ linhas têm alto custo cognitivo de leitura e risco de conflitos em merge
- **Testabilidade:** Testes de interactions, documents e comments ficam misturados, dificultando isolamento
- **Onboarding:** Desenvolvedor novo não sabe onde procurar — tudo está em `issues.ts`
- **Future ownership:** Impossível atribuir ownership claro por subdomínio enquanto tudo estiver no mesmo arquivo

## Proposta de Resolução

### Fase 1 — Refactor puro (sem decisão de produto, baixo risco)

Extrair rotas de interactions para arquivo próprio:

```
server/src/routes/issues.ts          (mantém CRUD, comments, attachments)
server/src/routes/issue-interactions.ts  ← novo (~130 linhas de rotas)
```

O serviço `services/issue-thread-interactions.ts` já existe. É relocação de rotas, não redesenho de lógica.

**Critério de conclusão:** `/issues/:id/interactions` e rotas relacionadas vivem em `routes/issue-interactions.ts`. Testes passando. `routes/issues.ts` abaixo de 5.500 linhas.

### Fase 2 — Decisão estratégica (requer alinhamento de produto)

Responder antes de executar:

> **"Issues são uma entidade ou um bounded context?"**

Se Issues são um **bounded context**, os subdomínios Documents, Comments e Attachments merecem fronteiras próprias com ownership e deployment potencialmente independentes. Se são uma **entidade**, o split é estético e pode ser adiado indefinidamente.

Candidatos para Fase 2 (dependem da decisão acima):
- `routes/issue-documents.ts`
- `routes/issue-comments.ts`
- `routes/issue-attachments.ts`

## Contexto adicional

### Barrel export `packages/db/src/index.ts`

O graphify também identificou `packages/db/src/index.ts` como causa de conectividade artificial no grafo. O arquivo re-exporta todo o pacote DB, fazendo com que qualquer módulo que importe de `@paperclipai/db` apareça conectado a todos os outros. Isso não é um bug arquitetural grave, mas reduz a utilidade de análises de grafo futuras.

**Ação opcional:** Avaliar se imports específicos (`import { issues } from "@paperclipai/db/schema"`) são viáveis no longo prazo.

## Referências

- `graphify-out/GRAPH_REPORT.md` — seção Community 0
- `server/src/routes/issues.ts`
- `server/src/services/issues.ts`
- `server/src/services/issue-thread-interactions.ts`
