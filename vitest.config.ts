import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Browser runtime tests declare `// @vitest-environment jsdom` per file.
    restoreMocks: true,
  },
});
