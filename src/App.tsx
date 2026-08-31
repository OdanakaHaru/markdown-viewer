import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import type { FileEntry, ResolvedLink, ThemeMode, PaneItem, TabItem } from './types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { MarkdownPane } from './components/MarkdownPane';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  SidebarToggleIcon,
  FolderOpenBtnIcon,
  MarkdownFileIcon,
  SettingsIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from './components/Icons';

// Tauri環境かどうかの判定
const isTauri = '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWebviewWindow() : null;

/**
 * Markdownファイルの拡張子かどうかを判定する
 */
function isMarkdownFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mdown') ||
    lower.endsWith('.mkd') ||
    lower.endsWith('.mdx')
  );
}

/**
 * 見出し文字列からアンカーID（スラッグ）を生成する
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u00A0-\uFFFF -]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * ファイルパスから親ディレクトリのパスを取得する
 */
function getParentDirPath(filePath: string): string | null {
  const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastIndex <= 0) return null;
  return filePath.substring(0, lastIndex);
}

/**
 * ファイルパスまたはディレクトリパスから末尾のディレクトリ名/ファイル名を取得する
 */
function getPathBaseName(pathStr: string): string {
  return pathStr.split(/[/\\]/).filter(Boolean).pop() || pathStr;
}

/**
 * filePath が targetDirPath の配下にあるかどうかを判定する
 */
