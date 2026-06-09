import { test, expect } from "@playwright/test";

/**
 * E2E: Super Admin platforms management (Story 1.8).
 *
 * Covers:
 *   AC1 — Super Admin acessa /instance/settings/platforms, desabilita uma
 *         plataforma e o estado persiste após refresh.
 *   AC2 — Empresa em /company/settings/social-accounts não vê plataformas
 *         desabilitadas pelo Super Admin na seção "Disponíveis".
 *
 * Em local_trusted mode, todas as requests já são autenticadas como admin,
 * então a navegação direta funciona sem fluxo de login.
 */

test.describe("Super Admin — platforms management", () => {
  test("AC1: disable platform persists after refresh", async ({ page }) => {
    await page.goto("/instance/settings/platforms");
    await page.waitForLoadState("networkidle");

    // data-testid="platform-row-{slug}" e data-platform-slug="{slug}" agora presentes na UI real.
    const platformRow = page
      .locator('[data-testid^="platform-row-"]')
      .or(page.locator("[data-platform-slug]"))
      .first();

    await expect(platformRow).toBeVisible({ timeout: 10_000 });

    // Capturamos o slug da primeira plataforma para usar nos asserts pós-refresh.
    const platformSlug =
      (await platformRow.getAttribute("data-platform-slug")) ??
      (await platformRow.getAttribute("data-testid")) ??
      "";
    expect(platformSlug).not.toBe("");

    // Toggle tem data-testid="platform-toggle" e role="switch" na UI real.
    const toggle = platformRow
      .getByRole("switch")
      .or(platformRow.locator('[data-testid="platform-toggle"]'))
      .first();
    await expect(toggle).toBeVisible();

    const wasChecked = await toggle.isChecked().catch(() => true);
    if (wasChecked) {
      await toggle.click();
    }

    // Aguardamos o request de update terminar antes de recarregar.
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");

    const refreshedRow = page
      .locator(`[data-platform-slug="${platformSlug}"]`)
      .or(page.locator(`[data-testid="${platformSlug}"]`))
      .first();
    const refreshedToggle = refreshedRow
      .getByRole("switch")
      .or(refreshedRow.locator('[data-testid="platform-toggle"]'))
      .first();

    await expect(refreshedToggle).toBeVisible();
    // Esperamos que o toggle continue desabilitado após o refresh.
    await expect(refreshedToggle).not.toBeChecked();
  });

  test("AC2: disabled platform absent from company connect list", async ({
    page,
  }) => {
    // Primeiro: garantir que pelo menos uma plataforma esteja desabilitada.
    await page.goto("/instance/settings/platforms");
    await page.waitForLoadState("networkidle");

    // data-testid="platform-row-{slug}" e data-platform-slug="{slug}" agora presentes na UI real.
    const platformRow = page
      .locator('[data-testid^="platform-row-"]')
      .or(page.locator("[data-platform-slug]"))
      .first();
    await expect(platformRow).toBeVisible({ timeout: 10_000 });

    const platformSlug =
      (await platformRow.getAttribute("data-platform-slug")) ??
      (await platformRow.getAttribute("data-testid")) ??
      "";

    // Toggle tem data-testid="platform-toggle" na UI real.
    const toggle = platformRow
      .getByRole("switch")
      .or(platformRow.locator('[data-testid="platform-toggle"]'))
      .first();

    if (await toggle.isChecked().catch(() => true)) {
      await toggle.click();
      await page.waitForLoadState("networkidle");
    }

    // Agora navega para a página da empresa e confirma que a plataforma
    // desabilitada não aparece nas "Disponíveis para conectar".
    await page.goto("/company/settings/social-accounts");
    await page.waitForLoadState("networkidle");

    // data-testid="available-platforms" e data-platform-slug="{slug}" agora presentes na UI real.
    const availableSection = page
      .locator('[data-testid="available-platforms"]')
      .or(page.getByRole("region", { name: /Disponíveis|Available/i }));

    if (await availableSection.count()) {
      await expect(
        availableSection.locator(`[data-platform-slug="${platformSlug}"]`)
      ).toHaveCount(0);
    } else {
      // Fallback: garantir que nenhum botão "Conectar" referencie esse slug.
      await expect(
        page.locator(`[data-connect-slug="${platformSlug}"]`)
      ).toHaveCount(0);
    }
  });
});
