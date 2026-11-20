import {
  DEFAULT_MASKING_CONFIG,
  ExtensionMessage,
  MaskingConfig,
  PageAnnotationState,
} from '../types/annotation';

export const STORAGE_KEY_PREFIX = 'dpa_page_state:';
export const PAGE_STATE_STORAGE_AREA = 'session';

const ENSURE_STATE_ACCESS_MESSAGE: ExtensionMessage = {
  type: 'ENSURE_STATE_ACCESS',
};

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

export function getStorageKey(url: string, scopeId?: string): string {
  const base = `${STORAGE_KEY_PREFIX}${normalizeUrlKey(url)}`;
  return scopeId ? `${base}::tab:${scopeId}` : base;
}

export function createDefaultPageState(url: string): PageAnnotationState {
  const urlKey = normalizeUrlKey(url);
  return {
    urlKey,
    inspectMode: false,
    isVisible: false,
    globalInstruction: '',
    maskingConfig: {
      ...DEFAULT_MASKING_CONFIG,
      maskSelectors: [...DEFAULT_MASKING_CONFIG.maskSelectors],
    },
    annotations: [],
  };
}

function getSessionStorage(): chrome.storage.StorageArea | null {
  try {
    if (typeof chrome === 'undefined') {
      return null;
    }
    const session = chrome.storage?.session;
    if (
      !session ||
      typeof session.get !== 'function' ||
      typeof session.set !== 'function' ||
      typeof session.remove !== 'function'
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Content scripts run in an untrusted context and may be denied access to
 * `chrome.storage.session`. Ask the background service worker to grant access.
 */
async function requestStateAccess(): Promise<boolean> {
  try {
    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== 'function'
    ) {
      return false;
    }
    const response = (await chrome.runtime.sendMessage(
      ENSURE_STATE_ACCESS_MESSAGE
    )) as { ok?: boolean } | undefined;
    return Boolean(response && response.ok);
  } catch {
    return false;
  }
}

type SessionOperation<T> =
  | { ok: true; value: T }
  | { ok: false; value?: undefined };

/**
 * Runs a session-storage operation, retrying exactly once after asking the
 * background to grant the current context access. Never throws.
 */
async function withSessionStorage<T>(
  operation: (area: chrome.storage.StorageArea) => Promise<T>
): Promise<SessionOperation<T>> {
  const area = getSessionStorage();
  if (!area) {
    return { ok: false };
  }

  try {
    return { ok: true, value: await operation(area) };
  } catch {
    // Fall through to the single access-request retry.
  }

  if (!(await requestStateAccess())) {
    return { ok: false };
  }

  try {
    return { ok: true, value: await operation(area) };
  } catch {
    return { ok: false };
  }
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
    isVisible:
      typeof raw.isVisible === 'boolean'
        ? raw.isVisible
        : defaults.isVisible,
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

export async function getPageState(
  url: string,
  scopeId?: string
): Promise<PageAnnotationState> {
  const storageKey = getStorageKey(url, scopeId);

  const result = await withSessionStorage((area) => area.get(storageKey));
  if (result.ok) {
    const stored = (result.value as Record<string, unknown> | null)?.[
      storageKey
    ] as PageAnnotationStatePatch | undefined;
    return sanitizePageState(url, stored);
  }

  return sanitizePageState(url, memoryStore.get(storageKey));
}

export async function savePageState(
  url: string,
  statePatch: PageAnnotationStatePatch,
  scopeId?: string
): Promise<PageAnnotationState> {
  const storageKey = getStorageKey(url, scopeId);
  const current = await getPageState(url, scopeId);

  const nextState: PageAnnotationState = sanitizePageState(url, {
    ...current,
    ...statePatch,
    urlKey: current.urlKey,
    maskingConfig: cloneMaskingConfig(
      current.maskingConfig,
      statePatch.maskingConfig
    ),
  });

  const result = await withSessionStorage((area) =>
    area.set({ [storageKey]: nextState })
  );
  if (!result.ok) {
    memoryStore.set(storageKey, nextState);
  }

  return nextState;
}

export async function clearPageState(
  url: string,
  scopeId?: string
): Promise<void> {
  const storageKey = getStorageKey(url, scopeId);

  const result = await withSessionStorage((area) => area.remove(storageKey));
  if (!result.ok) {
    memoryStore.delete(storageKey);
  }
}

/**
 * Resets the in-memory store (useful for unit tests).
 */
export function resetMemoryStoreForTests(): void {
  memoryStore.clear();
}
