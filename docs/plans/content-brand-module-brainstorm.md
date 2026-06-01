# Brainstorm — Módulo de Marca, Redes Sociais e Produção de Conteúdo

> **Status:** RASCUNHO — pré-epic, pré-story. Documento vivo para alinhamento e exploração.
> **Ordem de fluxo:** Brainstorm → Investigações abertas → Epic → Stories → Validação (@po) → Dev
> **Criado em:** 2026-05-27 | **Autor:** Christian + Steave

---

## Contexto e Ponto de Partida

O Paperclip (now-company) tem hoje identidade visual mínima: `brandColor` (um único hex) + logo via `company_logos`. Nada de brand kit, redes sociais, ou produção de conteúdo. O CompanyOS tem blueprints desenhados (Content Operations v0.5 gap-fixed), mas com kaven coverage 0% — tudo está para ser construído do zero aqui.

Este documento serve para **mapear, questionar e expandir** cada bloco antes de qualquer story ser criada.

---

## Bloco 0 — Super Admin de Plataformas (PRÉ-REQUISITO GLOBAL)

### O problema
Não adianta uma empresa cadastrar um LinkedIn se o LinkedIn não está 100% integrado e configurado na plataforma. Uma rede social só deveria aparecer para as empresas quando o super admin garantir:

- A integração está funcional (OAuth app configurado, API testada, rate limits mapeados)
- O padrão de imagem para aquela rede está definido (dimensões, formatos, proporções)
- Os padrões de copy e narrativa para aquela plataforma estão documentados
- As capacidades estão mapeadas (o que dá pra fazer: post, stories, reel, thread, etc.)

**Uma plataforma só fica disponível para empresas quando `status = active`.**

---

### ✅ Infraestrutura existente (confirmada via probe + leitura de código)

**`instance_user_roles` — JÁ EXISTE E FUNCIONA**
```typescript
// packages/db/src/schema/instance_user_roles.ts
instanceUserRoles {
  id: uuid PK
  userId: text NOT NULL
  role: text NOT NULL DEFAULT "instance_admin"   ← única role existente hoje
  createdAt, updatedAt
  UNIQUE(userId, role)
}
```
- `accessService.isInstanceAdmin(userId)` — verificação funcional
- `accessService.promoteInstanceAdmin(userId)` — promoção funcional
- `accessService.demoteInstanceAdmin(userId)` — rebaixamento funcional
- `req.actor.isInstanceAdmin` — flag propagada em todo request context

**`instance_settings` — JÁ EXISTE**
```typescript
instanceSettings {
  singletonKey: text DEFAULT "default"   ← uma linha só para toda instância
  general: jsonb                         ← config geral
  experimental: jsonb                    ← features experimentais
}
```
- Rotas: `GET/PATCH /api/instance/settings/general`
- Middleware: `assertCanManageInstanceSettings(req)` — bloqueia se não for instance_admin
- UI: `InstanceGeneralSettings.tsx` — página funcional

**`InstanceSidebar` — JÁ EXISTE**
- Sidebar renderizada automaticamente em rotas `/instance/settings/*`
- `Layout.tsx` detecta a rota e troca para `InstanceSidebar`
- Já tem links para `/instance/settings/plugins/` etc.
- **Conclusão:** a nova seção de plataformas entra AQUI como mais um item de nav

**Padrão de Adapters — REFERÊNCIA DIRETA**
O gerenciamento de adapters (`/api/adapters`, `AdapterManager.tsx`) segue exatamente o padrão que o Super Admin de Plataformas deve seguir:
- `GET /api/adapters` — leitura aberta para qualquer board user
- Rotas de mutação (install, disable, remove) — apenas `instance_admin`
- Health check embutido com status (`ready | error | degraded`)
- UI em `/instance/settings/adapters`

**`company_secret_provider_configs` — PADRÃO PARA OAUTH**
```typescript
companySecretProviderConfigs {
  companyId, provider, displayName
  status: text DEFAULT "ready"
  isDefault: boolean
  config: jsonb                    ← configuração do provider (chaves, endpoints, etc.)
  healthStatus, healthCheckedAt, healthMessage, healthDetails
  disabledAt
}
```
Este é o padrão exato para armazenar credenciais OAuth de plataformas com health check automático. Os tokens OAuth das plataformas seguirão o mesmo modelo via `company_secrets`.

---

### Design do Super Admin de Plataformas

**Rota de UI:** `/instance/settings/platforms` (dentro do `InstanceSidebar` existente)
**Rota de API:** `/api/instance/platforms/*` (protegida por `assertCanManageInstanceSettings`)

**Fluxo de gestão de uma plataforma:**
```
1. Super admin cria plataforma com status = "draft"
2. Configura o OAuth app (client_id, client_secret, scopes) → armazena em instance_settings.general ou tabela própria
3. Define capacidades: {canPost, canStories, canReels, canCarousel, canSchedule, hasAPI, hasPaidAds}
4. Define padrões de imagem: [{label, width, height, aspectRatio, maxMB, formats[]}]
5. Define padrões de copy: {maxChars, hashtagsSupported, linksInBody, markdownSupported, mentionsSupported}
6. Escreve guia de narrativa/tom da plataforma (Markdown rico)
7. Testa a integração (sandbox/test mode) → status muda para "testing"
8. Após validação: status = "active" → plataforma aparece para todas as empresas
```

**Schema proposto para `social_platform_configs` (tabela de instância, sem company_id):**
```typescript
social_platform_configs
  id: uuid PK
  slug: text UNIQUE              -- "instagram", "tiktok", "linkedin"
  name: text                     -- "Instagram"
  display_name: text             -- "Instagram (Meta)"
  description: text              -- o que é essa plataforma, para que serve
  
  -- Visual
  icon_url: text                 -- URL ícone SVG/PNG
  color: text                    -- hex brand (#E1306C Instagram)
  
  -- URLs
  base_url: text                 -- "https://instagram.com"
  profile_url_pattern: text      -- "https://instagram.com/{handle}"
  
  -- Categoria
  category: text                 -- SOCIAL | PODCAST | MESSAGING | VIDEO | BLOG | AD | OTHER
  
  -- Capacidades (o que a integração suporta)
  capabilities: jsonb
    -- {
    --   canPost: bool,
    --   canStories: bool,
    --   canReels: bool,
    --   canCarousel: bool,
    --   canSchedule: bool,
    --   canDirectPublish: bool,    ← publica direto via API ou só agendamento?
    --   hasAnalyticsAPI: bool,
    --   hasPaidAdsAPI: bool,
    --   hasOAuth: bool,
    --   requiresBusinessAccount: bool
    -- }
  
  -- Padrões de imagem (array de formatos suportados)
  image_specs: jsonb
    -- [{
    --   label: "Feed (quadrado)",
    --   width: 1080, height: 1080,
    --   aspect_ratio: "1:1",
    --   max_file_size_mb: 8,
    --   formats: ["jpg", "png", "webp"],
    --   is_primary: true
    -- }, ...]
  
  -- Padrões de copy
  copy_specs: jsonb
    -- {
    --   max_chars: 2200,                   ← null = sem limite
    --   hashtags_supported: true,
    --   hashtag_position: "body | caption | first_comment",
    --   links_in_body: false,              ← Instagram não aceita links no caption
    --   link_in_bio: true,
    --   markdown_supported: false,
    --   mentions_supported: true,
    --   max_hashtags: 30,
    --   emoji_supported: true
    -- }
  
  -- Guia de narrativa (Markdown — editável pelo super admin)
  narrative_guide: text
  
  -- OAuth app credentials (armazenadas aqui ou em instance_settings.general)
  oauth_client_id: text
  oauth_client_secret: text      -- ⚠️ encrypted at rest (usar o mesmo pattern de local_encrypted)
  oauth_scopes: text[]
  oauth_redirect_uri: text
  
  -- Health check
  health_status: text            -- "ok" | "degraded" | "error" | "unchecked"
  health_checked_at: timestamp
  health_message: text
  
  -- Status de publicação para as empresas
  status: text                   -- "draft" | "testing" | "active" | "deprecated"
  deprecated_at: timestamp
  deprecation_note: text
  
  -- Ordenação e visibilidade
  sort_order: int
  is_featured: bool              -- aparece em destaque no onboarding de empresa
  
  -- Metadados
  api_version: text              -- versão da API da plataforma (ex: "v21.0" para Meta)
  api_docs_url: text
  rate_limit_info: jsonb         -- {requestsPerHour, requestsPerDay, burstLimit}
  
  created_by_user_id: text
  created_at, updated_at
```

**Rotas de API (instância):**
```
GET    /api/instance/platforms              -- lista todas (instance_admin)
POST   /api/instance/platforms             -- cria nova plataforma (instance_admin)
GET    /api/instance/platforms/:slug       -- detalhe (instance_admin)
PATCH  /api/instance/platforms/:slug       -- atualiza (instance_admin)
POST   /api/instance/platforms/:slug/test  -- testa integração OAuth (instance_admin)
POST   /api/instance/platforms/:slug/activate   -- muda status para active (instance_admin)
POST   /api/instance/platforms/:slug/deprecate  -- deprecia plataforma (instance_admin)

GET    /api/platforms              -- lista só as ACTIVE (qualquer board user — para UI das empresas)
GET    /api/platforms/:slug        -- detalhe público (board user)
```

**Separação crítica:** `/api/instance/platforms/*` é gestão admin. `/api/platforms/*` é consumo pelas empresas.

---

### Questões resolvidas pelos MCPs

- ✅ **Existe instance_admin?** Sim, 100% funcional — `instance_user_roles`, `isInstanceAdmin()`, `assertCanManageInstanceSettings()`
- ✅ **Onde fica o painel?** `/instance/settings/platforms` — entra no `InstanceSidebar` existente sem nova infraestrutura
- ✅ **Como proteger as rotas?** Reusar `assertCanManageInstanceSettings(req)` — zero código novo de auth
- ✅ **Como armazenar OAuth credentials?** Seguir o padrão de `company_secret_provider_configs` + `local_encrypted` provider
- ✅ **Padrão de UI de gestão?** Copiar o padrão de `AdapterManager.tsx` — já resolve listing, status, enable/disable

