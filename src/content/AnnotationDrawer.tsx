import React, { useState } from 'react';
import {
  FileCode2,
  FileText,
  LocateFixed,
  Plus,
  Shield,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react';
import {
  AnnotationItem,
  MaskingConfig,
} from '../types/annotation';
import { formatElementSummaryTag, formatFrameworkSource } from '../utils/promptFormatter';

export type DrawerTab = 'annotations' | 'context' | 'privacy';

export interface AnnotationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: AnnotationItem[];
  globalInstruction: string;
  maskingConfig: MaskingConfig;
  onUpdateGlobalInstruction: (instruction: string) => void;
  onUpdateMaskingConfig: (config: Partial<MaskingConfig>) => void;
  onDeleteAnnotation: (id: number) => void;
  onClearAnnotations: () => void;
  onScrollToElement: (selector: string, id: number) => void;
  onSelectAnnotation?: (annotation: AnnotationItem) => void;
}

export const AnnotationDrawer: React.FC<AnnotationDrawerProps> = ({
  isOpen,
  onClose,
  annotations,
  globalInstruction,
  maskingConfig,
  onUpdateGlobalInstruction,
  onUpdateMaskingConfig,
  onDeleteAnnotation,
  onClearAnnotations,
  onScrollToElement,
  onSelectAnnotation,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('annotations');
  const [newSelectorInput, setNewSelectorInput] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleAddSelector = () => {
    const trimmed = newSelectorInput.trim();
    if (!trimmed) return;
    const current = maskingConfig.maskSelectors || [];
    if (!current.includes(trimmed)) {
      onUpdateMaskingConfig({
        maskSelectors: [...current, trimmed],
      });
    }
    setNewSelectorInput('');
  };

  const handleRemoveSelector = (selectorToRemove: string) => {
    const current = maskingConfig.maskSelectors || [];
    onUpdateMaskingConfig({
      maskSelectors: current.filter((s) => s !== selectorToRemove),
    });
  };

  return (
    <div
      className="dpa-drawer"
      data-testid="dpa-drawer"
      role="dialog"
      aria-label="指示一覧 & 設定ドロワー"
    >
      {/* Drawer Header */}
      <div className="dpa-drawer-header">
        <div className="dpa-drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'annotations'}
            className={`dpa-drawer-tab ${
              activeTab === 'annotations' ? 'dpa-drawer-tab--active' : ''
            }`}
            data-testid="dpa-drawer-tab-annotations"
            onClick={() => setActiveTab('annotations')}
          >
            <FileCode2 className="dpa-icon-xs" />
            <span>指示一覧</span>
            <span className="dpa-drawer-tab-badge">{annotations.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'context'}
            className={`dpa-drawer-tab ${
              activeTab === 'context' ? 'dpa-drawer-tab--active' : ''
            }`}
            data-testid="dpa-drawer-tab-context"
            onClick={() => setActiveTab('context')}
          >
            <FileText className="dpa-icon-xs" />
            <span>共通前提</span>
            {Boolean(globalInstruction?.trim()) && (
              <span className="dpa-drawer-tab-dot" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'privacy'}
            className={`dpa-drawer-tab ${
              activeTab === 'privacy' ? 'dpa-drawer-tab--active' : ''
            }`}
            data-testid="dpa-drawer-tab-privacy"
            onClick={() => setActiveTab('privacy')}
          >
            <Shield className="dpa-icon-xs" />
            <span>マスキング</span>
          </button>
        </div>

        <button
          type="button"
          className="dpa-drawer-close-btn"
          data-testid="dpa-drawer-close-btn"
          onClick={onClose}
          aria-label="ドロワーを閉じる"
        >
          <X className="dpa-icon-sm" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="dpa-drawer-body">
        {/* TAB 1: 指示一覧 (Annotations) */}
        {activeTab === 'annotations' && (
          <div className="dpa-drawer-tab-content" data-testid="dpa-drawer-content-annotations">
            {annotations.length === 0 ? (
              <div className="dpa-drawer-empty-state">
                <Sparkles className="dpa-drawer-empty-icon" />
                <div className="dpa-drawer-empty-title">
                  アノテーション指示はありません
                </div>
                <div className="dpa-drawer-empty-desc">
                  画面上の要素をホバー & クリックして、AIへのUI修正指示を追加してください。
                </div>
              </div>
            ) : (
              <div className="dpa-drawer-list">
                <div className="dpa-drawer-list-header">
                  <span className="dpa-drawer-list-count">
                    登録済み: {annotations.length} 件
                  </span>
                  <button
                    type="button"
                    className="dpa-btn-text-danger"
                    data-testid="dpa-drawer-clear-all"
                    onClick={onClearAnnotations}
                  >
                    すべてクリア
                  </button>
                </div>

                {annotations.map((ann) => {
                  const tagLabel = formatElementSummaryTag(ann.element);
                  const fwLabel = formatFrameworkSource(ann.element);

                  return (
                    <div
                      key={ann.id}
                      className="dpa-annotation-card"
                      data-testid={`annotation-card-${ann.id}`}
                      onClick={() => onSelectAnnotation?.(ann)}
                    >
                      <div className="dpa-annotation-card-top">
                        <span className="dpa-annotation-id-badge">#{ann.id}</span>
                        <span
                          className="dpa-annotation-tag"
                          title={ann.element.selector}
                        >
                          {tagLabel}
                        </span>
                        {fwLabel && (
                          <span
                            className="dpa-annotation-fw-badge"
                            title={fwLabel}
                          >
                            ⚛️ {fwLabel}
                          </span>
                        )}
                        {ann.maskText && (
                          <span className="dpa-annotation-mask-badge">伏字</span>
                        )}
                      </div>

                      <div className="dpa-annotation-instruction">
                        {ann.instruction && ann.instruction.trim()
                          ? ann.instruction
                          : '(指示未入力)'}
                      </div>

                      <div className="dpa-annotation-card-actions">
                        <span className="dpa-annotation-selector-mono">
                          {ann.element.selector}
                        </span>
                        <div className="dpa-annotation-card-btns">
                          <button
                            type="button"
                            className="dpa-btn-icon"
                            data-testid={`dpa-drawer-jump-${ann.id}`}
                            title="該当要素へスクロール & ハイライト"
                            onClick={(e) => {
                              e.stopPropagation();
                              onScrollToElement(ann.element.selector, ann.id);
                            }}
                          >
                            <LocateFixed className="dpa-icon-xs" />
                            <span>ジャンプ</span>
                          </button>
                          <button
                            type="button"
                            className="dpa-btn-icon dpa-btn-icon--danger"
                            data-testid={`dpa-drawer-delete-${ann.id}`}
                            title="指示を削除"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAnnotation(ann.id);
                            }}
                          >
                            <Trash2 className="dpa-icon-xs" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 共通前提 (Context) */}
        {activeTab === 'context' && (
          <div className="dpa-drawer-tab-content" data-testid="dpa-drawer-content-context">
            <div className="dpa-context-desc">
              ページ全体に対する前提プロンプトや共通要件（フレームワーク指定、レスポンシブ要件、アクセシビリティルール等）を設定します。
            </div>

            <div className="dpa-textarea-wrap">
              <textarea
                className="dpa-drawer-textarea"
                data-testid="dpa-drawer-global-instruction"
                rows={5}
                placeholder="例:&#10;- Next.js App Router + Tailwind CSS で実装&#10;- モバイルファーストでレスポンシブ崩れを修正&#10;- アクセシビリティ (WCAG 2.1 AA) に準拠"
                value={globalInstruction}
                onChange={(e) => onUpdateGlobalInstruction(e.target.value)}
              />
            </div>

            <div className="dpa-presets-row">
              <span className="dpa-presets-label">クイック挿入:</span>
              <button
                type="button"
                className="dpa-preset-chip"
                onClick={() => {
                  const addition = 'Tailwind CSS を使用してリファクタリングしてください。';
                  onUpdateGlobalInstruction(
                    globalInstruction ? `${globalInstruction}\n- ${addition}` : `- ${addition}`
                  );
                }}
              >
                + Tailwind CSS
              </button>
              <button
                type="button"
                className="dpa-preset-chip"
                onClick={() => {
                  const addition = 'スマートフォン表示（幅375px）での崩れを最優先で修正してください。';
                  onUpdateGlobalInstruction(
                    globalInstruction ? `${globalInstruction}\n- ${addition}` : `- ${addition}`
                  );
                }}
              >
                + モバイル対応
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: マスキング (Privacy) */}
        {activeTab === 'privacy' && (
          <div className="dpa-drawer-tab-content" data-testid="dpa-drawer-content-privacy">
            <div className="dpa-privacy-toggles">
              {/* PII Masking */}
              <label className="dpa-toggle-row">
                <input
                  type="checkbox"
                  data-testid="dpa-drawer-toggle-pii"
                  checked={Boolean(maskingConfig.autoMaskPII)}
                  onChange={(e) =>
                    onUpdateMaskingConfig({ autoMaskPII: e.target.checked })
                  }
                />
                <div className="dpa-toggle-text">
                  <div className="dpa-toggle-title">
                    PII自動検出マスク (autoMaskPII)
                  </div>
                  <div className="dpa-toggle-subtitle">
                    氏名、メールアドレス、電話番号、JWTトークン、秘密鍵等を自動的に [MASKED] に置換
                  </div>
                </div>
              </label>

              {/* Mask All Text */}
              <label className="dpa-toggle-row">
                <input
                  type="checkbox"
                  data-testid="dpa-drawer-toggle-mask-all"
                  checked={Boolean(maskingConfig.maskAllText)}
                  onChange={(e) =>
                    onUpdateMaskingConfig({ maskAllText: e.target.checked })
                  }
                />
                <div className="dpa-toggle-text">
                  <div className="dpa-toggle-title">
                    全文テキストマスク (maskAllText)
                  </div>
                  <div className="dpa-toggle-subtitle">
                    ページ内のすべてのDOMテキストを一括で [MASKED] に伏字化（構造・CSSのみ送信）
                  </div>
                </div>
              </label>

              {/* Visual Mask Display */}
              <label className="dpa-toggle-row">
                <input
                  type="checkbox"
                  data-testid="dpa-drawer-toggle-visual-mask"
                  checked={Boolean(maskingConfig.visualMaskEnabled)}
                  onChange={(e) =>
                    onUpdateMaskingConfig({ visualMaskEnabled: e.target.checked })
                  }
                />
                <div className="dpa-toggle-text">
                  <div className="dpa-toggle-title">
                    視覚的マスク枠の表示 (Visual Mask Overlay)
                  </div>
                  <div className="dpa-toggle-subtitle">
                    マスク対象要素の周囲にハイライト枠と [MASKED] タグを表示
                  </div>
                </div>
              </label>
            </div>

            {/* Custom Selectors */}
            <div className="dpa-custom-selectors-section">
              <div className="dpa-section-label">カスタム伏字セレクタ</div>
              <div className="dpa-add-selector-row">
                <input
                  type="text"
                  className="dpa-input-text"
                  data-testid="dpa-drawer-add-selector-input"
                  placeholder="例: input[type='password'], .confidential"
                  value={newSelectorInput}
                  onChange={(e) => setNewSelectorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSelector();
                    }
                  }}
                />
                <button
                  type="button"
                  className="dpa-btn dpa-btn-primary"
                  data-testid="dpa-drawer-add-selector-btn"
                  onClick={handleAddSelector}
                >
                  <Plus className="dpa-icon-xs" />
                  <span>追加</span>
                </button>
              </div>

              <div className="dpa-selector-chips">
                {(maskingConfig.maskSelectors || []).map((selector, index) => (
                  <span
                    key={selector}
                    className="dpa-selector-chip"
                    data-testid={`dpa-selector-chip-${index}`}
                  >
                    <code>{selector}</code>
                    <button
                      type="button"
                      className="dpa-chip-remove-btn"
                      data-testid={`dpa-drawer-remove-selector-${index}`}
                      onClick={() => handleRemoveSelector(selector)}
                      aria-label={`${selector} を削除`}
                    >
                      <X className="dpa-icon-xs" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
