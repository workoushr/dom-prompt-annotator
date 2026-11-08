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
import { ReplayViewer, SelectedElementData } from './ReplayViewer';
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
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(
    DEVICE_PRESETS.find((p) => p.id === 'iphone-15-pro') || DEVICE_PRESETS[1]
  );
  const [artboardWidth, setArtboardWidth] = useState(393);
  const [artboardHeight, setArtboardHeight] = useState(680);
  const [maskAllText, setMaskAllText] = useState(false);

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

  const handleElementSelect = (data: SelectedElementData) => {
    setPopoverTarget({
      selector: data.selector,
      tagName: data.tagName,
      textContent: data.textContent,
      componentName: data.componentName,
      computedStyles: data.computedStyles,
    });
    setPopoverInstruction(
      data.componentName === 'HeroPricingCard'
        ? 'CTAボタンをグラデーションに変更し、ホバー演出を追加'
        : ''
    );
    setPopoverPos({
      top: Math.max(20, Math.min(data.rect.bottom + 10, artboardHeight - 200)),
      left: Math.max(20, Math.min(data.rect.left, 200)),
    });
  };

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
              setCurrentTimeMs(0);
              setMaskAllText(Boolean(response.session.maskingConfig?.maskAllText));
              if (response.session.viewport) {
                setArtboardWidth(response.session.viewport.width);
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

          {/* Session Title & Duration */}
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
        </div>

        {/* Top-Right Island: maskAllText Toggle, Device Preset, Prompt Export */}
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

            {/* REPLAYED WEB APP CONTENT (rrweb Replayer or fallback) */}
            <ReplayViewer
              events={session.rrwebEvents}
              initialDomSnapshot={session.initialDomSnapshot}
              maskAllText={maskAllText}
              currentTimeMs={currentTimeMs}
              isPlaying={isPlaying}
              artboardHeight={artboardHeight}
              onSelectElement={handleElementSelect}
            />
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
      {/* 3. FIGMA UI3 LEFT FLOATING PANEL (Annotations & Action Logs) */}
      {/* ========================================================================= */}
      <aside
        className="bg-[#2c2c2c] border border-white/10 rounded-[14px] shadow-2xl backdrop-blur-md absolute top-16 left-3 bottom-20 w-64 flex flex-col z-30 pointer-events-auto"
        data-testid="studio-left-panel"
      >
        {/* Panel Header */}
        <div className="h-9 px-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-semibold text-white tracking-tight">Annotations</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
            {session.annotations.length} items
          </span>
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
        <div className="p-2.5 border-t border-white/10 bg-[#222222]/50 rounded-b-[14px]">
          <div className="text-[10px] font-medium text-zinc-400 mb-1">PROMPT CONTEXT</div>
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
      {/* 4. FIGMA UI3 RIGHT FLOATING PANEL (Properties & Inspector Rows) */}
      {/* ========================================================================= */}
      <aside
        className="bg-[#2c2c2c] border border-white/10 rounded-[14px] shadow-2xl backdrop-blur-md absolute top-16 right-3 bottom-20 w-64 flex flex-col z-30 pointer-events-auto"
        data-testid="studio-right-panel"
      >
        {/* Panel Header */}
        <div className="h-9 px-2 border-b border-white/10 flex items-center shrink-0">
          <div className="w-full grid grid-cols-2 bg-[#1e1e1e] p-0.5 rounded-md border border-white/10 text-[10px] font-medium">
            <button className="py-0.5 rounded bg-[#2c2c2c] text-white shadow-sm">Inspect</button>
            <button
              onClick={() => void handleCopyPrompt('json')}
              className="py-0.5 text-zinc-400 hover:text-white"
            >
              JSON
            </button>
          </div>
        </div>

        {/* Inspector Property Rows */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs">
          {/* Frame Dimensions */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Frame Dimensions
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
                Selected Element (#{selectedAnnotation.id})
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
                    Text: {displaySampleText(selectedAnnotation.element.textContent)}
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
              Markdown Output Preview
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
