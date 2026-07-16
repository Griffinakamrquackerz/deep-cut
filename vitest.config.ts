import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  esbuild: { jsx: "automatic" }, // tsconfig uses jsx:preserve for Next; vitest needs a transform
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
