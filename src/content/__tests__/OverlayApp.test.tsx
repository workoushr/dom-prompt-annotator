import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverlayApp } from '../OverlayApp';
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
});

