import { useState, useEffect, useCallback } from 'react';
import type { TocItem } from '../types';
import { slugify } from '../utils/path';

interface UseTocOptions {
  activeContent: string | undefined;
  activePaneId: string;
}

/**
 * アクティブペインのMarkdown見出し（H1〜H6）の抽出と、
 * スクロール位置に応じた現在地ハイライト、クリックによるスムーズスクロールを管理するカスタムフック
 */
export function useToc({ activeContent, activePaneId }: UseTocOptions) {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // アクティブドキュメントから目次（H1〜H6）を抽出
  useEffect(() => {
    // レンダリング完了後にアクティブペインのDOMから見出しを抽出
    const timer = setTimeout(() => {
      if (!activeContent) {
        setTocItems([]);
        setActiveHeadingId(null);
        return;
      }

      const activePaneElement = document.querySelector('.pane.active-pane .markdown-body');
      if (!activePaneElement) {
        setTocItems([]);
        return;
      }

      const headings = activePaneElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const items: TocItem[] = [];
      headings.forEach((el, index) => {
        const level = parseInt(el.tagName.substring(1), 10);
        let id = el.id;
        if (!id) {
          id = `heading-${index}-${slugify(el.textContent || '')}`;
          el.id = id;
        }
        items.push({
          id,
          text: (el.textContent || '').trim(),
          level,
        });
      });
      setTocItems(items);
    }, 60);

    return () => clearTimeout(timer);
  }, [activeContent, activePaneId]);

  // アクティブペインのスクロール位置を監視して現在地の見出しを特定
  useEffect(() => {
    if (tocItems.length === 0) return;

    const activePaneContent = document.querySelector('.pane.active-pane .pane-content');
    if (!activePaneContent) return;

    const handleScroll = () => {
      const activePaneElement = document.querySelector('.pane.active-pane .markdown-body');
      if (!activePaneElement) return;

      const headings = Array.from(activePaneElement.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      if (headings.length === 0) return;

      const containerRect = activePaneContent.getBoundingClientRect();
      let currentActive: string | null = headings[0].id || null;

      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top - containerRect.top <= 120) {
          currentActive = heading.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(currentActive);
    };

    activePaneContent.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      activePaneContent.removeEventListener('scroll', handleScroll);
    };
  }, [tocItems, activePaneId]);

  // 目次項目クリック時のスムーズスクロール
  const handleSelectHeading = useCallback((id: string) => {
    const activePaneElement = document.querySelector('.pane.active-pane .markdown-body');
    if (!activePaneElement) return;
    const target = activePaneElement.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveHeadingId(id);
    }
  }, []);

  return {
    tocItems,
    activeHeadingId,
    handleSelectHeading,
  };
}
