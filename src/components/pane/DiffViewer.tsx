import React, { useRef, useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { invoke } from '@tauri-apps/api/core';
import type { TabItem } from '../../types';
import { useMermaidRenderer } from '../../hooks/useMermaidRenderer';
import { DiffOverviewRuler } from './DiffOverviewRuler';
import {
  extractSourceHunks,
  extractVisualHunks,
  type DiffHunkItem,
} from '../../utils/diffHunkHelper';

const diffPurifyConfig = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ['del', 'ins', 'input', 'button', 'foreignObject', 'style'],
  ADD_ATTR: [
    'class', 'data-lang', 'data-view', 'title', 'aria-label', 'id', 'src', 'alt',
    'viewBox', 'd', 'x', 'y', 'rx', 'ry', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'style', 'transform',
    'data-diff-mode', 'data-mermaid-old', 'data-mermaid-new'
  ],
  ALLOW_DATA_ATTR: true,
};


interface DiffViewerProps {
  tab: TabItem;
  effectiveTheme: 'light' | 'dark';
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ tab, effectiveTheme }) => {
  const [currentDiffResult, setCurrentDiffResult] = useState<any>(tab.diffResult);
  const [diffViewMode, setDiffViewMode] = useState<'visual' | 'split' | 'split-visual'>(tab.diffViewMode || 'visual');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const unifiedPaneRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const [hunks, setHunks] = useState<DiffHunkItem[]>([]);
  const [activeHunkIndex, setActiveHunkIndex] = useState<number>(-1);
  const hunksRef = useRef<DiffHunkItem[]>([]);
  const activeHunkIndexRef = useRef<number>(-1);

  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const isGitDiff = Boolean(tab.isGitDiff);
  const [originalPathA, originalPathB] = tab.filePath.includes('::') ? tab.filePath.split('::') : ['', ''];
  const [isSwapped, setIsSwapped] = useState(false);
  const pathA = isSwapped ? originalPathB : originalPathA;
  const pathB = isSwapped ? originalPathA : originalPathB;

  const gitFileName = tab.gitFilePath ? tab.gitFilePath.split(/[\\/]/).pop() || tab.gitFilePath : '';
  const rev = tab.gitRevision || 'HEAD';
  const revLabel = rev === 'HEAD' ? 'HEAD (最新コミット)' : `コミット ${rev}`;
  const baseFileName = isGitDiff
    ? revLabel
    : (pathA ? pathA.split(/[\\/]/).pop() || pathA : '基準ファイル');
  const targetFileName = isGitDiff
    ? `現在の作業内容 (${gitFileName || 'ワーキングツリー'})`
    : (pathB ? pathB.split(/[\\/]/).pop() || pathB : '対象ファイル');

  const containerRef = useRef<HTMLDivElement>(null);

  // 差分データの再取得（ファイル変更時やマウント時、更新・入替ボタン押下時）
  const refreshDiff = useCallback(async () => {
    if (tab.isGitDiff) {
      const targetFile = tab.gitFilePath || (tab.filePath.includes('::') ? tab.filePath.split('::')[1] : tab.filePath);
      if (!targetFile) return;
      try {
        setIsRefreshing(true);
        const res = await invoke<any>('compare_git_markdown', {
          filePath: targetFile,
          revision: tab.gitRevision || 'HEAD',
        });
        setCurrentDiffResult(res);
      } catch (err) {
        console.error('Failed to refresh git diff:', err);
      } finally {
        setIsRefreshing(false);
      }
      return;
    }

    if (!pathA || !pathB) return;
    try {
      setIsRefreshing(true);
      const res = await invoke<any>('compare_markdown_files', { oldPath: pathA, newPath: pathB });
      setCurrentDiffResult(res);
    } catch (err) {
      console.error('Failed to refresh diff:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [tab.isGitDiff, tab.gitFilePath, tab.filePath, tab.gitRevision, pathA, pathB]);

  // 初回マウント時、または比較対象パス変更時に最新差分データを自動取得
  useEffect(() => {
    refreshDiff();
  }, [refreshDiff]);


  // 同期スクロール処理
  const handleScrollLeft = () => {
    if (diffViewMode === 'visual') return;
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (leftPaneRef.current && rightPaneRef.current) {
      isSyncingRight.current = true;
      rightPaneRef.current.scrollTop = leftPaneRef.current.scrollTop;
    }
  };

  const handleScrollRight = () => {
    if (diffViewMode === 'visual') return;
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (leftPaneRef.current && rightPaneRef.current) {
      isSyncingLeft.current = true;
      leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop;
    }
  };

  const diffResult = currentDiffResult || tab.diffResult;

  // 表示モードに応じたHTMLコンテンツ依存キー（モード切替時やデータ更新時に再レンダリング）
  const diffContentKey = diffResult
    ? `${diffViewMode}:${diffResult.unified_html?.length || 0}:${diffResult.old_html?.length || 0}:${diffResult.new_html?.length || 0}`
    : null;

  // Mermaidダイアグラムの非同期描画 & UI制御
  useMermaidRenderer(containerRef, diffContentKey, effectiveTheme);

  // 差分ブロック（Hunk）の抽出・追従
  useEffect(() => {
    const delay = diffViewMode === 'split' ? 0 : 120;
    const timer = setTimeout(() => {
      if (!diffResult) {
        setHunks([]);
        setActiveHunkIndex(-1);
        return;
      }

      if (diffViewMode === 'split') {
        const items = extractSourceHunks(diffResult.left_lines, diffResult.right_lines);
        setHunks(items);
        setActiveHunkIndex(-1);
        return;
      }

      // ビジュアルモード（DOM描画およびMermaidレンダリング完了を待って計算）
      let items: DiffHunkItem[] = [];
      if (diffViewMode === 'split-visual') {
        items = extractVisualHunks(containerRef.current, {
          leftPane: leftPaneRef.current,
          rightPane: rightPaneRef.current,
        });
      } else {
        items = extractVisualHunks(unifiedPaneRef.current || containerRef.current);
      }
      setHunks(items);
      hunksRef.current = items;
      setActiveHunkIndex(-1);
      activeHunkIndexRef.current = -1;
    }, delay);

    return () => clearTimeout(timer);
  }, [diffResult, diffViewMode, diffContentKey]);

  // hunks と activeHunkIndex の ref同期
  useEffect(() => {
    hunksRef.current = hunks;
  }, [hunks]);

  useEffect(() => {
    activeHunkIndexRef.current = activeHunkIndex;
  }, [activeHunkIndex]);

  // 特定の差分ブロックへのジャンプおよびターゲット強調アニメーション
  const handleSelectHunk = useCallback(
    (index: number) => {
      const currentHunks = hunksRef.current;
      if (index < 0 || index >= currentHunks.length) return;
      setActiveHunkIndex(index);
      activeHunkIndexRef.current = index;
      const hunk = currentHunks[index];

      if (diffViewMode === 'split') {
        const lineIdx = hunk.lineIdx;
        const leftPane = leftPaneRef.current;
        const rightPane = rightPaneRef.current;
        const activePane = rightPane || leftPane;

        if (activePane && lineIdx !== undefined) {
          const leftLines = leftPane?.querySelectorAll<HTMLElement>('.diff-line');
          const rightLines = rightPane?.querySelectorAll<HTMLElement>('.diff-line');
          const targetLine = rightLines?.[lineIdx] || leftLines?.[lineIdx];

          const targetTop = targetLine
            ? Math.max(0, targetLine.offsetTop - activePane.clientHeight / 2 + 12)
            : Math.max(0, hunk.ratio * activePane.scrollHeight - activePane.clientHeight / 2);

          if (leftPane) {
            leftPane.scrollTo({ top: targetTop, behavior: 'smooth' });
          }
          if (rightPane) {
            rightPane.scrollTo({ top: targetTop, behavior: 'smooth' });
          }

          if (targetLine) {
            targetLine.classList.remove('diff-target-flash');
            void targetLine.offsetWidth;
            targetLine.classList.add('diff-target-flash');
          }

          const leftLine = leftLines?.[lineIdx];
          if (leftLine && leftLine !== targetLine) {
            leftLine.classList.remove('diff-target-flash');
            void leftLine.offsetWidth;
            leftLine.classList.add('diff-target-flash');
          }

          setTimeout(() => {
            targetLine?.classList.remove('diff-target-flash');
            leftLine?.classList.remove('diff-target-flash');
          }, 1600);
        }
        return;
      }

      // ビジュアル表示（統合 / 分割）
      const leftPane = leftPaneRef.current;
      const rightPane = rightPaneRef.current;
      const isSplitVis = diffViewMode === 'split-visual';
      const mainPane = isSplitVis ? (rightPane || leftPane) : unifiedPaneRef.current;

      if (mainPane) {
        const el = hunk.element;
        let targetTop = 0;

        if (el && el.isConnected) {
          const paneRect = mainPane.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const currentTop = elRect.top - paneRect.top + mainPane.scrollTop;
          targetTop = Math.max(0, currentTop - mainPane.clientHeight / 2);
        } else if (hunk.topPx !== undefined) {
          targetTop = Math.max(0, hunk.topPx - mainPane.clientHeight / 2);
        } else {
          targetTop = Math.max(0, hunk.ratio * mainPane.scrollHeight - mainPane.clientHeight / 2);
        }

        if (isSplitVis) {
          if (leftPane) leftPane.scrollTo({ top: targetTop, behavior: 'smooth' });
          if (rightPane) rightPane.scrollTo({ top: targetTop, behavior: 'smooth' });
        } else if (unifiedPaneRef.current) {
          unifiedPaneRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
        }

        if (el && el.isConnected) {
          const blockEl =
            el.closest<HTMLElement>(
              'p, tr, li, h1, h2, h3, h4, h5, h6, pre, blockquote, .code-block-container'
            ) || el;

          blockEl.classList.remove('diff-target-flash');
          void blockEl.offsetWidth;
          blockEl.classList.add('diff-target-flash');

          if (el !== blockEl) {
            el.classList.remove('diff-target-flash');
            void el.offsetWidth;
            el.classList.add('diff-target-flash');
          }

          setTimeout(() => {
            blockEl.classList.remove('diff-target-flash');
            el.classList.remove('diff-target-flash');
          }, 1600);
        }
      }
    },
    [diffViewMode]
  );

  // 前後の差分への移動
  const handleJumpHunk = useCallback(
    (direction: 'next' | 'prev') => {
      const currentHunks = hunksRef.current;
      if (currentHunks.length === 0) return;
      const currentIdx = activeHunkIndexRef.current;
      let nextIndex: number;
      if (direction === 'next') {
        nextIndex = currentIdx >= currentHunks.length - 1 ? 0 : currentIdx + 1;
      } else {
        nextIndex = currentIdx <= 0 ? currentHunks.length - 1 : currentIdx - 1;
      }
      handleSelectHunk(nextIndex);
    },
    [handleSelectHunk]
  );

  // キーボードショートカット（F7: 次へ / Shift+F7: 前へ / Alt+↓: 次へ / Alt+↑: 前へ）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'F7') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          handleJumpHunk('prev');
        } else {
          handleJumpHunk('next');
        }
      } else if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        handleJumpHunk('next');
      } else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        handleJumpHunk('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleJumpHunk]);

  // コードブロックのコピーボタン処理
  const handleCopyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest('.code-copy-btn, .code-block-copy-btn') as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const container = copyBtn.closest('.code-block-container');
      const pre = container ? container.querySelector('pre') : copyBtn.closest('pre');
      if (!pre) return;
      const code = pre.querySelector('code');
      const text = code ? code.textContent || '' : (pre.textContent || '').replace(/コピー(完了)?$/, '');

      const existingTimer = copyBtn.getAttribute('data-timer-id');
      if (existingTimer) {
        window.clearTimeout(parseInt(existingTimer, 10));
      }

      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('copied');
        const textSpan = copyBtn.querySelector('.code-copy-text, .copy-btn-text');
        if (textSpan) textSpan.textContent = 'コピー完了';
        copyBtn.setAttribute('title', 'コピー完了');
        const timerId = window.setTimeout(() => {
          copyBtn.classList.remove('copied');
          if (textSpan) textSpan.textContent = 'コピー';
          copyBtn.setAttribute('title', 'コードをコピー');
          copyBtn.removeAttribute('data-timer-id');
        }, 2000);
        copyBtn.setAttribute('data-timer-id', timerId.toString());
      }).catch((err) => {
        console.error('クリップボードへのコピーに失敗しました:', err);
      });
    }
  };

  if (!diffResult) {
    return <div className="p-4">差分データがありません</div>;
  }

  const activeScrollContainerRef = diffViewMode === 'visual' ? unifiedPaneRef : rightPaneRef;

  return (
    <div 
      ref={containerRef}
      onClick={handleCopyClick}
      className="diff-viewer-container markdown-container"
      data-theme={effectiveTheme}
      data-color-mode={effectiveTheme}
    >
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span>差分表示: {tab.fileName}</span>
          <div className="diff-stats">
            <span className="diff-stat-ins">+{diffResult.stats.additions}</span>
            <span className="diff-stat-del">-{diffResult.stats.deletions}</span>
          </div>

          {/* 差分ナビゲーション */}
          <div className="diff-nav-group" title="差分ナビゲーション (F7 / Shift+F7 / Alt+↑↓)">
            <button
              type="button"
              className="diff-nav-btn"
              onClick={() => handleJumpHunk('prev')}
              disabled={hunks.length === 0}
              title="前の差分へ移動 (Shift+F7 / Alt+↑)"
              aria-label="前の差分へ移動"
            >
              ▲
            </button>
            <span className="diff-nav-count">
              {activeHunkIndex >= 0 && hunks.length > 0
                ? `${activeHunkIndex + 1} / ${hunks.length}`
                : hunks.length > 0
                ? `- / ${hunks.length}`
                : '0 / 0'}
            </span>
            <button
              type="button"
              className="diff-nav-btn"
              onClick={() => handleJumpHunk('next')}
              disabled={hunks.length === 0}
              title="次の差分へ移動 (F7 / Alt+↓)"
              aria-label="次の差分へ移動"
            >
              ▼
            </button>
          </div>

          <button 
            type="button" 
            className="diff-mode-btn" 
            onClick={refreshDiff} 
            disabled={isRefreshing}
            title="最新のファイル内容で差分を再計算"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px', cursor: 'pointer' }}
          >
            🔄 {isRefreshing ? '更新中...' : '再計算'}
          </button>
          {!isGitDiff && (
            <button 
              type="button" 
              className="diff-mode-btn" 
              onClick={() => setIsSwapped((prev) => !prev)} 
              disabled={isRefreshing}
              title="基準ファイルと対象ファイルを入れ替えて比較"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', cursor: 'pointer' }}
            >
              ⇄ 基準/対象を入替
            </button>
          )}
        </div>
        <div className="diff-toolbar-right">
          <div className="diff-mode-toggle">
            <button 
              type="button"
              className={`diff-mode-btn ${diffViewMode === 'visual' ? 'active' : ''}`}
              onClick={() => setDiffViewMode('visual')}
            >
              ビジュアル(統合)
            </button>
            <button 
              type="button"
              className={`diff-mode-btn ${diffViewMode === 'split-visual' ? 'active' : ''}`}
              onClick={() => setDiffViewMode('split-visual')}
            >
              ビジュアル(分割)
            </button>
            <button 
              type="button"
              className={`diff-mode-btn ${diffViewMode === 'split' ? 'active' : ''}`}
              onClick={() => setDiffViewMode('split')}
            >
              ソース(分割)
            </button>
          </div>
        </div>
      </div>

      <div className="diff-body-wrapper">
        {/* Overview Ruler（左端） */}
        <DiffOverviewRuler
          hunks={hunks}
          activeIndex={activeHunkIndex}
          onSelectHunk={handleSelectHunk}
          scrollContainerRef={activeScrollContainerRef}
        />

        {diffViewMode === 'visual' ? (
          <div 
            ref={unifiedPaneRef}
            className="diff-unified-content markdown-body"
          >
            <div 
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(diffResult.unified_html, diffPurifyConfig) 
              }} 
            />
          </div>
        ) : diffViewMode === 'split-visual' ? (
          <div className="diff-split-container" style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div className="diff-split-column left" style={{ flex: '1 1 50%', width: '50%', maxWidth: '50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="diff-pane-header">
                <span className="diff-pane-tag left">{isGitDiff ? 'Git' : '基準'}</span>
                <span className="diff-pane-filename">{baseFileName}</span>
              </div>
              <div 
                className="diff-split-pane left diff-visual-left markdown-body" 
                ref={leftPaneRef} 
                onScroll={handleScrollLeft}
                style={{ padding: '16px', display: 'block', width: '100%', overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(diffResult.old_html, diffPurifyConfig) 
                }} 
              />
            </div>
            <div className="diff-split-column right" style={{ flex: '1 1 50%', width: '50%', maxWidth: '50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="diff-pane-header">
                <span className="diff-pane-tag right">{isGitDiff ? 'ローカル' : '対象'}</span>
                <span className="diff-pane-filename">{targetFileName}</span>
              </div>
              <div 
                className="diff-split-pane right diff-visual-right markdown-body" 
                ref={rightPaneRef} 
                onScroll={handleScrollRight}
                style={{ padding: '16px', display: 'block', width: '100%', overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(diffResult.new_html, diffPurifyConfig) 
                }} 
              />
            </div>
          </div>
        ) : (
          <div className="diff-split-container" style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div className="diff-split-column left" style={{ flex: '1 1 50%', width: '50%', maxWidth: '50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="diff-pane-header">
                <span className="diff-pane-tag left">{isGitDiff ? 'Git' : '基準'}</span>
                <span className="diff-pane-filename">{baseFileName}</span>
              </div>
              <div 
                className="diff-split-pane left" 
                ref={leftPaneRef} 
                onScroll={handleScrollLeft}
              >
                {diffResult.left_lines.map((line: any, i: number) => (
                  <div key={`l-${i}`} className={`diff-line ${line.kind}`}>
                    <div className="diff-line-num">{line.line_idx !== null ? line.line_idx + 1 : ''}</div>
                    <div className="diff-line-content">{line.text || ' '}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="diff-split-column right" style={{ flex: '1 1 50%', width: '50%', maxWidth: '50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="diff-pane-header">
                <span className="diff-pane-tag right">{isGitDiff ? 'ローカル' : '対象'}</span>
                <span className="diff-pane-filename">{targetFileName}</span>
              </div>
              <div 
                className="diff-split-pane right" 
                ref={rightPaneRef} 
                onScroll={handleScrollRight}
              >
                {diffResult.right_lines.map((line: any, i: number) => (
                  <div key={`r-${i}`} className={`diff-line ${line.kind}`}>
                    <div className="diff-line-num">{line.line_idx !== null ? line.line_idx + 1 : ''}</div>
                    <div className="diff-line-content">{line.text || ' '}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