### Questões ainda abertas
- [ ] OAuth client_id/secret da plataforma fica em `social_platform_configs` (criptografado) ou em `instance_settings.general` como JSON?
- [ ] Health check automático: cron job no servidor ou on-demand quando admin acessa?
- [ ] Sandbox/test mode: testar OAuth sem empresas reais envolvidas — como isolar?
- [ ] Versioning de `image_specs` e `copy_specs`? (plataformas mudam specs frequentemente — Instagram mudou limite de hashtags 3x)
- [ ] Deprecação: empresas que já têm contas vinculadas a uma plataforma deprecada recebem qual notificação?
- [ ] Rate limit tracking: armazenar usage por empresa ou por instância?

### Expansão futura
- Status page automático de saúde de todas as integrações
- Notificação para empresas quando uma plataforma tem problema
- Webhook de plataforma para receber eventos (ex: conta desconectada, token expirado)
- Histórico de changelog de specs por plataforma (auditoria)

---

## Bloco 1 — Social Platform Registry (Catálogo Global)

### Conceito
Plataformas são **metadata**, não enum. Isso permite adicionar Threads, Bluesky, Kwai, Google Meu Negócio, Hackernews, qualquer coisa nova sem migration de schema.

> **Fonte primária:** `docs/references/global-content-formats-atlas.md` (v3.0, maio 2026) — todas as capacidades, formatos e copy_specs abaixo derivam deste atlas.

### Schema proposto (Drizzle)
```typescript
social_platforms
  id: uuid PK
  slug: text UNIQUE          -- "instagram", "tiktok", "linkedin"
  name: text                 -- "Instagram"
  display_name: text         -- "Instagram (Meta)"
  icon_url: text             -- URL do ícone SVG/PNG
  base_url: text             -- "https://instagram.com"
  profile_url_pattern: text  -- "https://instagram.com/{handle}"
  category: text             -- SOCIAL | VIDEO | MESSAGING | PODCAST | FORUM | PUBLISHING | OTHER
  capabilities: json         -- {canPost, canStories, canReels, canCarousel, canSchedule,
                             --  canDirectPublish, canLive, hasAnalyticsAPI, hasPaidAdsAPI,
                             --  hasOAuth, requiresBusinessAccount}
  image_specs: json          -- [{label, width, height, aspectRatio, maxMB, formats[]}]
  copy_specs: json           -- {maxChars, hashtagsSupported, hashtagPosition, linksInBody,
                             --  markdownSupported, mentionsSupported, maxHashtags, emojiSupported}
  color: text                -- hex da cor brand da plataforma (#E1306C para Instagram)
  is_active: bool            -- controlado pelo super admin
  sort_order: int
  created_at, updated_at
```

---

### Seed — Mapeamento por Plataforma (derivado do Atlas)

> **Padrão:** seed via migration SQL com `status = "draft"`. Nenhuma plataforma nasce `active` — o super admin ativa uma a uma após validar a integração.

#### 🔵 Ecossistema Meta (Atlas § I.1)

**Instagram** `slug: instagram` `category: SOCIAL` `color: #E1306C`
```json
capabilities: {
  "canPost": true, "canStories": true, "canReels": true, "canCarousel": true,
  "canSchedule": true, "canDirectPublish": true, "canLive": true,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": true, "hasOAuth": true,
  "requiresBusinessAccount": true
}
copy_specs: {
  "maxChars": 2200, "hashtagsSupported": true,
  "hashtagPosition": "body | first_comment",
  "linksInBody": false, "linkInBio": true,
  "markdownSupported": false, "mentionsSupported": true,
  "maxHashtags": 30, "emojiSupported": true
}
image_specs: [
  { "label": "Feed (quadrado)", "width": 1080, "height": 1080, "aspectRatio": "1:1", "maxMB": 8, "formats": ["jpg","png","webp"], "isPrimary": true },
  { "label": "Feed (retrato)", "width": 1080, "height": 1350, "aspectRatio": "4:5", "maxMB": 8, "formats": ["jpg","png","webp"] },
  { "label": "Reels / Stories", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 100, "formats": ["mp4","mov"] },
  { "label": "Carrossel", "width": 1080, "height": 1080, "aspectRatio": "1:1", "maxMB": 8, "formats": ["jpg","png"], "maxSlides": 10 }
]
```
> **Estratégia 2026 (Atlas § II.1):** DM-First — funis Comment-to-DM via ManyChat, Follow-to-Unlock, estética YAP (autenticidade > polish). "Link na Bio" considerado erro de conversão.

---

**WhatsApp Business** `slug: whatsapp-business` `category: MESSAGING` `color: #25D366`
```json
capabilities: {
  "canPost": false, "canBroadcast": true, "canFlows": true,
  "hasOAuth": true, "requiresBusinessAccount": true,
  "hasAPI": true
}
copy_specs: {
  "maxChars": 4096, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": false,
  "emojiSupported": true
}
```
> **Estratégia 2026 (Atlas § III.1):** Dark Social primário — 40-70% das vendas ocorrem aqui. Canais (unidirecional broadcast), Comunidades (multi-grupos), WhatsApp Flows (agendamento/pagamento nativo). **Separar caso de uso:** broadcasting ≠ conversação 1:1.

---

**Facebook** `slug: facebook` `category: SOCIAL` `color: #1877F2`
```json
capabilities: {
  "canPost": true, "canStories": true, "canReels": true,
  "canSchedule": true, "canDirectPublish": true, "canLive": true,
  "canGroups": true, "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false
}
copy_specs: {
  "maxChars": 63206, "hashtagsSupported": true,
  "linksInBody": true, "markdownSupported": false,
  "emojiSupported": true
}
image_specs: [
  { "label": "Feed", "width": 1200, "height": 630, "aspectRatio": "1.91:1", "maxMB": 30, "formats": ["jpg","png","webp"], "isPrimary": true },
  { "label": "Stories / Reels", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 100, "formats": ["mp4","mov"] }
]
```
> **Atlas § I.1:** Grupos (comunidades nichadas), Reels com alcance cruzado para Instagram, Marketplace (venda direta).

---

**Threads** `slug: threads` `category: SOCIAL` `color: #000000`
```json
capabilities: {
  "canPost": true, "canReels": false, "canStories": false,
  "canSchedule": false, "hasOAuth": true, "requiresBusinessAccount": false,
  "hasAudioNative": true
}
copy_specs: {
  "maxChars": 500, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": false,
  "emojiSupported": true
}
image_specs: [
  { "label": "Post", "width": 1080, "height": 1080, "aspectRatio": "1:1", "maxMB": 10, "formats": ["jpg","png"], "isPrimary": true }
]
```
> **Atlas § I.1:** Microblogging focado em conversas textuais + áudio nativo. API pública ainda limitada (2026).

---

#### 🔴 Ecossistema de Vídeo (Atlas § I.2)

**YouTube** `slug: youtube` `category: VIDEO` `color: #FF0000`
```json
capabilities: {
  "canPost": false, "canLongVideo": true, "canShorts": true,
  "canLive": true, "canCommunityPost": true, "canPodcast": true,
  "canSchedule": true, "canDirectPublish": true,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false
}
copy_specs: {
  "titleMaxChars": 100, "descriptionMaxChars": 5000,
  "hashtagsSupported": true, "maxHashtags": 15,
  "linksInBody": true, "markdownSupported": false
}
image_specs: [
  { "label": "Thumbnail", "width": 1280, "height": 720, "aspectRatio": "16:9", "maxMB": 2, "formats": ["jpg","png"], "isPrimary": true },
  { "label": "Shorts", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 256, "formats": ["mp4","mov"] }
]
```
> **Estratégia 2026 (Atlas § II.2):** Asset Engine (ToFu/MoFu/BoFu), Regra "Match & Exceed" em 5s-10s, estilo "Raw & Authority" (Hormozi), Build in Public (gravações longas como pilar para micro-conteúdo).

---

**TikTok** `slug: tiktok` `category: VIDEO` `color: #000000`
```json
capabilities: {
  "canPost": true, "canReels": true, "canStories": true,
  "canLive": true, "canSchedule": true, "canDirectPublish": true,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false
}
copy_specs: {
  "maxChars": 2200, "hashtagsSupported": true,
  "linksInBody": false, "markdownSupported": false,
  "maxHashtags": 20, "emojiSupported": true
}
image_specs: [
  { "label": "Vídeo (Reels)", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 287, "formats": ["mp4","mov"], "isPrimary": true }
]
```

---

#### 🔷 Networking B2B (Atlas § I.3)

**LinkedIn** `slug: linkedin` `category: SOCIAL` `color: #0A66C2`
```json
capabilities: {
  "canPost": true, "canCarousel": true, "canDocument": true,
  "canNewsletter": true, "canLive": true, "canSchedule": true,
  "canDirectPublish": true, "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false
}
copy_specs: {
  "maxChars": 3000, "hashtagsSupported": true,
  "hashtagPosition": "body", "linksInBody": true,
  "markdownSupported": false, "mentionsSupported": true,
  "emojiSupported": true
}
image_specs: [
  { "label": "Post", "width": 1200, "height": 627, "aspectRatio": "1.91:1", "maxMB": 5, "formats": ["jpg","png","webp"], "isPrimary": true },
  { "label": "Documento / Carrossel (PDF)", "width": 1080, "height": 1080, "aspectRatio": "1:1", "maxMB": 300, "formats": ["pdf"] },
  { "label": "Vídeo Nativo", "width": 1920, "height": 1080, "aspectRatio": "16:9", "maxMB": 200, "formats": ["mp4"] }
]
```
> **Estratégia 2026 (Atlas § II.3):** Opinião Técnica Forte bate AI Slop. Documentos PDF/Carrosséis = formato de autoridade. Personalização IA 30x via análise de atividade real. Sentinel Creators superam influenciadores de estilo.

---

#### 🟣 Fóruns e Tech (Atlas § I.4)

