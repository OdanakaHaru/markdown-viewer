import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import { Sidebar } from './components/sidebar';
import { SettingsModal, QuickOpenModal, DiffSelectModal, GitCommitSelectModal } from './components/modals';
import { MarkdownPane } from './components/pane';
import { ContextMenu, ErrorBanner, DragOverlay } from './components/common';
import { Toolbar } from './components/toolbar';
import {
  WorkspaceProvider,
  useWorkspaceContext,
  PaneProvider,
  usePaneContext,
  UIProvider,
  useUIContext,
} from './contexts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useActiveFileWatcher } from './hooks/useActiveFileWatcher';
import { useToc } from './hooks/useToc';
import { useLinkNavigation } from './hooks/useLinkNavigation';
import { useFileOperations } from './hooks/useFileOperations';
import { useCustomApps } from './hooks/useCustomApps';
import { useWindowTitle } from './hooks/useWindowTitle';
import { useAppContextMenu } from './hooks/useAppContextMenu';
import { useDiff } from './hooks/useDiff';

function AppContent() {
  const [error, setError] = useState('');

  // --- 各 Context から状態と操作関数を取得 ---
  const {
    folderPath,
    folderName,
    setFolderPath,
    setFolderName,
    rootEntries,
    loadDirectory,
    registerOnError,
  } = useWorkspaceContext();

  const {
    panes,
    activePaneId,
    setActivePaneId,
    activeTab,
    autoCloseEmptyPane,
    handleAutoCloseEmptyPaneChange,
    addTabToPane,
    handleSelectTab,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseTabsToRight,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
    reloadTabContent,
  } = usePaneContext();

  const {
    isSidebarOpen,
    setIsSidebarOpen,
    toggleSidebar,
    themeMode,
    effectiveTheme,
    handleThemeChange,
    isSettingsOpen,
    setIsSettingsOpen,
    toggleFullscreen,
    exitFullscreen,
    searchPaneId,
    handleOpenSearch,
    handleCloseSearch,
    isQuickOpenOpen,
    handleOpenQuickOpen,
    handleCloseQuickOpen,
  } = useUIContext();

  // ワークスペースエラー通知ハンドラを登録
  useEffect(() => {
    registerOnError(setError);
  }, [registerOnError]);

  // --- カスタム外部エディタ設定 ---
  const { customApps, handleCustomAppsChange } = useCustomApps();

  // --- 差分比較モーダル状態 ---
  const {
    isDiffModalOpen,
    diffModalInitialPath,
    handleOpenDiffModal,
    handleCloseDiffModal,
    handleCompareDiff,
    handleCompareGitDiff,
    isGitCommitModalOpen,
    gitCommitModalFilePath,
    handleOpenGitCommitModal,
    handleCloseGitCommitModal,
  } = useDiff({
    activePaneId,
    addTabToPane,
    onError: setError,
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
    onOpenDiff: handleOpenDiffModal,
    onCompareGit: handleCompareGitDiff,
    onOpenGitCommitModal: handleOpenGitCommitModal,
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
      toggleSidebar,
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
      toggleSidebar,
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
      <Toolbar
        onOpenFile={handleOpenFile}
        onOpenDiff={handleOpenDiffModal}
        onPrint={handlePrintDocument}
      />

      {/* エラーバー */}
      <ErrorBanner error={error} onClose={() => setError('')} />

      {/* メインレイアウト */}
      <div className="main-layout">
        {isSidebarOpen && (
          <Sidebar
            onSelectFile={(path) => handleSelectFile(path)}
            tocItems={tocItems}
            activeHeadingId={activeHeadingId}
            onSelectHeading={handleSelectHeading}
            onContextMenuFile={handleContextMenuFile}
          />
        )}

        <main className="content-area panes-container">
          {panes.map((pane) => (
            <MarkdownPane
              key={pane.id}
              pane={pane}
              onLinkClick={handleLinkClick}
              onDropFile={handleDropFile}
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

      {/* Diff選択パレットモーダル */}
      {isDiffModalOpen && (
        <DiffSelectModal
          isOpen={isDiffModalOpen}
          onClose={handleCloseDiffModal}
          onCompare={handleCompareDiff}
          onCompareGit={handleCompareGitDiff}
          onOpenGitCommitModal={handleOpenGitCommitModal}
          folderPath={folderPath}
          folderName={folderName}
          openTabs={allOpenTabs}
          workspaceFiles={rootEntries.filter((e) => e.is_markdown)}
          currentFilePath={diffModalInitialPath || activeTab?.filePath || null}
        />
      )}

      {/* Git過去コミット選択モーダル */}
      {isGitCommitModalOpen && gitCommitModalFilePath && (
        <GitCommitSelectModal
          isOpen={isGitCommitModalOpen}
          onClose={handleCloseGitCommitModal}
          filePath={gitCommitModalFilePath}
          onSelectCommit={(commit) => handleCompareGitDiff(gitCommitModalFilePath, commit.short_hash)}
        />
      )}

      {/* グローバル右クリックコンテキストメニュー */}
      <ContextMenu state={contextMenu} onClose={closeContextMenu} />

      {/* ドラッグオーバーレイ */}
      <DragOverlay isDragging={isDragging} />
    </div>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <PaneProvider>
        <UIProvider>
          <AppContent />
        </UIProvider>
      </PaneProvider>
    </WorkspaceProvider>
  );
}

export default App;
