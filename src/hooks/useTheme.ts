import { useState, useEffect, useCallback } from 'react';
import type { ThemeMode } from '../types';

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('markdown_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'light';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // システムのカラースキーム変更を監視
  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // テーマ切り替えハンドラ
  const handleThemeChange = useCallback((newTheme: ThemeMode) => {
    setThemeMode(newTheme);
    localStorage.setItem('markdown_theme_mode', newTheme);
  }, []);

  // 実際にMarkdownプレビュー等に適用されるテーマ ('light' | 'dark')
  const effectiveTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;

  // テーマに合わせて html / body レベルの属性とカラーモードを同期
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  return {
    themeMode,
    effectiveTheme,
    handleThemeChange,
    isSettingsOpen,
    setIsSettingsOpen,
  };
}
