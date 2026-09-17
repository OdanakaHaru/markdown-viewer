import type { ReactNode } from 'react';
import type { ContextMenuItem, CustomApp } from '../types';
import { isSubpathOf } from './path';

/**
 * コンテキストメニューで使用するアイコン定義
 */
export interface ContextMenuIcons {
  vscode?: ReactNode;
  notepad?: ReactNode;
  externalApp?: ReactNode;
  explorer?: ReactNode;
  copy?: ReactNode;
  print?: ReactNode;
  git?: ReactNode;
}

/**
 * フォルダパスを基準とした相対パスを計算する
 *
 * @param filePath 対象ファイルの絶対パス
 * @param folderPath ルートフォルダの絶対パス
 * @returns 相対パス、またはルート配下でない場合は `null`
 */
export function getRelativePath(filePath: string, folderPath: string | null): string | null {
  if (folderPath && isSubpathOf(filePath, folderPath)) {
    return filePath.slice(folderPath.length).replace(/^[\\/]/, '');
  }
  return null;
}

/**
 * 「他のアプリで開く」サブメニュー項目配列を生成するヘルパー関数
 */
function buildAppSubmenuItems(
  filePath: string,
  customApps: CustomApp[],
  onOpenInApp: (path: string, appType: 'vscode' | 'notepad' | 'default' | 'custom', appPath?: string) => void,
  prefix: string,
  icons?: ContextMenuIcons
): ContextMenuItem[] {
  const children: ContextMenuItem[] = customApps.map((app) => ({
    id: `${prefix}-open-${app.id}`,
    label: app.name,
    icon: app.appType === 'vscode' ? icons?.vscode : icons?.externalApp,
    onClick: () => onOpenInApp(filePath, app.appType, app.path),
  }));

  children.push(
    {
      id: `${prefix === 'file' ? '' : prefix + '-'}open-notepad`,
      label: 'メモ帳で開く',
      icon: icons?.notepad,
      onClick: () => onOpenInApp(filePath, 'notepad'),
    },
    {
      id: `${prefix === 'file' ? '' : prefix + '-'}open-default`,
      label: '既定のアプリで開く',
      icon: icons?.externalApp,
      onClick: () => onOpenInApp(filePath, 'default'),
    }
  );

  return children;
}

export interface BuildFileContextMenuOptions {
  entry: { name: string; path: string; is_dir: boolean };
  folderPath: string | null;
  customApps: CustomApp[];
  icons?: ContextMenuIcons;
  actions: {
    onOpenInApp: (path: string, appType: 'vscode' | 'notepad' | 'default' | 'custom', appPath?: string) => void;
    onOpenDiff: (path: string) => void;
    onCompareGit?: (path: string, revision?: string) => void;
    onOpenGitCommitModal?: (path: string) => void;
    onRevealInExplorer: (path: string) => void;
    onCopyPath: (path: string) => void;
  };
}

/**
 * ファイルツリーのファイル/ディレクトリ用のコンテキストメニュー項目を生成する純粋関数
 *
 * @param options メニュー構築用オプション
 * @returns コンテキストメニュー項目配列
 */
export function buildFileContextMenuItems({
  entry,
  folderPath,
  customApps,
  icons,
  actions,
}: BuildFileContextMenuOptions): ContextMenuItem[] {
  const isDir = entry.is_dir;
  const relPath = getRelativePath(entry.path, folderPath);
  const items: ContextMenuItem[] = [];

  if (!isDir) {
    const appChildren = buildAppSubmenuItems(
      entry.path,
      customApps,
      actions.onOpenInApp,
      'file',
      icons
    );

    if (actions.onCompareGit) {
      items.push({
        id: 'git-diff-compare',
        label: 'Git HEAD と差分比較',
        icon: icons?.git || icons?.explorer,
        onClick: () => actions.onCompareGit!(entry.path, 'HEAD'),
      });
    }

    if (actions.onOpenGitCommitModal) {
      items.push({
        id: 'git-commit-history-diff',
        label: 'Git コミット履歴と比較...',
        icon: icons?.git || icons?.explorer,
        onClick: () => actions.onOpenGitCommitModal!(entry.path),
      });
    }

    items.push({
      id: 'diff-compare',
      label: '別ファイルと差分比較...',
      icon: icons?.explorer,
      onClick: () => actions.onOpenDiff(entry.path),
    });

    items.push({
      id: 'other-apps',
      label: '他のアプリで開く',
      icon: icons?.externalApp,
      children: appChildren,
    });
  } else {
    items.push({
      id: 'open-folder-vscode',
      label: 'VS Code で開く',
      icon: icons?.vscode,
      onClick: () => actions.onOpenInApp(entry.path, 'vscode'),
    });
  }

  items.push({
    id: 'reveal-explorer',
    label: 'エクスプローラーで表示',
    icon: icons?.explorer,
    onClick: () => actions.onRevealInExplorer(entry.path),
  });

  items.push({ id: 'div-copy', label: '', divider: true });

  items.push({
    id: 'copy-path',
    label: 'パスをコピー',
    icon: icons?.copy,
    onClick: () => actions.onCopyPath(entry.path),
  });

  if (relPath) {
    items.push({
      id: 'copy-rel-path',
      label: '相対パスをコピー',
      icon: icons?.copy,
      onClick: () => actions.onCopyPath(relPath),
    });
  }

  return items;
}

