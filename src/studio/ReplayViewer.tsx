import React, { useEffect, useRef, useMemo } from 'react';
import { Replayer } from 'rrweb';
import { processDomSnapshot } from './StudioApp';

export function maskRrwebEvents(events: any[]): any[] {
  if (!Array.isArray(events)) return [];
  return events.map((event) => {
    try {
      const cloned = JSON.parse(JSON.stringify(event));
      if (cloned.data?.node) {
        maskSnapshotNode(cloned.data.node);
      }
      if (cloned.data?.texts && Array.isArray(cloned.data.texts)) {
        for (const t of cloned.data.texts) {
          if (t && typeof t.value === 'string' && t.value.trim().length > 0) {
            t.value = '[MASKED]';
          }
        }
      }
      return cloned;
    } catch {
      return event;
    }
  });
}

function maskSnapshotNode(node: any) {
  if (!node) return;
  // Node.TEXT_NODE is 3 in DOM, rrweb snapshot also uses 3 for text
  if (node.type === 3 && typeof node.textContent === 'string' && node.textContent.trim().length > 0) {
    node.textContent = '[MASKED]';
  }
  if (Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) {
      maskSnapshotNode(child);
    }
  }
}

export interface SelectedElementData {
  selector: string;
  tagName: string;
  textContent: string;
  componentName?: string;
  computedStyles?: Record<string, string>;
  rect: DOMRect;
}

export interface ReplayViewerProps {
  events?: any[];
  initialDomSnapshot?: string;
  maskAllText: boolean;
  currentTimeMs: number;
  isPlaying: boolean;
  artboardHeight?: number;
  onSelectElement?: (data: SelectedElementData) => void;
}

