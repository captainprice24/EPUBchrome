import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "web",
  base: "/EPUBchrome/",
  publicDir: "../public",
  build: {
    outDir: "../.output/pages",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve("web/index.html"),
        // Linked from the Chrome Web Store listing as the privacy policy.
        privacy: resolve("web/privacy.html"),
      },
    },
  },
});
