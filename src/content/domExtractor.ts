import {
  DEFAULT_MASKING_CONFIG,
  ElementMetadata,
  ElementRect,
  FrameworkMetadata,
  MaskingConfig,
} from '../types/annotation';
import {
  applyMaskingToElementMetadata,
  SHADOW_HOST_ID,
} from '../utils/masker';
import {
  createEmptyFrameworkMetadata,
  INSPECT_REQUEST_EVENT,
  INSPECT_RESPONSE_EVENT,
  INSPECT_RESULT_ATTR,
  INSPECT_TARGET_ATTR,
  InspectResponseDetail,
  inspectFrameworkFromElement,
} from './mainWorldBridge';

const TEST_ID_ATTRIBUTES = [
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
] as const;

const KEY_COMPUTED_STYLE_PROPERTIES = [
  'display',
  'position',
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'padding',
  'margin',
  'borderRadius',
  'border',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'zIndex',
] as const;

const IGNORED_STYLE_VALUES = new Set([
  '',
  'none',
  'normal',
  'auto',
  '0px',
  '0px 0px 0px 0px',
  'rgba(0, 0, 0, 0)',
  'transparent',
  'initial',
  'unset',
]);

const SKIPPED_CHILD_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'link',
  'meta',
]);

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value
    .replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')
    .replace(/^(\d)/, '\\3$1 ');
}

function isUniqueSelector(selector: string, doc: Document): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function getSemanticClasses(el: Element): string[] {
  const rawClasses: string[] = [];
  if (el.classList && el.classList.length > 0) {
    for (let i = 0; i < el.classList.length; i++) {
      const cls = el.classList[i];
      if (cls && !cls.startsWith('dpa-') && cls.length <= 40) {
        rawClasses.push(cls);
      }
    }
  } else {
    const classAttr = el.getAttribute('class');
    if (classAttr && classAttr.trim()) {
      for (const cls of classAttr.trim().split(/\s+/)) {
        if (cls && !cls.startsWith('dpa-') && cls.length <= 40) {
          rawClasses.push(cls);
        }
      }
    }
  }

  if (rawClasses.length === 0) {
    return [];
  }

  const simpleClasses: string[] = [];
  const complexTailwindClasses: string[] = [];

  for (const cls of rawClasses) {
    if (cls.includes(':') || cls.includes('[') || cls.includes('/')) {
      complexTailwindClasses.push(cls);
    } else {
      simpleClasses.push(cls);
    }
  }

  // Prefer clean semantic classes first, then fall back to Tailwind modifier classes (which get escaped via CSS.escape)
  return [...simpleClasses, ...complexTailwindClasses].slice(0, 2);
}

function buildElementSelectorSegment(el: Element, doc: Document): string {
  const tag = el.tagName.toLowerCase();

  if (el.id && el.id.trim()) {
    const idSel = `#${escapeCssIdentifier(el.id.trim())}`;
    if (isUniqueSelector(idSel, doc)) {
      return idSel;
    }
  }

  for (const attr of TEST_ID_ATTRIBUTES) {
    const val = el.getAttribute(attr);
    if (val && val.trim()) {
      const escapedVal = val.trim().replace(/"/g, '\\"');
      const attrSel = `${tag}[${attr}="${escapedVal}"]`;
      if (isUniqueSelector(attrSel, doc)) {
        return attrSel;
      }
      return attrSel;
    }
  }

  let segment = tag;
  const classes = getSemanticClasses(el);
  if (classes.length > 0) {
    segment += classes.map((c) => `.${escapeCssIdentifier(c)}`).join('');
  }

  const parent = el.parentElement;
  if (parent) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName === el.tagName
    );
    if (sameTagSiblings.length > 1) {
      let matchesInParent = 0;
      try {
        matchesInParent = Array.from(parent.children).filter((child) =>
          child.matches(segment)
        ).length;
      } catch {
        matchesInParent = sameTagSiblings.length;
      }

      if (matchesInParent > 1) {
        const nthIndex = sameTagSiblings.indexOf(el) + 1;
        segment += `:nth-of-type(${nthIndex})`;
      }
    }
  }

  return segment;
}

/**
 * Generates a clean, specific, LLM-friendly CSS selector for `el`.
 * Prioritizes unique `#id`, `[data-testid="..."]`, tag + semantic classes,
 * and `:nth-of-type` disambiguation, up to 4 levels deep or until unique in `document`.
 */
