// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanySocialAccounts } from "./CompanySocialAccounts";

const listAccountsMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() => vi.fn());
const disconnectMock = vi.hoisted(() => vi.fn());
const syncMock = vi.hoisted(() => vi.fn());
const listPlatformsMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/social-accounts", () => ({
  socialAccountsApi: {
    list: (companyId: string) => listAccountsMock(companyId),
    connect: (companyId: string, slug: string) => connectMock(companyId, slug),
    disconnect: (companyId: string, id: string) => disconnectMock(companyId, id),
    sync: (companyId: string, id: string) => syncMock(companyId, id),
  },
}));

vi.mock("@/api/socialPlatforms", () => ({
  socialPlatformsApi: {
    list: () => listPlatformsMock(),
  },
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: { id: "company-1", name: "Test Co" },
    companies: [],
    setSelectedCompanyId: vi.fn(),
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({
    setBreadcrumbs: vi.fn(),
    mobileToolbar: null,
    setMobileToolbar: vi.fn(),
  }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("@/lib/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

const ACCOUNT_ACTIVE = {
  id: "acc-1",
  companyId: "company-1",
  platformId: "plat-1",
  platformSlug: "instagram",
  platformName: "Instagram",
  handle: "testbrand",
  displayName: "Test Brand",
  profileUrl: null,
  platformAccountId: null,
  followerCount: 5200,
  avgEngagementRate: 0.034,
  lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  defaultHashtags: null,
  defaultCta: null,
  timezone: null,
  isActive: true,
  isVerified: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PLATFORM_ENABLED = {
  id: "plat-2",
  slug: "twitter",
  name: "Twitter / X",
  category: "social",
  status: "enabled" as const,
  sortOrder: 2,
  capabilities: {},
  copySpecs: {},
  imageSpecs: {},
  iconUrl: null,
  description: "Twitter platform",
  websiteUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Rastreamento de roots para unmount seguro no afterEach
let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

async function renderWithProviders(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  activeContainer = container;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
  activeRoot = root;

  return { container, root };
}

describe("CompanySocialAccounts", () => {
  beforeEach(() => {
    listAccountsMock.mockResolvedValue([ACCOUNT_ACTIVE]);
    listPlatformsMock.mockResolvedValue([PLATFORM_ENABLED]);
    connectMock.mockResolvedValue({ authUrl: "https://example.com/oauth" });
    disconnectMock.mockResolvedValue(undefined);
    syncMock.mockResolvedValue({ ...ACCOUNT_ACTIVE, lastSyncedAt: new Date().toISOString() });
  });

  afterEach(async () => {
    if (activeRoot) {
      await act(async () => { activeRoot!.unmount(); });
      activeRoot = null;
    }
    if (activeContainer) {
      activeContainer.remove();
      activeContainer = null;
    }
    vi.clearAllMocks();
  });

  it("renders page heading", async () => {
    const { container } = await renderWithProviders(<CompanySocialAccounts />);
    expect(container.textContent).toContain("Redes Sociais");
  });

  it("shows connected account after data loads", async () => {
    const { container } = await renderWithProviders(<CompanySocialAccounts />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("@testbrand");
    }, { timeout: 2000 });
  });

  it("shows available platform for connection", async () => {
    const { container } = await renderWithProviders(<CompanySocialAccounts />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Twitter / X");
    }, { timeout: 2000 });
  });

  it("does not show inactive account in connected list", async () => {
    listAccountsMock.mockResolvedValue([{ ...ACCOUNT_ACTIVE, isActive: false }]);
    const { container } = await renderWithProviders(<CompanySocialAccounts />);
    // Aguarda queries resolverem (heading sempre visível)
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Nenhuma conta conectada");
    }, { timeout: 2000 });
    expect(container.textContent).not.toContain("@testbrand");
  });

  it("calls connect API and redirects on connect button click", async () => {
    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
    });

    const { container } = await renderWithProviders(<CompanySocialAccounts />);

    // Aguarda plataforma aparecer
    await vi.waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Conectar",
      );
      expect(btn).toBeTruthy();
    }, { timeout: 2000 });

    const connectBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Conectar",
    );
    await act(async () => { connectBtn!.click(); });
    await vi.waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith("company-1", "twitter");
    });
    expect(window.location.href).toBe("https://example.com/oauth");

    Object.defineProperty(window, "location", { value: { href: originalHref }, writable: true });
  });
});
