import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DeviceEmulationConfig } from '../types/annotation';
import { injectMainWorldBridgeScript } from './mainWorldInjection';

export interface PreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreviewMetrics {
  /** Same-origin iframe document when interactive, else null. */
  doc: Document | null;
  /** Visual scale applied to the raw preset size. */
  scale: number;
  /** On-screen (scaled) iframe rect in parent viewport coordinates. */
  rect: PreviewRect;
}

export interface DevicePreviewProps {
  config: DeviceEmulationConfig;
  onClose: () => void;
  onMetricsChange: (metrics: PreviewMetrics | null) => void;
}

type LoadStatus = 'pending' | 'ready' | 'unavailable';

const PREVIEW_MARGIN_X = 24;
const PREVIEW_TOP_SPACE = 56;
const BOTTOM_BAR_SPACE = 72;

/**
 * Computes the visual scale that fits the raw device preset above the bottom bar.
 */
export function computePreviewScale(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  if (width <= 0 || height <= 0) {
    return 0.05;
  }
  const availableWidth = Math.max(1, viewportWidth - PREVIEW_MARGIN_X);
  const availableHeight = Math.max(
    1,
    viewportHeight - PREVIEW_TOP_SPACE - BOTTOM_BAR_SPACE
  );
  return Math.max(
    0.05,
    Math.min(1, availableWidth / width, availableHeight / height)
  );
}

/**
 * Renders a same-origin iframe preview of the current page at a device preset
 * size. The iframe is visually scaled with a CSS transform so the fixed bottom
 * bar never moves; the backdrop is purely an overlay.
 */
export const DevicePreview: React.FC<DevicePreviewProps> = ({
  config,
  onClose,
  onMetricsChange,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('pending');
  const [metricsTick, setMetricsTick] = useState(0);
  const [viewportTick, setViewportTick] = useState(0);

  const scale = computePreviewScale(
    config.width,
    config.height,
    typeof window !== 'undefined' ? window.innerWidth : 1024,
    typeof window !== 'undefined' ? window.innerHeight : 768
  );

  const reportMetrics = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      onMetricsChange(null);
      return;
    }
    const r = iframe.getBoundingClientRect();
    onMetricsChange({
      doc: previewDoc,
      scale,
      rect: {
        left: r.left || 0,
        top: r.top || 0,
        width: r.width || config.width * scale,
        height: r.height || config.height * scale,
      },
    });
  }, [config.height, config.width, onMetricsChange, previewDoc, scale]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let doc: Document | null = null;
    try {
      const candidate = iframe.contentDocument;
      if (candidate && candidate.body) {
        let href = '';
        try {
          href = candidate.location?.href ?? '';
        } catch {
          href = '';
        }
        if (href && href !== 'about:blank') {
          doc = candidate;
        }
      }
    } catch {
      doc = null;
    }

    if (doc) {
      injectMainWorldBridgeScript(doc);
      setPreviewDoc(doc);
      setLoadStatus('ready');
    } else {
      setPreviewDoc(null);
      setLoadStatus('unavailable');
    }
    setMetricsTick((tick) => tick + 1);
  }, []);

  const handleIframeError = useCallback(() => {
    setPreviewDoc(null);
    setLoadStatus('unavailable');
    setMetricsTick((tick) => tick + 1);
  }, []);

  // Report metrics whenever scale, document, or layout changes.
  useLayoutEffect(() => {
    reportMetrics();
  }, [reportMetrics, metricsTick, viewportTick]);

  // Recompute placement on parent viewport changes.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => setViewportTick((tick) => tick + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track scrolling/resizing inside the preview document.
  useEffect(() => {
    if (!previewDoc) {
      return;
    }
    const handleChange = () => setMetricsTick((tick) => tick + 1);
    previewDoc.addEventListener('scroll', handleChange, true);
    const view = previewDoc.defaultView;
    view?.addEventListener('resize', handleChange);
    return () => {
      previewDoc.removeEventListener('scroll', handleChange, true);
      view?.removeEventListener('resize', handleChange);
    };
  }, [previewDoc]);

  // Clear preview state for the parent when the preview unmounts.
  useEffect(() => {
    return () => onMetricsChange(null);
  }, [onMetricsChange]);

  const scaledWidth = config.width * scale;
  const scaledHeight = config.height * scale;
  const isInteractive = loadStatus === 'ready' && previewDoc !== null;

  return (
    <div
      className="dpa-device-preview-backdrop"
      data-testid="dpa-device-preview"
      onClick={onClose}
    >
      <div
        className="dpa-device-preview-label"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="dpa-device-preview-label-name">{config.name}</span>
        <span className="dpa-device-preview-label-dim">
          {config.width} × {config.height}
        </span>
        <button
          type="button"
          className="dpa-device-preview-close"
          data-testid="dpa-device-preview-close"
          onClick={onClose}
          aria-label="プレビューを閉じる"
          title="プレビューを閉じる"
        >
          ✕
        </button>
      </div>

      <div
        className="dpa-device-preview-frame"
        style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          ref={iframeRef}
          className="dpa-device-preview-iframe"
          data-testid="dpa-device-preview-iframe"
          title={`${config.name} preview`}
          src={typeof window !== 'undefined' ? window.location.href : 'about:blank'}
          width={config.width}
          height={config.height}
          style={{
            width: `${config.width}px`,
            height: `${config.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: isInteractive ? 'auto' : 'none',
          }}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
        {loadStatus === 'unavailable' && (
          <div
            className="dpa-device-preview-hint"
            data-testid="dpa-device-preview-hint"
          >
            このページはプレビュー内で操作できません（同一オリジン以外＝クロスオリジン、または iframe 埋め込みが拒否されています）。
          </div>
        )}
      </div>
    </div>
  );
};
