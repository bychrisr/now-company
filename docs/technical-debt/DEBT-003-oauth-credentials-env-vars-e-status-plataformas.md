# Débito Técnico: Credenciais OAuth em Env Vars e UI de Status de Plataformas

**ID:** DEBT-003
**Data:** 2026-06-01
**Agente que Registrou:** @architect (Aria)
**Severidade:** Alta
**Origem:** Story 1.7 + Análise arquitetural pós-EPIC-001
**Epic de destino:** EPIC-002 (ou nova epic de infraestrutura OAuth)

---

## Resumo Executivo

Dois problemas arquiteturais interligados precisam ser resolvidos antes que o fluxo de conexão de redes sociais seja utilizável em produção multi-tenant:

1. **Credenciais OAuth de app** (`APP_ID`, `APP_SECRET`, `REDIRECT_URI`) estão hardcoded em variáveis de ambiente no servidor, impossibilitando que o Super Admin configure-as pela UI e quebrando o modelo de expansão para novas plataformas.
2. **A página de plataformas** (`/instance/settings/platforms`) não exibe nenhum status visual de saúde ou grau de implementação por plataforma, obrigando o Super Admin a testar às cegas antes de habilitar algo para os usuários.

---

## Parte 1 — Problema Arquitetural: Credenciais OAuth em Env Vars

### Descrição do Problema

O fluxo de conexão de conta social (`POST /companies/:companyId/social-accounts/connect/:platformSlug`) e o callback OAuth (`GET /api/oauth/callback`) dependem de três variáveis de ambiente para operar:

```
INSTAGRAM_APP_ID=<Meta App ID>
INSTAGRAM_APP_SECRET=<Meta App Secret>
INSTAGRAM_REDIRECT_URI=<URL de callback>
```

Essas variáveis são lidas em `server/src/config.ts` via `loadConfig()` e checadas no início de ambas as rotas:

```typescript
// server/src/routes/social-accounts.ts:154-159
const config = loadConfig();
if (!config.instagramAppId || !config.instagramAppSecret || !config.instagramRedirectUri) {
  throw unprocessable(
    "Instagram OAuth not configured — set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI",
  );
}
```

```typescript
// server/src/routes/oauth-callback.ts:144-154
// mesma dependência de loadConfig() para o token exchange
```

### Impactos

| Impacto | Detalhe |
|---|---|
| **Onboarding quebrado** | Qualquer nova instalação do Paperclip falha silenciosamente ao tentar conectar Instagram — o erro retornado para o frontend é genérico ("Connection failed") sem indicar que é um problema de configuração do servidor |
| **Super Admin sem agência** | O Super Admin não consegue configurar credenciais OAuth pela UI. Depende de acesso SSH ao servidor e restart do processo |
| **Expansão para novas plataformas exige código** | Adicionar YouTube, TikTok, LinkedIn obriga a adicionar novas env vars (`YOUTUBE_APP_ID`, etc.) e restart do servidor, ao invés de um formulário na UI |
| **Rotação de credenciais é DevOps** | Quando o Meta revoga ou expira o App Secret, a rotação exige acesso ao servidor — risco operacional |
| **Modelo multi-tenant incorreto** | Embora credenciais OAuth de app sejam de instância (não por empresa), o padrão atual impede que no futuro se gerencie apps OAuth separados por instância ou parceiro |

### Contexto de Infraestrutura de Secrets Existente

O projeto já possui um sistema de encryption de secrets robusto:

- **`PAPERCLIP_SECRETS_MASTER_KEY`** — chave AES-256 gerenciada via arquivo ou env var
- **`server/src/secrets/local-encrypted-provider.ts`** — implementa `encryptValue(masterKey, plaintext)` / `decryptValue(masterKey, encrypted)` com AES-256-GCM
- **`company_secrets` table** — armazena secrets encriptados por empresa (access tokens, API keys de empresa)
- **`secret_access_events` table** — auditoria de acesso a secrets

O problema é que esse sistema existe apenas em nível de *empresa* (`company_id`). Não existe uma tabela equivalente em nível de *instância* para secrets da plataforma.

