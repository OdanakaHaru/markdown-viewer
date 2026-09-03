import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import type { SidebarView } from './types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { QuickOpenModal } from './components/QuickOpenModal';
import { MarkdownPane } from './components/MarkdownPane';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useFullscreen } from './hooks/useFullscreen';
import { usePanes } from './hooks/usePanes';
import { useWorkspace } from './hooks/useWorkspace';
import { useActiveFileWatcher } from './hooks/useActiveFileWatcher';
import { useToc } from './hooks/useToc';
import { useLinkNavigation } from './hooks/useLinkNavigation';
import { useFileOperations } from './hooks/useFileOperations';
import { isSubpathOf } from './utils/path';
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
} from './components/Icons';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWebviewWindow() : null;

function App() {
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>('explorer');

  // --- テーマ & フルスクリーン ---
  const {
    themeMode,
    effectiveTheme,
    handleThemeChange,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useTheme();

  const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen();

  // --- ペイン管理 ---
  const {
    panes,
    activePaneId,
    setActivePaneId,
    activeTab,
    autoCloseEmptyPane,
    handleAutoCloseEmptyPaneChange,
    addTabToPane,
    handleSelectTab,
    handleClosePane,
    handleCloseTab,
    handleSplitPane,
    handleMoveTab,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
    reloadTabContent,
  } = usePanes();

  // --- 検索バー状態 ---
  const [searchPaneId, setSearchPaneId] = useState<string | null>(null);

  const handleOpenSearch = useCallback(() => {
    setSearchPaneId(activePaneId);
  }, [activePaneId]);

  const handleCloseSearch = useCallback(() => {
    setSearchPaneId(null);
  }, []);

  // --- クイックオープン（Ctrl+P）状態 ---
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);

  const handleOpenQuickOpen = useCallback(() => {
    setIsQuickOpenOpen((prev) => !prev);
  }, []);

  const handleCloseQuickOpen = useCallback(() => {
    setIsQuickOpenOpen(false);
  }, []);

  // --- ワークスペース / フォルダ管理 ---
  const {
    folderPath,
    folderName,
    setFolderPath,
    setFolderName,
    rootEntries,
    isLoadingRoot,
    loadDirectory,
    handleOpenFolder,
    handleRefreshFolder,
  } = useWorkspace({
    onError: setError,
    onFolderOpened: () => setIsSidebarOpen(true),
  });

  // --- アクティブファイル監視（ホットリフレッシュ） ---
  useActiveFileWatcher({
    panes,
    reloadTabContent,
  });

  // --- 目次（TOC）抽出 & スクロール連動 ---
  const { tocItems, activeHeadingId, handleSelectHeading } = useToc({
    activeContent: activeTab?.content,
    activePaneId,
  });

  // --- 印刷 / PDFエクスポート ---
  const handlePrintDocument = useCallback(() => {
    if (!activeTab) return;
    window.print();
  }, [activeTab]);

  // --- ウィンドウタイトルの更新 ---
  const updateTitle = useCallback((filename: string, dirName?: string | null) => {
    const title = dirName
      ? `${filename} - ${dirName} - Markdown Viewer`
      : `${filename} - Markdown Viewer`;
    document.title = title;
    appWindow?.setTitle(title).catch((err) => {
      console.error('ウィンドウタイトルの更新に失敗:', err);
    });
  }, []);

  const isTabInOpenedFolder = Boolean(
    folderName &&
    folderPath &&
    activeTab &&
    !activeTab.isStandalone &&
    activeTab.filePath &&
    isSubpathOf(activeTab.filePath, folderPath)
  );

  useEffect(() => {
    if (activeTab) {
      updateTitle(activeTab.fileName, isTabInOpenedFolder ? folderName : null);
    } else {
      updateTitle('Markdown Viewer', folderName);
    }
  }, [activeTab, folderName, isTabInOpenedFolder, updateTitle]);

  // --- ファイル操作 & ナビゲーション ---
  // 循環参照を避けるため、まず scrollToAnchor と handleLinkClick 用のフックを生成
  // （onSelectFile は useFileOperations から提供）
  const handleSelectFileRef = useRef<
    (path: string, initialHash?: string | null, targetPaneId?: string) => Promise<void>
  >(async () => {});

  const handleSelectFileProxy = useCallback(
    async (path: string, initialHash?: string | null, targetPaneId?: string) => {
      await handleSelectFileRef.current(path, initialHash, targetPaneId);
    },
    []
  );

  const { scrollToAnchor, handleLinkClick } = useLinkNavigation({
    panes,
    folderPath,
    onSelectFile: handleSelectFileProxy,
    onError: setError,
  });

  const {
    isDragging,
    handleSelectFile,
    handleDropFile,
    handleQuickOpenFile,
    handleOpenFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    allOpenTabs,
  } = useFileOperations({
    panes,
    activePaneId,
    setActivePaneId,
    addTabToPane,
    handleSelectTab,
    folderPath,
    setFolderPath,
    setFolderName,
    setIsSidebarOpen,
    loadDirectory,
    scrollToAnchor,
    onError: setError,
  });

  // Proxy ref を実際のハンドラと接続
  useEffect(() => {
    handleSelectFileRef.current = handleSelectFile;
  }, [handleSelectFile]);

  // --- キーボードショートカットの一元管理 ---
  const shortcutActions = useMemo(
    () => ({
      closeActiveTab,
      nextTab: goToNextTab,
      prevTab: goToPrevTab,
      goToTab: goToNthTab,
      openFile: handleOpenFile,
      reopenClosedTab: handleReopenClosedTab,
      toggleSidebar: () => setIsSidebarOpen((prev) => !prev),
      openQuickOpen: handleOpenQuickOpen,
      closeQuickOpen: handleCloseQuickOpen,
      printDocument: handlePrintDocument,
      openSettings: () => setIsSettingsOpen(true),
      toggleFullscreen,
      exitFullscreen,
      openSearch: handleOpenSearch,
      closeSearch: handleCloseSearch,
    }),
    [
      closeActiveTab,
      goToNextTab,
      goToPrevTab,
      goToNthTab,
      handleOpenFile,
      handleReopenClosedTab,
      handleOpenQuickOpen,
      handleCloseQuickOpen,
      handlePrintDocument,
      setIsSettingsOpen,
      toggleFullscreen,
      exitFullscreen,
      handleOpenSearch,
      handleCloseSearch,
    ]
  );

  useKeyboardShortcuts({
    actions: shortcutActions,
    isSettingsOpen,
    isSearchOpen: Boolean(searchPaneId),
    isQuickOpenOpen,
  });

  return (
    <div
      className="container"
      data-theme={effectiveTheme}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ツールバー */}
      <header className="toolbar">
        <div className="toolbar-left">
          <button
            type="button"
            className={`toolbar-icon-btn ${isSidebarOpen && sidebarView === 'explorer' ? 'active' : ''}`}
            onClick={() => {
              if (isSidebarOpen && sidebarView === 'explorer') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setSidebarView('explorer');
              }
            }}
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
            onClick={() => {
              if (isSidebarOpen && sidebarView === 'toc') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setSidebarView('toc');
              }
            }}
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
            onClick={handleOpenFile}
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
            onClick={handlePrintDocument}
            title={activeTab ? '印刷 / PDF保存 (Ctrl+Shift+P)' : 'タブが開かれていません'}
            disabled={!activeTab}
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

      {/* エラーバー */}
      {error && <div className="error">{error}</div>}

      {/* メインレイアウト */}
      <div className="main-layout">
        {isSidebarOpen && (
          <Sidebar
            folderPath={folderPath}
            folderName={folderName}
            selectedFilePath={activeTab?.isStandalone ? null : (activeTab?.filePath || null)}
            rootEntries={rootEntries}
            isLoadingRoot={isLoadingRoot}
            onOpenFolder={handleOpenFolder}
            onRefresh={handleRefreshFolder}
            onSelectFile={(path) => handleSelectFile(path)}
            onToggleSidebar={() => setIsSidebarOpen(false)}
            currentView={sidebarView}
            onChangeView={setSidebarView}
            tocItems={tocItems}
            activeHeadingId={activeHeadingId}
            onSelectHeading={handleSelectHeading}
            hasActiveTab={Boolean(activeTab)}
          />
        )}

        <main className="content-area panes-container">
          {panes.map((pane) => (
            <MarkdownPane
              key={pane.id}
              pane={pane}
              isActivePane={pane.id === activePaneId}
              onFocusPane={setActivePaneId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              onSplitPane={panes.length < 3 ? handleSplitPane : undefined}
              onClosePane={panes.length > 1 ? handleClosePane : undefined}
              canSplit={panes.length < 3}
              canClosePane={panes.length > 1}
              effectiveTheme={effectiveTheme}
              folderPath={folderPath}
              onLinkClick={handleLinkClick}
              onDropTab={handleMoveTab}
              onDropFile={handleDropFile}
              isSearchOpen={searchPaneId === pane.id}
              onCloseSearch={handleCloseSearch}
            />
          ))}
        </main>
      </div>

      {/* 設定モーダル */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
        autoCloseEmptyPane={autoCloseEmptyPane}
        onAutoCloseEmptyPaneChange={handleAutoCloseEmptyPaneChange}
      />

      {/* クイックオープンモーダル (Ctrl+P) */}
      {isQuickOpenOpen && (
        <QuickOpenModal
          isOpen={isQuickOpenOpen}
          onClose={handleCloseQuickOpen}
          onSelectFile={handleQuickOpenFile}
          folderPath={folderPath}
          folderName={folderName}
          openTabs={allOpenTabs}
        />
      )}

      {/* ドラッグオーバーレイ */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-overlay-icon">📥</div>
            <div className="drag-overlay-text">Markdownファイルをここにドロップ</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
