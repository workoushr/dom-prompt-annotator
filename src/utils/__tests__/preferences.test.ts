import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  resetUiPreferencesForTests,
  saveInspectMode,
  saveUiPreferences,
  UI_PREFERENCES_KEY,
} from '../preferences';

describe('UI preferences utility', () => {
  beforeEach(() => {
    resetUiPreferencesForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetUiPreferencesForTests();
  });

  function stubLocalStorage(initial: Record<string, unknown> = {}) {
    const backing: Record<string, unknown> = { ...initial };
    const getMock = vi.fn(async (key: string) => ({
      [key]: backing[key],
    }));
    const setMock = vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: getMock, set: setMock },
      },
    });
    return { backing, getMock, setMock };
  }

  it('defaults inspectMode to false when nothing has been persisted', async () => {
    await expect(loadUiPreferences()).resolves.toEqual({
      inspectMode: false,
    });
    expect(DEFAULT_UI_PREFERENCES).toEqual({ inspectMode: false });
  });

  it('round-trips an enabled preference through chrome.storage.local', async () => {
    const { backing } = stubLocalStorage();

    await saveInspectMode(true);
    expect(backing[UI_PREFERENCES_KEY]).toEqual({ inspectMode: true });
    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: true });

    await saveInspectMode(false);
    expect(backing[UI_PREFERENCES_KEY]).toEqual({ inspectMode: false });
    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: false });
  });

  it('merges partial patches with existing persisted values', async () => {
    stubLocalStorage({ [UI_PREFERENCES_KEY]: { inspectMode: true } });

    const merged = await saveUiPreferences({});
    expect(merged).toEqual({ inspectMode: true });

    const loaded = await loadUiPreferences();
    expect(loaded.inspectMode).toBe(true);
  });

  it('falls back to memory when chrome.storage.local is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);

    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: false });
    await expect(saveInspectMode(true)).resolves.toEqual({ inspectMode: true });
    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: true });
  });

  it('never throws when local storage reads or writes fail', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error('denied')),
          set: vi.fn().mockRejectedValue(new Error('denied')),
        },
      },
    });

    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: false });
    await expect(saveInspectMode(true)).resolves.toEqual({ inspectMode: true });
    await expect(loadUiPreferences()).resolves.toEqual({ inspectMode: true });
  });
});
