import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PaneItem, ResolvedLink } from '../types';
import { slugify } from '../utils/path';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseLinkNavigationOptions {
  panes: PaneItem[];
  folderPath: string | null;
  onSelectFile: (path: string, initialHash?: string | null, targetPaneId?: string) => Promise<void>;
  onError?: (msg: string) => void;
}

/**
 * ドキュメント内アンカーへのスムーズスクロールおよび
 * 外部URL、別Markdownファイルへのリンククリックを処理するカスタムフック
 */
export function useLinkNavigation({
  panes,
  folderPath,
  onSelectFile,
  onError,
}: UseLinkNavigationOptions) {
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
            await onSelectFile(resolved.target, resolved.hash, sourcePaneId);
            break;

          case 'markdown_not_found':
          case 'not_found':
            onError?.(`リンク先のファイルが見つかりません: ${resolved.target}`);
            break;

          default:
            await invoke('open_external', { target: resolved.target });
            break;
        }
      } catch (err: unknown) {
        onError?.(typeof err === 'string' ? err : 'リンクを開くことができませんでした。');
      }
    },
    [folderPath, onSelectFile, scrollToAnchor, panes, onError]
  );

  return {
    scrollToAnchor,
    handleLinkClick,
  };
}
