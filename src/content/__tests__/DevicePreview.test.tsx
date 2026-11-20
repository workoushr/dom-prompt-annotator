import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevicePreview } from '../DevicePreview';
import { DeviceEmulationConfig } from '../../types/annotation';

// Enable React 18 act environment.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const config: DeviceEmulationConfig = {
  enabled: true,
  presetId: 'iphone-14',
  name: 'iPhone 14',
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
  touch: true,
  orientation: 'portrait',
};

describe('DevicePreview cross-origin resilience (src/content/DevicePreview.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    document.body.innerHTML = '';
  });

  const renderPreview = () => {
    root = createRoot(container);
    act(() => {
      root!.render(
        <DevicePreview
          config={config}
          onClose={vi.fn()}
          onMetricsChange={vi.fn()}
        />
      );
    });
    const iframe = container.querySelector(
      '[data-testid="dpa-device-preview-iframe"]'
    ) as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    return iframe;
  };

  it('shows the unavailable hint and keeps the bar when contentDocument becomes cross-origin', () => {
    const iframe = renderPreview();

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get() {
        throw new DOMException('Blocked a frame with origin', 'SecurityError');
      },
    });

    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });

    expect(
      container.querySelector('[data-testid="dpa-device-preview"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dpa-device-preview-hint"]')
    ).not.toBeNull();
  });

  it('swallows SecurityError while detaching listeners from a now cross-origin document on unmount', () => {
    const iframe = renderPreview();

    const doc = {
      body: {},
      location: { href: 'https://preview.example/app' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(() => {
        throw new DOMException('Access denied', 'SecurityError');
      }),
      defaultView: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(() => {
          throw new DOMException('Access denied', 'SecurityError');
        }),
      },
    };

    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get: () => doc,
    });

    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });

    expect(
      container.querySelector('[data-testid="dpa-device-preview-hint"]')
    ).toBeNull();

    expect(() => {
      act(() => root!.unmount());
    }).not.toThrow();
    // Prevent afterEach from unmounting a second time.
    root = null;
  });
});