### Solução Proposta

#### Schema — Estender `social_platforms`

Adicionar 3 colunas à tabela existente:

```sql
-- migration: XXXX_add_oauth_config_to_social_platforms.sql
ALTER TABLE social_platforms
  ADD COLUMN oauth_app_id          TEXT,
  ADD COLUMN oauth_app_secret_enc  TEXT,
  ADD COLUMN oauth_redirect_uri    TEXT;

COMMENT ON COLUMN social_platforms.oauth_app_id IS
  'Public App ID (client_id) registrado no provedor OAuth. Pode ser exibido na UI.';
COMMENT ON COLUMN social_platforms.oauth_app_secret_enc IS
  'App Secret encriptado com PAPERCLIP_SECRETS_MASTER_KEY via AES-256-GCM (mesmo formato de company_secrets). NUNCA expor em responses de API.';
COMMENT ON COLUMN social_platforms.oauth_redirect_uri IS
  'URI de callback OAuth registrado no provedor. Deve ser idêntico ao cadastrado no console do provedor.';
```

**Por que estender `social_platforms` ao invés de criar nova tabela:**
- Credenciais OAuth de app são atributos *da plataforma* — configuradas pelo Super Admin junto com `status`, `capabilities`, etc.
- Elimina JOIN desnecessário no critical path do connect/callback
- Super Admin gerencia plataforma em um único lugar

#### Schema — Drizzle ORM (`social_platforms.ts`)

```typescript
// Adicionar ao objeto de colunas:
oauthAppId: text("oauth_app_id"),
oauthAppSecretEnc: text("oauth_app_secret_enc"),
oauthRedirectUri: text("oauth_redirect_uri"),
```

#### API — Super Admin: novo endpoint de configuração OAuth

**`PATCH /api/instance/social-platforms/:id/oauth-config`**

```typescript
// Body esperado:
{
  appId: string,        // obrigatório
  appSecret: string,    // obrigatório — será encriptado antes de salvar
  redirectUri: string   // obrigatório
}

// Processamento:
const masterKey = resolveMasterKey(); // mesmo util de local-encrypted-provider
const secretEnc = encryptValue(masterKey, body.appSecret);
await db.update(socialPlatforms)
  .set({ oauthAppId: body.appId, oauthAppSecretEnc: secretEnc, oauthRedirectUri: body.redirectUri })
  .where(eq(socialPlatforms.id, platformId));

// Response — NUNCA incluir oauthAppSecretEnc:
{
  id,
  slug,
  oauth_app_id: body.appId,
  oauth_redirect_uri: body.redirectUri,
  has_oauth_secret: true,
  updated_at: new Date().toISOString()
}
```

**`DELETE /api/instance/social-platforms/:id/oauth-config`**

```typescript
// Limpa os 3 campos
await db.update(socialPlatforms)
  .set({ oauthAppId: null, oauthAppSecretEnc: null, oauthRedirectUri: null })
  .where(eq(socialPlatforms.id, platformId));
```

**Modificar `GET /api/instance/social-platforms`**

Adicionar ao objeto de retorno por plataforma:
```typescript
{
  // ... campos existentes ...
  oauthAppId: platform.oauthAppId ?? null,       // público
  oauthRedirectUri: platform.oauthRedirectUri ?? null, // público
  hasOauthSecret: !!platform.oauthAppSecretEnc,  // boolean — NUNCA expor o secret em si
  // oauthAppSecretEnc: OMITIR SEMPRE
}
```

#### API — Connect Route (substitui env vars)

```typescript
// server/src/routes/social-accounts.ts — connect endpoint
// ANTES:
const config = loadConfig();
if (!config.instagramAppId || !config.instagramAppSecret || !config.instagramRedirectUri) {
  throw unprocessable("...");
}

// DEPOIS:
const [platform] = await db
  .select()
  .from(socialPlatforms)
  .where(and(
    eq(socialPlatforms.slug, platformSlug),
    eq(socialPlatforms.status, "enabled"),
  ))
  .limit(1);

if (!platform) {
  throw notFound(`Platform '${platformSlug}' not found or disabled`);
}
if (!platform.oauthAppId || !platform.oauthAppSecretEnc || !platform.oauthRedirectUri) {
  throw unprocessable(
    `Platform '${platformSlug}' OAuth not configured — Super Admin must set App ID, App Secret and Redirect URI`,
  );
}

const masterKey = resolveMasterKey();
const appSecret = decryptValue(masterKey, platform.oauthAppSecretEnc);
// Usar platform.oauthAppId, appSecret, platform.oauthRedirectUri no buildInstagramAuthUrl
```