**Reddit** `slug: reddit` `category: FORUM` `color: #FF4500`
```json
capabilities: {
  "canPost": true, "canAMA": true, "canGallery": true,
  "hasOAuth": true, "requiresBusinessAccount": false,
  "hasPaidAdsAPI": true
}
copy_specs: {
  "maxChars": 40000, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": true
}
```
> **Estratégia 2026 (Atlas § II.4 + III.1):** Silent Marketing — Regra 90/10 (90% ajuda, 10% menção sutil). Fonte primária para IAs de busca. Vulnerabilidade Transparente gera 3x mais salvamentos.

---

**Hacker News** `slug: hackernews` `category: FORUM` `color: #FF6600`
```json
capabilities: {
  "canPost": true, "canShowHN": true,
  "hasOAuth": false, "requiresBusinessAccount": false,
  "hasPaidAdsAPI": false
}
copy_specs: {
  "maxChars": null, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": false
}
```
> **Estratégia 2026 (Atlas § II.4 + IV.1):** Títulos neutros `Show HN: [Nome] – [O que faz tecnicamente]`. "I built" > "We built". Ceticismo técnico mantém no topo. Guerrilha de Utilidade (ferramentas gratuitas → Karma de Autoridade).

---

**Indie Hackers** `slug: indie-hackers` `category: FORUM` `color: #0EA5E9`
```json
capabilities: {
  "canPost": true, "canMilestone": true, "canProductPage": true,
  "canAskIH": true, "canGroups": true, "canInterview": true,
  "hasPodcast": true, "hasOAuth": false,
  "requiresBusinessAccount": false, "hasPaidAdsAPI": false
}
copy_specs: {
  "maxChars": null, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": true,
  "metricsRequired": true
}
```
> **Por que IH é diferente de HN e Reddit:** É a única plataforma onde métricas de negócio reais (MRR, churn, usuários) são o conteúdo. Não é para branding de empresa — é para o **fundador como pessoa pública**. Audience de IH = outros fundadores e early adopters técnicos com maior disposição a pagar por ferramentas B2B.

> **Estratégia 2026 (Atlas § II.4 + IV.3):**
> - **Transparency Marketing:** Milestone updates com números reais ("$0 → $10k MRR") convertem mais que qualquer copy de marketing.
> - **Página de Produto completa:** Métricas públicas = tração visível = prova social passiva. Página incompleta = descartado.
> - **Interview como distribuição:** Ser entrevistado = SEO permanente + distribuição para 200k+ fundadores na audiência do podcast.
> - **Top post DNA:** Título com número concreto → contexto em 2-3 frases → "o que funcionou" (com dados) → "o que não funcionou" (mais engajamento que o positivo) → próximos passos + pedido de feedback específico.
> - **Frequência de milestone:** A cada marco ($1k, $5k, $10k MRR ou 100, 500, 1k usuários).
> - **Players de referência:** Pieter Levels (Nomad List), Marc Lou (ShipFast), Tony Dinh (Xnapper).
> - **Cross-platform:** IH milestone → thread no Twitter/X → versão executiva no LinkedIn → deep-dive com SEO no Blog. O milestone do IH é o **ponto de partida do funil de conteúdo**.

> **Nota de implementação:** `canMilestone` e `canProductPage` são capacidades nativas do IH sem API pública documentada — publicação é manual. O valor está no canal de distribuição, não na automação via OAuth.

---

#### 🟢 Publishing Próprio (Atlas § I.5)

**Blog / Site** `slug: blog` `category: PUBLISHING` `color: #4A90E2`
```json
capabilities: {
  "canPost": true, "canSEO": true, "hasRSS": true,
  "hasOAuth": false, "requiresBusinessAccount": false
}
copy_specs: {
  "maxChars": null, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": true
}
```
> **Estratégia 2026 (Atlas § II.5):** AEO + GEO — Answer-First (TL;DR no topo), H2s como perguntas naturais, Schema Markup JSON-LD, Knowledge Graphs internos, CTAs de Nova Geração (calculadoras de ROI, quizzes).

---

#### 🐦 Micro-texto e Descoberta (Atlas § I.1 — texto curto)

**Twitter/X** `slug: twitter-x` `category: SOCIAL` `color: #000000`
```json
capabilities: {
  "canPost": true, "canCarousel": true, "canLive": true, "canSpaces": true,
  "canSchedule": true, "canDirectPublish": true,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false,
  "apiTier": "paid"
}
copy_specs: {
  "maxChars": 280, "premiumMaxChars": 25000,
  "hashtagsSupported": true, "maxHashtags": 1,
  "linksInBody": false, "linksInFirstReply": true,
  "markdownSupported": false, "mentionsSupported": true,
  "emojiSupported": true,
  "algorithmNote": "links penalizam -8x alcance; replies valem 15x mais que likes"
}
image_specs: [
  { "label": "Post 16:9", "width": 1200, "height": 675, "aspectRatio": "16:9", "maxMB": 5, "formats": ["jpg","png","gif","webp"], "isPrimary": true },
  { "label": "Post 1:1", "width": 1080, "height": 1080, "aspectRatio": "1:1", "maxMB": 5, "formats": ["jpg","png","webp"] },
  { "label": "Post 4:5", "width": 1080, "height": 1350, "aspectRatio": "4:5", "maxMB": 5, "formats": ["jpg","png","webp"] },
  { "label": "Header", "width": 1500, "height": 500, "aspectRatio": "3:1", "maxMB": 5, "formats": ["jpg","png"] },
  { "label": "GIF", "width": 1280, "height": 1080, "maxMB": 15, "formats": ["gif"], "maxFrames": 350 }
]
```
> **Estratégia 2026:** Long-form > thread (algoritmo inverteu em late-2025). Velocity primeiras 2h > volume total. NUNCA link no corpo (-8x) — link no 1º comentário. 3-5x/dia + horário fixo. BR: base reduzida pós-bloqueio AGO/SET 2024; Threads e Bluesky absorveram migrantes.

---

**Bluesky** `slug: bluesky` `category: SOCIAL` `color: #0085FF`
```json
capabilities: {
  "canPost": true, "canCarousel": true,
  "canSchedule": false, "canDirectPublish": true, "canLive": false,
  "hasAnalyticsAPI": false, "hasPaidAdsAPI": false,
  "hasOAuth": true, "requiresBusinessAccount": false,
  "protocol": "AT Protocol — 1.666 posts/hora, gratuito"
}
copy_specs: {
  "maxChars": 300, "maxBytes": 3000,
  "hashtagsSupported": true, "linksInBody": true,
  "markdownSupported": false, "mentionsSupported": true,
  "emojiSupported": true,
  "algorithmNote": "cronológico — links NÃO penalizados (diferencial vs X)"
}
image_specs: [
  { "label": "Post 1:1", "width": 1000, "height": 1000, "aspectRatio": "1:1", "maxMB": 1, "formats": ["jpg","png","webp"], "isPrimary": true },
  { "label": "Post 16:9", "width": 1000, "height": 563, "aspectRatio": "16:9", "maxMB": 1, "formats": ["jpg","png","webp"] },
  { "label": "Post 4:5", "width": 800, "height": 1000, "aspectRatio": "4:5", "maxMB": 1, "formats": ["jpg","png","webp"] },
  { "label": "Vídeo", "width": 1920, "height": 1080, "aspectRatio": "16:9", "maxMB": 100, "formats": ["mp4"], "maxDurationSec": 180 }
]
```
> **Estratégia 2026:** Custom Feeds como canal de distribuição — publicar alinhado aos feeds do nicho. Early mover advantage — DAU muito menor que seguidores, alcance orgânico altíssimo. Starter Packs como ferramenta de crescimento. BR = 3º maior mercado global; "Brasilesfera" consolidada.

---

#### 📌 Descoberta Visual (Atlas — imagem evergreen)

**Pinterest** `slug: pinterest` `category: SOCIAL` `color: #E60023`
```json
capabilities: {
  "canPost": true, "canIdeaPin": true, "canVideoPin": true,
  "canCollectionPin": true, "canSchedule": true, "canDirectPublish": true,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": true
}
copy_specs: {
  "titleMaxChars": 100, "titleVisibleInFeed": 40,
  "descriptionMaxChars": 500,
  "hashtagsSupported": true, "hashtagWeight": "menor que keywords contextuais",
  "linksInBody": true, "markdownSupported": false,
  "emojiSupported": true,
  "seoNote": "96% buscas unbranded — keywords contextuais > hashtags"
}
image_specs: [
  { "label": "Standard Pin", "width": 1000, "height": 1500, "aspectRatio": "2:3", "maxMB": 32, "formats": ["jpg","png","webp"], "isPrimary": true },
  { "label": "Square Pin", "width": 1000, "height": 1000, "aspectRatio": "1:1", "maxMB": 32, "formats": ["jpg","png","webp"] },
  { "label": "Long Pin", "width": 1000, "height": 2100, "aspectRatio": "1:2.1", "maxMB": 32, "formats": ["jpg","png","webp"] },
  { "label": "Idea Pin (Story)", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 20, "formats": ["jpg","png","webp"] },
  { "label": "Video Pin", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 2048, "formats": ["mp4","mov"] },
  { "label": "Collection Hero", "width": 1000, "height": 1500, "aspectRatio": "2:3", "maxMB": 20, "formats": ["jpg","png","webp"] }
]
```
> **Estratégia 2026:** Pinterest Predicts com 80% precisão → publicar antes do pico sazonal. Pins evergreen como ativos compostos (SEO de longo prazo). Idea Pins para crescimento + Pins estáticos para tráfego. Shopping Ads ROAS superior ao IG para moda/casa/beleza. BR = 2º maior mercado global (~42M usuários). Intenção de compra 2.2x maior que outras redes.

---

#### 👻 Efêmero e Gen Z (baixa prioridade BR)

