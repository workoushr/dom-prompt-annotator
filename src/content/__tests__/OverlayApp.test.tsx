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
  resetMemoryStoreForTests,
  savePageState,
} from '../../utils/storage';
import { SHADOW_HOST_ID } from '../../utils/masker';

// Enable React 18 act environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('Content Script & Shadow DOM Overlay UI (OverlayApp.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(async () => {
    resetMemoryStoreForTests();
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
    vi.restoreAllMocks();
  });

  async function renderOverlay() {
    root = createRoot(container);
    await act(async () => {
      root!.render(<OverlayApp />);
    });
    // Flush async getPageState effect
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('intercepts clicks on page elements in inspectMode and opens the In-Page Annotation Popover', async () => {
    await savePageState(window.location.href, {
      inspectMode: true,
    });

    const pageSection = document.createElement('section');
    pageSection.id = 'hero-section';
    pageSection.innerHTML = `
      <a id="cta-link" class="btn primary" href="https://example.com/navigate">
        Get Started Now
      </a>
    `;
    document.body.appendChild(pageSection);

    await renderOverlay();

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
    await savePageState(window.location.href, {
      inspectMode: true,
    });

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
    await savePageState(window.location.href, {
      inspectMode: true,
    });

    const profileHeader = document.createElement('h2');
    profileHeader.id = 'user-greeting';
    profileHeader.className = 'title-lg';
    profileHeader.textContent = 'Welcome back, Taro Yamada!';
    document.body.appendChild(profileHeader);

    await renderOverlay();

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

    await savePageState(window.location.href, {
      inspectMode: true,
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

    await renderOverlay();
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
    await savePageState(window.location.href, {
      inspectMode: true,
      isVisible: true,
    });

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
    await savePageState(window.location.href, {
      inspectMode: true,
      isVisible: true,
    });

    await renderOverlay();

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

  it('re-opens closed overlay UI via SET_INSPECT_MODE or TOGGLE_OVERLAY message or Alt+S shortcut', async () => {
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

    // Start with closed UI
    await savePageState(window.location.href, {
      inspectMode: false,
      isVisible: false,
    });

    await renderOverlay();

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

  describe('Device Emulation Feedback & Error Handling (Issue 6)', () => {
    it('shows success toast when device emulation succeeds via runtime message', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn((msg: any) => {
            if (msg.type === 'SET_DEVICE_EMULATION') {
              return Promise.resolve({
                ok: true,
                config: {
                  enabled: true,
                  presetId: 'iphone-se',
                  name: 'iPhone SE',
                  width: 375,
                  height: 667,
                  orientation: 'portrait',
                  deviceScaleFactor: 2,
                  mobile: true,
                  touch: true,
                },
              });
            }
            return Promise.resolve({ ok: true });
          }),
        },
      };

      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;
      expect(deviceBtn).not.toBeNull();

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
    });

    it('shows error toast and does not falsely activate emulation when background fails', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn((msg: any) => {
            if (msg.type === 'SET_DEVICE_EMULATION') {
              return Promise.resolve({
                ok: false,
                error: '既にDevToolsまたは別のデバッガーが開いているため接続できません。DevToolsを閉じて再試行してください。',
              });
            }
            return Promise.resolve({ ok: true });
          }),
        },
      };

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

      // Error toast must be displayed
      const toast = container.querySelector('[data-testid="dpa-toast-alert"]');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain('⚠️ デバイスエミュレーション失敗: 既にDevToolsまたは別のデバッガーが開いているため接続できません');

      // Device button must remain un-emulated
      expect(deviceBtn.textContent).toContain('デバイス切替');
      expect(container.querySelector('[data-testid="dpa-device-active-badge"]')).toBeNull();
    });

    it('shows desktop reset toast when clearing device emulation', async () => {
      (globalThis as any).chrome = {
        runtime: {
          sendMessage: vi.fn((msg: any) => {
            if (msg.type === 'CLEAR_DEVICE_EMULATION') {
              return Promise.resolve({ ok: true });
            }
            return Promise.resolve({ ok: true });
          }),
        },
      };

      await renderOverlay();

      const deviceBtn = container.querySelector(
        '[data-testid="dpa-bottom-bar-device-btn"]'
      ) as HTMLButtonElement;

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
    });
  });
});

