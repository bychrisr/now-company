import { defineConfig } from "vitest/config";
import projects from "./vitest.projects.json";

export default defineConfig({
  test: {
    projects,
  },
});
