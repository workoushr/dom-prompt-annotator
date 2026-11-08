import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  attachAndEmulateDevice,
  clearDeviceEmulation,
  getDeviceEmulationState,
  handleDebuggerDetach,
  isDebuggerAttached,
  isDeviceEmulationActive,
  resetDebuggerManagerForTests,
} from '../debuggerManager';
import { DEFAULT_DEVICE_EMULATION_CONFIG } from '../../types/annotation';

describe('debuggerManager (Iframe Device Emulation State Management)', () => {
  let attachMock: ReturnType<typeof vi.fn>;
  let sendCommandMock: ReturnType<typeof vi.fn>;
  let detachMock: ReturnType<typeof vi.fn>;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDebuggerManagerForTests();
    attachMock = vi.fn().mockResolvedValue(undefined);
    sendCommandMock = vi.fn().mockResolvedValue({});
    detachMock = vi.fn().mockResolvedValue(undefined);
    sendMessageMock = vi.fn().mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).chrome = {
      debugger: {
        attach: attachMock,
        sendCommand: sendCommandMock,
        detach: detachMock,
      },
      tabs: {
        sendMessage: sendMessageMock,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('returns default disabled configuration for unconfigured tabs', () => {
    const state = getDeviceEmulationState(101);
    expect(state).toEqual(DEFAULT_DEVICE_EMULATION_CONFIG);
    expect(state.enabled).toBe(false);
    expect(isDeviceEmulationActive(101)).toBe(false);
  });

  it('sets device emulation state with preset values without invoking chrome.debugger (CDP)', async () => {
    const tabId = 1;
    const config = await attachAndEmulateDevice(tabId, {
      presetId: 'iphone-15-pro',
      orientation: 'portrait',
    });

    // CDP debugger should NOT be attached or called
    expect(attachMock).not.toHaveBeenCalled();
    expect(sendCommandMock).not.toHaveBeenCalled();

    // Internal state tracking
    expect(isDebuggerAttached(tabId)).toBe(true);
    expect(isDeviceEmulationActive(tabId)).toBe(true);

    expect(config.enabled).toBe(true);
    expect(config.presetId).toBe('iphone-15-pro');
    expect(config.width).toBe(393);
    expect(config.height).toBe(852);
    expect(config.mobile).toBe(true);
    expect(config.touch).toBe(true);
    expect(config.deviceScaleFactor).toBe(3);

    // Content script should be notified with updated configuration
    expect(sendMessageMock).toHaveBeenCalledWith(1, {
      type: 'DEVICE_EMULATION_UPDATED',
      tabId: 1,
      config: expect.objectContaining({
        presetId: 'iphone-15-pro',
        enabled: true,
      }),
    });
  });

  it('swaps width and height when orientation is landscape and synchronizes config dimensions', async () => {
    const tabId = 2;
    const config = await attachAndEmulateDevice(tabId, {
      presetId: 'iphone-se', // 375x667
      orientation: 'landscape',
    });

    // No CDP calls
    expect(sendCommandMock).not.toHaveBeenCalled();

    // Verify config dimensions are synchronized with swapped values
    expect(config.width).toBe(667);
    expect(config.height).toBe(375);

    const savedState = getDeviceEmulationState(tabId);
    expect(savedState.width).toBe(667);
    expect(savedState.height).toBe(375);
  });

  it('swaps width and height back when orientation is set to portrait', async () => {
    const tabId = 3;
    await attachAndEmulateDevice(tabId, {
      presetId: 'iphone-se', // 375x667
      orientation: 'landscape',
    });

    const portraitConfig = await attachAndEmulateDevice(tabId, {
      orientation: 'portrait',
    });

    expect(portraitConfig.width).toBe(375);
    expect(portraitConfig.height).toBe(667);
  });

  it('clears device emulation and notifies content script without CDP detach', async () => {
    const tabId = 4;
    await attachAndEmulateDevice(tabId, { presetId: 'ipad-mini' });
    expect(isDebuggerAttached(tabId)).toBe(true);

    sendMessageMock.mockClear();

    await clearDeviceEmulation(tabId);

    // No CDP detach calls
    expect(detachMock).not.toHaveBeenCalled();
    expect(isDebuggerAttached(tabId)).toBe(false);
    expect(isDeviceEmulationActive(tabId)).toBe(false);

    const clearedState = getDeviceEmulationState(tabId);
    expect(clearedState.enabled).toBe(false);

    expect(sendMessageMock).toHaveBeenCalledWith(4, {
      type: 'DEVICE_EMULATION_UPDATED',
      tabId: 4,
      config: expect.objectContaining({ enabled: false }),
      reason: 'cleared',
    });
  });

  it('handles debugger onDetach event and resets state', async () => {
    const tabId = 5;
    await attachAndEmulateDevice(tabId, { presetId: 'iphone-15-pro' });
    expect(isDebuggerAttached(tabId)).toBe(true);

    sendMessageMock.mockClear();

    await handleDebuggerDetach({ tabId: 5 }, 'canceled_by_user');

    expect(isDebuggerAttached(tabId)).toBe(false);
    const state = getDeviceEmulationState(tabId);
    expect(state.enabled).toBe(false);

    expect(sendMessageMock).toHaveBeenCalledWith(5, {
      type: 'DEVICE_EMULATION_UPDATED',
      tabId: 5,
      config: expect.objectContaining({ enabled: false }),
      reason: 'canceled_by_user',
    });
  });

  it('cleans up emulation state without sending message when tab is closed (target_closed)', async () => {
    const tabId = 6;
    await attachAndEmulateDevice(tabId, { presetId: 'iphone-15-pro' });
    expect(isDebuggerAttached(tabId)).toBe(true);

    sendMessageMock.mockClear();

    await handleDebuggerDetach({ tabId: 6 }, 'target_closed');

    expect(isDebuggerAttached(tabId)).toBe(false);
    // State should be deleted, so getDeviceEmulationState returns default disabled config
    const state = getDeviceEmulationState(tabId);
    expect(state).toEqual(DEFAULT_DEVICE_EMULATION_CONFIG);

    // No message should be sent to a closed tab
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('safely ignores onDetach if tabId is not a number', async () => {
    await handleDebuggerDetach({}, 'canceled_by_user');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
