import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidePanelApp } from '../SidePanelApp';
import {
  getPageState,
  resetMemoryStoreForTests,
  savePageState,
} from '../../utils/storage';
import { AnnotationItem } from '../../types/annotation';

// Enable React 18 act environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function createMockAnnotation(
  id: number,
  overrides: Partial<AnnotationItem> = {}
): AnnotationItem {
  return {
    id,
    instruction: `修正指示 #${id}`,
    maskText: false,
    createdAt: '2026-11-07T00:00:00.000Z',
    element: {
      tagName: 'div',
      id: `card-${id}`,
      className: 'user-profile-card shadow',
      selector: `#card-${id}`,
      xpath: `//*[@id="card-${id}"]`,
      attributes: {
        id: `card-${id}`,
        class: 'user-profile-card shadow',
      },
      textContent: `山田太郎 (user${id}@example.com)`,
      outerHTMLSnippet: `<div id="card-${id}" class="user-profile-card shadow">山田太郎 (user${id}@example.com)</div>`,
      rect: { x: 20, y: 80 * id, width: 320, height: 64 },
      computedStyles: {
        display: 'block',
      },
      framework: {
        detected: 'react',
        componentName: 'UserProfileCard',
        componentHierarchy: ['App', 'UserProfileCard'],
        source: {
          fileName: 'src/components/UserProfileCard.tsx',
          lineNumber: 18,
        },
      },
    },
    ...overrides,
  };
}

