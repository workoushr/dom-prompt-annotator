import {
  AnnotationItem,
  DEFAULT_MASKING_CONFIG,
  ElementMetadata,
  ExportPayload,
  MaskingConfig,
} from '../types/annotation';

export const SHADOW_HOST_ID = 'dpa-root-host';

const SENSITIVE_HTML_ATTRIBUTES = [
  'value',
  'placeholder',
  'title',
  'alt',
  'aria-label',
] as const;

const STRUCTURAL_ATTRIBUTES = new Set([
  'id',
  'class',
  'type',
  'name',
  'role',
  'for',
  'href',
  'src',
  'data-testid',
  'data-test',
  'data-cy',
]);

// Regex patterns for PII detection
const BEARER_TOKEN_REGEX = /\bBearer\s+[A-Za-z0-9\-._~+/]{8,}=*/gi;
const JWT_TOKEN_REGEX =
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const API_KEY_REGEX =
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{10,}|pk_(?:live|test)_[A-Za-z0-9]{10,}|rk_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{15,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/g;
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CREDIT_CARD_CANDIDATE_REGEX =
  /(?<![\w:+.-])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{5})(?![\w:+.-])/g;
const JP_PHONE_REGEX = /(?<![\w:+.-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\w:+.-])/g;
const INTL_PHONE_REGEX =
  /(?<![\w:+.-])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?(?![\w:+.-])/g;
const US_PHONE_REGEX =
  /(?<![\w:+.-])(?:\(\d{3}\)\s*\d{3}[-.\s]\d{4}|\d{3}([-.\s])\d{3}\1\d{4})(?![\w:+.-])/g;

/**
 * Masks common PII patterns in a text string:
 * - Bearer tokens / JWTs / API keys -> `[MASKED_TOKEN]`
 * - Email addresses -> `[MASKED_EMAIL]`
 * - Credit card numbers (13-19 digits) -> `[MASKED_CARD]`
 * - Phone numbers (JP, US, International) -> `[MASKED_PHONE]`
 */
export function maskPII(text: string): string {
  if (!text) {
    return '';
  }

  let result = text;

  // 1. Mask tokens first so base64/digit sequences inside tokens aren't matched as phones/cards
  result = result.replace(BEARER_TOKEN_REGEX, '[MASKED_TOKEN]');
  result = result.replace(JWT_TOKEN_REGEX, '[MASKED_TOKEN]');
  result = result.replace(API_KEY_REGEX, '[MASKED_TOKEN]');

  // 2. Mask emails
  result = result.replace(EMAIL_REGEX, '[MASKED_EMAIL]');

  // 3. Mask credit cards (13 to 19 digits with optional spaces or dashes)
  result = result.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length >= 13 && digitsOnly.length <= 19) {
      return '[MASKED_CARD]';
    }
    return match;
  });

  // 4. Mask phone numbers
  result = result.replace(INTL_PHONE_REGEX, '[MASKED_PHONE]');
  result = result.replace(JP_PHONE_REGEX, (match) => {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length === 10 || digitsOnly.length === 11) {
      return '[MASKED_PHONE]';
    }
    return match;
  });
  result = result.replace(US_PHONE_REGEX, '[MASKED_PHONE]');

  return result;
}

/**
 * Masks a plain text string according to `maskAll` and `autoMaskPII` options.
 */
export function maskTextString(
  text: string,
  options: { maskAll?: boolean; autoMaskPII?: boolean }
): string {
  if (!text) {
    return '';
  }

  if (options.maskAll) {
    if (text.trim().length === 0) {
      return text;
    }
    return '[MASKED]';
  }

  if (options.autoMaskPII) {
    return maskPII(text);
  }

  return text;
}

/**
 * Checks if `el` or any of its ancestors matches any CSS selector in `selectors`.
 * Invalid or incomplete user-entered CSS selectors are safely ignored.
 */
export function isElementMatchedByMaskSelectors(
  el: Element | null,
  selectors: string[]
): boolean {
  if (!el || !Array.isArray(selectors) || selectors.length === 0) {
    return false;
  }

  for (const rawSelector of selectors) {
    const selector = rawSelector?.trim();
    if (!selector) {
      continue;
    }
    try {
      if (el.matches(selector) || el.closest(selector) !== null) {
        return true;
      }
    } catch {
      // Ignore invalid or incomplete CSS selectors during user typing
    }
  }

  return false;
}

/**
 * Queries all HTMLElements on the page matching any valid selector in `selectors`,
 * deduplicated and excluding the extension's own Shadow Host (`#dpa-root-host`).
 */
export function findMaskedElementsOnPage(
  root: Document | ParentNode,
  selectors: string[]
): HTMLElement[] {
  if (!root || !Array.isArray(selectors) || selectors.length === 0) {
    return [];
  }

  const matched = new Set<HTMLElement>();

  for (const rawSelector of selectors) {
    const selector = rawSelector?.trim();
    if (!selector) {
      continue;
    }
    try {
      const nodes = root.querySelectorAll(selector);
      nodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (
            node.id === SHADOW_HOST_ID ||
            node.closest(`#${SHADOW_HOST_ID}`) !== null
          ) {
            return;
          }
          matched.add(node);
        }
      });
    } catch {
      // Ignore invalid selector
    }
  }

  return Array.from(matched);
}

