import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import DOMPurify from 'dompurify';
import type { PaneItem } from '../types';
import { TabBar } from './TabBar';
import { SearchBar } from './SearchBar';

interface MarkdownPaneProps {
  pane: PaneItem;
  isActivePane: boolean;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onSplitPane?: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  canSplit: boolean;
  canClosePane: boolean;
  effectiveTheme: 'light' | 'dark';
  folderPath: string | null;
  onLinkClick: (href: string, paneId: string) => void;
  onDropTab: (sourcePaneId: string, tabId: string, targetPaneId: string) => void;
  onDropFile: (filePath: string, targetPaneId: string) => void;
  isSearchOpen?: boolean;
  onCloseSearch?: () => void;
}

export const MarkdownPane: React.FC<MarkdownPaneProps> = ({
  pane,
  isActivePane,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onSplitPane,
  onClosePane,
  canSplit,
  canClosePane,
  effectiveTheme,
  folderPath,
  onLinkClick,
  onDropTab,
  onDropFile,
  isSearchOpen = false,
  onCloseSearch,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);
  const content = activeTab?.content || '';
  const selectedFilePath = activeTab?.filePath || null;
  const selectedFileName = activeTab?.fileName || null;

  // ホットリフレッシュ時のスクロール位置保持用
  const prevFilePathRef = useRef<string | null>(null);
  const currentScrollTopRef = useRef<number>(0);

  // ユーザーのスクロール位置をリアルタイムに記録
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      currentScrollTopRef.current = containerRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);


  // DOMPurify のサニタイズ設定
  // Windowsドライブレター(C:\等)、file:、data:、相対パスを許可してローカル画像パスが削除されるのを防ぐ
  const purifyConfig = useMemo(
    () => ({
      ADD_TAGS: ['input', 'button', 'svg', 'path', 'rect'], // タスクリストおよびコードブロックUI用
      ADD_ATTR: [
        'checked', 'disabled', 'type', 'target', 'rel', 'id', 'src', 'alt', 'width', 'height', 'loading',
        'data-lang', 'title', 'aria-label', 'viewBox', 'd', 'x', 'y', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$)|\b[a-zA-Z]:|^[a-zA-Z]:)/i,
    }),
    []
  );

  // 初期サニタイズ（テキスト等の即時表示用）
  const initialSanitized = useMemo(() => {
    if (!content) return '';
    return DOMPurify.sanitize(content, purifyConfig);
  }, [content, purifyConfig]);

  // 画像置換が完了したHTML
  const [replacedState, setReplacedState] = useState<{ content: string; html: string } | null>(null);

  // content が更新された直後は initialSanitized、画像置換完了後は replacedState.html を使用
  const displayHtml =
    replacedState && replacedState.content === content ? replacedState.html : initialSanitized;

  // ローカル画像の非同期置換
  useEffect(() => {
    if (!initialSanitized) return;

    let isMounted = true;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = initialSanitized;
    const imgElements = Array.from(tempDiv.querySelectorAll('img'));

    const localImgs = imgElements.filter((img) => {
      const src = img.getAttribute('src');
      return (
        src &&
        !src.startsWith('data:') &&
        !src.startsWith('blob:') &&
        !src.startsWith('http://') &&
        !src.startsWith('https://')
      );
    });

    if (localImgs.length === 0) return;

    Promise.all(
      localImgs.map(async (img) => {
        const src = img.getAttribute('src');
        if (!src) return;
        try {
          const dataUrl = await invoke<string>('read_image_data_url', {
            baseFilePath: selectedFilePath,
            baseFolderPath: activeTab?.isStandalone ? null : folderPath,
            src,
          });
          img.setAttribute('src', dataUrl);
        } catch (err) {
          console.error('画像の読み込みに失敗しました:', src, err);
        }
      })
    ).then(() => {
      if (isMounted) {
        setReplacedState({ content, html: tempDiv.innerHTML });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [content, initialSanitized, selectedFilePath, folderPath, activeTab?.isStandalone]);

  // content / displayHtml 更新時のスクロール位置復元
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (prevFilePathRef.current === selectedFilePath && selectedFilePath !== null) {
      // 同一ファイルのリロード（ホットリフレッシュ） -> 直前のスクロール位置を維持
      const savedScroll = currentScrollTopRef.current;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = savedScroll;
        }
      });
    } else {
      // 別ファイルに切り替わった場合
      prevFilePathRef.current = selectedFilePath;
      const initialScroll = activeTab?.scrollTop ?? 0;
      currentScrollTopRef.current = initialScroll;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = initialScroll;
        }
      });
    }
  }, [displayHtml, selectedFilePath, activeTab?.scrollTop]);

  // コードブロック（pre要素）へのコピーボタン動的追加
  useEffect(() => {
    if (!displayHtml || !containerRef.current) return;
    const container = containerRef.current;

    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
      // code-block-container 内には既にヘッダーにコピーボタンがあるためスキップ
      if (pre.closest('.code-block-container') || pre.querySelector('.code-copy-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'コードをコピー');
      btn.setAttribute('title', 'コードをコピー');
      btn.innerHTML = `
        <span class="code-copy-icon-wrap">
          <svg class="copy-svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/>
            <path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/>
          </svg>
          <svg class="check-svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        </span>
        <span class="code-copy-text">コピー</span>
      `;
      pre.appendChild(btn);
    });
  }, [displayHtml]);

  const handleHtmlClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // コードブロックのコピーボタン処理 (既存.code-copy-btn および 新規.code-block-copy-btn)
    const copyBtn = target.closest('.code-copy-btn, .code-block-copy-btn') as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const container = copyBtn.closest('.code-block-container');
      const pre = container ? container.querySelector('pre') : copyBtn.closest('pre');
      if (!pre) return;
      const code = pre.querySelector('code');
      // code要素から純粋なコード本文を抽出
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
      return;
    }

    const a = target.closest('a');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) {
        onLinkClick(href, pane.id);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/json')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const data = JSON.parse(internalData);
        if (data.type === 'tab' && data.paneId && data.tabId) {
          onDropTab(data.paneId, data.tabId, pane.id);
        } else if (data.type === 'file' && data.filePath) {
          onDropFile(data.filePath, pane.id);
        }
      } catch (err) {
        console.error('Invalid drop data', err);
      }
    }
  };

  return (
    <div 
      className={`pane ${isActivePane ? 'active-pane' : ''}`} 
      onClick={() => onFocusPane(pane.id)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TabBar
        paneId={pane.id}
        tabs={pane.tabs}
        activeTabId={pane.activeTabId}
        onSelectTab={(tabId) => onSelectTab(pane.id, tabId)}
        onCloseTab={(tabId) => onCloseTab(pane.id, tabId)}
        onSplitPane={onSplitPane ? () => onSplitPane(pane.id) : undefined}
        onClosePane={onClosePane ? () => onClosePane(pane.id) : undefined}
        canSplit={canSplit}
        canClosePane={canClosePane}
        isActivePane={isActivePane}
        onFocusPane={() => onFocusPane(pane.id)}
      />
      <div className="pane-content">
        {activeTab ? (
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
            <SearchBar
              containerRef={containerRef}
              isOpen={isSearchOpen}
              onClose={onCloseSearch || (() => {})}
            />
            <div
              ref={containerRef}
              className="markdown-body"
              onClick={handleHtmlClick}
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">タブが開かれていません</div>
            <div className="empty-state-text">
              ファイルを開くか、別のペインからタブを移動してください。
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
