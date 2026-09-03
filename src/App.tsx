import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import type { SidebarView } from './types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { QuickOpenModal } from './components/QuickOpenModal';
import { MarkdownPane } from './components/MarkdownPane';
import { ContextMenu } from './components/ContextMenu';
import { Toolbar } from './components/Toolbar';
import { CloseIcon } from './components/Icons';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useFullscreen } from './hooks/useFullscreen';
import { usePanes } from './hooks/usePanes';
import { useWorkspace } from './hooks/useWorkspace';
import { useActiveFileWatcher } from './hooks/useActiveFileWatcher';
import { useToc } from './hooks/useToc';
import { useLinkNavigation } from './hooks/useLinkNavigation';
import { useFileOperations } from './hooks/useFileOperations';
import { useCustomApps } from './hooks/useCustomApps';
import { useWindowTitle } from './hooks/useWindowTitle';
import { useAppContextMenu } from './hooks/useAppContextMenu';

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
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleSplitPane,
    handleMoveTab,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
    reloadTabContent,
  } = usePanes();

  // --- カスタム外部エディタ設定 ---
  const { customApps, handleCustomAppsChange } = useCustomApps();

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
    setTimeout(() => {
      window.print();
    }, 50);
  }, [activeTab]);

  // --- コンテキストメニュー管理 ---
  const {
    contextMenu,
    closeContextMenu,
    handleContextMenuFile,
    handleContextMenuTab,
    handleContextMenuPane,
  } = useAppContextMenu({
    customApps,
    folderPath,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handlePrintDocument,
    onError: setError,
  });

  // --- ウィンドウタイトルの更新 ---
  useWindowTitle({
    activeTab,
    folderName,
    folderPath,
  });

  // --- ファイル操作 & ナビゲーション ---
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

  // --- ツールバー用アクション ---
  const handleToggleExplorer = useCallback(() => {
    if (isSidebarOpen && sidebarView === 'explorer') {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
      setSidebarView('explorer');
    }
  }, [isSidebarOpen, sidebarView]);

  const handleToggleToc = useCallback(() => {
    if (isSidebarOpen && sidebarView === 'toc') {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
      setSidebarView('toc');
    }
  }, [isSidebarOpen, sidebarView]);

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
      <Toolbar
        isSidebarOpen={isSidebarOpen}
        sidebarView={sidebarView}
        onToggleExplorer={handleToggleExplorer}
        onToggleToc={handleToggleToc}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
        onOpenQuickOpen={handleOpenQuickOpen}
        folderName={folderName}
        hasActiveTab={Boolean(activeTab)}
        onPrint={handlePrintDocument}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setIsSettingsOpen(true)}
        themeMode={themeMode}
        effectiveTheme={effectiveTheme}
      />

      {/* エラーバー */}
      {error && (
        <div className="error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="閉じる"
            aria-label="エラーを閉じる"
          >
            <CloseIcon />
          </button>
        </div>
      )}

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
            onContextMenuFile={handleContextMenuFile}
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
              onContextMenuTab={handleContextMenuTab}
              onContextMenuPane={handleContextMenuPane}
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
        customApps={customApps}
        onCustomAppsChange={handleCustomAppsChange}
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

      {/* グローバル右クリックコンテキストメニュー */}
      <ContextMenu state={contextMenu} onClose={closeContextMenu} />

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
