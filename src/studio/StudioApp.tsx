import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AnnotationItem,
  DEVICE_PRESETS,
  DevicePreset,
  ElementMetadata,
  RecordingSession,
  UserActionLogEntry,
} from '../types/annotation';
import {
  formatStudioPromptMarkdown,
  formatStudioPromptJson,
  formatTimestampOffset,
} from '../utils/promptFormatter';
import { TimelineBar } from './TimelineBar';
import {
  Lock,
  Unlock,
  Copy,
  Check,
  Smartphone,
  Tablet,
  Monitor,
  Trash2,
  ExternalLink,
  Code2,
  Sparkles,
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export function processDomSnapshot(html: string, maskAllText: boolean): string {
  if (!html) return '';

  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      if (maskAllText) {
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (text.trim().length > 0) {
              node.textContent = '[MASKED]';
            }
          } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.nodeName)
          ) {
            for (let i = 0; i < node.childNodes.length; i++) {
              walk(node.childNodes[i]);
            }
          }
        };

        walk(doc.body || doc.documentElement);
      }

      // Inject studio inspection & cursor styles
      let styleEl = doc.querySelector('style#dpa-studio-injected-styles');
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = 'dpa-studio-injected-styles';
        (doc.head || doc.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = `
        * {
          cursor: crosshair !important;
        }
        .dpa-hover-target {
          outline: 2px dashed #0d99ff !important;
          outline-offset: 1px !important;
        }
        ${
          maskAllText
            ? `
          body * {
            user-select: none !important;
          }
        `
            : ''
        }
      `;

      return doc.documentElement.outerHTML;
    }
  } catch {
    // Fallback if parsing fails
  }

  return html;
}