**Snapchat** `slug: snapchat` `category: MESSAGING` `color: #FFFC00`
```json
capabilities: {
  "canPost": true, "canStories": true, "canSpotlight": true,
  "canLive": false, "canSchedule": false,
  "canDirectPublish": "allowlist (aprovação manual Snap)",
  "hasAnalyticsAPI": false, "hasPaidAdsAPI": true,
  "hasOAuth": true, "requiresBusinessAccount": false,
  "integrationComplexity": "ALTA — AES-256-CBC + chunked upload + allowlist",
  "brPriority": "BAIXA — ~6M usuários, decrescendo"
}
copy_specs: {
  "titleMaxChars": 55, "descriptionMaxChars": 34,
  "hashtagsSupported": false, "linksInBody": false,
  "linksViaSwipeUp": true, "markdownSupported": false
}
image_specs: [
  { "label": "Snap/Story orgânico", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 5, "formats": ["jpg","png"], "isPrimary": true, "safeZoneNote": "evitar top 150px e bottom 330px" },
  { "label": "Story vídeo", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 500, "formats": ["mp4","mov"], "minDurationSec": 5, "maxDurationSec": 60 },
  { "label": "Spotlight vídeo", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 500, "formats": ["mp4"], "minDurationSec": 5, "maxDurationSec": 60 },
  { "label": "Single Image Ad", "width": 1080, "height": 1920, "aspectRatio": "9:16", "maxMB": 32, "formats": ["jpg","png"] }
]
```
> **⚠️ BAIXA prioridade BR:** 6M usuários (decrescendo) + API extremamente complexa (a mais difícil de integrar de todas as redes). Adiar para fases futuras. Manter no registry com `status = draft` indefinidamente até haver demanda explícita.

---

#### 💬 Messaging e Broadcast (Atlas — dark social)

**Telegram** `slug: telegram` `category: MESSAGING` `color: #2AABEE`
```json
capabilities: {
  "canPost": false, "canBroadcast": true, "canGroups": true,
  "canBots": true, "canMiniApps": true, "canLive": false,
  "canSchedule": true, "hasAnalyticsAPI": false, "hasPaidAdsAPI": false,
  "hasOAuth": false, "requiresBusinessAccount": false,
  "reach": "100% — sem algoritmo, sem shadow ban"
}
copy_specs: {
  "maxChars": 4096, "captionMaxChars": 1024,
  "hashtagsSupported": true, "hashtagIndexed": true,
  "linksInBody": true, "markdownSupported": true,
  "markdownFlavors": ["MarkdownV2", "HTML nativo"],
  "emojiSupported": true, "mediaAlbumMaxItems": 10
}
image_specs: [
  { "label": "Imagem (bot API)", "maxMB": 50, "formats": ["jpg","png","webp","bmp","tiff"], "note": "até 2GB via Local Bot API Server" },
  { "label": "Vídeo", "formats": ["mp4"], "note": "H.264/H.265 preferido" },
  { "label": "Vídeo Circular", "maxMB": 12, "diameterPx": 384, "maxDurationSec": 60 },
  { "label": "Arquivo (Premium)", "maxGB": 4, "formats": ["qualquer"] }
]
```
> **Estratégia 2026:** Canal como newsletter soberana — 100% reach, sem algoritmo. Dark Social: conteúdo share-first para grupos nichados. Canal + Supergrupo vinculado (dois níveis de audiência). Stars + TON para monetização sem comissão efetiva. Revenue share de ads para canais +1.000 subs. BR = 5º maior mercado global (21.94M downloads).

---

#### 🎮 Comunidade e Fórum Digital

**Discord** `slug: discord` `category: FORUM` `color: #5865F2`
```json
capabilities: {
  "canPost": true, "canChannels": true, "canGroups": true,
  "canBots": true, "canThreads": true, "canForums": true,
  "canLive": true, "canStageChannels": true,
  "canSchedule": false, "canDirectPublish": true,
  "hasAnalyticsAPI": "parcial", "hasPaidAdsAPI": false,
  "hasOAuth": true, "requiresBusinessAccount": false
}
copy_specs: {
  "maxChars": 2000, "nitroMaxChars": 4000,
  "embedDescriptionMaxChars": 4096, "embedTitleMaxChars": 256,
  "hashtagsSupported": false, "linksInBody": true,
  "markdownSupported": true, "markdownFlavor": "Discord próprio (sem HTML)",
  "maxEmbedsPerMessage": 10, "emojiSupported": true
}
image_specs: [
  { "label": "Upload free", "maxMB": 10, "formats": ["qualquer"] },
  { "label": "Upload Nitro Basic", "maxMB": 50, "formats": ["qualquer"] },
  { "label": "Upload Nitro", "maxMB": 500, "formats": ["qualquer"] },
  { "label": "Go Live (free)", "width": 854, "height": 480, "frameRate": 30 },
  { "label": "Go Live (Nitro)", "width": 1920, "height": 1080, "frameRate": 60 }
]
```
> **Estratégia 2026:** Comunidade B2B como produto (SaaS, dev tools, AI companies). Stage Channels para eventos ao vivo sem fricção. Forum Channels para base de conhecimento viva. Bots de automação para onboarding e retenção. Product-led community: servidor como extensão do produto. API v10 (fev/2026): mudança breaking — PIN_MESSAGES separado de MANAGE_MESSAGES.

---

#### 🎙️ Podcast e Áudio (Atlas — long-form)

**Spotify** `slug: spotify` `category: PODCAST` `color: #1DB954`
```json
capabilities: {
  "canPost": false, "canPodcast": true, "canVideoPodcast": true,
  "canSchedule": false, "canDirectPublish": false,
  "hasDistributionAPI": true, "distributionAPINote": "jan/2026 — apenas hosts parceiros: Acast/Libsyn/Omny/Podigee",
  "hasPaidProgram": true, "paidProgramBR": false,
  "hasAnalyticsAPI": false, "hasPaidAdsAPI": false,
  "hasOAuth": false, "requiresBusinessAccount": false
}
copy_specs: {
  "episodeTitleMaxChars": 255, "descriptionMaxChars": 4000,
  "hashtagsSupported": false, "linksInBody": true,
  "maxDurationHours": 12
}
image_specs: [
  { "label": "Artwork (podcast cover)", "minWidth": 1400, "minHeight": 1400, "maxWidth": 3000, "maxHeight": 3000, "aspectRatio": "1:1", "formats": ["jpg","png","tiff"], "isPrimary": true },
  { "label": "Vídeo podcast (1080p)", "width": 1920, "height": 1080, "aspectRatio": "16:9", "maxBitrateMbps": 25, "formats": ["mp4","mov"], "frameRate": "24-60fps" },
  { "label": "Vídeo podcast (4K)", "width": 3840, "height": 2160, "aspectRatio": "16:9", "maxBitrateMbps": 35, "formats": ["mp4","mov"] }
]
```
> **Estratégia 2026:** Vídeo podcast cresceu 2x no Spotify BR em 12 meses. Partner Program BR **NÃO disponível** (apenas EUA, Europa, Oceania). Publicação direta via hosts parceiros (Anchor/Spotify, Transistor, Buzzsprout). Thresholds Partner Program reduzidos 80% em jan/2026: de 12→3 episódios, 10k→2k horas consumidas.

---

**Apple Podcasts** `slug: apple-podcasts` `category: PODCAST` `color: #8B1BE0`
```json
capabilities: {
  "canPost": false, "canPodcast": true, "canVideoPodcast": true,
  "canSchedule": false, "canDirectPublish": false,
  "hasDistributionAPI": false, "distributionNote": "HLS proprietário (iOS 26.4, mar/2026) — specs sob NDA, apenas hosts parceiros",
  "hasPaidProgram": true, "paidProgramFee": "30% ano 1, 15% ano 2+",
  "hasOAuth": false, "requiresBusinessAccount": false
}
copy_specs: {
  "hashtagsSupported": false, "linksInBody": true,
  "loudnessTarget": "-16 LUFS / True Peak -1 dBTP"
}
image_specs: [
  { "label": "Artwork (obrigatório)", "width": 3000, "height": 3000, "aspectRatio": "1:1", "formats": ["jpg","png"], "colorSpace": "RGB", "isPrimary": true },
  { "label": "Vídeo HLS (proprietário)", "deliveryNote": "HLS adaptive bitrate — 5 variantes automáticas: 1080p/720p/480p/360p/240p", "aspectRatio": "16:9", "ndaNote": "specs sob NDA" }
]
```
> **Estratégia 2026:** 37.5% dos downloads globais — presença mandatória. Brasil = 2º maior mercado global de podcasts. Spotify lidera BR (25.6M+ usuários mensais). Vídeo via HLS apenas por hosts parceiros (specs proprietárias, sem integração direta). Subscriptions: modelo freemium nativo.

---

#### 📍 Local e SEO (Atlas — zero-click)

**Google Meu Negócio** `slug: google-business` `category: OTHER` `color: #4285F4`
```json
capabilities: {
  "canPost": true, "canOffer": true, "canEvent": true,
  "canSchedule": false, "canDirectPublish": true,
  "hasReviewManagement": true, "hasMessaging": false,
  "hasAnalyticsAPI": true, "hasPaidAdsAPI": false,
  "hasOAuth": true, "requiresBusinessAccount": true,
  "apiType": "PRIVADA — requer aprovação formal, 60+ dias de perfil ativo, 300 QPM"
}
copy_specs: {
  "updateMaxChars": 1500, "updateRecommended": "150-300",
  "updateExpiresDays": 7,
  "offerMaxChars": 1500, "offerRequires": "título + datas",
  "eventMaxChars": 1500, "eventRequires": "título + datas + horários",
  "hashtagsSupported": false, "linksInBody": true
}
image_specs: [
  { "label": "Post", "width": 1200, "height": 900, "aspectRatio": "4:3", "maxMB": 5, "formats": ["jpg","png"], "isPrimary": true, "minWidth": 400, "minHeight": 300 },
  { "label": "Logo", "width": 720, "height": 720, "aspectRatio": "1:1", "maxMB": 5 },
  { "label": "Cover", "width": 1024, "height": 575, "aspectRatio": "16:9", "maxMB": 5 },
  { "label": "Vídeo", "maxMB": 75, "maxDurationSec": 30, "formats": ["mp4","mov"], "note": "SEM suporte de upload via API" }
]
```
> **Estratégia 2026:** GBP como "homepage zero" para AI Overviews e Ask Maps (Gemini, abr/2026 — 300M places analisados). 1-3 posts/semana alternando Update/Offer/Event. Responder 100% dos reviews em menos de 24h. Fotos reais = 5.6x mais cliques. Schema LocalBusiness + NAP uniforme + FAQ = 100% cobertura AEO. **SEO crítico:** Local Pack = proximidade + relevância + proeminência (posts e reviews alimentam os 2 últimos).