export const ReplayViewer: React.FC<ReplayViewerProps> = ({
  events = [],
  initialDomSnapshot,
  maskAllText,
  currentTimeMs,
  isPlaying,
  artboardHeight = 680,
  onSelectElement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const fallbackIframeRef = useRef<HTMLIFrameElement>(null);

  const hasRrwebEvents = Array.isArray(events) && events.length >= 2;

  // Process rrweb events according to maskAllText
  const processedEvents = useMemo(() => {
    if (!hasRrwebEvents) return [];
    if (maskAllText) {
      return maskRrwebEvents(events);
    }
    return events;
  }, [events, maskAllText, hasRrwebEvents]);

  // Process fallback snapshot
  const processedSnapshot = useMemo(() => {
    return processDomSnapshot(initialDomSnapshot || '', maskAllText);
  }, [initialDomSnapshot, maskAllText]);

  // Helper to attach inspector hover/click listeners
  const attachInspector = (doc: Document) => {
    let lastHovered: HTMLElement | null = null;
    const handleMouseOver = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      if (!target || target === doc.body || target === doc.documentElement) return;
      if (lastHovered && lastHovered !== target) {
        lastHovered.classList.remove('dpa-hover-target');
      }
      target.classList.add('dpa-hover-target');
      lastHovered = target;
    };

    const handleMouseOut = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      target?.classList?.remove('dpa-hover-target');
    };

    const handleClick = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const target = ev.target as HTMLElement;
      if (!target || target === doc.body || target === doc.documentElement) return;

      const rect = target.getBoundingClientRect();
      const selector = target.id
        ? `#${target.id}`
        : target.className && typeof target.className === 'string'
        ? `${target.tagName.toLowerCase()}.${target.className.trim().split(/\s+/).join('.')}`
        : target.tagName.toLowerCase();

      const compName = target.getAttribute('data-component') || undefined;
      const win = target.ownerDocument?.defaultView || window;

      onSelectElement?.({
        selector,
        tagName: target.tagName.toLowerCase(),
        textContent: target.textContent?.trim().slice(0, 100) || '',
        componentName: compName,
        computedStyles: {
          color: win.getComputedStyle ? win.getComputedStyle(target).color : '',
          backgroundColor: win.getComputedStyle ? win.getComputedStyle(target).backgroundColor : '',
        },
        rect,
      });
    };

    doc.addEventListener('mouseover', handleMouseOver);
    doc.addEventListener('mouseout', handleMouseOut);
    doc.addEventListener('click', handleClick);

    // Inject styles
    let styleEl = doc.querySelector('style#dpa-studio-injected-styles');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'dpa-studio-injected-styles';
      (doc.head || doc.documentElement)?.appendChild(styleEl);
    }
    styleEl.textContent = `
      * {
        cursor: crosshair !important;
      }
      .dpa-hover-target {
        outline: 2px dashed #0d99ff !important;
        outline-offset: 1px !important;
      }
      ${maskAllText ? 'body * { user-select: none !important; }' : ''}
    `;

    return () => {
      doc.removeEventListener('mouseover', handleMouseOver);
      doc.removeEventListener('mouseout', handleMouseOut);
      doc.removeEventListener('click', handleClick);
    };
  };

  // Replayer initialization
  useEffect(() => {
    if (!hasRrwebEvents || !containerRef.current) return;

    if (replayerRef.current) {
      try {
        replayerRef.current.destroy();
      } catch {}
      replayerRef.current = null;
    }
    containerRef.current.innerHTML = '';

    try {
      const replayer = new Replayer(processedEvents, {
        root: containerRef.current,
        UNSAFE_replayCanvas: true,
        liveMode: false,
        mouseTail: true,
        showWarning: false,
        showDebug: false,
      });

      replayerRef.current = replayer;
      if (replayer.iframe) {
        replayer.iframe.setAttribute('data-testid', 'studio-replayed-iframe');
        replayer.iframe.className = 'w-full h-full border-none block bg-white';
        if (replayer.wrapper) {
          replayer.wrapper.style.width = '100%';
          replayer.wrapper.style.height = '100%';
        }
      }

      // Initial pause at currentTimeMs
      replayer.pause(currentTimeMs);

      // Attach inspector when document is ready
      const doc = replayer.iframe?.contentDocument || replayer.iframe?.contentWindow?.document;
      let cleanupInspector: (() => void) | undefined;
      if (doc) {
        cleanupInspector = attachInspector(doc);
      }

      return () => {
        cleanupInspector?.();
        try {
          replayer.destroy();
        } catch {}
        replayerRef.current = null;
      };
    } catch (err) {
      console.warn('[DPA Studio] Failed to initialize rrweb Replayer:', err);
    }
  }, [processedEvents, hasRrwebEvents]);

  // Synchronize play / pause / seek with Replayer
  useEffect(() => {
    const replayer = replayerRef.current;
    if (!replayer) return;

    try {
      if (isPlaying) {
        replayer.play(currentTimeMs);
      } else {
        replayer.pause(currentTimeMs);
      }
    } catch {
      // ignore
    }
  }, [isPlaying, currentTimeMs]);

  // Fallback: Synchronize static iframe document if no rrweb events
  useEffect(() => {
    if (hasRrwebEvents) return;
    const iframe = fallbackIframeRef.current;
    if (!iframe || !initialDomSnapshot) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      doc.documentElement.innerHTML = processedSnapshot;
      return attachInspector(doc);
    } catch {
      // ignore
    }
  }, [hasRrwebEvents, processedSnapshot, initialDomSnapshot, artboardHeight]);

  if (hasRrwebEvents) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-white"
        data-testid="studio-replayed-iframe-wrap"
      />
    );
  }

  if (initialDomSnapshot) {
    return (
      <div
        className="flex-1 w-full h-full bg-white overflow-hidden relative"
        data-testid="studio-replayed-iframe-wrap"
      >
        <iframe
          ref={fallbackIframeRef}
          title="Recorded DOM Snapshot Screen"
          className="w-full h-full border-none block bg-white"
          srcDoc={processedSnapshot}
          sandbox="allow-same-origin allow-scripts"
          data-testid="studio-replayed-iframe"
        />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#18181b] text-zinc-400 h-full select-none"
      data-testid="studio-empty-snapshot"
    >
      <div className="text-sm font-semibold text-zinc-200 mb-1">
        スナップショットが記録されていません
      </div>
      <div className="text-xs text-zinc-500 max-w-xs">
        録画セッションにDOMスナップショットが含まれていないか、空です。
      </div>
    </div>
  );
};