const SAMPLE_SESSION: RecordingSession = {
  sessionId: 'sample_session_cloudmetrics',
  url: 'https://cloudmetrics.internal.io/dashboard',
  title: 'CloudMetrics E2E Session',
  createdAt: new Date().toISOString(),
  durationMs: 14200,
  viewport: { width: 393, height: 852 },
  initialDomSnapshot: `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;padding:16px;color:#0f172a;}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #e2e8f0;margin-bottom:16px;}.header-title{font-weight:700;font-size:14px;}.avatar{width:24px;height:24px;border-radius:12px;background:#4f46e5;color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;}.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);}.mrr-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;}.mrr-value{font-size:20px;font-weight:700;color:#0f172a;}.mrr-sub{font-size:11px;color:#10b981;font-weight:500;margin-top:2px;}.btn-wrap{position:relative;margin-bottom:16px;}.cta-button{width:100%;padding:10px 16px;background:#4f46e5;color:white;border:none;border-radius:8px;font-weight:500;font-size:12px;cursor:pointer;transition:background 0.15s;}.cta-button:hover{background:#4338ca;}.toast{background:#0f172a;color:white;padding:12px;border-radius:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);border:1px solid #1e293b;display:flex;gap:10px;align-items:flex-start;}.toast-icon{width:16px;height:16px;border-radius:8px;background:#10b981;color:#0f172a;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-top:2px;}.toast-title{font-weight:600;font-size:12px;}.toast-desc{font-size:10px;color:#94a3b8;margin-top:2px;}</style></head><body><div class="header"><div class="header-title">CloudMetrics</div><div class="avatar">JD</div></div><div class="card mrr-metric-card" data-component="MRRMetricCard"><div class="mrr-label">MRR (月次経常収益)</div><div class="mrr-value">$32,450</div><div class="mrr-sub">↑ 18.4% 先月比</div></div><div class="btn-wrap"><button type="button" id="upgrade-cta" class="cta-button" data-component="HeroPricingCard" data-testid="replayed-cta-button">プロプランにアップグレード</button></div><div id="replayed-dynamic-toast" class="toast toast-notification" data-component="ToastProvider" data-testid="replayed-toast"><div class="toast-icon">✓</div><div><div class="toast-title">設定を保存しました</div><div class="toast-desc">プランが正常に更新されました（一瞬で消えるUI）</div></div></div></body></html>`,
  globalInstruction: 'Tailwind CSS / React 18 準拠のモダンUIコンポーネントにリファクタリングしてください。',
  maskingConfig: {
    autoMaskPII: true,
    maskAllText: false,
    maskSelectors: ['input[type="password"]'],
    maskColor: '#FF00FF',
    visualMaskEnabled: true,
  },
  rrwebEvents: [],
  actionLogs: [
    {
      id: 'act_1',
      offsetMs: 1200,
      kind: 'click',
      targetSelector: 'button#upgrade-cta',
      targetLabel: 'プロプランにアップグレード',
      summary: 'クリック: <button> "プロプランにアップグレード"',
    },
    {
      id: 'act_2',
      offsetMs: 3200,
      kind: 'mutation_add',
      targetSelector: 'div.toast-notification',
      targetLabel: '設定を保存しました',
      summary: 'DOM要素出現: <div> "設定を保存しました"',
    },
    {
      id: 'act_3',
      offsetMs: 6000,
      kind: 'mutation_remove',
      targetSelector: 'div.toast-notification',
      summary: 'DOM要素消去: <div.toast-notification>',
    },
  ],
  annotations: [
    {
      id: 1,
      timestampMs: 1200,
      instruction: 'CTAボタンをグラデーションに変更し、ホバー演出を追加',
      maskText: false,
      createdAt: new Date().toISOString(),
      element: {
        tagName: 'button',
        id: 'upgrade-cta',
        className: 'w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg',
        selector: 'button#upgrade-cta',
        xpath: '//button[@id="upgrade-cta"]',
        attributes: { id: 'upgrade-cta' },
        textContent: 'プロプランにアップグレード',
        outerHTMLSnippet: '<button id="upgrade-cta">プロプランにアップグレード</button>',
        rect: { x: 20, y: 220, width: 353, height: 44 },
        computedStyles: {
          'background-color': 'rgb(79, 70, 229)',
          color: 'rgb(255, 255, 255)',
          'border-radius': '8px',
        },
        framework: {
          detected: 'react',
          componentName: 'HeroPricingCard',
          componentHierarchy: ['DashboardApp', 'PricingSection', 'HeroPricingCard'],
          source: { fileName: 'HeroPricingCard.tsx', lineNumber: 18 },
        },
      },
      triggerContext: [
        {
          id: 'act_prev_0',
          offsetMs: 800,
          kind: 'click',
          targetSelector: 'nav > a.tab-pricing',
          targetLabel: '料金プラン',
          summary: 'クリック: <a> "料金プラン"',
        },
      ],
    },
    {
      id: 2,
      timestampMs: 3200,
      instruction: 'トーストの表示時間を5秒に延長し、閉じるボタンを明示的に配置する',
      maskText: false,
      createdAt: new Date().toISOString(),
      element: {
        tagName: 'div',
        id: '',
        className: 'toast-notification bg-slate-900 text-white p-3 rounded-xl shadow-xl',
        selector: 'div.toast-notification',
        xpath: '//div[contains(@class, "toast-notification")]',
        attributes: { class: 'toast-notification' },
        textContent: '設定を保存しました。プランが正常に更新されました（一瞬で消えるUI）',
        outerHTMLSnippet: '<div class="toast-notification">設定を保存しました</div>',
        rect: { x: 20, y: 280, width: 353, height: 56 },
        computedStyles: {
          'background-color': 'rgb(15, 23, 42)',
          color: 'rgb(255, 255, 255)',
          'font-size': '12px',
        },
        framework: {
          detected: 'react',
          componentName: 'ToastProvider',
          componentHierarchy: ['AppRoot', 'ToastProvider'],
          source: { fileName: 'ToastProvider.tsx', lineNumber: 42 },
        },
      },
      triggerContext: [
        {
          id: 'act_1',
          offsetMs: 1200,
          kind: 'click',
          targetSelector: 'button#upgrade-cta',
          targetLabel: 'プロプランにアップグレード',
          summary: 'クリック: <button> "プロプランにアップグレード"',
        },
      ],
    },
  ],
};