---

#### 📱 Vídeo Curto BR Interior

**Kwai** `slug: kwai` `category: VIDEO` `color: #FF0050`
```json
capabilities: {
  "canPost": true, "canLive": true, "canSchedule": false,
  "canDirectPublish": false,
  "hasOAuth": false, "hasAnalyticsAPI": "apenas Ads",
  "hasPaidAdsAPI": true,
  "requiresBusinessAccount": false,
  "apiNote": "SEM API pública de publicação orgânica — apenas campanhas pagas via Kwai for Business"
}
copy_specs: {
  "maxChars": 2200, "hashtagsSupported": true,
  "linksInBody": false, "emojiSupported": true,
  "hookNote": "Hook nos primeiros 2-3 segundos, duração ideal 15-30s"
}
image_specs: [
  { "label": "Vídeo (preferencial)", "width": 1080, "height": 1920, "aspectRatio": "9:16", "formats": ["mp4","mov"], "isPrimary": true, "maxDurationSec": 60 },
  { "label": "Vídeo (quadrado)", "width": 1080, "height": 1080, "aspectRatio": "1:1", "formats": ["mp4","mov"] },
  { "label": "Vídeo (horizontal)", "width": 1920, "height": 1080, "aspectRatio": "16:9", "formats": ["mp4","mov"], "note": "aceito mas desfavorecido algoritmicamente" },
  { "label": "TeleKwai (série)", "aspectRatio": "9:16", "minDurationSec": 60, "maxDurationSec": 300, "note": "episódios em série — diferencial vs TikTok" }
]
```
> **Estratégia 2026:** TeleKwai (micronovelas em série) como diferencial competitivo vs TikTok. Conteúdo regional e vernacular > produção polida. Kwai Shop + Live Commerce para conversão direta. Zero-rating Claro + Kwai Lite (5MB) = penetração interior do Brasil. 60M MAU Brasil, 75 min/dia, Tier 2/3 dominante. R$ 7B investido desde 2019.

---

#### 🐙 Repositórios e Dev Relations

**GitHub** `slug: github` `category: OTHER` `color: #181717`
```json
capabilities: {
  "canPost": false, "canREADME": true, "canDiscussions": true,
  "canReleases": true, "canPages": true, "canSponsors": true,
  "canWiki": true, "hasOAuth": true,
  "hasAPI": true, "apiVersions": ["REST v3", "GraphQL v4"],
  "requiresBusinessAccount": false
}
copy_specs: {
  "readmeMaxKB": 512, "repoDescriptionMaxChars": 350,
  "profileBioMaxChars": 160, "topicsMax": 20,
  "discussionMarkdownSupported": true, "hashtagsSupported": false,
  "linksInBody": true
}
```
> **Estratégia 2026:** README como landing page técnica (padrão Vercel/Supabase/Linear). Profile README da org = homepage da marca para devs. Discussions = fórum de suporte com SEO de long tail. Releases = changelog público automatizável via GitHub Actions. Sponsors: 49.000 devs financiados, $50M+ pagos. Rate: 5.000 pontos/hora autenticado (PAT ou GitHub App).

---

#### 📰 Newsletter e Publishing

**Substack** `slug: substack` `category: PUBLISHING` `color: #FF6719`
```json
capabilities: {
  "canNewsletter": true, "canNotes": true, "canPodcast": true,
  "canVideo": true, "canSchedule": true, "canDirectPublish": true,
  "hasPaidSubscription": true, "hasOAuth": false,
  "hasAPI": false, "apiNote": "sem API pública — workaround via npm 'substack-api' (reverse-engineering)",
  "requiresBusinessAccount": false
}
copy_specs: {
  "postMaxChars": null, "notesMaxChars": null,
  "hashtagsSupported": false, "linksInBody": true,
  "markdownSupported": true, "emailOpenRate": "30-60% (vs 21% média mercado)",
  "feeNote": "10% Substack + 2.9%+$0.30 Stripe ≈ 13-16% total"
}
```
> **Estratégia 2026:** Notes como motor de descoberta — 50%+ novos subscribers via Notes. Modelo 1 free + 1 paid/semana para maximizar algoritmo de Explore. Recommendations: parcerias com newsletters do mesmo nicho. Cross-posting Notes → LinkedIn/X para trazer audiência externa. Batch production de 7-10 Notes semanais agendados. 4 canais simultâneos: Email + Web + App Substack + Notes feed.

---

#### 🚀 Lançamentos e Comunidade Maker

**Product Hunt** `slug: product-hunt` `category: FORUM` `color: #DA552F`
```json
capabilities: {
  "canLaunch": true, "canComment": true, "canUpvote": true,
  "hasAPI": true, "apiType": "GraphQL v2",
  "hasOAuth": true, "canDirectPublish": false,
  "requiresBusinessAccount": false,
  "launchNote": "Submit de launch apenas via UI — API não permite criar launch"
}
copy_specs: {
  "taglineMaxChars": 60, "taglineStyle": "orientado a outcome, sem hype",
  "hashtagsSupported": false, "linksInBody": true,
  "shoutoutsMax": 3
}
image_specs: [
  { "label": "Thumbnail", "width": 640, "height": 480, "aspectRatio": "4:3", "formats": ["jpg","png"] },
  { "label": "Gallery image", "width": 1270, "height": 760, "aspectRatio": "16:9", "formats": ["jpg","png"], "maxCount": 6 },
  { "label": "Demo vídeo", "minDurationSec": 60, "maxDurationSec": 90, "formats": ["mp4"] }
]
```
> **Estratégia 2026 — DNA do #1 do dia:** Terça ou quarta + submit 12:01 AM PST. Top 3 na primeira hora = crítico. Responder todo comentário em <15min (9h-21h PST). Algoritmo: comments + tempo na página + respostas maker > upvotes. Cross-posting coordenado: email → X → LinkedIn → IH → Slack/Discord (mesmo dia). Oferta exclusiva de launch day. 150k-250k visitantes únicos/dia.

---

#### ❓ Q&A e Autoridade de Nicho

**Quora** `slug: quora` `category: FORUM` `color: #B92B27`
```json
capabilities: {
  "canPost": true, "canAnswers": true, "canSpaces": true,
  "canBlog": true, "hasOAuth": false,
  "hasAPI": false, "apiNote": "sem API pública",
  "hasPaidAdsAPI": true, "requiresBusinessAccount": false
}
copy_specs: {
  "answerMaxChars": null, "spacesNameMaxChars": 50,
  "hashtagsSupported": false, "linksInBody": true,
  "markdownSupported": true
}
```
> **Estratégia 2026:** Canal de SEO + citação por LLMs (ChatGPT, Perplexity, Claude citam respostas do Quora com frequência crescente). Respostas longas e técnicas = autoridade passiva permanente. Spaces como newsletter assíncrona. 4-6M visitas BR/mês. **Não é canal de conversação — é canal de indexação de autoridade.**

---

#### 🎮 Live e Streaming (não-gaming)

**Twitch** `slug: twitch` `category: VIDEO` `color: #9146FF`
```json
capabilities: {
  "canPost": false, "canLive": true, "canClips": true,
  "canVods": true, "canSchedule": true,
  "hasOAuth": true, "hasAnalyticsAPI": true, "hasPaidAdsAPI": true,
  "requiresBusinessAccount": false,
  "apiVersion": "Helix API v2 (atualizado fev/2026)"
}
copy_specs: {
  "streamTitleMaxChars": 140, "descriptionMaxChars": 300,
  "clipMaxDurationSec": 60, "hashtagsSupported": false,
  "linksInBody": true, "markdownSupported": false
}
image_specs: [
  { "label": "Stream (recomendado)", "width": 1920, "height": 1080, "aspectRatio": "16:9", "formats": ["h264", "h265", "av1-beta"], "note": "AV1 em beta desde jan/2026" },
  { "label": "Thumbnail (offline)", "width": 1920, "height": 1080, "aspectRatio": "16:9", "maxMB": 10, "formats": ["jpg","png"] },
  { "label": "Clip", "maxDurationSec": 60, "formats": ["mp4"] }
]
```
> **Estratégia 2026:** Just Chatting supera Gaming em audiência não-gaming (Q&As ao vivo, reviews, build-in-public em tempo real). Monetização global para todos os Affiliates desde mai/2026 (antes: geo-restrito). Clips como conteúdo evergreen redistribuível. Sub goals e Hype Train para engajamento de comunidade. Uso B2B emergente: town halls, demos de produto ao vivo.

---

### 🚫 Plataformas Excluídas do Seed

| Plataforma | Motivo |
|---|---|
| **Koo** | Encerrado definitivamente em jul/2024 |
| **Nimo TV** | Encerrado definitivamente em abr/2022 |
| **Rumble** | Bloqueado por decisão do STF no Brasil — sem operação legal |
| **Band.us** | Sem tração no mercado brasileiro |

---

### Categorias consolidadas (enum final)

```
SOCIAL      → Instagram, Facebook, Threads, LinkedIn, Twitter/X, Pinterest, Bluesky
VIDEO       → YouTube, TikTok, Kwai, Twitch
MESSAGING   → WhatsApp Business, Telegram, Snapchat
PODCAST     → Spotify, Apple Podcasts
FORUM       → Reddit, Hacker News, Indie Hackers, Discord, Product Hunt, Quora
PUBLISHING  → Blog, Substack
OTHER       → Google Meu Negócio, GitHub
```

> **Nota:** `AD` não entra como categoria aqui — tráfego pago é Bloco 4 (company_ad_accounts). Plataformas com `hasPaidAdsAPI: true` (Meta, LinkedIn, TikTok, Pinterest, Snapchat, Kwai, Twitch) habilitam o Bloco 4. Snapchat e Twitch entram como `status = draft` inicialmente dado complexidade de integração.

---

