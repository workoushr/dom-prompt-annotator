import {
  AnnotationItem,
  DEFAULT_MASKING_CONFIG,
  ElementMetadata,
  ExportPayload,
  PageAnnotationState,
  RecordingSession,
  UserActionLogEntry,
} from '../types/annotation';
import { applyMaskingToExportPayload, maskPII } from './masker';

export interface LivePageContextInput {
  url?: string;
  title?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export function formatElementSummaryTag(
  element: Pick<ElementMetadata, 'tagName' | 'id' | 'className'>
): string {
  const tag = (element.tagName || 'div').toLowerCase();
  const idPart = element.id && element.id.trim() ? `#${element.id.trim()}` : '';
  const classes = (element.className || '')
    .trim()
    .split(/\s+/)
    .filter((c) => Boolean(c) && !c.startsWith('dpa-'))
    .slice(0, 2);
  const classPart = classes.length > 0 ? `.${classes.join('.')}` : '';
  return `<${tag}${idPart}${classPart}>`;
}

export function formatFrameworkSource(element: ElementMetadata): string | null {
  const fw = element.framework;
  if (!fw || (!fw.detected && !fw.componentName && !fw.source)) {
    return null;
  }

  const label = fw.componentName || (fw.detected ? fw.detected.toUpperCase() : 'Component');
  if (fw.source?.fileName) {
    const linePart =
      typeof fw.source.lineNumber === 'number' ? `:${fw.source.lineNumber}` : '';
    const colPart =
      typeof fw.source.columnNumber === 'number' ? `:${fw.source.columnNumber}` : '';
    return `${label} (${fw.source.fileName}${linePart}${colPart})`;
  }

  return label;
}

function sanitizeExportPayloadWithMasking(payload: ExportPayload): ExportPayload {
  const masked = applyMaskingToExportPayload(payload);
  const config = masked.pageContext.maskingConfig ?? DEFAULT_MASKING_CONFIG;

  const title = config.autoMaskPII
    ? maskPII(masked.pageContext.title || '')
    : masked.pageContext.title || '';

  const globalInstruction = config.autoMaskPII
    ? maskPII(masked.pageContext.globalInstruction || '')
    : masked.pageContext.globalInstruction || '';

  const annotations = masked.annotations.map((ann) => ({
    ...ann,
    instruction: config.autoMaskPII
      ? maskPII(ann.instruction || '')
      : ann.instruction || '',
  }));

  return {
    ...masked,
    pageContext: {
      ...masked.pageContext,
      title,
      globalInstruction,
    },
    annotations,
  };
}

/**
 * Constructs an `ExportPayload` from `PageAnnotationState` and optional live tab context,
 * strictly applying all masking rules (`maskText`, `maskSelectors`, `maskAllText`, `autoMaskPII`).
 */
export function buildExportPayload(
  state: PageAnnotationState,
  liveContext?: LivePageContextInput
): ExportPayload {
  const fallbackUrl =
    state.urlKey && state.urlKey !== 'unknown://empty'
      ? state.urlKey
      : typeof window !== 'undefined'
        ? window.location.href
        : '';

  const rawUrl = liveContext?.url || fallbackUrl;
  const rawTitle =
    liveContext?.title ?? (typeof document !== 'undefined' ? document.title : '');
  const viewport = liveContext?.viewport ?? {
    width:
      typeof window !== 'undefined' && window.innerWidth > 0
        ? window.innerWidth
        : 1280,
    height:
      typeof window !== 'undefined' && window.innerHeight > 0
        ? window.innerHeight
        : 720,
  };

  const config = state.maskingConfig ?? DEFAULT_MASKING_CONFIG;

  const rawPayload: ExportPayload = {
    pageContext: {
      url: rawUrl,
      title: rawTitle,
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
      timestamp: new Date().toISOString(),
      globalInstruction: state.globalInstruction || '',
      maskingConfig: {
        ...config,
        maskSelectors: [...(config.maskSelectors || [])],
      },
    },
    annotations: state.annotations || [],
  };

  return sanitizeExportPayloadWithMasking(rawPayload);
}

/**
 * Formats an `ExportPayload` as pretty-printed JSON with masking strictly applied.
 */
export function formatAsJson(payload: ExportPayload): string {
  const maskedPayload = sanitizeExportPayloadWithMasking(payload);
  return JSON.stringify(maskedPayload, null, 2);
}

/**
 * Generates a structured Markdown prompt + JSON payload suitable for LLM coding assistants.
 */
export function formatAsMarkdownPrompt(payload: ExportPayload): string {
  const masked = sanitizeExportPayloadWithMasking(payload);
  const { pageContext, annotations } = masked;

  const lines: string[] = [];

  lines.push('# フロントエンド修正指示 (DOM Prompt Annotator)');
  lines.push('');
  lines.push(
    '以下の対象ページおよび指定DOM要素に対して、記載されたフロントエンド修正を適用してください。'
  );
  lines.push('');
  lines.push('## 対象ページ情報');
  lines.push(`- **URL**: ${pageContext.url || '(不明)'}`);
  lines.push(`- **Title**: ${pageContext.title || '(タイトルなし)'}`);
  lines.push(
    `- **Viewport**: ${pageContext.viewport.width}x${pageContext.viewport.height}`
  );
  lines.push('');

  if (pageContext.globalInstruction && pageContext.globalInstruction.trim()) {
    lines.push('## ページ全体の前提・共通指示');
    lines.push(pageContext.globalInstruction.trim());
    lines.push('');
  }

  lines.push('## 要素別の修正指示');
  if (annotations.length === 0) {
    lines.push('- (指定された要素はありません)');
    lines.push('');
  } else {
    for (const ann of annotations) {
      const tagSummary = formatElementSummaryTag(ann.element);
      const fwSummary = formatFrameworkSource(ann.element);
      lines.push(`### #${ann.id}: ${tagSummary}`);
      lines.push(`- **CSS Selector**: \`${ann.element.selector}\``);
      if (fwSummary) {
        lines.push(`- **Component**: \`${fwSummary}\``);
      }
      if (ann.element.textContent) {
        lines.push(`- **Text**: \`${ann.element.textContent}\``);
      }
      lines.push(
        `- **修正指示**: ${ann.instruction && ann.instruction.trim() ? ann.instruction.trim() : '(指示未入力)'}`
      );
      lines.push('');
    }
  }

  lines.push('## 詳細DOMコンテキスト (JSON)');
  lines.push('```json');
  lines.push(JSON.stringify(masked, null, 2));
  lines.push('```');

  return lines.join('\n');
}

export function formatTimestampOffset(offsetMs: number): string {
  const safeMs = Math.max(0, Math.round(offsetMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = safeMs % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

export interface FormatStudioPromptOptions {
  maskAllText?: boolean;
}

export function sanitizeRecordingSessionForExport(
  session: RecordingSession,
  options?: FormatStudioPromptOptions
): RecordingSession {
  const isMaskAll = options?.maskAllText ?? session.maskingConfig?.maskAllText ?? false;
  const autoPII = session.maskingConfig?.autoMaskPII ?? true;

  const sanitizeText = (text?: string): string => {
    if (!text) return '';
    if (isMaskAll) return '[MASKED]';
    return autoPII ? maskPII(text) : text;
  };

  const sanitizeActionLogs = (logs: typeof session.actionLogs) =>
    (logs || []).map((log) => {
      let summary = log.summary;
      let targetLabel = log.targetLabel;
      let inputValue = log.inputValue;
      let elementSnapshot = log.elementSnapshot;

      if (isMaskAll) {
        targetLabel = targetLabel ? '[MASKED]' : undefined;
        inputValue = inputValue ? '[MASKED]' : undefined;
        summary = summary.replace(/"([^"]*)"/g, '"[MASKED]"');
        if (elementSnapshot?.textContent) {
          elementSnapshot = { ...elementSnapshot, textContent: '[MASKED]' };
        }
      } else if (autoPII) {
        targetLabel = targetLabel ? maskPII(targetLabel) : undefined;
        inputValue = inputValue ? maskPII(inputValue) : undefined;
        summary = maskPII(summary);
        if (elementSnapshot?.textContent) {
          elementSnapshot = {
            ...elementSnapshot,
            textContent: maskPII(elementSnapshot.textContent),
          };
        }
      }

      return {
        ...log,
        targetLabel,
        inputValue,
        summary,
        elementSnapshot,
      };
    });

  const sanitizedAnnotations: AnnotationItem[] = (session.annotations || []).map((ann) => {
    const shouldMaskText = isMaskAll || ann.maskText;
    const textContent = shouldMaskText
      ? (ann.element.textContent ? '[MASKED]' : '')
      : (autoPII ? maskPII(ann.element.textContent || '') : ann.element.textContent || '');

    const outerHTMLSnippet = shouldMaskText
      ? (ann.element.outerHTMLSnippet ? '[MASKED]' : '')
      : (autoPII ? maskPII(ann.element.outerHTMLSnippet || '') : ann.element.outerHTMLSnippet || '');

    const sanitizedAttrs: Record<string, string> = {};
    if (ann.element.attributes) {
      for (const [key, val] of Object.entries(ann.element.attributes)) {
        if (isMaskAll) {
          sanitizedAttrs[key] = '[MASKED]';
        } else if (autoPII) {
          sanitizedAttrs[key] = maskPII(val);
        } else {
          sanitizedAttrs[key] = val;
        }
      }
    }

    const triggerContext = ann.triggerContext
      ? sanitizeActionLogs(ann.triggerContext)
      : undefined;

    return {
      ...ann,
      maskText: shouldMaskText,
      instruction: autoPII ? maskPII(ann.instruction || '') : ann.instruction || '',
      element: {
        ...ann.element,
        textContent,
        outerHTMLSnippet,
        attributes: sanitizedAttrs,
      },
      triggerContext,
    };
  });

  return {
    ...session,
    title: sanitizeText(session.title),
    globalInstruction: autoPII
      ? maskPII(session.globalInstruction || '')
      : session.globalInstruction || '',
    maskingConfig: {
      ...session.maskingConfig,
      maskAllText: isMaskAll,
    },
    actionLogs: sanitizeActionLogs(session.actionLogs),
    annotations: sanitizedAnnotations,
  };
}

/**
 * Formats a `RecordingSession` as pretty-printed JSON with studio masking applied.
 */
export function formatStudioPromptJson(
  session: RecordingSession,
  options?: FormatStudioPromptOptions
): string {
  const sanitized = sanitizeRecordingSessionForExport(session, options);
  return JSON.stringify(sanitized, null, 2);
}

/**
 * Generates a structured Markdown prompt from a `RecordingSession` with action logs and masking applied.
 */
export function formatStudioPromptMarkdown(
  session: RecordingSession,
  options?: FormatStudioPromptOptions
): string {
  const sanitized = sanitizeRecordingSessionForExport(session, options);
  const isMaskAll = sanitized.maskingConfig.maskAllText;

  const lines: string[] = [];

  lines.push('# 動的UIタイムラインリプレイ修正指示 (DOM Prompt Annotator Studio)');
  lines.push('');
  lines.push(
    '以下の録画セッションおよび指定タイムスタンプのDOM要素に対して、直前のアクションログ（出現トリガー）を参照しつつフロントエンド修正を適用してください。'
  );
  lines.push('');
  lines.push('## セッション情報');
  lines.push(`- **URL**: ${sanitized.url || '(不明)'}`);
  lines.push(`- **Title**: ${sanitized.title || '(タイトルなし)'}`);
  lines.push(
    `- **録画時間**: ${(sanitized.durationMs / 1000).toFixed(1)}s (${sanitized.durationMs}ms)`
  );
  lines.push(
    `- **Viewport**: ${sanitized.viewport ? `${sanitized.viewport.width}x${sanitized.viewport.height}` : '(未設定)'}`
  );
  lines.push(
    `- **テキストマスキング (maskAllText)**: ${isMaskAll ? 'ON (全テキスト本文を[MASKED]隠蔽中)' : 'OFF'}`
  );
  lines.push('');

  if (sanitized.globalInstruction && sanitized.globalInstruction.trim()) {
    lines.push('## ページ全体の前提・共通指示');
    lines.push(sanitized.globalInstruction.trim());
    lines.push('');
  }

  lines.push('## タイムライン要素別の修正指示');
  if (sanitized.annotations.length === 0) {
    lines.push('- (指定された要素はありません)');
    lines.push('');
  } else {
    for (const ann of sanitized.annotations) {
      const tagSummary = formatElementSummaryTag(ann.element);
      const fwSummary = formatFrameworkSource(ann.element);
      const timeStr =
        typeof ann.timestampMs === 'number'
          ? ` (時刻: ${formatTimestampOffset(ann.timestampMs)})`
          : '';

      lines.push(`### #${ann.id}: ${tagSummary}${timeStr}`);
      lines.push(`- **CSS Selector**: \`${ann.element.selector}\``);
      if (ann.element.xpath) {
        lines.push(`- **XPath**: \`${ann.element.xpath}\``);
      }
      if (fwSummary) {
        lines.push(`- **Component**: \`${fwSummary}\``);
      }
      if (ann.element.textContent) {
        lines.push(`- **Text Content**: \`${ann.element.textContent}\``);
      }

      // Action triggers context
      const triggers = ann.triggerContext || [];
      if (triggers.length > 0) {
        lines.push('- **直前の操作トリガー (Trigger Action Context)**:');
        for (const trig of triggers) {
          const trigTime = formatTimestampOffset(trig.offsetMs);
          const labelPart = trig.targetLabel ? ` ("${trig.targetLabel}")` : '';
          lines.push(
            `  - [${trigTime}] ${trig.kind}: \`${trig.targetSelector}\`${labelPart} — ${trig.summary}`
          );
        }
      }

      lines.push(
        `- **修正指示**: ${
          ann.instruction && ann.instruction.trim()
            ? ann.instruction.trim()
            : '(指示未入力)'
        }`
      );

      // Computed styles if present
      if (
        ann.element.computedStyles &&
        Object.keys(ann.element.computedStyles).length > 0
      ) {
        lines.push('- **Computed Styles**:');
        for (const [prop, val] of Object.entries(ann.element.computedStyles)) {
          lines.push(`  - \`${prop}\`: \`${val}\``);
        }
      }

      lines.push('');
    }
  }

  lines.push('## 詳細セッションデータ (JSON)');
  lines.push('```json');
  lines.push(JSON.stringify(sanitized, null, 2));
  lines.push('```');

  return lines.join('\n');
}
