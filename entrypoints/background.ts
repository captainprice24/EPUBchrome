export default defineBackground(() => {
  // Chrome keeps new toolbar icons inside the extensions menu, so a fresh
  // installation would otherwise show nothing. Updates stay silent.
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === chrome.runtime.OnInstalledReason.INSTALL)
      void chrome.tabs.create({ url: chrome.runtime.getURL("/reader.html") });
  });
  chrome.action.onClicked.addListener(async () => {
    const url = chrome.runtime.getURL("/reader.html");
    // Reuse an open reader tab. getContexts lists only this extension's own
    // pages, so no "tabs" permission (and install warning) is needed.
    const existing = (
      await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.TAB],
      })
    ).find((context) => context.documentUrl?.startsWith(url));
    if (existing && existing.tabId >= 0) {
      await chrome.tabs.update(existing.tabId, { active: true });
      if (existing.windowId >= 0)
        await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url });
  });
});
