import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Layers,
  X,
  Loader2,
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
  const [currentTimeMs, setCurrentTimeMs] = useState(3200);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(
    DEVICE_PRESETS.find((p) => p.id === 'iphone-15-pro') || DEVICE_PRESETS[1]
  );
  const [artboardWidth, setArtboardWidth] = useState(393);
  const [artboardHeight, setArtboardHeight] = useState(680);
  const [maskAllText, setMaskAllText] = useState(false);

  // Loading state (prevents SAMPLE_SESSION ghost display when loading actual session)
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return Boolean(urlParams.get('sessionId'));
    }
    return false;
  });

  // Drawer state for replacing persistent sidebars
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Inspector & Popover state
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(2);
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

  // Robust iframe document synchronization and inspection event listener binding
  const bindIframeListeners = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !session.initialDomSnapshot) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Synchronize processedSnapshot reliably across both browsers and jsdom
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

        // Clamping popover coordinates so it never overflows the artboard boundaries
        const notchOffset = selectedDevice.mobile ? 24 : 0;
        const popoverWidth = 300;
        const popoverHeight = 180;
        const rawTop = notchOffset + rect.bottom + 8;
        const rawLeft = rect.left;

        const clampedTop =
          rawTop + popoverHeight > artboardHeight
            ? Math.max(notchOffset + 8, notchOffset + rect.top - popoverHeight - 8)
            : rawTop;

        const clampedLeft = Math.max(
          12,
          Math.min(rawLeft, Math.max(12, artboardWidth - popoverWidth - 12))
        );

        setPopoverPos({
          top: clampedTop,
          left: clampedLeft,
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
  }, [processedSnapshot, session.initialDomSnapshot, selectedDevice.mobile, artboardWidth, artboardHeight]);

  // Synchronize iframe listeners on snapshot changes
  useEffect(() => {
    const cleanup = bindIframeListeners();
    return () => {
      cleanup?.();
    };
  }, [bindIframeListeners]);

  // Toast / feedback alert
  const [toastAlert, setToastAlert] = useState<string | null>(null);

  // Load session from runtime or storage if sessionId query param is present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    if (sessionId) {
      setIsLoading(true);
      let didRespond = false;

      // Timeout fallback in case background service worker does not respond
      const timer = setTimeout(() => {
        if (!didRespond) {
          setIsLoading(false);
        }
      }, 3000);

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'GET_RECORDING_SESSION', sessionId },
          (response: { ok?: boolean; session?: RecordingSession }) => {
            didRespond = true;
            clearTimeout(timer);
            if (response?.ok && response.session) {
              setSession(response.session);
              setMaskAllText(Boolean(response.session.maskingConfig?.maskAllText));
              if (response.session.viewport) {
                setArtboardWidth(response.session.viewport.width);
              }
            }
            setIsLoading(false);
          }
        );
      } else {
        clearTimeout(timer);
        setIsLoading(false);
      }

      return () => {
        clearTimeout(timer);
      };
    } else {
      setIsLoading(false);
    }
  }, []);

  // Performance-optimized playback loop via requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTime;
      if (delta >= 50) {
        lastTime = now - (delta % 50);
        setCurrentTimeMs((prev) => {
          if (prev >= session.durationMs) {
            setIsPlaying(false);
            return session.durationMs;
          }
          return Math.min(prev + delta, session.durationMs);
        });
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animationFrameId);
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
      setArtboardHeight(found.width > 700 ? 680 : 680);
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
      {/* 1. FIGMA UI3 TOP FLOATING APP BAR */}
      {/* ========================================================================= */}
      <header className="absolute top-3 left-3 right-3 h-11 flex items-center justify-between z-40 pointer-events-none">
        {/* Top-Left Island: Logo & Breadcrumbs */}
        <div className="bg-[#2c2c2c] border border-white/10 rounded-[14px] shadow-xl px-3 h-11 flex items-center gap-2.5 pointer-events-auto backdrop-blur-md">
          <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition">
            <Sparkles className="w-4 h-4 text-[#0d99ff]" />
            <span className="text-xs font-semibold text-white tracking-tight">DPA Studio</span>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Session Title & Duration (Skeleton during session loading) */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400" data-testid="studio-header-skeleton">
              <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
              <span className="text-[10px] text-zinc-600">/</span>
              <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className="text-white font-medium hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer transition truncate max-w-[200px]"
                title={session.title}
                data-testid="studio-session-title"
              >
                {maskAllText ? '[MASKED SESSION]' : session.title}
              </span>
              <span className="text-[10px] text-zinc-600">/</span>
              <span className="text-[11px] text-zinc-400 font-mono" data-testid="studio-session-duration">
                {(session.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>

        {/* Top-Right Island: Drawer Toggle, maskAllText Toggle, Device Preset, Prompt Export */}
        <div className="bg-[#2c2c2c] border border-white/10 rounded-[14px] shadow-xl px-3 h-11 flex items-center gap-2 pointer-events-auto backdrop-blur-md">
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
            </select>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          {/* ★ [🔒 全文テキストマスク (maskAllText)] Toggle Switch */}
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
                <span className="font-semibold text-purple-200">全文マスク中 (maskAllText)</span>
              </>
            ) : (
              <>
                <Unlock className="w-3 h-3 text-zinc-400" />
                <span>全文テキストマスク</span>
              </>
            )}
          </button>

          <div className="h-3.5 w-px bg-white/10" />

          {/* 🎯 Annotations Drawer Toggle Button (Replaces sidebars, opens slide-over drawer) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              isDrawerOpen
                ? 'bg-[#0d99ff] border-[#0d99ff] text-white'
                : 'bg-[#1e1e1e] border-white/10 text-zinc-300 hover:text-white hover:bg-white/5'
            }`}
            data-testid="studio-drawer-toggle-btn"
            title="指示（アノテーション）一覧・プロパティドロワーを開閉"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>🎯 指示一覧</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isDrawerOpen ? 'bg-white/25 text-white' : 'bg-white/10 text-zinc-300'
              }`}
              data-testid="studio-drawer-count-badge"
            >
              {session.annotations.length}
            </span>
          </button>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Export AI Prompt Button */}
          <button
            type="button"
            onClick={() => void handleCopyPrompt('markdown')}
            className="h-7 px-3 bg-[#0d99ff] hover:bg-[#0082e6] active:bg-[#006bbd] text-white text-[11px] font-medium rounded-lg flex items-center gap-1.5 shadow-sm transition"
            data-testid="studio-copy-prompt-btn"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>AIプロンプト出力</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. INFINITE CANVAS & REPLAYED DOM PREVIEW */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-12 bg-[#1e1e1e]">
        {/* Figma Canvas dot background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* ARTBOARD CONTAINER */}
        <div className="relative" style={{ marginTop: '-20px' }}>
          {/* Floating Frame Label */}
          <div className="absolute -top-6 left-0 flex items-center gap-2 select-none pointer-events-none">
            <span className="text-[11px] font-medium text-zinc-400">{selectedDevice.name}</span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {artboardWidth} × {artboardHeight}
            </span>
            {maskAllText && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                🔒 MASKED
              </span>
            )}
          </div>

          {/* Artboard Frame Box with Figma Blue Outline */}
          <div
            className="bg-white rounded-[24px] overflow-hidden relative flex flex-col shadow-2xl ring-2 ring-[#0d99ff]"
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

            {/* REPLAYED WEB APP CONTENT OR SKELETON LOADER */}
            {isLoading ? (
              <div
                className="flex-1 flex flex-col bg-[#18181b] p-6 justify-between animate-pulse select-none text-zinc-400"
                data-testid="studio-skeleton-artboard"
              >
                <div className="space-y-4">
                  {/* Skeleton Header */}
                  <div className="flex justify-between items-center pb-3 border-b border-white/5">
                    <div className="h-4 w-28 bg-white/10 rounded" />
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                  </div>
                  {/* Skeleton Card */}
                  <div className="p-4 rounded-xl border border-white/5 bg-white/5 space-y-2.5">
                    <div className="h-3 w-20 bg-white/10 rounded" />
                    <div className="h-6 w-36 bg-white/15 rounded" />
                    <div className="h-3 w-24 bg-white/10 rounded" />
                  </div>
                  {/* Skeleton Action CTA */}
                  <div className="h-10 w-full bg-white/10 rounded-lg" />
                </div>
                {/* Centered Loading Feedback */}
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0d99ff]" />
                  <span>セッションデータを読み込み中...</span>
                </div>
              </div>
            ) : session.initialDomSnapshot ? (
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
                  onLoad={bindIframeListeners}
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
      </main>

      {/* ========================================================================= */}
      {/* 3. SLIDE-OVER ANNOTATIONS & INSPECTOR DRAWER (Figma UI3 Style)           */}
      {/* ========================================================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end select-none">
          {/* Dimmed backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
            data-testid="studio-drawer-backdrop"
          />

          {/* Drawer content */}
          <div
            className="relative w-80 sm:w-96 h-full bg-[#242424] border-l border-white/10 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200"
            data-testid="studio-annotations-drawer"
          >
            {/* Drawer Header */}
            <div className="h-12 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#2c2c2c]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0d99ff]" />
                <span className="text-xs font-semibold text-white tracking-tight">
                  指示一覧 (Annotations)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                  {session.annotations.length} items
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition"
                data-testid="studio-drawer-close-btn"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body: Annotations List & Selected Details */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                タイムライン指示リスト
              </div>

              {session.annotations.length === 0 ? (
                <div className="p-6 text-center text-zinc-500 text-xs bg-[#1e1e1e] rounded-xl border border-white/5">
                  指示がありません。画面上のDOM要素をクリックして指示を追加できます。
                </div>
              ) : (
                session.annotations.map((ann) => {
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
                      className={`p-2.5 rounded-xl cursor-pointer transition border ${
                        isSelected
                          ? 'bg-[#0d99ff]/15 border-[#0d99ff]/40 text-white'
                          : 'bg-[#1e1e1e]/60 hover:bg-white/5 border-white/5 text-zinc-300'
                      }`}
                      data-testid={`annotation-item-${ann.id}`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[#0d99ff] text-white text-[9px] font-bold flex items-center justify-center">
                            {ann.id}
                          </span>
                          <span className="font-mono text-zinc-200 truncate max-w-[150px]">
                            {ann.element.selector}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
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
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-white/10 transition"
                            title="削除"
                            data-testid={`delete-annotation-btn-${ann.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-300 pl-5 leading-relaxed">
                        {ann.instruction}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Inspector details for selected annotation */}
              {selectedAnnotation && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-2.5">
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                    選択中の詳細 (#{selectedAnnotation.id})
                  </div>
                  <div className="bg-[#1e1e1e] p-2.5 rounded-xl border border-white/10 space-y-2 text-xs">
                    <div>
                      <div className="text-[9px] text-zinc-400 uppercase font-semibold mb-0.5">Selector</div>
                      <div className="font-mono text-[10px] text-indigo-300 break-all bg-black/20 p-1.5 rounded">
                        {selectedAnnotation.element.selector}
                      </div>
                    </div>
                    {selectedAnnotation.element.framework?.componentName && (
                      <div>
                        <div className="text-[9px] text-zinc-400 uppercase font-semibold mb-0.5">React Component</div>
                        <div className="text-[10px] text-emerald-400 font-mono bg-black/20 p-1.5 rounded">
                          {selectedAnnotation.element.framework.componentName}
                        </div>
                      </div>
                    )}
                    {selectedAnnotation.element.textContent && (
                      <div>
                        <div className="text-[9px] text-zinc-400 uppercase font-semibold mb-0.5">Element Text</div>
                        <div className="text-[10px] text-zinc-300 line-clamp-2 bg-black/20 p-1.5 rounded">
                          {displaySampleText(selectedAnnotation.element.textContent)}
                        </div>
                      </div>
                    )}
                    {selectedAnnotation.triggerContext && selectedAnnotation.triggerContext.length > 0 && (
                      <div>
                        <div className="text-[9px] text-amber-400 uppercase font-semibold mb-1">直前操作トリガー</div>
                        <div className="space-y-1">
                          {selectedAnnotation.triggerContext.map((trig) => (
                            <div key={trig.id} className="text-[10px] text-zinc-300 bg-black/20 p-1.5 rounded">
                              <span className="text-zinc-500 font-mono">[{formatTimestampOffset(trig.offsetMs)}] </span>
                              <span className="text-indigo-300 font-medium">{trig.kind}: </span>
                              <span>{maskAllText ? '[MASKED]' : trig.targetLabel || trig.targetSelector}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Markdown snippet */}
                    <div className="pt-2 border-t border-white/5">
                      <div className="text-[9px] text-zinc-400 uppercase font-semibold mb-1">Markdown Output</div>
                      <div className="bg-black/30 p-2 rounded-lg font-mono text-[9px] text-zinc-300 leading-relaxed select-text max-h-28 overflow-y-auto">
                        <div>### 🎯 指示 #{selectedAnnotation.id}</div>
                        <div>- Target: `{selectedAnnotation.element.selector}`</div>
                        <div>- Action: {selectedAnnotation.instruction}</div>
                        {maskAllText && <div className="text-purple-400">- Masking: [MASKED ALL TEXT]</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer: Global Prompt Context & JSON Export */}
            <div className="p-3 border-t border-white/10 bg-[#202020] space-y-2 shrink-0">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span className="font-medium">ページ全体の前提 (GLOBAL CONTEXT)</span>
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt('json')}
                  className="hover:text-white underline text-[10px]"
                >
                  JSON出力
                </button>
              </div>
              <input
                type="text"
                className="w-full h-7 bg-[#18181b] border border-white/10 rounded-lg px-2 text-xs text-white focus:outline-none focus:border-[#0d99ff]"
                value={session.globalInstruction || ''}
                onChange={(e) =>
                  setSession((prev) => ({ ...prev, globalInstruction: e.target.value }))
                }
                placeholder="ページ全体の前提コンテキスト..."
                data-testid="studio-global-instruction-input"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FIGMA UI3 FLOATING BOTTOM TOOLBAR (Scrubber & Markers) */}
      {/* ========================================================================= */}
      {isLoading ? (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 h-14 w-[calc(100%-48px)] max-w-4xl lg:max-w-5xl bg-[#2c2c2c]/80 border border-white/10 rounded-[16px] px-4 flex items-center gap-3.5 z-40 backdrop-blur-md select-none animate-pulse"
          data-testid="studio-skeleton-timeline"
        >
          <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0" />
          <div className="w-9 h-9 rounded-xl bg-white/10 shrink-0" />
          <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0" />
          <div className="h-5 w-px bg-white/10 shrink-0" />
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <div className="w-24 h-4 bg-white/10 rounded shrink-0" />
            <div className="flex-1 h-2.5 bg-white/10 rounded-full" />
          </div>
          <div className="h-5 w-px bg-white/10 shrink-0" />
          <div className="w-14 h-6 rounded-lg bg-white/10 shrink-0" />
        </div>
      ) : (
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
      )}

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
