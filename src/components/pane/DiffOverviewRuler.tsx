import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { DiffHunkItem } from '../../utils/diffHunkHelper';

interface DiffOverviewRulerProps {
  hunks: DiffHunkItem[];
  activeIndex: number;
  onSelectHunk: (index: number) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const DiffOverviewRuler: React.FC<DiffOverviewRulerProps> = ({
  hunks,
  activeIndex,
  onSelectHunk,
  scrollContainerRef,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ topRatio: 0, heightRatio: 1 });
  const isDraggingRef = useRef(false);

  // スクロールコンテナのビューポート状態を追従
  const updateViewport = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight <= 0) return;

    setViewport({
      topRatio: Math.max(0, Math.min(1, scrollTop / scrollHeight)),
      heightRatio: Math.max(0.02, Math.min(1, clientHeight / scrollHeight)),
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateViewport();
    container.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport);

    // リサイズオブザーバーでコンテンツサイズの変動にも追従
    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      resizeObserver.disconnect();
    };
  }, [scrollContainerRef, updateViewport]);

  // トラッククリック / ドラッグによるスクロール同期
  const scrollToRatio = useCallback(
    (ratio: number, smooth = false) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { scrollHeight, clientHeight } = container;
      const targetScrollTop = ratio * scrollHeight - clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, Math.min(scrollHeight - clientHeight, targetScrollTop)),
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    [scrollContainerRef]
  );

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    scrollToRatio(ratio, true);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 左クリックのみ
    if (e.button !== 0) return;
    isDraggingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (moveEvent.clientY - rect.top) / rect.height));
      scrollToRatio(ratio, false);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <aside
      className="diff-overview-ruler"
      aria-label="差分オーバービュールーラー"
      title="クリックまたはドラッグで該当位置へスクロール"
    >
      <div
        ref={trackRef}
        className="diff-overview-track"
        onClick={handleTrackClick}
        onMouseDown={handleMouseDown}
      >
        {/* 現在の表示範囲を示すビューポート枠 */}
        <div
          className="diff-overview-viewport"
          style={{
            top: `${viewport.topRatio * 100}%`,
            height: `${viewport.heightRatio * 100}%`,
          }}
        />

        {/* 差分位置マーカー群 */}
        {hunks.map((hunk, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              type="button"
              key={hunk.id}
              className={`diff-overview-marker ${hunk.type} ${isActive ? 'active' : ''}`}
              style={{
                top: `${hunk.ratio * 100}%`,
                height: `${Math.max(3, hunk.heightRatio * 100)}%`,
              }}
              title={hunk.summary}
              onClick={(e) => {
                e.stopPropagation();
                onSelectHunk(idx);
              }}
              aria-label={hunk.summary}
            />
          );
        })}
      </div>
    </aside>
  );
};
