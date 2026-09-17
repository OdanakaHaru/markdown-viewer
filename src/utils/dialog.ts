import { invoke } from '@tauri-apps/api/core';
import { open, type OpenDialogOptions } from '@tauri-apps/plugin-dialog';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// アプリ起動時にも前回の横長サイズ等のキャッシュを初期化
if (isTauri) {
  invoke('reset_file_dialog_size').catch(() => {});
}

/**
 * WindowsにおいてExplorerダイアログ（IFileDialog）が前回サイズを記憶して横長等になるのを防ぐため、
 * ダイアログを開く直前にレジストリのサイズ記憶を初期化し、常にデフォルトサイズでダイアログを開く。
 */
export async function openWithDefaultSize(options: OpenDialogOptions = {}) {
  if (isTauri) {
    try {
      await invoke('reset_file_dialog_size');
    } catch {
      // 失敗してもダイアログの表示自体は妨げない
    }
  }
  return await open(options);
}
