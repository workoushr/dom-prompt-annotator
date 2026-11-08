import { describe, it, expect } from 'vitest';
import {
  formatStudioPromptMarkdown,
  formatStudioPromptJson,
  formatTimestampOffset,
} from '../promptFormatter';
import { RecordingSession } from '../../types/annotation';

const sampleSession: RecordingSession = {
  sessionId: 'session_abc123',
  url: 'https://example.com/checkout',
  title: 'Checkout Payment Confirmation',
  createdAt: '2026-11-08T02:00:00.000Z',
  durationMs: 14200,
  viewport: { width: 393, height: 852 },
  globalInstruction: 'React 18 + Tailwind CSS で実装してください。',
  maskingConfig: {
    autoMaskPII: true,
    maskAllText: false,
    maskSelectors: ['input[type="password"]'],
    maskColor: '#FF00FF',
    visualMaskEnabled: true,
  },
  rrwebEvents: [],
  actionLogs: [
    {
      id: 'act_1',
      offsetMs: 1200,
      kind: 'click',
      targetSelector: 'button#upgrade-cta',
      targetLabel: 'プロプランにアップグレード',
      summary: 'クリック: <button> "プロプランにアップグレード"',
    },
    {
      id: 'act_2',
      offsetMs: 3200,
      kind: 'mutation_add',
      targetSelector: 'div.toast-notification',
      targetLabel: '決済が完了しました',
      summary: 'DOM要素出現: <div> "決済が完了しました"',
    },
  ],
  annotations: [
    {
      id: 1,
      timestampMs: 3200,
      instruction: 'トーストの表示時間を5秒に延長し、閉じるボタンを配置',
      maskText: false,
      createdAt: '2026-11-08T02:00:03.200Z',
      element: {
        tagName: 'div',
        id: 'toast-root',
        className: 'toast-notification bg-slate-900',
        selector: 'div.toast-notification',
        xpath: '//div[@id="toast-root"]',
        attributes: { id: 'toast-root', role: 'alert' },
        textContent: '決済が完了しました。お客様のカード下4桁は1234です。',
        outerHTMLSnippet: '<div class="toast-notification">決済が完了しました</div>',
        rect: { x: 20, y: 100, width: 350, height: 60 },
        computedStyles: {
          'background-color': 'rgb(15, 23, 42)',
          color: 'rgb(255, 255, 255)',
        },
        framework: {
          detected: 'react',
          componentName: 'ToastProvider',
          componentHierarchy: ['AppRoot', 'ToastProvider'],
          source: { fileName: 'ToastProvider.tsx', lineNumber: 42 },
        },
      },
      triggerContext: [
        {
          id: 'act_1',
          offsetMs: 1200,
          kind: 'click',
          targetSelector: 'button#upgrade-cta',
          targetLabel: 'プロプランにアップグレード',
          summary: 'クリック: <button> "プロプランにアップグレード"',
        },
      ],
    },
  ],
};

describe('Studio Prompt Formatter (src/utils/promptFormatter.ts)', () => {
  it('formats timestamp offset into MM:SS.mmm accurately', () => {
    expect(formatTimestampOffset(0)).toBe('00:00.000');
    expect(formatTimestampOffset(1200)).toBe('00:01.200');
    expect(formatTimestampOffset(3200)).toBe('00:03.200');
    expect(formatTimestampOffset(65432)).toBe('01:05.432');
  });

  it('generates structured Markdown with session info and trigger context when maskAllText is OFF', () => {
    const markdown = formatStudioPromptMarkdown(sampleSession, { maskAllText: false });

    // Header info
    expect(markdown).toContain('# 動的UIタイムラインリプレイ修正指示 (DOM Prompt Annotator Studio)');
    expect(markdown).toContain('https://example.com/checkout');
    expect(markdown).toContain('Checkout Payment Confirmation');
    expect(markdown).toContain('14.2s (14200ms)');
    expect(markdown).toContain('393x852');
    expect(markdown).toContain('- **テキストマスキング (maskAllText)**: OFF');

    // Global instruction
    expect(markdown).toContain('React 18 + Tailwind CSS で実装してください。');

    // Annotation with trigger context
    expect(markdown).toContain('div.toast-notification');
    expect(markdown).toContain('- **CSS Selector**: `div.toast-notification`');
    expect(markdown).toContain('- **Component**: `ToastProvider (ToastProvider.tsx:42)`');
    expect(markdown).toContain('- **直前の操作トリガー (Trigger Action Context)**:');
    expect(markdown).toContain('[00:01.200] click: `button#upgrade-cta` ("プロプランにアップグレード")');
    expect(markdown).toContain('- **修正指示**: トーストの表示時間を5秒に延長し、閉じるボタンを配置');
    expect(markdown).toContain('`background-color`: `rgb(15, 23, 42)`');
  });

  it('strictly hides all text content with [MASKED] when maskAllText is ON while preserving DOM structure & selectors', () => {
    const markdown = formatStudioPromptMarkdown(sampleSession, { maskAllText: true });

    // maskAllText banner
    expect(markdown).toContain('- **テキストマスキング (maskAllText)**: ON (全テキスト本文を[MASKED]隠蔽中)');

    // Text content must be completely masked
    expect(markdown).toContain('- **Text Content**: `[MASKED]`');
    expect(markdown).not.toContain('決済が完了しました。お客様のカード下4桁は1234です。');

    // Action log targetLabel must be masked
    expect(markdown).not.toContain('"プロプランにアップグレード"');
    expect(markdown).toContain('[00:01.200] click: `button#upgrade-cta` ("[MASKED]")');

    // Structural info MUST be preserved
    expect(markdown).toContain('- **CSS Selector**: `div.toast-notification`');
    expect(markdown).toContain('- **XPath**: `//div[@id="toast-root"]`');
    expect(markdown).toContain('- **Component**: `ToastProvider (ToastProvider.tsx:42)`');
    expect(markdown).toContain('`background-color`: `rgb(15, 23, 42)`');
    expect(markdown).toContain('- **修正指示**: トーストの表示時間を5秒に延長し、閉じるボタンを配置');
  });

  it('formats studio session as valid JSON with maskAllText applied', () => {
    const jsonStr = formatStudioPromptJson(sampleSession, { maskAllText: true });
    const parsed = JSON.parse(jsonStr);

    expect(parsed.sessionId).toBe('session_abc123');
    expect(parsed.maskingConfig.maskAllText).toBe(true);
    expect(parsed.title).toBe('[MASKED]');
    expect(parsed.annotations[0].element.textContent).toBe('[MASKED]');
    expect(parsed.annotations[0].element.selector).toBe('div.toast-notification');
    expect(parsed.actionLogs[0].summary).toContain('[MASKED]');
  });
});
