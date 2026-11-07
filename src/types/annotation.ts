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

export interface AnnotationItem {
  id: number;
  instruction: string;
  maskText: boolean;
  createdAt: string;
  element: ElementMetadata;
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
  globalInstruction: string;
  maskingConfig: MaskingConfig;
  annotations: AnnotationItem[];
}

export type ExtensionMessage =
  | { type: 'GET_PAGE_STATE'; url?: string }
  | { type: 'PAGE_STATE_UPDATED'; state: PageAnnotationState }
  | { type: 'SET_INSPECT_MODE'; enabled: boolean; url?: string }
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
  | { type: 'GET_LIVE_PAGE_CONTEXT' };
