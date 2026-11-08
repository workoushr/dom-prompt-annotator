import {
  MaskingConfig,
  RecordingSession,
  UserActionLogEntry,
} from '../types/annotation';
import { generateCssSelector } from './domExtractor';
import { SHADOW_HOST_ID } from '../utils/masker';
import { record } from 'rrweb';

export interface RecordingControllerOptions {
  getMaskingConfig?: () => MaskingConfig;
  getGlobalInstruction?: () => string;
  onDurationTick?: (durationMs: number) => void;
  onStatusChange?: (isRecording: boolean) => void;
}

export class RecordingController {
  private isRecording = false;
  private startTime = 0;
  private timerId: number | null = null;
  private actionLogs: UserActionLogEntry[] = [];
  private mutationObserver: MutationObserver | null = null;
  private initialDomSnapshot = '';
  private rrwebStopFn: (() => void) | null = null;
  private rrwebEvents: any[] = [];
  private lastScrollTime = 0;
  private options: RecordingControllerOptions;

  constructor(options: RecordingControllerOptions = {}) {
    this.options = options;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getDurationMs(): number {
    if (!this.isRecording) {
      return 0;
    }
    return Math.max(0, Date.now() - this.startTime);
  }

  public getActionLogs(): UserActionLogEntry[] {
    return [...this.actionLogs];
  }

  public startRecording(): void {
    if (this.isRecording) {
      return;
    }

    this.isRecording = true;
    this.startTime = Date.now();
    this.actionLogs = [];

    // Capture initial DOM snapshot for studio iframe/replay preview
    try {
      if (typeof document !== 'undefined') {
        const docClone = document.documentElement.cloneNode(true) as HTMLElement;
        const host = docClone.querySelector(`#${SHADOW_HOST_ID}`);
        if (host) {
          host.remove();
        }
        this.initialDomSnapshot = docClone.outerHTML;
      }
    } catch {
      this.initialDomSnapshot = '';
    }

    // Start rrweb record session
    try {
      this.rrwebEvents = [];
      if (typeof record === 'function') {
        const hasCanvas =
          typeof HTMLCanvasElement !== 'undefined' &&
          typeof CanvasRenderingContext2D !== 'undefined';
        this.rrwebStopFn =
          record({
            emit: (event) => {
              this.rrwebEvents.push(event);
            },
            blockSelector: `#${SHADOW_HOST_ID}`,
            recordCanvas: hasCanvas,
          }) || null;
      }
    } catch (err) {
      console.warn('[DPA] rrweb record failed to initialize:', err);
    }

    // Attach user action listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('click', this.handleClickCapture, true);
      window.addEventListener('input', this.handleInputCapture, true);
      window.addEventListener('scroll', this.handleScrollCapture, true);
    }

    // Start MutationObserver for dynamic UI (toasts, modals, dropdowns)
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      this.mutationObserver = new MutationObserver((mutations) => {
        this.handleMutations(mutations);
      });

      if (document.body) {
        this.mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    }

    // Start interval timer for duration counter
    if (typeof window !== 'undefined') {
      this.timerId = window.setInterval(() => {
        if (this.options.onDurationTick) {
          this.options.onDurationTick(this.getDurationMs());
        }
      }, 100);
    }

    if (this.options.onStatusChange) {
      this.options.onStatusChange(true);
    }
  }

  public stopRecording(
    extraData?: {
      annotations?: RecordingSession['annotations'];
      maskingConfig?: MaskingConfig;
      globalInstruction?: string;
    }
  ): RecordingSession {
    if (!this.isRecording) {
      throw new Error('Recording is not in progress');
    }

    const durationMs = Math.max(100, Date.now() - this.startTime);
    this.isRecording = false;

    // Stop rrweb recording
    if (this.rrwebStopFn) {
      try {
        this.rrwebStopFn();
      } catch {
        // ignore
      }
      this.rrwebStopFn = null;
    }

    // Cleanup listeners and observers
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', this.handleClickCapture, true);
      window.removeEventListener('input', this.handleInputCapture, true);
      window.removeEventListener('scroll', this.handleScrollCapture, true);
      if (this.timerId !== null) {
        window.clearInterval(this.timerId);
        this.timerId = null;
      }
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = typeof document !== 'undefined' ? document.title : '';
    const viewport = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1280,
      height: typeof window !== 'undefined' ? window.innerHeight : 720,
    };

    const maskingConfig =
      extraData?.maskingConfig ??
      this.options.getMaskingConfig?.() ?? {
        autoMaskPII: true,
        maskAllText: false,
        maskSelectors: ['input[type="password"]', '[data-mask="true"]'],
        maskColor: '#FF00FF',
        visualMaskEnabled: true,
      };

    const globalInstruction =
      extraData?.globalInstruction ??
      this.options.getGlobalInstruction?.() ??
      '';