export function generateCssSelector(el: Element): string {
  const doc = el.ownerDocument || document;

  if (el === doc.documentElement) {
    return 'html';
  }
  if (el === doc.body) {
    return 'body';
  }

  // Immediate check for unique ID
  if (el.id && el.id.trim()) {
    const idSel = `#${escapeCssIdentifier(el.id.trim())}`;
    if (isUniqueSelector(idSel, doc)) {
      return idSel;
    }
  }

  // Immediate check for unique test attribute
  for (const attr of TEST_ID_ATTRIBUTES) {
    const val = el.getAttribute(attr);
    if (val && val.trim()) {
      const escapedVal = val.trim().replace(/"/g, '\\"');
      const testSel = `[${attr}="${escapedVal}"]`;
      if (isUniqueSelector(testSel, doc)) {
        return testSel;
      }
    }
  }

  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  const maxDepth = 4;

  while (
    current &&
    current !== doc.body &&
    current !== doc.documentElement &&
    depth < maxDepth
  ) {
    const segment = buildElementSelectorSegment(current, doc);
    parts.unshift(segment);

    const candidate = parts.join(' > ');
    if (isUniqueSelector(candidate, doc)) {
      return candidate;
    }

    if (segment.startsWith('#')) {
      break;
    }

    current = current.parentElement;
    depth += 1;
  }

  return parts.join(' > ') || el.tagName.toLowerCase();
}

/**
 * Generates a standard XPath expression (`//*[@id="..."]` or `/html/body/...`) for `el`.
 */
export function generateXPath(el: Element): string {
  const doc = el.ownerDocument || document;

  if (el.id && el.id.trim() && !el.id.includes('"')) {
    const idTrimmed = el.id.trim();
    if (doc.getElementById(idTrimmed) === el) {
      return `//*[@id="${idTrimmed}"]`;
    }
  }

  const segments: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;

    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const sameTagSiblings = Array.from(parent.children).filter(
      (sibling: Element) => sibling.tagName === current?.tagName
    );

    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      segments.unshift(`${tag}[${index}]`);
    } else {
      segments.unshift(tag);
    }

    current = parent;
  }

  return `/${segments.join('/')}`;
}

/**
 * Finds an HTMLElement by first trying `root.querySelector(selector)`,
 * then falling back to `root.evaluate(xpath, ...)`.
 */
export function findElementBySelectorOrXPath(
  selector: string,
  xpath?: string,
  root: Document = document
): HTMLElement | null {
  if (selector && selector.trim()) {
    try {
      const found = root.querySelector(selector.trim());
      if (found instanceof HTMLElement) {
        return found;
      }
    } catch {
      // Ignore invalid CSS selector and try XPath fallback
    }
  }

  if (xpath && xpath.trim() && typeof root.evaluate === 'function') {
    try {
      const xPathResult = root.evaluate(
        xpath.trim(),
        root,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const node = xPathResult.singleNodeValue;
      if (node instanceof HTMLElement) {
        return node;
      }
    } catch {
      // Ignore invalid XPath
    }
  }

  return null;
}

/**
 * Extracts key layout and visual computed styles from `el`, omitting empty or meaningless defaults.
 */
export function extractComputedStyles(el: Element): Record<string, string> {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return {};
  }

  const styles = window.getComputedStyle(el);
  const result: Record<string, string> = {};

  for (const prop of KEY_COMPUTED_STYLE_PROPERTIES) {
    const val = (styles[prop] || '').toString().trim();
    if (!val) {
      continue;
    }

    // Always keep `display` and `position` if non-empty
    if (prop === 'display' || prop === 'position') {
      result[prop] = val;
      continue;
    }

    if (IGNORED_STYLE_VALUES.has(val)) {
      continue;
    }

    result[prop] = val;
  }

  return result;
}

function stripInternalAttributes(root: Element): void {
  const stripFromEl = (node: Element) => {
    if (!node.attributes) {
      return;
    }
    const toRemove: string[] = [];
    for (let i = 0; i < node.attributes.length; i++) {
      const attrName = node.attributes[i]?.name || '';
      if (attrName.startsWith('data-dpa-')) {
        toRemove.push(attrName);
      }
    }
    for (const attr of toRemove) {
      node.removeAttribute(attr);
    }
  };

  stripFromEl(root);
  root.querySelectorAll('*').forEach(stripFromEl);
}

/**
 * Clones `el`, strips temporary `data-dpa-*` attributes, and truncates long inner HTML
 * cleanly if the outerHTML exceeds `maxLength`.
 */
