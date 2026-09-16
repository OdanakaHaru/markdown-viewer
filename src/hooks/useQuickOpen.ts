import { useState, useCallback } from 'react';

export function useQuickOpen() {
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);

  const handleOpenQuickOpen = useCallback(() => {
    setIsQuickOpenOpen((prev) => !prev);
  }, []);

  const handleCloseQuickOpen = useCallback(() => {
    setIsQuickOpenOpen(false);
  }, []);

  return {
    isQuickOpenOpen,
    setIsQuickOpenOpen,
    handleOpenQuickOpen,
    handleCloseQuickOpen,
  };
}
