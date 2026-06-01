# SMOKE-CHECKLIST — EPIC-001: Platform Foundation

Validação manual dos Success Criteria do EPIC-001 antes de fechar.
Story 1.8 (fechamento do epic) — executar após `pnpm run test` e `pnpm run test:e2e` passarem.

## Success Criteria

- [ ] **SC-1:** Super Admin consegue habilitar/desabilitar plataformas globalmente
  - Rota: `/instance/settings/platforms`
  - Verificar: toggle de status persiste após refresh

- [ ] **SC-2:** 15+ plataformas seed carregadas em `social_platforms` com specs completos
  - Verificar via DB: `SELECT count(*) FROM social_platforms;` → deve ser >= 15
  - Verificar via UI: `/instance/settings/platforms` mostra lista completa

- [ ] **SC-3:** Empresa consegue conectar uma conta Instagram via OAuth e o token vai parar em `company_secrets` (não na tabela)
  - Verificar: `SELECT secret_id FROM company_social_accounts WHERE handle IS NOT NULL;` → secret_id preenchido
  - Verificar: `SELECT value FROM company_social_accounts;` → sem campo value (coluna não existe)
  - Verificar: `SELECT status FROM company_secrets WHERE key LIKE 'oauth_instagram_%';` → status = 'active'

- [ ] **SC-4:** Routine de sync de métricas executa via cron e atualiza `last_synced_at`
  - Verificar: rotina existe na tabela `routines` após empresa conectar conta
  - Verificar: `routine_triggers` com cron configurado existe
  - Verificar: após executar sync manual, `last_synced_at` atualiza

- [ ] **SC-5:** Isolamento por `company_id` validado: empresa A não enxerga contas da empresa B
  - Coberto por: `server/src/__tests__/social-accounts.test.ts`
  - Verificar manualmente: `/companies/{idA}/social-accounts` com token da empresa B → 403

- [ ] **SC-6:** Zero duplicação de tokens fora do `company_secrets`
  - Verificar schema: `company_social_accounts` NÃO tem coluna `access_token` ou similar
  - Verificar via DB: todos os tokens estão em `company_secrets` + `company_secret_versions`

## Como executar smoke manual

```bash
# 1. Subir o servidor
pnpm dev

# 2. Acessar como Super Admin
# http://localhost:3100/instance/settings/platforms

# 3. Acessar como empresa de teste
# http://localhost:3100/company/settings/social-accounts

# 4. Verificar DB
# psql $DATABASE_URL -c "SELECT count(*) FROM social_platforms;"
```

## Resultado final

- [ ] Todos os SC marcados como validados
- [ ] `pnpm run typecheck` → 0 erros
- [ ] `pnpm run build` → build limpo
- [ ] `pnpm run test` → todos passando
- [ ] `pnpm run test:e2e` → todos passando (ou marcados como skip com justificativa)

**Data de validação:** ___________
**Validado por:** ___________
