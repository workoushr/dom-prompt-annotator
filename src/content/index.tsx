import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SHADOW_HOST_ID } from '../utils/masker';
import { OVERLAY_CSS } from './overlayStyles';
import { OverlayApp } from './OverlayApp';

export const BRIDGE_SCRIPT_ID = 'dpa-main-world-bridge-script';

let reactRoot: Root | null = null;

export function injectMainWorldBridgeScript(doc: Document = document): void {
  if (typeof doc === 'undefined' || !doc.documentElement) {
    return;
  }

  if (doc.getElementById(BRIDGE_SCRIPT_ID)) {
    return;
  }

  if (
    typeof chrome === 'undefined' ||
    !chrome?.runtime ||
    typeof chrome.runtime.getURL !== 'function'
  ) {
    return;
  }

  try {
    const scriptUrl = chrome.runtime.getURL('mainWorldBridge.js');
    if (!scriptUrl) {
      return;
    }

    const script = doc.createElement('script');
    script.id = BRIDGE_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.onload = () => {
      // Keep or remove script tag; keeping id prevents duplicate injection
    };
    (doc.documentElement || doc.head || doc.body).appendChild(script);
  } catch {
    // Gracefully skip if extension context is invalidated or unavailable
  }
}

export function mountOverlayShadowDom(doc: Document = document): {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  container: HTMLElement;
} | null {
  if (typeof doc === 'undefined' || !doc.body) {
    return null;
  }

  let host = doc.getElementById(SHADOW_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = doc.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.setAttribute(
      'style',
      'position: fixed; inset: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;'
    );
    doc.body.appendChild(host);
  }

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

  let styleEl = shadowRoot.querySelector(
    'style[data-dpa-shadow-style="true"]'
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.setAttribute('data-dpa-shadow-style', 'true');
    styleEl.textContent = OVERLAY_CSS;
    shadowRoot.appendChild(styleEl);
  }

  let container = shadowRoot.querySelector(
    '#dpa-shadow-app-container'
  ) as HTMLElement | null;
  if (!container) {
    container = doc.createElement('div');
    container.id = 'dpa-shadow-app-container';
    shadowRoot.appendChild(container);
  }

  if (!reactRoot) {
    reactRoot = createRoot(container);
  }
  reactRoot.render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  );

  return { host, shadowRoot, container };
}

export function unmountOverlayShadowDom(doc: Document = document): void {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  if (typeof doc !== 'undefined') {
    const existingHost = doc.getElementById(SHADOW_HOST_ID);
    if (existingHost) {
      existingHost.remove();
    }
  }
}

export function initContentScript(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const win = window as unknown as Record<string, boolean>;
  if (win.__DOM_PROMPT_ANNOTATOR_INITIALIZED__) {
    return;
  }
  win.__DOM_PROMPT_ANNOTATOR_INITIALIZED__ = true;

  injectMainWorldBridgeScript(document);

  if (document.body) {
    mountOverlayShadowDom(document);
  } else {
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        mountOverlayShadowDom(document);
      },
      { once: true }
    );
  }
}

// Auto-initialize when injected into a page unless inside a Vitest test environment
const isTestEnv =
  typeof process !== 'undefined' &&
  (process.env?.VITEST === 'true' || process.env?.NODE_ENV === 'test');

if (!isTestEnv) {
  initContentScript();
}
