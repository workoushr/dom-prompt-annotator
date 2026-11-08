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

  it('renders StudioApp with header, canvas, timeline bar, and panels', async () => {
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

    // Canvas checks
    const artboard = container.querySelector('[data-testid="studio-artboard"]');
    expect(artboard).not.toBeNull();

    const iframe = container.querySelector('[data-testid="studio-replayed-iframe"]');
    expect(iframe).not.toBeNull();

    const ctaBtn = getReplayedElement('[data-testid="replayed-cta-button"]');
    expect(ctaBtn).not.toBeNull();
    expect(ctaBtn?.textContent).toContain('プロプランにアップグレード');

    // Panels & timeline
    expect(container.querySelector('[data-testid="studio-left-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-right-panel"]')).not.toBeNull();
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
    expect(timeDisplay?.textContent).toContain('00:00.000');

    // Click play
    await act(async () => {
      playBtn?.click();
    });

    // Fast-forward 200ms
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Check time updated
    expect(timeDisplay?.textContent).toContain('00:00.200');

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
        input.value = '新しい修正指示テキスト';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const saveBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="popover-save-btn"]'
    );
    await act(async () => {
      saveBtn?.click();
    });

    // Left panel should now contain the new annotation
    const leftPanel = container.querySelector('[data-testid="studio-left-panel"]');
    expect(leftPanel?.textContent).toContain('CTAボタンをグラデーションに変更し、ホバー演出を追加');
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

  it('supports collapsible panels to avoid overlapping replay stage (Issue 3)', async () => {
    await renderComponent();

    const leftPanel = container.querySelector('[data-testid="studio-left-panel"]');
    const rightPanel = container.querySelector('[data-testid="studio-right-panel"]');

    expect(leftPanel?.classList.contains('w-64')).toBe(true);
    expect(rightPanel?.classList.contains('w-64')).toBe(true);

    // Collapse left panel via collapse button
    const leftCollapseBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-left-panel-collapse-btn"]'
    );
    expect(leftCollapseBtn).not.toBeNull();
    await act(async () => {
      leftCollapseBtn?.click();
    });

    expect(leftPanel?.classList.contains('w-0')).toBe(true);
    // Expand tab should appear
    const leftExpandTab = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-left-panel-open-tab"]'
    );
    expect(leftExpandTab).not.toBeNull();

    // Re-expand left panel via expand tab
    await act(async () => {
      leftExpandTab?.click();
    });
    expect(leftPanel?.classList.contains('w-64')).toBe(true);

    // Collapse right panel via top header toggle
    const rightToggleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="studio-right-panel-toggle"]'
    );
    expect(rightToggleBtn).not.toBeNull();
    await act(async () => {
      rightToggleBtn?.click();
    });

    expect(rightPanel?.classList.contains('w-0')).toBe(true);

    // Re-expand right panel via right toggle button
    await act(async () => {
      rightToggleBtn?.click();
    });
    expect(rightPanel?.classList.contains('w-64')).toBe(true);
  });

  it('calculates responsive scale for the artboard stage (Issue 2)', async () => {
    await renderComponent();

    const stageWrapper = container.querySelector<HTMLElement>(
      '[data-testid="studio-stage-wrapper"]'
    );
    expect(stageWrapper).not.toBeNull();
    expect(stageWrapper?.style.transform).toContain('scale(');
  });

  it('renders localized Japanese labels unified with main page (Issue 7)', async () => {
    await renderComponent();

    const leftPanel = container.querySelector('[data-testid="studio-left-panel"]');
    expect(leftPanel?.textContent).toContain('指示一覧');
    expect(leftPanel?.textContent).toContain('前提コンテキスト');

    const rightPanel = container.querySelector('[data-testid="studio-right-panel"]');
    expect(rightPanel?.textContent).toContain('要素詳細');
    expect(rightPanel?.textContent).toContain('フレーム寸法');
  });

  it('renders timeline time display with whitespace-nowrap and starts at 00:00.000 (Issue 8)', async () => {
    await renderComponent();

    const timeDisplay = container.querySelector('[data-testid="timeline-time-display"]');
    expect(timeDisplay).not.toBeNull();
    expect(timeDisplay?.classList.contains('whitespace-nowrap')).toBe(true);
    expect(timeDisplay?.classList.contains('shrink-0')).toBe(true);
    expect(timeDisplay?.textContent).toContain('00:00.000');
  });

  it('initializes artboard dimensions matching SAMPLE_SESSION viewport 393×852 (Issue 6)', async () => {
    await renderComponent();

    const artboard = container.querySelector<HTMLElement>('[data-testid="studio-artboard"]');
    expect(artboard).not.toBeNull();
    expect(artboard?.style.width).toBe('393px');
    expect(artboard?.style.height).toBe('852px');

    const select = container.querySelector<HTMLSelectElement>('[data-testid="studio-device-select"]');
    expect(select?.value).toBe('iphone-15-pro');
  });

  it('updates both artboard width AND height when switching device presets (Issue 6)', async () => {
    await renderComponent();

    const select = container.querySelector<HTMLSelectElement>('[data-testid="studio-device-select"]');
    expect(select).not.toBeNull();

    // Select iPhone SE (375 × 667)
    await act(async () => {
      select!.value = 'iphone-se';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const artboard = container.querySelector<HTMLElement>('[data-testid="studio-artboard"]');
    expect(artboard?.style.width).toBe('375px');
    expect(artboard?.style.height).toBe('667px'); // Must NOT be hardcoded 680px!

    const rightPanel = container.querySelector('[data-testid="studio-right-panel"]');
    expect(rightPanel?.textContent).toContain('375');
    expect(rightPanel?.textContent).toContain('667');

    // Select iPad Mini (768 × 1024)
    await act(async () => {
      select!.value = 'ipad-mini';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(artboard?.style.width).toBe('768px');
    expect(artboard?.style.height).toBe('1024px');
  });

  it('synchronizes artboard dimensions and matching preset when loading session from runtime (Issue 6)', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.com/studio.html?sessionId=ipad-session') as any;

    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg: any, cb: any) => {
          if (msg.type === 'GET_RECORDING_SESSION') {
            cb({
              ok: true,
              session: {
                sessionId: 'ipad-session',
                url: 'https://example.com/app',
                title: 'iPad Session',
                createdAt: new Date().toISOString(),
                durationMs: 4000,
                viewport: { width: 768, height: 1024 },
                initialDomSnapshot: '<div>iPad content</div>',
                annotations: [],
                actionLogs: [],
              },
            });
          }
        }),
      },
    };

    await renderComponent();

    const artboard = container.querySelector<HTMLElement>('[data-testid="studio-artboard"]');
    expect(artboard?.style.width).toBe('768px');
    expect(artboard?.style.height).toBe('1024px');

    const select = container.querySelector<HTMLSelectElement>('[data-testid="studio-device-select"]');
    expect(select?.value).toBe('ipad-mini');
  });
});
