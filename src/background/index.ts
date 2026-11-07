import { getPageState } from '../utils/storage';

// Minimal background service worker placeholder for Phase 1
if (typeof chrome !== 'undefined' && chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Ignore outside Chrome extension runtime
    });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_STATE') {
      const targetUrl = message.url || sender.tab?.url || '';
      getPageState(targetUrl).then(sendResponse);
      return true;
    }
    return false;
  });
}
