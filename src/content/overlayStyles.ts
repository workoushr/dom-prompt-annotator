export const OVERLAY_CSS = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #f5f5f5;
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

  /* Utility icons and flex helpers */
  .dpa-icon-xs {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .dpa-icon-sm {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .dpa-icon-check {
    color: #10b981;
  }

  .dpa-text-blue {
    color: #0d99ff;
  }

  .dpa-flex-center {
    display: flex;
    align-items: center;
  }

  .dpa-flex-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  /* ========================================================================= */
  /* FIGMA UI3 FLOATING BOTTOM BAR                                             */
  /* ========================================================================= */
  .dpa-bottom-bar {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: rgba(44, 44, 44, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    pointer-events: auto;
    z-index: 2147483646;
    user-select: none;
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
  }

  @media (max-width: 720px) {
    .dpa-bottom-bar {
      gap: 4px;
      padding: 4px 6px;
    }
  }

  @media (max-width: 640px) {
    .dpa-bottom-bar {
      gap: 3px;
      padding: 3px 5px;
      height: 40px;
      border-radius: 12px;
    }
  }

  @media (max-width: 480px) {
    .dpa-bottom-bar {
      gap: 2px;
      padding: 2px 4px;
      max-width: calc(100vw - 12px);
      bottom: 8px;
    }
  }

  .dpa-divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 2px;
    flex-shrink: 0;
  }

  /* Mode pill wrap for testid backward compatibility */
  .dpa-mode-pill-wrap {
    display: flex;
    align-items: center;
  }

  /* Toolbar buttons common base */
  .dpa-btn {
    appearance: none;
    border: 1px solid transparent;
    border-radius: 8px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 500;
    color: #e5e5e5;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.12s ease;
    white-space: nowrap;
  }

  .dpa-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .dpa-btn:active {
    background: rgba(255, 255, 255, 0.12);
  }

  .dpa-btn-text {
    font-size: 12px;
    font-weight: 500;
  }

  /* 1. Selection Mode Button */
  .dpa-btn-select-mode {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .dpa-btn-select-mode--active {
    background: #0d99ff !important;
    border-color: #0d99ff !important;
    color: #ffffff !important;
    box-shadow: 0 0 12px rgba(13, 153, 255, 0.5);
  }

  .dpa-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #737373;
    transition: background 0.15s ease;
  }

  .dpa-status-dot--active {
    background: #ffffff;
    box-shadow: 0 0 6px #ffffff;
  }

  /* 2. Device Selector & Menu */
  .dpa-device-selector-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .dpa-btn-device {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    max-width: 200px;
  }

  .dpa-btn-device--active {
    border-color: rgba(13, 153, 255, 0.4);
    background: rgba(13, 153, 255, 0.12);
    color: #ffffff;
  }

  .dpa-btn-device-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 500;
  }

  .dpa-device-badge {
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    background: #0d99ff;
    color: #ffffff;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .dpa-chevron {
    transition: transform 0.15s ease;
  }

  .dpa-chevron--open {
    transform: rotate(180deg);
  }

  .dpa-btn-rotate {
    width: 28px;
    height: 32px;
    padding: 0;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .dpa-device-menu {
    position: absolute;
    bottom: 42px;
    left: 0;
    min-width: 260px;
    background: #2c2c2c;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    box-shadow: 0 16px 40px -6px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    padding: 6px;
    z-index: 2147483647;
    animation: dpaFadeSlideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dpa-menu-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888888;
    padding: 6px 8px 4px;
  }

  .dpa-menu-items {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .dpa-menu-item {
    appearance: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #e5e5e5;
    font-size: 12px;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .dpa-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .dpa-menu-item--selected {
    background: rgba(13, 153, 255, 0.15);
    color: #0d99ff;
    font-weight: 600;
  }

  .dpa-menu-item-name {
    font-weight: 500;
  }

  .dpa-menu-item-dim {
    font-size: 10px;
    color: #888888;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .dpa-menu-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 0;
  }

  .dpa-menu-item-reset {
    color: #cbd5e1;
  }

  /* 3. REC Button */
  .dpa-btn-rec {
    background: rgba(244, 63, 94, 0.12);
    border-color: rgba(244, 63, 94, 0.25);
    color: #fb7185;
  }

  .dpa-btn-rec:hover {
    background: rgba(244, 63, 94, 0.2);
    border-color: rgba(244, 63, 94, 0.4);
    color: #f43f5e;
  }

  .dpa-btn-rec--recording {
    background: rgba(244, 63, 94, 0.25);
    border-color: #f43f5e;
    color: #ffffff;
    font-family: monospace;
    font-weight: 600;
  }

  .dpa-rec-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #f43f5e;
  }

  .dpa-rec-dot--active {
    background: #ff1a40;
  }

  /* 4. Annotations Drawer Button */
  .dpa-btn-drawer--has-items {
    background: rgba(13, 153, 255, 0.12);
    border-color: rgba(13, 153, 255, 0.25);
    color: #0d99ff;
  }

  .dpa-btn-drawer--open {
    background: rgba(255, 255, 255, 0.12);
  }

  /* 5. Prompt Copy Button */
  .dpa-copy-btn-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .dpa-btn-copy {
    background: #0d99ff;
    color: #ffffff;
    font-weight: 600;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    padding-right: 8px;
  }

  .dpa-btn-copy:hover {
    background: #0082e6;
  }

  .dpa-btn-copy--success {
    background: #059669;
  }

  .dpa-btn-copy--success:hover {
    background: #047857;
  }

  .dpa-btn-copy-format-toggle {
    background: #0d99ff;
    color: #ffffff;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.2);
    width: 22px;
    padding: 0;
    justify-content: center;
  }

  .dpa-btn-copy-format-toggle:hover {
    background: #0082e6;
  }

  .dpa-copy-menu {
    position: absolute;
    bottom: 42px;
    right: 0;
    min-width: 190px;
    background: #2c2c2c;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    box-shadow: 0 16px 40px -6px rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(16px);
    padding: 5px;
    z-index: 2147483647;
    animation: dpaFadeSlideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* 6. Minimize Button */
  .dpa-btn-minimize {
    width: 28px;
    height: 32px;
    padding: 0;
    justify-content: center;
    color: #999999;
  }

  .dpa-btn-minimize:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
  }

  /* 7. Close Button */
  .dpa-btn-close {
    width: 28px;
    height: 32px;
    padding: 0;
    justify-content: center;
    color: #999999;
  }

  .dpa-btn-close:hover {
    color: #ffffff;
    background: rgba(239, 68, 68, 0.2);
  }

  @media (max-width: 720px) {
    .dpa-btn {
      padding: 0 7px;
      gap: 4px;
      font-size: 11.5px;
    }
    .dpa-btn-device {
      max-width: 140px;
    }
    .dpa-divider {
      margin: 0 1px;
    }
  }

  @media (max-width: 640px) {
    .dpa-btn {
      padding: 0 5px;
      gap: 4px;
      font-size: 11px;
      height: 30px;
    }
    .dpa-btn-text {
      font-size: 11px;
    }
    .dpa-btn-device {
      max-width: 110px;
    }
    .dpa-btn-rotate {
      width: 24px;
      height: 30px;
    }
    .dpa-btn-copy-format-toggle {
      width: 20px;
    }
    .dpa-btn-minimize,
    .dpa-btn-close {
      width: 24px;
      height: 30px;
    }
    .dpa-divider {
      margin: 0;
      height: 14px;
    }
  }

  @media (max-width: 480px) {
    .dpa-btn {
      padding: 0 4px;
      gap: 3px;
      font-size: 10px;
    }
    .dpa-btn-text {
      font-size: 10px;
    }
    .dpa-btn-device {
      max-width: 80px;
    }
    .dpa-btn-minimize,
    .dpa-btn-close {
      width: 22px;
    }
  }

  /* ========================================================================= */
  /* MINIMIZED FAB PILL                                                        */
  /* ========================================================================= */
  .dpa-minimized-pill {
    position: fixed;
    bottom: 16px;
    right: 16px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-radius: 9999px;
    background: rgba(36, 36, 36, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #f5f5f5;
    cursor: pointer;
    pointer-events: auto;
    z-index: 2147483646;
    font-size: 12px;
    font-weight: 600;
    user-select: none;
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  }

  .dpa-minimized-pill:hover {
    background: rgba(48, 48, 48, 0.98);
    border-color: rgba(13, 153, 255, 0.4);
    transform: translateY(-2px);
  }

  .dpa-minimized-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .dpa-minimized-expand-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .dpa-minimized-expand-btn:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .dpa-minimized-close-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: #999999;
    font-size: 11px;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-minimized-close-btn:hover {
    background: rgba(239, 68, 68, 0.25);
    color: #ffffff;
    border-color: rgba(239, 68, 68, 0.4);
  }

  /* Legacy Pill fallback for backwards compatibility */
  .dpa-mode-pill {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: rgba(36, 36, 36, 0.95);
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
    border-color: #0d99ff;
    box-shadow: 0 0 0 2px rgba(13, 153, 255, 0.35), 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }

  .dpa-mode-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .dpa-mode-dot--active {
    background: #0d99ff;
    box-shadow: 0 0 8px #0d99ff;
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

  /* ========================================================================= */
  /* ANNOTATION & SETTINGS DRAWER                                              */
  /* ========================================================================= */
  .dpa-drawer {
    position: fixed;
    bottom: 68px;
    left: 50%;
    transform: translateX(-50%);
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: 480px;
    background: #2c2c2c;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    box-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 2147483645;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: auto;
    color: #f5f5f5;
    animation: dpaFadeSlideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes dpaFadeSlideUp {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .dpa-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
  }

  .dpa-drawer-tabs {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .dpa-drawer-tab {
    appearance: none;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #a3a3a3;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-drawer-tab:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
  }

  .dpa-drawer-tab--active {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #ffffff !important;
    font-weight: 600;
  }

  .dpa-drawer-tab-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 9999px;
    background: rgba(13, 153, 255, 0.2);
    color: #0d99ff;
  }

  .dpa-drawer-tab-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #0d99ff;
  }

  .dpa-drawer-close-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: #888888;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-drawer-close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .dpa-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  /* Empty state */
  .dpa-drawer-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 36px 16px;
    color: #737373;
  }

  .dpa-drawer-empty-icon {
    width: 32px;
    height: 32px;
    color: #555555;
    margin-bottom: 8px;
  }

  .dpa-drawer-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: #d4d4d4;
    margin-bottom: 4px;
  }

  .dpa-drawer-empty-desc {
    font-size: 11px;
    max-width: 280px;
    line-height: 1.4;
  }

  /* List & Cards */
  .dpa-drawer-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dpa-drawer-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 4px;
  }

  .dpa-drawer-list-count {
    font-size: 11px;
    color: #888888;
    font-weight: 500;
  }

  .dpa-btn-text-danger {
    appearance: none;
    border: none;
    background: transparent;
    color: #f43f5e;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.12s ease;
  }

  .dpa-btn-text-danger:hover {
    background: rgba(244, 63, 94, 0.1);
  }

  .dpa-annotation-card {
    background: #222222;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.12s ease, background 0.12s ease;
  }

  .dpa-annotation-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: #262626;
  }

  .dpa-annotation-card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dpa-annotation-id-badge {
    font-size: 10px;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: #0d99ff;
    color: #ffffff;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .dpa-annotation-tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #f5f5f5;
    font-weight: 600;
  }

  .dpa-annotation-fw-badge {
    font-size: 10px;
    background: rgba(13, 153, 255, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(13, 153, 255, 0.25);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .dpa-annotation-mask-badge {
    font-size: 9px;
    font-weight: 700;
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
    border: 1px solid rgba(244, 63, 94, 0.3);
    padding: 1px 5px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .dpa-annotation-instruction {
    font-size: 12px;
    color: #e5e5e5;
    line-height: 1.45;
    background: rgba(255, 255, 255, 0.03);
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .dpa-annotation-card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .dpa-annotation-selector-mono {
    font-size: 10px;
    color: #737373;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dpa-annotation-card-btns {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dpa-btn-icon {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #d4d4d4;
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 11px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .dpa-btn-icon:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .dpa-btn-icon--danger {
    color: #f43f5e;
    border-color: rgba(244, 63, 94, 0.25);
    background: rgba(244, 63, 94, 0.08);
  }

  .dpa-btn-icon--danger:hover {
    background: rgba(244, 63, 94, 0.18);
    color: #fb7185;
  }

  /* Context Tab Styles */
  .dpa-context-desc {
    font-size: 11px;
    color: #a3a3a3;
    margin-bottom: 8px;
    line-height: 1.45;
  }

  .dpa-textarea-wrap {
    margin-bottom: 10px;
  }

  .dpa-drawer-textarea {
    width: 100%;
    background: #1e1e1e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #ffffff;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.5;
    padding: 10px;
    outline: none;
    resize: vertical;
    transition: border-color 0.15s ease;
  }

  .dpa-drawer-textarea:focus {
    border-color: #0d99ff;
    box-shadow: 0 0 0 2px rgba(13, 153, 255, 0.2);
  }

  .dpa-presets-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dpa-presets-label {
    font-size: 10px;
    color: #737373;
    font-weight: 600;
  }

  .dpa-preset-chip {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #b3b3b3;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-preset-chip:hover {
    background: rgba(13, 153, 255, 0.12);
    border-color: rgba(13, 153, 255, 0.3);
    color: #0d99ff;
  }

  /* Privacy Tab Styles */
  .dpa-privacy-toggles {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }

  .dpa-toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #222222;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    user-select: none;
    transition: background 0.12s ease;
  }

  .dpa-toggle-row:hover {
    background: #262626;
  }

  .dpa-toggle-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #0d99ff;
    cursor: pointer;
    margin-top: 2px;
  }

  .dpa-toggle-title {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
  }

  .dpa-toggle-subtitle {
    font-size: 10px;
    color: #888888;
    line-height: 1.35;
    margin-top: 2px;
  }

  .dpa-custom-selectors-section {
    background: #222222;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 10px;
  }

  .dpa-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #d4d4d4;
    margin-bottom: 6px;
  }

  .dpa-add-selector-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .dpa-input-text {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #ffffff;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 6px 8px;
    outline: none;
  }

  .dpa-input-text:focus {
    border-color: #0d99ff;
  }

  .dpa-btn-primary {
    background: #0d99ff;
    color: #ffffff;
  }

  .dpa-btn-primary:hover {
    background: #0082e6;
  }

  .dpa-selector-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .dpa-selector-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    color: #cbd5e1;
  }

  .dpa-chip-remove-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: #888888;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0;
  }

  .dpa-chip-remove-btn:hover {
    color: #f43f5e;
  }

  /* ========================================================================= */
  /* FLOATING TOAST NOTIFICATION                                               */
  /* ========================================================================= */
  .dpa-toast-alert {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #2c2c2c;
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    z-index: 2147483647;
    animation: dpaToastIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes dpaToastIn {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  /* ========================================================================= */
  /* HOVER HIGHLIGHT BOX & POPUP                                               */
  /* ========================================================================= */
  .dpa-hover-box {
    position: fixed;
    border: 2px solid #0d99ff;
    background: rgba(13, 153, 255, 0.12);
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
    background: #1e1e1e;
    color: #f8fafc;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    white-space: nowrap;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(13, 153, 255, 0.5);
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
    border: 2px dashed #0d99ff;
    background: rgba(13, 153, 255, 0.06);
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
    background: #0d99ff;
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
    background: #007be5;
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
    border: 2px solid #0d99ff;
    background: rgba(13, 153, 255, 0.14);
    box-shadow: 0 0 0 3px rgba(13, 153, 255, 0.25);
    border-radius: 4px;
    pointer-events: none;
    z-index: 2147483643;
  }

  /* In-Page Annotation Popover */
  .dpa-popover {
    position: fixed;
    width: 340px;
    max-width: calc(100vw - 24px);
    background: #2c2c2c;
    color: #f5f5f5;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 20px 45px -5px rgba(0, 0, 0, 0.65), 0 8px 16px -4px rgba(0, 0, 0, 0.4);
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
    color: #ffffff;
    word-break: break-all;
  }

  .dpa-popover-selector {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: #a3a3a3;
    background: #1e1e1e;
    padding: 3px 6px;
    border-radius: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .dpa-hierarchy-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dpa-hierarchy-btn {
    flex: 1;
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #e5e5e5;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .dpa-hierarchy-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .dpa-hierarchy-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dpa-mask-toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(219, 39, 119, 0.1);
    border: 1px solid rgba(219, 39, 119, 0.25);
    font-size: 12px;
    font-weight: 500;
    color: #f472b6;
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
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #1e1e1e;
    color: #ffffff;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dpa-textarea:focus {
    border-color: #0d99ff;
    box-shadow: 0 0 0 2px rgba(13, 153, 255, 0.25);
  }

  .dpa-popover-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .dpa-btn-cancel {
    background: rgba(255, 255, 255, 0.06);
    color: #d4d4d4;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .dpa-btn-cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .dpa-btn-delete {
    background: rgba(244, 63, 94, 0.12);
    color: #fb7185;
    border-color: rgba(244, 63, 94, 0.25);
    margin-right: auto;
  }

  .dpa-btn-delete:hover {
    background: rgba(244, 63, 94, 0.22);
    color: #f43f5e;
  }

  .dpa-btn-save {
    background: #0d99ff;
    color: #ffffff;
  }

  .dpa-btn-save:hover {
    background: #0082e6;
  }
`;
