import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverlayApp, computePopoverPosition } from '../OverlayApp';
import {
  BRIDGE_SCRIPT_ID,
  injectMainWorldBridgeScript,
  mountOverlayShadowDom,
  unmountOverlayShadowDom,
} from '../index';
import {
  getPageState,
  getStorageKey,
  resetMemoryStoreForTests,
  savePageState,
} from '../../utils/storage';
import { SHADOW_HOST_ID } from '../../utils/masker';
import {
  loadUiPreferences,
  resetUiPreferencesForTests,
  saveInspectMode,
} from '../../utils/preferences';
import { AnnotationItem } from '../../types/annotation';

// Enable React 18 act environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('Content Script & Shadow DOM Overlay UI (OverlayApp.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let storageChangeListener:
    | ((changes: { [key: string]: unknown }, areaName: string) => void)
    | null = null;

  beforeEach(async () => {
    resetMemoryStoreForTests();
    resetUiPreferencesForTests();
    delete (globalThis as Record<string, unknown>).chrome;
    storageChangeListener = null;
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { sendMessage: vi.fn() },
      storage: {
        onChanged: {
          addListener: vi.fn((cb) => {
            storageChangeListener = cb;
          }),
          removeListener: vi.fn(),
        },
      },
    };
    document.body.innerHTML = '';
    document.body.style.paddingBottom = '';
    document.head.innerHTML = '';

    const existingBridge = document.getElementById(BRIDGE_SCRIPT_ID);
    if (existingBridge) {
      existingBridge.remove();
    }

    container = document.createElement('div');
    container.id = 'test-overlay-mount';
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    await act(async () => {
      unmountOverlayShadowDom(document);
    });
    document.body.innerHTML = '';
    delete (document as unknown as Record<string, unknown>).execCommand;
    vi.restoreAllMocks();
  });

  async function renderOverlay() {
    root = createRoot(container);
    await act(async () => {
      root!.render(<OverlayApp />);
    });
    // Flush async clear/get effect
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /**
   * Persists a patch and pushes it into the already-mounted overlay through a
   * session storage change, mirroring how the side panel updates the page.
   */
  async function seedMountedState(
    patch: Parameters<typeof savePageState>[1]
  ): Promise<void> {
    await savePageState(window.location.href, patch);
    await act(async () => {
      storageChangeListener?.(
        { [getStorageKey(window.location.href)]: { newValue: true } },
        'session'
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function buildAnnotation(
    id: number,
    selector: string,
    xpath: string
  ): AnnotationItem {
    return {
      id,
      instruction: `Instruction ${id}`,
      maskText: false,
      createdAt: new Date().toISOString(),
      element: {
        tagName: 'section',
        id: selector.replace('#', ''),
        className: '',
        selector,
        xpath,
        textContent: 'Target',
        outerHTMLSnippet: `<section id="${selector.replace('#', '')}">Target</section>`,
        attributes: {},
        rect: { x: 10, y: 20, width: 100, height: 30 },
        computedStyles: {},
        framework: {
          detected: null,
          componentName: null,
          componentHierarchy: [],
          source: null,
        },
      },
    };
  }

  it('renders no bar, no padding, and no click interception when inspectMode is not persisted', async () => {
    const pageButton = document.createElement('button');
    pageButton.id = 'plain-button';
    pageButton.textContent = 'Plain';
    document.body.appendChild(pageButton);

    await renderOverlay();

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();
    expect(container.querySelector('[data-testid="dpa-overlay-root"]')).toBeNull();
    expect(document.body.style.paddingBottom).toBe('');

    let defaultPrevented = false;
    await act(async () => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      pageButton.dispatchEvent(clickEvent);
      defaultPrevented = clickEvent.defaultPrevented;
    });

    expect(defaultPrevented).toBe(false);
    expect(container.querySelector('[data-testid="dpa-popover"]')).toBeNull();
  });

  it('renders the bar with padding and inspect mode when the preference is true', async () => {
    await saveInspectMode(true);
    await renderOverlay();

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dpa-mode-pill"]')?.textContent
    ).toContain('選択中');
    expect(document.body.style.paddingBottom).toBe('72px');
  });

  it('persists inspect off while keeping the bar visible on the current page', async () => {
    await saveInspectMode(true);
    await renderOverlay();

    const selectBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-select-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect((await loadUiPreferences()).inspectMode).toBe(false);
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();
    expect((await getPageState(window.location.href)).inspectMode).toBe(false);
  });

  it('does not show the bar after a navigation when the preference is false', async () => {
    await saveInspectMode(true);
    await renderOverlay();

    const selectBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-select-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((await loadUiPreferences()).inspectMode).toBe(false);

    // Simulate a navigation: session page state is cleared and the content
    // script mounts again on the next document.
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    resetMemoryStoreForTests();

    await renderOverlay();

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();
    expect(document.body.style.paddingBottom).toBe('');
  });

  it('intercepts clicks on page elements in inspectMode and opens the In-Page Annotation Popover', async () => {
    const pageSection = document.createElement('section');
    pageSection.id = 'hero-section';
    pageSection.innerHTML = `
      <a id="cta-link" class="btn primary" href="https://example.com/navigate">
        Get Started Now
      </a>
    `;
    document.body.appendChild(pageSection);

    await renderOverlay();
    await seedMountedState({ inspectMode: true, isVisible: true });

    const ctaLink = document.getElementById('cta-link') as HTMLAnchorElement;
    let defaultPrevented = false;
    let hostClickTriggered = false;

    pageSection.addEventListener('click', () => {
      hostClickTriggered = true;
    });

    await act(async () => {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      ctaLink.dispatchEvent(clickEvent);
      defaultPrevented = clickEvent.defaultPrevented;
    });

    // Click on host page must be intercepted and stopped
    expect(defaultPrevented).toBe(true);
    expect(hostClickTriggered).toBe(false);

    // Popover should open targeting #cta-link
    const popover = container.querySelector('[data-testid="dpa-popover"]');
    expect(popover).not.toBeNull();

    const tagDisplay = container.querySelector(
      '[data-testid="dpa-popover-tag"]'
    );
    expect(tagDisplay?.textContent).toBe('<a#cta-link.btn.primary>');

    const selectorDisplay = container.querySelector(
      '[data-testid="dpa-popover-selector"]'
    );
    expect(selectorDisplay?.textContent).toBe('#cta-link');
  });

  it('supports stepping up to Parent (↑ 親要素) and stepping down to Child (↓ 子要素) via buttons and Alt+Arrow keys', async () => {
    const card = document.createElement('div');
    card.id = 'pricing-card';
    card.className = 'card shadow';
    card.innerHTML = `
      <div id="card-body" class="body-wrap">
        <button id="buy-btn" class="cta-btn">Buy Pro</button>
      </div>
    `;
    document.body.appendChild(card);

    await renderOverlay();
    await seedMountedState({ inspectMode: true, isVisible: true });

    const buyBtn = document.getElementById('buy-btn')!;

    // Click the innermost button
    await act(async () => {
      buyBtn.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    const getSelectorText = () =>
      container.querySelector('[data-testid="dpa-popover-selector"]')
        ?.textContent;
    const parentBtn = container.querySelector(
      '[data-testid="dpa-btn-parent"]'
    ) as HTMLButtonElement;
    const childBtn = container.querySelector(
      '[data-testid="dpa-btn-child"]'
    ) as HTMLButtonElement;

    expect(getSelectorText()).toBe('#buy-btn');
    expect(parentBtn.disabled).toBe(false);
    expect(childBtn.disabled).toBe(true); // #buy-btn has no child elements

    // Step up to #card-body via Parent button
    await act(async () => {
      parentBtn.click();
    });
    expect(getSelectorText()).toBe('#card-body');
    expect(parentBtn.disabled).toBe(false);
    expect(childBtn.disabled).toBe(false);

    // Step up to #pricing-card via Alt+ArrowUp shortcut
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowUp',
          altKey: true,
          bubbles: true,
        })
      );
    });
    expect(getSelectorText()).toBe('#pricing-card');
    expect(parentBtn.disabled).toBe(true); // parent is document.body, so disabled

    // Step down to #card-body via Child button
    await act(async () => {
      childBtn.click();
    });
    expect(getSelectorText()).toBe('#card-body');

    // Step down to #buy-btn via Alt+ArrowDown shortcut
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          altKey: true,
          bubbles: true,
        })
      );
    });
    expect(getSelectorText()).toBe('#buy-btn');
  });

  it('toggles maskText, submits an instruction, renders numbered badge (#1), and saves annotation to storage', async () => {
    const profileHeader = document.createElement('h2');
    profileHeader.id = 'user-greeting';
    profileHeader.className = 'title-lg';
    profileHeader.textContent = 'Welcome back, Taro Yamada!';
    document.body.appendChild(profileHeader);

    await renderOverlay();
    await seedMountedState({ inspectMode: true, isVisible: true });

    // Click element to open Popover
    await act(async () => {
      profileHeader.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    const maskCheckbox = container.querySelector(
      '[data-testid="dpa-checkbox-mask-text"]'
    ) as HTMLInputElement;
    const textarea = container.querySelector(
      '[data-testid="dpa-textarea-instruction"]'
    ) as HTMLTextAreaElement;
    const saveBtn = container.querySelector(
      '[data-testid="dpa-btn-save"]'
    ) as HTMLButtonElement;

    expect(maskCheckbox.checked).toBe(false);

    // Toggle maskText ON
    await act(async () => {
      maskCheckbox.click();
    });
    expect(maskCheckbox.checked).toBe(true);

    // Enter instruction in textarea
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(
        textarea,
        'フォントサイズを24pxにし、余白を広げてください'
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click Save button
    await act(async () => {
      saveBtn.click();
      await Promise.resolve();
    });

    // Popover should close and badge #1 should be rendered
    expect(container.querySelector('[data-testid="dpa-popover"]')).toBeNull();
    const badge1 = container.querySelector('[data-testid="dpa-badge-1"]');
    expect(badge1).not.toBeNull();
    expect(badge1?.textContent).toBe('#1');

    // Verify saved state in storage
    const storedState = await getPageState(window.location.href);
    expect(storedState.annotations).toHaveLength(1);
    expect(storedState.annotations[0]?.id).toBe(1);
    expect(storedState.annotations[0]?.instruction).toBe(
      'フォントサイズを24pxにし、余白を広げてください'
    );
    expect(storedState.annotations[0]?.maskText).toBe(true);
    expect(storedState.annotations[0]?.element.selector).toBe('#user-greeting');

    // Clicking badge #1 re-opens popover in edit mode and allows deleting
    await act(async () => {
      (badge1 as HTMLButtonElement).click();
    });
    const deleteBtn = container.querySelector(
      '[data-testid="dpa-btn-delete"]'
    ) as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      deleteBtn.click();
      await Promise.resolve();
    });
    const afterDelete = await getPageState(window.location.href);
    expect(afterDelete.annotations).toHaveLength(0);
  });

  it('renders Playwright-style visual mask overlays for maskSelectors, annotated maskText, and maskAllText with custom maskColor', async () => {
    const formWrap = document.createElement('div');
    formWrap.innerHTML = `
      <input id="secret-pass" type="password" value="super-secret" />
      <div id="customer-ssn" data-mask="true">123-45-6789</div>
      <div id="public-label">Public Text</div>
    `;
    document.body.appendChild(formWrap);

    const publicEl = document.getElementById('public-label')!;

    await renderOverlay();
    await seedMountedState({
      inspectMode: true,
      isVisible: true,
      maskingConfig: {
        visualMaskEnabled: true,
        maskAllText: true,
        maskSelectors: ['input[type="password"]', '[data-mask="true"]'],
        maskColor: '#00FF88',
      },
      annotations: [
        {
          id: 1,
          instruction: 'Make label bold',
          maskText: false,
          createdAt: new Date().toISOString(),
          element: {
            tagName: 'div',
            id: 'public-label',
            className: '',
            selector: '#public-label',
            xpath: '//*[@id="public-label"]',
            textContent: 'Public Text',
            outerHTMLSnippet: '<div id="public-label">Public Text</div>',
            attributes: { id: 'public-label' },
            rect: { x: 10, y: 20, width: 100, height: 30 },
            computedStyles: {
              display: 'block',
              position: 'static',
              color: 'rgb(0, 0, 0)',
              backgroundColor: 'rgba(0, 0, 0, 0)',
              fontSize: '16px',
              fontFamily: 'sans-serif',
              fontWeight: '400',
              padding: '0px',
              margin: '0px',
              borderRadius: '0px',
              zIndex: 'auto',
            },
            framework: null,
          },
        },
      ],
    });

    expect(publicEl).not.toBeNull();

    const maskBoxes = container.querySelectorAll(
      '[data-testid="dpa-visual-mask"]'
    );
    expect(maskBoxes.length).toBe(3);

    const maskedSelectors = Array.from(maskBoxes).map((el) =>
      el.getAttribute('data-mask-selector')
    );
    expect(maskedSelectors).toContain('#secret-pass');
    expect(maskedSelectors).toContain('#customer-ssn');
    expect(maskedSelectors).toContain('#public-label');

    const firstMaskBox = maskBoxes[0] as HTMLElement;
    expect(firstMaskBox.style.borderColor).toBe('rgb(0, 255, 136)');
  });

  it('mounts Shadow DOM host #dpa-root-host and injects mainWorldBridge.js when chrome.runtime.getURL is present', async () => {
    const mockGetUrl = vi.fn((path: string) => `chrome-extension://test-id/${path}`);
    (globalThis as Record<string, unknown>).chrome = {
      runtime: {
        getURL: mockGetUrl,
      },
    };

    injectMainWorldBridgeScript(document);
    // Calling twice should only inject once
    injectMainWorldBridgeScript(document);

    const bridgeScripts = document.querySelectorAll(`#${BRIDGE_SCRIPT_ID}`);
    expect(bridgeScripts.length).toBe(1);
    expect((bridgeScripts[0] as HTMLScriptElement).src).toContain(
      'chrome-extension://test-id/mainWorldBridge.js'
    );

    let mounted: ReturnType<typeof mountOverlayShadowDom> = null;
    await act(async () => {
      mounted = mountOverlayShadowDom(document);
      await Promise.resolve();
    });
    expect(mounted).not.toBeNull();
    expect(document.getElementById(SHADOW_HOST_ID)).not.toBeNull();
    expect(mounted!.shadowRoot.querySelector('style')).not.toBeNull();
  });

  it('closes overlay UI completely via close button on bottom bar', async () => {
    await saveInspectMode(true);
    await renderOverlay();

    const bottomBar = container.querySelector('[data-testid="dpa-bottom-bar"]');
    expect(bottomBar).not.toBeNull();

    const closeBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-close-btn"]'
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn.click();
      await Promise.resolve();
    });

    // When closed, overlay root is not rendered
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();
    expect(container.querySelector('[data-testid="dpa-overlay-root"]')).toBeNull();

    // Persisted state has isVisible: false and inspectMode: false
    const state = await getPageState(window.location.href);
    expect(state.isVisible).toBe(false);
    expect(state.inspectMode).toBe(false);
  });

  it('closes overlay UI via Escape key (two Esc presses when inspectMode is active)', async () => {
    await renderOverlay();
    await seedMountedState({ inspectMode: true, isVisible: true });

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();

    // First Esc: turns off inspectMode
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      await Promise.resolve();
    });

    let state = await getPageState(window.location.href);
    expect(state.inspectMode).toBe(false);
    expect(state.isVisible).toBe(true);
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();

    // Second Esc: closes overlay UI completely
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      await Promise.resolve();
    });

    state = await getPageState(window.location.href);
    expect(state.isVisible).toBe(false);
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();
  });

  it('re-opens closed overlay UI via SET_INSPECT_MODE or Alt+S shortcut', async () => {
    let messageListener: ((msg: any, sender: any, sendResponse: any) => boolean | void) | null = null;
    (globalThis as Record<string, unknown>).chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((cb) => {
            messageListener = cb;
          }),
          removeListener: vi.fn(),
        },
      },
    };

    // Start with the UI open, then close it so reopening paths are exercised.
    await saveInspectMode(true);
    await renderOverlay();

    const initialCloseBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-close-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      initialCloseBtn.click();
      await Promise.resolve();
    });

    // Initially closed
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();

    // Reopen via Alt+S shortcut
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          code: 'KeyS',
          altKey: true,
          bubbles: true,
        })
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();
    let state = await getPageState(window.location.href);
    expect(state.isVisible).toBe(true);
    expect(state.inspectMode).toBe(true);

    // Close via close button
    const closeBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-close-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();

    // Reopen via SET_INSPECT_MODE message
    expect(messageListener).not.toBeNull();
    await act(async () => {
      messageListener!(
        { type: 'SET_INSPECT_MODE', enabled: true },
        {},
        vi.fn()
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).not.toBeNull();
    state = await getPageState(window.location.href);
    expect(state.isVisible).toBe(true);
    expect(state.inspectMode).toBe(true);
  });

  describe('computePopoverPosition (Issue 8)', () => {
    it('positions popover above the target element when element is near the bottom to avoid bottom bar overlap', () => {
      // Viewport: 1024 x 768. Target element near bottom: y = 650, height = 30.
      const rect = { x: 100, y: 650, width: 200, height: 30 };
      const pos = computePopoverPosition(rect, { width: 1024, height: 768 }, 72);

      // Above element: 650 - 290 - 8 = 352
      expect(pos.top).toBe(352);
      expect(pos.left).toBe(100);
      // Bottom of popover: 352 + 290 = 642, which is well above bottom bar zone (768 - 72 = 696)
      expect(pos.top + 290).toBeLessThanOrEqual(768 - 72);
    });

    it('positions popover below element when there is ample space above the bottom bar', () => {
      const rect = { x: 100, y: 100, width: 200, height: 30 };
      const pos = computePopoverPosition(rect, { width: 1024, height: 768 }, 72);

      // Below element: 100 + 30 + 8 = 138
      expect(pos.top).toBe(138);
      expect(pos.left).toBe(100);
      expect(pos.top + 290).toBeLessThanOrEqual(768 - 72);
    });

    it('escapes horizontally to the side for tall elements spanning vertical space to avoid covering element and bottom bar', () => {
      // Tall element: y = 50, height = 620. Total span: 50..670.
      const rect = { x: 50, y: 50, width: 200, height: 620 };
      const pos = computePopoverPosition(rect, { width: 1024, height: 768 }, 72);

      // Should place to the right: x + width + 8 = 50 + 200 + 8 = 258
      expect(pos.left).toBe(258);
      expect(pos.top + 290).toBeLessThanOrEqual(768 - 72);
    });

    it('clamps left position within viewport horizontal margins', () => {
      const rect = { x: 950, y: 100, width: 60, height: 30 };
      const pos = computePopoverPosition(rect, { width: 1024, height: 768 }, 72);

      // 1024 - 340 - 12 = 672
      expect(pos.left).toBe(672);
    });
  });

  describe('Dynamic document.body paddingBottom management (Issue 5)', () => {
    it('sets paddingBottom to 72px when bottom bar is active and restores original on close, minimize, and unmount', async () => {
      document.body.style.paddingBottom = '';
      await saveInspectMode(true);
      await renderOverlay();

      // Bottom bar is visible and expanded
      expect(document.body.style.paddingBottom).toBe('72px');

      // Minimize toolbar
      const minimizeBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-minimize-btn"]'
      ) as HTMLButtonElement;
      expect(minimizeBtn).not.toBeNull();
      await act(async () => {
        minimizeBtn.click();
        await Promise.resolve();
      });

      // Restored to original empty padding
      expect(document.body.style.paddingBottom).toBe('');

      // Expand back
      const pill = container.querySelector(
        '[data-testid="dpa-minimized-pill"]'
      ) as HTMLElement;
      expect(pill).not.toBeNull();
      await act(async () => {
        pill.click();
        await Promise.resolve();
      });

      // Padding re-applied
      expect(document.body.style.paddingBottom).toBe('72px');

      // Close toolbar
      const closeBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-close-btn"]'
      ) as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      await act(async () => {
        closeBtn.click();
        await Promise.resolve();
      });

      // Restored to original
      expect(document.body.style.paddingBottom).toBe('');
    });

    it('safely saves and restores pre-existing inline body padding', async () => {
      document.body.style.paddingBottom = '30px';
      await saveInspectMode(true);
      await renderOverlay();

      expect(document.body.style.paddingBottom).toBe('72px');

      // Unmount component
      await act(async () => {
        root?.unmount();
        root = null;
      });

      // Pre-existing padding restored
      expect(document.body.style.paddingBottom).toBe('30px');
    });
  });

  describe('Device Emulation (in-page iframe preview)', () => {
    it('applies a preset, renders the preview iframe, and keeps the bottom bar in place', async () => {
      const sendMessage = vi.fn();
      (globalThis as Record<string, unknown>).chrome = {
        runtime: { sendMessage },
      };

      await saveInspectMode(true);
      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;
      expect(deviceBtn).not.toBeNull();

      const barBefore = container.querySelector(
        '[data-testid="dpa-bottom-bar"]'
      ) as HTMLElement;
      expect(barBefore).not.toBeNull();
      const paddingBefore = document.body.style.paddingBottom;

      // Open menu
      await act(async () => {
        deviceBtn.click();
      });

      // Select iPhone SE
      const sePresetBtn = container.querySelector(
        '[data-testid="dpa-device-preset-iphone-se"]'
      ) as HTMLButtonElement;
      expect(sePresetBtn).not.toBeNull();

      await act(async () => {
        sePresetBtn.click();
        await Promise.resolve();
      });

      // Verify success toast
      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain('📱 iPhone SE (375×667) を適用しました');

      // Verify device button label updated
      expect(deviceBtn.textContent).toContain('iPhone SE (375×667)');

      // Preview backdrop + iframe are rendered at the raw preset size, scaled.
      const preview = container.querySelector(
        '[data-testid="dpa-device-preview"]'
      ) as HTMLElement;
      expect(preview).not.toBeNull();
      const iframe = container.querySelector(
        '[data-testid="dpa-device-preview-iframe"]'
      ) as HTMLIFrameElement;
      expect(iframe).not.toBeNull();
      expect(iframe.getAttribute('width')).toBe('375');
      expect(iframe.getAttribute('height')).toBe('667');
      expect(iframe.style.width).toBe('375px');
      expect(iframe.style.height).toBe('667px');
      expect(iframe.style.transform).toMatch(/^scale\(/);
      expect(iframe.getAttribute('src')).toBe(window.location.href);

      // The bar node is the same and the preview does not alter page layout.
      const barAfter = container.querySelector(
        '[data-testid="dpa-bottom-bar"]'
      ) as HTMLElement;
      expect(barAfter).toBe(barBefore);
      expect(preview.contains(barAfter)).toBe(false);
      expect(document.body.style.paddingBottom).toBe(paddingBefore);

      // Device emulation stays local: only the mount state broadcast is allowed.
      expect(
        sendMessage.mock.calls.every(
          ([message]) => message?.type === 'PAGE_STATE_UPDATED'
        )
      ).toBe(true);
    });

    it('rotates the selected device locally and shows the rotation toast', async () => {
      await saveInspectMode(true);
      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;

      await act(async () => {
        deviceBtn.click();
      });

      const sePresetBtn = container.querySelector(
        '[data-testid="dpa-device-preset-iphone-se"]'
      ) as HTMLButtonElement;

      await act(async () => {
        sePresetBtn.click();
        await Promise.resolve();
      });

      expect(deviceBtn.textContent).toContain('iPhone SE (375×667)');

      const iframe = container.querySelector(
        '[data-testid="dpa-device-preview-iframe"]'
      ) as HTMLIFrameElement;
      expect(iframe).not.toBeNull();
      const srcBefore = iframe.getAttribute('src');

      const rotateBtn = container.querySelector(
        '[data-testid="dpa-device-rotate-btn"]'
      ) as HTMLButtonElement;
      expect(rotateBtn).not.toBeNull();

      await act(async () => {
        rotateBtn.click();
        await Promise.resolve();
      });

      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain('🔄 iPhone SE (横向き: 667×375) に回転しました');
      expect(deviceBtn.textContent).toContain('iPhone SE (667×375)');

      // Rotation only resizes the existing iframe; it must not reload its src.
      expect(iframe.getAttribute('width')).toBe('667');
      expect(iframe.getAttribute('height')).toBe('375');
      expect(iframe.getAttribute('src')).toBe(srcBefore);

      // Switching presets while landscape must keep the landscape dimensions.
      await act(async () => {
        deviceBtn.click();
      });
      const ipadPreset = container.querySelector(
        '[data-testid="dpa-device-preset-ipad-mini"]'
      ) as HTMLButtonElement;
      await act(async () => {
        ipadPreset.click();
        await Promise.resolve();
      });
      expect(deviceBtn.textContent).toContain('iPad Mini (1024×768)');
      expect(iframe.getAttribute('width')).toBe('1024');
      expect(iframe.getAttribute('height')).toBe('768');
    });

    it('shows desktop reset toast and clears local emulation state', async () => {
      await saveInspectMode(true);
      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;

      await act(async () => {
        deviceBtn.click();
      });

      const sePresetBtn = container.querySelector(
        '[data-testid="dpa-device-preset-iphone-se"]'
      ) as HTMLButtonElement;

      await act(async () => {
        sePresetBtn.click();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="dpa-device-active-badge"]')).not.toBeNull();
      expect(
        container.querySelector('[data-testid="dpa-device-preview-iframe"]')
      ).not.toBeNull();

      await act(async () => {
        deviceBtn.click();
      });

      const resetBtn = container.querySelector(
        '[data-testid="dpa-device-reset"]'
      ) as HTMLButtonElement;
      expect(resetBtn).not.toBeNull();

      await act(async () => {
        resetBtn.click();
        await Promise.resolve();
      });

      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain('🖥️ デスクトップ表示にリセットしました');
      expect(deviceBtn.textContent).toContain('デバイス切替');
      expect(container.querySelector('[data-testid="dpa-device-active-badge"]')).toBeNull();
      expect(container.querySelector('[data-testid="dpa-device-preview"]')).toBeNull();
      expect(
        container.querySelector('[data-testid="dpa-device-preview-iframe"]')
      ).toBeNull();
    });

    it('shows a non-interactive hint when the preview document is inaccessible', async () => {
      await saveInspectMode(true);
      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        deviceBtn.click();
      });
      const sePresetBtn = container.querySelector(
        '[data-testid="dpa-device-preset-iphone-se"]'
      ) as HTMLButtonElement;
      await act(async () => {
        sePresetBtn.click();
        await Promise.resolve();
      });

      const iframe = container.querySelector(
        '[data-testid="dpa-device-preview-iframe"]'
      ) as HTMLIFrameElement;
      expect(iframe).not.toBeNull();

      // Simulate a cross-origin document: contentDocument access yields null.
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get: () => null,
      });

      await act(async () => {
        iframe.dispatchEvent(new Event('load'));
        await Promise.resolve();
      });

      const hint = container.querySelector(
        '[data-testid="dpa-device-preview-hint"]'
      );
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain('クロスオリジン');
      expect(iframe.style.pointerEvents).toBe('none');
      expect(container.querySelector('[data-testid="dpa-device-preview"]')).not.toBeNull();
    });
  });

  describe('Prompt copy clears markings only on success', () => {
    it('clears annotations, closes the popover, and toasts after a successful copy', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const target = document.createElement('section');
      target.id = 'copy-target';
      target.textContent = 'Copy target';
      document.body.appendChild(target);

      await saveInspectMode(true);
      await renderOverlay();
      await seedMountedState({
        annotations: [buildAnnotation(1, '#copy-target', '//*[@id="copy-target"]')],
      });

      const badge = container.querySelector(
        '[data-testid="dpa-badge-1"]'
      ) as HTMLButtonElement;
      expect(badge).not.toBeNull();
      await act(async () => {
        badge.click();
      });
      expect(container.querySelector('[data-testid="dpa-popover"]')).not.toBeNull();

      const copyBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-copy-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        copyBtn.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[data-testid="dpa-badge-1"]')).toBeNull();
      expect(container.querySelector('[data-testid="dpa-popover"]')).toBeNull();
      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast?.textContent).toContain(
        'コピーしました。マーキングをクリアしました'
      );

      const stored = await getPageState(window.location.href);
      expect(stored.annotations).toHaveLength(0);
    });

    it('keeps annotations when both clipboard paths fail', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error('denied')),
        },
        configurable: true,
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => false),
      });

      const target = document.createElement('section');
      target.id = 'keep-target';
      target.textContent = 'Keep target';
      document.body.appendChild(target);

      await saveInspectMode(true);
      await renderOverlay();
      await seedMountedState({
        annotations: [buildAnnotation(1, '#keep-target', '//*[@id="keep-target"]')],
      });

      const copyBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-copy-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        copyBtn.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="dpa-badge-1"]')).not.toBeNull();
      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast?.textContent).toContain('コピーに失敗しました');
      const stored = await getPageState(window.location.href);
      expect(stored.annotations).toHaveLength(1);
    });

    it('clears via the execCommand fallback and labels the JSON toast', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      });
      const execCommand = vi.fn(() => true);
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      const target = document.createElement('section');
      target.id = 'json-target';
      target.textContent = 'JSON target';
      document.body.appendChild(target);

      await saveInspectMode(true);
      await renderOverlay();
      await seedMountedState({
        annotations: [buildAnnotation(1, '#json-target', '//*[@id="json-target"]')],
      });

      const formatToggle = container.querySelector(
        '[data-testid="dpa-copy-format-toggle-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        formatToggle.click();
      });
      const jsonBtn = container.querySelector(
        '[data-testid="dpa-copy-json-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        jsonBtn.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(container.querySelector('[data-testid="dpa-badge-1"]')).toBeNull();
      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast?.textContent).toContain('JSON');
      expect(toast?.textContent).toContain('マーキングをクリアしました');
    });
  });

  describe('Export reconciles live mask-selector ancestors', () => {
    const SECRET_VALUE = 'super-secret-value-9182';
    const SECRET_TITLE = 'super-secret-title-9182';
    const SECRET_PLACEHOLDER = 'super-secret-placeholder-9182';
    const SECRET_ARIA = 'super-secret-aria-9182';
    const SPAN_TEXT = 'span-secret-text-9182';
    const SPAN_TITLE = 'span-secret-title-9182';

    function mountMaskedTree() {
      const parent = document.createElement('div');
      parent.id = 'mask-parent';
      parent.setAttribute('data-mask', 'true');

      const input = document.createElement('input');
      input.id = 'secret-input';
      input.type = 'text';
      input.setAttribute('value', SECRET_VALUE);
      input.setAttribute('title', SECRET_TITLE);
      input.setAttribute('placeholder', SECRET_PLACEHOLDER);
      input.setAttribute('aria-label', SECRET_ARIA);

      const span = document.createElement('span');
      span.id = 'secret-span';
      span.textContent = SPAN_TEXT;
      span.setAttribute('title', SPAN_TITLE);

      parent.append(input, span);
      document.body.appendChild(parent);
    }

    function buildMaskedDescendantAnnotations(): AnnotationItem[] {
      const inputBase = buildAnnotation(
        1,
        '#secret-input',
        '//*[@id="secret-input"]'
      );
      const spanBase = buildAnnotation(
        2,
        '#secret-span',
        '//*[@id="secret-span"]'
      );

      return [
        {
          ...inputBase,
          maskText: false,
          element: {
            ...inputBase.element,
            tagName: 'input',
            id: 'secret-input',
            textContent: '',
            outerHTMLSnippet: `<input id="secret-input" type="text" value="${SECRET_VALUE}" title="${SECRET_TITLE}" placeholder="${SECRET_PLACEHOLDER}" aria-label="${SECRET_ARIA}">`,
            attributes: {
              id: 'secret-input',
              type: 'text',
              value: SECRET_VALUE,
              title: SECRET_TITLE,
              placeholder: SECRET_PLACEHOLDER,
              'aria-label': SECRET_ARIA,
            },
          },
        },
        {
          ...spanBase,
          maskText: false,
          element: {
            ...spanBase.element,
            tagName: 'span',
            id: 'secret-span',
            textContent: SPAN_TEXT,
            outerHTMLSnippet: `<span id="secret-span" title="${SPAN_TITLE}">${SPAN_TEXT}</span>`,
            attributes: { id: 'secret-span', title: SPAN_TITLE },
          },
        },
      ];
    }

    const maskingConfig = {
      autoMaskPII: false,
      maskAllText: false,
      maskSelectors: ['[data-mask="true"]'],
      maskColor: '#FF00FF',
      visualMaskEnabled: true,
    };

    function expectNoSecrets(copiedText: string) {
      expect(copiedText).toContain('[MASKED]');
      for (const secret of [
        SECRET_VALUE,
        SECRET_TITLE,
        SECRET_PLACEHOLDER,
        SECRET_ARIA,
        SPAN_TEXT,
        SPAN_TITLE,
      ]) {
        expect(copiedText).not.toContain(secret);
      }
    }

    it('masks descendants of a mask-selector ancestor in JSON even when maskText was false', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      mountMaskedTree();
      await saveInspectMode(true);
      await renderOverlay();
      await seedMountedState({
        maskingConfig,
        annotations: buildMaskedDescendantAnnotations(),
      });

      const formatToggle = container.querySelector(
        '[data-testid="dpa-copy-format-toggle-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        formatToggle.click();
      });
      const jsonBtn = container.querySelector(
        '[data-testid="dpa-copy-json-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        jsonBtn.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      const copiedText = String(writeText.mock.calls[0]?.[0] ?? '');
      expectNoSecrets(copiedText);
      expect(copiedText).toMatch(/"maskText": true/);
    });

    it('masks descendants of a mask-selector ancestor in Markdown when maskText was false', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      mountMaskedTree();
      await saveInspectMode(true);
      await renderOverlay();
      await seedMountedState({
        maskingConfig,
        annotations: buildMaskedDescendantAnnotations(),
      });

      const copyBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-copy-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        copyBtn.click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      const copiedText = String(writeText.mock.calls[0]?.[0] ?? '');
      expect(copiedText).toContain('- **Text**: `[MASKED]`');
      expectNoSecrets(copiedText);
    });
  });
});

