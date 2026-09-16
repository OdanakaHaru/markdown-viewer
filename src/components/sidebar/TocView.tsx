import React from 'react';
import type { TocItem } from '../../types';

interface TocViewProps {
  items: TocItem[];
  activeId: string | null;
  onSelectHeading: (id: string) => void;
  hasActiveTab: boolean;
}

export const TocView: React.FC<TocViewProps> = ({
  items,
  activeId,
  onSelectHeading,
  hasActiveTab,
}) => {
  if (!hasActiveTab) {
    return (
      <div className="toc-empty-state">
        <div className="toc-empty-icon">📑</div>
        <p className="toc-empty-text">ドキュメントを開くと目次が表示されます</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="toc-empty-state">
        <div className="toc-empty-icon">📝</div>
        <p className="toc-empty-text">見出し（h1〜h6）が見つかりません</p>
      </div>
    );
  }

  return (
    <nav className="toc-container" aria-label="ドキュメントの目次">
      <ul className="toc-list">
        {items.map((item, index) => {
          const isActive = item.id === activeId;
          const indentLevel = Math.max(0, item.level - 1);

          return (
            <li
              key={`${item.id}-${index}`}
              className={`toc-item-wrapper level-${item.level}`}
              style={{ paddingLeft: `${indentLevel * 12 + 10}px` }}
            >
              <button
                type="button"
                className={`toc-item-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectHeading(item.id)}
                title={item.text}
              >
                <span className="toc-badge">H{item.level}</span>
                <span className="toc-label">{item.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
