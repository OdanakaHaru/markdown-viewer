import React, { useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import DOMPurify from 'dompurify';
import type { PaneItem } from '../types';
import { TabBar } from './TabBar';

interface MarkdownPaneProps {
  pane: PaneItem;
  isActivePane: boolean;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onSplitPane?: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  canSplit: boolean;
  canClosePane: boolean;
  effectiveTheme: 'light' | 'dark';
  folderPath: string | null;
  onLinkClick: (href: string, paneId: string) => void;
  onDropTab: (sourcePaneId: string, tabId: string, targetPaneId: string) => void;
  onDropFile: (filePath: string, targetPaneId: string) => void;
}

export const MarkdownPane: React.FC<MarkdownPaneProps> = ({
  pane,
  isActivePane,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onSplitPane,
  onClosePane,
  canSplit,
  canClosePane,
  effectiveTheme,
  folderPath,
  onLinkClick,
  onDropTab,
  onDropFile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);
  const content = activeTab?.content || '';
  const selectedFilePath = activeTab?.filePath || null;
  const selectedFileName = activeTab?.fileName || null;

  // DOMPurify によるサニタイズ（XSS対策）
  const sanitizedContent = useMemo(() => {
    if (!content) return '';
    return DOMPurify.sanitize(content, {
      ADD_TAGS: ['input'], // タスクリスト用
      ADD_ATTR: ['checked', 'disabled', 'type', 'target', 'rel', 'id'], // 見出しアンカーID・タスク用
    });
  }, [content]);

  useEffect(() => {
    if (!sanitizedContent || !containerRef.current) return;
    const container = containerRef.current;

    // 画像パスの置換
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('http')) {
        invoke<string>('read_image_data_url', {
          baseFilePath: selectedFilePath,
          baseFolderPath: folderPath,
          src,
        })
          .then((dataUrl) => {
            img.setAttribute('src', dataUrl);
          })
          .catch((err) => {
            console.error('画像の読み込みに失敗しました:', err);
          });
      }
    });
  }, [sanitizedContent, selectedFilePath, folderPath]);

  const handleHtmlClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const a = target.closest('a');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) {
        onLinkClick(href, pane.id);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/json')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const data = JSON.parse(internalData);
        if (data.type === 'tab' && data.paneId && data.tabId) {
          onDropTab(data.paneId, data.tabId, pane.id);
        } else if (data.type === 'file' && data.filePath) {
          onDropFile(data.filePath, pane.id);
        }
      } catch (err) {
        console.error('Invalid drop data', err);
      }
    }
  };

  return (
    <div 
      className={`pane ${isActivePane ? 'active-pane' : ''}`} 
      onClick={() => onFocusPane(pane.id)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TabBar
        paneId={pane.id}
        tabs={pane.tabs}
        activeTabId={pane.activeTabId}
        onSelectTab={(tabId) => onSelectTab(pane.id, tabId)}
        onCloseTab={(tabId) => onCloseTab(pane.id, tabId)}
        onSplitPane={onSplitPane ? () => onSplitPane(pane.id) : undefined}
        onClosePane={onClosePane ? () => onClosePane(pane.id) : undefined}
        canSplit={canSplit}
        canClosePane={canClosePane}
        isActivePane={isActivePane}
        onFocusPane={() => onFocusPane(pane.id)}
      />
      <div className="pane-content">
        {activeTab ? (
          <div
            className="markdown-container"
            data-theme={effectiveTheme}
            data-color-mode={effectiveTheme}
          >
            {selectedFileName && (
              <div className="document-header">
                <div className="document-title-row">
                  <span className="document-title">{selectedFileName}</span>
                </div>
                {selectedFilePath && (
                  <div className="document-path">{selectedFilePath}</div>
                )}
              </div>
            )}
            <div
              ref={containerRef}
              className="markdown-body"
              onClick={handleHtmlClick}
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">タブが開かれていません</div>
            <div className="empty-state-text">
              ファイルを開くか、別のペインからタブを移動してください。
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
