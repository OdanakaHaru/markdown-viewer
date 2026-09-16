import { useState, useCallback } from 'react';
import type { SidebarView } from '../types';

export function useSidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>('explorer');

  const handleToggleExplorer = useCallback(() => {
    if (isSidebarOpen && sidebarView === 'explorer') {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
      setSidebarView('explorer');
    }
  }, [isSidebarOpen, sidebarView]);

  const handleToggleToc = useCallback(() => {
    if (isSidebarOpen && sidebarView === 'toc') {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
      setSidebarView('toc');
    }
  }, [isSidebarOpen, sidebarView]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarView,
    setSidebarView,
    handleToggleExplorer,
    handleToggleToc,
    toggleSidebar,
    closeSidebar,
    openSidebar,
  };
}
