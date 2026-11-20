import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureContentScriptAndSendMessage,
  handleActionClicked,
  handleRuntimeMessage,
  isRestrictedTabUrl,
  registerBackgroundListeners,
} from '../index';
import {
  getPageState,
  resetMemoryStoreForTests,
  savePageState,
} from '../../utils/storage';
import {
  loadUiPreferences,
  resetUiPreferencesForTests,
  saveInspectMode,
} from '../../utils/preferences';

describe('Background Service Worker (src/background/index.ts)', () => {
  beforeEach(() => {
    resetMemoryStoreForTests();
    resetUiPreferencesForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('identifies restricted Chrome and browser internal URLs accurately', () => {
    expect(isRestrictedTabUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedTabUrl('chrome-extension://abc123/panel.html')).toBe(
      true
    );
    expect(isRestrictedTabUrl('about:blank')).toBe(true);
    expect(isRestrictedTabUrl('edge://settings')).toBe(true);
    expect(isRestrictedTabUrl('')).toBe(true);
    expect(isRestrictedTabUrl(undefined)).toBe(true);

    expect(isRestrictedTabUrl('https://example.com/dashboard')).toBe(false);
    expect(isRestrictedTabUrl('http://localhost:3000/app')).toBe(false);
  });

  it('initializes session storage access on install without touching chrome.sidePanel', async () => {
    const setAccessLevelMock = vi.fn().mockResolvedValue(undefined);
    let installedCallback: (() => void) | null = null;

    (globalThis as Record<string, unknown>).chrome = {
      storage: {
        session: {
          setAccessLevel: setAccessLevelMock,
        },
      },
      runtime: {
        onInstalled: {
          addListener: vi.fn((cb: () => void) => {
            installedCallback = cb;
          }),
        },
        onMessage: {
          addListener: vi.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: vi.fn(),
        },
      },
    };

    registerBackgroundListeners();
    expect(setAccessLevelMock).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });

    setAccessLevelMock.mockClear();
    expect(installedCallback).not.toBeNull();
    installedCallback!();
    expect(setAccessLevelMock).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
    expect((globalThis as Record<string, unknown>).chrome).not.toHaveProperty(
      'sidePanel'
    );
  });

  it('persists inspectMode and sends SET_INSPECT_MODE on action click without opening any panel', async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        sendMessage: sendMessageMock,
      },
    };

    const tabUrl = 'https://example.com/products?page=2';
    // Explicitly start from inspectMode: false to verify enabling (not toggling)
    await saveInspectMode(false);

    await handleActionClicked({
      id: 42,
      url: tabUrl,
    } as chrome.tabs.Tab);

    expect((globalThis as Record<string, unknown>).chrome).not.toHaveProperty(
      'sidePanel'
    );

    expect((await loadUiPreferences()).inspectMode).toBe(true);

    expect(sendMessageMock).toHaveBeenCalledWith(42, {
      type: 'SET_INSPECT_MODE',
      enabled: true,
      url: tabUrl,
    });
  });

  it('keeps the inspect preference enabled across repeated action clicks (idempotent, never toggles off)', async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        sendMessage: sendMessageMock,
      },
    };

    const tabUrl = 'https://example.com/idempotent';
    await handleActionClicked({ id: 7, url: tabUrl } as chrome.tabs.Tab);
    await handleActionClicked({ id: 7, url: tabUrl } as chrome.tabs.Tab);

    expect((await loadUiPreferences()).inspectMode).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    for (const call of sendMessageMock.mock.calls) {
      expect(call[1]).toMatchObject({
        type: 'SET_INSPECT_MODE',
        enabled: true,
        url: tabUrl,
      });
    }
  });

  it('re-enables inspect mode when the action icon is clicked after the user closed the bar', async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        sendMessage: sendMessageMock,
      },
    };

    const tabUrl = 'https://example.com/closed-page';
    // Explicitly start disabled (user had closed the overlay).
    await saveInspectMode(false);

    await handleActionClicked({
      id: 99,
      url: tabUrl,
    } as chrome.tabs.Tab);

    expect((await loadUiPreferences()).inspectMode).toBe(true);

    expect(sendMessageMock).toHaveBeenCalledWith(99, {
      type: 'SET_INSPECT_MODE',
      enabled: true,
      url: tabUrl,
    });
  });

  it('dynamically injects content.js via chrome.scripting.executeScript when sending message to an already-open tab fails', async () => {
    const sendMessageMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection'))
      .mockResolvedValueOnce({ ok: true });
    const executeScriptMock = vi.fn().mockResolvedValue([]);

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        sendMessage: sendMessageMock,
      },
      scripting: {
        executeScript: executeScriptMock,
      },
    };

    const response = await ensureContentScriptAndSendMessage(
      77,
      'https://example.com/settings',
      {
        type: 'SET_INSPECT_MODE',
        enabled: true,
        url: 'https://example.com/settings',
      }
    );

    expect(executeScriptMock).toHaveBeenCalledWith({
      target: { tabId: 77 },
      files: ['content.js'],
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(response).toEqual({ ok: true });
  });

  it('does not attempt to inject content.js on restricted chrome:// URLs', async () => {
    const sendMessageMock = vi
      .fn()
      .mockRejectedValue(new Error('Restricted URL'));
    const executeScriptMock = vi.fn();

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        sendMessage: sendMessageMock,
      },
      scripting: {
        executeScript: executeScriptMock,
      },
    };

    await ensureContentScriptAndSendMessage(99, 'chrome://settings', {
      type: 'SET_INSPECT_MODE',
      enabled: true,
    });

    expect(executeScriptMock).not.toHaveBeenCalled();
  });

  it('routes GET_PAGE_STATE and active-tab forwarding messages via handleRuntimeMessage', async () => {
    await savePageState('https://example.com/app', {
      inspectMode: true,
      globalInstruction: 'Keep header sticky',
    });

    const sendResponseForState = vi.fn();
    const handledState = handleRuntimeMessage(
      { type: 'GET_PAGE_STATE', url: 'https://example.com/app' },
      {} as chrome.runtime.MessageSender,
      sendResponseForState
    );
    expect(handledState).toBe(true);

    // Wait for async getPageState resolution
    await new Promise((r) => setTimeout(r, 10));
    expect(sendResponseForState).toHaveBeenCalledWith(
      expect.objectContaining({
        urlKey: 'https://example.com/app',
        inspectMode: true,
        globalInstruction: 'Keep header sticky',
      })
    );

    const sendMessageMock = vi.fn().mockResolvedValue({ scrolled: true });
    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 55, url: 'https://example.com/app' }]),
        sendMessage: sendMessageMock,
      },
    };

    const sendResponseForForward = vi.fn();
    const handledForward = handleRuntimeMessage(
      {
        type: 'SCROLL_TO_ELEMENT',
        selector: '#main-cta',
        id: 1,
      },
      {} as chrome.runtime.MessageSender,
      sendResponseForForward
    );
    expect(handledForward).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    expect(sendMessageMock).toHaveBeenCalledWith(55, {
      type: 'SCROLL_TO_ELEMENT',
      selector: '#main-cta',
      id: 1,
    });
    expect(sendResponseForForward).toHaveBeenCalledWith({ scrolled: true });
  });

  it('does not register a tabs.onUpdated listener that clears page state on subframe loads', async () => {
    const url = 'https://example.com/subframe-preview';
    await savePageState(url, {
      inspectMode: true,
      globalInstruction: 'Keep header sticky',
    });

    const onUpdatedAddListener = vi.fn();

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        onUpdated: {
          addListener: onUpdatedAddListener,
        },
      },
    };

    registerBackgroundListeners();

    // Chrome's tabs.onUpdated fires for subframe (iframe preview) loads without
    // exposing frameId. Clearing page state there would wipe the parent overlay,
    // so the background must not register such a listener at all.
    expect(onUpdatedAddListener).not.toHaveBeenCalled();

    const state = await getPageState(url);
    expect(state.globalInstruction).toBe('Keep header sticky');
    expect(state.inspectMode).toBe(true);
  });

  it('grants untrusted contexts access to session storage on ENSURE_STATE_ACCESS', async () => {
    const setAccessLevelMock = vi.fn().mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).chrome = {
      storage: {
        session: {
          setAccessLevel: setAccessLevelMock,
        },
      },
    };

    const sendResponse = vi.fn();
    const handled = handleRuntimeMessage(
      { type: 'ENSURE_STATE_ACCESS' },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(handled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(setAccessLevelMock).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });
});
