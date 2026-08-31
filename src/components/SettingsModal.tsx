import React, { useEffect, useRef } from 'react';
import type { ThemeMode } from '../types';
import { SunIcon, MoonIcon, MonitorIcon, CloseIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

interface ThemeOption {
  id: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'ライトモード',
    description: '白を基調としたすっきりとした表示（GitHub Light風）',
    icon: <SunIcon className="theme-option-icon" />,
  },
  {
    id: 'dark',
    label: 'ダークモード',
    description: '目に優しい暗色背景の表示（GitHub Dark風）',
    icon: <MoonIcon className="theme-option-icon" />,
  },
  {
    id: 'system',
    label: 'システム設定に連動',
    description: 'OSのダーク/ライトモード設定に自動追従します',
    icon: <MonitorIcon className="theme-option-icon" />,
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  onThemeChange,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="settings-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="settings-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-modal-header">
          <h2 id="settings-title" className="settings-modal-title">設定</h2>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            title="閉じる"
            aria-label="閉じる"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="settings-modal-body">
          <section className="settings-section">
            <h3 className="settings-section-title">Markdown 表示テーマ</h3>
            <p className="settings-section-desc">
              Markdownドキュメント表示領域のカラーテーマを選択できます。
            </p>

            <div className="theme-options-grid">
              {THEME_OPTIONS.map((option) => {
                const isSelected = themeMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`theme-option-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => onThemeChange(option.id)}
                  >
                    <div className="theme-option-header">
                      <div className="theme-option-icon-wrap">{option.icon}</div>
                      <span className="theme-option-label">{option.label}</span>
                      <span className="theme-option-radio">
                        <span className="theme-option-radio-inner" />
                      </span>
                    </div>
                    <div className="theme-option-description">{option.description}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section" style={{ marginTop: '20px' }}>
            <h3 className="settings-section-title">ショートカットキー</h3>
            <p className="settings-section-desc">
              キーボードから素早く操作できます。
            </p>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <span className="shortcut-action">全画面表示の切り替え</span>
                <kbd className="shortcut-key">F11</kbd>
              </div>
              <div className="shortcut-item">
                <span className="shortcut-action">全画面解除 / モーダルを閉じる</span>
                <kbd className="shortcut-key">Esc</kbd>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="settings-done-btn" onClick={onClose}>
            完了
          </button>
        </div>
      </div>
    </div>
  );
};
