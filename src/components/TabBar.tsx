import React from 'react';
import type { TabItem } from '../types';
import { CloseIcon, SplitPaneIcon } from './Icons';

interface TabBarProps {
  paneId: string;
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onSplitPane?: () => void;
  onClosePane?: () => void;
  canSplit: boolean;
  canClosePane: boolean;
  isActivePane: boolean;
  onFocusPane: () => void;
  onContextMenuTab?: (e: React.MouseEvent, tab: TabItem, paneId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  paneId,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onSplitPane,
  onClosePane,
  canSplit,
  canClosePane,
  isActivePane,
  onFocusPane,
  onContextMenuTab,
}) => {
  return (
    <div className={`tab-bar ${isActivePane ? 'active-pane' : ''}`} onClick={onFocusPane}>
      <div className="tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                'application/json',
                JSON.stringify({ type: 'tab', paneId, tabId: tab.id })
              );
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={(e) => {
              e.stopPropagation();
              onFocusPane();
              onSelectTab(tab.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFocusPane();
              onContextMenuTab?.(e, tab, paneId);
            }}
            onMouseDown={(e) => {
              // マウス中ボタン（ホイールクリック）のデフォルト動作を抑制
              if (e.button === 1) {
                e.preventDefault();
              }
            }}
            onAuxClick={(e) => {
              // マウス中ボタン（ホイールクリック）でタブを閉じる
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                onFocusPane();
                onCloseTab(tab.id);
              }
            }}
            title={tab.filePath}
          >
            <span className="tab-title">{tab.fileName}</span>
            <button
              type="button"
              className="tab-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFocusPane();
                onCloseTab(tab.id);
              }}
              title="閉じる"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
      <div className="tab-actions">
        {canSplit && onSplitPane && (
          <button type="button" className="pane-action-btn" onClick={(e) => { e.stopPropagation(); onSplitPane(); }} title="右に分割">
            <SplitPaneIcon />
          </button>
        )}
        {canClosePane && onClosePane && (
          <button type="button" className="pane-action-btn" onClick={(e) => { e.stopPropagation(); onClosePane(); }} title="ペインを閉じる">
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
};
