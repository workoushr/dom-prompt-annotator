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
 * Checks if device emulation is active for the tab.
 * Retained for backwards compatibility with test harnesses and consumers.
 */
export function isDebuggerAttached(tabId: number): boolean {
  return attachedTabs.has(tabId) || Boolean(emulationStates.get(tabId)?.enabled);
}

/**
 * Checks if device emulation is currently active for the tab.
 */
export function isDeviceEmulationActive(tabId: number): boolean {
  return Boolean(emulationStates.get(tabId)?.enabled);
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
 * Updates device emulation configuration for the tab and notifies the content script.
 * Replaces CDP Emulation.setDeviceMetricsOverride with safe iframe emulation state management.
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
  let targetWidth = mergedConfig.width;
  let targetHeight = mergedConfig.height;
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

  attachedTabs.add(tabId);
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
 * Clears device emulation configuration and notifies the content script to restore normal view.
 */
export async function clearDeviceEmulation(tabId: number): Promise<void> {
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
 * Handler for detach or tab closing events.
 * Triggered when tab closes or emulation is disconnected.
 */
export async function handleDebuggerDetach(
  source: { tabId?: number },
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