export function extractOuterHTMLSnippet(
  el: Element,
  maxLength = 500
): string {
  const clone = el.cloneNode(true) as Element;
  stripInternalAttributes(clone);

  const fullOuter = clone.outerHTML;
  if (fullOuter.length <= maxLength) {
    return fullOuter;
  }

  const shallowClone = clone.cloneNode(false) as Element;
  const emptyOuter = shallowClone.outerHTML;
  const tag = clone.tagName.toLowerCase();
  const closingTag = `</${tag}>`;

  if (
    emptyOuter.endsWith(closingTag) &&
    emptyOuter.length + 3 <= maxLength
  ) {
    const openTag = emptyOuter.slice(0, emptyOuter.length - closingTag.length);
    const availableInnerLength = Math.max(
      0,
      maxLength - openTag.length - closingTag.length - 3
    );
    const innerTruncated =
      clone.innerHTML.slice(0, availableInnerLength).trimEnd() + '...';
    return `${openTag}${innerTruncated}${closingTag}`;
  }

  return `${fullOuter.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * Requests React/Vue framework metadata for `el`.
 * First checks directly (works in same-world or tests), then falls back to synchronous
 * CustomEvent bridge communication (`dpa:inspect-request` -> `dpa:inspect-response`).
 */
export function requestFrameworkMetadata(el: Element): FrameworkMetadata {
  const direct = inspectFrameworkFromElement(el);
  if (direct.detected !== null) {
    return direct;
  }

  if (typeof window === 'undefined') {
    return createEmptyFrameworkMetadata();
  }

  const requestId = `dpa-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let responseMetadata: FrameworkMetadata | null = null;

  const onResponse = (event: Event) => {
    const customEvent = event as CustomEvent<InspectResponseDetail>;
    if (
      !customEvent.detail?.requestId ||
      customEvent.detail.requestId === requestId
    ) {
      responseMetadata = customEvent.detail?.framework ?? null;
    }
  };

  try {
    el.setAttribute(INSPECT_TARGET_ATTR, requestId);
    window.addEventListener(INSPECT_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent(INSPECT_REQUEST_EVENT, {
        detail: { requestId },
      })
    );
    if (!responseMetadata) {
      const attrJson = el.getAttribute(INSPECT_RESULT_ATTR);
      if (attrJson) {
        try {
          responseMetadata = JSON.parse(attrJson) as FrameworkMetadata;
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  } finally {
    window.removeEventListener(INSPECT_RESPONSE_EVENT, onResponse);
    el.removeAttribute(INSPECT_TARGET_ATTR);
    el.removeAttribute(INSPECT_RESULT_ATTR);
  }

  return responseMetadata ?? createEmptyFrameworkMetadata();
}

function extractElementAttributes(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (el.attributes) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (!attr || attr.name.startsWith('data-dpa-')) {
        continue;
      }
      attrs[attr.name] = attr.value;
    }
  }

  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.value &&
    attrs.value === undefined
  ) {
    attrs.value = el.value;
  }

  return attrs;
}

function extractCleanTextContent(el: Element, maxLength = 300): string {
  let raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (
    !raw &&
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
  ) {
    raw = (el.value || el.placeholder || '').trim();
  }
  if (raw.length > maxLength) {
    return `${raw.slice(0, maxLength)}...`;
  }
  return raw;
}

function extractElementRect(el: Element): ElementRect {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.x ?? rect.left ?? 0),
    y: Math.round(rect.y ?? rect.top ?? 0),
    width: Math.round(rect.width ?? 0),
    height: Math.round(rect.height ?? 0),
  };
}

/**
 * Extracts complete `ElementMetadata` from a DOM element and optionally applies masking.
 */
export function extractElementMetadata(
  el: Element,
  maskingConfig?: MaskingConfig,
  forceMaskText = false
): ElementMetadata {
  const rawMetadata: ElementMetadata = {
    tagName: el.tagName.toLowerCase(),
    id: el.id || '',
    className:
      typeof el.className === 'string'
        ? el.className.trim()
        : (el.getAttribute('class') || '').trim(),
    selector: generateCssSelector(el),
    xpath: generateXPath(el),
    attributes: extractElementAttributes(el),
    textContent: extractCleanTextContent(el),
    outerHTMLSnippet: extractOuterHTMLSnippet(el, 500),
    rect: extractElementRect(el),
    computedStyles: extractComputedStyles(el),
    framework: requestFrameworkMetadata(el),
  };

  if (maskingConfig || forceMaskText) {
    return applyMaskingToElementMetadata(
      rawMetadata,
      forceMaskText,
      maskingConfig ?? DEFAULT_MASKING_CONFIG
    );
  }

  return rawMetadata;
}

/**
 * Returns the parent `HTMLElement` candidate for DOM hierarchy traversal,
 * stopping at `document.body` (never returning `document.body` or `document.documentElement`).
 */
export function getParentCandidate(el: Element | null): HTMLElement | null {
  if (!el) {
    return null;
  }

  const doc = el.ownerDocument || document;
  if (el === doc.body || el === doc.documentElement) {
    return null;
  }

  const parent = el.parentElement;
  if (
    !parent ||
    parent === doc.body ||
    parent === doc.documentElement ||
    parent.id === SHADOW_HOST_ID
  ) {
    return null;
  }

  return parent;
}

/**
 * Returns the first valid child `HTMLElement` candidate for DOM hierarchy traversal,
 * skipping `#dpa-root-host`, `script`, `style`, and non-HTML elements.
 */
export function getFirstChildCandidate(el: Element | null): HTMLElement | null {
  if (!el || !el.children) {
    return null;
  }

  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.id === SHADOW_HOST_ID) {
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (SKIPPED_CHILD_TAGS.has(tag)) {
      continue;
    }
    return child;
  }

  return null;
}
