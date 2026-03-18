import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/ai",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Stub optional peer deps from @standard-community/standard-json
      effect: resolve(__dirname, "src/stubs/empty.ts"),
      sury: resolve(__dirname, "src/stubs/empty.ts"),
      "@valibot/to-json-schema": resolve(__dirname, "src/stubs/empty.ts"),
    },
  },
  build: {
    outDir: "out",
  },
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
});
