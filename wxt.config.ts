import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import { version } from "./package.json";
export default defineConfig({
  manifest: ({ mode }) => {
    const clientId = loadEnv(mode, process.cwd(), "WXT_").WXT_GOOGLE_CLIENT_ID;
    return {
      name: "Folio — Private book library",
      description:
        "A private EPUB-first book library with MOBI, PDF, DjVu and Markdown support, bookmarks, highlights and fullscreen reading.",
      version,
      // PDF.js 6 relies on Map.prototype.getOrInsertComputed (Chrome 145) and
      // Math.sumPrecise (Chrome 147) without polyfills.
      minimum_chrome_version: "147",
      homepage_url: "https://captainprice24.github.io/EPUBchrome/",
      action: {
        default_title: "Open Folio",
        default_icon: {
          16: "icon/16.png",
          32: "icon/32.png",
          48: "icon/48.png",
          128: "icon/128.png",
        },
      },
      // The library lives in IndexedDB; chrome.storage is not used.
      permissions: ["unlimitedStorage", ...(clientId ? ["identity"] : [])],
      ...(clientId
        ? { host_permissions: ["https://www.googleapis.com/*"] }
        : {}),
      ...(clientId
        ? {
            oauth2: {
              client_id: clientId,
              scopes: ["https://www.googleapis.com/auth/drive.readonly"],
            },
          }
        : {}),
      content_security_policy: {
        extension_pages:
          "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'",
      },
    };
  },
});
