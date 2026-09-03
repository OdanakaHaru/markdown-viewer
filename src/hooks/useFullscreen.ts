import { useState, useEffect, useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const isTauri = '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWebviewWindow() : null;

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 全画面モードの切り替え
  const toggleFullscreen = useCallback(async () => {
    if (isTauri && appWindow) {
      try {
        const isFull = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFull);
        setIsFullscreen(!isFull);
      } catch (err) {
        console.error('全画面モードの切り替えに失敗:', err);
      }
    } else {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } else {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      } catch (err) {
        console.error('全画面モードの切り替えに失敗:', err);
      }
    }
  }, []);

  // 全画面解除の処理（Escapeキー等用）
  const exitFullscreen = useCallback(async () => {
    if (isTauri && appWindow) {
      try {
        const isFull = await appWindow.isFullscreen();
        if (isFull) {
          await appWindow.setFullscreen(false);
          setIsFullscreen(false);
        }
      } catch (err) {
        console.error('全画面モードの解除に失敗:', err);
      }
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.error('全画面モードの解除に失敗:', err);
      }
    }
  }, []);

  // fullscreenchangeイベントの監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
  };
}
