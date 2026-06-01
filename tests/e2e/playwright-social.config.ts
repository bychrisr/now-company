import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Suíte dedicada de social accounts. Usamos uma porta diferente do default
// (3199) para permitir rodar lado a lado com a config principal, e um
// PAPERCLIP_HOME separado para isolar o DB embutido.
const PORT = Number(process.env.PAPERCLIP_E2E_SOCIAL_PORT ?? 3198);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PAPERCLIP_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "paperclip-e2e-home-social-")
);

// Esta env var é populada pelo globalSetup com a baseUrl do mock OAuth.
// Apontamos os três endpoints do Instagram para o mesmo mock — todos os
// paths consumidos pelo servidor estão implementados no fixture.
const mockBase = process.env.MOCK_OAUTH_BASE_URL ?? "";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "**/*social*.spec.ts",
    "**/*social-accounts*.spec.ts",
    "**/*super-admin*.spec.ts",
  ],
  timeout: 60_000,
  retries: 0,
  globalSetup: "./fixtures/social-global-setup.ts",
  globalTeardown: "./fixtures/social-global-setup.ts",
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: `pnpm paperclipai onboard --yes --run`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(PORT),
      PAPERCLIP_HOME,
      PAPERCLIP_INSTANCE_ID: "playwright-e2e-social",
      PAPERCLIP_BIND: "loopback",
      PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
      // Credenciais fake — em local_trusted + mock server elas não precisam ser reais.
      INSTAGRAM_APP_ID: "test_app_id",
      INSTAGRAM_APP_SECRET: "test_app_secret",
      INSTAGRAM_REDIRECT_URI: `${BASE_URL}/oauth/callback/instagram`,
      // Apontamos auth/token/graph para o mock OAuth iniciado em globalSetup.
      INSTAGRAM_AUTH_BASE_URL: mockBase,
      INSTAGRAM_TOKEN_API_URL: mockBase,
      INSTAGRAM_GRAPH_API_URL: mockBase,
    },
  },
  outputDir: "./test-results-social",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "./playwright-report-social" }],
  ],
});
