import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnnotationDrawer } from '../AnnotationDrawer';
import {
  AnnotationItem,
  DEFAULT_MASKING_CONFIG,
} from '../../types/annotation';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('AnnotationDrawer Component (Figma UI3 Style)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  const sampleAnnotations: AnnotationItem[] = [
    {
      id: 1,
      instruction: 'CTAボタンの背景をグラデーションにする',
      maskText: false,
      createdAt: '2026-11-08T00:00:00.000Z',
      element: {
        tagName: 'button',
        id: 'cta-btn',
        className: 'btn primary',
        selector: '#cta-btn',
        xpath: '//*[@id="cta-btn"]',
        textContent: '今すぐ始める',
        outerHTMLSnippet: '<button id="cta-btn" class="btn primary">今すぐ始める</button>',
        attributes: { id: 'cta-btn' },
        rect: { x: 50, y: 100, width: 140, height: 40 },
        computedStyles: {},
        framework: {
          detected: 'react',
          componentName: 'HeroCTA',
          componentHierarchy: ['App', 'HeroCTA'],
          source: { fileName: 'src/HeroCTA.tsx', lineNumber: 24 },
        },
      },
    },
    {
      id: 2,
      instruction: '機密顧客IDを伏字化',
      maskText: true,
      createdAt: '2026-11-08T00:01:00.000Z',
      element: {
        tagName: 'span',
        id: 'cust-id',
        className: 'user-badge',
        selector: '#cust-id',
        xpath: '//*[@id="cust-id"]',
        textContent: 'CUST-999',
        outerHTMLSnippet: '<span id="cust-id">CUST-999</span>',
        attributes: { id: 'cust-id' },
        rect: { x: 200, y: 100, width: 80, height: 24 },
        computedStyles: {},
        framework: null,
      },
    },
  ];

  const renderComponent = async (props: Partial<Parameters<typeof AnnotationDrawer>[0]> = {}) => {
    const defaultProps: Parameters<typeof AnnotationDrawer>[0] = {
      isOpen: true,
      onClose: vi.fn(),
      annotations: sampleAnnotations,
      globalInstruction: '共通前提: Tailwind CSSを使用してください',
      maskingConfig: { ...DEFAULT_MASKING_CONFIG },
      onUpdateGlobalInstruction: vi.fn(),
      onUpdateMaskingConfig: vi.fn(),
      onDeleteAnnotation: vi.fn(),
      onClearAnnotations: vi.fn(),
      onScrollToElement: vi.fn(),
      onSelectAnnotation: vi.fn(),
      ...props,
    };

    root = createRoot(container);
    await act(async () => {
      root!.render(<AnnotationDrawer {...defaultProps} />);
    });

    return defaultProps;
  };

  it('renders null when isOpen is false', async () => {
    await renderComponent({ isOpen: false });
    expect(container.querySelector('[data-testid="dpa-drawer"]')).toBeNull();
  });

  it('renders 3 tabs and closes on close button click', async () => {
    const onClose = vi.fn();
    await renderComponent({ onClose });

    const drawer = container.querySelector('[data-testid="dpa-drawer"]');
    expect(drawer).not.toBeNull();

    expect(container.querySelector('[data-testid="dpa-drawer-tab-annotations"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dpa-drawer-tab-context"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dpa-drawer-tab-privacy"]')).not.toBeNull();

    const closeBtn = container.querySelector('[data-testid="dpa-drawer-close-btn"]') as HTMLButtonElement;
    await act(async () => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders annotations list, jumps to element, and deletes annotation', async () => {
    const onScrollToElement = vi.fn();
    const onDeleteAnnotation = vi.fn();
    const onClearAnnotations = vi.fn();

    await renderComponent({
      annotations: sampleAnnotations,
      onScrollToElement,
      onDeleteAnnotation,
      onClearAnnotations,
    });

    // Verify 2 cards rendered
    expect(container.querySelector('[data-testid="annotation-card-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="annotation-card-2"]')).not.toBeNull();

    // Verify React metadata badge on card 1
    const card1 = container.querySelector('[data-testid="annotation-card-1"]')!;
    expect(card1.textContent).toContain('HeroCTA');
    expect(card1.textContent).toContain('CTAボタンの背景をグラデーションにする');

    // Click Jump button
    const jumpBtn = container.querySelector('[data-testid="dpa-drawer-jump-1"]') as HTMLButtonElement;
    await act(async () => {
      jumpBtn.click();
    });
    expect(onScrollToElement).toHaveBeenCalledWith('#cta-btn', 1);

    // Click Delete button
    const deleteBtn = container.querySelector('[data-testid="dpa-drawer-delete-2"]') as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
    });
    expect(onDeleteAnnotation).toHaveBeenCalledWith(2);

    // Click Clear All button
    const clearAllBtn = container.querySelector('[data-testid="dpa-drawer-clear-all"]') as HTMLButtonElement;
    await act(async () => {
      clearAllBtn.click();
    });
    expect(onClearAnnotations).toHaveBeenCalledTimes(1);
  });

  function setElementValue(el: HTMLInputElement | HTMLTextAreaElement, val: string) {
    const proto =
      el instanceof HTMLInputElement
        ? window.HTMLInputElement.prototype
        : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('switches to context tab and edits global instruction', async () => {
    const onUpdateGlobalInstruction = vi.fn();
    await renderComponent({
      globalInstruction: '初期前提',
      onUpdateGlobalInstruction,
    });

    const contextTab = container.querySelector('[data-testid="dpa-drawer-tab-context"]') as HTMLButtonElement;
    await act(async () => {
      contextTab.click();
    });

    const textarea = container.querySelector('[data-testid="dpa-drawer-global-instruction"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('初期前提');

    await act(async () => {
      setElementValue(textarea, '更新された前提ルール');
    });
    expect(onUpdateGlobalInstruction).toHaveBeenCalledWith('更新された前提ルール');
  });

  it('switches to privacy tab and configures masking options and custom selectors', async () => {
    const onUpdateMaskingConfig = vi.fn();
    await renderComponent({
      maskingConfig: {
        autoMaskPII: true,
        maskAllText: false,
        visualMaskEnabled: true,
        maskSelectors: ['input[type="password"]'],
        maskColor: '#FF00FF',
      },
      onUpdateMaskingConfig,
    });

    const privacyTab = container.querySelector('[data-testid="dpa-drawer-tab-privacy"]') as HTMLButtonElement;
    await act(async () => {
      privacyTab.click();
    });

    // Toggle maskAllText
    const maskAllCheckbox = container.querySelector('[data-testid="dpa-drawer-toggle-mask-all"]') as HTMLInputElement;
    expect(maskAllCheckbox.checked).toBe(false);
    await act(async () => {
      maskAllCheckbox.click();
    });
    expect(onUpdateMaskingConfig).toHaveBeenCalledWith({ maskAllText: true });

    // Add new mask selector
    const selectorInput = container.querySelector('[data-testid="dpa-drawer-add-selector-input"]') as HTMLInputElement;
    const addBtn = container.querySelector('[data-testid="dpa-drawer-add-selector-btn"]') as HTMLButtonElement;

    await act(async () => {
      setElementValue(selectorInput, '.secret-box');
      addBtn.click();
    });
    expect(onUpdateMaskingConfig).toHaveBeenCalledWith({
      maskSelectors: ['input[type="password"]', '.secret-box'],
    });

    // Remove existing selector
    const removeBtn = container.querySelector('[data-testid="dpa-drawer-remove-selector-0"]') as HTMLButtonElement;
    await act(async () => {
      removeBtn.click();
    });
    expect(onUpdateMaskingConfig).toHaveBeenCalledWith({
      maskSelectors: [],
    });
  });
});
