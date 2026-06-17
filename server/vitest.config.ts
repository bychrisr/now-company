import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    isolate: true,
    // Em CI usa 1 worker (comportamento original); local usa até 3 (4 CPUs disponíveis, 1 reservado pro SO)
    maxConcurrency: process.env.CI ? 1 : 3,
    maxWorkers: process.env.CI ? 1 : 3,
    minWorkers: 1,
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
        // Seguro paralelizar: embedded postgres usa mkdtempSync (dir único) + getAvailablePort() (porta única) por instância
        maxForks: process.env.CI ? 1 : 3,
        minForks: 1,
      },
    },
    sequence: {
      concurrent: false,
      hooks: "list",
    },
    setupFiles: ["./src/__tests__/setup-supertest.ts"],
  },
});
