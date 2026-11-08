export interface MaskingConfig {
  autoMaskPII: boolean;
  maskAllText: boolean;
  maskSelectors: string[];
  maskColor: string;
  visualMaskEnabled: boolean;
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  autoMaskPII: true,
  maskAllText: false,
  maskSelectors: ['input[type="password"]', '[data-mask="true"]'],
  maskColor: '#FF00FF',
  visualMaskEnabled: true,
};

export interface FrameworkSourceLocation {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface FrameworkMetadata {
  detected: 'react' | 'vue' | null;
  componentName: string | null;
  componentHierarchy: string[];
  source: FrameworkSourceLocation | null;
}

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementMetadata {
  tagName: string;
  id: string;
  className: string;
  selector: string;
  xpath: string;
  attributes: Record<string, string>;
  textContent: string;
  outerHTMLSnippet: string;
  rect: ElementRect;
  computedStyles: Record<string, string>;
  framework: FrameworkMetadata | null;
}

export type UserActionKind =
  | 'click'
  | 'input'
  | 'scroll'
  | 'navigation'
  | 'mutation_add'
  | 'mutation_remove';

export interface UserActionLogEntry {
  id: string;
  offsetMs: number;
  kind: UserActionKind;
  targetSelector: string;
  targetLabel?: string;
  summary: string;
  inputValue?: string;
  scrollPosition?: { x: number; y: number };
  elementSnapshot?: {
    tagName: string;
    id?: string;
    className?: string;
    textContent?: string;
    outerHTML?: string;
  };
}

export interface AnnotationItem {
  id: number;
  instruction: string;
  maskText: boolean;
  createdAt: string;
  element: ElementMetadata;
  timestampMs?: number;
  triggerContext?: UserActionLogEntry[];
}

export interface RecordingSession {
  sessionId: string;
  url: string;
  title: string;
  createdAt: string;
  durationMs: number;
  viewport: {
    width: number;
    height: number;
  };
  globalInstruction?: string;
  maskingConfig: MaskingConfig;
  rrwebEvents: unknown[];
  actionLogs: UserActionLogEntry[];
  annotations: AnnotationItem[];
  initialDomSnapshot?: string;
}

export interface PageContext {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: string;
  globalInstruction: string;
  maskingConfig: MaskingConfig;
}

export interface ExportPayload {
  pageContext: PageContext;
  annotations: AnnotationItem[];
}

export interface PageAnnotationState {
  urlKey: string;
  inspectMode: boolean;
  isVisible?: boolean;
  globalInstruction: string;
  maskingConfig: MaskingConfig;
  annotations: AnnotationItem[];
}

export type DeviceOrientation = 'portrait' | 'landscape';

export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
}

export interface DeviceEmulationConfig {
  enabled: boolean;
  presetId: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
  orientation: DeviceOrientation;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
  },
  {
    id: 'ipad-mini',
    name: 'iPad Mini',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: true,
    touch: true,
  },
  {
    id: 'desktop',
    name: 'Desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
  },
  {
    id: 'desktop-hd',
    name: 'Desktop HD',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
  },
];

export const DEFAULT_DEVICE_EMULATION_CONFIG: DeviceEmulationConfig = {
  enabled: false,
  presetId: 'desktop',
  name: 'Desktop',
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  touch: false,
  orientation: 'portrait',
};

export type ExtensionMessage =
  | { type: 'GET_PAGE_STATE'; url?: string }
  | { type: 'PAGE_STATE_UPDATED'; state: PageAnnotationState }
  | { type: 'SET_INSPECT_MODE'; enabled: boolean; url?: string }
  | { type: 'TOGGLE_OVERLAY'; visible?: boolean; url?: string }
  | { type: 'SET_OVERLAY_VISIBLE'; visible: boolean; url?: string }
  | {
      type: 'ADD_ANNOTATION';
      element: ElementMetadata;
      instruction?: string;
      maskText?: boolean;
      url?: string;
    }
  | {
      type: 'UPDATE_ANNOTATION';
      id: number;
      patch: Partial<Pick<AnnotationItem, 'instruction' | 'maskText' | 'element'>>;
      url?: string;
    }
  | { type: 'DELETE_ANNOTATION'; id: number; url?: string }
  | { type: 'CLEAR_ANNOTATIONS'; url?: string }
  | { type: 'UPDATE_GLOBAL_INSTRUCTION'; globalInstruction: string; url?: string }
  | {
      type: 'UPDATE_MASKING_CONFIG';
      maskingConfig: Partial<MaskingConfig>;
      url?: string;
    }
  | { type: 'HIGHLIGHT_ELEMENT'; selector: string | null; id?: number | null }
  | { type: 'SCROLL_TO_ELEMENT'; selector: string; id?: number }
  | { type: 'GET_LIVE_PAGE_CONTEXT' }
  | {
      type: 'SET_DEVICE_EMULATION';
      tabId?: number;
      config: Partial<DeviceEmulationConfig>;
    }
  | { type: 'CLEAR_DEVICE_EMULATION'; tabId?: number }
  | { type: 'GET_DEVICE_EMULATION'; tabId?: number }
  | {
      type: 'DEVICE_EMULATION_UPDATED';
      tabId?: number;
      config: DeviceEmulationConfig;
      reason?: string;
    }
  | { type: 'START_RECORDING'; url?: string }
  | { type: 'STOP_RECORDING'; url?: string }
  | {
      type: 'SAVE_RECORDING_SESSION';
      session: RecordingSession;
      openStudioTab?: boolean;
    }
  | { type: 'GET_RECORDING_SESSION'; sessionId: string }
  | {
      type: 'SAVE_STUDIO_ANNOTATION';
      sessionId: string;
      annotation: AnnotationItem;
    }
  | {
      type: 'DELETE_STUDIO_ANNOTATION';
      sessionId: string;
      annotationId: number;
    }
  | {
      type: 'UPDATE_STUDIO_SESSION';
      sessionId: string;
      patch: Partial<RecordingSession>;
    };
