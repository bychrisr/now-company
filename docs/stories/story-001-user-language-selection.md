# Story: User-Selectable Language Settings - Brownfield Addition

**User Story:**
Como usuário do Paperclip,
eu quero poder selecionar meu idioma de preferência nas configurações de perfil,
para que a interface seja exibida no idioma que eu me sinto mais confortável.

**Contexto da Story:**
*   **Integração:** `ui/src/pages/ProfileSettings.tsx`, `ui/src/i18n/index.ts`, `packages/db/src/schema/auth.ts`.
*   **Tecnologia:** React (hook `useTranslation`), i18next, TanStack Query, Drizzle ORM.
*   **Padrão:** Seguir o padrão de mutação de perfil já existente para `displayName` e `image`.
*   **Pontos de Contato:** Persistência no banco de dados (tabela `user` no schema de auth) e reatividade do i18n na troca de idioma.

**Critérios de Aceitação:**
1.  **Backend:** Adicionar coluna `locale` na tabela `user` (default: 'en').
2.  **API:** Atualizar as rotas de perfil para suportar a leitura e escrita do campo `locale`.
3.  **UI (Perfil):** Exibir um componente `Select` na página de Perfil com a lista de idiomas suportados.
4.  **UI (Reatividade):** Atualizar o idioma da interface imediatamente após a troca (chamando `i18n.changeLanguage`).
5.  **Persistência:** O idioma selecionado deve ser carregado do perfil do usuário durante o boot da aplicação.
6.  **Qualidade:** Garantir que o `typecheck` e os testes de `locale-validation` continuem passando.

**Notas Técnicas:**
*   **Schema:** Alterar `packages/db/src/schema/auth.ts` para incluir `locale: text("locale").notNull().default("en")`.
*   **Locales:** Usar o `supportedLocales` definido em `ui/src/i18n/locales.ts`.
*   **Migração:** Gerar migração Drizzle para o novo campo.

---

**Riscos e Compatibilidade:**
*   **Risco:** Inconsistência entre o idioma do backend e o do frontend.
*   **Mitigação:** Escopo limitado à tradução da UI nesta fase.

---
**Status:** **InProgress**

---

## Tasks

- [ ] **Task 1: Backend Implementation**
    - [ ] Add `locale` column to `users` table in `packages/db/src/schema/auth.ts`
    - [ ] Generate Drizzle migration
    - [ ] Apply migration to local database
- [ ] **Task 2: API Integration**
    - [ ] Update profile schema/types to include `locale`
    - [ ] Update profile update endpoint to handle `locale`
- [ ] **Task 3: UI Implementation**
    - [ ] Add `LanguageSelect` component to `ProfileSettings.tsx`
    - [ ] Integrate with `useTranslation` and `changeLanguage`
    - [ ] Ensure persistence on boot
- [ ] **Task 4: Validation & Quality**
    - [ ] Run `typecheck`
    - [ ] Run `locale-validation` tests
    - [ ] Verify CodeRabbit quality check

---

## Dev Agent Record

### Agent Model Used
Gemini 2.0 Flash (CLI YOLO Mode)

### Debug Log
- [2026-05-27] Implementation started. Initializing story structure.

### Completion Notes
- (Pending)

### File List
- `docs/stories/story-001-user-language-selection.md` (Updated status and tasks)

### Change Log
| Date | Version | Description | Agent |
| :--- | :--- | :--- | :--- |
| 2026-05-27 | 0.1.0 | Development started (YOLO mode) — Status: Ready → InProgress | @dev |

---

**Próximo Passo:** Executar Task 1 - Backend.

