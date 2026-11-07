export const OVERLAY_CSS = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #0f172a;
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .dpa-overlay-root {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
    overflow: visible;
  }

  /* Floating mode indicator pill */
  .dpa-mode-pill {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: rgba(15, 23, 42, 0.92);
    color: #f8fafc;
    border: 1px solid rgba(148, 163, 184, 0.3);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 4px 10px -2px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(8px);
    pointer-events: auto;
    z-index: 2147483646;
    font-size: 12px;
    font-weight: 500;
    user-select: none;
  }

  .dpa-mode-pill--active {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35), 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }

  .dpa-mode-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .dpa-mode-dot--active {
    background: #3b82f6;
    box-shadow: 0 0 8px #3b82f6;
  }

  .dpa-mode-toggle-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 9999px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dpa-mode-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
  }

  /* Hover highlight box */
  .dpa-hover-box {
    position: fixed;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.12);
    border-radius: 4px;
    pointer-events: none;
    z-index: 2147483642;
    transition: all 0.04s ease-out;
  }

  .dpa-hover-tooltip {
    position: fixed;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    background: #0f172a;
    color: #f8fafc;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    white-space: nowrap;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(59, 130, 246, 0.5);
    pointer-events: none;
    z-index: 2147483645;
  }

  .dpa-framework-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
  }

  .dpa-framework-badge--vue {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.4);
  }

  /* Playwright-style Visual Mask boxes */
  .dpa-visual-mask {
    position: fixed;
    pointer-events: none;
    border-radius: 3px;
    border-width: 2px;
    border-style: solid;
    z-index: 2147483640;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    overflow: hidden;
  }

  .dpa-visual-mask-tag {
    display: inline-block;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #ffffff;
    border-bottom-left-radius: 3px;
    text-transform: uppercase;
    line-height: 1.2;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  /* Annotated element bounding box & numbered badge */
  .dpa-annotation-outline {
    position: fixed;
    border: 2px dashed #2563eb;
    background: rgba(37, 99, 235, 0.06);
    border-radius: 4px;
    pointer-events: none;
    z-index: 2147483641;
  }

  .dpa-annotation-outline--active {
    border: 2px solid #f59e0b;
    background: rgba(245, 158, 11, 0.14);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35);
  }

  .dpa-annotation-badge {
    position: fixed;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 9999px;
    background: #2563eb;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    pointer-events: auto;
    z-index: 2147483644;
    user-select: none;
    transition: transform 0.12s ease, background 0.12s ease;
  }

  .dpa-annotation-badge:hover {
    transform: scale(1.1);
    background: #1d4ed8;
  }

  .dpa-annotation-badge--masked {
    background: #db2777;
  }

  /* Active highlight ring from Side Panel */
  .dpa-active-highlight-ring {
    position: fixed;
    border: 3px solid #f59e0b;
    background: rgba(245, 158, 11, 0.16);
    border-radius: 6px;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.3);
    pointer-events: none;
    z-index: 2147483643;
  }

  /* Target selection box when Popover is open */
  .dpa-selected-target-box {
    position: fixed;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.14);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
    border-radius: 4px;
    pointer-events: none;
    z-index: 2147483643;
  }

  /* In-Page Annotation Popover */
  .dpa-popover {
    position: fixed;
    width: 340px;
    max-width: calc(100vw - 24px);
    background: #ffffff;
    color: #0f172a;
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    box-shadow: 0 20px 35px -5px rgba(15, 23, 42, 0.28), 0 8px 16px -4px rgba(15, 23, 42, 0.15);
    padding: 12px;
    pointer-events: auto;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dpa-popover-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
  }

  .dpa-popover-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dpa-popover-tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 700;
    color: #1e293b;
    word-break: break-all;
  }

  .dpa-popover-selector {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #475569;
    background: #f1f5f9;
    padding: 3px 6px;
    border-radius: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dpa-hierarchy-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dpa-hierarchy-btn {
    flex: 1;
    appearance: none;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-hierarchy-btn:hover:not(:disabled) {
    background: #e2e8f0;
    border-color: #94a3b8;
    color: #0f172a;
  }

  .dpa-hierarchy-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .dpa-mask-toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #fdf2f8;
    border: 1px solid #fbcfe8;
    font-size: 12px;
    font-weight: 500;
    color: #831843;
    cursor: pointer;
    user-select: none;
  }

  .dpa-mask-toggle-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: #db2777;
    cursor: pointer;
    margin: 0;
  }

  .dpa-textarea {
    width: 100%;
    min-height: 76px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dpa-textarea:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
  }

  .dpa-popover-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .dpa-btn {
    appearance: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-btn-cancel {
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
  }

  .dpa-btn-cancel:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .dpa-btn-delete {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
    margin-right: auto;
  }

  .dpa-btn-delete:hover {
    background: #fee2e2;
    color: #b91c1c;
  }

  .dpa-btn-save {
    background: #2563eb;
    color: #ffffff;
  }

  .dpa-btn-save:hover {
    background: #1d4ed8;
  }
`;