### Investigações abertas (atualizadas)
- [x] ~~Sessão dedicada pendente~~ → todas as 15 plataformas do seed mapeadas com capabilities + copy_specs + image_specs + estratégia 2026
- [x] ~~Google Meu Negócio: specs de tipos de post~~ → mapeado (Update 7 dias, Offer persiste, Event persiste)
- [x] ~~Kwai: API pública documentada?~~ → confirmado: SEM API orgânica pública (apenas Kwai for Business para ads pagos)
- [x] ~~Plataformas excluídas~~ → Koo (encerrado), Nimo TV (encerrado), Rumble (bloqueado STF), Band.us (sem tração BR) — documentadas na tabela acima
- [ ] Separar `image_specs` em tabela filha `social_platform_image_specs`? (plataformas têm 4-6 formatos → JSONB fica pesado; pros: query por label; cons: mais complexity)
- [ ] WhatsApp Business: `canBroadcast` vs `canFlows` são features distintas de API — verificar endpoints disponíveis
- [ ] Bluesky AT Protocol: OAuth2 ou DPoP? — investigar antes de abrir integração
- [ ] Snapchat: manter `status = draft` indefinidamente ou adicionar flag `brPriority: "low"` no schema?
- [ ] Quem define `image_specs` quando a plataforma muda (Instagram mudou specs 3x em 2 anos)? → Super admin edita via UI
- [ ] Discord e Product Hunt: sem OAuth estável para publicação — como gerenciar na UI de gestão de plataformas?
- [ ] Quora: sem API → o que exatamente entra no registry? (histórico, links de respostas, tracking manual?)
- [ ] Twitch: Affiliate vs Partner — qual nível mínimo exigir para `status = active`?

---

## Bloco 2 — BrandKit (Identidade Visual Completa)

> **Investigações concluídas** (5 agentes paralelos): schema Paperclip existente, Remotion, padrão W3C DTCG, UX/UI (Uma), alan-design-system skill.

---

### Estado atual do Paperclip (baseline confirmada)

- `companies.brandColor` — 1 hex só. É tudo que existe hoje.
- `company_logos` — 1 logo por empresa, sem variantes (sem escura/clara/mono)
- `assets` — storage genérico (provider, objectKey, contentType, byteSize)
- `ui-branding.ts` — utilitários de cor já prontos: `deriveColorFromSeed()`, `pickReadableTextColor()`, `createFaviconDataUrl()`, `hslToHex()`
- `CompanyPatternIcon.tsx` — geração de padrão procedural com Bayer dither + OKLCH (fallback visual quando não há logo)
- **Tailwind 4.0 + OKLCH** em uso no projeto — `@theme inline` com CSS custom properties
- `sharp@0.34.5` instalado — manipulação raster disponível
- Remotion, Satori, FFmpeg, Puppeteer: **nenhum instalado**

---

### Formato canônico: W3C Design Tokens (DTCG)

**Decisão:** `tokens.json` no formato **DTCG (Design Tokens Format Module 2025.10)** é a única fonte de verdade. Tudo é derivado dele:

```
tokens.json (DTCG)
  ├── CSS custom properties (:root)     → web + Tailwind 4
  ├── Tailwind theme.extend             → classes utilitárias
  ├── Remotion inputProps (TS module)   → vídeos programáticos
  ├── Satori JSX props (JS object)      → imagens estáticas
  └── Figma (via Tokens Studio plugin)  → design
```

**Por que DTCG e não schema próprio:** W3C standard, spec estável (out/2025), suportado nativamente por Style Dictionary v4, Tokens Studio, Figma. `$extensions` é o escape hatch oficial para campos vendor-specific (Remotion package names, Satori TTF URLs).

**Ponto crítico de Satori:** não aceita WOFF2 — precisa TTF/OTF como `ArrayBuffer`. Cada fonte precisa de 2 URLs no token: `googleFontsPackage` (para Remotion) + `ttfUrl` (para Satori).

---

### Schema de banco: `company_brand_kits`

Tabela separada de `companies` — não JSON em `companies`. Motivos: versionamento, multi-brand (agências), queries independentes.

```typescript
company_brand_kits
  id: uuid PK
  company_id: uuid FK (companies) NOT NULL
  name: text NOT NULL               -- "Principal", "Black Friday 2026", "Marca Latam"
  is_default: boolean DEFAULT false
  is_active: boolean DEFAULT true

  -- Tokens (DTCG canônico — fonte de verdade)
  tokens_json: jsonb NOT NULL        -- W3C DTCG format completo

  -- Exports derivados (cacheados, regenerados quando tokens mudam)
  tokens_css: text                   -- CSS custom properties (:root)
  tokens_tailwind: jsonb             -- Tailwind theme.extend object
  tokens_remotion: jsonb             -- inputProps typesafe para Remotion
  tokens_satori: jsonb               -- objeto + array de font ArrayBuffer URLs

  -- Origem e metadados de extração
  source_url: text                   -- URL de onde foi extraído (se via alan-design-system)
  source_skill: text                 -- "alan-design-system v1.0.0" | "manual" | "import"
  style_fingerprint: text            -- "shadcn-neutral" | "apple-glass" | "brutalist-mono" ...
  quality_score: text                -- A–F (output da skill)
  extraction_log: jsonb              -- provenance por token (high/medium/low confidence)

  -- Versionamento
  version: int NOT NULL DEFAULT 1
  parent_version_id: uuid FK (self)  -- para rollback (aponta versão anterior)

  -- Índice para multi-brand
  sort_order: int

  -- Audit
  created_by_user_id: text
  created_at: timestamp
  updated_at: timestamp
```

**Regra de negócio:** `UNIQUE(company_id) WHERE is_default = true` — uma empresa tem exatamente 1 brand kit padrão ativo.

---

### Schema: `company_logo_variants` (extensão de `company_logos`)

Substituir a constraint `UNIQUE(companyId)` atual por tabela de variantes:

```typescript
company_logo_variants
  id: uuid PK
  company_id: uuid FK (companies)
  asset_id: uuid FK (assets)

  variant: text                      -- "primary" | "dark" | "light" | "mono" | "symbol" | "wordmark" | "horizontal" | "vertical" | "favicon"
  is_primary: boolean DEFAULT false

  -- Metadados de uso
  clear_space_px: int                -- espaço mínimo ao redor
  min_size_px: int                   -- tamanho mínimo de exibição
  allowed_backgrounds: text[]        -- ["white", "dark", "primary", "any"]

  -- Auto-gerado?
  is_auto_generated: boolean DEFAULT false
  generated_from_variant_id: uuid FK (self)

  created_at: timestamp

  UNIQUE(company_id, variant)        -- uma variante por empresa
  INDEX(company_id, is_primary)
```

**Migração:** `company_logos` existente → `company_logo_variants` com `variant = "primary", is_primary = true`.

---

### Tokens mínimos obrigatórios (MVP)

Campos que devem existir para o BrandKit ser "funcionalmente útil":

```json
{
  "$schema": "https://designtokens.org/schema.json",
  "brand": {
    "identity": {
      "name": { "$type": "string", "$value": "Acme Co" }
    },
    "logo": {
      "primary": { "$type": "asset", "$value": { "svg": "https://...", "png": "https://..." } }
    }
  },
  "color": {
    "brand": {
      "primary": { "$type": "color", "$value": "#4F46E5" }
    },
    "neutral": {
      "50":  { "$type": "color", "$value": "#FAFAFA" },
      "500": { "$type": "color", "$value": "#71717A" },
      "900": { "$type": "color", "$value": "#18181B" }
    },
    "text": {
      "default": { "$type": "color", "$value": "{color.neutral.900}" },
      "inverse": { "$type": "color", "$value": "{color.neutral.50}" }
    },
    "background": {
      "default": { "$type": "color", "$value": "{color.neutral.50}" }
    }
  },
  "font": {
    "family": {
      "display": {
        "$type": "fontFamily",
        "$value": ["Inter", "system-ui", "sans-serif"],
        "$extensions": {
          "paperclip": {
            "source": "google-fonts",
            "remotionPackage": "@remotion/google-fonts/Inter",
            "satoriTtfUrl": "https://fonts.gstatic.com/.../inter-bold.ttf",
            "weights": [700, 800]
          }
        }
      },
      "body": {
        "$type": "fontFamily",
        "$value": ["Inter", "system-ui", "sans-serif"],
        "$extensions": {
          "paperclip": {
            "source": "google-fonts",
            "remotionPackage": "@remotion/google-fonts/Inter",
            "satoriTtfUrl": "https://fonts.gstatic.com/.../inter-regular.ttf",
            "weights": [400, 500]
          }
        }
      }
    }
  }
}
```

**Tokens recomendados (BrandKit completo de produção):** escala neutral completa (50→950), secondary + accent, 4 pesos de fonte, escala de 8-10 sizes, radius (5 stops), spacing (12+ stops), shadow (3 stops), voice (sliders + keywords + exemplos).

---

### Pipeline de renderização

```
BrandKit (tokens_json DTCG)
  │
  ├─── [imagens estáticas] ─────── Satori (@vercel/og)
  │     Post Instagram, OG cards,   JSX → SVG → PNG em <50ms
  │     Thumbnails, Carrosséis       Requer fontes como TTF ArrayBuffer
  │
  ├─── [vídeos curtos] ──────────── Remotion Lambda
  │     Reels 9:16, Stories,         React → MP4 | $0.001-$0.02/render
  │     Shorts YouTube               inputProps = brand tokens (Zod schema)
  │                                  @remotion/google-fonts para fontes
  │
  └─── [UI preview] ─────────────── CSS variables → iframe sandbox
        Preview em tempo real        tokens → :root vars → render
        durante edição do kit
```

**Composições Remotion por formato (bundle único):**
- `ReelVertical` — 1080×1920 (9:16) | Reels, TikTok, Stories
- `FeedSquare` — 1080×1080 (1:1) | Posts quadrados
- `FeedPortrait` — 1080×1350 (4:5) | Posts retrato
- `ThumbnailYT` — 1280×720 (16:9) | Thumbnails YouTube
- `CarrosselSlide` — 1080×1350 (4:5) | Slides individuais (batch)
- `StoryAnimated` — 1080×1920 (9:16) | Stories com animação

**Infra Remotion:** Lambda AWS. Requer: IAM user com policy Remotion + `npx remotion lambda functions deploy` + bundle hosted em S3. Render queue via BullMQ/SQS para controlar concorrência por empresa.

