import http from "node:http";
import { AddressInfo } from "node:net";
import {
  MOCK_INSTAGRAM_ACCESS_TOKEN,
  MOCK_INSTAGRAM_CODE,
  MOCK_INSTAGRAM_USER_ID,
  MOCK_INSTAGRAM_USERNAME,
} from "./users.js";

// Servidor HTTP mínimo (sem deps) que simula o fluxo OAuth do Instagram/Facebook
// para uso nos testes E2E. Mantemos a superfície mínima: apenas as rotas que o
// servidor da aplicação chama durante o fluxo OAuth de conexão.

export interface MockOAuthServer {
  baseUrl: string;
  stop: () => void;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendRedirect(res: http.ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

export async function startMockOAuthServer(): Promise<MockOAuthServer> {
  const server = http.createServer((req, res) => {
    try {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);
      const pathname = url.pathname;

      // 1. Auth dialog redirect — simula a tela do Facebook autorizando o app
      // e redireciona para o callback do servidor com um code fixo.
      if (req.method === "GET" && pathname === "/v21.0/dialog/oauth") {
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state") ?? "";
        if (!redirectUri) {
          sendJson(res, 400, { error: "missing redirect_uri" });
          return;
        }
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", MOCK_INSTAGRAM_CODE);
        if (state) callback.searchParams.set("state", state);
        sendRedirect(res, callback.toString());
        return;
      }

      // 2. Short-lived token exchange
      if (req.method === "POST" && pathname === "/oauth/access_token") {
        // Drenamos o body por compatibilidade, mas não usamos seu conteúdo.
        req.on("data", () => {});
        req.on("end", () => {
          sendJson(res, 200, {
            access_token: "mock_short_token",
            token_type: "bearer",
          });
        });
        return;
      }

      // 3. Long-lived token exchange (Graph API)
      if (req.method === "GET" && pathname === "/access_token") {
        sendJson(res, 200, {
          access_token: MOCK_INSTAGRAM_ACCESS_TOKEN,
          token_type: "bearer",
          expires_in: 5183944,
        });
        return;
      }

      // 4. Profile lookup
      if (req.method === "GET" && pathname === "/me") {
        sendJson(res, 200, {
          id: MOCK_INSTAGRAM_USER_ID,
          username: MOCK_INSTAGRAM_USERNAME,
          name: "Test Account",
        });
        return;
      }

      sendJson(res, 404, { error: "not_found", path: pathname });
    } catch (err) {
      // Nunca deixar o servidor de mock derrubar o test runner — logamos e
      // respondemos 500 para o servidor sob teste ver o erro.
      // eslint-disable-next-line no-console
      console.error("[mock-oauth] handler error:", err);
      sendJson(res, 500, { error: "mock_server_error" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    stop: () => {
      server.close();
    },
  };
}
