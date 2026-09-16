import React from 'react';
import { CloseIcon } from './Icons';

interface ErrorBannerProps {
  error: string;
  onClose: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onClose }) => {
  if (!error) return null;

  return (
    <div
      className="error"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>{error}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="閉じる"
        aria-label="エラーを閉じる"
      >
        <CloseIcon />
      </button>
    </div>
  );
};
