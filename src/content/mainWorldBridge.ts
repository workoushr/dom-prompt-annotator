import {
  FrameworkMetadata,
  FrameworkSourceLocation,
} from '../types/annotation';

export const INSPECT_REQUEST_EVENT = 'dpa:inspect-request';
export const INSPECT_RESPONSE_EVENT = 'dpa:inspect-response';
export const INSPECT_TARGET_ATTR = 'data-dpa-inspect-target';
export const INSPECT_RESULT_ATTR = 'data-dpa-inspect-result';

export interface InspectRequestDetail {
  requestId: string;
}

export interface InspectResponseDetail {
  requestId: string;
  framework: FrameworkMetadata;
}

const MAX_HIERARCHY_DEPTH = 6;
const MAX_TRAVERSAL_DEPTH = 50;

const IGNORED_REACT_COMPONENTS = new Set([
  'Fragment',
  'React.Fragment',
  'Suspense',
  'SuspenseList',
  'StrictMode',
  'Profiler',
  'Anonymous',
  '_c',
  'Context.Provider',
  'Context.Consumer',
  'Provider',
  'Consumer',
]);

export function createEmptyFrameworkMetadata(): FrameworkMetadata {
  return {
    detected: null,
    componentName: null,
    componentHierarchy: [],
    source: null,
  };
}

interface ReactDebugSource {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface ReactFiberLike {
  type?: unknown;
  elementType?: unknown;
  return?: ReactFiberLike | null;
  _debugSource?: ReactDebugSource | null;
  _debugOwner?: ReactFiberLike | null;
}

interface VueComponentInstanceLike {
  type?: {
    name?: string;
    __name?: string;
    __file?: string;
    displayName?: string;
  } | null;
  vnode?: {
    type?: {
      name?: string;
      __name?: string;
      __file?: string;
      displayName?: string;
    } | null;
  } | null;
  parent?: VueComponentInstanceLike | null;
}

function isIgnoredReactComponentName(name: string): boolean {
  if (!name || name.length === 0) {
    return true;
  }
  if (IGNORED_REACT_COMPONENTS.has(name)) {
    return true;
  }
  if (name.endsWith('.Provider') || name.endsWith('.Consumer')) {
    return true;
  }
  // Host elements are lowercase tag names like div, span, button
  if (/^[a-z][a-z0-9-]*$/.test(name)) {
    return true;
  }
  return false;
}

function getReactComponentNameFromType(type: unknown): string | null {
  if (!type) {
    return null;
  }

  if (typeof type === 'string') {
    // Host element (div, span, etc.)
    return null;
  }

  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    const rawName = (fn.displayName || fn.name || '').trim();
    return isIgnoredReactComponentName(rawName) ? null : rawName;
  }

  if (typeof type === 'object') {
    const obj = type as {
      displayName?: string;
      name?: string;
      render?: { displayName?: string; name?: string };
      type?: unknown;
    };

    if (typeof obj.displayName === 'string' && obj.displayName.trim()) {
      const cleaned = obj.displayName.trim();
      if (!isIgnoredReactComponentName(cleaned)) {
        return cleaned;
      }
    }

    if (obj.render) {
      const renderName = (
        obj.render.displayName ||
        obj.render.name ||
        ''
      ).trim();
      if (!isIgnoredReactComponentName(renderName)) {
        return renderName;
      }
    }

    if (obj.type) {
      return getReactComponentNameFromType(obj.type);
    }
  }

  return null;
}

function extractReactSource(
  fiber: ReactFiberLike | null | undefined
): FrameworkSourceLocation | null {
  if (!fiber) {
    return null;
  }

  const candidate =
    fiber._debugSource || fiber._debugOwner?._debugSource || null;
  if (
    candidate &&
    typeof candidate.fileName === 'string' &&
    candidate.fileName.trim()
  ) {
    const source: FrameworkSourceLocation = {
      fileName: candidate.fileName.trim(),
    };
    if (typeof candidate.lineNumber === 'number') {
      source.lineNumber = candidate.lineNumber;
    }
    if (typeof candidate.columnNumber === 'number') {
      source.columnNumber = candidate.columnNumber;
    }
    return source;
  }

  return null;
}

