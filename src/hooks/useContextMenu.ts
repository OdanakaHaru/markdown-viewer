import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ContextMenuItem, ContextMenuState, ExternalAppType } from '../types';

interface UseContextMenuOptions {
  onError?: (message: string) => void;
}

export function useContextMenu({ onError }: UseContextMenuOptions = {}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  const openContextMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuItem[], title?: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        items,
        title,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  // 外部アプリケーションで開くハンドラ
  const handleOpenInApp = useCallback(
    async (path: string, appType: ExternalAppType, customPath?: string) => {
      try {
        await invoke('open_in_app', {
          path,
          appType,
          customPath: customPath || null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to open with application:', message);
        onError?.(message);
      }
    },
    [onError]
  );

  // エクスプローラーで表示するハンドラ
  const handleRevealInExplorer = useCallback(
    async (path: string) => {
      try {
        await invoke('reveal_in_explorer', { path });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to reveal in explorer:', message);
        onError?.(message);
      }
    },
    [onError]
  );

  // パスをクリップボードにコピー
  const handleCopyPath = useCallback(
    async (path: string) => {
      try {
        await navigator.clipboard.writeText(path);
      } catch (err) {
        console.error('クリップボードへのコピーに失敗しました:', err);
        onError?.('クリップボードへのコピーに失敗しました');
      }
    },
    [onError]
  );

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    handleOpenInApp,
    handleRevealInExplorer,
    handleCopyPath,
  };
}
