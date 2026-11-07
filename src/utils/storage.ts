import {
  DEFAULT_MASKING_CONFIG,
  MaskingConfig,
  PageAnnotationState,
} from '../types/annotation';

export const STORAGE_KEY_PREFIX = 'dpa_page_state:';

const memoryStore = new Map<string, PageAnnotationState>();

export type PageAnnotationStatePatch = Omit<
  Partial<PageAnnotationState>,
  'maskingConfig'
> & {
  maskingConfig?: Partial<MaskingConfig>;
};

/**
 * Normalizes a URL into a stable storage key (`origin + pathname`),
 * stripping query parameters and hash fragments. Handles invalid URLs gracefully.
 */
export function normalizeUrlKey(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return 'unknown://empty';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.origin && parsed.origin !== 'null') {
      return `${parsed.origin}${parsed.pathname}`;
    }
    // Handle protocols like chrome://, file://, or about: where origin may be 'null'
    if (!parsed.host && !parsed.pathname.startsWith('/')) {
      return `${parsed.protocol}${parsed.pathname}`;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // Fallback for relative or malformed URLs: strip query and hash manually
    const withoutHash = trimmed.split('#')[0] ?? trimmed;
    const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
    return withoutQuery || 'unknown://invalid';
  }
}

export function getStorageKey(url: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeUrlKey(url)}`;
}

export function createDefaultPageState(url: string): PageAnnotationState {
  const urlKey = normalizeUrlKey(url);
  return {
    urlKey,
    inspectMode: false,
    globalInstruction: '',
    maskingConfig: {
      ...DEFAULT_MASKING_CONFIG,
      maskSelectors: [...DEFAULT_MASKING_CONFIG.maskSelectors],
    },
    annotations: [],
  };
}

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome?.storage?.local) &&
    typeof chrome.storage.local.get === 'function' &&
    typeof chrome.storage.local.set === 'function' &&
    typeof chrome.storage.local.remove === 'function'
  );
}

function cloneMaskingConfig(
  base: MaskingConfig,
  patch?: Partial<MaskingConfig>
): MaskingConfig {
  const safeBase = base ?? DEFAULT_MASKING_CONFIG;
  const safePatch = patch ?? {};

  return {
    autoMaskPII:
      typeof safePatch.autoMaskPII === 'boolean'
        ? safePatch.autoMaskPII
        : typeof safeBase.autoMaskPII === 'boolean'
          ? safeBase.autoMaskPII
          : DEFAULT_MASKING_CONFIG.autoMaskPII,
    maskAllText:
      typeof safePatch.maskAllText === 'boolean'
        ? safePatch.maskAllText
        : typeof safeBase.maskAllText === 'boolean'
          ? safeBase.maskAllText
          : DEFAULT_MASKING_CONFIG.maskAllText,
    maskSelectors: Array.isArray(safePatch.maskSelectors)
      ? [...safePatch.maskSelectors]
      : Array.isArray(safeBase.maskSelectors)
        ? [...safeBase.maskSelectors]
        : [...DEFAULT_MASKING_CONFIG.maskSelectors],
    maskColor:
      typeof safePatch.maskColor === 'string' && safePatch.maskColor.trim()
        ? safePatch.maskColor
        : typeof safeBase.maskColor === 'string' && safeBase.maskColor.trim()
          ? safeBase.maskColor
          : DEFAULT_MASKING_CONFIG.maskColor,
    visualMaskEnabled:
      typeof safePatch.visualMaskEnabled === 'boolean'
        ? safePatch.visualMaskEnabled
        : typeof safeBase.visualMaskEnabled === 'boolean'
          ? safeBase.visualMaskEnabled
          : DEFAULT_MASKING_CONFIG.visualMaskEnabled,
  };
}

function sanitizePageState(
  url: string,
  raw?: PageAnnotationStatePatch | null
): PageAnnotationState {
  const defaults = createDefaultPageState(url);
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  return {
    urlKey: defaults.urlKey,
    inspectMode:
      typeof raw.inspectMode === 'boolean'
        ? raw.inspectMode
        : defaults.inspectMode,
    globalInstruction:
      typeof raw.globalInstruction === 'string'
        ? raw.globalInstruction
        : defaults.globalInstruction,
    maskingConfig: cloneMaskingConfig(
      defaults.maskingConfig,
      raw.maskingConfig
    ),
    annotations: Array.isArray(raw.annotations)
      ? raw.annotations.map((item, idx) => ({
          ...item,
          id: typeof item.id === 'number' ? item.id : idx + 1,
        }))
      : [],
  };
}

export async function getPageState(url: string): Promise<PageAnnotationState> {
  const storageKey = getStorageKey(url);

  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(storageKey);
    const stored = result?.[storageKey] as
      | PageAnnotationStatePatch
      | undefined;
    return sanitizePageState(url, stored);
  }

  const stored = memoryStore.get(storageKey);
  return sanitizePageState(url, stored);
}

export async function savePageState(
  url: string,
  statePatch: PageAnnotationStatePatch
): Promise<PageAnnotationState> {
  const storageKey = getStorageKey(url);
  const current = await getPageState(url);

  const nextState: PageAnnotationState = sanitizePageState(url, {
    ...current,
    ...statePatch,
    urlKey: current.urlKey,
    maskingConfig: cloneMaskingConfig(
      current.maskingConfig,
      statePatch.maskingConfig
    ),
  });

  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [storageKey]: nextState });
  } else {
    memoryStore.set(storageKey, nextState);
  }

  return nextState;
}

export async function clearPageState(url: string): Promise<void> {
  const storageKey = getStorageKey(url);

  if (hasChromeStorage()) {
    await chrome.storage.local.remove(storageKey);
  } else {
    memoryStore.delete(storageKey);
  }
}

/**
 * Resets the in-memory store (useful for unit tests).
 */
export function resetMemoryStoreForTests(): void {
  memoryStore.clear();
}
