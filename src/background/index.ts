import { ExtensionMessage } from '../types/annotation';
import { clearPageState, getPageState, savePageState } from '../utils/storage';

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'devtools://',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
];

export function isRestrictedTabUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') {
    return true;
  }
  const normalized = url.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return RESTRICTED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Grants content scripts access to `chrome.storage.session`. Session storage
 * defaults to trusted contexts only, and content scripts need this to read and
 * clear page state.
 */
export async function ensureSessionStorageAccess(): Promise<void> {
  try {
    if (typeof chrome === 'undefined') {
      return;
    }
    const session = chrome.storage?.session;
    if (!session || typeof session.setAccessLevel !== 'function') {
      return;
    }
    await session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
  } catch {
    // Ignore errors outside Chrome extension environment or unsupported versions
  }
}

export async function configureSidePanelBehavior(): Promise<void> {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.sidePanel &&
      typeof chrome.sidePanel.setPanelBehavior === 'function'
    ) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {
    // Ignore errors outside Chrome extension environment or unsupported browser versions
  }
}

export async function ensureContentScriptAndSendMessage(
  tabId: number,
  url: string | undefined,
  message: ExtensionMessage
): Promise<unknown> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
    return undefined;
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content Script may not be injected yet on an already-open tab
    if (
      !isRestrictedTabUrl(url) &&
      chrome.scripting &&
      typeof chrome.scripting.executeScript === 'function'
    ) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        return await chrome.tabs.sendMessage(tabId, message);
      } catch {
        // Ignore if injection or retry fails on restricted/closed tab
      }
    }
    return undefined;
  }
}

export async function handleActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab?.id;
  const tabUrl = tab?.url;

  if (!tabUrl || isRestrictedTabUrl(tabUrl)) {
    return;
  }

  // The action always opens the side panel and re-arms inspect mode; it never
  // toggles OFF so repeated clicks stay idempotent.
  await savePageState(tabUrl, { isVisible: true, inspectMode: true });

  if (typeof tabId === 'number') {
    await ensureContentScriptAndSendMessage(tabId, tabUrl, {
      type: 'SET_INSPECT_MODE',
      enabled: true,
      url: tabUrl,
    });
  }
}

export interface ForwardToActiveTabMessage {
  type: 'FORWARD_TO_ACTIVE_TAB';
  payload: ExtensionMessage;
}

export function handleRuntimeMessage(
  message: ExtensionMessage | ForwardToActiveTabMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  if (message.type === 'ENSURE_STATE_ACCESS') {
    void ensureSessionStorageAccess().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'GET_PAGE_STATE') {
    const targetUrl = message.url || sender?.tab?.url || '';
    void getPageState(targetUrl).then(sendResponse);
    return true;
  }

  if (message.type === 'FORWARD_TO_ACTIVE_TAB' && message.payload) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(async (tabs) => {
          const activeTab = tabs?.[0];
          if (activeTab && typeof activeTab.id === 'number') {
            const response = await ensureContentScriptAndSendMessage(
              activeTab.id,
              activeTab.url,
              message.payload
            );
            sendResponse(response);
          } else {
            sendResponse(undefined);
          }
        })
        .catch(() => {
          sendResponse(undefined);
        });
      return true;
    }
    return false;
  }

  // If the Side Panel sends a tab-targeted message via runtime.sendMessage (where sender.tab is undefined),
  // forward it to the active tab automatically.
  const nonForwardedTypes = ['PAGE_STATE_UPDATED', 'ENSURE_STATE_ACCESS'];
  if (!sender?.tab && !nonForwardedTypes.includes(message.type)) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(async (tabs) => {
          const activeTab = tabs?.[0];
          if (activeTab && typeof activeTab.id === 'number') {
            const response = await ensureContentScriptAndSendMessage(
              activeTab.id,
              activeTab.url,
              message as ExtensionMessage
            );
            sendResponse(response);
          } else {
            sendResponse(undefined);
          }
        })
        .catch(() => {
          sendResponse(undefined);
        });
      return true;
    }
  }

  return false;
}

export function registerBackgroundListeners(): void {
  void ensureSessionStorageAccess();
  void configureSidePanelBehavior();

  if (typeof chrome === 'undefined') {
    return;
  }

  if (chrome.runtime?.onInstalled?.addListener) {
    chrome.runtime.onInstalled.addListener(() => {
      void ensureSessionStorageAccess();
      void configureSidePanelBehavior();
    });
  }

  if (chrome.tabs?.onUpdated?.addListener) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'loading') {
        return;
      }
      // Clear the incoming/current URL key so a reload or navigation never
      // resurrects annotations from the in-memory session store.
      const urls = new Set(
        [changeInfo.url, tab?.url].filter(
          (url): url is string => Boolean(url) && !isRestrictedTabUrl(url)
        )
      );
      for (const url of urls) {
        void clearPageState(url);
      }
    });
  }

  if (chrome.action?.onClicked?.addListener) {
    chrome.action.onClicked.addListener((tab) => {
      void handleActionClicked(tab);
    });
  }

  if (chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }
}

registerBackgroundListeners();