Esse refactor também elimina o `if (platformSlug !== "instagram")` hardcoded — qualquer plataforma com OAuth config no banco funcionará automaticamente.

#### API — OAuth Callback (substitui env vars)

O state token gerado em `generateState(companyId)` deve também carregar `platformSlug` (verificar se já carrega — se não, adicionar). No callback:

```typescript
// Extrair platformSlug do state decodificado
const { companyId, platformSlug } = decodeState(state);

// Buscar credenciais da plataforma no banco (mesmo padrão do connect)
const [platform] = await db.select().from(socialPlatforms)
  .where(eq(socialPlatforms.slug, platformSlug)).limit(1);

const masterKey = resolveMasterKey();
const appSecret = decryptValue(masterKey, platform.oauthAppSecretEnc!);
// Usar nos calls de exchangeInstagramCode e exchangeForLongLivedToken
```

#### Cleanup Pós-Validação em Produção

Após validação com credenciais salvas no banco:
- Remover `instagramAppId`, `instagramAppSecret`, `instagramRedirectUri` de `server/src/config.ts`
- Remover do `.env.example`
- Manter backward compatibility: durante período de transição, fallback para env vars se banco estiver vazio (flag de feature)

#### Constraints de Segurança Obrigatórias

1. `oauthAppSecretEnc` encriptado com `encryptValue(masterKey, rawSecret)` **antes** de qualquer `INSERT`/`UPDATE` — sem exceções
2. Nunca incluir `oauthAppSecretEnc` em nenhum response de API (nem em admin routes)
3. Retornar `hasOauthSecret: boolean` ao invés do valor
4. `decryptValue` chamado apenas no processo de connect/callback — memória de curta duração, sem cache
5. Log de acesso: quando credenciais são usadas para iniciar um fluxo OAuth, registrar evento (sem logar o secret)

---

## Parte 2 — Problema de UX: Status Visual de Plataformas na UI Admin

### Descrição do Problema

A página `/instance/settings/platforms` exibe as plataformas como uma lista plana com apenas nome, status (enabled/disabled) e um toggle. O Super Admin não consegue saber:

- Se a plataforma tem OAuth configurado (App ID + Secret + Redirect URI)
- Se o OAuth está funcional (credenciais válidas, não expiradas)
- Se a implementação do fluxo OAuth para aquela plataforma já foi desenvolvida
- Qual o nível de saúde de conexões existentes naquela plataforma

Isso força o Super Admin a testar às cegas: habilita a plataforma, pede para uma empresa tentar conectar, e só descobre o problema quando a empresa reporta erro.

### Solução Proposta

#### 2.1 — Indicador de Saúde (Bolinha colorida)

Cada plataforma na lista deve exibir uma bolinha de status com 3 estados:

| Estado | Cor | Condição |
|---|---|---|
| **Saudável** | Verde `#22c55e` | OAuth configurado + pelo menos 1 conta ativa conectada + última sync bem-sucedida nas últimas 48h |
| **Atenção** | Amarelo `#eab308` | OAuth configurado + mas: nenhuma conta conectada ainda, OU última sync falhou, OU credenciais próximas de expirar |
| **Não operacional** | Vermelho `#ef4444` | OAuth NÃO configurado (falta App ID/Secret/Redirect URI), OU plataforma disabled, OU credenciais inválidas/revogadas |

**Lógica de cálculo do status** (server-side, novo campo no response de `GET /api/instance/social-platforms`):