    const session: RecordingSession = {
      sessionId,
      url,
      title,
      createdAt: new Date().toISOString(),
      durationMs,
      viewport,
      globalInstruction,
      maskingConfig,
      rrwebEvents: [...this.rrwebEvents],
      actionLogs: [...this.actionLogs],
      annotations: extraData?.annotations ? [...extraData.annotations] : [],
      initialDomSnapshot: this.initialDomSnapshot,
    };

    if (this.options.onStatusChange) {
      this.options.onStatusChange(false);
    }

    return session;
  }

  private handleClickCapture = (e: MouseEvent): void => {
    if (!this.isRecording) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Ignore events from DPA's own Shadow DOM UI
    if (target.closest(`#${SHADOW_HOST_ID}`) || target.id === SHADOW_HOST_ID) {
      return;
    }

    const offsetMs = Math.max(0, Date.now() - this.startTime);
    const selector = generateCssSelector(target);
    const tag = (target.tagName || 'ELEMENT').toLowerCase();
    const label =
      (target.textContent || '').trim().slice(0, 30) ||
      target.getAttribute('aria-label') ||
      target.getAttribute('title') ||
      '';

    this.actionLogs.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      offsetMs,
      kind: 'click',
      targetSelector: selector,
      targetLabel: label || undefined,
      summary: label
        ? `クリック: <${tag}> "${label}"`
        : `クリック: <${tag}> (\`${selector}\`)`,
      elementSnapshot: {
        tagName: tag,
        id: target.id || undefined,
        className: target.className || undefined,
        textContent: label,
      },
    });
  };

  private handleInputCapture = (e: Event): void => {
    if (!this.isRecording) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest(`#${SHADOW_HOST_ID}`) || target.id === SHADOW_HOST_ID) {
      return;
    }

    const offsetMs = Math.max(0, Date.now() - this.startTime);
    const selector = generateCssSelector(target);
    const tag = (target.tagName || 'INPUT').toLowerCase();
    const inputVal =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? target.value
        : undefined;
    const previewVal = inputVal ? ` "${inputVal.slice(0, 20)}"` : '';

    this.actionLogs.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      offsetMs,
      kind: 'input',
      targetSelector: selector,
      inputValue: inputVal,
      summary: `入力操作: <${tag}> (\`${selector}\`)${previewVal}`,
      elementSnapshot: {
        tagName: tag,
        id: target.id || undefined,
        className: target.className || undefined,
        textContent: inputVal,
      },
    });
  };

  private handleScrollCapture = (): void => {
    if (!this.isRecording) return;
    const now = Date.now();
    // Throttle 300ms
    if (now - this.lastScrollTime < 300) return;
    this.lastScrollTime = now;

    const offsetMs = Math.max(0, now - this.startTime);
    const scrollX = typeof window !== 'undefined' ? window.scrollX || window.pageXOffset || 0 : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset || 0 : 0;

    this.actionLogs.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      offsetMs,
      kind: 'scroll',
      targetSelector: 'window',
      summary: `スクロール: (X: ${Math.round(scrollX)}px, Y: ${Math.round(scrollY)}px)`,
      scrollPosition: { x: scrollX, y: scrollY },
    });
  };

  private handleMutations = (mutations: MutationRecord[]): void => {
    if (!this.isRecording) return;
    const offsetMs = Math.max(0, Date.now() - this.startTime);

    for (const mut of mutations) {
      // Added nodes (e.g. toast notification appeared)
      if (mut.addedNodes && mut.addedNodes.length > 0) {
        for (let i = 0; i < mut.addedNodes.length; i++) {
          const node = mut.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.id === SHADOW_HOST_ID || el.closest(`#${SHADOW_HOST_ID}`)) {
              continue;
            }
            const tag = (el.tagName || 'div').toLowerCase();
            const textSnippet = (el.textContent || '').trim().slice(0, 35);
            const selector = generateCssSelector(el);

            this.actionLogs.push({
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              offsetMs,
              kind: 'mutation_add',
              targetSelector: selector,
              targetLabel: textSnippet || undefined,
              summary: textSnippet
                ? `DOM要素出現: <${tag}> "${textSnippet}"`
                : `DOM要素出現: <${tag}> (\`${selector}\`)`,
              elementSnapshot: {
                tagName: tag,
                id: el.id || undefined,
                className: el.className || undefined,
                textContent: textSnippet,
              },
            });
          }
        }
      }

      // Removed nodes (e.g. toast dismissed)
      if (mut.removedNodes && mut.removedNodes.length > 0) {
        for (let i = 0; i < mut.removedNodes.length; i++) {
          const node = mut.removedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.id === SHADOW_HOST_ID || el.closest(`#${SHADOW_HOST_ID}`)) {
              continue;
            }
            const tag = (el.tagName || 'div').toLowerCase();
            this.actionLogs.push({
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              offsetMs,
              kind: 'mutation_remove',
              targetSelector: `<${tag}>`,
              summary: `DOM要素消去: <${tag}>`,
            });
          }
        }
      }
    }
  };
}
