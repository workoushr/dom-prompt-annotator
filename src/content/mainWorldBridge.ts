// Minimal Main World Bridge placeholder for Phase 1
export function initMainWorldBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const win = window as unknown as Record<string, boolean>;
  if (win.__DOM_PROMPT_ANNOTATOR_BRIDGE__) {
    return;
  }
  win.__DOM_PROMPT_ANNOTATOR_BRIDGE__ = true;
}

initMainWorldBridge();