**Infra Satori:** inline no servidor Node.js. Fontes TTF pré-fetched e cacheadas em memória com LRU. Cache de renders: hash(kitId + templateId + content) → R2/S3.

---

### Skill `alan-design-system` — Integração

A skill extrai design systems completos de qualquer URL pública via análise estática CSS + LLM. Output: `DESIGN.md` (Google-spec) + `tokens.json` + `preview.html` + `extraction-log.yaml` + `quality-score.json`.

**Fluxo de uso no Paperclip:**
```
1. Admin digita URL (ex: "https://stripe.com")
   ↓
2. POST /api/companies/:id/brand-kits/extract { url }
   ↓
3. skill executa: fetch → CSS collect → regex detection → LLM → DESIGN.md
   ↓
4. Outputs: tokens.json (Google-spec) → converter para DTCG → INSERT company_brand_kits
   ↓
5. quality_score + style_fingerprint + extraction_log salvos junto
   ↓
6. Brand kit disponível para edição/refinamento manual na UI
```

**Origem `source_skill = "alan-design-system v1.0.0"`** — rastreável para auditoria e re-extração quando a skill atualizar.

**4 origens de BrandKit no onboarding:**
1. **URL** → skill alan-design-system (extração automática)
2. **Logo + IA** → upload SVG → extração de cores dominantes via `sharp` + geração de paleta OKLCH
3. **Brandfetch** → API externa (dados de marca pré-catalogados por domínio)
4. **Manual** → wizard passo a passo

---

### Arquitetura de UI/UX (resultado Uma — AIOX UX Expert)

**Localização na nav:** `Content › Brand Kits` (não Settings — frequência alta + perfil criativo)

**Rotas:**
```
/brand-kits                    → lista de kits (multi-brand)
/brand-kits/new                → wizard de onboarding (6 passos, 90s)
/brand-kits/:kitId             → overview / dashboard do kit
/brand-kits/:kitId/colors      → editor de paleta (split 60/40 + preview live)
/brand-kits/:kitId/typography  → editor tipográfico (combobox com preview inline)
/brand-kits/:kitId/logos       → gerenciador de variantes
/brand-kits/:kitId/voice       → tom de voz (sliders + keywords + exemplos)
/brand-kits/:kitId/preview     → templates renderizados (Satori + Remotion player)
/brand-kits/:kitId/export      → DTCG / CSS / Tailwind / Figma
/brand-kits/:kitId/history     → versionamento + rollback
```

**Stack de componentes:**
- Color picker: `react-colorful` (2.8KB, zero deps, a11y)
- Font picker: `cmdk` (Combobox com preview inline na própria fonte)
- Color math / shades OKLCH: `culori` (não chroma.js — OKLCH nativo)
- Contraste: `apca-w3` + `wcag-contrast` (WCAG 2 + APCA futuro)
- Shade generation: interpolação OKLCH calibrada (replica Tailwind v4 — sem distorção HSL)
- Token export: `style-dictionary v4` (DTCG nativo, multi-target)
- Preview engine: Satori para imagens, `@remotion/player` lazy para vídeos
- State do editor: Zustand + immer (undo/redo)

**Geração de shades:** OKLCH com curva de luminância calibrada:
```ts
// Luminância percebida uniforme — HSL distorce
const luminanceCurve = [0.97, 0.93, 0.86, 0.76, 0.66, 0.55, 0.47, 0.39, 0.31, 0.22, 0.14];
generateShades(baseHex) → shades 50-950 com WCAG indicator por shade
```

---

### Investigações — resolvidas vs. abertas

**Resolvidas:**
- [x] Formato canônico → **DTCG W3C** (não schema próprio)
- [x] Remotion → `inputProps` + Zod schema + Lambda; Satori para imagens estáticas
- [x] alan-design-system → output mapeado, fluxo de integração definido
- [x] Tabela separada ou JSON em companies → **tabela separada** `company_brand_kits`
- [x] Validação de contraste → `apca-w3` + `wcag-contrast` em tempo real no editor
- [x] AIOX DS → AIOX tem templates/convenções mas não DS visual; tokens seguem convenção kebab-case, layers core/semantic/component
- [x] Onde fica na UI → `Content › Brand Kits`, não Settings
- [x] Satori incompatibilidade WOFF2 → usar TTF URL no `$extensions.paperclip.satoriTtfUrl`

**Ainda abertas:**
- [ ] Remotion Lambda: conta AWS própria da instância ou por empresa? (custo, billing, isolamento)
- [ ] Multi-brand: limite por plano? (1 kit no free, N no paid)
- [ ] Versioning: quantas versões manter? Auto-arquivar após N dias?
- [ ] Brandfetch API: requer chave por instância? — investigar plano self-serve
- [ ] MMOS Squad: como o squad consome `tokens.json` como system prompt context? (→ Bloco 2.5)
- [ ] Auto-geração de variantes de logo (dark/light) via `sharp` + `svgo`: PoC necessário
- [ ] `company_logos` migration: backward compat durante transition para `company_logo_variants`?

---

### Fases de implementação sugeridas

| Fase | Escopo | Output |
|---|---|---|
| **MVP (Sprint 1-2)** | `company_brand_kits` table + API PATCH + editor cores + tipografia + export DTCG/CSS | Kit funcional mínimo |
| **Sprint 3** | Logo variants + auto-geração dark/mono via sharp | Logos completos |
| **Sprint 4** | alan-design-system integration (extração por URL) | Onboarding em 90s |
| **Sprint 5** | Satori preview inline + Remotion player preview | Preview em tempo real |
| **Sprint 6** | Tom de voz + integração com agentes (Bloco 2.5) | Copy com brand voice |
| **Futuro** | Remotion Lambda rendering, multi-brand avançado, Brandfetch, Figma sync | Produção full |

---

## Bloco 2.5 — Tom, Voz e Squads (MMOS Integration)

### ⚠️ PONTO CRÍTICO — Não implementar sem alinhamento

O `tone_of_voice` e os padrões de copy da marca **não são apenas campos de texto**. Eles são a base de como os squads de AI vão gerar conteúdo. Aqui entra a integração com o **MMOS Squad**.

### O que precisa acontecer
- O MMOS Squad (Meta-Mind OS) precisa ser integrado nesta aplicação
- Cada empresa vai ter sua própria configuração de squad (ou instância do squad) para geração de conteúdo
- O BrandKit alimenta o contexto dos agentes com:
  - Tom de voz
  - Personas aprovadas
  - Exemplos de copy da marca
  - Palavras proibidas
  - Estilo de storytelling preferido

### Investigações obrigatórias
- [ ] Como o MMOS Squad é estruturado atualmente? Quais arquivos/configs?
- [ ] Como integrar uma instância de squad por empresa dentro do Paperclip?
- [ ] O squad usa os mesmos agentes do Paperclip ou é isolado?
- [ ] System prompt de cada agente consome o BrandKit como contexto?
- [ ] Há um "Squad Manager" por empresa no DB?

---

## Bloco 3 — BrandPerson (Pessoas da Marca)

### Conceito
Cada empresa pode cadastrar as pessoas que são o "rosto" da marca — para que ao criar artes, thumbnails, vídeos, seja possível selecionar a foto correta da pessoa correta.

### Schema proposto
```typescript
company_brand_people
  id: uuid PK
  company_id: uuid FK (companies)
  
  -- Identidade
  name: text
  role: text              -- "CEO", "Fundadora", "Apresentadora", "Especialista"
  bio: text               -- texto livre, usado como contexto para agentes
  
  -- Fotos (múltiplas!)
  photos: via company_brand_person_photos (tabela filha)
    ├── asset_id: FK → assets
    ├── label: text           -- "fundo branco", "fundo escuro", "casual", "formal"
    ├── is_primary: bool
    └── tags: text[]
  
  -- Para uso em geração de conteúdo
  is_public_face: bool    -- rosto da marca (aparece em artes)
  is_active: bool
  sort_order: int
  
  -- Contexto para AI
  voice_style: text       -- como essa pessoa fala/escreve
  content_pillars: text[] -- temas dessa pessoa: ["tecnologia", "liderança"]
  
  created_at, updated_at
```

### Expansão identificada
- Pessoa pode ter **múltiplas fotos** com labels (fundo branco, formal, casual) — não só uma
- `voice_style` como contexto para quando o agente escreve na voz DESSA pessoa
- Integração com `ContentPiece.authorId` — pessoa pode ser autora do conteúdo

### Decisões fechadas (2026-05-30)

**1. Fotos → tabela filha `company_brand_person_photos` (DECIDIDO)**
Razão: pessoa pode ter múltiplos contextos de foto (formal, casual, fundo branco, cor, etc.), a face pode mudar ao longo do tempo e manter histórico é valioso. Consistência na geração de imagens exige granularidade por contexto. Tabela filha permite filtrar, indexar e evoluir sem reescrever a entidade pai.

**2. Relação empresa ↔ pessoa → N:1 (muitas pessoas por empresa) (DECIDIDO)**
Pessoa NÃO está vinculada a `user_id`. BrandPerson é qualquer rosto associado à empresa: CEO, colaborador, micro-influenciador de campanha pontual, apresentador. Não há vínculo obrigatório com usuários do sistema.

**3. Seleção de foto na UI → picker simples (MVP) (DECIDIDO)**
MVP: o usuário seleciona a foto manualmente ao criar conteúdo.

Futuro (documentado, não implementar agora): sistema completo de gestão de geração de imagem com composição por parâmetros — escala, resolução, estilo, enquadramento, contexto da foto, etc. O schema de `company_brand_person_photos` já deve ser projetado para suportar essa expansão (campos `tags`, `label`, `metadata` abertos).

---

## Bloco 4 — Social Accounts + Tráfego Pago

### Parte A: Contas Orgânicas (company_social_accounts)

#### Decisões fechadas (2026-05-30)

**Tokens OAuth → `company_secrets` (DECIDIDO — não duplicar)**
A tabela NÃO guarda `access_token`/`refresh_token` diretamente. Guarda apenas `secret_id` (FK → `company_secrets`). O cofre existente já garante: isolamento por `company_id`, versionamento (`company_secret_versions`), rotação (`last_rotated_at`), auditoria (`secret_access_events`). Evita qualquer risco de token vazar em query acidental.

