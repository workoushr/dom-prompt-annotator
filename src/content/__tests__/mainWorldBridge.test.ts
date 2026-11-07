import { describe, it, expect, beforeEach } from 'vitest';
import {
  inspectFrameworkFromElement,
  initMainWorldBridge,
  INSPECT_REQUEST_EVENT,
  INSPECT_RESPONSE_EVENT,
  INSPECT_TARGET_ATTR,
  InspectResponseDetail,
} from '../mainWorldBridge';
import { requestFrameworkMetadata } from '../domExtractor';

describe('React / Vue MAIN World Inspector (mainWorldBridge.ts)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initMainWorldBridge();
  });

  it('extracts React component name, hierarchy (outermost to innermost), and _debugSource from Fiber tree', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    function App() {}
    function DashboardLayout() {}
    function CheckoutForm() {}
    function SubmitButton() {}

    // Construct a mock React Fiber tree with host elements & Context.Provider in between
    const appFiber = {
      type: App,
      return: null,
    };
    const contextProviderFiber = {
      type: { displayName: 'ThemeContext.Provider' },
      return: appFiber,
    };
    const layoutFiber = {
      type: DashboardLayout,
      return: contextProviderFiber,
    };
    const formFiber = {
      type: CheckoutForm,
      return: layoutFiber,
    };
    const buttonComponentFiber = {
      type: SubmitButton,
      _debugSource: {
        fileName: '/src/components/CheckoutForm.tsx',
        lineNumber: 84,
        columnNumber: 12,
      },
      return: formFiber,
    };
    const hostButtonFiber = {
      type: 'button',
      return: buttonComponentFiber,
    };

    (button as unknown as Record<string, unknown>).__reactFiber$xyz123 =
      hostButtonFiber;

    const result = inspectFrameworkFromElement(button);

    expect(result.detected).toBe('react');
    expect(result.componentName).toBe('SubmitButton');
    expect(result.componentHierarchy).toEqual([
      'App',
      'DashboardLayout',
      'CheckoutForm',
      'SubmitButton',
    ]);
    expect(result.source).toEqual({
      fileName: '/src/components/CheckoutForm.tsx',
      lineNumber: 84,
      columnNumber: 12,
    });
  });

  it('extracts Vue 3 component name, hierarchy, and __file source from __vueParentComponent', () => {
    const cardEl = document.createElement('div');
    document.body.appendChild(cardEl);

    const rootInstance = {
      type: { __name: 'AppRoot', __file: '/src/AppRoot.vue' },
      parent: null,
    };
    const pageInstance = {
      type: { name: 'UserDirectoryPage', __file: '/src/pages/UserDirectoryPage.vue' },
      parent: rootInstance,
    };
    const cardInstance = {
      type: { __file: '/src/components/UserProfileCard.vue' },
      parent: pageInstance,
    };

    (cardEl as unknown as Record<string, unknown>).__vueParentComponent =
      cardInstance;

    const result = inspectFrameworkFromElement(cardEl);

    expect(result.detected).toBe('vue');
    expect(result.componentName).toBe('UserProfileCard');
    expect(result.componentHierarchy).toEqual([
      'AppRoot',
      'UserDirectoryPage',
      'UserProfileCard',
    ]);
    expect(result.source).toEqual({
      fileName: '/src/components/UserProfileCard.vue',
    });
  });

  it('falls back to data-component / data-sentry-component attributes when no Fiber or Vue instance exists', () => {
    document.body.innerHTML = `
      <div data-sentry-component="HeaderContainer">
        <nav data-component="TopNav">
          <a id="nav-link" href="/home">Home</a>
        </nav>
      </div>
    `;

    const link = document.getElementById('nav-link')!;
    const result = inspectFrameworkFromElement(link);

    expect(result.detected).toBe('react');
    expect(result.componentName).toBe('TopNav');
    expect(result.componentHierarchy).toEqual(['HeaderContainer', 'TopNav']);
  });

  it('communicates synchronously over window CustomEvents (dpa:inspect-request -> dpa:inspect-response)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    function WidgetCard() {}
    (el as unknown as Record<string, unknown>).__reactFiber$test = {
      type: WidgetCard,
      _debugSource: { fileName: 'WidgetCard.tsx', lineNumber: 22 },
      return: null,
    };

    const requestId = 'test-sync-req-1';
    el.setAttribute(INSPECT_TARGET_ATTR, requestId);

    let capturedResponse: InspectResponseDetail | null = null;
    const listener = (e: Event) => {
      capturedResponse = (e as CustomEvent<InspectResponseDetail>).detail;
    };

    window.addEventListener(INSPECT_RESPONSE_EVENT, listener);
    window.dispatchEvent(
      new CustomEvent(INSPECT_REQUEST_EVENT, { detail: { requestId } })
    );
    window.removeEventListener(INSPECT_RESPONSE_EVENT, listener);
    el.removeAttribute(INSPECT_TARGET_ATTR);

    expect(capturedResponse).not.toBeNull();
    expect(capturedResponse!.requestId).toBe(requestId);
    expect(capturedResponse!.framework.detected).toBe('react');
    expect(capturedResponse!.framework.componentName).toBe('WidgetCard');

    // Also verify requestFrameworkMetadata from domExtractor
    const viaHelper = requestFrameworkMetadata(el);
    expect(viaHelper.detected).toBe('react');
    expect(viaHelper.componentName).toBe('WidgetCard');
  });

  it('safely terminates without infinite loops or duplicate entries on cyclic React Fiber or Vue parent trees', () => {
    const reactEl = document.createElement('div');
    document.body.appendChild(reactEl);

    function CompA() {}
    function CompB() {}

    const fiberA: { type: unknown; return: unknown } = {
      type: CompA,
      return: null,
    };
    const fiberB: { type: unknown; return: unknown } = {
      type: CompB,
      return: fiberA,
    };
    fiberA.return = fiberB; // Cyclic reference!

    (reactEl as unknown as Record<string, unknown>).__reactFiber$cycle = fiberB;

    const reactResult = inspectFrameworkFromElement(reactEl);
    expect(reactResult.detected).toBe('react');
    expect(reactResult.componentName).toBe('CompB');
    expect(reactResult.componentHierarchy).toEqual(['CompA', 'CompB']);

    const vueEl = document.createElement('div');
    document.body.appendChild(vueEl);

    const vueA: { type: { name: string }; parent: unknown } = {
      type: { name: 'VueParent' },
      parent: null,
    };
    const vueB: { type: { name: string }; parent: unknown } = {
      type: { name: 'VueChild' },
      parent: vueA,
    };
    vueA.parent = vueB; // Cyclic reference!

    (vueEl as unknown as Record<string, unknown>).__vueParentComponent = vueB;

    const vueResult = inspectFrameworkFromElement(vueEl);
    expect(vueResult.detected).toBe('vue');
    expect(vueResult.componentName).toBe('VueChild');
    expect(vueResult.componentHierarchy).toEqual(['VueParent', 'VueChild']);
  });
});