function isPasswordInputElement(el: Element): boolean {
  return (
    el.tagName.toLowerCase() === 'input' &&
    (el.getAttribute('type') || '').toLowerCase() === 'password'
  );
}

/**
 * Masks an HTML snippet while preserving all HTML tag names, `id`, `class`, `data-*`,
 * and structural hierarchy intact.
 */
export function maskHtmlSnippet(
  html: string,
  forceMaskAll: boolean,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): string {
  if (!html) {
    return '';
  }

  if (typeof document === 'undefined') {
    return maskTextString(html, {
      maskAll: forceMaskAll || config.maskAllText,
      autoMaskPII: config.autoMaskPII,
    });
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const elements = template.content.querySelectorAll('*');
  elements.forEach((el) => {
    const isMatched =
      isPasswordInputElement(el) ||
      isElementMatchedByMaskSelectors(el, config.maskSelectors);
    const shouldMaskElAll = forceMaskAll || config.maskAllText || isMatched;

    if (el.attributes) {
      const attrNames: string[] = [];
      for (let i = 0; i < el.attributes.length; i++) {
        const name = el.attributes[i]?.name;
        if (name) {
          attrNames.push(name);
        }
      }

      for (const attrName of attrNames) {
        const lowerAttr = attrName.toLowerCase();
        const val = el.getAttribute(attrName) || '';
        const isSensitiveAttr = (
          SENSITIVE_HTML_ATTRIBUTES as readonly string[]
        ).includes(lowerAttr);

        if (shouldMaskElAll && isSensitiveAttr) {
          if (val.trim().length > 0 || isPasswordInputElement(el)) {
            el.setAttribute(attrName, '[MASKED]');
          }
        } else if (
          config.autoMaskPII &&
          val &&
          !STRUCTURAL_ATTRIBUTES.has(lowerAttr)
        ) {
          el.setAttribute(attrName, maskPII(val));
        }
      }
    }
  });

  // Walk all text nodes inside template.content
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT
  );

  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const rawText = textNode.nodeValue || '';
    if (rawText.trim().length === 0) {
      continue;
    }

    const parentEl = textNode.parentElement;
    const isParentMatched = parentEl
      ? isPasswordInputElement(parentEl) ||
        isElementMatchedByMaskSelectors(parentEl, config.maskSelectors)
      : false;
    const shouldMaskNodeAll =
      forceMaskAll || config.maskAllText || isParentMatched;

    if (shouldMaskNodeAll) {
      textNode.nodeValue = '[MASKED]';
    } else if (config.autoMaskPII) {
      textNode.nodeValue = maskPII(rawText);
    }
  }

  return template.innerHTML;
}

function doesElementMetadataMatchSelectors(
  element: ElementMetadata,
  selectors: string[]
): boolean {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return false;
  }

  const normalizedSelectors = selectors
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  if (normalizedSelectors.length === 0) {
    return false;
  }

  if (normalizedSelectors.includes(element.selector)) {
    return true;
  }

  if (typeof document !== 'undefined') {
    // First try matching against the parsed outerHTMLSnippet
    if (element.outerHTMLSnippet) {
      const tpl = document.createElement('template');
      tpl.innerHTML = element.outerHTMLSnippet;
      const rootEl = tpl.content.firstElementChild;
      if (
        rootEl &&
        isElementMatchedByMaskSelectors(rootEl, normalizedSelectors)
      ) {
        return true;
      }
    }

    // Also construct a synthetic element from tagName + attributes + id + className
    try {
      const tag = (element.tagName || 'div').toLowerCase();
      const synth = document.createElement(tag);
      if (element.id) {
        synth.id = element.id;
      }
      if (element.className) {
        synth.setAttribute('class', element.className);
      }
      if (element.attributes) {
        for (const [k, v] of Object.entries(element.attributes)) {
          try {
            synth.setAttribute(k, v);
          } catch {
            // Ignore invalid attribute names
          }
        }
      }
      if (isElementMatchedByMaskSelectors(synth, normalizedSelectors)) {
        return true;
      }
    } catch {
      // Ignore synthetic element creation errors
    }
  }

  return false;
}

/**
 * Returns a deep-cloned `ElementMetadata` with `textContent`, `outerHTMLSnippet`,
 * and `attributes` masked according to `forceMaskText` and `config`.
 */