```typescript
type PlatformHealthStatus = "healthy" | "warning" | "error";

function computePlatformHealth(platform: SocialPlatform, stats: PlatformStats): PlatformHealthStatus {
  // Vermelho: OAuth não configurado
  if (!platform.oauthAppId || !platform.oauthAppSecretEnc || !platform.oauthRedirectUri) {
    return "error";
  }
  // Vermelho: plataforma desabilitada
  if (platform.status === "disabled") {
    return "error";
  }
  // Verde: tem contas ativas + sync recente OK
  if (stats.activeAccountsCount > 0 && stats.lastSyncSucceededAt &&
      Date.now() - stats.lastSyncSucceededAt.getTime() < 48 * 60 * 60 * 1000) {
    return "healthy";
  }
  // Amarelo: configurado mas sem uso ainda ou sync com problema
  return "warning";
}
```

O `stats` é obtido com query agregada em `company_social_accounts` por `platform_id`.

**Componente UI (`PlatformStatusDot`):**

```tsx
// ui/src/components/PlatformStatusDot.tsx
const colors = {
  healthy: "bg-green-500",
  warning: "bg-yellow-400",
  error: "bg-red-500",
} as const;

const labels = {
  healthy: t("platforms.health.healthy"),     // "Operacional"
  warning: t("platforms.health.warning"),     // "Atenção"
  error:   t("platforms.health.error"),       // "Não configurado"
} as const;

function PlatformStatusDot({ status }: { status: PlatformHealthStatus }) {
  return (
    <Tooltip content={labels[status]}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`}
        aria-label={labels[status]}
      />
    </Tooltip>
  );
}
```

Posicionamento: ao lado do nome da plataforma, antes do badge de implementação.

```
○ Instagram  [Implementado]  ──────────────────  [●] enabled
○ YouTube    [Não implementado]  ──────────────  [○] disabled
```

#### 2.2 — Badge de Status de Implementação

Cada plataforma deve ter um campo `implementationStatus` no banco (coluna em `social_platforms`) indicando se o fluxo OAuth completo foi desenvolvido:

```typescript
type ImplementationStatus = "implemented" | "in_progress" | "not_implemented";
```

| Badge | Cor | Significado |
|---|---|---|
| **Implementado** | Verde outline | OAuth completo: connect → callback → sync → disconnect funcional e testado |
| **Em desenvolvimento** | Amarelo outline | Implementação parcial ou em andamento |
| **Não implementado** | Cinza outline | Plataforma cadastrada no catálogo mas fluxo OAuth ainda não foi desenvolvido |

**Por que no banco e não hardcoded:**
- Permite que o Super Admin (ou o @dev após entregar uma plataforma) atualize o status via UI sem deploy
- Reflete a realidade: o catálogo pode ter 10 plataformas cadastradas mas apenas 2 implementadas

**Schema — adicionar coluna:**

```sql
ALTER TABLE social_platforms
  ADD COLUMN implementation_status TEXT NOT NULL DEFAULT 'not_implemented'
  CHECK (implementation_status IN ('implemented', 'in_progress', 'not_implemented'));
```

**Seed — atualizar valores:**

```typescript
// packages/db/src/seeds/social-platforms.ts
// Instagram: 'implemented' (Story 1.4 + 1.5 implementadas)
// Demais: 'not_implemented'
```

**Componente UI (`PlatformImplementationBadge`):**

```tsx
// ui/src/components/PlatformImplementationBadge.tsx
const variants = {
  implemented:     { className: "border-green-500 text-green-600",  labelKey: "platforms.impl.implemented" },
  in_progress:     { className: "border-yellow-500 text-yellow-600", labelKey: "platforms.impl.inProgress" },
  not_implemented: { className: "border-gray-400 text-gray-500",    labelKey: "platforms.impl.notImplemented" },
} as const;

