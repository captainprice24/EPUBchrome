export default defineBackground(() => {
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
