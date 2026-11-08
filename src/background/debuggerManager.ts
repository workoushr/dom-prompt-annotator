import {
  DEFAULT_DEVICE_EMULATION_CONFIG,
  DEVICE_PRESETS,
  DeviceEmulationConfig,
} from '../types/annotation';

const emulationStates = new Map<number, DeviceEmulationConfig>();
const attachedTabs = new Set<number>();

/**
 * Resets internal state for unit tests.
 */
export function resetDebuggerManagerForTests(): void {
  emulationStates.clear();
  attachedTabs.clear();
}

/**
 * Checks if debugger is currently attached to the tab according to internal tracking.
 */
export function isDebuggerAttached(tabId: number): boolean {
  return attachedTabs.has(tabId);
}

/**
 * Retrieves the current emulation configuration for a tab.
 * Returns a default disabled config if emulation has not been configured.
 */
export function getDeviceEmulationState(tabId: number): DeviceEmulationConfig {
  const existing = emulationStates.get(tabId);
  if (existing) {
    return { ...existing };
  }
  return { ...DEFAULT_DEVICE_EMULATION_CONFIG };
}

/**
 * Converts CDP debugger error messages to user-friendly messages.
 */
export function formatDebuggerError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /another debugger/i.test(msg) ||
    /already attached/i.test(msg) ||
    /attached to this target/i.test(msg)
  ) {
    return '既にDevToolsまたは別のデバッガーが開いているため接続できません。DevToolsを閉じて再試行してください。';
  }
  return msg || 'CDP接続に失敗しました';
}

/**
 * Applies device metrics and touch emulation override via Chrome DevTools Protocol (CDP).
 */
export async function attachAndEmulateDevice(
  tabId: number,
  config: Partial<DeviceEmulationConfig>
): Promise<DeviceEmulationConfig> {
  const currentState = getDeviceEmulationState(tabId);

  // If presetId is specified, inherit defaults from preset
  let baseConfig = { ...currentState };
  if (config.presetId) {
    const matchedPreset = DEVICE_PRESETS.find((p) => p.id === config.presetId);
    if (matchedPreset) {
      baseConfig = {
        ...baseConfig,
        presetId: matchedPreset.id,
        name: matchedPreset.name,
        width: matchedPreset.width,
        height: matchedPreset.height,
        deviceScaleFactor: matchedPreset.deviceScaleFactor,
        mobile: matchedPreset.mobile,
        touch: matchedPreset.touch,
      };
    }
  }

  const mergedConfig: DeviceEmulationConfig = {
    ...baseConfig,
    ...config,
    enabled: true,
  };

  // Adjust width and height based on orientation
  let targetWidth = Math.max(1, Math.round(Number(mergedConfig.width) || 375));
  let targetHeight = Math.max(1, Math.round(Number(mergedConfig.height) || 667));
  if (mergedConfig.orientation === 'landscape' && targetWidth < targetHeight) {
    [targetWidth, targetHeight] = [targetHeight, targetWidth];
  } else if (
    mergedConfig.orientation === 'portrait' &&
    targetWidth > targetHeight
  ) {
    [targetWidth, targetHeight] = [targetHeight, targetWidth];
  }
  mergedConfig.width = targetWidth;
  mergedConfig.height = targetHeight;

  // Attach debugger if not already attached
  if (typeof chrome !== 'undefined' && chrome.debugger) {
    try {
      if (!attachedTabs.has(tabId) && chrome.debugger.attach) {
        await chrome.debugger.attach({ tabId }, '1.3');
        attachedTabs.add(tabId);
      }

      if (chrome.debugger.sendCommand) {
        // Override device metrics
        await chrome.debugger.sendCommand(
          { tabId },
          'Emulation.setDeviceMetricsOverride',
          {
            width: targetWidth,
            height: targetHeight,
            deviceScaleFactor: mergedConfig.deviceScaleFactor || 1,
            mobile: Boolean(mergedConfig.mobile),
            scale: 1,
            dontSetVisibleSize: false,
            screenOrientation: {
              angle: mergedConfig.orientation === 'landscape' ? 90 : 0,
              type:
                mergedConfig.orientation === 'landscape'
                  ? 'landscapePrimary'
                  : 'portraitPrimary',
            },
          }
        );

        // Emulate touch events
        await chrome.debugger.sendCommand(
          { tabId },
          'Emulation.setTouchEmulationEnabled',
          {
            enabled: Boolean(mergedConfig.touch),
            maxTouchPoints: mergedConfig.touch ? 5 : 1,
          }
        );
      }
    } catch (error) {
      // Rollback: detach and remove from attachedTabs if attach or sendCommand failed
      attachedTabs.delete(tabId);
      if (chrome.debugger.detach) {
        try {
          await chrome.debugger.detach({ tabId });
        } catch {
          // Ignore detach error during rollback
        }
      }
      const friendlyMessage = formatDebuggerError(error);
      const enhancedError = new Error(friendlyMessage);
      throw enhancedError;
    }
  } else {
    // In environments without chrome.debugger (e.g., node / unit test fallback)
    attachedTabs.add(tabId);
  }

  emulationStates.set(tabId, mergedConfig);

  // Notify Content Script / UI of update
  if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'DEVICE_EMULATION_UPDATED',
        tabId,
        config: mergedConfig,
      });
    } catch {
      // Content script may not be ready or active
    }
  }

  return mergedConfig;
}

/**
 * Clears device emulation and detaches CDP debugger from the specified tab.
 */
export async function clearDeviceEmulation(tabId: number): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.debugger) {
    if (chrome.debugger.sendCommand) {
      try {
        await chrome.debugger.sendCommand(
          { tabId },
          'Emulation.clearDeviceMetricsOverride'
        );
        await chrome.debugger.sendCommand(
          { tabId },
          'Emulation.setTouchEmulationEnabled',
          { enabled: false }
        );
      } catch {
        // Tab or debugger might already be disconnected
      }
    }

    if (attachedTabs.has(tabId) && chrome.debugger.detach) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch {
        // Tab or debugger might already be detached
      }
    }
  }

  attachedTabs.delete(tabId);

  const clearedConfig: DeviceEmulationConfig = {
    ...DEFAULT_DEVICE_EMULATION_CONFIG,
    enabled: false,
  };
  emulationStates.set(tabId, clearedConfig);

  // Notify Content Script / UI
  if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'DEVICE_EMULATION_UPDATED',
        tabId,
        config: clearedConfig,
        reason: 'cleared',
      });
    } catch {
      // Content script may not be reachable
    }
  }
}

/**
 * Handler for chrome.debugger.onDetach event.
 * Triggered when user cancels debugging via Chrome's warning bar or tab closes.
 */
export async function handleDebuggerDetach(
  source: chrome.debugger.Debuggee,
  reason: string
): Promise<void> {
  const tabId = source.tabId;
  if (typeof tabId !== 'number') {
    return;
  }

  attachedTabs.delete(tabId);

  if (reason === 'target_closed') {
    emulationStates.delete(tabId);
    return;
  }

  const clearedConfig: DeviceEmulationConfig = {
    ...DEFAULT_DEVICE_EMULATION_CONFIG,
    enabled: false,
  };
  emulationStates.set(tabId, clearedConfig);

  // Notify Content Script that emulation was canceled
  if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'DEVICE_EMULATION_UPDATED',
        tabId,
        config: clearedConfig,
        reason,
      });
    } catch {
      // Tab may have been closed
    }
  }
}
