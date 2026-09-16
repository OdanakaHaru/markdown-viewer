import React from 'react';

interface DragOverlayProps {
  isDragging: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="drag-overlay">
      <div className="drag-overlay-content">
        <div className="drag-overlay-icon">📥</div>
        <div className="drag-overlay-text">Markdownファイルをここにドロップ</div>
      </div>
    </div>
  );
};
