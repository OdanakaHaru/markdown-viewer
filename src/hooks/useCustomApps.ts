import { useState, useCallback } from 'react';
import type { CustomApp } from '../types';

const STORAGE_KEY = 'markdown_viewer_custom_apps';

const DEFAULT_CUSTOM_APPS: CustomApp[] = [
  { id: 'vscode', name: 'VS Code で開く', appType: 'vscode' },
];

export function useCustomApps() {
  const [customApps, setCustomApps] = useState<CustomApp[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Parse error fallback
      }
    }
    return DEFAULT_CUSTOM_APPS;
  });

  const handleCustomAppsChange = useCallback((apps: CustomApp[]) => {
    setCustomApps(apps);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  }, []);

  return {
    customApps,
    handleCustomAppsChange,
  };
}
