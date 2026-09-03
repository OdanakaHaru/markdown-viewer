import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SearchBarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onClose: () => void;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SearchBar: React.FC<SearchBarProps> = ({
  containerRef,
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchesRef = useRef<HTMLElement[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasScrolledRef = useRef(false);
  const isComposingRef = useRef(false);

  // ハイライト全解除
  const clearHighlights = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const marks = container.querySelectorAll('mark.search-highlight');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });
    matchesRef.current = [];
    hasScrolledRef.current = false;
    setCurrentIndex(0);
    setTotalMatches(0);
  }, [containerRef]);

  // アクティブマッチへのスクロールとクラス付与
  const focusMatch = useCallback((index: number) => {
    const matches = matchesRef.current;
    if (matches.length === 0 || index < 1 || index > matches.length) return;

    matches.forEach((m, i) => {
      if (i === index - 1) {
        m.classList.add('search-highlight-active');
        m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        m.classList.remove('search-highlight-active');
      }
    });
    setCurrentIndex(index);
    hasScrolledRef.current = true;
  }, []);

  // 次の一致へ移動
  const handleNext = useCallback(() => {
    const total = matchesRef.current.length;
    if (total === 0) return;
    if (!hasScrolledRef.current && currentIndex === 1) {
      focusMatch(1);
    } else {
      const nextIdx = currentIndex >= total ? 1 : currentIndex + 1;
      focusMatch(nextIdx);
    }
  }, [currentIndex, focusMatch]);

  // 前の一致へ移動
  const handlePrev = useCallback(() => {
    const total = matchesRef.current.length;
    if (total === 0) return;
    if (!hasScrolledRef.current && currentIndex === 1) {
      focusMatch(total);
    } else {
      const prevIdx = currentIndex <= 1 ? total : currentIndex - 1;
      focusMatch(prevIdx);
    }
  }, [currentIndex, focusMatch]);

  // 検索実行
  const performSearch = useCallback(
    (searchQuery: string) => {
      clearHighlights();
      const trimmed = searchQuery.trim();
      const container = containerRef.current;
      if (!trimmed || !container) return;

      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'mark') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let curr = walker.nextNode();
      while (curr) {
        textNodes.push(curr as Text);
        curr = walker.nextNode();
      }

      const regex = new RegExp(escapeRegExp(trimmed), 'gi');
      const foundMatches: HTMLElement[] = [];

      for (const node of textNodes) {
        const text = node.nodeValue || '';
        regex.lastIndex = 0;
        const ranges: { start: number; end: number }[] = [];
        let m: RegExpExecArray | null;

        while ((m = regex.exec(text)) !== null) {
          ranges.push({ start: m.index, end: m.index + m[0].length });
          if (!regex.global) break;
        }

        if (ranges.length === 0) continue;

        let currentTextNode = node;
        let offset = 0;
        for (const { start, end } of ranges) {
          const targetStart = start - offset;
          const targetEnd = end - offset;
          if (targetStart < 0 || targetEnd > (currentTextNode.nodeValue?.length || 0)) {
            continue;
          }

          const matchNode = currentTextNode.splitText(targetStart);
          const restNode = matchNode.splitText(targetEnd - targetStart);

          const mark = document.createElement('mark');
          mark.className = 'search-highlight';
          mark.textContent = matchNode.textContent;
          matchNode.parentNode?.replaceChild(mark, matchNode);
          foundMatches.push(mark);

          currentTextNode = restNode;
          offset = end;
        }
      }

      matchesRef.current = foundMatches;
      setTotalMatches(foundMatches.length);
      hasScrolledRef.current = false;

      if (foundMatches.length > 0) {
        foundMatches[0].classList.add('search-highlight-active');
        setCurrentIndex(1);
      } else {
        setCurrentIndex(0);
      }
    },
    [clearHighlights, containerRef]
  );

  // 入力変更ハンドラ
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    performSearch(val);
  };

  // キーボードイベントハンドラ
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    // IME変換確定のEnterの場合は移動しないようにする
    if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    }
  };

  const handleClose = useCallback(() => {
    clearHighlights();
    onClose();
  }, [clearHighlights, onClose]);

  // 開いた際に入力フィールドへフォーカス
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
        if (query) {
          performSearch(query);
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      clearHighlights();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      clearHighlights();
    };
  }, [clearHighlights]);

  if (!isOpen) return null;

  return (
    <div className="search-bar-floating" role="search">
      <div className="search-bar-input-wrap">
        <svg className="search-bar-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04z"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-bar-input"
          placeholder="ページ内を検索..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
        />
        {query.trim() !== '' && (
          <span className="search-bar-count">
            {totalMatches > 0 ? `${currentIndex} / ${totalMatches}` : '一致なし'}
          </span>
        )}
      </div>
      <div className="search-bar-actions">
        <button
          type="button"
          className="search-bar-btn"
          title="前へ (Shift+Enter)"
          aria-label="前へ"
          onClick={handlePrev}
          disabled={totalMatches === 0}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M3.22 9.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 0 1-1.06 0z"/>
          </svg>
        </button>
        <button
          type="button"
          className="search-bar-btn"
          title="次へ (Enter)"
          aria-label="次へ"
          onClick={handleNext}
          disabled={totalMatches === 0}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        </button>
        <button
          type="button"
          className="search-bar-btn search-bar-close-btn"
          title="閉じる (Esc)"
          aria-label="閉じる"
          onClick={handleClose}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};
