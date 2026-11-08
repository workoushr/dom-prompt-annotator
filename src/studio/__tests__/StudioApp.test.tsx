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

  afterEach(async () => {
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

    const ctaBtn = container.querySelector('[data-testid="replayed-cta-button"]');
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
    const ctaBtn = container.querySelector('[data-testid="replayed-cta-button"]');
    const titleEl = container.querySelector('[data-testid="studio-session-title"]');

    // Initially unmasked
    expect(ctaBtn?.textContent).toContain('プロプランにアップグレード');
    expect(titleEl?.textContent).toContain('CloudMetrics E2E Session');

    // Click toggle to turn ON maskAllText
    await act(async () => {
      toggleBtn?.click();
    });

    // Replayer texts must be masked with [MASKED]
    expect(ctaBtn?.textContent).toContain('[MASKED]');
    expect(titleEl?.textContent).toContain('[MASKED SESSION]');

    // Click toggle to turn OFF
    await act(async () => {
      toggleBtn?.click();
    });
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

    const ctaBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="replayed-cta-button"]'
    );
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
});
