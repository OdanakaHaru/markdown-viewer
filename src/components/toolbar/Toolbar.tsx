import React from 'react';
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
  DiffIcon,
} from '../common/Icons';
import { useUIContext, useWorkspaceContext, usePaneContext } from '../../contexts';

export interface ToolbarProps {
  onOpenFile: () => void;
  onOpenDiff: () => void;
  onPrint: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenFile,
  onOpenDiff,
  onPrint,
}) => {
  const {
    isSidebarOpen,
    sidebarView,
    handleToggleExplorer,
    handleToggleToc,
    isFullscreen,
    toggleFullscreen,
    setIsSettingsOpen,
    themeMode,
    effectiveTheme,
    handleOpenQuickOpen,
  } = useUIContext();

  const { folderName, handleOpenFolder } = useWorkspaceContext();
  const { activeTab } = usePaneContext();
  const hasActiveTab = Boolean(activeTab);

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          className={`toolbar-icon-btn ${isSidebarOpen && sidebarView === 'explorer' ? 'active' : ''}`}
          onClick={handleToggleExplorer}
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
          onClick={handleToggleToc}
          title={isSidebarOpen && sidebarView === 'toc' ? '目次を非表示' : '目次 / アウトラインを表示'}
        >
          <TocIcon />
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn-folder"
          onClick={handleOpenFolder}
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
          onClick={handleOpenQuickOpen}
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
          onClick={() => onOpenDiff()}
          title="別ファイルと差分比較..."
          disabled={!hasActiveTab}
        >
          <DiffIcon />
        </button>
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onPrint}
          title="印刷 / PDF出力 (Ctrl+Shift+P)"
          disabled={!hasActiveTab}
        >
          <PrintIcon />
        </button>
        <button
          type="button"
          className={`toolbar-icon-btn ${isFullscreen ? 'active' : ''}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? '全画面表示を解除 (F11)' : '全画面表示 (F11)'}
        >
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </button>
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={() => setIsSettingsOpen(true)}
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
