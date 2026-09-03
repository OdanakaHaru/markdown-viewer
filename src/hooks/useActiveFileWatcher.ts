import { useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { PaneItem } from '../types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWebviewWindow() : null;

interface UseActiveFileWatcherOptions {
  panes: PaneItem[];
  reloadTabContent: (filePath: string, newContent: string) => void;
}

/**
 * 各ペインで現在アクティブなファイルのみをRustバックエンドで監視し、
 * 外部保存された際に自動リロード（ホットリフレッシュ）を行うカスタムフック
 */
export function useActiveFileWatcher({ panes, reloadTabContent }: UseActiveFileWatcherOptions) {
  // 各ペインで現在アクティブなファイル（最大3ファイル）のみを抽出
  const activeFilePaths = useMemo(() => {
    const paths: string[] = [];
    for (const p of panes) {
      const tab = p.tabs.find((t) => t.id === p.activeTabId);
      if (tab?.filePath) {
        paths.push(tab.filePath);
      }
    }
    return Array.from(new Set(paths));
  }, [panes]);

  // Rust側の低リソース監視対象を同期
  useEffect(() => {
    if (!isTauri) return;
    invoke('watch_active_files', { paths: activeFilePaths }).catch((err) => {
      console.error('アクティブファイルの監視更新に失敗しました:', err);
    });
  }, [activeFilePaths]);

  // ファイル変更通知（active-file-changed）を受信して自動リロード
  useEffect(() => {
    if (!isTauri || !appWindow) return;

    let isMounted = true;
    const unlistenPromise = appWindow.listen<string>('active-file-changed', async (event) => {
      const changedPath = event.payload;
      try {
        const [filePath, text] = await invoke<[string, string]>('read_md_file', { path: changedPath });
        if (isMounted) {
          reloadTabContent(filePath, text);
        }
      } catch (err) {
        console.error('ファイルの自動リロードに失敗しました:', err);
      }
    });

    return () => {
      isMounted = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [reloadTabContent]);
}
