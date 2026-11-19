export const BRIDGE_SCRIPT_ID = 'dpa-main-world-bridge-script';

/**
 * Injects the page-context bridge script into `doc`.
 *
 * Works for the top-level document as well as same-origin iframe documents
 * (device preview) because it only uses the document's own DOM APIs.
 */
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
      // Keep the tag; its id prevents duplicate injection.
    };
    (doc.documentElement || doc.head || doc.body).appendChild(script);
  } catch {
    // Gracefully skip if extension context is invalidated or unavailable.
  }
}
