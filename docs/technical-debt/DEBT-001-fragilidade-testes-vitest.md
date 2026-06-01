# Débito Técnico: Fragilidade na Configuração de Testes

**ID:** DEBT-001
**Data:** 2026-05-27
**Agente que Registrou:** @dev (Dex)
**Severidade:** Alta

## Título
Fragilidade nos Testes: Configuração do Vitest em múltiplos projetos causa falhas em cascata e dificulta o debug isolado.

## Descrição
A configuração de testes do projeto, que utiliza Vitest Workspaces (`projects` no `vitest.config.ts`), apresenta um comportamento problemático: ao tentar executar um único arquivo de teste (ex: `pnpm exec vitest run <file>`), o executor ignora o arquivo especificado e roda os testes de **todos** os projetos.

Isso torna o ciclo de feedback para o desenvolvedor extremamente lento, barulhento e frustrante, dificultando a depuração de um teste específico.

## Impacto
- **Perda de Produtividade:** Desenvolvedores perdem um tempo considerável esperando a suíte de testes inteira rodar para validar uma pequena mudança.
- **Atrito no Desenvolvimento:** A dificuldade em rodar testes isolados desincentiva a prática de TDD e a escrita de novos testes.
- **Dificuldade de Onboarding:** Novos desenvolvedores terão dificuldade em entender o comportamento inesperado da suíte de testes.

## Solução Sugerida
1.  **Investigar a Causa Raiz:** Entender por que o Vitest está ignorando o argumento de arquivo no modo de múltiplos projetos.
2.  **Criar um Script Wrapper:** Desenvolver um script em `package.json` (ex: `pnpm test:file <path>`) que construa e execute o comando correto, possivelmente usando o argumento `--project` dinamicamente para isolar o teste.
3.  **Documentar:** Documentar claramente no `CONTRIBUTING.md` ou `DEVELOPING.md` como executar testes isolados.

## Resolução (2026-06-01)
* **ID:** Resolvido por @dev (Dex) na branch `fix/debt-001-vitest-test-isolation`.
* **Implementação:** Foi criado o script wrapper em [scripts/run-vitest-file.mjs](file:///home/bychrisr/projects/work/now-company/scripts/run-vitest-file.mjs) que analisa dinamicamente em qual subprojeto do workspace o arquivo ou diretório de teste especificado se encontra e executa o Vitest apontando diretamente para o `--project` correspondente.
* **Comandos Adicionados no package.json:**
  - `pnpm test:file <path>`: Executa testes isoladamente para um arquivo ou diretório específico.
  - `pnpm test:project <project-name>`: Executa todos os testes de um subprojeto workspace específico.
* **Documentação:** O arquivo [doc/DEVELOPING.md](file:///home/bychrisr/projects/work/now-company/doc/DEVELOPING.md) foi atualizado detalhando o uso dos comandos.