function PlatformImplementationBadge({ status }: { status: ImplementationStatus }) {
  const v = variants[status];
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${v.className}`}>
      {t(v.labelKey)}
    </span>
  );
}
```

#### 2.3 — Card Colapsável de Configuração OAuth

Cada plataforma na lista Admin ganha um card colapsável com a configuração OAuth. O card expande ao clicar em um chevron/botão.

**Estrutura do card expandido:**

```
┌─────────────────────────────────────────────────────────────┐
│  ● Instagram  [Implementado]                    enabled [●] │
│  ─────────────────────────────────────────────────────────  │
│  ▼ Configuração OAuth                                        │
│                                                              │
│  App ID        [523849201234567                    ]         │
│                                                              │
│  App Secret    [••••••••••••••••••••••••          ] [👁]     │
│                ⚠ Nunca compartilhe este valor               │
│                                                              │
│  Redirect URI  [https://app.exemplo.com/oauth/callback]      │
│                ℹ Este URI deve ser idêntico ao cadastrado   │
│                  no console de desenvolvedor da plataforma  │
│                                                              │
│  [? Como obter estas credenciais]                            │
│                                                              │
│  [Salvar configuração]        [Limpar configuração]          │
└─────────────────────────────────────────────────────────────┘
```

**Tooltip "Como obter estas credenciais" (por plataforma):**

O conteúdo do tooltip deve ser específico por `platform.slug`:

```typescript
// ui/src/lib/platform-oauth-help.ts
export const oauthHelpBySlug: Record<string, { url: string; steps: string[] }> = {
  instagram: {
    url: "https://developers.facebook.com/apps",
    steps: [
      "Acesse developers.facebook.com/apps e crie um novo app",
      "Selecione o tipo 'Business'",
      "Em Produtos, adicione 'Instagram Basic Display'",
      "Copie o App ID e o App Secret da aba 'Configurações Básicas'",
      "Em 'Instagram Basic Display > Configurações', adicione o Redirect URI exatamente como mostrado acima",
      "Ative o app para produção antes de usar com usuários reais",
    ],
  },
  youtube: {
    url: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Acesse console.cloud.google.com e crie um projeto",
      "Ative a 'YouTube Data API v3' em APIs e Serviços",
      "Em Credenciais, crie 'ID do cliente OAuth 2.0' do tipo 'Aplicativo Web'",
      "Copie o Client ID (App ID) e Client Secret (App Secret)",
      "Adicione o Redirect URI em 'URIs de redirecionamento autorizados'",
    ],
  },
  // ... outras plataformas adicionadas conforme implementadas
};
```

**Comportamento de estado do card:**

- Card inicia colapsado
- Ao expandir: faz GET para buscar `oauthAppId`, `oauthRedirectUri`, `hasOauthSecret` do endpoint admin
- Campo App Secret: sempre vazio no load (o backend nunca retorna o valor) — exibe placeholder "••••••••" se `hasOauthSecret === true`, ou vazio se não configurado
- Ao submeter: se App Secret está vazio E `hasOauthSecret === true` → não altera o secret (mantém o existente, apenas atualiza App ID e Redirect URI)
- Se App Secret tem valor → encaminha para o backend encriptar e salvar
- Após save bem-sucedido: fechar card, re-fetch lista, mostrar toast

**Validações client-side:**
- App ID: obrigatório, não pode conter espaços
- App Secret: obrigatório apenas no primeiro save (quando `hasOauthSecret === false`)
- Redirect URI: obrigatório, deve ser URL válida iniciando com `https://`

---

## Parte 3 — Lista de Arquivos Afetados

### Novos arquivos

| Arquivo | Descrição |
|---|---|
| `packages/db/src/migrations/XXXX_oauth_config_social_platforms.sql` | Migration: +3 colunas OAuth + implementation_status |
| `packages/db/src/migrations/meta/XXXX_snapshot.json` | Snapshot drizzle |
| `ui/src/components/PlatformStatusDot.tsx` | Componente bolinha de saúde |
| `ui/src/components/PlatformImplementationBadge.tsx` | Badge implementado/não implementado |
| `ui/src/components/PlatformOAuthConfigCard.tsx` | Card colapsável de configuração OAuth |
| `ui/src/lib/platform-oauth-help.ts` | Conteúdo dos tooltips de ajuda por plataforma |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `packages/db/src/schema/social_platforms.ts` | +4 colunas: oauthAppId, oauthAppSecretEnc, oauthRedirectUri, implementationStatus |
| `packages/db/src/seeds/social-platforms.ts` | implementationStatus: instagram→'implemented', demais→'not_implemented' |
| `server/src/routes/social-accounts.ts` | connect route: env vars → query DB + decrypt |
| `server/src/routes/oauth-callback.ts` | token exchange: env vars → query DB + decrypt |
| `server/src/routes/social-platforms-admin.ts` | +PATCH /:id/oauth-config, +DELETE /:id/oauth-config, GET inclui hasOauthSecret + healthStatus |
| `server/src/config.ts` | Remover instagramAppId/Secret/RedirectUri (após validação) |
| `ui/src/pages/InstanceSocialPlatforms.tsx` | Integrar PlatformStatusDot + PlatformImplementationBadge + PlatformOAuthConfigCard |
| `ui/src/api/socialPlatforms.ts` | +patchOAuthConfig(), +deleteOAuthConfig(), atualizar tipo SocialPlatform |
| `ui/src/i18n/locales/en.json` | Chaves: platforms.health.*, platforms.impl.*, platforms.oauthConfig.* |
| `ui/src/i18n/locales/pt-BR.json` | Traduções das mesmas chaves |
| Demais 38 arquivos de locale | Fallback em inglês para as mesmas chaves |

---

## Parte 4 — Critérios de Aceitação para a Story Futura

Quando este débito for refinado em story pelo @sm/@po, os ACs mínimos devem ser:

1. Super Admin acessa `/instance/settings/platforms`, vê cada plataforma com bolinha de status colorida e badge de implementação
2. Super Admin expande o card do Instagram, preenche App ID + App Secret + Redirect URI, salva — credenciais ficam encriptadas no banco
3. Super Admin reabre o card — App ID e Redirect URI aparecem preenchidos; App Secret aparece como "••••••••" (nunca o valor real)
4. Empresa tenta conectar Instagram — fluxo usa credenciais do banco, não env vars
5. Env vars `INSTAGRAM_APP_ID/SECRET/REDIRECT_URI` não existem no servidor — fluxo ainda funciona
6. Super Admin limpa a configuração OAuth — ao tentar conectar, empresa recebe mensagem clara: "Plataforma não configurada pelo administrador"
7. Bolinha verde aparece quando: OAuth configurado + ≥1 conta ativa + sync nas últimas 48h
8. Bolinha amarela aparece quando: OAuth configurado mas sem contas conectadas ainda
9. Bolinha vermelha aparece quando: OAuth não configurado
10. Badge "Implementado" aparece apenas para plataformas com `implementationStatus = 'implemented'`
11. `pnpm run typecheck` + `pnpm run build` + `pnpm run test` passam

---

## Parte 5 — Dependências e Riscos

### Dependências

- `PAPERCLIP_SECRETS_MASTER_KEY` deve estar configurado antes de salvar qualquer OAuth secret — documentar no onboarding de instância
- A migration adiciona colunas nullable — sem downtime, backward compatible
- O redirect URI registrado no Meta for Developers deve ser atualizado se o domínio da instância mudar

### Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Super Admin salva Redirect URI errado | Alta | Validação client-side de URL + mensagem de erro do Meta é clara o suficiente |
| `PAPERCLIP_SECRETS_MASTER_KEY` não configurado | Média | Checar na startup e logar warning visível; o endpoint PATCH falha com 500 claro |
| Rotação de App Secret no Meta invalida conexões existentes | Baixa | Conexões existentes usam long-lived token já salvo — não são afetadas; apenas novos connects falham |
| Backward compatibility com env vars durante transição | Média | Período de grace: se banco vazio, tentar env vars como fallback com log de deprecation |

---

## Referências

- **Story de origem:** `docs/stories/1.7.company-social-accounts-ui.md`
- **Schema:** `packages/db/src/schema/social_platforms.ts`, `company_secrets.ts`
- **Secrets infra:** `server/src/secrets/local-encrypted-provider.ts`
- **Routes afetadas:** `server/src/routes/social-accounts.ts:139-170`, `server/src/routes/oauth-callback.ts`
- **UI afetada:** `ui/src/pages/InstanceSocialPlatforms.tsx` (verificar nome exato do arquivo)
