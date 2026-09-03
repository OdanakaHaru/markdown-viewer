import React, { useCallback } from 'react';
import type { ContextMenuItem, CustomApp } from '../types';
import { useContextMenu } from './useContextMenu';
import { isSubpathOf } from '../utils/path';
import {
  VscodeIcon,
  NotepadIcon,
  ExternalAppIcon,
  ExplorerIcon,
  CopyIcon,
  PrintIcon,
} from '../components/Icons';

interface UseAppContextMenuProps {
  customApps: CustomApp[];
  folderPath: string | null;
  handleCloseTab: (paneId: string, tabId: string) => void;
  handleCloseOtherTabs: (paneId: string, tabId: string) => void;
  handleCloseTabsToRight: (paneId: string, tabId: string) => void;
  handlePrintDocument: () => void;
  onError?: (msg: string) => void;
}

export function useAppContextMenu({
  customApps,
  folderPath,
  handleCloseTab,
  handleCloseOtherTabs,
  handleCloseTabsToRight,
  handlePrintDocument,
  onError,
}: UseAppContextMenuProps) {
  const {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    handleOpenInApp,
    handleRevealInExplorer,
    handleCopyPath,
  } = useContextMenu({ onError });

  // 1. ファイルツリーのファイル / フォルダ用コンテキストメニュー
  const handleContextMenuFile = useCallback(
    (e: React.MouseEvent, entry: { name: string; path: string; is_dir: boolean }) => {
      const isDir = entry.is_dir;
      const relPath =
        folderPath && isSubpathOf(entry.path, folderPath)
          ? entry.path.slice(folderPath.length).replace(/^[\\/]/, '')
          : null;

      const items: ContextMenuItem[] = [];

      if (!isDir) {
        const appChildren: ContextMenuItem[] = customApps.map((app) => ({
          id: `file-open-${app.id}`,
          label: app.name,
          icon: app.appType === 'vscode' ? <VscodeIcon /> : <ExternalAppIcon />,
          onClick: () => handleOpenInApp(entry.path, app.appType, app.path),
        }));

        appChildren.push(
          {
            id: 'open-notepad',
            label: 'メモ帳で開く',
            icon: <NotepadIcon />,
            onClick: () => handleOpenInApp(entry.path, 'notepad'),
          },
          {
            id: 'open-default',
            label: '既定のアプリで開く',
            icon: <ExternalAppIcon />,
            onClick: () => handleOpenInApp(entry.path, 'default'),
          }
        );

        items.push({
          id: 'other-apps',
          label: '他のアプリで開く',
          icon: <ExternalAppIcon />,
          children: appChildren,
        });
      } else {
        items.push({
          id: 'open-folder-vscode',
          label: 'VS Code で開く',
          icon: <VscodeIcon />,
          onClick: () => handleOpenInApp(entry.path, 'vscode'),
        });
      }

      items.push({
        id: 'reveal-explorer',
        label: 'エクスプローラーで表示',
        icon: <ExplorerIcon />,
        onClick: () => handleRevealInExplorer(entry.path),
      });

      items.push({ id: 'div-copy', label: '', divider: true });

      items.push({
        id: 'copy-path',
        label: 'パスをコピー',
        icon: <CopyIcon />,
        onClick: () => handleCopyPath(entry.path),
      });

      if (relPath) {
        items.push({
          id: 'copy-rel-path',
          label: '相対パスをコピー',
          icon: <CopyIcon />,
          onClick: () => handleCopyPath(relPath),
        });
      }

      openContextMenu(e, items, entry.name);
    },
    [folderPath, customApps, handleOpenInApp, handleRevealInExplorer, handleCopyPath, openContextMenu]
  );

  // 2. タブ用コンテキストメニュー
  const handleContextMenuTab = useCallback(
    (e: React.MouseEvent, tab: { id: string; fileName: string; filePath: string }, paneId: string) => {
      const relPath =
        folderPath && isSubpathOf(tab.filePath, folderPath)
          ? tab.filePath.slice(folderPath.length).replace(/^[\\/]/, '')
          : null;

      const appChildren: ContextMenuItem[] = customApps.map((app) => ({
        id: `tab-open-${app.id}`,
        label: app.name,
        icon: app.appType === 'vscode' ? <VscodeIcon /> : <ExternalAppIcon />,
        onClick: () => handleOpenInApp(tab.filePath, app.appType, app.path),
      }));

      appChildren.push(
        {
          id: 'tab-open-notepad',
          label: 'メモ帳で開く',
          icon: <NotepadIcon />,
          onClick: () => handleOpenInApp(tab.filePath, 'notepad'),
        },
        {
          id: 'tab-open-default',
          label: '既定のアプリで開く',
          icon: <ExternalAppIcon />,
          onClick: () => handleOpenInApp(tab.filePath, 'default'),
        }
      );

      const items: ContextMenuItem[] = [
        {
          id: 'tab-other-apps',
          label: '他のアプリで開く',
          icon: <ExternalAppIcon />,
          children: appChildren,
        },
        {
          id: 'tab-reveal-explorer',
          label: 'エクスプローラーで表示',
          icon: <ExplorerIcon />,
          onClick: () => handleRevealInExplorer(tab.filePath),
        },
        { id: 'tab-div-1', label: '', divider: true },
        {
          id: 'tab-copy-path',
          label: 'パスをコピー',
          icon: <CopyIcon />,
          onClick: () => handleCopyPath(tab.filePath),
        },
      ];

      if (relPath) {
        items.push({
          id: 'tab-copy-rel-path',
          label: '相対パスをコピー',
          icon: <CopyIcon />,
          onClick: () => handleCopyPath(relPath),
        });
      }

      items.push(
        { id: 'tab-div-close', label: '', divider: true },
        {
          id: 'tab-close',
          label: 'タブを閉じる',
          shortcut: 'Ctrl+W',
          onClick: () => handleCloseTab(paneId, tab.id),
        },
        {
          id: 'tab-close-others',
          label: '他のタブを閉じる',
          onClick: () => handleCloseOtherTabs(paneId, tab.id),
        },
        {
          id: 'tab-close-to-right',
          label: '右側のタブを閉じる',
          onClick: () => handleCloseTabsToRight(paneId, tab.id),
        }
      );

      openContextMenu(e, items, tab.fileName);
    },
    [
      folderPath,
      customApps,
      handleOpenInApp,
      handleRevealInExplorer,
      handleCopyPath,
      handleCloseTab,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      openContextMenu,
    ]
  );

  // 3. ペイン背景 / Markdown表示部用コンテキストメニュー
  const handleContextMenuPane = useCallback(
    (e: React.MouseEvent, tab: { fileName: string; filePath: string } | null) => {
      if (!tab) return;

      const relPath =
        folderPath && isSubpathOf(tab.filePath, folderPath)
          ? tab.filePath.slice(folderPath.length).replace(/^[\\/]/, '')
          : null;

      const appChildren: ContextMenuItem[] = customApps.map((app) => ({
        id: `pane-open-${app.id}`,
        label: app.name,
        icon: app.appType === 'vscode' ? <VscodeIcon /> : <ExternalAppIcon />,
        onClick: () => handleOpenInApp(tab.filePath, app.appType, app.path),
      }));

      appChildren.push(
        {
          id: 'pane-open-notepad',
          label: 'メモ帳で開く',
          icon: <NotepadIcon />,
          onClick: () => handleOpenInApp(tab.filePath, 'notepad'),
        },
        {
          id: 'pane-open-default',
          label: '既定のアプリで開く',
          icon: <ExternalAppIcon />,
          onClick: () => handleOpenInApp(tab.filePath, 'default'),
        }
      );

      const items: ContextMenuItem[] = [
        {
          id: 'pane-other-apps',
          label: '他のアプリで開く',
          icon: <ExternalAppIcon />,
          children: appChildren,
        },
        {
          id: 'pane-reveal-explorer',
          label: 'エクスプローラーで表示',
          icon: <ExplorerIcon />,
          onClick: () => handleRevealInExplorer(tab.filePath),
        },
        { id: 'pane-div-1', label: '', divider: true },
        {
          id: 'pane-copy-path',
          label: 'ファイルパスをコピー',
          icon: <CopyIcon />,
          onClick: () => handleCopyPath(tab.filePath),
        },
      ];

      if (relPath) {
        items.push({
          id: 'pane-copy-rel-path',
          label: '相対パスをコピー',
          icon: <CopyIcon />,
          onClick: () => handleCopyPath(relPath),
        });
      }

      items.push(
        { id: 'pane-div-2', label: '', divider: true },
        {
          id: 'pane-print',
          label: '印刷 / PDF保存',
          icon: <PrintIcon />,
          shortcut: 'Ctrl+Shift+P',
          onClick: () => {
            closeContextMenu();
            handlePrintDocument();
          },
        }
      );

      openContextMenu(e, items, tab.fileName);
    },
    [
      folderPath,
      customApps,
      handleOpenInApp,
      handleRevealInExplorer,
      handleCopyPath,
      handlePrintDocument,
      closeContextMenu,
      openContextMenu,
    ]
  );

  return {
    contextMenu,
    closeContextMenu,
    handleContextMenuFile,
    handleContextMenuTab,
    handleContextMenuPane,
  };
}
