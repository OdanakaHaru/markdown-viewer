import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openWithDefaultSize } from '../utils/dialog';
import type { FileEntry } from '../types';
import { getPathBaseName } from '../utils/path';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseWorkspaceOptions {
  onError?: (msg: string) => void;
  onFolderOpened?: () => void;
}

export function useWorkspace({ onError, onFolderOpened }: UseWorkspaceOptions = {}) {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  // フォルダ内のエントリ一覧を読み込む
  const loadDirectory = useCallback(async (path: string) => {
    setIsLoadingRoot(true);
    try {
      const entries = await invoke<FileEntry[]>('read_directory', { path });
      setRootEntries(entries);
    } catch (err: unknown) {
      const errorMsg = typeof err === 'string' ? err : 'フォルダの読み込みに失敗しました。';
      onError?.(errorMsg);
      setRootEntries([]);
    } finally {
      setIsLoadingRoot(false);
    }
  }, [onError]);

  // 「フォルダを開く」ダイアログハンドラ
  const handleOpenFolder = useCallback(async () => {
    if (!isTauri) {
      onError?.('フォルダ選択機能はデスクトップアプリ環境でのみ動作します。');
      return;
    }
    try {
      const selected = await openWithDefaultSize({
        directory: true,
        multiple: false,
        title: 'Markdownドキュメントが含まれる親フォルダーを選択',
      });
      if (!selected) {
        return;
      }
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;

      const name = getPathBaseName(path) || path;
      setFolderPath(path);
      setFolderName(name);
      onFolderOpened?.();
      await loadDirectory(path);
    } catch (err: unknown) {
      onError?.(typeof err === 'string' ? err : 'フォルダの選択に失敗しました。');
    }
  }, [loadDirectory, onError, onFolderOpened]);

  // ルートフォルダの最新化
  const handleRefreshFolder = useCallback(async () => {
    if (folderPath) {
      await loadDirectory(folderPath);
    }
  }, [folderPath, loadDirectory]);

  return {
    folderPath,
    folderName,
    setFolderPath,
    setFolderName,
    rootEntries,
    isLoadingRoot,
    loadDirectory,
    handleOpenFolder,
    handleRefreshFolder,
  };
}
