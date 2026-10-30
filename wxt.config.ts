import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import { version } from "./package.json";
export default defineConfig({
  manifest: ({ mode }) => {
    const clientId = loadEnv(mode, process.cwd(), "WXT_").WXT_GOOGLE_CLIENT_ID;
    return {
      name: "Folio — Private document reader",
      description:
        "Read EPUB, PDF, DjVu, MOBI and Markdown privately. Bookmarks, highlights, fullscreen, local OCR and PDF printing.",
      version,
      action: { default_title: "Open Folio" },
      permissions: [
        "storage",
        "unlimitedStorage",
        ...(clientId ? ["identity"] : []),
      ],
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
