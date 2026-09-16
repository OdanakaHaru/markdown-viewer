import React, { createContext, useContext, useEffect } from 'react';
import { useSidebar } from '../hooks/useSidebar';
import { useTheme } from '../hooks/useTheme';
import { useFullscreen } from '../hooks/useFullscreen';
import { useSearch } from '../hooks/useSearch';
import { useQuickOpen } from '../hooks/useQuickOpen';
import { usePaneContext } from './PaneContext';
import { useWorkspaceContext } from './WorkspaceContext';

export interface UIContextValue {
  // Sidebar
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarView: ReturnType<typeof useSidebar>['sidebarView'];
  setSidebarView: ReturnType<typeof useSidebar>['setSidebarView'];
  handleToggleExplorer: () => void;
  handleToggleToc: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openSidebar: () => void;

  // Theme & Settings
  themeMode: ReturnType<typeof useTheme>['themeMode'];
  effectiveTheme: ReturnType<typeof useTheme>['effectiveTheme'];
  handleThemeChange: ReturnType<typeof useTheme>['handleThemeChange'];
  isSettingsOpen: boolean;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Fullscreen
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  exitFullscreen: () => void;

  // Search
  searchPaneId: string | null;
  setSearchPaneId: React.Dispatch<React.SetStateAction<string | null>>;
  handleOpenSearch: () => void;
  handleCloseSearch: () => void;

  // Quick Open
  isQuickOpenOpen: boolean;
  handleOpenQuickOpen: () => void;
  handleCloseQuickOpen: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export interface UIProviderProps {
  children: React.ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  const { activePaneId } = usePaneContext();
  const { registerOnFolderOpened } = useWorkspaceContext();

  const sidebar = useSidebar();
  const theme = useTheme();
  const fullscreen = useFullscreen();
  const search = useSearch({ activePaneId });
  const quickOpen = useQuickOpen();

  // フォルダオープン時にサイドバーを自動展開するハンドラを WorkspaceContext に登録
  useEffect(() => {
    registerOnFolderOpened(sidebar.openSidebar);
  }, [registerOnFolderOpened, sidebar.openSidebar]);

  const value: UIContextValue = {
    ...sidebar,
    ...theme,
    ...fullscreen,
    ...search,
    ...quickOpen,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

export function useUIContext(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUIContext must be used within UIProvider');
  }
  return ctx;
}
