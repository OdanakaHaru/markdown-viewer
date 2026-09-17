import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openWithDefaultSize } from '../../utils/dialog';
import type { QuickOpenFileItem } from '../../types';
import { MarkdownFileIcon, SearchIcon, CloseIcon } from '../common/Icons';

interface DiffSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompare: (pathA: string, pathB: string) => void;
  onCompareGit?: (filePath: string, revision?: string) => void;
  onOpenGitCommitModal?: (filePath: string) => void;
  folderPath?: string | null;
  folderName?: string | null;
  openTabs?: { filePath: string; fileName: string }[];
  currentFilePath: string | null;
  workspaceFiles?: Array<{ name: string; path: string }>;
}

interface ScoredItem {
  item: QuickOpenFileItem;
  score: number;
  isOpen: boolean;
}

/**
 * 検索文字列と一致する部分をハイライト表示する
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <span>{text}</span>;
  }

  const cleanQuery = query.trim().toLowerCase();
  const lowerText = text.toLowerCase();
  const matchIndex = lowerText.indexOf(cleanQuery);

  if (matchIndex === -1) {
    return <span>{text}</span>;
  }

  const before = text.substring(0, matchIndex);
  const match = text.substring(matchIndex, matchIndex + cleanQuery.length);
  const after = text.substring(matchIndex + cleanQuery.length);

  return (
    <span>
      {before}
      <mark className="quick-open-highlight">{match}</mark>
      {after}
    </span>
  );
}

export const DiffSelectModal: React.FC<DiffSelectModalProps> = ({
  isOpen,
  onClose,
  onCompare,
  onCompareGit,
  onOpenGitCommitModal,
  folderPath,
  folderName,
  openTabs = [],
  currentFilePath,
  workspaceFiles: fallbackWorkspaceFiles = [],
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadedFiles, setLoadedFiles] = useState<QuickOpenFileItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(folderPath));

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 基準ファイルのパス（正規化）
  const baseNormPath = useMemo(() => {
    return currentFilePath ? currentFilePath.toLowerCase().replace(/\\/g, '/') : '';
  }, [currentFilePath]);

  const baseFileName = useMemo(() => {
    if (!currentFilePath) return '（未選択）';
    return currentFilePath.split(/[\\/]/).pop() || currentFilePath;
  }, [currentFilePath]);

  // 開いているタブのパス集合（基準ファイル自身は除く）
  const openPathSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of openTabs) {
      const norm = t.filePath.toLowerCase().replace(/\\/g, '/');
      if (norm !== baseNormPath) {
        set.add(norm);
      }
    }
    return set;
  }, [openTabs, baseNormPath]);

  // 候補ファイル一覧の生成（基準ファイルは除外）
  const availableFiles = useMemo<QuickOpenFileItem[]>(() => {
    let rawList: QuickOpenFileItem[] = [];

    if (loadedFiles && loadedFiles.length > 0) {
      rawList = loadedFiles;
    } else if (folderPath) {
      rawList = loadedFiles ?? [];
    } else if (fallbackWorkspaceFiles.length > 0) {
      rawList = fallbackWorkspaceFiles.map((f) => ({
        name: f.name,
        path: f.path,
        relative_path: f.name,
      }));
    } else {
      rawList = openTabs.map((tab) => ({
        name: tab.fileName,
        path: tab.filePath,
        relative_path: tab.fileName,
      }));
    }

    return rawList.filter((f) => {
      const norm = f.path.toLowerCase().replace(/\\/g, '/');
      return norm !== baseNormPath;
    });
  }, [loadedFiles, folderPath, fallbackWorkspaceFiles, openTabs, baseNormPath]);

  // モーダルオープン時の初期化
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    if (folderPath) {
      setIsLoading(true);
      invoke<QuickOpenFileItem[]>('list_workspace_markdown_files', { path: folderPath })
        .then((files) => {
          setLoadedFiles(files);
        })
        .catch((err) => {
          console.error('ワークスペースファイルの取得に失敗しました:', err);
          setLoadedFiles([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => clearTimeout(timer);
  }, [isOpen, folderPath]);

  // クエリ変更ハンドラ
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    setSelectedIndex(0);
  }, []);

  // 外部ファイルを開くダイアログ
  const handleSelectExternal = useCallback(async () => {
    try {
      const selected = await openWithDefaultSize({
        multiple: false,
        directory: false,
        title: 'Markdownファイルを選択',
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'],
        }],
      });
      if (!selected) return;
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (selectedPath) {
        if (currentFilePath) {
          onCompare(currentFilePath, selectedPath);
          onClose();
        }
      }
    } catch (e) {
      console.error('外部ファイルの選択に失敗しました:', e);
    }
  }, [currentFilePath, onCompare, onClose]);

  // クエリによるインクリメンタル検索 & スコアリング
  const filteredItems: ScoredItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: ScoredItem[] = [];

    for (const f of availableFiles) {
      const normPath = f.path.toLowerCase().replace(/\\/g, '/');
      const isAlreadyOpen = openPathSet.has(normPath);

      if (!q) {
        items.push({
          item: f,
          score: isAlreadyOpen ? 10 : 0,
          isOpen: isAlreadyOpen,
        });
        continue;
      }

      const lowerName = f.name.toLowerCase();
      const lowerRel = f.relative_path.toLowerCase();

      const tokens = q.split(/\s+/).filter(Boolean);
      const matchesAll = tokens.every(
        (t) => lowerName.includes(t) || lowerRel.includes(t)
      );

      if (!matchesAll) continue;

      let score = 0;
      if (lowerName === q) {
        score += 100;
      } else if (lowerName.startsWith(q)) {
        score += 80;
      } else if (lowerName.includes(q)) {
        score += 50;
      } else if (lowerRel.includes(q)) {
        score += 30;
      }

      if (isAlreadyOpen) {
        score += 5;
      }

      items.push({
        item: f,
        score,
        isOpen: isAlreadyOpen,
      });
    }

    items.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.item.relative_path.localeCompare(b.item.relative_path);
    });

    return items.slice(0, 60);
  }, [query, availableFiles, openPathSet]);

  // 選択アイテムのスクロール追従
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLDivElement>(
      `.quick-open-item[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // ファイル決定
  const handleConfirmItem = useCallback(
    (targetFilePath: string) => {
      if (currentFilePath && targetFilePath) {
        onCompare(currentFilePath, targetFilePath);
        onClose();
      }
    },
    [currentFilePath, onCompare, onClose]
  );

  // キーボード操作
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length > 0
            ? (prev - 1 + filteredItems.length) % filteredItems.length
            : 0
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems.length > 0 && filteredItems[selectedIndex]) {
          handleConfirmItem(filteredItems[selectedIndex].item.path);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filteredItems, selectedIndex, handleConfirmItem, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="quick-open-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="quick-open-modal diff-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 基準ファイルのステータスバー */}
        <div className="diff-palette-base-bar">
          <span className="diff-palette-base-tag">基準ファイル</span>
          <span className="diff-palette-base-name" title={currentFilePath || ''}>
            {baseFileName}
          </span>
          {onOpenGitCommitModal && currentFilePath && (
            <button
              type="button"
              className="diff-mode-btn"
              onClick={() => {
                onOpenGitCommitModal(currentFilePath);
                onClose();
              }}
              title="このファイルの過去のコミット履歴から選択して比較します"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              📜 コミット履歴から選択...
            </button>
          )}
          {onCompareGit && currentFilePath && (
            <button
              type="button"
              className="diff-mode-btn"
              onClick={() => {
                onCompareGit(currentFilePath, 'HEAD');
                onClose();
              }}
              title="現在のファイルと最新コミット（HEAD）の差分を直接開きます"
              style={{
                marginLeft: onOpenGitCommitModal ? '6px' : 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              🌿 Git HEAD と比較
            </button>
          )}
        </div>

        {/* 検索入力ヘッダー */}
        <div className="quick-open-header">
          <SearchIcon className="quick-open-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quick-open-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={
              folderName
                ? `比較する対象ファイルを検索 (${folderName}) ...`
                : '比較する対象ファイルを検索または選択...'
            }
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="quick-open-clear-btn"
              onClick={() => {
                handleQueryChange('');
                inputRef.current?.focus();
              }}
              title="クリア"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* 候補リスト */}
        <div className="quick-open-list" ref={listRef}>
          {isLoading ? (
            <div className="quick-open-status">ファイルを走査中...</div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((scored, index) => {
              const { item, isOpen: isItemOpen } = scored;
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={item.path}
                  data-index={index}
                  className={`quick-open-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleConfirmItem(item.path)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  title={item.path}
                >
                  <MarkdownFileIcon className="quick-open-item-icon" />
                  <div className="quick-open-item-info">
                    <span className="quick-open-item-name">
                      <HighlightMatch text={item.name} query={query} />
                    </span>
                    <span className="quick-open-item-path">
                      <HighlightMatch text={item.relative_path} query={query} />
                    </span>
                  </div>
                  {isItemOpen && (
                    <span className="quick-open-item-badge">開いているタブ</span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="quick-open-status">
              {query ? '一致する比較対象ファイルがありません' : '比較可能なファイルがありません'}
            </div>
          )}
        </div>

        {/* フッターアクションバー */}
        <div className="diff-palette-footer">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onCompareGit && currentFilePath && (
              <button
                type="button"
                className="diff-palette-external-btn"
                onClick={() => {
                  onCompareGit(currentFilePath, 'HEAD');
                  onClose();
                }}
                title="現在のファイルと最新コミット（HEAD）の差分を比較します"
                style={{ borderColor: 'var(--color-accent, #3b82f6)' }}
              >
                🌿 Git HEAD と比較
              </button>
            )}
            {onOpenGitCommitModal && currentFilePath && (
              <button
                type="button"
                className="diff-palette-external-btn"
                onClick={() => {
                  onOpenGitCommitModal(currentFilePath);
                  onClose();
                }}
                title="過去のコミット履歴一覧から選択して比較します"
              >
                📜 コミット履歴から選択...
              </button>
            )}
            <button
              type="button"
              className="diff-palette-external-btn"
              onClick={handleSelectExternal}
              title="ファイルダイアログから任意のMarkdownファイルを選択して比較します"
            >
              📂 外部ファイルを選択して比較...
            </button>
          </div>
          <div className="diff-palette-hint">
            <span>↑↓: 移動</span>
            <span>Enter: 比較</span>
            <span>Esc: 閉じる</span>
          </div>
        </div>
      </div>
    </div>
  );
};
