// Minimal content script entry placeholder for Phase 1
export function initContentScript(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const win = window as unknown as Record<string, boolean>;
  if (win.__DOM_PROMPT_ANNOTATOR_INITIALIZED__) {
    return;
  }
  win.__DOM_PROMPT_ANNOTATOR_INITIALIZED__ = true;
}

initContentScript();
