import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StudioApp } from '../StudioApp';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('StudioApp (src/studio/StudioApp.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  const initialLocation = window.location;

  afterEach(async () => {
    delete (window as any).location;
    (window as any).location = initialLocation;
    delete (globalThis as Record<string, unknown>).chrome;
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<StudioApp />);
    });
  };

  const getReplayedElement = (selector: string): HTMLElement | null => {
    const iframe = container.querySelector<HTMLIFrameElement>(
      '[data-testid="studio-replayed-iframe"]'
    );
    if (iframe?.contentDocument) {
      const el = iframe.contentDocument.querySelector(selector);
      if (el) return el as HTMLElement;
    }
    return container.querySelector(selector);
  };

  it('renders StudioApp with maximized canvas, no persistent sidebars, and toggleable AnnotationsDrawer (Issue #23)', async () => {
    await renderComponent();

    // Header checks
    const titleEl = container.querySelector('[data-testid="studio-session-title"]');
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toContain('CloudMetrics E2E Session');

    const durationEl = container.querySelector('[data-testid="studio-session-duration"]');
    expect(durationEl?.textContent).toBe('14.2s');

    const maskToggle = container.querySelector('[data-testid="studio-mask-all-text-toggle"]');
    expect(maskToggle).not.toBeNull();

    const copyBtn = container.querySelector('[data-testid="studio-copy-prompt-btn"]');
    expect(copyBtn).not.toBeNull();

    // Canvas checks - Artboard is prioritized & maximized
    const artboard = container.querySelector('[data-testid="studio-artboard"]');
    expect(artboard).not.toBeNull();

    const iframe = container.querySelector('[data-testid="studio-replayed-iframe"]');
    expect(iframe).not.toBeNull();

    const ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn).not.toBeNull();
    expect(ctaBtn?.textContent).toContain('プロプランにアップグレード');

    // Issue #23: Persistent sidebars must be removed
    expect(container.querySelector('[data-testid="studio-left-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="studio-right-panel"]')).toBeNull();

    // Drawer is closed initially
    expect(container.querySelector('[data-testid="studio-annotations-drawer"]')).toBeNull();

    // Open drawer via toggle button
    const drawerToggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-drawer-toggle-btn"]'
    );
    expect(drawerToggleBtn).not.toBeNull();

    await act(async () => {
      drawerToggleBtn?.click();
    });

    // Drawer opens and shows annotations
    const drawer = container.querySelector('[data-testid="studio-annotations-drawer"]');
    expect(drawer).not.toBeNull();
    expect(container.querySelector('[data-testid="annotation-item-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="annotation-item-2"]')).not.toBeNull();

    // Close drawer via close button
    const closeBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-drawer-close-btn"]'
    );
    await act(async () => {
      closeBtn?.click();
    });
    expect(container.querySelector('[data-testid="studio-annotations-drawer"]')).toBeNull();

    // Timeline bar is rendered
    expect(container.querySelector('[data-testid="studio-timeline-bar"]')).not.toBeNull();
  });

  it('toggles maskAllText and masks all text nodes in replayed DOM', async () => {
    await renderComponent();

    const toggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-mask-all-text-toggle"]'
    );
    const titleEl = container.querySelector('[data-testid="studio-session-title"]');

    // Initially unmasked
    let ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn?.textContent).toContain('プロプランにアップグレード');
    expect(titleEl?.textContent).toContain('CloudMetrics E2E Session');

    // Click toggle to turn ON maskAllText
    await act(async () => {
      toggleBtn?.click();
    });

    // Replayer texts must be masked with [MASKED]
    ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn?.textContent).toContain('[MASKED]');
    expect(titleEl?.textContent).toContain('[MASKED SESSION]');

    // Click toggle to turn OFF
    await act(async () => {
      toggleBtn?.click();
    });
    ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn?.textContent).toContain('プロプランにアップグレード');
  });

  it('handles playback play and pause controls', async () => {
    vi.useFakeTimers();
    await renderComponent();

    const playBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="timeline-play-pause-btn"]'
    );
    const timeDisplay = container.querySelector('[data-testid="timeline-time-display"]');
    expect(timeDisplay?.textContent).toContain('00:03.200');

    // Click play
    await act(async () => {
      playBtn?.click();
    });

    // Fast-forward 200ms
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Click pause
    await act(async () => {
      playBtn?.click();
    });

    vi.useRealTimers();
  });

  it('seeks timeline when pin markers are clicked', async () => {
    await renderComponent();

    // Click on annotation pin #1 (1200ms)
    const pin1 = container.querySelector<HTMLButtonElement>(
      '[data-testid="timeline-pin-annotation-1"]'
    );
    expect(pin1).not.toBeNull();

    await act(async () => {
      pin1?.click();
    });

    const timeDisplay = container.querySelector('[data-testid="timeline-time-display"]');
    expect(timeDisplay?.textContent).toContain('00:01.200');
  });

  it('opens inspect popover on replayed element click and saves new annotation', async () => {
    await renderComponent();

    const ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn).not.toBeNull();

    await act(async () => {
      ctaBtn?.click();
    });

    // Popover opens
    const popover = container.querySelector('[data-testid="studio-element-popover"]');
    expect(popover).not.toBeNull();

    const input = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="popover-instruction-input"]'
    );
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(input, '新しい修正指示テキスト');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const saveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="popover-save-btn"]'
    );
    await act(async () => {
      saveBtn?.click();
    });

    // Toast alert should be displayed and popover closed
    const toast = container.querySelector('[data-testid="studio-toast-alert"]');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('追加しました');
    expect(container.querySelector('[data-testid="studio-element-popover"]')).toBeNull();

    // Timeline pin marker #3 should be added
    const pin3 = container.querySelector('[data-testid="timeline-pin-annotation-3"]');
    expect(pin3).not.toBeNull();

    // Open drawer to verify the new annotation is listed
    const drawerToggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-drawer-toggle-btn"]'
    );
    await act(async () => {
      drawerToggleBtn?.click();
    });

    const newAnnItem = container.querySelector('[data-testid="annotation-item-3"]');
    expect(newAnnItem).not.toBeNull();
    expect(newAnnItem?.textContent).toContain('新しい修正指示テキスト');
  });

  it('displays skeleton ghost loader in header, artboard, and timeline while session is loading (Issue #21)', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.com/studio.html?sessionId=loading-session') as any;

    let resolveSessionCallback: ((response: any) => void) | null = null;
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, cb: any) => {
          if (msg.type === 'GET_RECORDING_SESSION') {
            resolveSessionCallback = cb;
          }
        }),
      },
    };

    await renderComponent();

    // Ghost / skeleton elements must be visible during loading
    expect(container.querySelector('[data-testid="studio-header-skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-skeleton-artboard"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-skeleton-timeline"]')).not.toBeNull();
    // Replayed iframe or sample session must not be visible yet
    expect(container.querySelector('[data-testid="studio-replayed-iframe"]')).toBeNull();

    // Resolve the session data
    await act(async () => {
      resolveSessionCallback?.({
        ok: true,
        session: {
          sessionId: 'loading-session',
          url: 'https://example.com/loaded',
          title: 'Loaded Real Session',
          createdAt: new Date().toISOString(),
          durationMs: 8000,
          initialDomSnapshot: '<div id="loaded-dom"><h1>Real App</h1></div>',
          annotations: [],
          actionLogs: [],
        },
      });
    });

    // Skeletons disappear and actual content is displayed
    expect(container.querySelector('[data-testid="studio-header-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-testid="studio-skeleton-artboard"]')).toBeNull();
    expect(container.querySelector('[data-testid="studio-skeleton-timeline"]')).toBeNull();

    const titleEl = container.querySelector('[data-testid="studio-session-title"]');
    expect(titleEl?.textContent).toContain('Loaded Real Session');
    expect(container.querySelector('[data-testid="studio-replayed-iframe"]')).not.toBeNull();
  });

  it('renders expanded width timeline bar with responsive scrubber track (Issue #24)', async () => {
    await renderComponent();

    const timelineBar = container.querySelector('[data-testid="studio-timeline-bar"]');
    expect(timelineBar).not.toBeNull();
    // Class checks: expanded width
    expect(timelineBar?.className).toContain('w-[calc(100%-48px)]');
    expect(timelineBar?.className).toContain('max-w-4xl');

    const track = container.querySelector('[data-testid="timeline-track"]');
    expect(track).not.toBeNull();
    expect(track?.className).toContain('flex-1');
  });

  it('copies AI prompt to clipboard on button click', async () => {
    await renderComponent();

    const copyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-copy-prompt-btn"]'
    );
    await act(async () => {
      copyBtn?.click();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const promptArg = (navigator.clipboard.writeText as any).mock.calls[0][0];
    expect(promptArg).toContain('# 動的UIタイムラインリプレイ修正指示');
    expect(promptArg).toContain('直前の操作トリガー');
  });

  it('renders iframe when session has initialDomSnapshot', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.com/studio.html?sessionId=test-session') as any;

    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, cb: any) => {
          if (msg.type === 'GET_RECORDING_SESSION') {
            cb({
              ok: true,
              session: {
                sessionId: 'test-session',
                url: 'https://example.com/app',
                title: 'Recorded Real Session',
                createdAt: new Date().toISOString(),
                durationMs: 5000,
                initialDomSnapshot: '<div id="app-root"><button id="real-btn">送信</button></div>',
                annotations: [],
                actionLogs: [],
              },
            });
          }
        }),
      },
    };

    await renderComponent();

    const iframe = container.querySelector('[data-testid="studio-replayed-iframe"]');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('srcDoc')).toContain('id="app-root"');
  });

  it('renders elegant empty state when initialDomSnapshot is missing', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.com/studio.html?sessionId=empty-session') as any;

    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, cb: any) => {
          if (msg.type === 'GET_RECORDING_SESSION') {
            cb({
              ok: true,
              session: {
                sessionId: 'empty-session',
                url: 'https://example.com/empty',
                title: 'Empty Snapshot Session',
                createdAt: new Date().toISOString(),
                durationMs: 3000,
                initialDomSnapshot: '',
                annotations: [],
                actionLogs: [],
              },
            });
          }
        }),
      },
    };

    await renderComponent();

    expect(container.querySelector('[data-testid="studio-empty-snapshot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-replayed-iframe"]')).toBeNull();
  });
});
