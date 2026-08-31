import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { FileEntry } from '../types';
import { FileTreeItem } from './FileTree';
import {
  FolderOpenBtnIcon,
  RefreshIcon,
  CollapseAllIcon,
  SidebarToggleIcon,
} from './Icons';

interface SidebarProps {
  folderPath: string | null;
  folderName: string | null;
  selectedFilePath: string | null;
  rootEntries: FileEntry[];
  isLoadingRoot: boolean;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onSelectFile: (path: string) => void;
  onToggleSidebar: () => void;
}

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 260;

export const Sidebar: React.FC<SidebarProps> = ({
  folderPath,
  folderName,
  selectedFilePath,
  rootEntries,
  isLoadingRoot,
  onOpenFolder,
  onRefresh,
  onSelectFile,
  onToggleSidebar,
}) => {
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
      <div className="sidebar-header">
        <div className="sidebar-title-section">
          <span className="sidebar-section-title">エクスプローラー</span>
          {folderName && <span className="sidebar-folder-name" title={folderPath || ''}>: {folderName}</span>}
        </div>
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-action-btn"
            onClick={onOpenFolder}
            title="フォルダを開く"
          >
            <FolderOpenBtnIcon />
          </button>
          {folderPath && (
            <>
              <button
                type="button"
                className="sidebar-action-btn"
                onClick={onRefresh}
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
            onClick={onToggleSidebar}
            title="サイドバーを非表示"
          >
            <SidebarToggleIcon />
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        {isLoadingRoot ? (
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
              onClick={onOpenFolder}
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
