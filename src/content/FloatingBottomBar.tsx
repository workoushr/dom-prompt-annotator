import React, { useState, useRef, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Minus,
  MousePointerClick,
  RotateCw,
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  FileCode2,
} from 'lucide-react';
import {
  DEVICE_PRESETS,
  DeviceEmulationConfig,
  DevicePreset,
} from '../types/annotation';

export interface FloatingBottomBarProps {
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  annotationCount: number;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  emulationConfig: DeviceEmulationConfig;
  onSetDeviceEmulation: (config: Partial<DeviceEmulationConfig>) => Promise<void> | void;
  onClearDeviceEmulation: () => Promise<void> | void;
  onCopyPrompt: (format?: 'markdown' | 'json') => Promise<void> | void;
  isCopied?: boolean;
  isRecording?: boolean;
  recordingDurationMs?: number;
  onToggleRecording?: () => void;
}

export const isInsideRef = (
  ref: React.RefObject<HTMLElement | null>,
  e: MouseEvent
): boolean => {
  if (!ref.current) return false;
  if (typeof e.composedPath === 'function') {
    return e.composedPath().includes(ref.current);
  }
  const target = e.target as Node;
  return ref.current.contains(target);
};

export const FloatingBottomBar: React.FC<FloatingBottomBarProps> = ({
  inspectMode,
  onToggleInspectMode,
  annotationCount,
  isDrawerOpen,
  onToggleDrawer,
  isMinimized,
  onToggleMinimize,
  emulationConfig,
  onSetDeviceEmulation,
  onClearDeviceEmulation,
  onCopyPrompt,
  isCopied = false,
  isRecording = false,
  recordingDurationMs = 0,
  onToggleRecording,
}) => {
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [copyFormatMenuOpen, setCopyFormatMenuOpen] = useState(false);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click within shadow DOM
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        deviceMenuRef.current &&
        !isInsideRef(deviceMenuRef, e)
      ) {
        setDeviceMenuOpen(false);
      }
      if (
        copyMenuRef.current &&
        !isInsideRef(copyMenuRef, e)
      ) {
        setCopyFormatMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, []);

  const handleSelectPreset = async (preset: DevicePreset) => {
    setDeviceMenuOpen(false);
    await onSetDeviceEmulation({
      presetId: preset.id,
      name: preset.name,
      width: preset.width,
      height: preset.height,
      deviceScaleFactor: preset.deviceScaleFactor,
      mobile: preset.mobile,
      touch: preset.touch,
      orientation: emulationConfig.orientation || 'portrait',
    });
  };

  const handleResetDesktop = async () => {
    setDeviceMenuOpen(false);
    await onClearDeviceEmulation();
  };

  const handleToggleOrientation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOrientation =
      emulationConfig.orientation === 'landscape' ? 'portrait' : 'landscape';
    await onSetDeviceEmulation({
      orientation: nextOrientation,
    });
  };

  // If minimized, render compact FAB pill in bottom-right corner
  if (isMinimized) {
    return (
      <div
        className="dpa-minimized-pill"
        data-testid="dpa-minimized-pill"
        onClick={onToggleMinimize}
        title="DPAツールバーを展開 (クリック)"
      >
        <span
          className={`dpa-mode-dot ${inspectMode ? 'dpa-mode-dot--active' : ''}`}
        />
        <span className="dpa-minimized-label" data-testid="dpa-mode-pill">
          🎯 DPA ({annotationCount}件)
          {inspectMode && ' [Selection Mode]'}
        </span>
        <button
          type="button"
          className="dpa-minimized-expand-btn"
          data-testid="dpa-minimized-expand-btn"
          aria-label="ツールバーを展開"
        >
          <Maximize2 className="dpa-icon-xs" />
          <span>展開 ↗</span>
        </button>
      </div>
    );
  }

  const getDeviceIcon = () => {
    if (!emulationConfig.enabled) {
      return <Smartphone className="dpa-icon-sm" />;
    }
    if (emulationConfig.mobile) {
      return <Smartphone className="dpa-icon-sm" />;
    }
    if (emulationConfig.touch) {
      return <Tablet className="dpa-icon-sm" />;
    }
    return <Monitor className="dpa-icon-sm" />;
  };

  const currentDeviceLabel = emulationConfig.enabled
    ? `${emulationConfig.name} (${emulationConfig.width}×${emulationConfig.height})`
    : 'デバイス切替';

  return (
    <div
      className="dpa-bottom-bar"
      data-testid="dpa-bottom-bar"
      role="toolbar"
      aria-label="DOM Prompt Annotator Toolbar"
    >
      {/* 1. [🔍 選択 (Alt+S)] Toggle Button */}
      <div
        className={`dpa-mode-pill-wrap ${
          inspectMode ? 'dpa-mode-pill-wrap--active' : ''
        }`}
        data-testid="dpa-mode-pill"
      >
        <button
          type="button"
          className={`dpa-btn dpa-btn-select-mode ${
            inspectMode ? 'dpa-btn-select-mode--active' : ''
          }`}
          data-testid="dpa-bottom-bar-select-btn"
          onClick={onToggleInspectMode}
          title="要素選択モードの切り替え (Alt+S)"
        >
          <MousePointerClick className="dpa-icon-sm" />
          <span className="dpa-btn-text">
            {inspectMode ? '選択中 (Selection Mode)' : '選択 (Alt+S)'}
          </span>
          <span
            className={`dpa-status-dot ${
              inspectMode ? 'dpa-status-dot--active' : ''
            }`}
          />
        </button>
      </div>

      <div className="dpa-divider" />

      {/* 2. [📱 デバイス切替] Dropdown & Rotate Button */}
      <div className="dpa-device-selector-wrap" ref={deviceMenuRef}>
        <button
          type="button"
          className={`dpa-btn dpa-btn-device ${
            emulationConfig.enabled ? 'dpa-btn-device--active' : ''
          }`}
          data-testid="dpa-bottom-bar-device-btn"
          onClick={() => setDeviceMenuOpen(!deviceMenuOpen)}
          title="Viewportエミュレーション (CDP)"
        >
          {getDeviceIcon()}
          <span className="dpa-btn-device-label">{currentDeviceLabel}</span>
          <ChevronUp
            className={`dpa-icon-xs dpa-chevron ${
              deviceMenuOpen ? 'dpa-chevron--open' : ''
            }`}
          />
        </button>

        {/* Orientation Toggle Button (↻) */}
        {emulationConfig.enabled && (
          <button
            type="button"
            className="dpa-btn dpa-btn-rotate"
            data-testid="dpa-device-rotate-btn"
            onClick={handleToggleOrientation}
            title={`画面回転 (${
              emulationConfig.orientation === 'landscape'
                ? '横向き (Landscape)'
                : '縦向き (Portrait)'
            })`}
          >
            <RotateCw className="dpa-icon-xs" />
          </button>
        )}

        {/* Device Presets Flyout Menu */}
        {deviceMenuOpen && (
          <div className="dpa-device-menu" data-testid="dpa-device-menu">
            <div className="dpa-menu-header">デバイスサイズ (CDP Viewport)</div>
            <div className="dpa-menu-items">
              {DEVICE_PRESETS.map((preset) => {
                const isSelected =
                  emulationConfig.enabled &&
                  emulationConfig.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`dpa-menu-item ${
                      isSelected ? 'dpa-menu-item--selected' : ''
                    }`}
                    data-testid={`dpa-device-preset-${preset.id}`}
                    onClick={() => void handleSelectPreset(preset)}
                  >
                    <span className="dpa-menu-item-name">{preset.name}</span>
                    <span className="dpa-menu-item-dim">
                      {preset.width} × {preset.height}
                    </span>
                    {isSelected && <Check className="dpa-icon-xs dpa-text-blue" />}
                  </button>
                );
              })}

              <div className="dpa-menu-separator" />

              <button
                type="button"
                className="dpa-menu-item dpa-menu-item-reset"
                data-testid="dpa-device-reset"
                onClick={() => void handleResetDesktop()}
              >
                <span>Desktop (実寸リセット)</span>
                {!emulationConfig.enabled && (
                  <Check className="dpa-icon-xs dpa-text-blue" />
                )}
              </button>

              <button
                type="button"
                className="dpa-menu-item"
                data-testid="dpa-device-rotate"
                onClick={handleToggleOrientation}
              >
                <div className="dpa-flex-between">
                  <span className="dpa-flex-center gap-1">
                    <RotateCw className="dpa-icon-xs" />
                    <span>縦横回転 (Orientation)</span>
                  </span>
                  <span className="dpa-menu-item-dim">
                    {emulationConfig.orientation === 'landscape'
                      ? 'Landscape'
                      : 'Portrait'}
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="dpa-divider" />

      {/* 3. [🔴 REC] Recording Toggle Button */}
      <button
        type="button"
        className={`dpa-btn dpa-btn-rec ${
          isRecording ? 'dpa-btn-rec--recording' : ''
        }`}
        data-testid="dpa-bottom-bar-rec-btn"
        title={
          isRecording
            ? '録画停止 & Studioを開く'
            : '動的UIタイムライン録画開始 (Studio)'
        }
        onClick={onToggleRecording}
      >
        <span
          className={`dpa-rec-dot ${
            isRecording ? 'dpa-rec-dot--active' : ''
          }`}
        />
        <span className="dpa-btn-text">
          {isRecording
            ? `${Math.floor(recordingDurationMs / 60000)
                .toString()
                .padStart(2, '0')}:${Math.floor((recordingDurationMs % 60000) / 1000)
                .toString()
                .padStart(2, '0')}`
            : 'REC'}
        </span>
      </button>

      <div className="dpa-divider" />

      {/* 4. [📝 指示数バッジ (例: 2件 ▲)] Drawer Toggle */}
      <button
        type="button"
        className={`dpa-btn dpa-btn-drawer ${
          annotationCount > 0 ? 'dpa-btn-drawer--has-items' : ''
        } ${isDrawerOpen ? 'dpa-btn-drawer--open' : ''}`}
        data-testid="dpa-bottom-bar-drawer-btn"
        onClick={onToggleDrawer}
        title="アノテーション指示一覧 & 設定ドロワーの開閉"
      >
        <FileCode2 className="dpa-icon-sm" />
        <span className="dpa-btn-text">{annotationCount}件</span>
        {isDrawerOpen ? (
          <ChevronDown className="dpa-icon-xs" />
        ) : (
          <ChevronUp className="dpa-icon-xs" />
        )}
      </button>

      <div className="dpa-divider" />

      {/* 5. [📋 AIプロンプトコピー] Button */}
      <div className="dpa-copy-btn-wrap" ref={copyMenuRef}>
        <button
          type="button"
          className={`dpa-btn dpa-btn-copy ${
            isCopied ? 'dpa-btn-copy--success' : ''
          }`}
          data-testid="dpa-bottom-bar-copy-btn"
          onClick={() => void onCopyPrompt('markdown')}
          title="LLM向けMarkdownプロンプトをクリップボードにコピー"
        >
          {isCopied ? (
            <Check className="dpa-icon-sm dpa-icon-check" />
          ) : (
            <Copy className="dpa-icon-sm" />
          )}
          <span className="dpa-btn-text">
            {isCopied ? 'コピー完了!' : 'プロンプトコピー'}
          </span>
        </button>

        <button
          type="button"
          className="dpa-btn dpa-btn-copy-format-toggle"
          data-testid="dpa-copy-format-toggle-btn"
          onClick={() => setCopyFormatMenuOpen(!copyFormatMenuOpen)}
          title="出力フォーマット選択 (Markdown / JSON)"
        >
          <ChevronUp
            className={`dpa-icon-xs dpa-chevron ${
              copyFormatMenuOpen ? 'dpa-chevron--open' : ''
            }`}
          />
        </button>

        {copyFormatMenuOpen && (
          <div className="dpa-copy-menu" data-testid="dpa-copy-menu">
            <button
              type="button"
              className="dpa-menu-item"
              data-testid="dpa-copy-markdown-btn"
              onClick={() => {
                setCopyFormatMenuOpen(false);
                void onCopyPrompt('markdown');
              }}
            >
              <span>Markdown形式 (プロンプト)</span>
            </button>
            <button
              type="button"
              className="dpa-menu-item"
              data-testid="dpa-copy-json-btn"
              onClick={() => {
                setCopyFormatMenuOpen(false);
                void onCopyPrompt('json');
              }}
            >
              <span>JSON形式 (DOMメタデータ)</span>
            </button>
          </div>
        )}
      </div>

      <div className="dpa-divider" />

      {/* 6. [ー] 最小化ボタン */}
      <button
        type="button"
        className="dpa-btn dpa-btn-minimize"
        data-testid="dpa-bottom-bar-minimize-btn"
        onClick={onToggleMinimize}
        title="ツールバーを折りたたむ (最小化)"
        aria-label="最小化"
      >
        <Minus className="dpa-icon-sm" />
      </button>
    </div>
  );
};
