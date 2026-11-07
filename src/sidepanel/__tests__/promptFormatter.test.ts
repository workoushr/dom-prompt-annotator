import { describe, it, expect } from 'vitest';
import {
  buildExportPayload,
  formatAsJson,
  formatAsMarkdownPrompt,
} from '../promptFormatter';
import {
  AnnotationItem,
  DEFAULT_MASKING_CONFIG,
  PageAnnotationState,
} from '../../types/annotation';

function createSampleAnnotation(
  overrides: Partial<AnnotationItem> = {}
): AnnotationItem {
  return {
    id: 1,
    instruction: 'ボタンの背景色を青色 (#2563EB) に変更し、パディングを広げてください。',
    maskText: false,
    createdAt: '2026-11-07T00:00:00.000Z',
    element: {
      tagName: 'button',
      id: 'submit-btn',
      className: 'btn primary-cta',
      selector: '#submit-btn',
      xpath: '//*[@id="submit-btn"]',
      attributes: {
        id: 'submit-btn',
        class: 'btn primary-cta',
        'aria-label': 'Contact alice@example.com now',
      },
      textContent: 'Send email to alice@example.com or call 090-1234-5678',
      outerHTMLSnippet:
        '<button id="submit-btn" class="btn primary-cta" aria-label="Contact alice@example.com now">Send email to alice@example.com or call 090-1234-5678</button>',
      rect: { x: 120, y: 340, width: 180, height: 44 },
      computedStyles: {
        display: 'inline-flex',
        backgroundColor: 'rgb(15, 23, 42)',
        color: 'rgb(255, 255, 255)',
      },
      framework: {
        detected: 'react',
        componentName: 'CheckoutSubmitButton',
        componentHierarchy: ['App', 'CheckoutPage', 'CheckoutSubmitButton'],
        source: {
          fileName: 'src/components/CheckoutSubmitButton.tsx',
          lineNumber: 42,
        },
      },
    },
    ...overrides,
  };
}

function createSamplePageState(
  overrides: Partial<PageAnnotationState> = {}
): PageAnnotationState {
  return {
    urlKey: 'https://example.com/checkout',
    inspectMode: true,
    globalInstruction:
      'ページ全体のカラースキームをダークモード対応にし、admin@example.com 宛の連絡先は非表示にしてください。',
    maskingConfig: {
      ...DEFAULT_MASKING_CONFIG,
      maskSelectors: ['input[type="password"]', '[data-mask="true"]'],
    },
    annotations: [createSampleAnnotation()],
    ...overrides,
  };
}