export const StudioApp: React.FC = () => {
  const [session, setSession] = useState<RecordingSession>(SAMPLE_SESSION);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(() => {
    return (
      DEVICE_PRESETS.find(
        (p) =>
          p.width === SAMPLE_SESSION.viewport?.width &&
          p.height === SAMPLE_SESSION.viewport?.height
      ) ||
      DEVICE_PRESETS.find((p) => p.id === 'iphone-15-pro') ||
      DEVICE_PRESETS[1]
    );
  });
  const [artboardWidth, setArtboardWidth] = useState(
    () => SAMPLE_SESSION.viewport?.width || 393
  );
  const [artboardHeight, setArtboardHeight] = useState(
    () => SAMPLE_SESSION.viewport?.height || 852
  );
  const [maskAllText, setMaskAllText] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Canvas dimensions and auto-fit scaling
  const canvasRef = useRef<HTMLElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCanvasDimensions({ width: rect.width, height: rect.height });
          return;
        }
      }
      if (typeof window !== 'undefined') {
        const panelsWidth = (isLeftPanelOpen ? 256 : 0) + (isRightPanelOpen ? 256 : 0);
        const w = Math.max(280, (window.innerWidth || 1024) - panelsWidth);
        const h = Math.max(280, (window.innerHeight || 768) - 48);
        setCanvasDimensions({ width: w, height: h });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      const ro = new ResizeObserver(() => {
        updateSize();
      });
      ro.observe(canvasRef.current);
      return () => ro.disconnect();
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, [isLeftPanelOpen, isRightPanelOpen]);

  const scale = useMemo(() => {
    const availableW = Math.max(80, canvasDimensions.width - 48);
    const availableH = Math.max(80, canvasDimensions.height - 120);
    const scaleX = availableW / artboardWidth;
    const scaleY = availableH / (artboardHeight + 32);
    const fit = Math.min(1, scaleX, scaleY);
    return Math.max(0.1, Number(fit.toFixed(3)));
  }, [canvasDimensions, artboardWidth, artboardHeight]);

  // Inspector & Popover state
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<{
    selector: string;
    tagName: string;
    textContent: string;
    componentName?: string;
    computedStyles?: Record<string, string>;
  } | null>(null);
  const [popoverInstruction, setPopoverInstruction] = useState('');
  const [popoverPos, setPopoverPos] = useState({ top: 260, left: 40 });

  // Iframe ref & processed snapshot for DOM replay
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const processedSnapshot = useMemo(() => {
    return processDomSnapshot(session.initialDomSnapshot || '', maskAllText);
  }, [session.initialDomSnapshot, maskAllText]);

  // Synchronize iframe document and attach click inspection listener
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !session.initialDomSnapshot) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Populate document reliably in both browsers and jsdom
      doc.documentElement.innerHTML = processedSnapshot;

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

        setPopoverTarget({
          selector,
          tagName: target.tagName.toLowerCase(),
          textContent: target.textContent?.trim().slice(0, 100) || '',
          componentName: compName,
          computedStyles: {
            color: window.getComputedStyle ? window.getComputedStyle(target).color : '',
            backgroundColor: window.getComputedStyle ? window.getComputedStyle(target).backgroundColor : '',
          },
        });
        setPopoverInstruction(
          compName === 'HeroPricingCard'
            ? 'CTAボタンをグラデーションに変更し、ホバー演出を追加'
            : ''
        );
        setPopoverPos({
          top: Math.max(20, Math.min(rect.bottom + 10, artboardHeight - 200)),
          left: Math.max(20, Math.min(rect.left, 200)),
        });
      };

      doc.addEventListener('mouseover', handleMouseOver);
      doc.addEventListener('mouseout', handleMouseOut);
      doc.addEventListener('click', handleClick);

      return () => {
        doc.removeEventListener('mouseover', handleMouseOver);
        doc.removeEventListener('mouseout', handleMouseOut);
        doc.removeEventListener('click', handleClick);
      };
    } catch {
      // Ignore cross-origin error if any
    }
  }, [processedSnapshot, session.initialDomSnapshot, artboardHeight]);

  // Toast / feedback alert
  const [toastAlert, setToastAlert] = useState<string | null>(null);

  // Load session from runtime or storage if sessionId query param is present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    if (sessionId) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'GET_RECORDING_SESSION', sessionId },
          (response: { ok?: boolean; session?: RecordingSession }) => {
            if (response?.ok && response.session) {
              setSession(response.session);
              setMaskAllText(Boolean(response.session.maskingConfig?.maskAllText));
              if (response.session.viewport) {
                const vp = response.session.viewport;
                setArtboardWidth(vp.width);
                setArtboardHeight(vp.height);
                const matched =
                  DEVICE_PRESETS.find(
                    (p) => p.width === vp.width && p.height === vp.height
                  ) ||
                  DEVICE_PRESETS.find(
                    (p) => p.width === vp.height && p.height === vp.width
                  );
                if (matched) {
                  setSelectedDevice(matched);
                } else {
                  setSelectedDevice({
                    id: 'custom',
                    name: `Custom (${vp.width}×${vp.height})`,
                    width: vp.width,
                    height: vp.height,
                    deviceScaleFactor: 1,
                    mobile: vp.width < 768,
                    touch: vp.width < 768,
                  });
                }
              }
            }
          }
        );
      }
    }
  }, []);

  // Timer loop for playback
  useEffect(() => {
    let timer: number | null = null;
    if (isPlaying) {
      timer = window.setInterval(() => {
        setCurrentTimeMs((prev) => {
          if (prev >= session.durationMs) {
            setIsPlaying(false);
            return session.durationMs;
          }
          return Math.min(prev + 50, session.durationMs);
        });
      }, 50);
    }
    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [isPlaying, session.durationMs]);

  const showToast = (msg: string) => {
    setToastAlert(msg);
    setTimeout(() => {
      setToastAlert(null);
    }, 2800);
  };

  const handleToggleMaskAllText = () => {
    const nextVal = !maskAllText;
    setMaskAllText(nextVal);
    setSession((prev) => ({
      ...prev,
      maskingConfig: {
        ...prev.maskingConfig,
        maskAllText: nextVal,
      },
    }));

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_STUDIO_SESSION',
        sessionId: session.sessionId,
        patch: {
          maskingConfig: {
            ...session.maskingConfig,
            maskAllText: nextVal,
          },
        },
      });
    }

    showToast(
      nextVal
        ? '🔒 全文テキストマスクON: テキストを[MASKED]置換しました'
        : '🔓 全文テキストマスクOFF: 通常テキスト表示に戻しました'
    );
  };

  const handleCopyPrompt = async (format: 'markdown' | 'json' = 'markdown') => {
    const promptText =
      format === 'json'
        ? formatStudioPromptJson(session, { maskAllText })
        : formatStudioPromptMarkdown(session, { maskAllText });

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
        showToast(
          format === 'json'
            ? '✓ Studio JSONデータをクリップボードにコピーしました'
            : '✓ AIプロンプト (操作ログ付き) をコピーしました'
        );
      }
    } catch {
      showToast('コピーに失敗しました');
    }
  };

  const handleDeviceChange = (presetId: string) => {
    const found = DEVICE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedDevice(found);
      setArtboardWidth(found.width);
      setArtboardHeight(found.height);
    }
  };

  const handleSeek = (targetMs: number) => {
    setCurrentTimeMs(Math.max(0, Math.min(targetMs, session.durationMs)));
  };

  const handleStepTime = (deltaMs: number) => {
    handleSeek(currentTimeMs + deltaMs);
  };

  // Get recent action logs preceding the specified timestamp
  const getPrecedingActionLogs = (timestampMs: number, count = 2): UserActionLogEntry[] => {
    return session.actionLogs
      .filter((log) => log.offsetMs <= timestampMs)
      .sort((a, b) => b.offsetMs - a.offsetMs)
      .slice(0, count)
      .reverse();
  };

  // Save new annotation from popover
  const handleSavePopoverAnnotation = () => {
    if (!popoverTarget || !popoverInstruction.trim()) {
      setPopoverTarget(null);
      return;
    }

    const nextId = (session.annotations.length > 0
      ? Math.max(...session.annotations.map((a) => a.id))
      : 0) + 1;

    const precedingLogs = getPrecedingActionLogs(currentTimeMs, 2);

    const newAnnotation: AnnotationItem = {
      id: nextId,
      timestampMs: currentTimeMs,
      instruction: popoverInstruction.trim(),
      maskText: maskAllText,
      createdAt: new Date().toISOString(),
      triggerContext: precedingLogs,
      element: {
        tagName: popoverTarget.tagName,
        id: '',
        className: '',
        selector: popoverTarget.selector,
        xpath: `//${popoverTarget.tagName}`,
        attributes: {},
        textContent: popoverTarget.textContent,
        outerHTMLSnippet: `<${popoverTarget.tagName}>${popoverTarget.textContent}</${popoverTarget.tagName}>`,
        rect: { x: 20, y: 200, width: 300, height: 40 },
        computedStyles: popoverTarget.computedStyles || {
          color: 'rgb(255, 255, 255)',
        },
        framework: popoverTarget.componentName
          ? {
              detected: 'react',
              componentName: popoverTarget.componentName,
              componentHierarchy: [popoverTarget.componentName],
              source: null,
            }
          : null,
      },
    };

    const nextAnnotations = [...session.annotations, newAnnotation];
    setSession((prev) => ({ ...prev, annotations: nextAnnotations }));
    setSelectedAnnotationId(nextId);
    setPopoverTarget(null);
    setPopoverInstruction('');

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SAVE_STUDIO_ANNOTATION',
        sessionId: session.sessionId,
        annotation: newAnnotation,
      });
    }

    showToast(`✓ 指示 #${nextId} をタイムライン (${formatTimestampOffset(currentTimeMs)}) に追加しました`);
  };

  const handleDeleteAnnotation = (id: number) => {
    const nextAnnotations = session.annotations.filter((a) => a.id !== id);
    setSession((prev) => ({ ...prev, annotations: nextAnnotations }));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(nextAnnotations[0]?.id || null);
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'DELETE_STUDIO_ANNOTATION',
        sessionId: session.sessionId,
        annotationId: id,
      });
    }

    showToast(`指示 #${id} を削除しました`);
  };

  const selectedAnnotation = useMemo(() => {
    return session.annotations.find((a) => a.id === selectedAnnotationId) || null;
  }, [session.annotations, selectedAnnotationId]);

  // Dynamic toast is visible between 3.0s (3000ms) and 6.0s (6000ms) in replayed DOM
  const isToastVisible = currentTimeMs >= 3000 && currentTimeMs <= 6000;

  // Masked text resolver helper
  const displaySampleText = (text: string) => {
    if (maskAllText) {
      return '[MASKED]';
    }
    return text;
  };

  return (
    <div
      className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-white select-none overflow-hidden font-sans relative"
      data-testid="studio-app-root"
    >
      {/* ========================================================================= */}
      {/* 1. TOP DOCKED APP BAR */}
      {/* ========================================================================= */}
      <header className="h-12 w-full px-3 flex items-center justify-between shrink-0 z-40 bg-[#252525] border-b border-white/10 select-none">
        {/* Top-Left: Logo & Breadcrumbs & Left Panel Toggle */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsLeftPanelOpen((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              isLeftPanelOpen
                ? 'bg-[#1e1e1e] border-white/10 text-white'
                : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
            title={isLeftPanelOpen ? '指示一覧を閉じる' : '指示一覧を開く'}
            data-testid="studio-left-panel-toggle"
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">指示一覧</span>
            <span className="text-[10px] text-zinc-400">({session.annotations.length})</span>
          </button>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition shrink-0">
            <Sparkles className="w-4 h-4 text-[#0d99ff]" />
            <span className="text-xs font-semibold text-white tracking-tight">DPA Studio</span>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Session Title & Duration */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 min-w-0">
            <span
              className="text-white font-medium hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer transition truncate max-w-[120px] sm:max-w-[200px]"
              title={session.title}
              data-testid="studio-session-title"
            >
              {maskAllText ? '[MASKED SESSION]' : session.title}
            </span>
            <span className="text-[10px] text-zinc-600">/</span>
            <span className="text-[11px] text-zinc-400 font-mono shrink-0" data-testid="studio-session-duration">
              {(session.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Top-Right: Device Preset, Mask Toggle, Prompt Export, Right Panel Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Device Preset Selector */}
          <div className="flex items-center gap-1 bg-[#1e1e1e] px-2 py-1 rounded-lg border border-white/10 text-xs">
            {selectedDevice.mobile ? (
              <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
            ) : selectedDevice.touch ? (
              <Tablet className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <Monitor className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <select
              value={selectedDevice.id}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="bg-transparent text-[11px] text-white outline-none cursor-pointer"
              data-testid="studio-device-select"
            >
              {DEVICE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#2c2c2c]">
                  {p.name} ({p.width}px)
                </option>
              ))}
              {!DEVICE_PRESETS.some((p) => p.id === selectedDevice.id) && (
                <option value={selectedDevice.id} className="bg-[#2c2c2c]">
                  {selectedDevice.name} ({selectedDevice.width}px)
                </option>
              )}
            </select>
          </div>

          {/* Mask All Text Toggle Switch */}
          <button
            type="button"
            onClick={handleToggleMaskAllText}
            className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              maskAllText
                ? 'bg-purple-600/25 border-purple-500 text-purple-300 ring-1 ring-purple-500/50'
                : 'bg-[#1e1e1e] border-white/10 text-zinc-300 hover:text-white hover:bg-white/5'
            }`}
            data-testid="studio-mask-all-text-toggle"
            title={
              maskAllText
                ? '全文テキストマスク解除 (現在はすべてのDOMテキストが[MASKED]伏字化されています)'
                : '🔒 全文テキストマスクON (Replayer表示およびAIプロンプト/JSONの全テキスト本文を[MASKED]伏字化)'
            }
          >
            {maskAllText ? (
              <>
                <Lock className="w-3 h-3 text-purple-400" />
                <span className="font-semibold text-purple-200 hidden md:inline">全文マスク中 (maskAllText)</span>
                <span className="font-semibold text-purple-200 md:hidden">マスク中</span>
              </>
            ) : (
              <>
                <Unlock className="w-3 h-3 text-zinc-400" />
                <span className="hidden md:inline">全文テキストマスク</span>
                <span className="md:hidden">マスク</span>
              </>
            )}
          </button>

          {/* Export AI Prompt Button */}
          <button
            type="button"
            onClick={() => void handleCopyPrompt('markdown')}
            className="h-7 px-3 bg-[#0d99ff] hover:bg-[#0082e6] active:bg-[#006bbd] text-white text-[11px] font-medium rounded-lg flex items-center gap-1.5 shadow-sm transition shrink-0"
            data-testid="studio-copy-prompt-btn"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AIプロンプト出力</span>
          </button>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Right Panel Toggle Button */}
          <button
            type="button"
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              isRightPanelOpen
                ? 'bg-[#1e1e1e] border-white/10 text-white'
                : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
            title={isRightPanelOpen ? '要素詳細を閉じる' : '要素詳細を開く'}
            data-testid="studio-right-panel-toggle"
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">要素詳細</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. THREE-COLUMN WORKSPACE: LEFT PANEL | CANVAS | RIGHT PANEL */}
      {/* ========================================================================= */}
      <div className="flex-1 w-full flex flex-row min-h-0 relative overflow-hidden">
        {/* ========================================================================= */}
        {/* 3. LEFT DOCKED PANEL (指示一覧 & 操作ログ) */}
        {/* ========================================================================= */}
        <aside
          className={`h-full flex flex-col shrink-0 bg-[#2c2c2c] border-r border-white/10 transition-all duration-200 z-20 ${
            isLeftPanelOpen ? 'w-64' : 'w-0 overflow-hidden border-none pointer-events-none'
          }`}
          data-testid="studio-left-panel"
        >
          {/* Panel Header */}
          <div className="h-9 px-3 border-b border-white/10 flex items-center justify-between shrink-0">
            <span className="text-[11px] font-semibold text-white tracking-tight">指示一覧</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                {session.annotations.length}件
              </span>
              <button
                type="button"
                onClick={() => setIsLeftPanelOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/5 transition"
                title="指示一覧を閉じる"
                data-testid="studio-left-panel-collapse-btn"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tree / Card List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {session.annotations.map((ann) => {
              const isSelected = selectedAnnotationId === ann.id;
              return (
                <div
                  key={ann.id}
                  onClick={() => {
                    setSelectedAnnotationId(ann.id);
                    if (typeof ann.timestampMs === 'number') {
                      handleSeek(ann.timestampMs);
                    }
                  }}
                  className={`p-2 rounded-lg cursor-pointer transition border ${
                    isSelected
                      ? 'bg-[#0d99ff]/15 border-[#0d99ff]/40 text-white'
                      : 'hover:bg-white/5 border-transparent text-zinc-300'
                  }`}
                  data-testid={`annotation-item-${ann.id}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded bg-[#0d99ff] text-white text-[9px] font-bold flex items-center justify-center">
                        {ann.id}
                      </span>
                      <span className="font-medium text-white truncate max-w-[130px]">
                        {ann.element.selector}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {typeof ann.timestampMs === 'number' && (
                        <span className="text-[10px] text-amber-400 font-mono">
                          {formatTimestampOffset(ann.timestampMs)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(ann.id);
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-0.5"
                        title="削除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-300 pl-5 line-clamp-2 mt-0.5">
                    {ann.instruction}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Footer: Global Context */}
          <div className="p-2.5 border-t border-white/10 bg-[#222222]/50">
            <div className="text-[10px] font-medium text-zinc-400 mb-1">前提コンテキスト</div>
            <input
              type="text"
              className="w-full h-6 bg-[#1e1e1e] border border-white/10 rounded px-2 text-[10px] text-white focus:outline-none focus:border-[#0d99ff]"
              value={session.globalInstruction || ''}
              onChange={(e) =>
                setSession((prev) => ({ ...prev, globalInstruction: e.target.value }))
              }
              placeholder="ページ全体の前提..."
              data-testid="studio-global-instruction-input"
            />
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* 4. CENTER CANVAS & REPLAYED DOM PREVIEW */}
        {/* ========================================================================= */}
        <main
          ref={canvasRef}
          className="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col items-center justify-center p-6 bg-[#1e1e1e]"
          data-testid="studio-canvas-main"
        >
          {/* Canvas dot background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* Floating Expand Tab Buttons when panels are collapsed */}
          {!isLeftPanelOpen && (
            <button
              type="button"
              onClick={() => setIsLeftPanelOpen(true)}
              className="absolute top-3 left-3 z-30 h-8 px-2.5 bg-[#2c2c2c] hover:bg-[#383838] border border-white/10 rounded-lg text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 shadow-lg backdrop-blur-md transition"
              title="指示一覧を展開"
              data-testid="studio-left-panel-open-tab"
            >
              <PanelLeft className="w-3.5 h-3.5 text-[#0d99ff]" />
              <span>指示一覧 ({session.annotations.length})</span>
            </button>
          )}

          {!isRightPanelOpen && (
            <button
              type="button"
              onClick={() => setIsRightPanelOpen(true)}
              className="absolute top-3 right-3 z-30 h-8 px-2.5 bg-[#2c2c2c] hover:bg-[#383838] border border-white/10 rounded-lg text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 shadow-lg backdrop-blur-md transition"
              title="要素詳細を展開"
              data-testid="studio-right-panel-open-tab"
            >
              <PanelRight className="w-3.5 h-3.5 text-[#0d99ff]" />
              <span>要素詳細</span>
            </button>
          )}

          {/* ARTBOARD SCALING WRAPPER */}
          <div
            className="relative transition-transform duration-150 origin-center flex items-center justify-center"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              width: `${artboardWidth}px`,
              height: `${artboardHeight}px`,
              marginBottom: '32px',
            }}
            data-testid="studio-stage-wrapper"
          >
            {/* Floating Frame Label */}
            <div className="absolute -top-6 left-0 right-0 flex items-center justify-between select-none pointer-events-none">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-zinc-400">{selectedDevice.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {artboardWidth} × {artboardHeight}
                </span>
                <span className="text-[10px] text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                  {Math.round(scale * 100)}%
                </span>
              </div>
              {maskAllText && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                  🔒 MASKED
                </span>
              )}
            </div>

            {/* Artboard Frame Box with Figma Blue Outline */}
            <div
              className="w-full h-full bg-white rounded-[24px] overflow-hidden relative flex flex-col shadow-2xl ring-2 ring-[#0d99ff]"
              style={{ width: `${artboardWidth}px`, height: `${artboardHeight}px` }}
              data-testid="studio-artboard"
            >
              {/* Phone Notch / Island */}
              {selectedDevice.mobile && (
                <div className="h-6 bg-slate-900 flex items-center justify-between px-6 text-slate-400 text-[10px] font-mono select-none shrink-0">
                  <span>9:41</span>
                  <div className="w-16 h-3.5 bg-black rounded-full" />
                  <span>5G</span>
                </div>
              )}

              {/* REPLAYED WEB APP CONTENT */}
              {session.initialDomSnapshot ? (
                <div
                  className="flex-1 bg-white overflow-hidden relative"
                  data-testid="studio-replayed-iframe-wrap"
                >
                  <iframe
                    ref={iframeRef}
                    title="Recorded DOM Snapshot Screen"
                    className="w-full h-full border-none block bg-white"
                    srcDoc={processedSnapshot}
                    sandbox="allow-same-origin allow-scripts"
                    data-testid="studio-replayed-iframe"
                  />
                </div>
              ) : (
                <div
                  className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#18181b] text-zinc-400 h-full select-none"
                  data-testid="studio-empty-snapshot"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3 text-zinc-300">
                    <Code2 className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-200 mb-1">
                    スナップショットが記録されていません
                  </div>
                  <div className="text-xs text-zinc-500 max-w-xs">
                    録画セッションにDOMスナップショットが含まれていないか、空です。
                  </div>
                </div>
              )}
            </div>

            {/* IN-CANVAS FIGMA POPOVER (Inspect Card anchored to target) */}
            {popoverTarget && (
              <div
                className="absolute z-50 bg-[#2c2c2c] border border-white/10 rounded-xl shadow-2xl p-3 w-[300px] text-white backdrop-blur-md"
                style={{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }}
                data-testid="studio-element-popover"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="px-1.5 py-0.5 rounded bg-[#0d99ff]/20 text-[#0d99ff] font-mono text-[10px] font-medium truncate max-w-[220px]">
                    {popoverTarget.selector}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPopoverTarget(null)}
                    className="text-zinc-400 hover:text-white p-0.5 rounded"
                  >
                    ✕
                  </button>
                </div>

                {popoverTarget.componentName && (
                  <div className="text-[10px] text-emerald-400 mb-2 font-mono">
                    React: {popoverTarget.componentName}
                  </div>
                )}

                <div className="space-y-1 mb-2.5">
                  <label className="text-[10px] font-medium text-zinc-300">AIへの修正指示:</label>
                  <textarea
                    value={popoverInstruction}
                    onChange={(e) => setPopoverInstruction(e.target.value)}
                    rows={2}
                    className="w-full bg-[#1e1e1e] border border-white/10 rounded-md p-1.5 text-xs text-white focus:outline-none focus:border-[#0d99ff] resize-none"
                    placeholder="修正指示を入力..."
                    autoFocus
                    data-testid="popover-instruction-input"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    @{formatTimestampOffset(currentTimeMs)}
                  </span>
                  <button
                    type="button"
                    onClick={handleSavePopoverAnnotation}
                    className="px-2.5 py-1 bg-[#0d99ff] hover:bg-[#0082e6] text-white text-[10px] font-medium rounded-md shadow-sm transition"
                    data-testid="popover-save-btn"
                  >
                    保存 (Enter)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 5. FIGMA UI3 FLOATING BOTTOM TOOLBAR (Scrubber & Markers) */}
          {/* ========================================================================= */}
          <TimelineBar
            currentTimeMs={currentTimeMs}
            durationMs={session.durationMs}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onSeek={handleSeek}
            onStepTime={handleStepTime}
            actionLogs={session.actionLogs}
            annotations={session.annotations}
          />
        </main>

        {/* ========================================================================= */}
        {/* 6. RIGHT DOCKED PANEL (要素詳細 & プロパティ) */}
        {/* ========================================================================= */}
        <aside
          className={`h-full flex flex-col shrink-0 bg-[#2c2c2c] border-l border-white/10 transition-all duration-200 z-20 ${
            isRightPanelOpen ? 'w-64' : 'w-0 overflow-hidden border-none pointer-events-none'
          }`}
          data-testid="studio-right-panel"
        >
          {/* Panel Header */}
          <div className="h-9 px-2 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex-1 grid grid-cols-2 bg-[#1e1e1e] p-0.5 rounded-md border border-white/10 text-[10px] font-medium mr-1.5">
              <button className="py-0.5 rounded bg-[#2c2c2c] text-white shadow-sm">要素詳細</button>
              <button
                onClick={() => void handleCopyPrompt('json')}
                className="py-0.5 text-zinc-400 hover:text-white"
              >
                JSON
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsRightPanelOpen(false)}
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/5 transition"
              title="要素詳細を閉じる"
              data-testid="studio-right-panel-collapse-btn"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Inspector Property Rows */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs">
            {/* Frame Dimensions */}
            <div>
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                フレーム寸法
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center bg-[#1e1e1e] border border-white/10 rounded px-2 h-7 text-[11px]">
                  <span className="text-zinc-500 mr-1.5 text-[10px]">W</span>
                  <span className="font-mono">{artboardWidth}</span>
                </div>
                <div className="flex items-center bg-[#1e1e1e] border border-white/10 rounded px-2 h-7 text-[11px]">
                  <span className="text-zinc-500 mr-1.5 text-[10px]">H</span>
                  <span className="font-mono">{artboardHeight}</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/10" />

            {/* Selected Element Specs */}
            {selectedAnnotation ? (
              <div>
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  選択中の要素 (#{selectedAnnotation.id})
                </div>
                <div className="space-y-1.5">
                  <div className="bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-indigo-300 break-all">
                    {selectedAnnotation.element.selector}
                  </div>
                  {selectedAnnotation.element.framework?.componentName && (
                    <div className="bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-emerald-400">
                      React: {selectedAnnotation.element.framework.componentName}
                    </div>
                  )}
                  {selectedAnnotation.element.textContent && (
                    <div className="bg-[#1e1e1e] border border-white/10 rounded px-2 py-1 text-[10px] text-zinc-300 line-clamp-2">
                      テキスト: {displaySampleText(selectedAnnotation.element.textContent)}
                    </div>
                  )}
                </div>

                {/* Trigger Action Context */}
                {selectedAnnotation.triggerContext && selectedAnnotation.triggerContext.length > 0 && (
                  <div className="mt-2.5">
                    <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                      直前の操作トリガー
                    </div>
                    <div className="space-y-1">
                      {selectedAnnotation.triggerContext.map((trig) => (
                        <div
                          key={trig.id}
                          className="bg-[#1e1e1e] border border-white/10 rounded p-1.5 text-[10px]"
                        >
                          <span className="text-zinc-400 font-mono">
                            [{formatTimestampOffset(trig.offsetMs)}]{' '}
                          </span>
                          <span className="text-indigo-300 font-medium">{trig.kind}: </span>
                          <span className="text-zinc-200">
                            {maskAllText ? '[MASKED]' : trig.targetLabel || trig.targetSelector}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-zinc-500 text-[10px]">要素が選択されていません</div>
            )}

            <div className="h-px bg-white/10" />

            {/* Prompt Preview Snippet */}
            <div>
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                マークダウン出力プレビュー
              </div>
              <div className="bg-[#1e1e1e] p-2 rounded-lg border border-white/10 text-[9px] font-mono text-zinc-300 leading-relaxed select-text max-h-36 overflow-y-auto">
                {selectedAnnotation ? (
                  <>
                    <div>### 🎯 指示 #{selectedAnnotation.id}</div>
                    <div>- Target: `{selectedAnnotation.element.selector}`</div>
                    <div>- Action: {selectedAnnotation.instruction}</div>
                    {maskAllText && <div className="text-purple-400">- Masking: [MASKED ALL TEXT]</div>}
                  </>
                ) : (
                  <div>指示を選択してください</div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Toast Alert */}
      {toastAlert && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#2c2c2c] border border-emerald-500/40 text-white px-4 py-2 rounded-xl text-xs font-medium shadow-2xl transition-all duration-200 flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-2"
          data-testid="studio-toast-alert"
        >
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastAlert}</span>
        </div>
      )}
    </div>
  );
};
