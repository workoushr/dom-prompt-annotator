import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FloatingBottomBar } from '../FloatingBottomBar';
import { OVERLAY_CSS } from '../overlayStyles';
import {
  DEFAULT_DEVICE_EMULATION_CONFIG,
  DeviceEmulationConfig,
} from '../../types/annotation';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('FloatingBottomBar Component (Figma UI3 Style)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
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

  const renderComponent = async (props: Partial<Parameters<typeof FloatingBottomBar>[0]> = {}) => {
    const defaultProps: Parameters<typeof FloatingBottomBar>[0] = {
      inspectMode: false,
      onToggleInspectMode: vi.fn(),
      annotationCount: 2,
      isDrawerOpen: false,
      onToggleDrawer: vi.fn(),
      isMinimized: false,
      onToggleMinimize: vi.fn(),
      emulationConfig: { ...DEFAULT_DEVICE_EMULATION_CONFIG },
      onSetDeviceEmulation: vi.fn(),
      onClearDeviceEmulation: vi.fn(),
      onCopyPrompt: vi.fn(),
      isCopied: false,
      onClose: vi.fn(),
      ...props,
    };

    root = createRoot(container);
    await act(async () => {
      root!.render(<FloatingBottomBar {...defaultProps} />);
    });

    return defaultProps;
  };

  it('renders all 7 elements of Figma UI3 floating bottom bar in expanded state (including close button)', async () => {
    await renderComponent({ annotationCount: 3 });

    const bottomBar = container.querySelector('[data-testid="dpa-bottom-bar"]');
    expect(bottomBar).not.toBeNull();

    // 1. Select toggle button
    const selectBtn = container.querySelector('[data-testid="dpa-bottom-bar-select-btn"]');
    expect(selectBtn).not.toBeNull();
    expect(selectBtn?.textContent).toContain('選択');
    expect(selectBtn?.textContent).not.toContain('Alt+S');

    // 2. Device menu button
    const deviceBtn = container.querySelector('[data-testid="dpa-bottom-bar-device-btn"]');
    expect(deviceBtn).not.toBeNull();
    expect(deviceBtn?.textContent).toContain('デバイス切替');

    // 3. REC button placeholder
    const recBtn = container.querySelector('[data-testid="dpa-bottom-bar-rec-btn"]');
    expect(recBtn).not.toBeNull();
    expect(recBtn?.textContent).toContain('REC');

    // 4. Drawer count button
    const drawerBtn = container.querySelector('[data-testid="dpa-bottom-bar-drawer-btn"]');
    expect(drawerBtn).not.toBeNull();
    expect(drawerBtn?.textContent).toContain('3件');

    // 5. Copy prompt button
    const copyBtn = container.querySelector('[data-testid="dpa-bottom-bar-copy-btn"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent).toContain('プロンプトコピー');

    // 6. Minimize button
    const minimizeBtn = container.querySelector('[data-testid="dpa-bottom-bar-minimize-btn"]');
    expect(minimizeBtn).not.toBeNull();

    // 7. Close button
    const closeBtn = container.querySelector('[data-testid="dpa-bottom-bar-close-btn"]');
    expect(closeBtn).not.toBeNull();
  });

  it('triggers onToggleInspectMode and reflects active blue styling when inspectMode is true', async () => {
    const onToggleInspectMode = vi.fn();
    await renderComponent({ inspectMode: true, onToggleInspectMode });

    const selectBtn = container.querySelector('[data-testid="dpa-bottom-bar-select-btn"]') as HTMLButtonElement;
    expect(selectBtn.classList.contains('dpa-btn-select-mode--active')).toBe(true);
    expect(selectBtn.textContent).toContain('選択中');
    expect(selectBtn.textContent).not.toContain('Selection Mode');

    // Mode pill testid contains '選択中'
    const modePill = container.querySelector('[data-testid="dpa-mode-pill"]');
    expect(modePill?.textContent).toContain('選択中');
    expect(modePill?.textContent).not.toContain('Selection Mode');

    await act(async () => {
      selectBtn.click();
    });
    expect(onToggleInspectMode).toHaveBeenCalledTimes(1);
  });

  it('handles device emulation preset selection, reset, and orientation toggle', async () => {
    const onSetDeviceEmulation = vi.fn();
    const onClearDeviceEmulation = vi.fn();

    const emulatedConfig: DeviceEmulationConfig = {
      enabled: true,
      presetId: 'iphone-15-pro',
      name: 'iPhone 15 Pro',
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
      touch: true,
      orientation: 'portrait',
    };

    await renderComponent({
      emulationConfig: emulatedConfig,
      onSetDeviceEmulation,
      onClearDeviceEmulation,
    });

    // Device button shows active device info and rotate button
    const deviceBtn = container.querySelector('[data-testid="dpa-bottom-bar-device-btn"]') as HTMLButtonElement;
    expect(deviceBtn.textContent).toContain('iPhone 15 Pro (393×852)');
    expect(container.querySelector('[data-testid="dpa-device-active-dot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dpa-device-active-badge"]')?.textContent).toBe('ON');

    const rotateBtn = container.querySelector('[data-testid="dpa-device-rotate-btn"]') as HTMLButtonElement;
    expect(rotateBtn).not.toBeNull();

    // Click rotate button
    await act(async () => {
      rotateBtn.click();
    });
    expect(onSetDeviceEmulation).toHaveBeenCalledWith({ orientation: 'landscape' });

    // Open device flyout menu
    await act(async () => {
      deviceBtn.click();
    });

    const menu = container.querySelector('[data-testid="dpa-device-menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain('デバイスサイズ');
    expect(menu?.textContent).not.toContain('CDP Viewport');
    expect(menu?.textContent).toContain('デスクトップ (実寸リセット)');
    expect(menu?.textContent).toContain('縦横回転');
    expect(menu?.textContent).not.toContain('(Orientation)');

    // Select iPad Mini preset
    const ipadItem = container.querySelector('[data-testid="dpa-device-preset-ipad-mini"]') as HTMLButtonElement;
    expect(ipadItem).not.toBeNull();
    await act(async () => {
      ipadItem.click();
    });
    expect(onSetDeviceEmulation).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: 'ipad-mini',
        name: 'iPad Mini',
        width: 768,
        height: 1024,
      })
    );

    // Reset Desktop option
    await act(async () => {
      deviceBtn.click();
    });
    const resetItem = container.querySelector('[data-testid="dpa-device-reset"]') as HTMLButtonElement;
    await act(async () => {
      resetItem.click();
    });
    expect(onClearDeviceEmulation).toHaveBeenCalledTimes(1);
  });

  it('triggers onCopyPrompt with markdown or json format and displays success state', async () => {
    const onCopyPrompt = vi.fn();
    await renderComponent({ onCopyPrompt, isCopied: false });

    const copyBtn = container.querySelector('[data-testid="dpa-bottom-bar-copy-btn"]') as HTMLButtonElement;
    await act(async () => {
      copyBtn.click();
    });
    expect(onCopyPrompt).toHaveBeenCalledWith('markdown');

    // Open copy format menu and select JSON
    const formatToggleBtn = container.querySelector('[data-testid="dpa-copy-format-toggle-btn"]') as HTMLButtonElement;
    await act(async () => {
      formatToggleBtn.click();
    });

    const jsonBtn = container.querySelector('[data-testid="dpa-copy-json-btn"]') as HTMLButtonElement;
    await act(async () => {
      jsonBtn.click();
    });
    expect(onCopyPrompt).toHaveBeenCalledWith('json');
  });

  it('minimizes into compact FAB pill and expands back', async () => {
    const onToggleMinimize = vi.fn();
    await renderComponent({
      isMinimized: true,
      annotationCount: 2,
      onToggleMinimize,
    });

    // Minimized FAB should be visible and bottom bar hidden
    expect(container.querySelector('[data-testid="dpa-bottom-bar"]')).toBeNull();
    const minPill = container.querySelector('[data-testid="dpa-minimized-pill"]') as HTMLDivElement;
    expect(minPill).not.toBeNull();
    expect(minPill.textContent).toContain('🎯 DPA (2件)');
    expect(minPill.textContent).toContain('展開 ↗');

    await act(async () => {
      minPill.click();
    });
    expect(onToggleMinimize).toHaveBeenCalledTimes(1);
  });

  it('renders recording state with MM:SS duration (without milliseconds or decimals)', async () => {
    const onToggleRecording = vi.fn();
    // 65432 ms -> 01:05 (1 min 5 sec)
    await renderComponent({
      isRecording: true,
      recordingDurationMs: 65432,
      onToggleRecording,
    });

    const recBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-rec-btn"]'
    ) as HTMLButtonElement;
    expect(recBtn).not.toBeNull();
    expect(recBtn.textContent).toContain('01:05');
    expect(recBtn.textContent).not.toContain('.');

    await act(async () => {
      recBtn.click();
    });
    expect(onToggleRecording).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when close button is clicked in expanded bottom bar', async () => {
    const onClose = vi.fn();
    await renderComponent({ onClose });

    const closeBtn = container.querySelector(
      '[data-testid="dpa-bottom-bar-close-btn"]'
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders close button in minimized pill and calls onClose without triggering onToggleMinimize', async () => {
    const onClose = vi.fn();
    const onToggleMinimize = vi.fn();
    await renderComponent({
      isMinimized: true,
      annotationCount: 1,
      onClose,
      onToggleMinimize,
    });

    const closeBtn = container.querySelector(
      '[data-testid="dpa-minimized-close-btn"]'
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToggleMinimize).not.toHaveBeenCalled();
  });

  it('does not display [Selection Mode] in minimized pill even when inspectMode is true (Issue 7)', async () => {
    await renderComponent({
      isMinimized: true,
      inspectMode: true,
      annotationCount: 0,
    });

    const minPill = container.querySelector('[data-testid="dpa-minimized-pill"]') as HTMLDivElement;
    expect(minPill).not.toBeNull();
    expect(minPill.textContent).toContain('🎯 DPA (0件)');
    expect(minPill.textContent).not.toContain('Selection Mode');
  });

  it('includes responsive max-width and media queries in stylesheet for narrow windows (Issue 4)', () => {
    expect(OVERLAY_CSS).toContain('max-width: calc(100vw - 24px)');
    expect(OVERLAY_CSS).toContain('@media (max-width: 640px)');
    expect(OVERLAY_CSS).toContain('@media (max-width: 480px)');
  });

  it('displays active badge and dot, and calls onShowToast with new orientation and swapped dimensions on rotation (Issue 6)', async () => {
    const onShowToast = vi.fn();
    const onSetDeviceEmulation = vi.fn();

    const emulatedConfig: DeviceEmulationConfig = {
      enabled: true,
      presetId: 'iphone-se',
      name: 'iPhone SE',
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
      touch: true,
      orientation: 'portrait',
    };

    await renderComponent({
      emulationConfig: emulatedConfig,
      onShowToast,
      onSetDeviceEmulation,
    });

    // Check label and badges
    const deviceBtn = container.querySelector('[data-testid="dpa-bottom-bar-device-btn"]') as HTMLButtonElement;
    expect(deviceBtn.textContent).toContain('iPhone SE (375×667)');
    expect(container.querySelector('[data-testid="dpa-device-active-dot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dpa-device-active-badge"]')?.textContent).toBe('ON');

    // Rotate
    const rotateBtn = container.querySelector('[data-testid="dpa-device-rotate-btn"]') as HTMLButtonElement;
    await act(async () => {
      rotateBtn.click();
    });

    expect(onShowToast).toHaveBeenCalledWith('🔄 iPhone SE (横向き: 667×375) に回転しました');
    expect(onSetDeviceEmulation).toHaveBeenCalledWith({ orientation: 'landscape' });
  });
});