**Métricas → Routine com cron trigger (DECIDIDO)**
Sync de `follower_count` e `avg_engagement_rate` é uma **Routine** (`routines` + `routine_triggers` com cron). Infraestrutura já existe e é madura. A tabela mantém `last_synced_at` como cache da última execução — atualizado pelo agente da Routine.

```typescript
company_social_accounts
  id, company_id, platform_id (FK → social_platforms)
  
  handle, display_name, profile_url, platform_account_id
  follower_count, avg_engagement_rate, last_synced_at
  
  -- OAuth via cofre (NUNCA token direto na tabela)
  secret_id: FK → company_secrets
  
  -- Config de conteúdo
  default_hashtags: text[], default_cta: text, timezone: text
  
  is_active, is_verified
  
  UNIQUE (company_id, platform_id, platform_account_id)
```

### Parte B: Tráfego Pago (⏸️ PAUSADO — fase futura)

**Decisão (2026-05-30):** Não implementar agora. Importante, mas não desbloqueia o restante do módulo. Retomar após MVP das contas orgânicas + Content Module estar rodando.

**⚠️ PONTO CRÍTICO quando retomar:** Integração direta com Meta via MCP.

O que precisa ser investigado:
- [ ] **Meta MCP** — que endpoints existem? Quais operações suporta? (criar campanha, ad set, ad, creative, audience)
- [ ] **Hierarquia Meta:** Campaign > Ad Set > Ad > Creative — como mapear para o DB
- [ ] Unificar `company_social_accounts` com contas de ads? Ou tabela separada `company_ad_accounts`?
- [ ] Além de Meta: Google Ads, TikTok Ads, LinkedIn Ads — fases futuras
- [ ] Como armazenar credenciais de ad accounts de forma segura? (já existe `company_secrets`!)
- [ ] Budget pacing e alertas — fazer desde o início ou fase futura?
- [ ] Attribution model — como rastrear conversões de ads para receita?

**Ad Account (rascunho baseado no CompanyOS):**
```typescript
company_ad_accounts
  id, company_id, platform_id (FK → social_platforms)
  external_id         -- ID da conta na plataforma (ex: act_123456)
  name, currency, timezone
  status: active | paused | disabled
  
  -- Credenciais via company_secrets
  secret_binding_id: FK → company_secret_bindings
  
  -- Budget
  monthly_budget_cents, daily_budget_cap_cents
  
  -- Métricas
  total_spend_cents_mtd, last_synced_at
```

### Investigações abertas (Bloco 4 completo)
- [ ] Meta MCP: documentação completa de endpoints disponíveis
- [ ] Usar `company_secrets` existente para armazenar tokens de ad accounts
- [ ] Modelo de hierarquia de campanhas: aqui no DB ou delegar 100% para a API da plataforma?
- [ ] Relatórios unificados cross-platform (Meta + Google + TikTok num dashboard)
- [ ] Rate limits e quotas por plataforma — armazenar e monitorar?

---

## Bloco 5 — Content Module (Produção de Conteúdo)

### Base: CompanyOS Content Operations v0.5

Os schemas estão definidos no CompanyOS. Adaptações para o Paperclip:

**Adaptação crítica:** `ContentPiece.primaryChannelId` aponta para `company_social_accounts.id` (não para `publication_channels` como no CompanyOS). Isso porque aqui as plataformas são metadata + accounts por empresa.

### Entidades confirmadas (do CompanyOS, a implementar)
```
content_calendars        (1:N por empresa, N:1 opcional com clients)
content_briefs           (brief estratégico — objetivo, audiência, tom, KPIs)
content_pieces           (entidade central — state machine IDEA→PUBLISHED)
content_assets           (imagens/vídeos — usa assets existente + BrandPerson)
content_reviews          (approval chain multi-level — Planable pattern)
content_performances     (métricas por peça/canal/período)
content_status_history   (audit trail de cada transição)
content_pipeline_tasks   (tasks automáticas por transição de status)
```

### Enums (a confirmar)
```
ContentType: ARTICLE, SOCIAL_POST, VIDEO_SHORT, VIDEO_LONG, PODCAST,
             NEWSLETTER, THREAD, CAROUSEL, INFOGRAPHIC, LANDING_PAGE,
             CASE_STUDY, EBOOK

ContentStatus: IDEA → BRIEF → IN_CREATION → IN_REVIEW → SCHEDULED → PUBLISHED → ARCHIVED
```

### Integrações futuras identificadas
- Remotion: renderizar ContentPiece + BrandKit → vídeo exportável
- Geração AI: agentes criam draft de ContentBrief e ContentPiece com base no BrandKit
- Cross-posting: uma ContentPiece → múltiplos company_social_accounts simultaneamente
- Agendamento: ContentPiece.scheduledAt → publicação direta via OAuth das contas

### Decisões fechadas (2026-05-30)

**1. Approval chain → por calendário (DECIDIDO)**
Cada calendário define seu próprio fluxo de aprovação. Isso permite que uma campanha de cliente exija aprovação diferente de uma campanha interna. `content_reviews` é configurado no nível do `content_calendars`.

**2. ContentAsset → tabela separada (DECIDIDO)**
Não reutiliza a tabela `assets` existente do Paperclip. Assets de conteúdo têm metadados específicos de plataforma (formato, dimensões, orientação, duração) que justificam tabela própria. Evita poluir `assets` com campos de domínio de conteúdo.

**3. Repurposing → fase futura (DECIDIDO)**
Será integrado a um projeto externo especializado nesse propósito. Não implementar agora. `parent_id` pode ser adicionado depois como campo nullable — migração simples.

**4. AI virality score → por empresa + camada global para Super Admin (DECIDIDO)**
Configurável por empresa (modelo, parâmetros, thresholds). Super Admin tem visão consolidada cross-empresa por nicho — permite identificar padrões do que performa em cada segmento de mercado e criar benchmarks por nicho. Implica:
- `company_ai_config` com modelo e parâmetros por empresa
- Tabela ou view agregada acessível ao Super Admin com scores por nicho

**5. Marketing Calendar → separado por empresa + panorama no Super Admin (DECIDIDO)**
`content_calendars` é por empresa. Super Admin tem acesso transversal a todos os calendários para visão de panorama geral — não gerencia, apenas observa padrões e performance cross-empresa.

---

## Ordem das Investigações (Próximos Passos)

### Antes de criar qualquer story, executar:

1. **[URGENTE] Investigar `instance_user_roles`** — Quais roles existem? Tem super admin?
2. **[URGENTE] Analisar AIOX Design System** — Estrutura de tokens para BrandKit
3. **[URGENTE] Rodar `alan-design-system` skill** em URLs de referência (a definir)
4. **[URGENTE] Investigar Meta MCP** — Endpoints, capacidades, autenticação
5. **[IMPORTANTE] Investigar MMOS Squad** — Como integrar com Paperclip
6. **[IMPORTANTE] Investigar `company_secrets`** — Como usá-lo para tokens de OAuth/Ads
7. **[IMPORTANTE] Verificar `instance_user_roles`** — Caminho para Super Admin

### Perguntas para alinhar com Chris (decisões pendentes)

- [ ] BrandKit: tabela separada (1:1) ou JSON no `companies`? 
- [ ] Redes sociais orgânicas e ad accounts: tabela única ou separada?
- [ ] Qual o MVP mínimo do Super Admin de Plataformas?
- [ ] MMOS: é integração no mesmo DB ou conexão externa?
- [ ] Remotion: onde fica o pipeline de renderização? No próprio servidor?
- [ ] Versioning do BrandKit? Empresa pode ter historico de identidades visuais?
- [ ] Multi-marca: uma empresa pode ter múltiplos brand kits? (agência gerenciando clientes)

---

## Mapa de Dependências entre Blocos

```
Super Admin (Bloco 0)
  └── libera plataformas para uso
       ↓
Social Platform Registry (Bloco 1)
  └── company_social_accounts (Bloco 4A)
       └── ContentPiece.primaryChannelId (Bloco 5)
  └── company_ad_accounts (Bloco 4B)

BrandKit (Bloco 2)
  ├── AIOX Design System (investigação)
  ├── alan-design-system skill (investigação)
  ├── Remotion pipeline (futuro)
  └── alimenta todos os agentes de geração de conteúdo

MMOS Squad (Bloco 2.5)
  └── consome BrandKit como contexto
  └── gera ContentBrief e ContentPiece

BrandPerson (Bloco 3)
  └── selecionável em ContentAsset (Bloco 5)
  └── author de ContentPiece (Bloco 5)
```

---

## Referências e Artefatos Existentes

| Artefato | Localização | Status |
|---|---|---|
| CompanyOS Content Operations v0.5 | `brainOS/03_projects/1_work/company-os/02_knowledge/CompanyOS-Master-Part3-Modules13-19.md` | Blueprint aprovado, 0% implementado |
| CompanyOS Marketing v0.5 | `brainOS/03_projects/1_work/company-os/02_knowledge/CompanyOS-Master-Part2-Modules5-12.md` | Blueprint |
| CompanyOS Ads Management v0.5 | Idem Part3 | Blueprint |
| Instagram Carousel Playbook | `brainOS/03_projects/1_work/company-os/02_knowledge/claude-instagram-carousel-generator-playbook.md` | Referência de tokens visuais |
| **Atlas Global de Formatos de Conteúdo v3.0** | `docs/references/global-content-formats-atlas.md` | ✅ Copiado — fonte primária para capabilities/copy_specs/image_specs por plataforma (Blocos 0, 1, 5) |
| Alan Design System skill | `~/.claude/skills/alan-design-system/` | Disponível para uso |
| Schema companies atual | `packages/db/src/schema/companies.ts` | Produção |
| company_logos | `packages/db/src/schema/company_logos.ts` | Produção |
| assets | `packages/db/src/schema/assets.ts` | Produção |
| company_secrets | `packages/db/src/schema/company_secrets.ts` | Produção — usar para tokens OAuth |
| instance_user_roles | `packages/db/src/schema/instance_user_roles.ts` | Verificar se tem super admin |

---

*Próxima ação: expandir cada bloco com as investigações, decidir as questões abertas, e só então criar as epics + stories.*
