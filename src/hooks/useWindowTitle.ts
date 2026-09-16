import { useEffect, useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { TabItem } from '../types';
import { isSubpathOf } from '../utils/path';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWebviewWindow() : null;

interface UseWindowTitleProps {
  activeTab?: TabItem | null;
  folderName: string | null;
  folderPath: string | null;
}

export function useWindowTitle({ activeTab, folderName, folderPath }: UseWindowTitleProps) {
  const updateTitle = useCallback((filename: string, dirName?: string | null) => {
    const title = dirName
      ? `${filename} - ${dirName} - FeatherMark`
      : `${filename} - FeatherMark`;
    document.title = title;
    appWindow?.setTitle(title).catch((err) => {
      console.error('ウィンドウタイトルの更新に失敗:', err);
    });
  }, []);

  const isTabInOpenedFolder = Boolean(
    folderName &&
    folderPath &&
    activeTab &&
    !activeTab.isStandalone &&
    activeTab.filePath &&
    isSubpathOf(activeTab.filePath, folderPath)
  );

  useEffect(() => {
    if (activeTab) {
      updateTitle(activeTab.fileName, isTabInOpenedFolder ? folderName : null);
    } else {
      updateTitle('FeatherMark', folderName);
    }
  }, [activeTab, folderName, isTabInOpenedFolder, updateTitle]);
}
