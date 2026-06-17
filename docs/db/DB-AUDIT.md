# DB-AUDIT.md — Auditoria de Débitos Técnicos

> **Projeto:** now-company (fork Paperclip AI)
> **Schema base:** migration `0097_serious_inhumans` | **Total tabelas analisadas:** 97
> **Stack:** Drizzle ORM + PostgreSQL (PGlite dev) | `packages/db/src/schema/`
> **Gerado em:** 2026-06-17 | **Autor:** @data-engineer (Dara)

---

## Índice

1. [Inventário de Débitos Técnicos](#1-inventário-de-débitos-técnicos)
2. [Lacunas para o Vault Obsidian](#2-lacunas-para-o-vault-obsidian)
3. [Recomendações para Migration 0098+](#3-recomendações-para-migration-0098)
4. [Quick Wins — Top 5 prioridades](#4-quick-wins--top-5-prioridades)

---

## 1. Inventário de Débitos Técnicos

> **Total de débitos identificados: 38**

### 1.1 FKs ausentes em campos `user_id` (text sem referência a `user.id`)

| ID | Tabela | Coluna | Débito | Severidade | Esforço | Prioridade |
|----|--------|--------|--------|------------|---------|------------|
| D01 | `instance_user_roles` | `user_id` | `text NOT NULL` sem FK → `user.id` — risco de registros órfãos em cascata de deleção | 🔴 Alto | Baixo | P1 |
| D02 | `issues` | `assignee_user_id` | `text` sem FK → `user.id` — usuário deletado permanece referenciado | 🔴 Alto | Baixo | P1 |
| D03 | `issues` | `created_by_user_id` | `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D04 | `approvals` | `decided_by_user_id` | `text` sem FK → `user.id` — decisões de governança sem rastreabilidade garantida | 🔴 Alto | Baixo | P1 |
| D05 | `companies` | `feedback_data_sharing_consent_by_user_id` | `text` sem FK → `user.id` — dado de consentimento LGPD sem integridade referencial | 🔴 Alto | Baixo | P1 |
| D06 | `company_user_sidebar_preferences` | `user_id` | `text` sem FK → `user.id` | 🟢 Baixo | Baixo | P3 |
| D07 | `user_sidebar_preferences` | `user_id` | `text` sem FK → `user.id` | 🟢 Baixo | Baixo | P3 |
| D08 | `invites` | `invited_by_user_id` | `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D09 | `project_memberships` | `user_id` | `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D10 | `agent_memberships` | `user_id` | `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D11 | `routines` | `created_by_user_id`, `updated_by_user_id` | Dois campos `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D12 | `routine_triggers` | `created_by_user_id`, `updated_by_user_id` | Dois campos `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |
| D13 | `routine_revisions` | `created_by_user_id` | `text` sem FK → `user.id` | 🟡 Médio | Baixo | P2 |

### 1.2 FKs de UUIDs sem referência declarada

| ID | Tabela | Coluna | Débito | Severidade | Esforço | Prioridade |
|----|--------|--------|--------|------------|---------|------------|
| D14 | `agent_runtime_state` | `last_run_id` | `uuid` sem FK → `heartbeat_runs.id` — estado stale sem validação | 🔴 Alto | Médio | P1 |
| D15 | `routines` | `latest_revision_id` | `uuid` sem FK → `routine_revisions.id` — circular ref intencional mas sem constraint | 🟡 Médio | Médio | P2 |
| D16 | `documents` | `latest_revision_id` | `uuid` sem FK → `document_revisions.id` — mesmo padrão de D15 | 🟡 Médio | Médio | P2 |
| D17 | `agent_config_revisions` | `rolled_back_from_revision_id` | `uuid` sem FK self-referência → `agent_config_revisions.id` | 🟡 Médio | Médio | P2 |
| D18 | `agent_wakeup_requests` | `run_id` | `uuid` sem FK → `heartbeat_runs.id` | 🟡 Médio | Baixo | P2 |
| D19 | `routine_runs` | `coalesced_into_run_id` | `uuid` sem FK self-referência → `routine_runs.id` | 🟡 Médio | Baixo | P2 |

### 1.3 Colunas ausentes — `updated_at` e inconsistências de timestamps

| ID | Tabela | Débito | Severidade | Esforço | Prioridade |
|----|--------|--------|------------|---------|------------|
| D20 | `heartbeat_run_events` | Sem `updated_at` — append-only com bigserial, correto, mas falta comentário no schema documentando a exceção intencional | 🟢 Baixo | Baixo | P3 |
| D21 | `secret_access_events` | Auditoria imutável sem `updated_at` — aceitável, mas deve ser documentado como exceção | 🟢 Baixo | Baixo | P3 |
| D22 | `cost_events` | Sem `updated_at` — eventos financeiros imutáveis, mas sem comentário explícito no schema | 🟢 Baixo | Baixo | P3 |
| D23 | `routine_revisions` | Snapshots imutáveis sem `updated_at` — correto para histórico, falta doc | 🟢 Baixo | Baixo | P3 |
| D24 | `plugins` | Tem `installed_at` mas sem `created_at` — assimetria de naming vs padrão do projeto inteiro | 🟡 Médio | Baixo | P2 |

### 1.4 Soft delete inconsistente

| ID | Tabela | Estratégia atual | Problema | Severidade | Esforço | Prioridade |
|----|--------|-----------------|----------|------------|---------|------------|
| D25 | `companies` | `status='paused'` como pseudo-soft-delete | Sem `deleted_at` formal — não permite distinguir empresa pausada de excluída; filtros de listagem ficam ambíguos | 🔴 Alto | Médio | P1 |
| D26 | `company_secrets` | `deleted_at` timestamp ✅ | Referência correta — demais tabelas do domínio deveriam seguir este modelo | — | — | — |
| D27 | `board_api_keys` | `revoked_at` | Semântica diferente de soft delete — chave revogada ≠ chave excluída; sem `deleted_at` | 🟡 Médio | Baixo | P2 |
| D28 | `issues` | `hidden_at` como soft delete parcial | Campo `hidden_at` cumpre papel de soft delete sem semântica clara; falta `deleted_at` ou documentação de invariante | 🟡 Médio | Médio | P2 |

### 1.5 Campos de `companies` ausentes (blockers de features)

| ID | Tabela | Coluna | Débito | Severidade | Esforço | Prioridade |
|----|--------|--------|--------|------------|---------|------------|
| D29 | `companies` | `kind` | Discriminador `personal`/`business` ausente — impossível distinguir company pessoal de workspace de time | 🔴 Alto | Baixo | **P0** |
| D30 | `companies` | `owner_user_id` | FK para `user.id` ausente — companies pessoais precisam de dono explícito para controle de acesso e billing | 🔴 Alto | Baixo | **P0** |

### 1.6 Índices ausentes em colunas de alta frequência

| ID | Tabela | Coluna sem índice | Impacto | Severidade | Esforço | Prioridade |
|----|--------|------------------|---------|------------|---------|------------|
| D31 | `user` | `email` — sem índice único | Auth lookup sem índice — vulnerável a e-mails duplicados e full seq scan | 🔴 Alto | Baixo | P1 |
| D32 | `projects` | Sem índice `(company_id, status)` | Listagem de projetos por status faz seq scan em tabelas grandes | 🟡 Médio | Baixo | P2 |
| D33 | `goals` | Sem índice `(company_id, status)` | Mesma situação de D32 para goals | 🟡 Médio | Baixo | P2 |
| D34 | `approval_comments` | Sem índice compound `(approval_id, created_at)` | Paginação de comentários faz sort sem índice em volume alto | 🟢 Baixo | Baixo | P3 |

### 1.7 Outros débitos identificados

| ID | Tabela | Débito | Severidade | Esforço | Prioridade |
|----|--------|--------|------------|---------|------------|
| D35 | `verification` | `created_at` e `updated_at` são **nullable** — inconsistente com todos os outros `created_at NOT NULL` do schema | 🟡 Médio | Baixo | P2 |
| D36 | `account` | Tokens OAuth (`access_token`, `refresh_token`, `id_token`) em plaintext — sem constraint ou flag de criptografia no schema | 🔴 Alto | Alto | P1 |
| D37 | `plugins` | `installed_at` ao invés de `created_at` — quebra padrão de naming; dificulta queries genéricas e auditoria | 🟡 Médio | Baixo | P2 |
| D38 | `cloud_upstream_connections` | Armazena chaves privadas e tokens em plaintext — sem indicação de criptografia no schema (comentário ou campo `is_encrypted`) | 🔴 Alto | Alto | P1 |

---

**Resumo por severidade:**

| Severidade | Quantidade |
|------------|------------|
| 🔴 Alto | 12 |
| 🟡 Médio | 17 |
| 🟢 Baixo | 9 |
| **Total** | **38** |

> **Nota:** IDs D01–D38 identificam cada débito individualmente. Alguns IDs cobrem dois campos da mesma tabela (ex: D11 cobre `created_by_user_id` + `updated_by_user_id` em `routines`).

---

## 2. Lacunas para o Vault Obsidian

O schema atual **não possui nenhuma tabela** de suporte a Vault Obsidian. As três tabelas abaixo cobrem os três pilares necessários:

1. **`vault_notes`** — metadados dos arquivos `.md` sincronizados
2. **`vault_chunks`** — fragmentos semânticos para RAG com embeddings vetoriais
3. **`vault_links`** — grafo de wikilinks entre notas

### 2.1 `vault_notes` — Metadados de notas Markdown

**Propósito:** Armazenar metadados e conteúdo bruto de cada arquivo `.md` do vault. Indexado para full-text search e rastreamento de estado de embedding.

| Coluna | Tipo | Constraints | Observações |
|--------|------|-------------|-------------|
| `id` | uuid | PK DEFAULT random | — |
| `company_id` | uuid | NOT NULL → `companies.id` ON DELETE CASCADE | Vault é scoped à company |
| `vault_path` | text | NOT NULL | Caminho relativo dentro do vault (ex: `projects/sprint-3.md`) |
| `title` | text | NOT NULL | Título extraído do frontmatter ou H1 |
| `frontmatter` | jsonb | nullable | Metadados YAML do frontmatter |
| `raw_content` | text | NOT NULL | Conteúdo bruto do arquivo .md |
| `content_hash` | text | NOT NULL | SHA-256 do `raw_content` — detecta mudanças |
| `file_size_bytes` | integer | NOT NULL DEFAULT 0 | — |
| `source_modified_at` | timestamp+tz | NOT NULL | `mtime` do arquivo no sistema de arquivos |
| `last_indexed_at` | timestamp+tz | NOT NULL | Última vez que foi processado pelo indexer |
| `embedding_status` | text | NOT NULL DEFAULT 'pending' | `pending` / `processing` / `done` / `error` |
| `embedding_error` | text | nullable | Mensagem de erro do embedding |
| `deleted_at` | timestamp+tz | nullable | Soft delete — arquivo removido do vault |
| `created_at` | timestamp+tz | NOT NULL DEFAULT now() | — |
| `updated_at` | timestamp+tz | NOT NULL DEFAULT now() | — |

**Índices recomendados:**
- UNIQUE parcial em `(company_id, vault_path)` WHERE `deleted_at IS NULL` — garante unicidade de arquivo ativo por vault
- `(company_id, embedding_status)` WHERE `deleted_at IS NULL` — fila de processamento
- GIN trigram em `title` e `raw_content` — full-text search (requer `pg_trgm`, já presente via migration 0080)

---

### 2.2 `vault_chunks` — Chunks para RAG/Embedding

**Propósito:** Armazenar fragmentos semânticos de cada nota com vetor de embedding para busca por similaridade via `pgvector`.

| Coluna | Tipo | Constraints | Observações |
|--------|------|-------------|-------------|
| `id` | uuid | PK DEFAULT random | — |
| `company_id` | uuid | NOT NULL → `companies.id` ON DELETE CASCADE | — |
| `note_id` | uuid | NOT NULL → `vault_notes.id` ON DELETE CASCADE | Nota de origem |
| `chunk_index` | integer | NOT NULL | Ordem do chunk dentro da nota (0-based) |
| `chunk_text` | text | NOT NULL | Texto do fragmento (~512 tokens) |
| `char_start` | integer | NOT NULL | Offset de início no `raw_content` da nota |
| `char_end` | integer | NOT NULL | Offset de fim no `raw_content` |
| `heading_path` | text | nullable | Contexto de headings (ex: `## Intro > ### Objetivo`) |
| `embedding` | vector(1536) | nullable | Vetor de embedding (OpenAI text-embedding-ada-002 ou similar) |
| `embedding_model` | text | nullable | Identificador do modelo usado |
| `embedding_generated_at` | timestamp+tz | nullable | Quando o embedding foi gerado |
| `token_count` | integer | NOT NULL DEFAULT 0 | Contagem aproximada de tokens |
| `created_at` | timestamp+tz | NOT NULL DEFAULT now() | — |
| `updated_at` | timestamp+tz | NOT NULL DEFAULT now() | — |

**Índices recomendados:**
- UNIQUE em `(note_id, chunk_index)` — garante unicidade de chunk por nota
- `(company_id, note_id)` — busca de chunks por nota
- HNSW em `embedding vector_cosine_ops` — busca ANN por similaridade (requer `pgvector >= 0.5.0`)

> ⚠️ **Dependência:** Requer extensão `pgvector`. PGlite suporta via `@electric-sql/pglite/vector`.

---

### 2.3 `vault_links` — Grafo de Wikilinks

**Propósito:** Representar o grafo de referências entre notas (wikilinks `[[nota]]`, aliases e embeds `![[imagem]]`).

| Coluna | Tipo | Constraints | Observações |
|--------|------|-------------|-------------|
| `id` | uuid | PK DEFAULT random | — |
| `company_id` | uuid | NOT NULL → `companies.id` ON DELETE CASCADE | — |
| `source_note_id` | uuid | NOT NULL → `vault_notes.id` ON DELETE CASCADE | Nota que contém o link |
| `target_note_id` | uuid | nullable → `vault_notes.id` ON DELETE SET NULL | Nota destino (null = link quebrado) |
| `target_raw` | text | NOT NULL | Texto bruto do link (ex: `Sprint Planning`) |
| `target_alias` | text | nullable | Alias exibido (ex: `[[Sprint Planning\|Planning]]` → `Planning`) |
| `link_kind` | text | NOT NULL DEFAULT 'wiki' | `wiki` / `embed` / `block_ref` / `external` |
| `context_snippet` | text | nullable | Trecho de contexto ao redor do link (±50 chars) |
| `line_number` | integer | nullable | Linha onde o link aparece no arquivo |
| `is_broken` | boolean | NOT NULL DEFAULT false | `true` quando nota destino não existe no vault |
| `created_at` | timestamp+tz | NOT NULL DEFAULT now() | — |
| `updated_at` | timestamp+tz | NOT NULL DEFAULT now() | — |

**Índices recomendados:**
- UNIQUE em `(source_note_id, target_raw, line_number)` — evita links duplicados na mesma linha
- `(company_id, source_note_id)` — forward links de uma nota
- `(company_id, target_note_id)` — backlinks de uma nota (grafo inverso)
- Partial index `(company_id, is_broken)` WHERE `is_broken = true` — relatório de links quebrados

---

## 3. Recomendações para Migration 0098+

> ⚠️ **ATENÇÃO:** Os blocos SQL abaixo são **comentados e não-executáveis**. São referência para criação das migrations via `pnpm db:generate` após edição dos schemas Drizzle. Nunca editar o SQL gerado manualmente.

### Migration 0098 — `companies`: Adicionar `kind` e `owner_user_id`

```sql
-- Migration: 0098_companies_kind_owner.sql
-- Arquivo Drizzle: packages/db/src/schema/companies.ts

-- Passo 1: Discriminador de tipo de company
-- ALTER TABLE "companies"
--   ADD COLUMN "kind" text NOT NULL DEFAULT 'business';

-- Passo 2: Dono da company pessoal (nullable — companies de time não têm owner individual)
-- ALTER TABLE "companies"
--   ADD COLUMN "owner_user_id" text;

-- Passo 3: Constraint FK para owner_user_id
-- ALTER TABLE "companies"
--   ADD CONSTRAINT "companies_owner_user_id_user_id_fk"
--   FOREIGN KEY ("owner_user_id")
--   REFERENCES "public"."user"("id")
--   ON DELETE SET NULL ON UPDATE NO ACTION;

-- Passo 4: Índice parcial — cada usuário tem no máximo 1 company pessoal
-- CREATE UNIQUE INDEX "companies_owner_user_personal_uq"
--   ON "companies" ("owner_user_id")
--   WHERE "kind" = 'personal';

-- Passo 5: Índice para listagem por kind
-- CREATE INDEX "companies_kind_idx"
--   ON "companies" ("kind");
```

**Schema Drizzle correspondente (adicionar em `companies.ts`):**
```typescript
// Adicionar nas colunas de companies (após updatedAt):
kind: text("kind").notNull().default("business"),
ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
```

---

### Migration 0099 — `user.email`: Índice único

```sql
-- Migration: 0099_user_email_unique_idx.sql
-- Previne duplicação de e-mails (débito D31)

-- Verificar duplicatas ANTES de aplicar em produção:
-- SELECT email, COUNT(*) FROM "user" GROUP BY email HAVING COUNT(*) > 1;

-- Criar índice único:
-- CREATE UNIQUE INDEX "user_email_uq"
--   ON "user" ("email");
```

---

### Migration 0100 — Criar `vault_notes`

```sql
-- Migration: 0100_vault_notes.sql
-- Requer: pg_trgm já habilitado via migration 0080

-- CREATE TABLE "vault_notes" (
--   "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
--   "company_id"          uuid NOT NULL,
--   "vault_path"          text NOT NULL,
--   "title"               text NOT NULL,
--   "frontmatter"         jsonb,
--   "raw_content"         text NOT NULL,
--   "content_hash"        text NOT NULL,
--   "file_size_bytes"     integer NOT NULL DEFAULT 0,
--   "source_modified_at"  timestamp with time zone NOT NULL,
--   "last_indexed_at"     timestamp with time zone NOT NULL,
--   "embedding_status"    text NOT NULL DEFAULT 'pending',
--   "embedding_error"     text,
--   "deleted_at"          timestamp with time zone,
--   "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
--   "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
-- );

-- ALTER TABLE "vault_notes"
--   ADD CONSTRAINT "vault_notes_company_id_companies_id_fk"
--   FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- CREATE UNIQUE INDEX "vault_notes_company_path_uq"
--   ON "vault_notes" ("company_id", "vault_path")
--   WHERE "deleted_at" IS NULL;

-- CREATE INDEX "vault_notes_company_embedding_status_idx"
--   ON "vault_notes" ("company_id", "embedding_status")
--   WHERE "deleted_at" IS NULL;

-- CREATE INDEX "vault_notes_title_search_idx"
--   ON "vault_notes" USING gin ("title" gin_trgm_ops);

-- CREATE INDEX "vault_notes_content_search_idx"
--   ON "vault_notes" USING gin ("raw_content" gin_trgm_ops);
```

---

### Migration 0101 — Criar `vault_chunks`

```sql
-- Migration: 0101_vault_chunks.sql
-- Requer: vault_notes (migration 0100) + extensão pgvector

-- Habilitar extensão (se não estiver ativa):
-- CREATE EXTENSION IF NOT EXISTS vector;

-- CREATE TABLE "vault_chunks" (
--   "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
--   "company_id"               uuid NOT NULL,
--   "note_id"                  uuid NOT NULL,
--   "chunk_index"              integer NOT NULL,
--   "chunk_text"               text NOT NULL,
--   "char_start"               integer NOT NULL,
--   "char_end"                 integer NOT NULL,
--   "heading_path"             text,
--   "embedding"                vector(1536),
--   "embedding_model"          text,
--   "embedding_generated_at"   timestamp with time zone,
--   "token_count"              integer NOT NULL DEFAULT 0,
--   "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
--   "updated_at"               timestamp with time zone DEFAULT now() NOT NULL
-- );

-- ALTER TABLE "vault_chunks"
--   ADD CONSTRAINT "vault_chunks_company_id_companies_id_fk"
--   FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- ALTER TABLE "vault_chunks"
--   ADD CONSTRAINT "vault_chunks_note_id_vault_notes_id_fk"
--   FOREIGN KEY ("note_id") REFERENCES "public"."vault_notes"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- CREATE UNIQUE INDEX "vault_chunks_note_chunk_uq"
--   ON "vault_chunks" ("note_id", "chunk_index");

-- CREATE INDEX "vault_chunks_company_note_idx"
--   ON "vault_chunks" ("company_id", "note_id");

-- Índice HNSW para busca ANN (requer pgvector >= 0.5.0):
-- CREATE INDEX "vault_chunks_embedding_hnsw_idx"
--   ON "vault_chunks" USING hnsw ("embedding" vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
```

---

### Migration 0102 — Criar `vault_links`

```sql
-- Migration: 0102_vault_links.sql
-- Requer: vault_notes (migration 0100)

-- CREATE TABLE "vault_links" (
--   "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
--   "company_id"       uuid NOT NULL,
--   "source_note_id"   uuid NOT NULL,
--   "target_note_id"   uuid,
--   "target_raw"       text NOT NULL,
--   "target_alias"     text,
--   "link_kind"        text NOT NULL DEFAULT 'wiki',
--   "context_snippet"  text,
--   "line_number"      integer,
--   "is_broken"        boolean NOT NULL DEFAULT false,
--   "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
--   "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
-- );

-- ALTER TABLE "vault_links"
--   ADD CONSTRAINT "vault_links_company_id_companies_id_fk"
--   FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- ALTER TABLE "vault_links"
--   ADD CONSTRAINT "vault_links_source_note_id_vault_notes_id_fk"
--   FOREIGN KEY ("source_note_id") REFERENCES "public"."vault_notes"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- ALTER TABLE "vault_links"
--   ADD CONSTRAINT "vault_links_target_note_id_vault_notes_id_fk"
--   FOREIGN KEY ("target_note_id") REFERENCES "public"."vault_notes"("id")
--   ON DELETE SET NULL ON UPDATE NO ACTION;

-- CREATE INDEX "vault_links_company_source_idx"
--   ON "vault_links" ("company_id", "source_note_id");

-- CREATE INDEX "vault_links_company_target_idx"
--   ON "vault_links" ("company_id", "target_note_id");

-- CREATE INDEX "vault_links_broken_idx"
--   ON "vault_links" ("company_id", "is_broken")
--   WHERE "is_broken" = true;

-- CREATE UNIQUE INDEX "vault_links_source_target_raw_line_uq"
--   ON "vault_links" ("source_note_id", "target_raw", "line_number");
```

---

### Migration 0103 — FKs críticas de `user_id` e `last_run_id`

```sql
-- Migration: 0103_critical_fk_fixes.sql
-- Resolve D01, D04, D05, D14

-- D01: instance_user_roles.user_id → user.id
-- ALTER TABLE "instance_user_roles"
--   ADD CONSTRAINT "instance_user_roles_user_id_user_id_fk"
--   FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
--   ON DELETE CASCADE ON UPDATE NO ACTION;

-- D04: approvals.decided_by_user_id → user.id
-- ALTER TABLE "approvals"
--   ADD CONSTRAINT "approvals_decided_by_user_id_user_id_fk"
--   FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id")
--   ON DELETE SET NULL ON UPDATE NO ACTION;

-- D05: companies.feedback_data_sharing_consent_by_user_id → user.id
-- ALTER TABLE "companies"
--   ADD CONSTRAINT "companies_feedback_consent_user_id_user_id_fk"
--   FOREIGN KEY ("feedback_data_sharing_consent_by_user_id") REFERENCES "public"."user"("id")
--   ON DELETE SET NULL ON UPDATE NO ACTION;

-- D14: agent_runtime_state.last_run_id → heartbeat_runs.id
-- ALTER TABLE "agent_runtime_state"
--   ADD CONSTRAINT "agent_runtime_state_last_run_id_heartbeat_runs_id_fk"
--   FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id")
--   ON DELETE SET NULL ON UPDATE NO ACTION;
```

---

### Migration 0104 — Índices compound ausentes

```sql
-- Migration: 0104_missing_compound_indexes.sql
-- Resolve D32, D33

-- D32: projects — índice compound (company_id, status)
-- CREATE INDEX "projects_company_status_idx"
--   ON "projects" ("company_id", "status");

-- D33: goals — índice compound (company_id, status)
-- CREATE INDEX "goals_company_status_idx"
--   ON "goals" ("company_id", "status");

-- D34: approval_comments — paginação eficiente
-- CREATE INDEX "approval_comments_approval_created_idx"
--   ON "approval_comments" ("approval_id", "created_at");
```

---

## 4. Quick Wins — Top 5 prioridades

Os 5 débitos com **menor esforço e maior impacto** para resolver primeiro:

| Rank | ID | Débito | Por que agora? | Esforço estimado |
|------|----|--------|----------------|-----------------|
| 🥇 1 | D29 + D30 | Adicionar `companies.kind` e `companies.owner_user_id` | **Blocker de feature** — todas as rotas de company pessoal dependem desses campos. Schema Drizzle + migration trivial. | ~30 min |
| 🥈 2 | D31 | `user.email` — adicionar índice UNIQUE | Previne duplicação de conta via race condition na criação. Risco de segurança real. `CREATE UNIQUE INDEX` direto. | ~15 min |
| 🥉 3 | D01 | `instance_user_roles.user_id` — adicionar FK → `user.id` | Roles de admin órfãs podem causar escalada de privilégios. `ALTER TABLE ADD CONSTRAINT` simples. | ~20 min |
| 4 | D04 | `approvals.decided_by_user_id` — adicionar FK → `user.id` | Decisões de governança sem rastreabilidade = risco de auditoria LGPD. `ALTER TABLE ADD CONSTRAINT SET NULL`. | ~20 min |
| 5 | D32 + D33 | Índice `(company_id, status)` em `projects` e `goals` | Queries de listagem mais frequentes do painel fazem seq scan. `CREATE INDEX` sem downtime. | ~10 min |

---

### Sequência recomendada de migrations

```
0098 → companies.kind + owner_user_id        (P0 — blocker de feature)
0099 → user.email UNIQUE idx                  (P1 — segurança)
0100 → vault_notes                            (Vault Obsidian — fase 1)
0101 → vault_chunks + pgvector                (Vault Obsidian — fase 2 RAG)
0102 → vault_links                            (Vault Obsidian — fase 3 grafo)
0103 → FKs críticas D01, D04, D05, D14        (P1 — integridade referencial)
0104 → índices compound projects + goals      (P2 — performance)
```

---

> **Workflow de implementação** (conforme `AGENTS.md §6`):
> 1. Editar o arquivo `.ts` em `packages/db/src/schema/`
> 2. Executar `pnpm db:generate` para gerar o SQL
> 3. Validar com `pnpm -r typecheck`
> 4. Commitar o par `(schema.ts, migration.sql)` juntos na mesma branch

---

*Auditoria gerada por Dara (@data-engineer) em 2026-06-17 — migration base: 0097 | Débitos totais identificados: **38***
