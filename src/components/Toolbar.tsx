import React from 'react';
import type { SidebarView, ThemeMode } from '../types';
import {
  SidebarToggleIcon,
  FolderOpenBtnIcon,
  MarkdownFileIcon,
  SettingsIcon,
  FullscreenIcon,
  FullscreenExitIcon,
  PrintIcon,
  TocIcon,
  SearchIcon,
} from './Icons';

interface ToolbarProps {
  isSidebarOpen: boolean;
  sidebarView: SidebarView;
  onToggleExplorer: () => void;
  onToggleToc: () => void;
  onOpenFolder: () => void;
  onOpenFile: () => void;
  onOpenQuickOpen: () => void;
  folderName: string | null;
  hasActiveTab: boolean;
  onPrint: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  themeMode: ThemeMode;
  effectiveTheme: 'light' | 'dark';
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isSidebarOpen,
  sidebarView,
  onToggleExplorer,
  onToggleToc,
  onOpenFolder,
  onOpenFile,
  onOpenQuickOpen,
  folderName,
  hasActiveTab,
  onPrint,
  isFullscreen,
  onToggleFullscreen,
  onOpenSettings,
  themeMode,
  effectiveTheme,
}) => {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          className={`toolbar-icon-btn ${isSidebarOpen && sidebarView === 'explorer' ? 'active' : ''}`}
          onClick={onToggleExplorer}
          title={
            isSidebarOpen && sidebarView === 'explorer'
              ? 'サイドバーを非表示 (Ctrl+B)'
              : 'エクスプローラーを表示 (Ctrl+B)'
          }
        >
          <SidebarToggleIcon />
        </button>
        <button
          type="button"
          className={`toolbar-icon-btn ${isSidebarOpen && sidebarView === 'toc' ? 'active' : ''}`}
          onClick={onToggleToc}
          title={isSidebarOpen && sidebarView === 'toc' ? '目次を非表示' : '目次 / アウトラインを表示'}
        >
          <TocIcon />
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn-folder"
          onClick={onOpenFolder}
          title="フォルダを開く"
        >
          <FolderOpenBtnIcon className="btn-icon" />
          <span className="toolbar-btn-text">フォルダを開く</span>
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn-file"
          onClick={onOpenFile}
          title="ファイルを開く"
        >
          <MarkdownFileIcon className="btn-icon" />
          <span className="toolbar-btn-text">ファイルを開く</span>
        </button>
      </div>

      {/* クイックオープン起動ボタン (VS Code風検索バー) */}
      <div className="toolbar-center">
        <button
          type="button"
          className="toolbar-quick-open-btn"
          onClick={onOpenQuickOpen}
          title="ファイルをクイックオープン (Ctrl+P)"
        >
          <SearchIcon className="quick-open-btn-icon" />
          <span className="quick-open-btn-label">
            {folderName ? `${folderName} を検索...` : 'ファイルをクイックオープン...'}
          </span>
          <kbd className="quick-open-btn-kbd">Ctrl+P</kbd>
        </button>
      </div>

      <div className="toolbar-right">
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onPrint}
          title={hasActiveTab ? '印刷 / PDF保存 (Ctrl+Shift+P)' : 'タブが開かれていません'}
          disabled={!hasActiveTab}
        >
          <PrintIcon />
        </button>
        <button
          type="button"
          className={`toolbar-icon-btn ${isFullscreen ? 'active' : ''}`}
          onClick={onToggleFullscreen}
          title={isFullscreen ? '全画面表示を解除 (F11)' : '全画面表示 (F11)'}
        >
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onOpenSettings}
          title={`設定 (現在のテーマ: ${
            themeMode === 'system'
              ? `システム連動 [${effectiveTheme === 'dark' ? 'ダーク' : 'ライト'}]`
              : themeMode === 'dark'
              ? 'ダークモード'
              : 'ライトモード'
          })`}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
};