function findReactFiberOnElement(el: Element): ReactFiberLike | null {
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < MAX_TRAVERSAL_DEPTH) {
    depth += 1;
    const record = current as unknown as Record<string, unknown>;
    const keys = Object.keys(record);
    for (const key of keys) {
      if (
        key.startsWith('__reactFiber$') ||
        key.startsWith('__reactInternalInstance$')
      ) {
        const val = record[key];
        if (val && typeof val === 'object') {
          return val as ReactFiberLike;
        }
      }
    }
    current = current.parentElement;
  }
  return null;
}

function inspectReactFiber(startFiber: ReactFiberLike): FrameworkMetadata {
  const namesNearestFirst: string[] = [];
  let source: FrameworkSourceLocation | null = extractReactSource(startFiber);

  let current: ReactFiberLike | null | undefined = startFiber;
  let depth = 0;
  const visited = new Set<ReactFiberLike>();

  while (current && depth < MAX_TRAVERSAL_DEPTH && !visited.has(current)) {
    visited.add(current);
    depth += 1;

    if (!source) {
      source = extractReactSource(current);
    }

    const name =
      getReactComponentNameFromType(current.type) ||
      getReactComponentNameFromType(current.elementType);

    if (name && namesNearestFirst[namesNearestFirst.length - 1] !== name) {
      if (namesNearestFirst.length < MAX_HIERARCHY_DEPTH) {
        namesNearestFirst.push(name);
      }
    }

    current = current.return;
  }

  const componentName = namesNearestFirst[0] ?? null;
  const componentHierarchy = [...namesNearestFirst].reverse();

  return {
    detected: 'react',
    componentName,
    componentHierarchy,
    source,
  };
}

function extractVueComponentName(
  instance: VueComponentInstanceLike
): string | null {
  const type = instance.type || instance.vnode?.type;
  if (!type) {
    return null;
  }

  const directName = (
    type.name ||
    type.__name ||
    type.displayName ||
    ''
  ).trim();
  if (directName) {
    return directName;
  }

  if (typeof type.__file === 'string' && type.__file.trim()) {
    const base = type.__file.trim().split(/[/\\]/).pop() || '';
    const withoutExt = base.replace(/\.(vue|tsx|jsx|ts|js)$/i, '');
    if (withoutExt) {
      return withoutExt;
    }
  }

  return null;
}

function findVueInstanceOnElement(
  el: Element
): VueComponentInstanceLike | null {
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < MAX_TRAVERSAL_DEPTH) {
    depth += 1;
    const record = current as unknown as Record<string, unknown>;
    if (
      record.__vueParentComponent &&
      typeof record.__vueParentComponent === 'object'
    ) {
      return record.__vueParentComponent as VueComponentInstanceLike;
    }
    if (record.__vnode && typeof record.__vnode === 'object') {
      const vnode = record.__vnode as {
        component?: VueComponentInstanceLike;
        type?: VueComponentInstanceLike['type'];
      };
      if (vnode.component && typeof vnode.component === 'object') {
        return vnode.component;
      }
      if (vnode.type && typeof vnode.type === 'object') {
        return { type: vnode.type, parent: null };
      }
    }
    current = current.parentElement;
  }
  return null;
}

function inspectVueInstance(
  startInstance: VueComponentInstanceLike
): FrameworkMetadata {
  const namesNearestFirst: string[] = [];
  let source: FrameworkSourceLocation | null = null;

  let current: VueComponentInstanceLike | null | undefined = startInstance;
  let depth = 0;
  const visited = new Set<VueComponentInstanceLike>();

  while (current && depth < MAX_TRAVERSAL_DEPTH && !visited.has(current)) {
    visited.add(current);
    depth += 1;

    const type = current.type || current.vnode?.type;
    if (!source && type && typeof type.__file === 'string' && type.__file.trim()) {
      source = {
        fileName: type.__file.trim(),
      };
    }

    const name = extractVueComponentName(current);
    if (name && namesNearestFirst[namesNearestFirst.length - 1] !== name) {
      if (namesNearestFirst.length < MAX_HIERARCHY_DEPTH) {
        namesNearestFirst.push(name);
      }
    }

    current = current.parent;
  }

  const componentName = namesNearestFirst[0] ?? null;
  const componentHierarchy = [...namesNearestFirst].reverse();

  return {
    detected: 'vue',
    componentName,
    componentHierarchy,
    source,
  };
}

