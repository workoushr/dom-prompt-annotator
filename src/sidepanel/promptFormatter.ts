import {
  DEFAULT_MASKING_CONFIG,
  ElementMetadata,
  ExportPayload,
  PageAnnotationState,
} from '../types/annotation';
import { applyMaskingToExportPayload, maskPII } from '../utils/masker';

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
