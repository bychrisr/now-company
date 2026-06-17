#!/usr/bin/env -S node --import tsx
// Sidecar process que mantém vivo o postgres compartilhado usado pela suite de testes serializados.
//
// Por que um processo separado: o run-vitest-stable.mjs roda cada arquivo de teste em um spawnSync
// distinto. Um globalSetup do Vitest morreria entre processos filhos. Este sidecar persiste durante
// todo o loop serializado — sobe o postgres + template UMA vez, e só encerra ao receber SIGTERM/SIGINT.
//
// Protocolo de comunicação com o pai (run-vitest-stable.mjs):
//   1. Sidecar sobe o postgres e cria o template (paperclip_template) com migrations aplicadas.
//   2. Sidecar imprime em stdout uma linha: "SHARED_PG_READY <adminUrl>".
//   3. Pai lê essa linha, exporta a URL via env PAPERCLIP_SHARED_TEST_PG_URL para os testes.
//   4. Ao final do loop, pai envia SIGTERM. Sidecar faz teardown e sai com código 0.

import { startSharedTemplatePostgres, type SharedTemplatePostgres } from "./test-embedded-postgres.js";

// Prefixo da linha de "pronto" que o pai procura em stdout. Mudanças aqui exigem ajuste no .mjs.
const READY_PREFIX = "SHARED_PG_READY ";

async function main(): Promise<void> {
  let shared: SharedTemplatePostgres | null = null;
  let shuttingDown = false;

  // Teardown idempotente: pode ser chamado por sinal ou por erro; só executa uma vez.
  const shutdown = async (exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await shared?.stop();
    } catch (error) {
      // Nunca silenciar: loga em stderr. Mesmo com falha de teardown, encerramos o processo.
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[shared-template-pg-sidecar] Erro no teardown: ${message}\n`);
    } finally {
      process.exit(exitCode);
    }
  };

  // Registra handlers ANTES de subir o postgres, para não vazar o processo caso receba sinal durante o boot.
  process.on("SIGTERM", () => void shutdown(0));
  process.on("SIGINT", () => void shutdown(0));

  try {
    shared = await startSharedTemplatePostgres();
    // Sinaliza ao pai que está pronto e entrega a connection string admin.
    process.stdout.write(`${READY_PREFIX}${shared.adminUrl}\n`);
  } catch (error) {
    // Falha ao subir: reporta e encerra com código não-zero para o pai abortar a suite.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[shared-template-pg-sidecar] Falha ao iniciar postgres compartilhado: ${message}\n`);
    await shutdown(1);
    return;
  }

  // Mantém o event loop vivo indefinidamente até receber um sinal de parada (SIGTERM/SIGINT).
  // Sem unref(): o processo NÃO deve sair sozinho — só encerra via shutdown() acionado por sinal.
  setInterval(() => {}, 1 << 30);
}

void main();
