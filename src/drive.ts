export async function driveImport(
  input: string,
  onProgress: (s: string) => void,
  signal: AbortSignal,
) {
  if (typeof chrome === "undefined" || !chrome.identity?.getAuthToken)
    throw Error("Google Drive is available in the installed Chrome extension.");
  if (!chrome.runtime.getManifest().oauth2?.client_id)
    throw Error(
      "Google Drive is not configured in this build. See the Google Drive setup instructions in the project README. Local files work without an account.",
    );
  const match = input.match(/\/d\/([\w-]+)/) || input.match(/[?&]id=([\w-]+)/);
  const id = match?.[1] || input.trim();
  if (!/^[\w-]{10,}$/.test(id))
    throw Error("Paste a Google Drive file link or file ID.");
  onProgress("Connecting to Google Drive…");
  const auth = await chrome.identity.getAuthToken({
    interactive: true,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const token = typeof auth === "string" ? auth : auth.token;
  if (!token) throw Error("Google sign-in did not return access.");
  const headers = { Authorization: `Bearer ${token}` };
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  const metaResponse = await fetch(
    base + "?fields=name,size,mimeType&supportsAllDrives=true",
    { headers, signal },
  );
  if (!metaResponse.ok)
    throw Error(
      "Unable to access this Drive file. Check the account and file permissions.",
    );
  const meta = (await metaResponse.json()) as {
    name: string;
    size?: string;
    mimeType: string;
  };
  if (!meta.name.toLowerCase().endsWith(".epub"))
    throw Error("Choose an EPUB file from Drive.");
  if (Number(meta.size) > 1024 ** 3)
    throw Error("This version supports EPUB files up to 1 GB.");
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
      if (received > 1024 ** 3)
        throw Error("The file exceeds the 1 GB safety limit.");
      await writer.write(part.value);
      onProgress(
        `Downloading… ${Math.round(received / 1024 / 1024)} MB${meta.size ? " / " + Math.ceil(Number(meta.size) / 1024 / 1024) + " MB" : ""}`,
      );
    }
    await writer.close();
    const f = await h.getFile();
    return {
      file: new File([f], meta.name, { type: "application/epub+zip" }),
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
