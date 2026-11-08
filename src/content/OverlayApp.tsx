import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnnotationItem,
  DEFAULT_DEVICE_EMULATION_CONFIG,
  DeviceEmulationConfig,
  ElementMetadata,
  ElementRect,
  ExtensionMessage,
  FrameworkMetadata,
  MaskingConfig,
  PageAnnotationState,
} from '../types/annotation';
import {
  buildExportPayload,
  formatAsJson,
  formatAsMarkdownPrompt,
} from '../utils/promptFormatter';
import { FloatingBottomBar } from './FloatingBottomBar';
import { AnnotationDrawer } from './AnnotationDrawer';
import { RecordingController } from './recordingController';
import {
  applyMaskingToAnnotation,
  findMaskedElementsOnPage,
  isElementMatchedByMaskSelectors,
  SHADOW_HOST_ID,
} from '../utils/masker';
import {
  createDefaultPageState,
  getPageState,
  getStorageKey,
  normalizeUrlKey,
  savePageState,
} from '../utils/storage';
import {
  extractElementMetadata,
  findElementBySelectorOrXPath,
  generateCssSelector,
  getFirstChildCandidate,
  getParentCandidate,
  requestFrameworkMetadata,
} from './domExtractor';

interface HoveredElementInfo {
  element: HTMLElement;
  rect: ElementRect;
  tagLabel: string;
  framework: FrameworkMetadata;
}

interface PopoverState {
  targetEl: HTMLElement | null;
  metadata: ElementMetadata;
  instruction: string;
  maskText: boolean;
  editingAnnotationId: number | null;
}

interface HighlightTarget {
  selector: string | null;
  id: number | null;
}

function getElementRect(el: Element): ElementRect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.x ?? r.left ?? 0),
    y: Math.round(r.y ?? r.top ?? 0),
    width: Math.round(r.width ?? 0),
    height: Math.round(r.height ?? 0),
  };
}

export function formatElementTagLabel(
  tagName: string,
  id?: string,
  className?: string
): string {
  const tag = (tagName || 'div').toLowerCase();
  const idPart = id && id.trim() ? `#${id.trim()}` : '';
  const classes = (className || '')
    .trim()
    .split(/\s+/)
    .filter((c) => Boolean(c) && !c.startsWith('dpa-'))
    .slice(0, 2);
  const classPart = classes.length > 0 ? `.${classes.join('.')}` : '';
  return `<${tag}${idPart}${classPart}>`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = (hex || '#FF00FF').replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  } else if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `rgba(255, 0, 255, ${alpha})`;
}

function safeBroadcastPageState(state: PageAnnotationState): void {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function'
    ) {
      const msg: ExtensionMessage = {
        type: 'PAGE_STATE_UPDATED',
        state,
      };
      const maybePromise = chrome.runtime.sendMessage(msg);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          // Ignore when SidePanel or background is not listening
        });
      }
    }
  } catch {
    // Ignore runtime messaging errors in unit test or disconnected context
  }
}

export function computePopoverPosition(
  rect: ElementRect,
  viewport?: { width?: number; height?: number },
  bottomBarHeight = 72
): { top: number; left: number } {
  const popoverWidth = 340;
  const popoverHeight = 290;
  const margin = 12;

  const vw =
    viewport?.width ??
    (typeof window !== 'undefined' && window.innerWidth > 0
      ? window.innerWidth
      : 1024);
  const vh =
    viewport?.height ??
    (typeof window !== 'undefined' && window.innerHeight > 0
      ? window.innerHeight
      : 768);

  const bottomLimit = vh - bottomBarHeight;

  // Initial candidate: below the element
  let top = rect.y + rect.height + 8;
  let left = rect.x;

  // If placing below exceeds the bottom limit (colliding with bottom bar or screen bottom)
  if (top + popoverHeight > bottomLimit) {
    const aboveTop = rect.y - popoverHeight - 8;
    if (aboveTop >= margin) {
      top = aboveTop;
    } else {
      // If neither purely above nor purely below has full clearance:
      // Try side placement if there's enough horizontal room
      const spaceRight = vw - margin - (rect.x + rect.width + 8);
      const spaceLeft = rect.x - 8 - margin;

      if (spaceRight >= popoverWidth) {
        left = rect.x + rect.width + 8;
        top = Math.max(margin, Math.min(rect.y, bottomLimit - popoverHeight));
      } else if (spaceLeft >= popoverWidth) {
        left = rect.x - 8 - popoverWidth;
        top = Math.max(margin, Math.min(rect.y, bottomLimit - popoverHeight));
      } else {
        // Fallback: pick the vertical side with more room and clamp above bottom bar
        const spaceAbove = rect.y - margin;
        const spaceBelow = bottomLimit - (rect.y + rect.height);

        if (spaceAbove >= spaceBelow) {
          top = Math.max(margin, rect.y - popoverHeight - 8);
        } else {
          top = Math.max(margin, Math.min(top, bottomLimit - popoverHeight));
        }
      }
    }
  }

  // Ensure top doesn't overlap bottom bar even after clamping, if possible
  if (bottomLimit - popoverHeight >= margin && top + popoverHeight > bottomLimit) {
    top = bottomLimit - popoverHeight;
  }

  // Clamp left inside viewport margins
  if (left + popoverWidth > vw - margin) {
    left = vw - popoverWidth - margin;
  }
  left = Math.max(margin, left);

  return { top, left };
}

