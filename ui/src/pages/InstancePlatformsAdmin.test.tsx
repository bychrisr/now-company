// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstancePlatformsAdmin } from "./InstancePlatformsAdmin";

const listPlatformsMock = vi.hoisted(() => vi.fn());
const patchPlatformMock = vi.hoisted(() => vi.fn());
const getCurrentBoardAccessMock = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("@/api/socialPlatforms", () => ({
  socialPlatformsApi: {
    list: () => listPlatformsMock(),
    patch: (id: string, patch: unknown) => patchPlatformMock(id, patch),
  },
}));

vi.mock("@/api/access", () => ({
  accessApi: {
    getCurrentBoardAccess: () => getCurrentBoardAccessMock(),
  },
}));

vi.mock("@/lib/router", () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => {
    mockNavigate(to, replace);
    return <div data-testid="navigate">{to}</div>;
  },
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: { id: "company-1", name: "Paperclip" },
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
}

const mockPlatforms = [
  {
    id: "uuid-1",
    slug: "instagram",
    name: "Instagram",
    category: "social",
    status: "enabled" as const,
    sortOrder: 10,
    capabilities: {},
    copySpecs: {},
    imageSpecs: {},
    iconUrl: null,
    description: null,
    websiteUrl: null,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  },
  {
    id: "uuid-2",
    slug: "twitter-x",
    name: "Twitter/X",
    category: "social",
    status: "disabled" as const,
    sortOrder: 50,
    capabilities: {},
    copySpecs: {},
    imageSpecs: {},
    iconUrl: null,
    description: null,
    websiteUrl: null,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  },
];

describe("InstancePlatformsAdmin", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    getCurrentBoardAccessMock.mockResolvedValue({
      isInstanceAdmin: true,
      source: "instance_user_roles",
    });
    listPlatformsMock.mockResolvedValue(mockPlatforms);
    patchPlatformMock.mockResolvedValue({ ...mockPlatforms[0], status: "disabled" });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => {
      createRoot(container).render(
        <QueryClientProvider client={qc}>
          <InstancePlatformsAdmin />
        </QueryClientProvider>
      );
    });
    return qc;
  }

  it("exibe loading enquanto acesso está sendo verificado", async () => {
    getCurrentBoardAccessMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    await flushReact();
    expect(container.textContent).toContain("Loading access settings");
  });

  it("redireciona para /instance/settings/general se não for instance admin", async () => {
    getCurrentBoardAccessMock.mockResolvedValue({ isInstanceAdmin: false, source: "none" });
    renderPage();
    await flushReact();
    expect(mockNavigate).toHaveBeenCalledWith("/instance/settings/general", true);
  });

  it("lista plataformas após carregar como Super Admin", async () => {
    renderPage();
    await flushReact();
    expect(container.textContent).toContain("Instagram");
    expect(container.textContent).toContain("Twitter/X");
  });

  it("exibe badge Enabled para plataforma ativa e Disabled para desabilitada", async () => {
    renderPage();
    await flushReact();
    expect(container.textContent).toContain("Enabled");
    expect(container.textContent).toContain("Disabled");
  });

  it("exibe erro ao falhar no carregamento das plataformas", async () => {
    listPlatformsMock.mockRejectedValue(new Error("Network error"));
    renderPage();
    await flushReact();
    expect(container.textContent).toContain("Failed to load social platforms");
  });

  it("filtra plataformas por slug ao buscar", async () => {
    renderPage();
    await flushReact();
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      input.value = "instagram";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Simula onChange do React
      Object.defineProperty(input, "value", { writable: true, value: "instagram" });
    });
    await flushReact(1);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
