import { useState, useCallback } from 'react';

interface UseSearchOptions {
  activePaneId: string;
}

export function useSearch({ activePaneId }: UseSearchOptions) {
  const [searchPaneId, setSearchPaneId] = useState<string | null>(null);

  const handleOpenSearch = useCallback(() => {
    setSearchPaneId(activePaneId);
  }, [activePaneId]);

  const handleCloseSearch = useCallback(() => {
    setSearchPaneId(null);
  }, []);

  return {
    searchPaneId,
    setSearchPaneId,
    handleOpenSearch,
    handleCloseSearch,
  };
}
