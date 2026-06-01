import { test, expect } from "@playwright/test";
import {
  MOCK_INSTAGRAM_CODE,
  MOCK_INSTAGRAM_USERNAME,
} from "./fixtures/users.js";

/**
 * E2E: Company social accounts (Story 1.8).
 *
 * Cobre:
 *   AC3 — Empresa conecta Instagram via OAuth mockado, conta aparece na lista.
 *   AC4 — Sync manual atualiza last_synced_at.
 *   AC5 — Desconectar remove a conta da lista.
 *
 * Pré-requisito: mock OAuth server iniciado em globalSetup e env vars
 * INSTAGRAM_* apontando para esse mock (ver playwright-social.config.ts).
 */

// Helper — descobre o companyId via API para usar nas chamadas diretas.
// Em local_trusted o onboard cria 1 company default, então pegamos a primeira.
async function getCompanyId(request: import("@playwright/test").APIRequestContext, baseUrl: string): Promise<string> {
  const res = await request.get(`${baseUrl}/api/companies`);
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Array<{ id: string; name: string }>;
  expect(companies.length).toBeGreaterThan(0);
  return companies[0].id;
}

test.describe("Company — social accounts", () => {
  test("AC3: connect Instagram via mocked OAuth", async ({ page }) => {
    // Intercepta a navegação para o dialog do Facebook OAuth e redireciona
    // direto para o callback do servidor com o code mockado, evitando que o
    // browser tente alcançar facebook.com de verdade.
    await page.route("**/v21.0/dialog/oauth**", async (route) => {
      const url = new URL(route.request().url());
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state") ?? "";
      if (!redirectUri) {
        await route.fulfill({ status: 400, body: "missing redirect_uri" });
        return;
      }
      const callback = new URL(redirectUri);
      callback.searchParams.set("code", MOCK_INSTAGRAM_CODE);
      if (state) callback.searchParams.set("state", state);
      await route.fulfill({
        status: 302,
        headers: { Location: callback.toString() },
      });
    });

    await page.goto("/company/settings/social-accounts");
    await page.waitForLoadState("networkidle");

    // TODO: ajustar seletor após inspeção da UI real (Story 1.7).
    const connectButton = page
      .locator('[data-testid="connect-instagram"]')
      .or(page.getByRole("button", { name: /Conectar Instagram|Connect Instagram/i }))
      .first();

    await expect(connectButton).toBeVisible({ timeout: 10_000 });
    await connectButton.click();

    // Esperamos que o flow retorne para /company/settings/social-accounts
    // com a conta conectada visível.
    await page.waitForURL(/\/company\/settings\/social-accounts/, {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");

    // TODO: ajustar seletor — username da conta deve aparecer em algum
    // card/linha da lista de contas conectadas.
    await expect(
      page.locator(`text=${MOCK_INSTAGRAM_USERNAME}`).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("AC4: manual sync updates last_synced_at (via API)", async ({
    page,
  }) => {
    const baseUrl = page.url().startsWith("http")
      ? new URL(page.url()).origin
      : (process.env.BASE_URL ?? "http://127.0.0.1:3198");

    const companyId = await getCompanyId(page.request, baseUrl);

    // Lista as contas existentes — esperamos pelo menos uma após o AC3.
    // Se rodando isolado, este teste é skipped quando não há contas.
    const listRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/social-accounts`
    );
    expect(listRes.ok()).toBe(true);
    const accounts = (await listRes.json()) as Array<{
      id: string;
      lastSyncedAt: string | null;
    }>;

    test.skip(accounts.length === 0, "no social accounts to sync");

    const accountId = accounts[0].id;
    const before = accounts[0].lastSyncedAt;

    const syncRes = await page.request.post(
      `${baseUrl}/api/companies/${companyId}/social-accounts/${accountId}/sync`
    );
    expect(syncRes.ok()).toBe(true);

    // Buscamos novamente e validamos que last_synced_at mudou.
    const afterListRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/social-accounts`
    );
    const afterAccounts = (await afterListRes.json()) as Array<{
      id: string;
      lastSyncedAt: string | null;
    }>;
    const updated = afterAccounts.find((a) => a.id === accountId);
    expect(updated).toBeTruthy();
    expect(updated!.lastSyncedAt).not.toBe(before);
    expect(updated!.lastSyncedAt).not.toBeNull();
  });

  test("AC5: disconnect removes account from list", async ({ page }) => {
    // Pré-condição: pelo menos uma conta conectada. Reaproveitamos a do AC3
    // se ela ainda existe, senão skip.
    const baseUrl = page.url().startsWith("http")
      ? new URL(page.url()).origin
      : (process.env.BASE_URL ?? "http://127.0.0.1:3198");

    const companyId = await getCompanyId(page.request, baseUrl);
    const listRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/social-accounts`
    );
    const accounts = (await listRes.json()) as Array<{
      id: string;
      username: string | null;
    }>;
    test.skip(accounts.length === 0, "no social accounts to disconnect");

    await page.goto("/company/settings/social-accounts");
    await page.waitForLoadState("networkidle");

    // TODO: ajustar seletor — o botão de desconectar provavelmente fica em um
    // dropdown/menu de ações no card da conta.
    const disconnectButton = page
      .locator(`[data-testid="disconnect-${accounts[0].id}"]`)
      .or(
        page
          .getByRole("button", { name: /Desconectar|Disconnect/i })
          .first()
      );

    await expect(disconnectButton).toBeVisible({ timeout: 10_000 });
    await disconnectButton.click();

    // Modal de confirmação — clicamos no botão de confirmação.
    // TODO: ajustar seletor do modal.
    const confirmButton = page
      .getByRole("button", { name: /Confirmar|Confirm|Sim|Yes/i })
      .first();
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click();
    }

    await page.waitForLoadState("networkidle");

    // Validamos via API que a conta foi removida.
    const afterRes = await page.request.get(
      `${baseUrl}/api/companies/${companyId}/social-accounts`
    );
    const afterAccounts = (await afterRes.json()) as Array<{ id: string }>;
    expect(afterAccounts.find((a) => a.id === accounts[0].id)).toBeUndefined();
  });
});
