import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { FileEntry, TocItem } from '../../types';
import { FileTreeItem } from './FileTree';
import { TocView } from './TocView';
import {
  FolderOpenBtnIcon,
  RefreshIcon,
  CollapseAllIcon,
  SidebarToggleIcon,
  TocIcon,
} from '../common/Icons';
import { useWorkspaceContext, useUIContext, usePaneContext } from '../../contexts';

export interface SidebarProps {
  onSelectFile: (path: string) => void;
  tocItems: TocItem[];
  activeHeadingId: string | null;
  onSelectHeading: (id: string) => void;
  onContextMenuFile?: (e: React.MouseEvent, entry: FileEntry) => void;
}

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 260;

export const Sidebar: React.FC<SidebarProps> = ({
  onSelectFile,
  tocItems,
  activeHeadingId,
  onSelectHeading,
  onContextMenuFile,
}) => {
  const {
    folderPath,
    folderName,
    rootEntries,
    isLoadingRoot,
    handleOpenFolder,
    handleRefreshFolder,
  } = useWorkspaceContext();

  const {
    sidebarView,
    setSidebarView,
    closeSidebar,
  } = useUIContext();

  const { activeTab } = usePaneContext();
  const hasActiveTab = Boolean(activeTab);
  const selectedFilePath = activeTab?.isStandalone ? null : (activeTab?.filePath || null);

  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleCollapseAll = () => {
    setCollapseAllTrigger((prev) => prev + 1);
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar ${isResizing ? 'is-resizing' : ''}`}
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* ビュー切替タブ */}
      <div className="sidebar-nav-tabs">
        <button
          type="button"
          className={`sidebar-nav-tab ${sidebarView === 'explorer' ? 'active' : ''}`}
          onClick={() => setSidebarView('explorer')}
          title="エクスプローラー"
        >
          <FolderOpenBtnIcon className="sidebar-tab-icon" />
          <span>ファイル</span>
        </button>
        <button
          type="button"
          className={`sidebar-nav-tab ${sidebarView === 'toc' ? 'active' : ''}`}
          onClick={() => setSidebarView('toc')}
          title="目次 / アウトライン"
        >
          <TocIcon className="sidebar-tab-icon" />
          <span>目次</span>
        </button>
      </div>

      <div className="sidebar-header">
        {sidebarView === 'explorer' ? (
          <>
            <div className="sidebar-title-section">
              <span className="sidebar-section-title">エクスプローラー</span>
              {folderName && <span className="sidebar-folder-name" title={folderPath || ''}>: {folderName}</span>}
            </div>
            <div className="sidebar-actions">
              <button
                type="button"
                className="sidebar-action-btn"
                onClick={handleOpenFolder}
                title="フォルダを開く"
              >
                <FolderOpenBtnIcon />
              </button>
              {folderPath && (
                <>
                  <button
                    type="button"
                    className="sidebar-action-btn"
                    onClick={handleRefreshFolder}
                    title="最新の情報に更新"
                  >
                    <RefreshIcon />
                  </button>
                  <button
                    type="button"
                    className="sidebar-action-btn"
                    onClick={handleCollapseAll}
                    title="すべて折りたたむ"
                  >
                    <CollapseAllIcon />
                  </button>
                </>
              )}
              <button
                type="button"
                className="sidebar-action-btn"
                onClick={closeSidebar}
                title="サイドバーを非表示"
              >
                <SidebarToggleIcon />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-title-section">
              <span className="sidebar-section-title">目次 / アウトライン</span>
            </div>
            <div className="sidebar-actions">
              <button
                type="button"
                className="sidebar-action-btn"
                onClick={closeSidebar}
                title="サイドバーを非表示"
              >
                <SidebarToggleIcon />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="sidebar-content">
        {sidebarView === 'toc' ? (
          <TocView
            items={tocItems}
            activeId={activeHeadingId}
            onSelectHeading={onSelectHeading}
            hasActiveTab={hasActiveTab}
          />
        ) : isLoadingRoot ? (
          <div className="sidebar-loading">読み込み中...</div>
        ) : folderPath ? (
          rootEntries.length > 0 ? (
            <div className="file-tree-container">
              {rootEntries.map((entry) => (
                <FileTreeItem
                  key={`${entry.path}-${collapseAllTrigger}`}
                  entry={entry}
                  depth={0}
                  selectedPath={selectedFilePath}
                  onSelectFile={onSelectFile}
                  collapseAllTrigger={collapseAllTrigger}
                  onContextMenu={onContextMenuFile}
                />
              ))}
            </div>
          ) : (
            <div className="sidebar-empty-folder">
              フォルダ内にファイルがありません
            </div>
          )
        ) : (
          <div className="sidebar-no-folder">
            <p className="no-folder-text">フォルダが開かれていません</p>
            <button
              type="button"
              className="open-folder-btn"
              onClick={handleOpenFolder}
            >
              フォルダを開く
            </button>
          </div>
        )}
      </div>

      {/* リサイズハンドル */}
      <div
        className="sidebar-resizer"
        onMouseDown={startResizing}
        onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        title="ドラッグして幅を変更 / ダブルクリックでリセット"
      />
    </aside>
  );
};
