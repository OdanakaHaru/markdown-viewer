import React, { useCallback } from 'react';
import type { CustomApp } from '../types';
import { useContextMenu } from './useContextMenu';
import {
  type ContextMenuIcons,
  buildFileContextMenuItems,
  buildTabContextMenuItems,
  buildPaneContextMenuItems,
} from '../utils/contextMenuItems';
import {
  VscodeIcon,
  NotepadIcon,
  ExternalAppIcon,
  ExplorerIcon,
  CopyIcon,
  PrintIcon,
  GitIcon,
} from '../components/common/Icons';

interface UseAppContextMenuProps {
  customApps: CustomApp[];
  folderPath: string | null;
  handleCloseTab: (paneId: string, tabId: string) => void;
  handleCloseOtherTabs: (paneId: string, tabId: string) => void;
  handleCloseTabsToRight: (paneId: string, tabId: string) => void;
  handlePrintDocument: () => void;
  onOpenDiff: (path?: string) => void;
  onCompareGit?: (path: string, revision?: string) => void;
  onOpenGitCommitModal?: (path: string) => void;
  onError?: (msg: string) => void;
}

const ICONS: ContextMenuIcons = {
  vscode: <VscodeIcon />,
  notepad: <NotepadIcon />,
  externalApp: <ExternalAppIcon />,
  explorer: <ExplorerIcon />,
  copy: <CopyIcon />,
  print: <PrintIcon />,
  git: <GitIcon />,
};

export function useAppContextMenu({
  customApps,
  folderPath,
  handleCloseTab,
  handleCloseOtherTabs,
  handleCloseTabsToRight,
  handlePrintDocument,
  onOpenDiff,
  onCompareGit,
  onOpenGitCommitModal,
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
      const items = buildFileContextMenuItems({
        entry,
        folderPath,
        customApps,
        icons: ICONS,
        actions: {
          onOpenInApp: handleOpenInApp,
          onOpenDiff,
          onCompareGit,
          onOpenGitCommitModal,
          onRevealInExplorer: handleRevealInExplorer,
          onCopyPath: handleCopyPath,
        },
      });

      openContextMenu(e, items, entry.name);
    },
    [
      folderPath,
      customApps,
      handleOpenInApp,
      onOpenDiff,
      onCompareGit,
      onOpenGitCommitModal,
      handleRevealInExplorer,
      handleCopyPath,
      openContextMenu,
    ]
  );

  // 2. タブ用コンテキストメニュー
  const handleContextMenuTab = useCallback(
    (e: React.MouseEvent, tab: { id: string; fileName: string; filePath: string }, paneId: string) => {
      const items = buildTabContextMenuItems({
        tab,
        paneId,
        folderPath,
        customApps,
        icons: ICONS,
        actions: {
          onOpenInApp: handleOpenInApp,
          onRevealInExplorer: handleRevealInExplorer,
          onOpenDiff,
          onCompareGit,
          onOpenGitCommitModal,
          onCopyPath: handleCopyPath,
          onCloseTab: handleCloseTab,
          onCloseOtherTabs: handleCloseOtherTabs,
          onCloseTabsToRight: handleCloseTabsToRight,
        },
      });

      openContextMenu(e, items, tab.fileName);
    },
    [
      folderPath,
      customApps,
      handleOpenInApp,
      handleRevealInExplorer,
      onOpenDiff,
      onCompareGit,
      onOpenGitCommitModal,
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

      const items = buildPaneContextMenuItems({
        tab,
        folderPath,
        customApps,
        icons: ICONS,
        actions: {
          onOpenInApp: handleOpenInApp,
          onRevealInExplorer: handleRevealInExplorer,
          onCopyPath: handleCopyPath,
          onPrintDocument: () => {
            closeContextMenu();
            handlePrintDocument();
          },
        },
      });

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
