import { useEffect, useCallback } from 'react';

/**
 * ショートカットのアクション定義
 */
export interface ShortcutActions {
  /** Ctrl+W: アクティブタブを閉じる */
  closeActiveTab: () => void;
  /** Ctrl+Tab: 次のタブに切り替え */
  nextTab: () => void;
  /** Ctrl+Shift+Tab: 前のタブに切り替え */
  prevTab: () => void;
  /** Ctrl+1〜9: n番目のタブに切り替え */
  goToTab: (index: number) => void;
  /** Ctrl+O: ファイルを開くダイアログ */
  openFile: () => void;
  /** Ctrl+Shift+T: 最後に閉じたタブを復元 */
  reopenClosedTab: () => void;
  /** Ctrl+B: サイドバーの表示/非表示切替 */
  toggleSidebar: () => void;
  /** Ctrl+,: 設定画面を開く */
  openSettings: () => void;
  /** F11: 全画面切り替え */
  toggleFullscreen: () => void;
  /** Escape: 全画面解除（設定モーダルが開いていない場合のみ） */
  exitFullscreen: () => void;
}

interface UseKeyboardShortcutsOptions {
  actions: ShortcutActions;
  /** 設定モーダルが開いているかどうか（Escapeの動作制御に使用） */
  isSettingsOpen: boolean;
}

/**
 * キーボードショートカットを一元管理するカスタムフック
 *
 * すべてのグローバルキーイベントをこのフック内で処理し、
 * ブラウザのデフォルト動作（新規タブやダウンロード等）をpreventDefaultで抑制する。
 */
export function useKeyboardShortcuts({ actions, isSettingsOpen }: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // --- Ctrl+W: アクティブタブを閉じる ---
      if (ctrl && !shift && key === 'w') {
        e.preventDefault();
        actions.closeActiveTab();
        return;
      }

      // --- Ctrl+Shift+T: 閉じたタブを復元 ---
      if (ctrl && shift && key === 't') {
        e.preventDefault();
        actions.reopenClosedTab();
        return;
      }

      // --- Ctrl+Shift+Tab: 前のタブ ---
      if (ctrl && shift && key === 'tab') {
        e.preventDefault();
        actions.prevTab();
        return;
      }

      // --- Ctrl+Tab: 次のタブ ---
      if (ctrl && !shift && key === 'tab') {
        e.preventDefault();
        actions.nextTab();
        return;
      }

      // --- Ctrl+1〜9: n番目のタブに切り替え ---
      if (ctrl && !shift && key >= '1' && key <= '9') {
        e.preventDefault();
        actions.goToTab(parseInt(key, 10));
        return;
      }

      // --- Ctrl+O: ファイルを開く ---
      if (ctrl && !shift && key === 'o') {
        e.preventDefault();
        actions.openFile();
        return;
      }

      // --- Ctrl+B: サイドバー切り替え ---
      if (ctrl && !shift && key === 'b') {
        e.preventDefault();
        actions.toggleSidebar();
        return;
      }

      // --- Ctrl+,: 設定を開く ---
      if (ctrl && !shift && key === ',') {
        e.preventDefault();
        actions.openSettings();
        return;
      }

      // --- F11: 全画面切り替え ---
      if (e.key === 'F11') {
        e.preventDefault();
        actions.toggleFullscreen();
        return;
      }

      // --- Escape: 全画面解除（設定モーダルが開いている場合はモーダル側で処理） ---
      if (e.key === 'Escape' && !isSettingsOpen) {
        actions.exitFullscreen();
        return;
      }
    },
    [actions, isSettingsOpen]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
