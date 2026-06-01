# Social Accounts E2E & Isolation Tests

Suíte de testes para o fluxo completo do EPIC-001 (Super Admin → OAuth → Sync → Disconnect) com isolamento multi-tenant.

## Pré-requisitos

- Node.js >= 20
- pnpm
- Playwright (instalado via `npx playwright install --with-deps chromium`)

## Estrutura dos testes

| Arquivo | Tipo | Cobertura |
|---------|------|-----------|
| `tests/e2e/super-admin-platforms.spec.ts` | E2E (Playwright) | AC1, AC2: Super Admin gerencia plataformas |
| `tests/e2e/company-social-accounts.spec.ts` | E2E (Playwright) | AC3, AC4, AC5: Connect/Sync/Disconnect |
| `server/src/__tests__/social-accounts.test.ts` | Integration (Vitest) | AC6, AC7, AC8: Isolamento multi-tenant |
| `server/src/__tests__/social-metrics-sync.test.ts` | Integration (Vitest) | AC10: Sync por company_id |

## Como rodar localmente

### Testes de integração (Vitest)
```bash
pnpm run test
```

### Testes E2E padrão (inclui social accounts)
```bash
pnpm run test:e2e
```

### Testes E2E — apenas social accounts (com mock OAuth)
```bash
pnpm run test:e2e:social
```

## Variáveis de ambiente para E2E

Os testes E2E de social accounts usam um mock server OAuth local. As seguintes env vars controlam as URLs:

| Variável | Padrão (produção) | Em testes |
|----------|-------------------|-----------|
| `INSTAGRAM_AUTH_BASE_URL` | `https://www.facebook.com` | URL do mock server |
| `INSTAGRAM_TOKEN_API_URL` | `https://api.instagram.com` | URL do mock server |
| `INSTAGRAM_GRAPH_API_URL` | `https://graph.instagram.com` | URL do mock server |
| `INSTAGRAM_APP_ID` | — (obrigatório em prod) | `test_app_id` |
| `INSTAGRAM_APP_SECRET` | — (obrigatório em prod) | `test_app_secret` |
| `INSTAGRAM_REDIRECT_URI` | — (obrigatório em prod) | `http://127.0.0.1:3198/oauth/callback/instagram` |

O mock server é iniciado automaticamente pelo `globalSetup` do `playwright-social.config.ts`.

## Como inspecionar falhas

### Screenshots e traces
```bash
# Ver relatório HTML após falha
npx playwright show-report tests/e2e/playwright-report

# Habilitar trace (já ativo em retry) — analisar com:
npx playwright show-trace tests/e2e/test-results/<test>/trace.zip
```

### Logs do servidor em teste
```bash
# O servidor de teste sobe em foreground durante os testes
# Adicione DEBUG=* para logs verbosos:
PAPERCLIP_LOG_LEVEL=debug pnpm run test:e2e:social
```

## Padrão de isolamento multi-tenant

Esta suíte estabelece o padrão mínimo para futuras features multi-tenant (EPIC-002, EPIC-003):

1. Empresa A não lê dados de B (GET)
2. Empresa A não modifica dados de B (PATCH/POST/DELETE)
3. Empresa A não executa ações em recursos de B (sync/trigger)
4. Cascade de delete não afeta dados de outras empresas
