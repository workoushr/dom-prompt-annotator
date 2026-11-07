import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverlayApp } from '../content/OverlayApp';
import { SidePanelApp } from '../sidepanel/SidePanelApp';
import { resetMemoryStoreForTests } from '../utils/storage';
import { SHADOW_HOST_ID } from '../utils/masker';
import { ExportPayload, ExtensionMessage } from '../types/annotation';

// Enable React 18 act environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type RuntimeMessageListener = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

describe('End-to-End Integration: OverlayApp + SidePanelApp User Journey', () => {
  let hostPageContainer: HTMLElement;
  let extensionHostContainer: HTMLDivElement;
  let overlayMount: HTMLDivElement;
  let sidePanelMount: HTMLDivElement;
  let overlayRoot: Root | null = null;
  let sidePanelRoot: Root | null = null;
  let messageListeners: Set<RuntimeMessageListener>;
  let clipboardText = '';
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMemoryStoreForTests();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.title = 'CloudMetrics SaaS Dashboard';
    clipboardText = '';

    messageListeners = new Set<RuntimeMessageListener>();

    const dispatchExtensionMessage = (msg: ExtensionMessage): Promise<unknown> => {
      return new Promise((resolve) => {
        let responded = false;
        const sendResponse = (res?: unknown) => {
          if (!responded) {
            responded = true;
            resolve(res);
          }
        };

        for (const listener of Array.from(messageListeners)) {
          listener(msg, {} as chrome.runtime.MessageSender, sendResponse);
        }

        // Resolve on microtask if no listener handled synchronously/asynchronously
        Promise.resolve().then(() => {
          if (!responded) {
            resolve(undefined);
          }
        });
      });
    };

    const currentPageUrl = window.location.href;

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 1,
            url: currentPageUrl,
            title: 'CloudMetrics SaaS Dashboard',
          },
        ]),
        sendMessage: vi.fn(async (_tabId: number, msg: ExtensionMessage) => {
          return await dispatchExtensionMessage(msg);
        }),
        onActivated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      runtime: {
        sendMessage: vi.fn(async (msg: ExtensionMessage) => {
          return await dispatchExtensionMessage(msg);
        }),
        onMessage: {
          addListener: vi.fn((listener: RuntimeMessageListener) => {
            messageListeners.add(listener);
          }),
          removeListener: vi.fn((listener: RuntimeMessageListener) => {
            messageListeners.delete(listener);
          }),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    writeTextMock = vi.fn(async (text: string) => {
      clipboardText = text;
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    // 1. Build a realistic host DOM tree with React Fiber, PII, and Playwright mask targets
    hostPageContainer = document.createElement('main');
    hostPageContainer.id = 'app-main';
    hostPageContainer.className = 'dashboard-layout px-6 py-8';
    hostPageContainer.innerHTML = [
      '<section id="pricing-card" class="hero-pricing-card rounded-xl shadow-lg p-6">',
      '<div class="card-header"><h2 id="plan-title" class="text-xl font-bold">Enterprise Plan</h2>',
      '<span id="customer-badge" class="customer-name font-medium">山田 太郎</span></div>',
      '<div id="secret-project-box" data-mask="true" class="project-codename">機密プロジェクト名</div>',
      '<input id="api-password-input" type="password" value="super-secret-pw" />',
      '<div id="account-pii-summary" class="pii-details text-sm">',
      '連絡先: user@example.com / TEL: 090-1234-5678 / Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      '</div>',
      '<div class="card-actions mt-4">',
      '<button id="upgrade-cta-btn" class="btn-upgrade bg-indigo-600 text-white px-4 py-2 rounded">',
      '<span id="upgrade-cta-inner-text" class="btn-label">プランをアップグレード</span>',
      '</button></div></section>',
    ].join('');
    document.body.appendChild(hostPageContainer);

    // Attach simulated React 18 Fiber hierarchy (`App` -> `DashboardLayout` -> `HeroPricingCard`)
    const appFiber = {
      type: function App() {},
      return: null,
    };
    const layoutFiber = {
      type: function DashboardLayout() {},
      return: appFiber,
    };
    const heroPricingCardFiber = {
      type: Object.assign(function HeroPricingCard() {}, {
        displayName: 'HeroPricingCard',
      }),
      return: layoutFiber,
      _debugSource: {
        fileName: 'src/components/HeroPricingCard.tsx',
        lineNumber: 42,
        columnNumber: 8,
      },
    };
    const buttonHostFiber = {
      type: 'button',
      return: heroPricingCardFiber,
      _debugSource: {
        fileName: 'src/components/HeroPricingCard.tsx',
        lineNumber: 42,
        columnNumber: 8,
      },
    };

    const pricingCardEl = document.getElementById('pricing-card') as HTMLElement;
    const upgradeBtnEl = document.getElementById('upgrade-cta-btn') as HTMLElement;
    const innerSpanEl = document.getElementById('upgrade-cta-inner-text') as HTMLElement;

    (pricingCardEl as unknown as Record<string, unknown>).__reactFiber$test =
      heroPricingCardFiber;
    (upgradeBtnEl as unknown as Record<string, unknown>).__reactFiber$test =
      buttonHostFiber;
    (innerSpanEl as unknown as Record<string, unknown>).__reactFiber$test = {
      type: 'span',
      return: buttonHostFiber,
      _debugSource: {
        fileName: 'src/components/HeroPricingCard.tsx',
        lineNumber: 42,
        columnNumber: 8,
      },
    };

    // Mock bounding client rects for realistic coordinates
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.id === 'upgrade-cta-btn') {
          return {
            x: 120,
            y: 260,
            left: 120,
            top: 260,
            width: 220,
            height: 44,
            right: 340,
            bottom: 304,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.id === 'pricing-card') {
          return {
            x: 80,
            y: 60,
            left: 80,
            top: 60,
            width: 640,
            height: 320,
            right: 720,
            bottom: 380,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          x: 100,
          y: 140,
          left: 100,
          top: 140,
          width: 240,
          height: 36,
          right: 340,
          bottom: 176,
          toJSON: () => ({}),
        } as DOMRect;
      }
    );

    // 2. Mount both OverlayApp and SidePanelApp inside #dpa-root-host so extension UI events are isolated from host DOM
    extensionHostContainer = document.createElement('div');
    extensionHostContainer.id = SHADOW_HOST_ID;
    document.body.appendChild(extensionHostContainer);

    overlayMount = document.createElement('div');
    overlayMount.id = 'overlay-mount';
    extensionHostContainer.appendChild(overlayMount);

    sidePanelMount = document.createElement('div');
    sidePanelMount.id = 'sidepanel-mount';
    extensionHostContainer.appendChild(sidePanelMount);
  });

  afterEach(async () => {
    if (overlayRoot) {
      await act(async () => {
        overlayRoot?.unmount();
      });
      overlayRoot = null;
    }
    if (sidePanelRoot) {
      await act(async () => {
        sidePanelRoot?.unmount();
      });
      sidePanelRoot = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  function setInputValue(
    el: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    const prototype =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function flushAsync() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('completes the full user journey: Inspect Mode -> Parent traversal -> React metadata -> Playwright & PII masking -> Markdown & JSON clipboard export', async () => {
    overlayRoot = createRoot(overlayMount);
    sidePanelRoot = createRoot(sidePanelMount);

    await act(async () => {
      overlayRoot!.render(<OverlayApp />);
      sidePanelRoot!.render(<SidePanelApp />);
    });
    await flushAsync();

    // =========================================================================
    // Step 1: Enable Inspect Mode from SidePanelApp
    // =========================================================================
    const inspectToggleBtn = sidePanelMount.querySelector(
      '[data-testid="toggle-inspect-mode"]'
    ) as HTMLButtonElement;
    expect(inspectToggleBtn).not.toBeNull();
    expect(inspectToggleBtn.textContent).toContain('通常操作モード');

    await act(async () => {
      inspectToggleBtn.click();
    });
    await flushAsync();

    expect(inspectToggleBtn.textContent).toContain('選択モード (Inspect ON)');
    const modePill = overlayMount.querySelector('[data-testid="dpa-mode-pill"]');
    expect(modePill?.textContent).toContain('Selection Mode');

    // =========================================================================
    // Step 2: Click inner <span> -> Popover opens -> Step up to parent <button> -> Enter instruction -> Save
    // =========================================================================
    const innerSpan = document.getElementById('upgrade-cta-inner-text') as HTMLElement;
    await act(async () => {
      innerSpan.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });
    await flushAsync();

    const popover = overlayMount.querySelector('[data-testid="dpa-popover"]');
    expect(popover).not.toBeNull();

    // Initially targets the clicked inner <span>
    const popoverSelector = overlayMount.querySelector(
      '[data-testid="dpa-popover-selector"]'
    );
    expect(popoverSelector?.textContent).toBe('#upgrade-cta-inner-text');

    // Click `↑ 親要素 (Parent)` to step up to the parent <button id="upgrade-cta-btn">
    const parentBtn = overlayMount.querySelector(
      '[data-testid="dpa-btn-parent"]'
    ) as HTMLButtonElement;
    expect(parentBtn.disabled).toBe(false);

    await act(async () => {
      parentBtn.click();
    });
    await flushAsync();

    expect(popoverSelector?.textContent).toBe('#upgrade-cta-btn');
    const popoverTag = overlayMount.querySelector('[data-testid="dpa-popover-tag"]');
    expect(popoverTag?.textContent).toContain('button#upgrade-cta-btn');

    // Verify React component badge is shown in the Popover
    const popoverFw = overlayMount.querySelector(
      '[data-testid="dpa-popover-framework"]'
    );
    expect(popoverFw?.textContent).toContain('HeroPricingCard');

    // Enter instruction for #1 and save
    const popoverTextarea = overlayMount.querySelector(
      '[data-testid="dpa-textarea-instruction"]'
    ) as HTMLTextAreaElement;
    const popoverSaveBtn = overlayMount.querySelector(
      '[data-testid="dpa-btn-save"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(
        popoverTextarea,
        'CTAボタンをグラデーション背景にし、ホバー時のアニメーションを追加'
      );
    });
    await act(async () => {
      popoverSaveBtn.click();
    });
    await flushAsync();

    // =========================================================================
    // Step 3: Verify #1 badge on page AND #1 card in SidePanelApp with React metadata
    // =========================================================================
    const badge1 = overlayMount.querySelector('[data-testid="dpa-badge-1"]');
    expect(badge1).not.toBeNull();
    expect(badge1?.textContent).toBe('#1');

    const card1 = sidePanelMount.querySelector('[data-testid="annotation-card-1"]');
    expect(card1).not.toBeNull();

    const card1Fw = sidePanelMount.querySelector(
      '[data-testid="annotation-framework-1"]'
    );
    expect(card1Fw?.textContent).toContain('HeroPricingCard');
    expect(card1Fw?.textContent).toContain(
      'src/components/HeroPricingCard.tsx:42'
    );

    // Also annotate the parent `#pricing-card` (which contains PII, password input, [data-mask="true"], and .customer-name)
    // so that we can verify comprehensive masking across outerHTMLSnippet, textContent, and attributes!
    const pricingCard = document.getElementById('pricing-card') as HTMLElement;
    await act(async () => {
      pricingCard.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });
    await flushAsync();

    const popoverTextarea2 = overlayMount.querySelector(
      '[data-testid="dpa-textarea-instruction"]'
    ) as HTMLTextAreaElement;
    const popoverSaveBtn2 = overlayMount.querySelector(
      '[data-testid="dpa-btn-save"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(popoverTextarea2, 'カード全体の余白と角丸を調整');
    });
    await act(async () => {
      popoverSaveBtn2.click();
    });
    await flushAsync();

    // Also annotate `.customer-name` directly as #3
    const customerBadge = document.getElementById('customer-badge') as HTMLElement;
    await act(async () => {
      customerBadge.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });
    await flushAsync();

    const popoverTextarea3 = overlayMount.querySelector(
      '[data-testid="dpa-textarea-instruction"]'
    ) as HTMLTextAreaElement;
    const popoverSaveBtn3 = overlayMount.querySelector(
      '[data-testid="dpa-btn-save"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(popoverTextarea3, '顧客名バッジのフォントウェイトを太くする');
    });
    await act(async () => {
      popoverSaveBtn3.click();
    });
    await flushAsync();

    expect(
      sidePanelMount.querySelector('[data-testid="annotation-count-badge"]')
        ?.textContent
    ).toBe('3 件の指示');

    // =========================================================================
    // Step 4: Add custom Playwright mask selector `.customer-name` in SidePanelApp,
    // enter global instruction (`全体的にモダンな配色に修正`), and copy to clipboard
    // =========================================================================
    // Before adding `.customer-name` to maskSelectors, #3 text preview shows "山田 太郎"
    const textPreview3 = sidePanelMount.querySelector(
      '[data-testid="annotation-text-preview-3"]'
    );
    expect(textPreview3?.textContent).toBe('山田 太郎');

    const addSelectorInput = sidePanelMount.querySelector(
      '[data-testid="add-mask-selector-input"]'
    ) as HTMLInputElement;
    const addSelectorBtn = sidePanelMount.querySelector(
      '[data-testid="add-mask-selector-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(addSelectorInput, '.customer-name');
    });
    await act(async () => {
      addSelectorBtn.click();
    });
    await flushAsync();

    // Verify `.customer-name` chip was added and #3 text preview is now `[MASKED]`
    expect(
      sidePanelMount.querySelector(
        '[data-testid="mask-selector-chip-.customer-name"]'
      )
    ).not.toBeNull();
    expect(textPreview3?.textContent).toBe('[MASKED]');

    // Verify visual mask overlays on page include password input, [data-mask="true"], and .customer-name
    const visualMasks = overlayMount.querySelectorAll(
      '[data-testid="dpa-visual-mask"]'
    );
    const visualMaskSelectors = Array.from(visualMasks).map((el) =>
      el.getAttribute('data-mask-selector')
    );
    expect(visualMaskSelectors).toContain('#api-password-input');
    expect(visualMaskSelectors).toContain('#secret-project-box');
    expect(visualMaskSelectors).toContain('#customer-badge');

    // Enter global instruction
    const globalInstructionInput = sidePanelMount.querySelector(
      '[data-testid="global-instruction-input"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(globalInstructionInput, '全体的にモダンな配色に修正');
    });
    await flushAsync();

    // Click "クリップボードにコピー" in Markdown mode
    const copyBtn = sidePanelMount.querySelector(
      '[data-testid="copy-export-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      copyBtn.click();
    });
    await flushAsync();

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const markdownExport = clipboardText;

    // =========================================================================
    // Step 5: Inspect Markdown & JSON clipboard outputs
    // =========================================================================
    // Verify Markdown structure & global instruction
    expect(markdownExport).toContain(
      '# フロントエンド修正指示 (DOM Prompt Annotator)'
    );
    expect(markdownExport).toContain('## ページ全体の前提・共通指示');
    expect(markdownExport).toContain('全体的にモダンな配色に修正');
    expect(markdownExport).toContain(
      'HeroPricingCard (src/components/HeroPricingCard.tsx:42:8)'
    );
    expect(markdownExport).toContain(
      'CTAボタンをグラデーション背景にし、ホバー時のアニメーションを追加'
    );

    // Verify no raw PII or masked element text leaks in the Markdown export
    expect(markdownExport).not.toContain('user@example.com');
    expect(markdownExport).not.toContain('090-1234-5678');
    expect(markdownExport).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(markdownExport).not.toContain('super-secret-pw');
    expect(markdownExport).not.toContain('機密プロジェクト名');
    expect(markdownExport).not.toContain('山田 太郎');

    // Verify expected masked placeholders are present
    expect(markdownExport).toContain('[MASKED_EMAIL]');
    expect(markdownExport).toContain('[MASKED_PHONE]');
    expect(markdownExport).toContain('[MASKED_TOKEN]');
    expect(markdownExport).toContain('[MASKED]');

    // Now switch to pure JSON mode and copy again
    const jsonFormatBtn = sidePanelMount.querySelector(
      '[data-testid="format-select-json"]'
    ) as HTMLButtonElement;
    await act(async () => {
      jsonFormatBtn.click();
    });
    await act(async () => {
      copyBtn.click();
    });
    await flushAsync();

    expect(writeTextMock).toHaveBeenCalledTimes(2);
    const jsonExport = clipboardText;
    const payload = JSON.parse(jsonExport) as ExportPayload;

    expect(payload.pageContext.globalInstruction).toBe(
      '全体的にモダンな配色に修正'
    );
    expect(payload.pageContext.maskingConfig.maskSelectors).toEqual([
      'input[type="password"]',
      '[data-mask="true"]',
      '.customer-name',
    ]);
    expect(payload.annotations).toHaveLength(3);

    // Annotation #1: `<button id="upgrade-cta-btn">` (selected via stepping up to Parent)
    const ann1 = payload.annotations[0]!;
    expect(ann1.id).toBe(1);
    expect(ann1.element.tagName).toBe('button');
    expect(ann1.element.id).toBe('upgrade-cta-btn');
    expect(ann1.element.selector).toBe('#upgrade-cta-btn');
    expect(ann1.element.computedStyles.display).toBeDefined();
    expect(ann1.element.framework).toEqual({
      detected: 'react',
      componentName: 'HeroPricingCard',
      componentHierarchy: ['App', 'DashboardLayout', 'HeroPricingCard'],
      source: {
        fileName: 'src/components/HeroPricingCard.tsx',
        lineNumber: 42,
        columnNumber: 8,
      },
    });

    // Annotation #2: `<section id="pricing-card">` containing PII and selector-masked children
    const ann2 = payload.annotations[1]!;
    expect(ann2.id).toBe(2);
    expect(ann2.element.tagName).toBe('section');
    expect(ann2.element.selector).toBe('#pricing-card');
    expect(ann2.element.textContent).toContain('[MASKED_EMAIL]');
    expect(ann2.element.textContent).toContain('[MASKED_PHONE]');
    expect(ann2.element.textContent).toContain('[MASKED_TOKEN]');
    // In outerHTMLSnippet, structural tags and classes are preserved while sensitive children are masked
    expect(ann2.element.outerHTMLSnippet).toContain(
      '<section id="pricing-card" class="hero-pricing-card rounded-xl shadow-lg p-6">'
    );
    expect(ann2.element.outerHTMLSnippet).toContain(
      '<span id="customer-badge" class="customer-name font-medium">[MASKED]</span>'
    );
    expect(ann2.element.outerHTMLSnippet).toContain(
      '<div id="secret-project-box" data-mask="true" class="project-codename">[MASKED]</div>'
    );
    expect(ann2.element.outerHTMLSnippet).toContain(
      '<input id="api-password-input" type="password" value="[MASKED]">'
    );

    // Annotation #3: `<span id="customer-badge" class="customer-name">` matched by custom `.customer-name` selector
    const ann3 = payload.annotations[2]!;
    expect(ann3.id).toBe(3);
    expect(ann3.element.selector).toBe('#customer-badge');
    expect(ann3.element.textContent).toBe('[MASKED]');
    expect(ann3.element.outerHTMLSnippet).toBe(
      '<span id="customer-badge" class="customer-name font-medium">[MASKED]</span>'
    );
  });
});
