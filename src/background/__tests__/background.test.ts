import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureSidePanelBehavior,
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
import { resetDebuggerManagerForTests } from '../debuggerManager';

describe('Background Service Worker (src/background/index.ts)', () => {
  beforeEach(() => {
    resetMemoryStoreForTests();
    resetDebuggerManagerForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('identifies restricted Chrome and browser internal URLs accurately', () => {
    expect(isRestrictedTabUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedTabUrl('chrome-extension://abc123/sidepanel.html')).toBe(
      true
    );
    expect(isRestrictedTabUrl('about:blank')).toBe(true);
    expect(isRestrictedTabUrl('edge://settings')).toBe(true);
    expect(isRestrictedTabUrl('')).toBe(true);
    expect(isRestrictedTabUrl(undefined)).toBe(true);

    expect(isRestrictedTabUrl('https://example.com/dashboard')).toBe(false);
    expect(isRestrictedTabUrl('http://localhost:3000/app')).toBe(false);
  });

  it('configures sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) on install', async () => {
    const setPanelBehaviorMock = vi.fn().mockResolvedValue(undefined);
    let installedCallback: (() => void) | null = null;

    (globalThis as Record<string, unknown>).chrome = {
      sidePanel: {
        setPanelBehavior: setPanelBehaviorMock,
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
    expect(setPanelBehaviorMock).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });

    setPanelBehaviorMock.mockClear();
    expect(installedCallback).not.toBeNull();
    installedCallback!();
    await configureSidePanelBehavior();
    expect(setPanelBehaviorMock).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });

  it('opens the Side Panel, enables inspectMode in storage, and sends SET_INSPECT_MODE when action icon is clicked', async () => {
    const openSidePanelMock = vi.fn().mockResolvedValue(undefined);
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true });

    (globalThis as Record<string, unknown>).chrome = {
      sidePanel: {
        open: openSidePanelMock,
      },
      tabs: {
        sendMessage: sendMessageMock,
      },
    };

    const tabUrl = 'https://example.com/products?page=2';
    await handleActionClicked({
      id: 42,
      url: tabUrl,
    } as chrome.tabs.Tab);

    expect(openSidePanelMock).toHaveBeenCalledWith({ tabId: 42 });

    const state = await getPageState(tabUrl);
    expect(state.inspectMode).toBe(true);

    expect(sendMessageMock).toHaveBeenCalledWith(42, {
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

  it('routes SET_DEVICE_EMULATION, GET_DEVICE_EMULATION, and CLEAR_DEVICE_EMULATION messages', async () => {
    const attachMock = vi.fn().mockResolvedValue(undefined);
    const sendCommandMock = vi.fn().mockResolvedValue({});
    const detachMock = vi.fn().mockResolvedValue(undefined);
    const tabsSendMessageMock = vi.fn().mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).chrome = {
      debugger: {
        attach: attachMock,
        sendCommand: sendCommandMock,
        detach: detachMock,
      },
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 10, url: 'https://example.com/test' }]),
        sendMessage: tabsSendMessageMock,
      },
    };

    // 1. SET_DEVICE_EMULATION
    const setResponse = vi.fn();
    const handledSet = handleRuntimeMessage(
      {
        type: 'SET_DEVICE_EMULATION',
        tabId: 10,
        config: { presetId: 'iphone-se' },
      },
      {} as chrome.runtime.MessageSender,
      setResponse
    );
    expect(handledSet).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(attachMock).toHaveBeenCalledWith({ tabId: 10 }, '1.3');
    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 10 },
      'Emulation.setDeviceMetricsOverride',
      expect.objectContaining({ width: 375, height: 667 })
    );
    expect(setResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        config: expect.objectContaining({ presetId: 'iphone-se', enabled: true }),
      })
    );

    // 2. GET_DEVICE_EMULATION
    const getResponse = vi.fn();
    const handledGet = handleRuntimeMessage(
      { type: 'GET_DEVICE_EMULATION', tabId: 10 },
      {} as chrome.runtime.MessageSender,
      getResponse
    );
    expect(handledGet).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(getResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        config: expect.objectContaining({ presetId: 'iphone-se', enabled: true }),
      })
    );

    // 3. CLEAR_DEVICE_EMULATION
    const clearResponse = vi.fn();
    const handledClear = handleRuntimeMessage(
      { type: 'CLEAR_DEVICE_EMULATION', tabId: 10 },
      {} as chrome.runtime.MessageSender,
      clearResponse
    );
    expect(handledClear).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(detachMock).toHaveBeenCalledWith({ tabId: 10 });
    expect(clearResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('registers debugger onDetach listener on background listener initialization', () => {
    const addListenerMock = vi.fn();
    (globalThis as Record<string, unknown>).chrome = {
      debugger: {
        onDetach: {
          addListener: addListenerMock,
        },
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      },
      action: {
        onClicked: { addListener: vi.fn() },
      },
    };

    registerBackgroundListeners();
    expect(addListenerMock).toHaveBeenCalledTimes(1);
  });
});
