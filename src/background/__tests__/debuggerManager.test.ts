import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  attachAndEmulateDevice,
  clearDeviceEmulation,
  getDeviceEmulationState,
  handleDebuggerDetach,
  isDebuggerAttached,
  resetDebuggerManagerForTests,
} from '../debuggerManager';
import { DEFAULT_DEVICE_EMULATION_CONFIG } from '../../types/annotation';

describe('debuggerManager (CDP Device Emulation)', () => {
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
  });

  it('attaches debugger and sends CDP emulation commands with preset values', async () => {
    const tabId = 1;
    const config = await attachAndEmulateDevice(tabId, {
      presetId: 'iphone-15-pro',
      orientation: 'portrait',
    });

    expect(attachMock).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
    expect(isDebuggerAttached(tabId)).toBe(true);

    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 1 },
      'Emulation.setDeviceMetricsOverride',
      {
        width: 393,
        height: 852,
        deviceScaleFactor: 3,
        mobile: true,
        scale: 1,
        dontSetVisibleSize: false,
        screenOrientation: {
          angle: 0,
          type: 'portraitPrimary',
        },
      }
    );

    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 1 },
      'Emulation.setTouchEmulationEnabled',
      {
        enabled: true,
        maxTouchPoints: 5,
      }
    );

    expect(config.enabled).toBe(true);
    expect(config.presetId).toBe('iphone-15-pro');
    expect(config.width).toBe(393);
    expect(config.height).toBe(852);

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

    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 2 },
      'Emulation.setDeviceMetricsOverride',
      {
        width: 667,
        height: 375,
        deviceScaleFactor: 2,
        mobile: true,
        scale: 1,
        dontSetVisibleSize: false,
        screenOrientation: {
          angle: 90,
          type: 'landscapePrimary',
        },
      }
    );

    // Verify config dimensions are synchronized with swapped values
    expect(config.width).toBe(667);
    expect(config.height).toBe(375);

    const savedState = getDeviceEmulationState(tabId);
    expect(savedState.width).toBe(667);
    expect(savedState.height).toBe(375);
  });

  it('rounds non-integer dimensions to positive integers', async () => {
    const tabId = 77;
    const config = await attachAndEmulateDevice(tabId, {
      width: 375.4,
      height: 666.9,
    });

    expect(config.width).toBe(375);
    expect(config.height).toBe(667);
    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 77 },
      'Emulation.setDeviceMetricsOverride',
      expect.objectContaining({
        width: 375,
        height: 667,
      })
    );
  });

  it('translates "Another debugger" attach errors into friendly Japanese error message', async () => {
    const tabId = 88;
    attachMock.mockRejectedValueOnce(
      new Error('Another debugger is already attached to this target')
    );

    await expect(
      attachAndEmulateDevice(tabId, { presetId: 'iphone-se' })
    ).rejects.toThrow(
      '既にDevToolsまたは別のデバッガーが開いているため接続できません。DevToolsを閉じて再試行してください。'
    );
  });

  it('rolls back debugger attachment and re-throws error if CDP command fails', async () => {
    const tabId = 99;
    sendCommandMock.mockRejectedValueOnce(new Error('CDP Emulation failed'));

    await expect(
      attachAndEmulateDevice(tabId, { presetId: 'iphone-15-pro' })
    ).rejects.toThrow('CDP Emulation failed');

    expect(attachMock).toHaveBeenCalledWith({ tabId: 99 }, '1.3');
    expect(detachMock).toHaveBeenCalledWith({ tabId: 99 });
    expect(isDebuggerAttached(tabId)).toBe(false);
  });

  it('does not re-attach debugger if already attached to the same tab', async () => {
    const tabId = 3;
    await attachAndEmulateDevice(tabId, {
      presetId: 'desktop',
    });
    expect(attachMock).toHaveBeenCalledTimes(1);

    await attachAndEmulateDevice(tabId, {
      width: 1280,
      height: 800,
    });
    expect(attachMock).toHaveBeenCalledTimes(1);
  });

  it('clears device emulation, detaches debugger, and notifies content script', async () => {
    const tabId = 4;
    await attachAndEmulateDevice(tabId, { presetId: 'ipad-mini' });
    expect(isDebuggerAttached(tabId)).toBe(true);

    sendCommandMock.mockClear();
    sendMessageMock.mockClear();

    await clearDeviceEmulation(tabId);

    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 4 },
      'Emulation.clearDeviceMetricsOverride'
    );
    expect(sendCommandMock).toHaveBeenCalledWith(
      { tabId: 4 },
      'Emulation.setTouchEmulationEnabled',
      { enabled: false }
    );
    expect(detachMock).toHaveBeenCalledWith({ tabId: 4 });
    expect(isDebuggerAttached(tabId)).toBe(false);

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
