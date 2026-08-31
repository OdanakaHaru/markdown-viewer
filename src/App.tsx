import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import 'github-markdown-css/github-markdown.css';
import './App.css';
import type { FileEntry, ResolvedLink, ThemeMode } from './types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
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

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [content, setContent] = useState('');
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

  // アンカー位置へスムーズにスクロールする
  const scrollToAnchor = useCallback((hash: string) => {
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

  // F11 (全画面切り替え) および Escape (全画面解除) のキーイベント監視
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        await toggleFullscreen();
      } else if (e.key === 'Escape' && !isSettingsOpen) {
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
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [toggleFullscreen, isSettingsOpen]);

  useEffect(() => {
    // windowレベルでdragover/dropのデフォルト動作を抑止し、
    // 🚫カーソルが表示されるのを防ぐ
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
    async (path: string, initialHash?: string | null) => {
      try {
        const [filePath, text] = await invoke<[string, string]>('read_md_file', { path });
        const filename = filePath.split(/[/\\]/).pop() || 'Untitled';
        setSelectedFilePath(filePath);
        setSelectedFileName(filename);
        setContent(text);
        setError('');
        updateTitle(filename, folderName);

        if (initialHash) {
          setTimeout(() => {
            scrollToAnchor(initialHash);
          }, 100);
        }
      } catch (err: unknown) {
        setError(typeof err === 'string' ? err : 'ファイルの読み込みに失敗しました。');
      }
    },
    [folderName, scrollToAnchor, updateTitle]
  );

  // Markdownリンクのクリック処理
  const handleLinkClick = useCallback(
    async (href: string) => {
      if (!href) return;

      // 1. 同一ドキュメント内のアンカーリンク (#見出し)
      if (href.startsWith('#')) {
        scrollToAnchor(href);
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
        const resolved = await invoke<ResolvedLink>('resolve_link_target', {
          baseFilePath: selectedFilePath,
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
              scrollToAnchor(resolved.hash);
            }
            break;

          case 'markdown':
            await handleSelectFile(resolved.target, resolved.hash);
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
    [folderPath, handleSelectFile, scrollToAnchor, selectedFilePath]
  );

  // HTMLコンテンツマウント後の処理（画像置換、見出しID付与）
  useEffect(() => {
    if (!content) return;
    const container = document.querySelector('.markdown-body');
    if (!container) return;

    // 画像パスの置換
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:') && !src.startsWith('http')) {
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

    // 見出しへのID付与（アンカーリンク用）
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      if (!heading.id) {
        const text = heading.textContent || '';
        const id = slugify(text);
        if (id) heading.id = id;
      }
    });
  }, [content, selectedFilePath, folderPath]);

  // HTMLクリック時のイベントハンドラ（リンクのインターセプト）
  const handleHtmlClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const a = target.closest('a');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) {
        handleLinkClick(href);
      }
    }
  }, [handleLinkClick]);

  // 単一の「ファイルを開く」ハンドラ
  const handleOpenFile = async () => {
    if (!isTauri) {
      setError('この機能はデスクトップアプリ環境でのみ動作します。ファイルをドラッグ＆ドロップしてください。');
      return;
    }
    try {
      const [path, text] = await invoke<[string, string]>('open_md_file');
      const filename = path.split(/[/\\]/).pop() || 'Untitled';
      setSelectedFilePath(path);
      setSelectedFileName(filename);
      setContent(text);
      setError('');
      updateTitle(filename, folderName);
    } catch (err: unknown) {
      if (err !== 'No file selected') {
        setError(typeof err === 'string' ? err : 'ファイルの選択に失敗しました。');
      }
    }
  };

  // ドラッグ中の判定
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
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
      setContent(html);
      setSelectedFilePath(null);
      setSelectedFileName(file.name);
      setError('');
      updateTitle(file.name, folderName);
    } catch {
      setError('ファイルの読み込みに失敗しました。');
    }
  };

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

        {selectedFileName && (
          <div className="toolbar-breadcrumb" title={selectedFilePath || selectedFileName}>
            {folderName && <span className="breadcrumb-folder">{folderName} / </span>}
            <span className="breadcrumb-file">{selectedFileName}</span>
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
            selectedFilePath={selectedFilePath}
            rootEntries={rootEntries}
            isLoadingRoot={isLoadingRoot}
            onOpenFolder={handleOpenFolder}
            onRefresh={handleRefreshFolder}
            onSelectFile={(path) => handleSelectFile(path)}
            onToggleSidebar={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="content-area">
          {content ? (
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
                className="markdown-body" 
                onClick={handleHtmlClick}
                dangerouslySetInnerHTML={{ __html: content }} 
              />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">ファイルが選択されていません</div>
              <div className="empty-state-text">
                {folderPath ? (
                  <>左側のエクスプローラーからMarkdownファイルを選択してください。</>
                ) : (
                  <>
                    「フォルダを開く」でプロジェクトフォルダを開くか、<br />
                    Markdownファイルをドラッグ＆ドロップしてください。
                  </>
                )}
              </div>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="empty-action-btn primary"
                  onClick={handleOpenFolder}
                >
                  フォルダを開く
                </button>
                <button
                  type="button"
                  className="empty-action-btn secondary"
                  onClick={handleOpenFile}
                >
                  ファイルを開く
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 設定モーダル */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onThemeChange={handleThemeChange}
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