export const OverlayApp: React.FC = () => {
  const [state, setState] = useState<PageAnnotationState>(() =>
    createDefaultPageState(
      typeof window !== 'undefined' ? window.location.href : 'https://localhost/'
    )
  );
  const [hoveredInfo, setHoveredInfo] = useState<HoveredElementInfo | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<HighlightTarget>({
    selector: null,
    id: null,
  });
  const [layoutTick, setLayoutTick] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [emulationConfig, setEmulationConfig] = useState<DeviceEmulationConfig>(
    () => ({ ...DEFAULT_DEVICE_EMULATION_CONFIG })
  );
  const [isCopied, setIsCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);

  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recordingControllerRef = useRef<RecordingController | null>(null);
  const stateRef = useRef<PageAnnotationState>(state);
  stateRef.current = state;

  const popoverRef = useRef<PopoverState | null>(popover);
  popoverRef.current = popover;

  const isDrawerOpenRef = useRef<boolean>(isDrawerOpen);
  isDrawerOpenRef.current = isDrawerOpen;

  // Initialize recording controller
  useEffect(() => {
    recordingControllerRef.current = new RecordingController({
      getMaskingConfig: () => stateRef.current.maskingConfig,
      getGlobalInstruction: () => stateRef.current.globalInstruction,
      onDurationTick: (ms) => setRecordingDurationMs(ms),
      onStatusChange: (rec) => setIsRecording(rec),
    });
  }, []);

  // Load initial device emulation state if available
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          { type: 'GET_DEVICE_EMULATION' },
          (response: { ok?: boolean; config?: DeviceEmulationConfig }) => {
            if (response?.ok && response.config) {
              setEmulationConfig(response.config);
            }
          }
        );
      } catch {
        // Ignore in tests or disconnected runtime
      }
    }
  }, []);

  // Load initial state on mount
  useEffect(() => {
    let mounted = true;
    const url = window.location.href;
    getPageState(url).then((loaded) => {
      if (mounted) {
        setState(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Issue 5: Dynamically manage document.body.style.paddingBottom
  // When the bottom bar is open (isVisible && !isMinimized), add padding to prevent
  // page footer/content from being obscured. Restore original padding on minimize, close, or unmount.
  const originalPaddingBottomRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) {
      return;
    }

    if (originalPaddingBottomRef.current === null) {
      originalPaddingBottomRef.current = document.body.style.paddingBottom || '';
    }

    const isBarActive = (state.isVisible !== false) && !isMinimized;

    if (isBarActive) {
      document.body.style.paddingBottom = '72px';
    } else {
      document.body.style.paddingBottom = originalPaddingBottomRef.current;
    }

    return () => {
      if (originalPaddingBottomRef.current !== null) {
        document.body.style.paddingBottom = originalPaddingBottomRef.current;
      }
    };
  }, [state.isVisible, isMinimized]);

  // Auto-focus instruction textarea when popover opens
  useEffect(() => {
    if (popover && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [popover?.targetEl, popover?.editingAnnotationId]);

  const isEventFromOverlay = useCallback((event: Event): boolean => {
    if (typeof event.composedPath === 'function') {
      const path = event.composedPath();
      for (const node of path) {
        if (node === overlayRootRef.current) {
          return true;
        }
        if (node instanceof Element) {
          if (
            node.id === SHADOW_HOST_ID ||
            node.classList.contains('dpa-overlay-root')
          ) {
            return true;
          }
        }
      }
    }

    const target = event.target;
    if (target instanceof Node) {
      if (overlayRootRef.current && overlayRootRef.current.contains(target)) {
        return true;
      }
      if (target instanceof Element) {
        if (
          target.id === SHADOW_HOST_ID ||
          target.closest(`#${SHADOW_HOST_ID}`) !== null ||
          target.closest('.dpa-overlay-root') !== null
        ) {
          return true;
        }
      }
    }

    return false;
  }, []);

  const updateAndPersistState = useCallback(
    async (patch: Parameters<typeof savePageState>[1]): Promise<PageAnnotationState> => {
      const updated = await savePageState(window.location.href, patch);
      setState(updated);
      safeBroadcastPageState(updated);
      return updated;
    },
    []
  );

  const handleToggleInspectMode = useCallback(async () => {
    const nextInspect = !stateRef.current.inspectMode;
    if (!nextInspect) {
      setHoveredInfo(null);
      setPopover(null);
    }
    await updateAndPersistState({
      inspectMode: nextInspect,
      isVisible: true,
    });
  }, [updateAndPersistState]);

  const handleCloseOverlay = useCallback(async () => {
    setHoveredInfo(null);
    setPopover(null);
    setIsDrawerOpen(false);
    await updateAndPersistState({
      isVisible: false,
      inspectMode: false,
    });
  }, [updateAndPersistState]);

  const selectPopoverElement = useCallback((nextEl: HTMLElement) => {
    const currentConfig = stateRef.current.maskingConfig;
    const nextMeta = extractElementMetadata(nextEl);
    const autoMask =
      isElementMatchedByMaskSelectors(nextEl, currentConfig.maskSelectors) ||
      currentConfig.maskAllText;

    setPopover((prev) => {
      if (!prev) {
        return null;
      }
      return {
        ...prev,
        targetEl: nextEl,
        metadata: nextMeta,
        maskText: autoMask,
      };
    });
  }, []);

  const handleStepParent = useCallback(() => {
    const currentPopover = popoverRef.current;
    if (!currentPopover?.targetEl) {
      return;
    }
    const parent = getParentCandidate(currentPopover.targetEl);
    if (parent) {
      selectPopoverElement(parent);
    }
  }, [selectPopoverElement]);

  const handleStepChild = useCallback(() => {
    const currentPopover = popoverRef.current;
    if (!currentPopover?.targetEl) {
      return;
    }
    const child = getFirstChildCandidate(currentPopover.targetEl);
    if (child) {
      selectPopoverElement(child);
    }
  }, [selectPopoverElement]);

  const handleSavePopover = useCallback(async () => {
    const currentPopover = popoverRef.current;
    if (!currentPopover) {
      return;
    }

    const rawMetadata = currentPopover.targetEl
      ? extractElementMetadata(currentPopover.targetEl)
      : currentPopover.metadata;

    const currentAnnotations = stateRef.current.annotations;
    let nextAnnotations: AnnotationItem[];

    if (currentPopover.editingAnnotationId !== null) {
      nextAnnotations = currentAnnotations.map((item) =>
        item.id === currentPopover.editingAnnotationId
          ? {
              ...item,
              instruction: currentPopover.instruction.trim(),
              maskText: currentPopover.maskText,
              element: rawMetadata,
            }
          : item
      );
    } else {
      const rec = recordingControllerRef.current;
      const isRec = rec && rec.getIsRecording();
      const timestampMs = isRec ? rec.getDurationMs() : undefined;
      const triggerContext = isRec
        ? rec
            .getActionLogs()
            .filter((log) => log.offsetMs <= (timestampMs ?? 0))
            .slice(-2)
        : undefined;

      const newItem: AnnotationItem = {
        id: currentAnnotations.length + 1,
        instruction: currentPopover.instruction.trim(),
        maskText: currentPopover.maskText,
        createdAt: new Date().toISOString(),
        element: rawMetadata,
        timestampMs,
        triggerContext,
      };
      nextAnnotations = [...currentAnnotations, newItem].map((item, idx) => ({
        ...item,
        id: idx + 1,
      }));
    }

    setPopover(null);
    await updateAndPersistState({ annotations: nextAnnotations });
  }, [updateAndPersistState]);

  const handleDeleteAnnotation = useCallback(
    async (idToDelete: number) => {
      const nextAnnotations = stateRef.current.annotations
        .filter((item) => item.id !== idToDelete)
        .map((item, idx) => ({
          ...item,
          id: idx + 1,
        }));
      setPopover(null);
      await updateAndPersistState({ annotations: nextAnnotations });
    },
    [updateAndPersistState]
  );

  const handleOpenBadgePopover = useCallback(
    (annotation: AnnotationItem, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const resolvedEl = findElementBySelectorOrXPath(
        annotation.element.selector,
        annotation.element.xpath,
        document
      );

      const metadata = resolvedEl
        ? extractElementMetadata(resolvedEl)
        : annotation.element;

      setPopover({
        targetEl: resolvedEl,
        metadata,
        instruction: annotation.instruction,
        maskText: annotation.maskText,
        editingAnnotationId: annotation.id,
      });
    },
    []
  );

  const handleSetDeviceEmulation = useCallback(
    async (config: Partial<DeviceEmulationConfig>) => {
      const isRotation = Boolean(
        config.orientation &&
        config.orientation !== emulationConfig.orientation &&
        !config.presetId
      );

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const res = (await chrome.runtime.sendMessage({
            type: 'SET_DEVICE_EMULATION',
            config,
          })) as { ok?: boolean; config?: DeviceEmulationConfig; error?: string } | undefined;

          if (res?.ok && res.config) {
            setEmulationConfig(res.config);
            if (isRotation) {
              const orientLabel =
                res.config.orientation === 'landscape' ? '横向き' : '縦向き';
              showToast(
                `🔄 ${res.config.name} (${orientLabel}: ${res.config.width}×${res.config.height}) に回転しました`
              );
            } else {
              showToast(
                `📱 ${res.config.name} (${res.config.width}×${res.config.height}) を適用しました`
              );
            }
            return;
          } else {
            const errorMsg =
              res?.error || 'DevToolsが開いているか、CDP接続に失敗しました';
            showToast(`⚠️ デバイスエミュレーション失敗: ${errorMsg}`, 4000);
            return;
          }
        } catch (err: unknown) {
          const errorMsg =
            err instanceof Error
              ? err.message
              : 'DevToolsが開いているか、CDP接続に失敗しました';
          showToast(`⚠️ デバイスエミュレーション失敗: ${errorMsg}`, 4000);
          return;
        }
      }

      // Fallback for tests or disconnected runtime
      let targetWidth = config.width || emulationConfig.width;
      let targetHeight = config.height || emulationConfig.height;
      if (isRotation) {
        [targetWidth, targetHeight] = [targetHeight, targetWidth];
      }
      const fallbackConfig: DeviceEmulationConfig = {
        ...emulationConfig,
        ...config,
        width: targetWidth,
        height: targetHeight,
        enabled: true,
      };
      setEmulationConfig(fallbackConfig);
      if (isRotation) {
        const orientLabel =
          fallbackConfig.orientation === 'landscape' ? '横向き' : '縦向き';
        showToast(
          `🔄 ${fallbackConfig.name} (${orientLabel}: ${fallbackConfig.width}×${fallbackConfig.height}) に回転しました`
        );
      } else {
        showToast(
          `📱 ${fallbackConfig.name} (${fallbackConfig.width}×${fallbackConfig.height}) を適用しました`
        );
      }
    },
    [emulationConfig, showToast]
  );

  const handleClearDeviceEmulation = useCallback(async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        await chrome.runtime.sendMessage({
          type: 'CLEAR_DEVICE_EMULATION',
        });
      } catch {
        // Fallback
      }
    }
    setEmulationConfig({ ...DEFAULT_DEVICE_EMULATION_CONFIG, enabled: false });
    showToast('🖥️ デスクトップ表示にリセットしました');
  }, [showToast]);

  const handleCopyPrompt = useCallback(
    async (format: 'markdown' | 'json' = 'markdown') => {
      const payload = buildExportPayload(stateRef.current, {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      });

      const textToCopy =
        format === 'json'
          ? formatAsJson(payload)
          : formatAsMarkdownPrompt(payload);

      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          await navigator.clipboard.writeText(textToCopy);
        }
      } catch {
        // Fallback or ignore in restricted contexts
      }

      setIsCopied(true);
      setToastMessage(
        format === 'json'
          ? 'DOM JSONをクリップボードにコピーしました'
          : 'AIプロンプトをクリップボードにコピーしました'
      );

      setTimeout(() => {
        setIsCopied(false);
      }, 2500);

      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    },
    []
  );

  const handleToggleRecording = useCallback(async () => {
    const controller = recordingControllerRef.current;
    if (!controller) return;

    if (controller.getIsRecording()) {
      const session = controller.stopRecording({
        annotations: stateRef.current.annotations,
        maskingConfig: stateRef.current.maskingConfig,
        globalInstruction: stateRef.current.globalInstruction,
      });
      setIsRecording(false);
      setRecordingDurationMs(0);
      setToastMessage('録画完了: Studioタブを起動しています...');
      setTimeout(() => setToastMessage(null), 3000);

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: 'SAVE_RECORDING_SESSION',
            session,
            openStudioTab: true,
          });
        } catch {
          // Ignore messaging errors
        }
      }
    } else {
      controller.startRecording();
      setIsRecording(true);
      setToastMessage('🔴 録画中: アクションとDOM変化を記録しています');
      setTimeout(() => setToastMessage(null), 2500);
    }
  }, []);

  const handleUpdateGlobalInstruction = useCallback(
    async (globalInstruction: string) => {
      await updateAndPersistState({ globalInstruction });
    },
    [updateAndPersistState]
  );

  const handleUpdateMaskingConfig = useCallback(
    async (maskingConfigPatch: Partial<MaskingConfig>) => {
      const currentConfig = stateRef.current.maskingConfig;
      const mergedConfig = {
        ...currentConfig,
        ...maskingConfigPatch,
      };
      await updateAndPersistState({ maskingConfig: mergedConfig });
    },
    [updateAndPersistState]
  );

  const handleClearAnnotations = useCallback(async () => {
    setPopover(null);
    await updateAndPersistState({ annotations: [] });
  }, [updateAndPersistState]);

  const handleScrollToElement = useCallback((selector: string, id: number) => {
    const matchingAnn = stateRef.current.annotations.find((a) => a.id === id);
    const targetEl = findElementBySelectorOrXPath(
      selector,
      matchingAnn?.element.xpath,
      document
    );
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setHighlightTarget({ selector, id });
    setLayoutTick((t) => t + 1);
  }, []);

  // Mousemove & Click capture listeners for inspectMode
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!stateRef.current.isVisible || !stateRef.current.inspectMode) {
        return;
      }
      if (isEventFromOverlay(event)) {
        setHoveredInfo(null);
        return;
      }

      const rawTarget = event.target;
      const targetEl =
        rawTarget instanceof HTMLElement
          ? rawTarget
          : rawTarget instanceof Element
            ? (rawTarget.closest('*') as HTMLElement | null)
            : null;

      if (
        !targetEl ||
        targetEl === document.documentElement ||
        targetEl === document.body
      ) {
        setHoveredInfo(null);
        return;
      }

      const rect = getElementRect(targetEl);
      const className =
        typeof targetEl.className === 'string'
          ? targetEl.className
          : targetEl.getAttribute('class') || '';
      const tagLabel = formatElementTagLabel(
        targetEl.tagName,
        targetEl.id,
        className
      );
      const framework = requestFrameworkMetadata(targetEl);

      setHoveredInfo({
        element: targetEl,
        rect,
        tagLabel,
        framework,
      });
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!stateRef.current.isVisible || !stateRef.current.inspectMode) {
        return;
      }
      if (isEventFromOverlay(event)) {
        return;
      }

      const rawTarget = event.target;
      const targetEl =
        rawTarget instanceof HTMLElement
          ? rawTarget
          : rawTarget instanceof Element
            ? (rawTarget.closest('*') as HTMLElement | null)
            : null;

      if (!targetEl || targetEl === document.documentElement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      const currentConfig = stateRef.current.maskingConfig;
      const metadata = extractElementMetadata(targetEl);
      const autoMask =
        isElementMatchedByMaskSelectors(targetEl, currentConfig.maskSelectors) ||
        currentConfig.maskAllText;

      setHoveredInfo(null);
      setPopover({
        targetEl,
        metadata,
        instruction: '',
        maskText: autoMask,
        editingAnnotationId: null,
      });
    };

    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('click', handleClickCapture, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('click', handleClickCapture, true);
    };
  }, [isEventFromOverlay]);

  // Keyboard shortcuts: Alt+S, Escape, Alt+ArrowUp, Alt+ArrowDown
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Alt + S (or Option + S) toggles inspectMode
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.code === 'KeyS' || event.key.toLowerCase() === 's')
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (!stateRef.current.isVisible) {
          void updateAndPersistState({ isVisible: true, inspectMode: true });
        } else {
          void handleToggleInspectMode();
        }
        return;
      }

      // If overlay is not visible, don't handle any other keyboard shortcuts
      if (!stateRef.current.isVisible) {
        return;
      }

      // When popover is open: Alt+ArrowUp / Alt+ArrowDown / Escape
      if (popoverRef.current) {
        if (event.altKey && event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          handleStepParent();
          return;
        }
        if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          handleStepChild();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setPopover(null);
          return;
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (isDrawerOpenRef.current) {
          setIsDrawerOpen(false);
          return;
        }
        if (stateRef.current.inspectMode) {
          setHoveredInfo(null);
          void updateAndPersistState({ inspectMode: false });
          return;
        }
        void handleCloseOverlay();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    handleCloseOverlay,
    handleStepChild,
    handleStepParent,
    handleToggleInspectMode,
    updateAndPersistState,
  ]);

  // Recompute bounding rects on window scroll and resize
  useEffect(() => {
    const handleViewportChange = () => {
      setLayoutTick((tick) => tick + 1);
      setHoveredInfo((prev) =>
        prev
          ? {
              ...prev,
              rect: getElementRect(prev.element),
            }
          : null
      );
      setPopover((prev) => {
        if (!prev || !prev.targetEl) {
          return prev;
        }
        return {
          ...prev,
          metadata: {
            ...prev.metadata,
            rect: getElementRect(prev.targetEl),
          },
        };
      });
    };

    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  // Sync with chrome.storage.onChanged
  useEffect(() => {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage?.onChanged ||
      typeof chrome.storage.onChanged.addListener !== 'function'
    ) {
      return;
    }

    const handleStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }
      const key = getStorageKey(window.location.href);
      if (changes[key]) {
        void getPageState(window.location.href).then((freshState) => {
          setState(freshState);
        });
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
  }, []);

  // Listen to chrome.runtime.onMessage
  useEffect(() => {
    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime?.onMessage ||
      typeof chrome.runtime.onMessage.addListener !== 'function'
    ) {
      return;
    }

    const handleMessage = (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean | void => {
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return false;
      }

      const currentUrl = window.location.href;

      switch (message.type) {
        case 'GET_PAGE_STATE': {
          void getPageState(message.url || currentUrl).then((s) => {
            setState(s);
            sendResponse(s);
          });
          return true;
        }

        case 'PAGE_STATE_UPDATED': {
          if (
            message.state &&
            message.state.urlKey === normalizeUrlKey(currentUrl)
          ) {
            setState(message.state);
          }
          return false;
        }

        case 'SET_INSPECT_MODE': {
          const patch: Parameters<typeof savePageState>[1] = {
            inspectMode: message.enabled,
          };
          if (message.enabled) {
            patch.isVisible = true;
          }
          void savePageState(message.url || currentUrl, patch).then((updated) => {
            setState(updated);
            if (!message.enabled) {
              setPopover(null);
              setHoveredInfo(null);
            } else {
              setIsMinimized(false);
            }
            sendResponse(updated);
          });
          return true;
        }

        case 'TOGGLE_OVERLAY': {
          const nextVisible =
            typeof message.visible === 'boolean'
              ? message.visible
              : !stateRef.current.isVisible;
          const patch: Parameters<typeof savePageState>[1] = {
            isVisible: nextVisible,
          };
          if (!nextVisible) {
            patch.inspectMode = false;
            setPopover(null);
            setHoveredInfo(null);
            setIsDrawerOpen(false);
          } else {
            patch.inspectMode = true;
            setIsMinimized(false);
          }
          void savePageState(message.url || currentUrl, patch).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'SET_OVERLAY_VISIBLE': {
          const patch: Parameters<typeof savePageState>[1] = {
            isVisible: message.visible,
          };
          if (!message.visible) {
            patch.inspectMode = false;
            setPopover(null);
            setHoveredInfo(null);
            setIsDrawerOpen(false);
          } else {
            setIsMinimized(false);
          }
          void savePageState(message.url || currentUrl, patch).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'ADD_ANNOTATION': {
          const currentAnns = stateRef.current.annotations;
          const newAnn: AnnotationItem = {
            id: currentAnns.length + 1,
            instruction: (message.instruction || '').trim(),
            maskText: Boolean(message.maskText),
            createdAt: new Date().toISOString(),
            element: message.element,
          };
          const nextAnns = [...currentAnns, newAnn].map((a, idx) => ({
            ...a,
            id: idx + 1,
          }));
          void savePageState(message.url || currentUrl, {
            annotations: nextAnns,
          }).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'UPDATE_ANNOTATION': {
          const nextAnns = stateRef.current.annotations.map((ann) =>
            ann.id === message.id
              ? {
                  ...ann,
                  ...message.patch,
                }
              : ann
          );
          void savePageState(message.url || currentUrl, {
            annotations: nextAnns,
          }).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'DELETE_ANNOTATION': {
          const nextAnns = stateRef.current.annotations
            .filter((ann) => ann.id !== message.id)
            .map((ann, idx) => ({
              ...ann,
              id: idx + 1,
            }));
          void savePageState(message.url || currentUrl, {
            annotations: nextAnns,
          }).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'CLEAR_ANNOTATIONS': {
          void savePageState(message.url || currentUrl, {
            annotations: [],
          }).then((updated) => {
            setState(updated);
            setPopover(null);
            sendResponse(updated);
          });
          return true;
        }

        case 'UPDATE_GLOBAL_INSTRUCTION': {
          void savePageState(message.url || currentUrl, {
            globalInstruction: message.globalInstruction,
          }).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'UPDATE_MASKING_CONFIG': {
          void savePageState(message.url || currentUrl, {
            maskingConfig: message.maskingConfig,
          }).then((updated) => {
            setState(updated);
            sendResponse(updated);
          });
          return true;
        }

        case 'HIGHLIGHT_ELEMENT': {
          setHighlightTarget({
            selector: message.selector,
            id: message.id ?? null,
          });
          sendResponse({ ok: true });
          return false;
        }

        case 'SCROLL_TO_ELEMENT': {
          const matchingAnn =
            typeof message.id === 'number'
              ? stateRef.current.annotations.find((a) => a.id === message.id)
              : undefined;
          const targetEl = findElementBySelectorOrXPath(
            message.selector,
            matchingAnn?.element.xpath,
            document
          );
          if (targetEl && typeof targetEl.scrollIntoView === 'function') {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setHighlightTarget({
            selector: message.selector,
            id: message.id ?? null,
          });
          setLayoutTick((t) => t + 1);
          sendResponse({ ok: Boolean(targetEl) });
          return false;
        }

        case 'GET_LIVE_PAGE_CONTEXT': {
          sendResponse({
            url: window.location.href,
            title: document.title,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          });
          return false;
        }

        case 'DEVICE_EMULATION_UPDATED': {
          if (message.config) {
            setEmulationConfig(message.config);
          }
          sendResponse({ ok: true });
          return false;
        }

        case 'START_RECORDING': {
          if (!recordingControllerRef.current?.getIsRecording()) {
            recordingControllerRef.current?.startRecording();
            setIsRecording(true);
          }
          sendResponse({ ok: true });
          return false;
        }

        case 'STOP_RECORDING': {
          if (recordingControllerRef.current?.getIsRecording()) {
            void handleToggleRecording();
          }
          sendResponse({ ok: true });
          return false;
        }

        default:
          return false;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Compute live bounding rects for annotated elements
  const renderedAnnotations = useMemo(() => {
    void layoutTick;
    return state.annotations.map((ann) => {
      const maskedAnn = applyMaskingToAnnotation(ann, state.maskingConfig);
      const liveEl = findElementBySelectorOrXPath(
        ann.element.selector,
        ann.element.xpath,
        document
      );
      const rect = liveEl ? getElementRect(liveEl) : ann.element.rect;
      return {
        raw: ann,
        masked: maskedAnn,
        liveEl,
        rect,
      };
    });
  }, [state.annotations, state.maskingConfig, layoutTick]);

  // Compute Playwright-style visual mask overlays
  const visualMaskRects = useMemo(() => {
    void layoutTick;
    if (!state.maskingConfig.visualMaskEnabled) {
      return [];
    }

    const selectorMatchedElements = findMaskedElementsOnPage(
      document,
      state.maskingConfig.maskSelectors
    );
    const seenElements = new Set<HTMLElement>();
    const results: Array<{
      key: string;
      rect: ElementRect;
      selector: string;
    }> = [];

    for (const el of selectorMatchedElements) {
      if (seenElements.has(el)) {
        continue;
      }
      seenElements.add(el);
      const sel = generateCssSelector(el);
      results.push({
        key: `sel-${sel}-${results.length}`,
        rect: getElementRect(el),
        selector: sel,
      });
    }

    for (const item of renderedAnnotations) {
      if (!item.raw.maskText && !state.maskingConfig.maskAllText) {
        continue;
      }
      if (item.liveEl) {
        if (seenElements.has(item.liveEl)) {
          continue;
        }
        seenElements.add(item.liveEl);
      }
      results.push({
        key: `ann-${item.raw.id}`,
        rect: item.rect,
        selector: item.raw.element.selector,
      });
    }

    return results;
  }, [
    state.maskingConfig.visualMaskEnabled,
    state.maskingConfig.maskSelectors,
    state.maskingConfig.maskAllText,
    renderedAnnotations,
    layoutTick,
  ]);

  // Compute active highlight box from Side Panel
  const activeHighlightRect = useMemo(() => {
    void layoutTick;
    if (!highlightTarget.selector && !highlightTarget.id) {
      return null;
    }

    if (highlightTarget.id !== null) {
      const foundAnn = renderedAnnotations.find(
        (a) => a.raw.id === highlightTarget.id
      );
      if (foundAnn) {
        return foundAnn.rect;
      }
    }

    if (highlightTarget.selector) {
      const el = findElementBySelectorOrXPath(
        highlightTarget.selector,
        undefined,
        document
      );
      if (el) {
        return getElementRect(el);
      }
    }

    return null;
  }, [highlightTarget, renderedAnnotations, layoutTick]);

  const parentCandidate = popover?.targetEl
    ? getParentCandidate(popover.targetEl)
    : null;
  const childCandidate = popover?.targetEl
    ? getFirstChildCandidate(popover.targetEl)
    : null;

  const popoverPosition = popover
    ? computePopoverPosition(
        popover.metadata.rect,
        undefined,
        isMinimized ? 54 : 72
      )
    : null;

  const maskColor = state.maskingConfig.maskColor || '#FF00FF';
  const maskStripeBg = `repeating-linear-gradient(45deg, ${hexToRgba(
    maskColor,
    0.2
  )}, ${hexToRgba(maskColor, 0.2)} 8px, ${hexToRgba(
    maskColor,
    0.36
  )} 8px, ${hexToRgba(maskColor, 0.36)} 16px)`;

  if (state.isVisible === false) {
    return null;
  }

  return (
    <div
      ref={overlayRootRef}
      className="dpa-overlay-root"
      data-testid="dpa-overlay-root"
    >
      {/* Playwright-style Visual Mask overlays */}
      {visualMaskRects.map((mask) => (
        <div
          key={mask.key}
          className="dpa-visual-mask"
          data-testid="dpa-visual-mask"
          data-mask-selector={mask.selector}
          style={{
            left: `${mask.rect.x}px`,
            top: `${mask.rect.y}px`,
            width: `${mask.rect.width}px`,
            height: `${mask.rect.height}px`,
            borderColor: maskColor,
            background: maskStripeBg,
          }}
        >
          <span
            className="dpa-visual-mask-tag"
            style={{ backgroundColor: maskColor }}
          >
            MASKED
          </span>
        </div>
      ))}

      {/* Annotated elements outlines and numbered badges */}
      {renderedAnnotations.map(({ raw, rect }) => {
        const isHighlighted =
          highlightTarget.id === raw.id ||
          (highlightTarget.selector !== null &&
            highlightTarget.selector === raw.element.selector);
        const isMasked =
          raw.maskText ||
          state.maskingConfig.maskAllText ||
          (raw.element &&
            isElementMatchedByMaskSelectors(
              findElementBySelectorOrXPath(
                raw.element.selector,
                raw.element.xpath,
                document
              ),
              state.maskingConfig.maskSelectors
            ));

        return (
          <React.Fragment key={raw.id}>
            <div
              className={`dpa-annotation-outline ${
                isHighlighted ? 'dpa-annotation-outline--active' : ''
              }`}
              data-testid={`dpa-annotation-outline-${raw.id}`}
              style={{
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
              }}
            />
            <button
              type="button"
              className={`dpa-annotation-badge ${
                isMasked ? 'dpa-annotation-badge--masked' : ''
              }`}
              data-testid={`dpa-badge-${raw.id}`}
              title={raw.instruction || `Annotation #${raw.id}`}
              style={{
                left: `${Math.max(4, rect.x - 10)}px`,
                top: `${Math.max(4, rect.y - 12)}px`,
              }}
              onClick={(e) => handleOpenBadgePopover(raw, e)}
            >
              #{raw.id}
            </button>
          </React.Fragment>
        );
      })}

      {/* Active highlight ring from Side Panel */}
      {activeHighlightRect && (
        <div
          className="dpa-active-highlight-ring"
          data-testid="dpa-active-highlight-ring"
          style={{
            left: `${activeHighlightRect.x - 2}px`,
            top: `${activeHighlightRect.y - 2}px`,
            width: `${activeHighlightRect.width + 4}px`,
            height: `${activeHighlightRect.height + 4}px`,
          }}
        />
      )}

      {/* Hover highlight box and tooltip when inspectMode is active */}
      {state.inspectMode && hoveredInfo && !popover && (
        <>
          <div
            className="dpa-hover-box"
            data-testid="dpa-hover-box"
            style={{
              left: `${hoveredInfo.rect.x}px`,
              top: `${hoveredInfo.rect.y}px`,
              width: `${hoveredInfo.rect.width}px`,
              height: `${hoveredInfo.rect.height}px`,
            }}
          />
          <div
            className="dpa-hover-tooltip"
            data-testid="dpa-hover-tooltip"
            style={{
              left: `${Math.max(8, hoveredInfo.rect.x)}px`,
              top: `${Math.max(8, hoveredInfo.rect.y - 30)}px`,
            }}
          >
            <span>{hoveredInfo.tagLabel}</span>
            {hoveredInfo.framework.componentName && (
              <span
                className={`dpa-framework-badge ${
                  hoveredInfo.framework.detected === 'vue'
                    ? 'dpa-framework-badge--vue'
                    : ''
                }`}
              >
                [
                {hoveredInfo.framework.detected === 'vue' ? 'Vue' : 'React'}:{' '}
                {hoveredInfo.framework.componentName}]
              </span>
            )}
          </div>
        </>
      )}

      {/* Selected target highlight & In-Page Annotation Popover */}
      {popover && popoverPosition && (
        <>
          <div
            className="dpa-selected-target-box"
            data-testid="dpa-selected-target-box"
            style={{
              left: `${popover.metadata.rect.x}px`,
              top: `${popover.metadata.rect.y}px`,
              width: `${popover.metadata.rect.width}px`,
              height: `${popover.metadata.rect.height}px`,
            }}
          />
          <div
            className="dpa-popover"
            data-testid="dpa-popover"
            style={{
              top: `${popoverPosition.top}px`,
              left: `${popoverPosition.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dpa-popover-header">
              <div className="dpa-popover-title-row">
                <span
                  className="dpa-popover-tag"
                  data-testid="dpa-popover-tag"
                >
                  {formatElementTagLabel(
                    popover.metadata.tagName,
                    popover.metadata.id,
                    popover.metadata.className
                  )}
                </span>
                {popover.metadata.framework?.componentName && (
                  <span
                    className={`dpa-framework-badge ${
                      popover.metadata.framework.detected === 'vue'
                        ? 'dpa-framework-badge--vue'
                        : ''
                    }`}
                    data-testid="dpa-popover-framework"
                  >
                    {popover.metadata.framework.detected === 'vue' ? '💚' : '⚛️'}{' '}
                    {popover.metadata.framework.componentName}
                  </span>
                )}
              </div>
              <div
                className="dpa-popover-selector"
                data-testid="dpa-popover-selector"
                title={popover.metadata.selector}
              >
                {popover.metadata.selector}
              </div>
            </div>

            {/* DOM Hierarchy Adjustment Buttons */}
            <div className="dpa-hierarchy-bar">
              <button
                type="button"
                className="dpa-hierarchy-btn"
                data-testid="dpa-btn-parent"
                disabled={!parentCandidate}
                onClick={handleStepParent}
                title="Alt + ArrowUp"
              >
                ↑ 親要素 (Parent)
              </button>
              <button
                type="button"
                className="dpa-hierarchy-btn"
                data-testid="dpa-btn-child"
                disabled={!childCandidate}
                onClick={handleStepChild}
                title="Alt + ArrowDown"
              >
                ↓ 子要素 (Child)
              </button>
            </div>

            {/* Playwright-style Mask Text Toggle */}
            <label className="dpa-mask-toggle-row">
              <input
                type="checkbox"
                data-testid="dpa-checkbox-mask-text"
                checked={popover.maskText}
                onChange={(e) =>
                  setPopover((prev) =>
                    prev ? { ...prev, maskText: e.target.checked } : null
                  )
                }
              />
              <span>文章をマスク (Playwright風 Mask Text)</span>
            </label>

            {/* Instruction Input */}
            <textarea
              ref={textareaRef}
              className="dpa-textarea"
              data-testid="dpa-textarea-instruction"
              placeholder="この要素に対する修正指示を入力... (Ctrl/Cmd+Enterで確定)"
              value={popover.instruction}
              onChange={(e) =>
                setPopover((prev) =>
                  prev ? { ...prev, instruction: e.target.value } : null
                )
              }
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSavePopover();
                }
              }}
            />

            {/* Popover Action Buttons */}
            <div className="dpa-popover-actions">
              {popover.editingAnnotationId !== null && (
                <button
                  type="button"
                  className="dpa-btn dpa-btn-delete"
                  data-testid="dpa-btn-delete"
                  onClick={() =>
                    void handleDeleteAnnotation(popover.editingAnnotationId!)
                  }
                >
                  削除
                </button>
              )}
              <button
                type="button"
                className="dpa-btn dpa-btn-cancel"
                data-testid="dpa-btn-cancel"
                onClick={() => setPopover(null)}
              >
                キャンセル (Esc)
              </button>
              <button
                type="button"
                className="dpa-btn dpa-btn-save"
                data-testid="dpa-btn-save"
                onClick={() => void handleSavePopover()}
              >
                追加 / 保存 (Ctrl+Enter)
              </button>
            </div>
          </div>
        </>
      )}

      {/* Annotation & Settings Drawer */}
      <AnnotationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        annotations={state.annotations}
        globalInstruction={state.globalInstruction}
        maskingConfig={state.maskingConfig}
        onUpdateGlobalInstruction={handleUpdateGlobalInstruction}
        onUpdateMaskingConfig={handleUpdateMaskingConfig}
        onDeleteAnnotation={handleDeleteAnnotation}
        onClearAnnotations={handleClearAnnotations}
        onScrollToElement={handleScrollToElement}
        onSelectAnnotation={(ann) => {
          const resolvedEl = findElementBySelectorOrXPath(
            ann.element.selector,
            ann.element.xpath,
            document
          );
          setPopover({
            targetEl: resolvedEl,
            metadata: resolvedEl
              ? extractElementMetadata(resolvedEl)
              : ann.element,
            instruction: ann.instruction,
            maskText: ann.maskText,
            editingAnnotationId: ann.id,
          });
          setIsDrawerOpen(false);
        }}
      />

      {/* Figma UI3 Floating Bottom Bar */}
      <FloatingBottomBar
        inspectMode={state.inspectMode}
        onToggleInspectMode={handleToggleInspectMode}
        annotationCount={state.annotations.length}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
        isMinimized={isMinimized}
        onToggleMinimize={() => setIsMinimized((prev) => !prev)}
        emulationConfig={emulationConfig}
        onSetDeviceEmulation={handleSetDeviceEmulation}
        onClearDeviceEmulation={handleClearDeviceEmulation}
        onCopyPrompt={handleCopyPrompt}
        isCopied={isCopied}
        isRecording={isRecording}
        recordingDurationMs={recordingDurationMs}
        onToggleRecording={handleToggleRecording}
        onClose={handleCloseOverlay}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="dpa-toast-alert" data-testid="dpa-toast-alert">
          {!/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(toastMessage) && (
            <span className="dpa-icon-check">✓</span>
          )}
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
