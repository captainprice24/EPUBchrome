import { defineConfig } from "vite";
export default defineConfig({
  root: "web",
  base: "/EPUBchrome/",
  publicDir: "../public",
  build: { outDir: "../.output/pages", emptyOutDir: true },
});