function inspectFallbackAttributes(el: Element): FrameworkMetadata {
  const namesNearestFirst: string[] = [];
  let hasVueDataAttr = false;

  let current: Element | null = el;
  let depth = 0;
  while (current && depth < MAX_TRAVERSAL_DEPTH) {
    depth += 1;
    const compAttr =
      current.getAttribute('data-component') ||
      current.getAttribute('data-sentry-component');
    if (compAttr && compAttr.trim()) {
      const cleaned = compAttr.trim();
      if (
        namesNearestFirst[namesNearestFirst.length - 1] !== cleaned &&
        namesNearestFirst.length < MAX_HIERARCHY_DEPTH
      ) {
        namesNearestFirst.push(cleaned);
      }
    }

    if (!hasVueDataAttr && current.attributes) {
      for (let i = 0; i < current.attributes.length; i++) {
        const attrName = current.attributes[i]?.name || '';
        if (/^data-v-[a-f0-9]+$/i.test(attrName)) {
          hasVueDataAttr = true;
          break;
        }
      }
    }

    current = current.parentElement;
  }

  if (namesNearestFirst.length > 0) {
    return {
      detected: hasVueDataAttr ? 'vue' : 'react',
      componentName: namesNearestFirst[0] ?? null,
      componentHierarchy: [...namesNearestFirst].reverse(),
      source: null,
    };
  }

  if (hasVueDataAttr) {
    return {
      detected: 'vue',
      componentName: null,
      componentHierarchy: [],
      source: null,
    };
  }

  return createEmptyFrameworkMetadata();
}

/**
 * Inspects a DOM element (and its ancestors) for React Fiber or Vue 3 component metadata.
 */
export function inspectFrameworkFromElement(
  el: Element | null | undefined
): FrameworkMetadata {
  if (!el) {
    return createEmptyFrameworkMetadata();
  }

  // 1. Check React Fiber
  const reactFiber = findReactFiberOnElement(el);
  if (reactFiber) {
    return inspectReactFiber(reactFiber);
  }

  // 2. Check Vue 3 component instance
  const vueInstance = findVueInstanceOnElement(el);
  if (vueInstance) {
    return inspectVueInstance(vueInstance);
  }

  // 3. Fallback to data-component / data-sentry-component / data-v-* attributes
  return inspectFallbackAttributes(el);
}

function handleInspectRequest(event: Event): void {
  const customEvent = event as CustomEvent<InspectRequestDetail>;
  const requestId = customEvent.detail?.requestId || '';

  let targetEl: Element | null = null;
  if (typeof document !== 'undefined') {
    if (requestId) {
      const escapedId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(requestId)
          : requestId.replace(/"/g, '\\"');
      targetEl = document.querySelector(
        `[${INSPECT_TARGET_ATTR}="${escapedId}"]`
      );
    }
    if (!targetEl) {
      targetEl = document.querySelector(`[${INSPECT_TARGET_ATTR}]`);
    }
  }

  const framework = inspectFrameworkFromElement(targetEl);

  if (targetEl) {
    try {
      targetEl.setAttribute(INSPECT_RESULT_ATTR, JSON.stringify(framework));
    } catch {
      // Ignore attribute serialization errors
    }
  }

  if (typeof window !== 'undefined') {
    const responseEvent = new CustomEvent<InspectResponseDetail>(
      INSPECT_RESPONSE_EVENT,
      {
        detail: {
          requestId,
          framework,
        },
      }
    );
    window.dispatchEvent(responseEvent);
  }
}

export function initMainWorldBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as unknown as Record<string, boolean>;
  if (win.__DOM_PROMPT_ANNOTATOR_BRIDGE__) {
    return;
  }
  win.__DOM_PROMPT_ANNOTATOR_BRIDGE__ = true;

  window.addEventListener(INSPECT_REQUEST_EVENT, handleInspectRequest);
}

initMainWorldBridge();
