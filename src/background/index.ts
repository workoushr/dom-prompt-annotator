import { ExtensionMessage } from '../types/annotation';
import { getPageState, savePageState } from '../utils/storage';
import {
  attachAndEmulateDevice,
  clearDeviceEmulation,
  getDeviceEmulationState,
  handleDebuggerDetach,
} from './debuggerManager';

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

  if (typeof tabId === 'number') {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.sidePanel &&
        typeof chrome.sidePanel.open === 'function'
      ) {
        await chrome.sidePanel.open({ tabId });
      }
    } catch {
      // Ignore if sidePanel.open fails
    }
  }

  if (tabUrl) {
    const currentState = await getPageState(tabUrl);
    const nextInspect = !currentState.inspectMode;
    await savePageState(tabUrl, { inspectMode: nextInspect });

    if (typeof tabId === 'number' && !isRestrictedTabUrl(tabUrl)) {
      await ensureContentScriptAndSendMessage(tabId, tabUrl, {
        type: 'SET_INSPECT_MODE',
        enabled: nextInspect,
        url: tabUrl,
      });
    }
  }
}

export interface ForwardToActiveTabMessage {
  type: 'FORWARD_TO_ACTIVE_TAB';
  payload: ExtensionMessage;
}

export async function resolveTargetTabId(
  explicitTabId?: number,
  sender?: chrome.runtime.MessageSender
): Promise<number | undefined> {
  if (typeof explicitTabId === 'number') {
    return explicitTabId;
  }
  if (typeof sender?.tab?.id === 'number') {
    return sender.tab.id;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs?.[0]?.id;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function handleRuntimeMessage(
  message: ExtensionMessage | ForwardToActiveTabMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  if (message.type === 'GET_PAGE_STATE') {
    const targetUrl = message.url || sender?.tab?.url || '';
    void getPageState(targetUrl).then(sendResponse);
    return true;
  }

  if (message.type === 'SET_DEVICE_EMULATION') {
    void resolveTargetTabId(message.tabId, sender).then(async (targetTabId) => {
      if (typeof targetTabId !== 'number') {
        sendResponse({ ok: false, error: 'No target tab found' });
        return;
      }
      try {
        const config = await attachAndEmulateDevice(targetTabId, message.config);
        sendResponse({ ok: true, config });
      } catch (err: unknown) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return true;
  }

  if (message.type === 'CLEAR_DEVICE_EMULATION') {
    void resolveTargetTabId(message.tabId, sender).then(async (targetTabId) => {
      if (typeof targetTabId !== 'number') {
        sendResponse({ ok: false, error: 'No target tab found' });
        return;
      }
      try {
        await clearDeviceEmulation(targetTabId);
        sendResponse({ ok: true });
      } catch (err: unknown) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return true;
  }

  if (message.type === 'GET_DEVICE_EMULATION') {
    void resolveTargetTabId(message.tabId, sender).then((targetTabId) => {
      if (typeof targetTabId !== 'number') {
        sendResponse({ ok: false, error: 'No target tab found' });
        return;
      }
      const config = getDeviceEmulationState(targetTabId);
      sendResponse({ ok: true, config });
    });
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
  const nonForwardedTypes = [
    'PAGE_STATE_UPDATED',
    'DEVICE_EMULATION_UPDATED',
    'SET_DEVICE_EMULATION',
    'CLEAR_DEVICE_EMULATION',
    'GET_DEVICE_EMULATION',
  ];
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

export function registerDebuggerListeners(): void {
  if (
    typeof chrome !== 'undefined' &&
    chrome.debugger &&
    chrome.debugger.onDetach?.addListener
  ) {
    chrome.debugger.onDetach.addListener((source, reason) => {
      void handleDebuggerDetach(source, reason);
    });
  }
}

export function registerBackgroundListeners(): void {
  void configureSidePanelBehavior();
  registerDebuggerListeners();

  if (typeof chrome === 'undefined') {
    return;
  }

  if (chrome.runtime?.onInstalled?.addListener) {
    chrome.runtime.onInstalled.addListener(() => {
      void configureSidePanelBehavior();
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