export function applyMaskingToElementMetadata(
  element: ElementMetadata,
  forceMaskText: boolean,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): ElementMetadata {
  const isPasswordInput =
    (element.tagName || '').toLowerCase() === 'input' &&
    (element.attributes?.type || '').toLowerCase() === 'password';

  const matchesSelector = doesElementMetadataMatchSelectors(
    element,
    config.maskSelectors
  );

  const shouldMaskAll = Boolean(
    forceMaskText || config.maskAllText || isPasswordInput || matchesSelector
  );

  const maskedAttributes: Record<string, string> = {};
  if (element.attributes) {
    for (const [key, value] of Object.entries(element.attributes)) {
      const lowerKey = key.toLowerCase();
      const isSensitiveAttr = (
        SENSITIVE_HTML_ATTRIBUTES as readonly string[]
      ).includes(lowerKey);

      if (shouldMaskAll && isSensitiveAttr) {
        maskedAttributes[key] =
          value.trim().length > 0 || isPasswordInput ? '[MASKED]' : value;
      } else if (config.autoMaskPII && !STRUCTURAL_ATTRIBUTES.has(lowerKey)) {
        maskedAttributes[key] = maskPII(value);
      } else {
        maskedAttributes[key] = value;
      }
    }
  }

  let rawTextForMasking = element.textContent || '';
  if (
    !shouldMaskAll &&
    rawTextForMasking &&
    typeof document !== 'undefined' &&
    Array.isArray(config.maskSelectors) &&
    config.maskSelectors.length > 0
  ) {
    const maskedChildTexts = new Set<string>();

    const collectMaskedDescendantTexts = (
      rootNode: ParentNode,
      isPossiblyTruncatedSnippet: boolean
    ) => {
      const matchedNodes = findMaskedElementsOnPage(
        rootNode,
        config.maskSelectors
      );
      for (const node of matchedNodes) {
        let cleaned = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (isPossiblyTruncatedSnippet && cleaned.endsWith('...')) {
          cleaned = cleaned.slice(0, -3).trim();
        }
        if (cleaned && cleaned !== '...') {
          maskedChildTexts.add(cleaned);
        }
        if (node instanceof HTMLInputElement && node.value?.trim()) {
          const val = node.value.trim();
          if (val !== '...') {
            maskedChildTexts.add(val);
          }
        }
      }
    };

    if (element.outerHTMLSnippet) {
      const tpl = document.createElement('template');
      tpl.innerHTML = element.outerHTMLSnippet;
      collectMaskedDescendantTexts(
        tpl.content,
        element.outerHTMLSnippet.includes('...')
      );
    }

    if (element.selector) {
      try {
        const liveRoot = document.querySelector(element.selector);
        if (liveRoot) {
          collectMaskedDescendantTexts(liveRoot, false);
        }
      } catch {
        // Ignore invalid selector
      }
    }

    // Replace longest matched child texts first to avoid partial replacements
    const sortedTexts = Array.from(maskedChildTexts).sort(
      (a, b) => b.length - a.length
    );
    for (const childText of sortedTexts) {
      rawTextForMasking = rawTextForMasking.split(childText).join('[MASKED]');

      // Also handle case where element.textContent was truncated at 300 chars ("...") mid-way through childText
      if (rawTextForMasking.endsWith('...') && childText.length >= 4) {
        const withoutEllipsis = rawTextForMasking.slice(0, -3);
        for (let len = childText.length - 1; len >= 3; len--) {
          const prefix = childText.slice(0, len);
          if (withoutEllipsis.endsWith(prefix)) {
            rawTextForMasking = `${withoutEllipsis.slice(0, -len)}[MASKED]...`;
            break;
          }
        }
      }
    }
  }

  const maskedTextContent = maskTextString(rawTextForMasking, {
    maskAll: shouldMaskAll,
    autoMaskPII: config.autoMaskPII,
  });

  const maskedOuterHTMLSnippet = maskHtmlSnippet(
    element.outerHTMLSnippet,
    shouldMaskAll,
    config
  );

  return {
    ...element,
    attributes: maskedAttributes,
    textContent: maskedTextContent,
    outerHTMLSnippet: maskedOuterHTMLSnippet,
    rect: { ...element.rect },
    computedStyles: { ...element.computedStyles },
    framework: element.framework
      ? {
          ...element.framework,
          componentHierarchy: [...element.framework.componentHierarchy],
          source: element.framework.source
            ? { ...element.framework.source }
            : null,
        }
      : null,
  };
}

/**
 * Returns a deep-cloned `AnnotationItem` with its `element` metadata masked.
 */
export function applyMaskingToAnnotation(
  annotation: AnnotationItem,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG
): AnnotationItem {
  return {
    ...annotation,
    element: applyMaskingToElementMetadata(
      annotation.element,
      annotation.maskText,
      config
    ),
  };
}

/**
 * Applies the payload's `pageContext.maskingConfig` across all annotations in an `ExportPayload`.
 */
export function applyMaskingToExportPayload(
  payload: ExportPayload
): ExportPayload {
  const config = payload.pageContext?.maskingConfig ?? DEFAULT_MASKING_CONFIG;
  return {
    pageContext: {
      ...payload.pageContext,
      viewport: { ...payload.pageContext.viewport },
      maskingConfig: {
        ...config,
        maskSelectors: [...(config.maskSelectors || [])],
      },
    },
    annotations: (payload.annotations || []).map((annotation) =>
      applyMaskingToAnnotation(annotation, config)
    ),
  };
}
