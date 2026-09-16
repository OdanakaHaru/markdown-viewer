import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { QuickOpenFileItem } from '../../types';
import { MarkdownFileIcon, SearchIcon, CloseIcon } from '../common/Icons';

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  folderPath: string | null;
  folderName: string | null;
  openTabs: { filePath: string; fileName: string }[];
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

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  onSelectFile,
  folderPath,
  folderName,
  openTabs,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadedFiles, setLoadedFiles] = useState<QuickOpenFileItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(folderPath));

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 開いているタブのパス集合
  const openPathSet = useMemo(() => {
    return new Set(openTabs.map((t) => t.filePath.toLowerCase().replace(/\\/g, '/')));
  }, [openTabs]);

  // ワークスペースファイル一覧（フォルダが開いていない場合は開いているタブをフォールバックとして使用）
  const workspaceFiles = useMemo<QuickOpenFileItem[]>(() => {
    if (folderPath) {
      return loadedFiles ?? [];
    }
    return openTabs.map((tab) => ({
      name: tab.fileName,
      path: tab.filePath,
      relative_path: tab.fileName,
    }));
  }, [folderPath, loadedFiles, openTabs]);

  // モーダルオープン時にワークスペースのファイル一覧を取得
  useEffect(() => {
    // 入力欄に自動フォーカス
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    if (folderPath) {
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
    }

    return () => clearTimeout(timer);
  }, [folderPath]);

  // クエリ変更ハンドラ（インデックスを即時リセット）
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    setSelectedIndex(0);
  }, []);

  // クエリによるインクリメンタルフィルタリング & スコアリング
  const filteredItems: ScoredItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 候補リスト
    const items: ScoredItem[] = [];
    for (const f of workspaceFiles) {
      const normPath = f.path.toLowerCase().replace(/\\/g, '/');
      const isAlreadyOpen = openPathSet.has(normPath);

      if (!q) {
        // クエリなしの場合: すでに開いているタブを上位に
        items.push({
          item: f,
          score: isAlreadyOpen ? 10 : 0,
          isOpen: isAlreadyOpen,
        });
        continue;
      }

      const lowerName = f.name.toLowerCase();
      const lowerRel = f.relative_path.toLowerCase();

      // トークン分割（スペース区切りでAND検索）
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

    // スコア降順、同スコアなら相対パス昇順
    items.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.item.relative_path.localeCompare(b.item.relative_path);
    });

    return items.slice(0, 60); // 最大60件
  }, [query, workspaceFiles, openPathSet]);

  // 選択アイテムがスクロール領域外に出た場合に自動追従
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLDivElement>(
      `.quick-open-item[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // キーボードイベントハンドラ
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
          const selected = filteredItems[selectedIndex].item;
          onSelectFile(selected.path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filteredItems, selectedIndex, onSelectFile, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="quick-open-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="quick-open-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
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
                ? `ファイル名を検索 (${folderName}) ...`
                : '開いているタブからファイルを検索...'
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
                  onClick={() => {
                    onSelectFile(item.path);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="quick-open-item-icon">
                    <MarkdownFileIcon className="md-icon" />
                  </span>

                  <div className="quick-open-item-info">
                    <div className="quick-open-item-name">
                      <HighlightMatch text={item.name} query={query} />
                    </div>
                    <div className="quick-open-item-path" title={item.relative_path}>
                      <HighlightMatch text={item.relative_path} query={query} />
                    </div>
                  </div>

                  {isItemOpen && (
                    <span className="quick-open-open-badge">開いています</span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="quick-open-status">
              {workspaceFiles.length === 0
                ? folderPath
                  ? 'Markdownファイルが見つかりません'
                  : '開いているタブがありません'
                : '一致するファイルが見つかりません'}
            </div>
          )}
        </div>

        <div className="quick-open-footer">
          <span className="quick-open-shortcut-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> 移動
          </span>
          <span className="quick-open-shortcut-hint">
            <kbd>↵</kbd> 開く
          </span>
          <span className="quick-open-shortcut-hint">
            <kbd>Esc</kbd> 閉じる
          </span>
          {folderName && (
            <span className="quick-open-workspace-info">
              ワークスペース: <strong>{folderName}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
