import { defineConfig } from "wxt";
const clientId = process.env.WXT_GOOGLE_CLIENT_ID;
export default defineConfig({
  manifest: {
    name: "Folio — EPUB reading room",
    description:
      "A private reading room for EPUBs. Chapters, bookmarks, highlights, local OCR and PDF printing.",
    version: "0.1.0",
    action: { default_title: "Open Folio" },
    permissions: ["storage", "identity"],
    host_permissions: ["https://www.googleapis.com/*"],
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
  },
});
