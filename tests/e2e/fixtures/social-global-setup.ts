import { startMockOAuthServer, MockOAuthServer } from "./instagram-oauth-mock.js";

// Mantemos a referência do servidor mock em escopo de módulo para que o
// teardown consiga finalizá-lo após a suíte rodar.
let mockServer: MockOAuthServer | null = null;

export default async function globalSetup(): Promise<void> {
  const server = await startMockOAuthServer();
  process.env.MOCK_OAUTH_BASE_URL = server.baseUrl;
  mockServer = server;
}

export async function globalTeardown(): Promise<void> {
  mockServer?.stop();
  mockServer = null;
}
