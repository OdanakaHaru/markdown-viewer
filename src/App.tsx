import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import type { FileEntry, ResolvedLink, TabItem } from './types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { MarkdownPane } from './components/MarkdownPane';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useFullscreen } from './hooks/useFullscreen';
import { usePanes } from './hooks/usePanes';
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

function App() {
  // --- カスタムフックによる関心事の分離 ---
  const {
    themeMode,
    effectiveTheme,
    handleThemeChange,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useTheme();

  const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen();

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
    handleSplitPane,
    handleMoveTab,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
  } = usePanes();

  // --- フォルダ・ツリー状態 ---
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  // --- アプリ共通状態 ---
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // アクティブタブが現在開いているフォルダの配下として表示すべきかどうか
  const showFolderInBreadcrumb = Boolean(
    folderName &&
    folderPath &&
    activeTab &&
    !activeTab.isStandalone &&
    activeTab.filePath &&
    isSubpathOf(activeTab.filePath, folderPath)
  );

  // アクティブタブ変更に応じたタイトル更新
  useEffect(() => {
    if (activeTab) {
      updateTitle(activeTab.fileName, showFolderInBreadcrumb ? folderName : null);
    } else {
      updateTitle('Markdown Viewer', folderName);
    }
  }, [activeTab, folderName, showFolderInBreadcrumb, updateTitle]);

  // アンカー位置へスムーズにスクロールする
  const scrollToAnchor = useCallback((hash: string, _paneId?: string) => {
    if (!hash) return;
    try {
      const rawHash = hash.replace(/^#/, '');
      const decoded = decodeURIComponent(rawHash).trim();
      const slug = slugify(decoded);

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

  // ブラウザ既定のドラッグ＆ドロップ動作を抑制
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
          content: text,
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
    [activePaneId, addTabToPane, scrollToAnchor, setActivePaneId]
  );

  const handleDropFile = (filePath: string, targetPaneId: string) => {
    handleSelectFile(filePath, null, targetPaneId);
  };

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
        if (
          href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('mailto:')
        ) {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      try {
        const sourcePane = panes.find((p) => p.id === sourcePaneId);
        const sourceTab = sourcePane?.tabs.find((t) => t.id === sourcePane.activeTabId);
        const baseFilePath = sourceTab?.filePath || null;

        const resolved = await invoke<ResolvedLink>('resolve_link_target', {
          baseFilePath,
          baseFolderPath: sourceTab?.isStandalone ? null : folderPath,
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
      setError(
        'この機能はデスクトップアプリ環境でのみ動作します。ファイルをドラッグ＆ドロップしてください。'
      );
      return;
    }
    try {
      const [path, text] = await invoke<[string, string]>('open_md_file');
      const filename = getPathBaseName(path) || 'Untitled';

      const newTab: TabItem = {
        id: generateId(),
        filePath: path,
        fileName: filename,
        content: text,
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

  // アクティブペインIDの最新参照を保持（イベントリスナー用）
  const activePaneIdRef = useRef(activePaneId);
  useEffect(() => {
    activePaneIdRef.current = activePaneId;
  }, [activePaneId]);

  const lastDropHandledTimeRef = useRef<number>(0);

  // Tauriネイティブのファイルドロップリスナー (Windows / macOS)
  useEffect(() => {
    if (!appWindow) return;

    let unlisten: (() => void) | undefined;
    appWindow
      .onDragDropEvent(async (event) => {
        if (event.payload.type === 'over' || event.payload.type === 'enter') {
          setIsDragging(true);
        } else if (event.payload.type === 'leave') {
          setIsDragging(false);
        } else if (event.payload.type === 'drop') {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          const path = paths[0];
          if (!isMarkdownFile(path)) {
            setError('Markdown (.md, .markdown) ファイルをドロップしてください。');
            return;
          }

          lastDropHandledTimeRef.current = Date.now();

          try {
            const [filePath, text] = await invoke<[string, string]>('read_md_file', { path });
            const filename = getPathBaseName(filePath) || 'Untitled';

            const newTab: TabItem = {
              id: generateId(),
              filePath,
              fileName: filename,
              content: text,
              isStandalone: true,
            };

            addTabToPane(activePaneIdRef.current, newTab);
            setError('');
          } catch (err: unknown) {
            setError(typeof err === 'string' ? err : 'ファイルの読み込みに失敗しました。');
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error('onDragDropEvent の登録に失敗:', err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [addTabToPane]);

  // ファイル/フォルダがドロップされた時の処理 (HTML5フォールバック)
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // ネイティブ側で既に処理された直後の場合は重複防止
    if (Date.now() - lastDropHandledTimeRef.current < 1000) {
      return;
    }

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
        content: html,
        isStandalone: true,
      };

      addTabToPane(activePaneId, newTab);
      setError('');
    } catch {
      setError('ファイルの読み込みに失敗しました。');
    }
  };

  // キーボードショートカットの一元管理
  const shortcutActions = useMemo(
    () => ({
      closeActiveTab,
      nextTab: goToNextTab,
      prevTab: goToPrevTab,
      goToTab: goToNthTab,
      openFile: handleOpenFile,
      reopenClosedTab: handleReopenClosedTab,
      toggleSidebar: () => setIsSidebarOpen((prev) => !prev),
      openSettings: () => setIsSettingsOpen(true),
      toggleFullscreen,
      exitFullscreen,
    }),
    [
      closeActiveTab,
      goToNextTab,
      goToPrevTab,
      goToNthTab,
      handleOpenFile,
      handleReopenClosedTab,
      setIsSettingsOpen,
      toggleFullscreen,
      exitFullscreen,
    ]
  );

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

        {activeTab && (
          <div className="toolbar-breadcrumb" title={activeTab.filePath}>
            {showFolderInBreadcrumb && <span className="breadcrumb-folder">{folderName} / </span>}
            <span className="breadcrumb-file">{activeTab.fileName}</span>
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
            selectedFilePath={activeTab?.isStandalone ? null : (activeTab?.filePath || null)}
            rootEntries={rootEntries}
            isLoadingRoot={isLoadingRoot}
            onOpenFolder={handleOpenFolder}
            onRefresh={handleRefreshFolder}
            onSelectFile={(path) => handleSelectFile(path)}
            onToggleSidebar={() => setIsSidebarOpen(false)}
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
