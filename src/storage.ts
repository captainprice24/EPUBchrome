export async function storageStatus(requestPersistence = false) {
  if (requestPersistence)
    await navigator.storage?.persist?.().catch(() => false);
  const [estimate, persistent] = await Promise.all([
    navigator.storage?.estimate?.() || Promise.resolve({ usage: 0, quota: 0 }),
    navigator.storage?.persisted?.() || Promise.resolve(false),
  ]);
  const unlimited =
    typeof chrome !== "undefined" &&
    !!chrome.runtime?.id &&
    (await chrome.permissions
      .contains({ permissions: ["unlimitedStorage"] })
      .catch(() => false));
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0,
    persistent: persistent || unlimited,
  };
}
