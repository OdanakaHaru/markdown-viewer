import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GitCommitInfo } from '../../types';
import { GitIcon, SearchIcon, CloseIcon } from '../common/Icons';

interface GitCommitSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
  onSelectCommit: (commit: GitCommitInfo) => void;
}

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

export const GitCommitSelectModal: React.FC<GitCommitSelectModalProps> = ({
  isOpen,
  onClose,
  filePath,
  onSelectCommit,
}) => {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fileName = useMemo(() => {
    if (!filePath) return '';
    return filePath.split(/[\\/]/).pop() || filePath;
  }, [filePath]);

  // モーダル表示時にコミット履歴を取得
  useEffect(() => {
    if (!isOpen || !filePath) {
      setCommits([]);
      setErrorMessage(null);
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    invoke<GitCommitInfo[]>('get_git_commit_history', { filePath, maxCount: 50 })
      .then((data) => {
        if (!isMounted) return;
        setCommits(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to get git commit history:', err);
        setErrorMessage(String(err));
        setIsLoading(false);
      });

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, filePath]);

  // 検索フィルタリング
  const filteredCommits = useMemo(() => {
    if (!query.trim()) return commits;
    const q = query.trim().toLowerCase();
    return commits.filter(
      (c) =>
        c.summary.toLowerCase().includes(q) ||
        c.short_hash.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.date.toLowerCase().includes(q)
    );
  }, [commits, query]);

  // 選択インデックスのリセット
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 選択アイテムのスクロール追従
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLDivElement>(
      `.git-commit-item[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // コミット選択確定
  const handleConfirmCommit = useCallback(
    (commit: GitCommitInfo) => {
      onSelectCommit(commit);
      onClose();
    },
    [onSelectCommit, onClose]
  );

  // キーボード操作
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommits.length > 0 ? (prev + 1) % filteredCommits.length : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredCommits.length > 0
            ? (prev - 1 + filteredCommits.length) % filteredCommits.length
            : 0
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommits.length > 0 && filteredCommits[selectedIndex]) {
          handleConfirmCommit(filteredCommits[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filteredCommits, selectedIndex, handleConfirmCommit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="quick-open-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="quick-open-modal diff-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ファイル情報ヘッダーバー */}
        <div className="diff-palette-base-bar">
          <span className="diff-palette-base-tag" style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
            <GitIcon /> 過去コミット履歴
          </span>
          <span className="diff-palette-base-name" title={filePath || ''}>
            {fileName}
          </span>
        </div>

        {/* 検索入力欄 */}
        <div className="quick-open-header">
          <SearchIcon className="quick-open-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quick-open-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="コミットメッセージ、短縮ハッシュ、作成者で絞り込み..."
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="quick-open-clear-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              title="クリア"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* コミット履歴リスト */}
        <div className="quick-open-list" ref={listRef}>
          {isLoading ? (
            <div className="quick-open-status">コミット履歴を取得中...</div>
          ) : errorMessage ? (
            <div className="quick-open-status" style={{ color: 'var(--color-danger, #cf222e)' }}>
              {errorMessage}
            </div>
          ) : filteredCommits.length > 0 ? (
            filteredCommits.map((commit, index) => {
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={commit.hash}
                  data-index={index}
                  className={`git-commit-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleConfirmCommit(commit)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  title={`${commit.short_hash} - ${commit.summary}\n${commit.author} - ${commit.date}`}
                >
                  <span className="git-commit-hash">
                    <HighlightMatch text={commit.short_hash} query={query} />
                  </span>
                  <div className="git-commit-info">
                    <span className="git-commit-summary">
                      <HighlightMatch text={commit.summary} query={query} />
                    </span>
                    <div className="git-commit-meta">
                      <span>
                        <HighlightMatch text={commit.author} query={query} />
                      </span>
                      <span>•</span>
                      <span>
                        <HighlightMatch text={commit.date} query={query} />
                      </span>
                      {commit.relative_date && (
                        <>
                          <span>({commit.relative_date})</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="quick-open-status">
              {query ? '一致するコミットが見つかりません' : 'コミット履歴がありません'}
            </div>
          )}
        </div>

        {/* フッターアクションバー */}
        <div className="diff-palette-footer">
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {commits.length > 0 ? `${commits.length} 件のコミット履歴` : ''}
          </span>
          <div className="diff-palette-hint">
            <span>↑↓: 移動</span>
            <span>Enter: このコミットと比較</span>
            <span>Esc: 閉じる</span>
          </div>
        </div>
      </div>
    </div>
  );
};
