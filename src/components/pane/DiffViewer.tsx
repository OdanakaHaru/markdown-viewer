import React, { useRef, useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { invoke } from '@tauri-apps/api/core';
import type { TabItem } from '../../types';
import { useMermaidRenderer } from '../../hooks/useMermaidRenderer';

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
  
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const [pathA, pathB] = tab.filePath.includes('::') ? tab.filePath.split('::') : ['', ''];
  const oldFileName = pathA ? pathA.split(/[\\/]/).pop() || pathA : '比較元 (旧)';
  const newFileName = pathB ? pathB.split(/[\\/]/).pop() || pathB : '比較先 (新)';

  const containerRef = useRef<HTMLDivElement>(null);

  // 差分データの再取得（ファイル変更時やマウント時、更新ボタン押下時）
  const refreshDiff = useCallback(async () => {
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
  }, [pathA, pathB]);

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

      {diffViewMode === 'visual' ? (
        <div className="diff-unified-content markdown-body">
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
              <span className="diff-pane-tag left">旧</span>
              <span className="diff-pane-filename">{oldFileName}</span>
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
              <span className="diff-pane-tag right">新</span>
              <span className="diff-pane-filename">{newFileName}</span>
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
              <span className="diff-pane-tag left">旧</span>
              <span className="diff-pane-filename">{oldFileName}</span>
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
              <span className="diff-pane-tag right">新</span>
              <span className="diff-pane-filename">{newFileName}</span>
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
  );
};