function isSubpathOf(filePath: string, targetDirPath: string): boolean {
  const normFile = filePath.replace(/\\/g, '/').toLowerCase();
  const normDir = targetDirPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return normFile === normDir || normFile.startsWith(normDir + '/');
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/** 閉じたタブの履歴保持上限 */
const MAX_CLOSED_TABS_HISTORY = 10;

/** 閉じたタブの履歴エントリ */
interface ClosedTabEntry {
  tab: TabItem;
  paneId: string;
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  // ペイン管理
  const [panes, setPanes] = useState<PaneItem[]>([{ id: 'pane-1', tabs: [], activeTabId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');

  // 閉じたタブの履歴（Ctrl+Shift+T で復元用）
  const [closedTabsHistory, setClosedTabsHistory] = useState<ClosedTabEntry[]>([]);

  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Markdownテーマ設定状態 (light | dark | system)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('markdown_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'light';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ペインのファイルが0になったらペインを閉じるかの設定
  const [autoCloseEmptyPane, setAutoCloseEmptyPane] = useState<boolean>(() => {
    const saved = localStorage.getItem('markdown_auto_close_empty_pane');
    return saved === 'true'; // デフォルトはfalse。保存されていればそれに従う
  });

  const handleAutoCloseEmptyPaneChange = (value: boolean) => {
    setAutoCloseEmptyPane(value);
    localStorage.setItem('markdown_auto_close_empty_pane', String(value));
  };

  // システムのカラースキーム変更を監視
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // テーマ切り替えハンドラ
  const handleThemeChange = (newTheme: ThemeMode) => {
    setThemeMode(newTheme);
    localStorage.setItem('markdown_theme_mode', newTheme);
  };

  // 実際にMarkdownプレビューに適用されるテーマ ('light' | 'dark')
  const effectiveTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;

  // テーマに合わせて html / body レベルの属性とカラーモードを同期
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  // ウィンドウタイトルをファイル名で更新する
  const updateTitle = useCallback((filename: string, dirName?: string | null) => {
    const title = dirName
      ? `${filename} - ${dirName} - Markdown Viewer`
      : `${filename} - Markdown Viewer`;
    document.title = title;
    appWindow?.setTitle(title).catch((err) => {
      console.error('ウィンドウタイトルの更新に失敗:', err);
    });
  }, []);

  // Title update effect based on active tab
  useEffect(() => {
    const activePane = panes.find(p => p.id === activePaneId);
    const activeTab = activePane?.tabs.find(t => t.id === activePane.activeTabId);
    if (activeTab) {
      updateTitle(activeTab.fileName, folderName);
    } else {
      updateTitle('Markdown Viewer', folderName);
    }
  }, [panes, activePaneId, folderName, updateTitle]);

  // アンカー位置へスムーズにスクロールする
  const scrollToAnchor = useCallback((hash: string, _paneId?: string) => {
    if (!hash) return;
    try {
      const rawHash = hash.replace(/^#/, '');
      const decoded = decodeURIComponent(rawHash).trim();
      const slug = slugify(decoded);

      // paneIdが指定されている場合は、そのペイン内の要素に限定する（ここでは簡易的にdocument全体から検索）
      const targetElement =
        document.getElementById(decoded) ||
        document.getElementById(slug) ||
        document.getElementById(rawHash) ||
        (decoded ? document.querySelector(`[id="${CSS.escape(decoded)}"]`) : null) ||
        (slug ? document.querySelector(`[id="${CSS.escape(slug)}"]`) : null);

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error('アンカーへのスクロールに失敗:', err);
    }
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // 全画面モードの切り替え
  const toggleFullscreen = useCallback(async () => {
    if (isTauri && appWindow) {
      try {
        const isFull = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFull);
        setIsFullscreen(!isFull);
      } catch (err) {
        console.error('全画面モードの切り替えに失敗:', err);
      }
    } else {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } else {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      } catch (err) {
        console.error('全画面モードの切り替えに失敗:', err);
      }
    }
  }, []);

  // 全画面解除の処理（Escapeキー用）
  const exitFullscreen = useCallback(async () => {
    if (isTauri && appWindow) {
      try {
        const isFull = await appWindow.isFullscreen();
        if (isFull) {
          await appWindow.setFullscreen(false);
          setIsFullscreen(false);
        }
      } catch (err) {
        console.error('全画面モードの解除に失敗:', err);
      }
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.error('全画面モードの解除に失敗:', err);
      }
    }
  }, []);

  // fullscreenchangeイベントの監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const preventDefaults = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);

    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  // フォルダ内のエントリ一覧を読み込む
  const loadDirectory = useCallback(async (path: string) => {
    setIsLoadingRoot(true);
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path });
      setRootEntries(entries);
      setError('');
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : 'フォルダの読み込みに失敗しました。');
      setRootEntries([]);
    } finally {
      setIsLoadingRoot(false);
    }
  }, []);

  // 「フォルダを開く」ハンドラ
  const handleOpenFolder = async () => {
    if (!isTauri) {
      setError('フォルダ選択機能はデスクトップアプリ環境でのみ動作します。');
      return;
    }
    try {
      const path = await invoke<string>('open_folder');
      const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
      setFolderPath(path);
      setFolderName(name);
      setIsSidebarOpen(true);
      await loadDirectory(path);
    } catch (err: unknown) {
      if (err !== 'No folder selected') {
        setError(typeof err === 'string' ? err : 'フォルダの選択に失敗しました。');
      }
    }
  };

  // ルートフォルダの最新化
  const handleRefreshFolder = async () => {
    if (folderPath) {
      await loadDirectory(folderPath);
    }
  };

  // ペイン操作用のヘルパー関数群
  const addTabToPane = useCallback((paneId: string, tab: TabItem) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id === paneId) {
        return {
          ...pane,
          tabs: [...pane.tabs, tab],
          activeTabId: tab.id
        };
      }
      return pane;
    }));
  }, []);

  const handleSelectTab = useCallback((paneId: string, tabId: string) => {
    setPanes(prev => prev.map(pane => {
      if (pane.id === paneId) {
        return { ...pane, activeTabId: tabId };
      }
      return pane;
    }));
  }, []);

  const handleClosePane = useCallback((paneId: string) => {
    setPanes(prev => {
      if (prev.length <= 1) return prev; // 最後の1ペインは閉じない
      const newPanes = prev.filter(p => p.id !== paneId);
      return newPanes;
    });
    setActivePaneId(prev => {
      if (prev === paneId) {
        const remaining = panes.filter(p => p.id !== paneId);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : prev;
      }
      return prev;
    });
  }, [panes]);

  const handleCloseTab = useCallback((paneId: string, tabId: string) => {
    const currentPane = panes.find(p => p.id === paneId);
    if (!currentPane) return;

    // 閉じるタブを履歴に保存（復元用）
    const closingTab = currentPane.tabs.find(t => t.id === tabId);
    if (closingTab) {
      setClosedTabsHistory(prev => {
        const newHistory = [{ tab: closingTab, paneId }, ...prev];
        return newHistory.slice(0, MAX_CLOSED_TABS_HISTORY);
      });
    }

    const newTabs = currentPane.tabs.filter(t => t.id !== tabId);

    if (newTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
      handleClosePane(paneId);
      return;
    }

    setPanes(prev => prev.map(pane => {
      if (pane.id === paneId) {
        let newActiveTabId = pane.activeTabId;
        if (pane.activeTabId === tabId) {
          newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
        }
        return { ...pane, tabs: newTabs, activeTabId: newActiveTabId };
      }
      return pane;
    }));
  }, [panes, autoCloseEmptyPane, handleClosePane]);

  const handleSplitPane = (paneId: string) => {
    if (panes.length >= 3) return; // 最大3ペイン
    const currentPane = panes.find(p => p.id === paneId);
    if (!currentPane) return;

    const newPaneId = `pane-${generateId()}`;
    // 現在のペインのアクティブタブをコピーして新しいペインを作成
    const activeTab = currentPane.tabs.find(t => t.id === currentPane.activeTabId);
    let newTabs: TabItem[] = [];
    let newActiveTabId: string | null = null;
    
    if (activeTab) {
      const clonedTab = { ...activeTab, id: generateId() };
      newTabs.push(clonedTab);
      newActiveTabId = clonedTab.id;
    }

    const paneIndex = panes.findIndex(p => p.id === paneId);
    const newPanes = [...panes];
    newPanes.splice(paneIndex + 1, 0, { id: newPaneId, tabs: newTabs, activeTabId: newActiveTabId });
    setPanes(newPanes);
    setActivePaneId(newPaneId);
  };

  const handleMoveTab = (sourcePaneId: string, tabId: string, targetPaneId: string) => {
    if (sourcePaneId === targetPaneId) return;
    
    const sourcePane = panes.find(p => p.id === sourcePaneId);
    const tabToMove = sourcePane?.tabs.find(t => t.id === tabId);
    if (!tabToMove) return;

    const sourceNewTabs = sourcePane!.tabs.filter(t => t.id !== tabId);

    if (sourceNewTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
      setPanes(prev => {
        let newPanes = prev.filter(p => p.id !== sourcePaneId);
        newPanes = newPanes.map(p => {
          if (p.id === targetPaneId) {
            return {
              ...p,
              tabs: [...p.tabs, tabToMove],
              activeTabId: tabToMove.id
            };
          }
          return p;
        });
        return newPanes;
      });
      setActivePaneId(targetPaneId);
      return;
    }

    setPanes(prev => {
      let newPanes = [...prev];
      
      newPanes = newPanes.map(p => {
        if (p.id === sourcePaneId) {
          const newTabs = p.tabs.filter(t => t.id !== tabId);
          let newActiveTabId = p.activeTabId;
          if (p.activeTabId === tabId) {
            newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }
          return { ...p, tabs: newTabs, activeTabId: newActiveTabId };
        }
        return p;
      });

      newPanes = newPanes.map(p => {
        if (p.id === targetPaneId) {
          return {
            ...p,
            tabs: [...p.tabs, tabToMove],
            activeTabId: tabToMove.id
          };
        }
        return p;
      });

      return newPanes;
    });
    setActivePaneId(targetPaneId);
  };

  // --- タブナビゲーション用ヘルパー ---

  /** アクティブペインの次のタブに切り替え */
  const goToNextTab = useCallback(() => {
    const pane = panes.find(p => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex(t => t.id === pane.activeTabId);
    const nextIndex = (currentIndex + 1) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[nextIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインの前のタブに切り替え */
  const goToPrevTab = useCallback(() => {
    const pane = panes.find(p => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex(t => t.id === pane.activeTabId);
    const prevIndex = (currentIndex - 1 + pane.tabs.length) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[prevIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインのN番目のタブに切り替え（1始まり、9は最後のタブ） */
  const goToNthTab = useCallback((n: number) => {
    const pane = panes.find(p => p.id === activePaneId);
    if (!pane || pane.tabs.length === 0) return;
    const index = n === 9 ? pane.tabs.length - 1 : Math.min(n - 1, pane.tabs.length - 1);
    handleSelectTab(activePaneId, pane.tabs[index].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインのアクティブタブを閉じる */
  const closeActiveTab = useCallback(() => {
    const pane = panes.find(p => p.id === activePaneId);
    if (!pane || !pane.activeTabId) return;
    handleCloseTab(activePaneId, pane.activeTabId);
  }, [panes, activePaneId, handleCloseTab]);

  /** 最後に閉じたタブを復元 */
  const handleReopenClosedTab = useCallback(() => {
    if (closedTabsHistory.length === 0) return;
    const [lastClosed, ...rest] = closedTabsHistory;
    setClosedTabsHistory(rest);

    // 復元先のペインが存在するか確認。なければアクティブペインに復元
    const targetPaneId = panes.find(p => p.id === lastClosed.paneId)
      ? lastClosed.paneId
      : activePaneId;

    const restoredTab: TabItem = {
      ...lastClosed.tab,
      id: generateId(), // 新しいIDを付与して重複を避ける
    };

    addTabToPane(targetPaneId, restoredTab);
    setActivePaneId(targetPaneId);
  }, [closedTabsHistory, panes, activePaneId, addTabToPane]);

  const handleDropFile = (filePath: string, targetPaneId: string) => {
    handleSelectFile(filePath, null, targetPaneId);
  };

  // ファイルを選択して表示
  const handleSelectFile = useCallback(
    async (path: string, initialHash?: string | null, targetPaneId?: string) => {
      try {
        const [filePath, text] = await invoke<[string, string]>('read_md_file', { path });
        const filename = filePath.split(/[/\\]/).pop() || 'Untitled';
        
        const newTab: TabItem = {
          id: generateId(),
          filePath,
          fileName: filename,
          content: text
        };

        const targetId = targetPaneId || activePaneId;
        addTabToPane(targetId, newTab);
        setActivePaneId(targetId);
        setError('');

        if (initialHash) {
          setTimeout(() => {
            scrollToAnchor(initialHash, targetId);
          }, 100);
        }
      } catch (err: unknown) {
        setError(typeof err === 'string' ? err : 'ファイルの読み込みに失敗しました。');
      }
    },
    [activePaneId, addTabToPane, scrollToAnchor]
  );

  // Markdownリンクのクリック処理
  const handleLinkClick = useCallback(
    async (href: string, sourcePaneId: string) => {
      if (!href) return;

      // 1. 同一ドキュメント内のアンカーリンク (#見出し)
      if (href.startsWith('#')) {
        scrollToAnchor(href, sourcePaneId);
        return;
      }

      // デスクトップ環境以外 (Webプレビュー等) のフォールバック
      if (!isTauri) {
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      try {
        const sourcePane = panes.find(p => p.id === sourcePaneId);
        const sourceTab = sourcePane?.tabs.find(t => t.id === sourcePane.activeTabId);
        const baseFilePath = sourceTab?.filePath || null;

        const resolved = await invoke<ResolvedLink>('resolve_link_target', {
          baseFilePath,
          baseFolderPath: folderPath,
          href,
        });

        switch (resolved.kind) {
          case 'url':
          case 'file':
            await invoke('open_external', { target: resolved.target });
            break;

          case 'anchor':
            if (resolved.hash) {
              scrollToAnchor(resolved.hash, sourcePaneId);
            }
            break;

          case 'markdown':
            // リンク先は元のペインで新しいタブとして開く
            await handleSelectFile(resolved.target, resolved.hash, sourcePaneId);
            break;

          case 'markdown_not_found':
          case 'not_found':
            setError(`リンク先のファイルが見つかりません: ${resolved.target}`);
            break;

          default:
            await invoke('open_external', { target: resolved.target });
            break;
        }
      } catch (err: unknown) {
        setError(typeof err === 'string' ? err : 'リンクを開くことができませんでした。');
      }
    },
    [folderPath, handleSelectFile, scrollToAnchor, panes]
  );

  // 単一の「ファイルを開く」ハンドラ
  const handleOpenFile = useCallback(async () => {
    if (!isTauri) {
      setError('この機能はデスクトップアプリ環境でのみ動作します。ファイルをドラッグ＆ドロップしてください。');
      return;
    }
    try {
      const [path, text] = await invoke<[string, string]>('open_md_file');
      const filename = getPathBaseName(path) || 'Untitled';
      
      const newTab: TabItem = {
        id: generateId(),
        filePath: path,
        fileName: filename,
        content: text
      };

      addTabToPane(activePaneId, newTab);
      setError('');

      // 親ディレクトリの自動判定とサイドバー読み込み
      const parentDir = getParentDirPath(path);
      const parentDirName = parentDir ? getPathBaseName(parentDir) : null;
      const isAlreadyInFolder = folderPath ? isSubpathOf(path, folderPath) : false;

      if (!isAlreadyInFolder && parentDir && parentDirName) {
        setFolderPath(parentDir);
        setFolderName(parentDirName);
        setIsSidebarOpen(true);
        await loadDirectory(parentDir);
      }
    } catch (err: unknown) {
      if (err !== 'No file selected') {
        setError(typeof err === 'string' ? err : 'ファイルの選択に失敗しました。');
      }
    }
  }, [activePaneId, addTabToPane, folderPath, loadDirectory]);

  // ドラッグ中の判定
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/json')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  // ファイル/フォルダがドロップされた時の処理
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isMarkdownFile(file.name)) {
      setError('Markdown (.md, .markdown) ファイルをドロップしてください。');
      return;
    }

    try {
      const text = await file.text();
      const html = await invoke<string>('parse_markdown', { md: text });
      
      const droppedPath = (file as unknown as { path?: string }).path || '';
      const newTab: TabItem = {
        id: generateId(),
        filePath: droppedPath,
        fileName: file.name,
        content: html
      };

      addTabToPane(activePaneId, newTab);
      setError('');
    } catch {
      setError('ファイルの読み込みに失敗しました。');
    }
  };

  // パンくずリスト用のファイルパス取得
  const activePane = panes.find(p => p.id === activePaneId);
  const activeTabForBreadcrumb = activePane?.tabs.find(t => t.id === activePane.activeTabId);

  // キーボードショートカットの一元管理
  const shortcutActions = useMemo(() => ({
    closeActiveTab,
    nextTab: goToNextTab,
    prevTab: goToPrevTab,
    goToTab: goToNthTab,
    openFile: handleOpenFile,
    reopenClosedTab: handleReopenClosedTab,
    toggleSidebar: () => setIsSidebarOpen(prev => !prev),
    openSettings: () => setIsSettingsOpen(true),
    toggleFullscreen,
    exitFullscreen,
  }), [closeActiveTab, goToNextTab, goToPrevTab, goToNthTab, handleOpenFile, handleReopenClosedTab, toggleFullscreen, exitFullscreen]);

  useKeyboardShortcuts({ actions: shortcutActions, isSettingsOpen });

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
            className={`toolbar-icon-btn ${isSidebarOpen ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? 'サイドバーを非表示' : 'サイドバーを表示'}
          >
            <SidebarToggleIcon />
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn-folder"
            onClick={handleOpenFolder}
          >
            <FolderOpenBtnIcon className="btn-icon" />
            <span>フォルダを開く</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={handleOpenFile}
          >
            <MarkdownFileIcon className="btn-icon" />
            <span>ファイルを開く</span>
          </button>
        </div>

        {activeTabForBreadcrumb && (
          <div className="toolbar-breadcrumb" title={activeTabForBreadcrumb.filePath}>
            {folderName && <span className="breadcrumb-folder">{folderName} / </span>}
            <span className="breadcrumb-file">{activeTabForBreadcrumb.fileName}</span>
          </div>
        )}

        <div className="toolbar-right">
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
            selectedFilePath={activeTabForBreadcrumb?.filePath || null}
            rootEntries={rootEntries}
            isLoadingRoot={isLoadingRoot}
            onOpenFolder={handleOpenFolder}
            onRefresh={handleRefreshFolder}
            onSelectFile={(path) => handleSelectFile(path)}
            onToggleSidebar={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="content-area panes-container">
          {panes.map(pane => (
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