describe('Prompt & JSON Formatter (src/sidepanel/promptFormatter.ts)', () => {
  it('builds ExportPayload and strictly applies PII masking to annotations, page title, and globalInstruction when autoMaskPII is enabled', () => {
    const state = createSamplePageState();
    const payload = buildExportPayload(state, {
      url: 'https://example.com/checkout?step=2',
      title: 'Checkout for bob@example.com - Order Summary',
      viewport: { width: 1440, height: 900 },
    });

    expect(payload.pageContext.url).toBe('https://example.com/checkout?step=2');
    expect(payload.pageContext.title).toBe(
      'Checkout for [MASKED_EMAIL] - Order Summary'
    );
    expect(payload.pageContext.globalInstruction).toContain('[MASKED_EMAIL]');
    expect(payload.pageContext.globalInstruction).not.toContain(
      'admin@example.com'
    );

    const ann = payload.annotations[0]!;
    expect(ann.element.textContent).toBe(
      'Send email to [MASKED_EMAIL] or call [MASKED_PHONE]'
    );
    expect(ann.element.attributes['aria-label']).toBe(
      'Contact [MASKED_EMAIL] now'
    );
    expect(ann.element.outerHTMLSnippet).toContain('[MASKED_EMAIL]');
    expect(ann.element.outerHTMLSnippet).toContain('[MASKED_PHONE]');
  });

  it('masks full textContent and HTML text nodes as [MASKED] in both Markdown summary and JSON block when annotation.maskText, maskAllText, or Playwright maskSelectors match', () => {
    const state = createSamplePageState({
      maskingConfig: {
        ...DEFAULT_MASKING_CONFIG,
        maskSelectors: ['.secret-card'],
      },
      annotations: [
        createSampleAnnotation({
          id: 1,
          maskText: true,
          instruction: 'support@example.com の表示位置を右寄せに変更',
        }),
        createSampleAnnotation({
          id: 2,
          maskText: false,
          element: {
            ...createSampleAnnotation().element,
            tagName: 'div',
            id: 'user-card',
            className: 'secret-card highlight',
            selector: '#user-card',
            textContent: 'Top Secret Customer Name',
            outerHTMLSnippet:
              '<div id="user-card" class="secret-card highlight">Top Secret Customer Name</div>',
          },
        }),
      ],
    });

    const payload = buildExportPayload(state);
    expect(payload.annotations[0]!.element.textContent).toBe('[MASKED]');
    expect(payload.annotations[0]!.instruction).toBe(
      '[MASKED_EMAIL] の表示位置を右寄せに変更'
    );
    expect(payload.annotations[1]!.element.textContent).toBe('[MASKED]');
    expect(payload.annotations[1]!.element.outerHTMLSnippet).toBe(
      '<div id="user-card" class="secret-card highlight">[MASKED]</div>'
    );

    const markdown = formatAsMarkdownPrompt(payload);
    expect(markdown).toContain('- **Text**: `[MASKED]`');
    expect(markdown).toContain(
      '- **修正指示**: [MASKED_EMAIL] の表示位置を右寄せに変更'
    );
    expect(markdown).not.toContain('Top Secret Customer Name');
    expect(markdown).not.toContain('support@example.com');
  });

  it('formats payload as valid, indented JSON with masking enforced via formatAsJson', () => {
    const state = createSamplePageState();
    const payload = buildExportPayload(state, {
      url: 'https://example.com/checkout',
      title: 'Checkout Page',
      viewport: { width: 1280, height: 800 },
    });

    const jsonString = formatAsJson(payload);
    const parsed = JSON.parse(jsonString);

    expect(parsed.pageContext.url).toBe('https://example.com/checkout');
    expect(parsed.pageContext.viewport).toEqual({ width: 1280, height: 800 });
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].element.textContent).toBe(
      'Send email to [MASKED_EMAIL] or call [MASKED_PHONE]'
    );
  });

  it('formats payload as a structured Markdown prompt + JSON block via formatAsMarkdownPrompt', () => {
    const state = createSamplePageState();
    const payload = buildExportPayload(state, {
      url: 'https://example.com/checkout',
      title: 'Checkout Page',
      viewport: { width: 1280, height: 800 },
    });

    const markdown = formatAsMarkdownPrompt(payload);

    expect(markdown).toContain(
      '# フロントエンド修正指示 (DOM Prompt Annotator)'
    );
    expect(markdown).toContain('- **URL**: https://example.com/checkout');
    expect(markdown).toContain('- **Title**: Checkout Page');
    expect(markdown).toContain('- **Viewport**: 1280x800');
    expect(markdown).toContain('## ページ全体の前提・共通指示');
    expect(markdown).toContain(
      '### #1: <button#submit-btn.btn.primary-cta>'
    );
    expect(markdown).toContain('- **CSS Selector**: `#submit-btn`');
    expect(markdown).toContain(
      '- **Component**: `CheckoutSubmitButton (src/components/CheckoutSubmitButton.tsx:42)`'
    );
    expect(markdown).toContain(
      '- **修正指示**: ボタンの背景色を青色 (#2563EB) に変更し、パディングを広げてください。'
    );
    expect(markdown).toContain('## 詳細DOMコンテキスト (JSON)');
    expect(markdown).toContain('```json');
    expect(markdown).not.toContain('alice@example.com');
    expect(markdown).toContain('[MASKED_EMAIL]');
  });
});
