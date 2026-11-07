import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  normalizeUrlKey,
  getPageState,
  savePageState,
  clearPageState,
  resetMemoryStoreForTests,
  STORAGE_KEY_PREFIX,
} from '../storage';
import { DEFAULT_MASKING_CONFIG, ElementMetadata } from '../../types/annotation';

const mockElement: ElementMetadata = {
  tagName: 'button',
  id: 'submit-btn',
  className: 'btn btn-primary',
  selector: '#submit-btn',
  xpath: '//*[@id="submit-btn"]',
  attributes: { id: 'submit-btn', class: 'btn btn-primary' },
  textContent: 'Submit Order',
  outerHTMLSnippet: '<button id="submit-btn" class="btn btn-primary">Submit Order</button>',
  rect: { x: 10, y: 20, width: 120, height: 40 },
  computedStyles: { display: 'inline-flex', color: 'rgb(255, 255, 255)' },
  framework: {
    detected: 'react',
    componentName: 'CheckoutButton',
    componentHierarchy: ['App', 'CheckoutForm', 'CheckoutButton'],
    source: { fileName: 'src/CheckoutButton.tsx', lineNumber: 42 },
  },
};

describe('storage utility', () => {
  beforeEach(() => {
    resetMemoryStoreForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('normalizeUrlKey', () => {
    it('strips query parameters and hash fragments from standard URLs', () => {
      expect(
        normalizeUrlKey('https://example.com/dashboard/settings?tab=profile#security')
      ).toBe('https://example.com/dashboard/settings');
    });

    it('preserves origin and root pathname', () => {
      expect(normalizeUrlKey('http://localhost:3000/?debug=true')).toBe(
        'http://localhost:3000/'
      );
    });

    it('handles non-standard protocols gracefully', () => {
      expect(normalizeUrlKey('chrome://extensions/?id=abcdef')).toBe(
        'chrome://extensions/'
      );
      expect(normalizeUrlKey('about:blank?foo=bar#baz')).toBe('about:blank');
    });

    it('handles invalid or relative URLs gracefully', () => {
      expect(normalizeUrlKey('/relative/path?foo=bar#baz')).toBe('/relative/path');
      expect(normalizeUrlKey('not a valid url?query=1#hash')).toBe('not a valid url');
      expect(normalizeUrlKey('')).toBe('unknown://empty');
      expect(normalizeUrlKey('   ')).toBe('unknown://empty');
    });
  });

  describe('in-memory fallback mode', () => {
    it('returns default page state when no state has been saved yet', async () => {
      const state = await getPageState('https://app.example.com/products?page=2');
      expect(state.urlKey).toBe('https://app.example.com/products');
      expect(state.inspectMode).toBe(false);
      expect(state.globalInstruction).toBe('');
      expect(state.maskingConfig).toEqual(DEFAULT_MASKING_CONFIG);
      expect(state.annotations).toEqual([]);
    });

    it('saves and merges partial page state updates across query/hash variations of the same URL', async () => {
      const urlWithQuery = 'https://app.example.com/products?page=1';
      const urlWithHash = 'https://app.example.com/products#top';

      await savePageState(urlWithQuery, {
        inspectMode: true,
        globalInstruction: 'Convert buttons to Tailwind v3 tokens',
      });

      const updated = await savePageState(urlWithHash, {
        maskingConfig: {
          maskAllText: true,
        },
        annotations: [
          {
            id: 1,
            instruction: 'Make button rounded-full',
            maskText: false,
            createdAt: '2026-11-07T00:00:00.000Z',
            element: mockElement,
          },
        ],
      });

      expect(updated.inspectMode).toBe(true);
      expect(updated.globalInstruction).toBe('Convert buttons to Tailwind v3 tokens');
      expect(updated.maskingConfig.maskAllText).toBe(true);
      expect(updated.maskingConfig.autoMaskPII).toBe(DEFAULT_MASKING_CONFIG.autoMaskPII);
      expect(updated.maskingConfig.maskSelectors).toEqual(DEFAULT_MASKING_CONFIG.maskSelectors);
      expect(updated.annotations).toHaveLength(1);
      expect(updated.annotations[0].element.selector).toBe('#submit-btn');

      const fetched = await getPageState('https://app.example.com/products');
      expect(fetched).toEqual(updated);
    });

    it('clears saved page state and resets to defaults', async () => {
      const url = 'https://app.example.com/checkout';
      await savePageState(url, {
        inspectMode: true,
        globalInstruction: 'Fix alignment',
      });

      await clearPageState(url);
      const afterClear = await getPageState(url);
      expect(afterClear.inspectMode).toBe(false);
      expect(afterClear.globalInstruction).toBe('');
      expect(afterClear.annotations).toEqual([]);
    });
  });

  describe('chrome.storage.local mode', () => {
    it('reads, writes, and removes using chrome.storage.local when available', async () => {
      const backingObject: Record<string, unknown> = {};
      const getMock = vi.fn(async (key: string) => ({
        [key]: backingObject[key],
      }));
      const setMock = vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(backingObject, items);
      });
      const removeMock = vi.fn(async (key: string) => {
        delete backingObject[key];
      });

      vi.stubGlobal('chrome', {
        storage: {
          local: {
            get: getMock,
            set: setMock,
            remove: removeMock,
          },
        },
      });

      const url = 'https://chrome-test.example.com/editor?mode=1';
      const expectedStorageKey = `${STORAGE_KEY_PREFIX}https://chrome-test.example.com/editor`;

      const initial = await getPageState(url);
      expect(initial.urlKey).toBe('https://chrome-test.example.com/editor');
      expect(getMock).toHaveBeenCalledWith(expectedStorageKey);

      await savePageState(url, {
        globalInstruction: 'Stored in chrome.storage.local',
      });
      expect(setMock).toHaveBeenCalledTimes(1);

      const loaded = await getPageState(url);
      expect(loaded.globalInstruction).toBe('Stored in chrome.storage.local');

      await clearPageState(url);
      expect(removeMock).toHaveBeenCalledWith(expectedStorageKey);

      const afterClear = await getPageState(url);
      expect(afterClear.globalInstruction).toBe('');
    });
  });
});
