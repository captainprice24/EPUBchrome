import { detectFormat, documentSizeLimit, mimeTypes } from "./document-types";
export async function driveImport(
  input: string,
  onProgress: (s: string) => void,
  signal: AbortSignal,
) {
  if (typeof chrome === "undefined" || !chrome.runtime?.getManifest)
    throw Error("Google Drive is available in the installed Chrome extension.");
  if (!chrome.runtime.getManifest().oauth2?.client_id)
    throw Error(
      "Google Drive is not configured in this build. See the Google Drive setup instructions in the project README. Local files work without an account.",
    );
  if (!chrome.identity?.getAuthToken)
    throw Error(
      "Chrome sign-in is unavailable. Check the extension permissions.",
    );
  const match = input.match(/\/d\/([\w-]+)/) || input.match(/[?&]id=([\w-]+)/);
  const id = match?.[1] || input.trim();
  if (!/^[\w-]{10,}$/.test(id))
    throw Error("Paste a Google Drive file link or file ID.");
  onProgress("Connecting to Google Drive…");
  const scopes = ["https://www.googleapis.com/auth/drive.readonly"];
  const signIn = async () => {
    const auth = await chrome.identity.getAuthToken({
      interactive: true,
      scopes,
    });
    const token = typeof auth === "string" ? auth : auth.token;
    if (!token) throw Error("Google sign-in did not return access.");
    return token;
  };
  let token = await signIn();
  let headers = { Authorization: `Bearer ${token}` };
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  const metadata = () =>
    fetch(base + "?fields=name,size,mimeType&supportsAllDrives=true", {
      headers,
      signal,
    });
  let metaResponse = await metadata();
  if (metaResponse.status === 401) {
    // Chrome caches tokens and can return one that has expired. Discard it
    // and sign in once more before reporting a permission problem.
    await chrome.identity.removeCachedAuthToken({ token });
    token = await signIn();
    headers = { Authorization: `Bearer ${token}` };
    metaResponse = await metadata();
  }
  if (!metaResponse.ok)
    throw Error(
      "Unable to access this Drive file. Check the account and file permissions.",
    );
  const meta = (await metaResponse.json()) as {
    name: string;
    size?: string;
    mimeType: string;
  };
  const format = detectFormat(meta.name, meta.mimeType);
  const limit = documentSizeLimit(format);
  if (Number(meta.size) > limit)
    throw Error(
      `This document exceeds the ${limit / 1024 ** 2} MB limit for its format.`,
    );
  const r = await fetch(base + "?alt=media&supportsAllDrives=true", {
    headers,
    signal,
  });
  if (!r.ok || !r.body)
    throw Error("The Drive download failed. Please try again.");
  const root = await navigator.storage.getDirectory();
  const name = "folio-drive-" + crypto.randomUUID();
  const h = await root.getFileHandle(name, { create: true });
  const writer = await h.createWritable();
  const reader = r.body.getReader();
  let received = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > limit)
        throw Error("This file exceeds the safety limit for its format.");
      await writer.write(part.value);
      onProgress(
        `Downloading… ${Math.round(received / 1024 / 1024)} MB${meta.size ? " / " + Math.ceil(Number(meta.size) / 1024 / 1024) + " MB" : ""}`,
      );
    }
    await writer.close();
    const f = await h.getFile();
    return {
      file: new File([f], meta.name, { type: mimeTypes[format] }),
      cleanup: () => root.removeEntry(name),
    };
  } catch (e) {
    await writer.abort().catch(() => {});
    await root.removeEntry(name).catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}