export interface BuildTabContextMenuOptions {
  tab: { id: string; fileName: string; filePath: string };
  paneId: string;
  folderPath: string | null;
  customApps: CustomApp[];
  icons?: ContextMenuIcons;
  actions: {
    onOpenInApp: (path: string, appType: 'vscode' | 'notepad' | 'default' | 'custom', appPath?: string) => void;
    onRevealInExplorer: (path: string) => void;
    onOpenDiff: (path: string) => void;
    onCompareGit?: (path: string, revision?: string) => void;
    onOpenGitCommitModal?: (path: string) => void;
    onCopyPath: (path: string) => void;
    onCloseTab: (paneId: string, tabId: string) => void;
    onCloseOtherTabs: (paneId: string, tabId: string) => void;
    onCloseTabsToRight: (paneId: string, tabId: string) => void;
  };
}

/**
 * エディタタブ用のコンテキストメニュー項目を生成する純粋関数
 *
 * @param options メニュー構築用オプション
 * @returns コンテキストメニュー項目配列
 */
export function buildTabContextMenuItems({
  tab,
  paneId,
  folderPath,
  customApps,
  icons,
  actions,
}: BuildTabContextMenuOptions): ContextMenuItem[] {
  const relPath = getRelativePath(tab.filePath, folderPath);
  const appChildren = buildAppSubmenuItems(
    tab.filePath,
    customApps,
    actions.onOpenInApp,
    'tab',
    icons
  );

  const items: ContextMenuItem[] = [
    {
      id: 'tab-other-apps',
      label: '他のアプリで開く',
      icon: icons?.externalApp,
      children: appChildren,
    },
    {
      id: 'tab-reveal-explorer',
      label: 'エクスプローラーで表示',
      icon: icons?.explorer,
      onClick: () => actions.onRevealInExplorer(tab.filePath),
    },
    ...(actions.onCompareGit && !tab.filePath.startsWith('git://') && !tab.filePath.includes('::')
      ? [
          {
            id: 'tab-git-diff-compare',
            label: 'Git HEAD と差分比較',
            icon: icons?.git || icons?.explorer,
            onClick: () => actions.onCompareGit!(tab.filePath, 'HEAD'),
          },
        ]
      : []),
    ...(actions.onOpenGitCommitModal && !tab.filePath.startsWith('git://') && !tab.filePath.includes('::')
      ? [
          {
            id: 'tab-git-commit-history-diff',
            label: 'Git コミット履歴と比較...',
            icon: icons?.git || icons?.explorer,
            onClick: () => actions.onOpenGitCommitModal!(tab.filePath),
          },
        ]
      : []),
    {
      id: 'tab-diff-compare',
      label: '別ファイルと差分比較...',
      icon: icons?.explorer,
      onClick: () => actions.onOpenDiff(tab.filePath),
    },
    { id: 'tab-div-1', label: '', divider: true },
    {
      id: 'tab-copy-path',
      label: 'パスをコピー',
      icon: icons?.copy,
      onClick: () => actions.onCopyPath(tab.filePath),
    },
  ];

  if (relPath) {
    items.push({
      id: 'tab-copy-rel-path',
      label: '相対パスをコピー',
      icon: icons?.copy,
      onClick: () => actions.onCopyPath(relPath),
    });
  }

  items.push(
    { id: 'tab-div-close', label: '', divider: true },
    {
      id: 'tab-close',
      label: 'タブを閉じる',
      shortcut: 'Ctrl+W',
      onClick: () => actions.onCloseTab(paneId, tab.id),
    },
    {
      id: 'tab-close-others',
      label: '他のタブを閉じる',
      onClick: () => actions.onCloseOtherTabs(paneId, tab.id),
    },
    {
      id: 'tab-close-to-right',
      label: '右側のタブを閉じる',
      onClick: () => actions.onCloseTabsToRight(paneId, tab.id),
    }
  );

  return items;
}

export interface BuildPaneContextMenuOptions {
  tab: { fileName: string; filePath: string };
  folderPath: string | null;
  customApps: CustomApp[];
  icons?: ContextMenuIcons;
  actions: {
    onOpenInApp: (path: string, appType: 'vscode' | 'notepad' | 'default' | 'custom', appPath?: string) => void;
    onRevealInExplorer: (path: string) => void;
    onCopyPath: (path: string) => void;
    onPrintDocument: () => void;
  };
}

/**
 * ペイン背景およびMarkdownプレビュー領域用のコンテキストメニュー項目を生成する純粋関数
 *
 * @param options メニュー構築用オプション
 * @returns コンテキストメニュー項目配列
 */
export function buildPaneContextMenuItems({
  tab,
  folderPath,
  customApps,
  icons,
  actions,
}: BuildPaneContextMenuOptions): ContextMenuItem[] {
  const relPath = getRelativePath(tab.filePath, folderPath);
  const appChildren = buildAppSubmenuItems(
    tab.filePath,
    customApps,
    actions.onOpenInApp,
    'pane',
    icons
  );

  const items: ContextMenuItem[] = [
    {
      id: 'pane-other-apps',
      label: '他のアプリで開く',
      icon: icons?.externalApp,
      children: appChildren,
    },
    {
      id: 'pane-reveal-explorer',
      label: 'エクスプローラーで表示',
      icon: icons?.explorer,
      onClick: () => actions.onRevealInExplorer(tab.filePath),
    },
    { id: 'pane-div-1', label: '', divider: true },
    {
      id: 'pane-copy-path',
      label: 'ファイルパスをコピー',
      icon: icons?.copy,
      onClick: () => actions.onCopyPath(tab.filePath),
    },
  ];

  if (relPath) {
    items.push({
      id: 'pane-copy-rel-path',
      label: '相対パスをコピー',
      icon: icons?.copy,
      onClick: () => actions.onCopyPath(relPath),
    });
  }

  items.push(
    { id: 'pane-div-2', label: '', divider: true },
    {
      id: 'pane-print',
      label: '印刷 / PDF保存',
      icon: icons?.print,
      shortcut: 'Ctrl+Shift+P',
      onClick: actions.onPrintDocument,
    }
  );

  return items;
}
