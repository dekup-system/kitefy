import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // PGlite mantém um banco por arquivo de teste; paralelismo entre arquivos
    // é seguro porque cada worker cria a própria instância em memória.
    pool: "forks",
    reporters: ["default"],
  },
});
