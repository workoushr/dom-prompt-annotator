import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FileCode2,
  FileJson,
  LocateFixed,
  MousePointerClick,
  Plus,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  AnnotationItem,
  ExtensionMessage,
  MaskingConfig,
  PageAnnotationState,
} from '../types/annotation';
import { applyMaskingToAnnotation } from '../utils/masker';
import {
  createDefaultPageState,
  getPageState,
  getStorageKey,
  normalizeUrlKey,
  savePageState,
} from '../utils/storage';
import {
  buildExportPayload,
  formatAsJson,
  formatAsMarkdownPrompt,
  formatElementSummaryTag,
  LivePageContextInput,
} from './promptFormatter';

export type ExportFormatType = 'markdown' | 'json';

export const SidePanelApp: React.FC = () => {
  const defaultUrl =
    typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : 'https://localhost/';

  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>(defaultUrl);
  const [liveContext, setLiveContext] = useState<LivePageContextInput>({
    url: defaultUrl,
    title: typeof document !== 'undefined' ? document.title : '',
    viewport: {
      width:
        typeof window !== 'undefined' && window.innerWidth > 0
          ? window.innerWidth
          : 1280,
      height:
        typeof window !== 'undefined' && window.innerHeight > 0
          ? window.innerHeight
          : 720,
    },
  });

  const [state, setState] = useState<PageAnnotationState>(() =>
    createDefaultPageState(defaultUrl)
  );
  const [maskPanelOpen, setMaskPanelOpen] = useState<boolean>(true);
  const [newSelectorInput, setNewSelectorInput] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('markdown');
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const activeUrlRef = useRef<string>(activeUrl);
  activeUrlRef.current = activeUrl;

  const activeTabIdRef = useRef<number | null>(activeTabId);
  activeTabIdRef.current = activeTabId;

  const stateRef = useRef<PageAnnotationState>(state);
  stateRef.current = state;

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessageToActiveTab = useCallback(
    async (msg: ExtensionMessage): Promise<unknown> => {
      if (typeof chrome === 'undefined') {
        return undefined;
      }
      const tabId = activeTabIdRef.current;
      if (
        typeof tabId === 'number' &&
        chrome.tabs &&
        typeof chrome.tabs.sendMessage === 'function'
      ) {
        try {
          return await chrome.tabs.sendMessage(tabId, msg);
        } catch {
          // Content script may not be injected yet; fall back to runtime.sendMessage
        }
      }
      if (
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === 'function'
      ) {
        try {
          return await chrome.runtime.sendMessage(msg);
        } catch {
          // Ignore when content script is not connected or in unit test environment
        }
      }
      return undefined;
    },
    []
  );

  const syncWithActiveTab = useCallback(async () => {
    let resolvedUrl = activeUrlRef.current;
    let resolvedTabId: number | null = activeTabIdRef.current;
    let resolvedTitle =
      typeof document !== 'undefined' ? document.title : '';

    if (
      typeof chrome !== 'undefined' &&
      chrome.tabs &&
      typeof chrome.tabs.query === 'function'
    ) {
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentTab = tabs?.[0];
        if (currentTab) {
          if (typeof currentTab.id === 'number') {
            resolvedTabId = currentTab.id;
            setActiveTabId(currentTab.id);
            activeTabIdRef.current = currentTab.id;
          }
          if (currentTab.url) {
            resolvedUrl = currentTab.url;
            setActiveUrl(currentTab.url);
            activeUrlRef.current = currentTab.url;
          }
          if (currentTab.title) {
            resolvedTitle = currentTab.title;
          }
        }
      } catch {
        // Fallback to window.location.href in unit tests
      }
    }

    // Load persisted PageAnnotationState for the resolved URL
    const loadedState = await getPageState(resolvedUrl);
    stateRef.current = loadedState;
    setState(loadedState);

    // Fetch live page context from the content script if possible
    if (
      typeof chrome !== 'undefined' &&
      typeof resolvedTabId === 'number' &&
      chrome.tabs &&
      typeof chrome.tabs.sendMessage === 'function'
    ) {
      try {
        const liveResponse = (await chrome.tabs.sendMessage(resolvedTabId, {
          type: 'GET_LIVE_PAGE_CONTEXT',
        } satisfies ExtensionMessage)) as LivePageContextInput | undefined;

        if (liveResponse && typeof liveResponse === 'object') {
          setLiveContext({
            url: liveResponse.url || resolvedUrl,
            title: liveResponse.title ?? resolvedTitle,
            viewport: liveResponse.viewport ?? {
              width: 1280,
              height: 720,
            },
          });
          return;
        }
      } catch {
        // Fallback if content script didn't respond
      }
    }

    setLiveContext((prev) => ({
      url: resolvedUrl,
      title: resolvedTitle || prev.title,
      viewport: prev.viewport ?? { width: 1280, height: 720 },
    }));
  }, []);

  // Initial sync on mount
  useEffect(() => {
    void syncWithActiveTab();
  }, [syncWithActiveTab]);

  // Listen for storage changes, runtime messages, and tab switches
  useEffect(() => {
    const handleStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }
      const key = getStorageKey(activeUrlRef.current);
      if (changes[key]) {
        void getPageState(activeUrlRef.current).then((fresh) => {
          stateRef.current = fresh;
          setState(fresh);
        });
      }
    };

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (
        message &&
        typeof message === 'object' &&
        message.type === 'PAGE_STATE_UPDATED' &&
        message.state
      ) {
        if (
          message.state.urlKey === normalizeUrlKey(activeUrlRef.current)
        ) {
          stateRef.current = message.state;
          setState(message.state);
        }
      }
    };

    const handleTabActivated = () => {
      void syncWithActiveTab();
    };

    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (
        tabId === activeTabIdRef.current &&
        (changeInfo.status === 'complete' || Boolean(changeInfo.url))
      ) {
        void syncWithActiveTab();
      }
    };

    if (typeof chrome !== 'undefined') {
      chrome.storage?.onChanged?.addListener?.(handleStorageChanged);
      chrome.runtime?.onMessage?.addListener?.(handleRuntimeMessage);
      chrome.tabs?.onActivated?.addListener?.(handleTabActivated);
      chrome.tabs?.onUpdated?.addListener?.(handleTabUpdated);
    }

    return () => {
      if (typeof chrome !== 'undefined') {
        chrome.storage?.onChanged?.removeListener?.(handleStorageChanged);
        chrome.runtime?.onMessage?.removeListener?.(handleRuntimeMessage);
        chrome.tabs?.onActivated?.removeListener?.(handleTabActivated);
        chrome.tabs?.onUpdated?.removeListener?.(handleTabUpdated);
      }
    };
  }, [syncWithActiveTab]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Handlers
  const handleToggleInspectMode = useCallback(async () => {
    const nextEnabled = !stateRef.current.inspectMode;
    const url = activeUrlRef.current;
    const updated = await savePageState(url, { inspectMode: nextEnabled });
    stateRef.current = updated;
    setState(updated);
    await sendMessageToActiveTab({
      type: 'SET_INSPECT_MODE',
      enabled: nextEnabled,
      url,
    });
  }, [sendMessageToActiveTab]);

  const handleClearAllAnnotations = useCallback(async () => {
    const url = activeUrlRef.current;
    const updated = await savePageState(url, { annotations: [] });
    stateRef.current = updated;
    setState(updated);
    await sendMessageToActiveTab({
      type: 'CLEAR_ANNOTATIONS',
      url,
    });
  }, [sendMessageToActiveTab]);

  const handleGlobalInstructionChange = useCallback(
    async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextGlobal = e.target.value;
      const url = activeUrlRef.current;
      stateRef.current = {
        ...stateRef.current,
        globalInstruction: nextGlobal,
      };
      setState(stateRef.current);
      const updated = await savePageState(url, {
        globalInstruction: nextGlobal,
      });
      stateRef.current = updated;
      setState(updated);
      await sendMessageToActiveTab({
        type: 'PAGE_STATE_UPDATED',
        state: updated,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleUpdateMaskingConfig = useCallback(
    async (patch: Partial<MaskingConfig>) => {
      const url = activeUrlRef.current;
      const updated = await savePageState(url, {
        maskingConfig: patch,
      });
      stateRef.current = updated;
      setState(updated);
      await sendMessageToActiveTab({
        type: 'PAGE_STATE_UPDATED',
        state: updated,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleAddMaskSelector = useCallback(async () => {
    const trimmed = newSelectorInput.trim();
    if (!trimmed) {
      return;
    }
    const existing = stateRef.current.maskingConfig.maskSelectors || [];
    if (existing.includes(trimmed)) {
      setNewSelectorInput('');
      return;
    }
    const nextSelectors = [...existing, trimmed];
    setNewSelectorInput('');
    await handleUpdateMaskingConfig({ maskSelectors: nextSelectors });
  }, [newSelectorInput, handleUpdateMaskingConfig]);

  const handleRemoveMaskSelector = useCallback(
    async (selectorToRemove: string) => {
      const existing = stateRef.current.maskingConfig.maskSelectors || [];
      const nextSelectors = existing.filter((s) => s !== selectorToRemove);
      await handleUpdateMaskingConfig({ maskSelectors: nextSelectors });
    },
    [handleUpdateMaskingConfig]
  );

  const handleAnnotationInstructionChange = useCallback(
    async (id: number, instruction: string) => {
      const url = activeUrlRef.current;
      const nextAnnotations = stateRef.current.annotations.map((ann) =>
        ann.id === id ? { ...ann, instruction } : ann
      );
      stateRef.current = {
        ...stateRef.current,
        annotations: nextAnnotations,
      };
      setState(stateRef.current);
      const updated = await savePageState(url, {
        annotations: nextAnnotations,
      });
      stateRef.current = updated;
      setState(updated);
      await sendMessageToActiveTab({
        type: 'PAGE_STATE_UPDATED',
        state: updated,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleToggleAnnotationMask = useCallback(
    async (id: number) => {
      const url = activeUrlRef.current;
      const target = stateRef.current.annotations.find((a) => a.id === id);
      if (!target) {
        return;
      }
      const nextMask = !target.maskText;
      const nextAnnotations = stateRef.current.annotations.map((ann) =>
        ann.id === id ? { ...ann, maskText: nextMask } : ann
      );
      const updated = await savePageState(url, {
        annotations: nextAnnotations,
      });
      stateRef.current = updated;
      setState(updated);
      await sendMessageToActiveTab({
        type: 'PAGE_STATE_UPDATED',
        state: updated,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleDeleteAnnotation = useCallback(
    async (id: number) => {
      const url = activeUrlRef.current;
      const nextAnnotations = stateRef.current.annotations
        .filter((ann) => ann.id !== id)
        .map((ann, idx) => ({
          ...ann,
          id: idx + 1,
        }));
      const updated = await savePageState(url, {
        annotations: nextAnnotations,
      });
      stateRef.current = updated;
      setState(updated);
      await sendMessageToActiveTab({
        type: 'PAGE_STATE_UPDATED',
        state: updated,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleScrollToAnnotation = useCallback(
    async (ann: AnnotationItem) => {
      await sendMessageToActiveTab({
        type: 'SCROLL_TO_ELEMENT',
        selector: ann.element.selector,
        id: ann.id,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleCardMouseEnter = useCallback(
    (ann: AnnotationItem) => {
      void sendMessageToActiveTab({
        type: 'HIGHLIGHT_ELEMENT',
        selector: ann.element.selector,
        id: ann.id,
      });
    },
    [sendMessageToActiveTab]
  );

  const handleCardMouseLeave = useCallback(() => {
    void sendMessageToActiveTab({
      type: 'HIGHLIGHT_ELEMENT',
      selector: null,
      id: null,
    });
  }, [sendMessageToActiveTab]);

  // Formatted export output
  const exportPayload = useMemo(
    () => buildExportPayload(state, liveContext),
    [state, liveContext]
  );

  const formattedOutput = useMemo(() => {
    if (exportFormat === 'json') {
      return formatAsJson(exportPayload);
    }
    return formatAsMarkdownPrompt(exportPayload);
  }, [exportFormat, exportPayload]);

  const handleCopyOutput = useCallback(async () => {
    let copiedOk = false;
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(formattedOutput);
        copiedOk = true;
      } catch {
        copiedOk = false;
      }
    }

    if (!copiedOk && typeof document !== 'undefined') {
      try {
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = formattedOutput;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.opacity = '0';
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        if (typeof document.execCommand === 'function') {
          document.execCommand('copy');
        }
        tempTextarea.remove();
      } catch {
        // Ignore fallback error
      }
    }

    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [formattedOutput]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 text-xs select-none">
      {/* Top Sticky Control Bar */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="toggle-inspect-mode"
            onClick={() => void handleToggleInspectMode()}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors border ${
              state.inspectMode
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="要素選択モードの切り替え (Alt+S)"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>
              {state.inspectMode
                ? '選択モード (Inspect ON)'
                : '通常操作モード (Normal)'}
            </span>
            <kbd className="ml-1 px-1 py-0.5 text-[10px] rounded bg-black/30 text-slate-300 font-mono">
              Alt+S
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="annotation-count-badge"
            className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-semibold"
          >
            {state.annotations.length} 件の指示
          </span>

          <button
            type="button"
            data-testid="clear-annotations-btn"
            onClick={() => void handleClearAllAnnotations()}
            disabled={state.annotations.length === 0}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-slate-800 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-800 text-slate-300 border border-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="すべての要素指示をクリア"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>全クリア</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-36">
        {/* Global Instruction Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="dpa-global-instruction"
              className="font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <span>ページ全体の前提・共通指示</span>
            </label>
            <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
              {state.urlKey}
            </span>
          </div>
          <textarea
            id="dpa-global-instruction"
            data-testid="global-instruction-input"
            rows={2}
            value={state.globalInstruction}
            onChange={(e) => void handleGlobalInstructionChange(e)}
            placeholder="例: デザインシステムに準拠し、Tailwind CSSでレスポンシブ対応してください..."
            className="w-full rounded-md bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none px-2.5 py-2 text-xs text-slate-100 placeholder-slate-500 resize-y select-text"
          />
        </section>

        {/* Playwright-style Masking Settings Panel */}
        <section
          data-testid="masking-settings-panel"
          className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden"
        >
          <button
            type="button"
            data-testid="toggle-masking-panel"
            onClick={() => setMaskPanelOpen((prev) => !prev)}
            className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-900 hover:bg-slate-800/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-fuchsia-400" />
              <span className="font-semibold text-slate-200">
                Playwright風マスキング設定
              </span>
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-800/60">
                {state.maskingConfig.maskSelectors.length} selectors
              </span>
            </div>
            {maskPanelOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {maskPanelOpen && (
            <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 space-y-2.5">
              {/* Toggle: autoMaskPII */}
              <label className="flex items-center justify-between gap-2 cursor-pointer py-1">
                <span className="text-slate-300">
                  PII自動マスク (Email/電話/トークン)
                </span>
                <input
                  type="checkbox"
                  data-testid="toggle-auto-mask-pii"
                  checked={state.maskingConfig.autoMaskPII}
                  onChange={(e) =>
                    void handleUpdateMaskingConfig({
                      autoMaskPII: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-fuchsia-500 focus:ring-0"
                />
              </label>

              {/* Toggle: maskAllText */}
              <label className="flex items-center justify-between gap-2 cursor-pointer py-1">
                <span className="text-slate-300">
                  全文マスク (構造・スタイルのみ出力)
                </span>
                <input
                  type="checkbox"
                  data-testid="toggle-mask-all-text"
                  checked={state.maskingConfig.maskAllText}
                  onChange={(e) =>
                    void handleUpdateMaskingConfig({
                      maskAllText: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-fuchsia-500 focus:ring-0"
                />
              </label>

              {/* Toggle: visualMaskEnabled & maskColor */}
              <div className="flex items-center justify-between gap-2 py-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="toggle-visual-mask"
                    checked={state.maskingConfig.visualMaskEnabled}
                    onChange={(e) =>
                      void handleUpdateMaskingConfig({
                        visualMaskEnabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-fuchsia-500 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    画面上のマスク枠表示 (Visual Mask)
                  </span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    data-testid="mask-color-input"
                    aria-label="マスク枠カラー"
                    value={state.maskingConfig.maskColor || '#FF00FF'}
                    onChange={(e) =>
                      void handleUpdateMaskingConfig({
                        maskColor: e.target.value,
                      })
                    }
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-slate-400">
                    {state.maskingConfig.maskColor}
                  </span>
                </div>
              </div>

              {/* Playwright Mask Selectors */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                <div className="text-[11px] font-medium text-slate-300">
                  Playwright Mask Selectors (該当要素のテキスト・属性を自動マスク)
                </div>

                <div
                  data-testid="mask-selector-chips"
                  className="flex flex-wrap gap-1.5"
                >
                  {state.maskingConfig.maskSelectors.map((selector) => (
                    <span
                      key={selector}
                      data-testid={`mask-selector-chip-${selector}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-fuchsia-950/60 border border-fuchsia-800/60 text-fuchsia-200 font-mono text-[11px]"
                    >
                      <span>{selector}</span>
                      <button
                        type="button"
                        data-testid={`remove-mask-selector-${selector}`}
                        onClick={() => void handleRemoveMaskSelector(selector)}
                        aria-label={`${selector} を削除`}
                        className="text-fuchsia-300 hover:text-white p-0.5 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    data-testid="add-mask-selector-input"
                    value={newSelectorInput}
                    onChange={(e) => setNewSelectorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleAddMaskSelector();
                      }
                    }}
                    placeholder="CSSセレクタを追加 (例: .user-name, .secret-card)"
                    className="flex-1 rounded-md bg-slate-950 border border-slate-800 focus:border-fuchsia-500 focus:outline-none px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono select-text"
                  />
                  <button
                    type="button"
                    data-testid="add-mask-selector-btn"
                    onClick={() => void handleAddMaskSelector()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>追加</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Annotation List Section */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="font-semibold text-slate-200">
              要素別の修正指示リスト
            </h2>
            <span className="text-[11px] text-slate-400">
              ホバーでページ上の要素をハイライト
            </span>
          </div>

          {state.annotations.length === 0 ? (
            <div
              data-testid="empty-annotations-state"
              className="bg-slate-900/60 border border-dashed border-slate-800 rounded-lg p-6 text-center space-y-2"
            >
              <MousePointerClick className="w-7 h-7 text-slate-500 mx-auto" />
              <div className="font-medium text-slate-300">
                まだ要素が選択されていません
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                上部の「選択モード (Inspect ON)」を有効にするか{' '}
                <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  Alt+S
                </kbd>{' '}
                を押し、ページ上の修正したいDOM要素をクリックして番号付きの指示を追加してください。
              </p>
            </div>
          ) : (
            <div data-testid="annotations-list" className="space-y-2.5">
              {state.annotations.map((ann) => {
                const maskedAnn = applyMaskingToAnnotation(
                  ann,
                  state.maskingConfig
                );
                const tagSummary = formatElementSummaryTag(ann.element);
                const fw = ann.element.framework;
                const hasFramework = Boolean(
                  fw && (fw.componentName || fw.detected)
                );
                const sourceText = fw?.source?.fileName
                  ? `${fw.source.fileName}${
                      typeof fw.source.lineNumber === 'number'
                        ? `:${fw.source.lineNumber}`
                        : ''
                    }`
                  : null;
                const isMaskedEffective =
                  ann.maskText ||
                  state.maskingConfig.maskAllText ||
                  maskedAnn.element.textContent === '[MASKED]';

                return (
                  <article
                    key={ann.id}
                    data-testid={`annotation-card-${ann.id}`}
                    onMouseEnter={() => handleCardMouseEnter(ann)}
                    onMouseLeave={handleCardMouseLeave}
                    className="bg-slate-900 border border-slate-800 hover:border-blue-500/60 rounded-lg p-3 space-y-2 transition-colors"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[11px]">
                          #{ann.id}
                        </span>
                        <code
                          data-testid={`annotation-tag-${ann.id}`}
                          className="font-mono text-xs text-blue-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[190px]"
                        >
                          {tagSummary}
                        </code>

                        {hasFramework && fw && (
                          <span
                            data-testid={`annotation-framework-${ann.id}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 text-[10px] font-mono"
                          >
                            <span>
                              ⚛️ {fw.componentName || fw.detected}
                            </span>
                            {sourceText && (
                              <span className="text-emerald-400/80">
                                ({sourceText})
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid={`scroll-to-annotation-${ann.id}`}
                          onClick={() => void handleScrollToAnnotation(ann)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                          title="要素の位置へスクロール移動"
                        >
                          <LocateFixed className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          data-testid={`toggle-annotation-mask-${ann.id}`}
                          onClick={() => void handleToggleAnnotationMask(ann.id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            ann.maskText
                              ? 'bg-fuchsia-950/90 text-fuchsia-200 border-fuchsia-700'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title="この要素のテキストマスク切替"
                        >
                          <ShieldAlert className="w-3 h-3" />
                          <span>{ann.maskText ? 'マスクON' : 'マスクOFF'}</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`delete-annotation-${ann.id}`}
                          onClick={() => void handleDeleteAnnotation(ann.id)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-200 hover:border-rose-800 text-slate-400 border border-slate-700"
                          title="この指示を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Selector & Text Content Preview */}
                    <div className="space-y-1 bg-slate-950/80 rounded p-2 border border-slate-800/80 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono truncate">
                        <span className="text-slate-500 select-none">CSS:</span>
                        <span
                          data-testid={`annotation-selector-${ann.id}`}
                          className="text-slate-300 select-text truncate"
                        >
                          {ann.element.selector}
                        </span>
                      </div>

                      {ann.element.textContent && (
                        <div className="flex items-center gap-1.5 text-slate-400 truncate">
                          <span className="text-slate-500 font-mono select-none">
                            Text:
                          </span>
                          <span
                            data-testid={`annotation-text-preview-${ann.id}`}
                            className={`truncate ${
                              isMaskedEffective
                                ? 'text-fuchsia-300 font-mono'
                                : 'text-slate-300'
                            }`}
                          >
                            {maskedAnn.element.textContent}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Editable Instruction Textarea */}
                    <div>
                      <textarea
                        rows={2}
                        data-testid={`annotation-instruction-${ann.id}`}
                        value={ann.instruction}
                        onChange={(e) =>
                          void handleAnnotationInstructionChange(
                            ann.id,
                            e.target.value
                          )
                        }
                        placeholder={`#${ann.id} の要素に対する修正指示を入力...`}
                        className="w-full rounded-md bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 resize-y select-text"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Export Preview Drawer */}
        {previewOpen && (
          <section
            data-testid="export-preview-panel"
            className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                出力プレビュー (
                {exportFormat === 'markdown' ? 'LLMプロンプト + JSON' : '純粋なJSON'}
                )
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre
              data-testid="export-preview-content"
              className="max-h-64 overflow-auto rounded bg-slate-950 border border-slate-800 p-2.5 text-[11px] font-mono text-slate-200 whitespace-pre-wrap break-all select-text"
            >
              {formattedOutput}
            </pre>
          </section>
        )}
      </main>

      {/* Bottom Sticky Export Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur border-t border-slate-800 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
            <button
              type="button"
              data-testid="format-select-markdown"
              onClick={() => setExportFormat('markdown')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                exportFormat === 'markdown'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>LLMプロンプト + JSON</span>
            </button>

            <button
              type="button"
              data-testid="format-select-json"
              onClick={() => setExportFormat('json')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                exportFormat === 'json'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>純粋なJSON</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="toggle-export-preview"
            onClick={() => setPreviewOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium"
          >
            {previewOpen ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>プレビューを閉じる</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>プレビュー</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          data-testid="copy-export-btn"
          onClick={() => void handleCopyOutput()}
          className={`w-full py-2 px-3 rounded-md font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
            copied
              ? 'bg-emerald-600 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>コピーしました！</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>クリップボードにコピー</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
};
