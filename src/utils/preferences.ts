export const UI_PREFERENCES_KEY = 'dpa_ui_preferences';

export interface UiPreferences {
  inspectMode: boolean;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  inspectMode: false,
};

const memoryStore: UiPreferences = { ...DEFAULT_UI_PREFERENCES };

function getLocalStorage(): chrome.storage.StorageArea | null {
  try {
    if (typeof chrome === 'undefined') {
      return null;
    }
    const local = chrome.storage?.local;
    if (
      !local ||
      typeof local.get !== 'function' ||
      typeof local.set !== 'function'
    ) {
      return null;
    }
    return local;
  } catch {
    return null;
  }
}

function sanitizePreferences(raw: unknown): UiPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_UI_PREFERENCES };
  }
  const candidate = raw as Partial<UiPreferences>;
  return {
    inspectMode:
      typeof candidate.inspectMode === 'boolean'
        ? candidate.inspectMode
        : DEFAULT_UI_PREFERENCES.inspectMode,
  };
}

/**
 * Loads the disk-persisted UI preferences. Falls back to an in-memory copy
 * when `chrome.storage.local` is unavailable (unit tests, unsupported pages).
 * Never throws.
 */
export async function loadUiPreferences(): Promise<UiPreferences> {
  const area = getLocalStorage();
  if (!area) {
    return { ...memoryStore };
  }

  try {
    const result = await area.get(UI_PREFERENCES_KEY);
    const raw = (result as Record<string, unknown> | null)?.[UI_PREFERENCES_KEY];
    const preferences = sanitizePreferences(raw);
    Object.assign(memoryStore, preferences);
    return preferences;
  } catch {
    return { ...memoryStore };
  }
}

/**
 * Merges a patch into the persisted preferences and returns the merged value.
 * Never throws; storage failures degrade to the in-memory fallback.
 */
export async function saveUiPreferences(
  patch: Partial<UiPreferences>
): Promise<UiPreferences> {
  const current = await loadUiPreferences();
  const next = sanitizePreferences({ ...current, ...patch });
  Object.assign(memoryStore, next);

  const area = getLocalStorage();
  if (!area) {
    return { ...next };
  }

  try {
    await area.set({ [UI_PREFERENCES_KEY]: next });
  } catch {
    // In-memory fallback already holds the merged value.
  }

  return { ...next };
}

export async function saveInspectMode(enabled: boolean): Promise<UiPreferences> {
  return saveUiPreferences({ inspectMode: Boolean(enabled) });
}

export function resetUiPreferencesForTests(): void {
  Object.assign(memoryStore, DEFAULT_UI_PREFERENCES);
}