describe('SidePanelApp UI (src/sidepanel/SidePanelApp.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let tabSendMessageMock: ReturnType<typeof vi.fn>;
  const activeTabUrl = 'https://example.com/dashboard';

  beforeEach(async () => {
    resetMemoryStoreForTests();
    document.body.innerHTML = '';

    tabSendMessageMock = vi.fn().mockImplementation(async (_tabId, msg) => {
      if (msg?.type === 'GET_LIVE_PAGE_CONTEXT') {
        return {
          url: activeTabUrl,
          title: 'Dashboard - Example App',
          viewport: { width: 1440, height: 900 },
        };
      }
      return { ok: true };
    });

    (globalThis as Record<string, unknown>).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 101,
            url: activeTabUrl,
            title: 'Dashboard - Example App',
          },
        ]),
        sendMessage: tabSendMessageMock,
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
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  async function renderSidePanel() {
    root = createRoot(container);
    await act(async () => {
      root!.render(<SidePanelApp />);
    });
    // Flush async tab query & getPageState effects
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function setInputValue(
    el: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    const prototype =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('synchronizes with active tab, toggles Inspect Mode, and updates globalInstruction', async () => {
    await savePageState(activeTabUrl, { inspectMode: false });
    await renderSidePanel();

    const inspectBtn = container.querySelector(
      '[data-testid="toggle-inspect-mode"]'
    ) as HTMLButtonElement;
    expect(inspectBtn.textContent).toContain('通常操作モード');

    await act(async () => {
      inspectBtn.click();
    });

    expect(inspectBtn.textContent).toContain('選択モード (Inspect ON)');
    const storedAfterToggle = await getPageState(activeTabUrl);
    expect(storedAfterToggle.inspectMode).toBe(true);
    expect(tabSendMessageMock).toHaveBeenCalledWith(101, {
      type: 'SET_INSPECT_MODE',
      enabled: true,
      url: activeTabUrl,
    });

    // Update global instruction
    const globalTextarea = container.querySelector(
      '[data-testid="global-instruction-input"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(globalTextarea, 'モバイル表示時は1カラムにしてください');
    });

    const storedAfterGlobal = await getPageState(activeTabUrl);
    expect(storedAfterGlobal.globalInstruction).toBe(
      'モバイル表示時は1カラムにしてください'
    );
  });

  it('renders annotations, supports hovering highlight, scrolling, per-element masking, editing instruction, and deleting with re-numbering', async () => {
    await savePageState(activeTabUrl, {
      inspectMode: true,
      annotations: [createMockAnnotation(1), createMockAnnotation(2)],
    });

    await renderSidePanel();

    const countBadge = container.querySelector(
      '[data-testid="annotation-count-badge"]'
    );
    expect(countBadge?.textContent).toBe('2 件の指示');

    const card1 = container.querySelector(
      '[data-testid="annotation-card-1"]'
    ) as HTMLElement;
    expect(card1).not.toBeNull();

    // Framework badge should show component name and source file:line
    const fwBadge1 = container.querySelector(
      '[data-testid="annotation-framework-1"]'
    );
    expect(fwBadge1?.textContent).toContain('UserProfileCard');
    expect(fwBadge1?.textContent).toContain(
      'src/components/UserProfileCard.tsx:18'
    );

    // Default autoMaskPII masks the email in text preview
    const textPreview1 = container.querySelector(
      '[data-testid="annotation-text-preview-1"]'
    );
    expect(textPreview1?.textContent).toBe('山田太郎 ([MASKED_EMAIL])');

    // Hovering card sends HIGHLIGHT_ELEMENT
    await act(async () => {
      card1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(tabSendMessageMock).toHaveBeenCalledWith(101, {
      type: 'HIGHLIGHT_ELEMENT',
      selector: '#card-1',
      id: 1,
    });

    // Clicking Scroll button sends SCROLL_TO_ELEMENT
    const scrollBtn1 = container.querySelector(
      '[data-testid="scroll-to-annotation-1"]'
    ) as HTMLButtonElement;
    await act(async () => {
      scrollBtn1.click();
    });
    expect(tabSendMessageMock).toHaveBeenCalledWith(101, {
      type: 'SCROLL_TO_ELEMENT',
      selector: '#card-1',
      id: 1,
    });

    // Clicking Mask toggle button masks full text as [MASKED]
    const maskBtn1 = container.querySelector(
      '[data-testid="toggle-annotation-mask-1"]'
    ) as HTMLButtonElement;
    await act(async () => {
      maskBtn1.click();
    });
    expect(textPreview1?.textContent).toBe('[MASKED]');

    // Edit instruction for #1
    const instructionInput1 = container.querySelector(
      '[data-testid="annotation-instruction-1"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(instructionInput1, 'フォントサイズを14pxに変更');
    });
    const stateAfterEdit = await getPageState(activeTabUrl);
    expect(stateAfterEdit.annotations[0]?.instruction).toBe(
      'フォントサイズを14pxに変更'
    );

    // Delete annotation #1 -> annotation #2 becomes #1
    const deleteBtn1 = container.querySelector(
      '[data-testid="delete-annotation-1"]'
    ) as HTMLButtonElement;
    await act(async () => {
      deleteBtn1.click();
    });

    const stateAfterDelete = await getPageState(activeTabUrl);
    expect(stateAfterDelete.annotations).toHaveLength(1);
    expect(stateAfterDelete.annotations[0]?.id).toBe(1);
    expect(stateAfterDelete.annotations[0]?.element.selector).toBe('#card-2');
  });

  it('supports Playwright-style maskSelectors management and immediately masks matching elements in preview and export', async () => {
    await savePageState(activeTabUrl, {
      annotations: [createMockAnnotation(1)],
    });

    await renderSidePanel();

    const textPreview1 = container.querySelector(
      '[data-testid="annotation-text-preview-1"]'
    );
    expect(textPreview1?.textContent).toBe('山田太郎 ([MASKED_EMAIL])');

    // Add `.user-profile-card` to Playwright maskSelectors
    const selectorInput = container.querySelector(
      '[data-testid="add-mask-selector-input"]'
    ) as HTMLInputElement;
    const addBtn = container.querySelector(
      '[data-testid="add-mask-selector-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(selectorInput, '.user-profile-card');
    });
    await act(async () => {
      addBtn.click();
    });

    // Now the chip is rendered and #1 text preview is completely [MASKED]
    const chip = container.querySelector(
      '[data-testid="mask-selector-chip-.user-profile-card"]'
    );
    expect(chip).not.toBeNull();
    expect(textPreview1?.textContent).toBe('[MASKED]');

    // Remove `.user-profile-card` chip -> goes back to PII-only masking
    const removeChipBtn = container.querySelector(
      '[data-testid="remove-mask-selector-.user-profile-card"]'
    ) as HTMLButtonElement;
    await act(async () => {
      removeChipBtn.click();
    });

    expect(textPreview1?.textContent).toBe('山田太郎 ([MASKED_EMAIL])');
  });

  it('previews and copies formatted Markdown prompt and pure JSON to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    await savePageState(activeTabUrl, {
      globalInstruction: 'Tailwind CSSを使用してください',
      annotations: [createMockAnnotation(1)],
    });

    await renderSidePanel();

    // Open preview in default Markdown mode
    const previewToggleBtn = container.querySelector(
      '[data-testid="toggle-export-preview"]'
    ) as HTMLButtonElement;
    await act(async () => {
      previewToggleBtn.click();
    });

    const previewContent = container.querySelector(
      '[data-testid="export-preview-content"]'
    );
    expect(previewContent?.textContent).toContain(
      '# フロントエンド修正指示 (DOM Prompt Annotator)'
    );
    expect(previewContent?.textContent).toContain(
      'Tailwind CSSを使用してください'
    );

    // Switch to pure JSON format
    const jsonFormatBtn = container.querySelector(
      '[data-testid="format-select-json"]'
    ) as HTMLButtonElement;
    await act(async () => {
      jsonFormatBtn.click();
    });

    const jsonText = previewContent?.textContent || '';
    const parsed = JSON.parse(jsonText);
    expect(parsed.pageContext.url).toBe(activeTabUrl);
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].element.textContent).toBe(
      '山田太郎 ([MASKED_EMAIL])'
    );

    // Copy to clipboard
    const copyBtn = container.querySelector(
      '[data-testid="copy-export-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      copyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(copyBtn.textContent).toContain('コピーしました！');
  });
});
