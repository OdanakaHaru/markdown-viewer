import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TabItem, DiffResult } from '../types';
import { generateId } from '../utils/id';

interface UseDiffOptions {
  activePaneId: string;
  addTabToPane: (paneId: string, tab: TabItem) => void;
  onError: (error: string) => void;
}

export function useDiff({ activePaneId, addTabToPane, onError }: UseDiffOptions) {
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffModalInitialPath, setDiffModalInitialPath] = useState<string | null>(null);

  const handleOpenDiffModal = useCallback((initialPath?: string) => {
    setDiffModalInitialPath(typeof initialPath === 'string' ? initialPath : null);
    setIsDiffModalOpen(true);
  }, []);

  const handleCloseDiffModal = useCallback(() => {
    setIsDiffModalOpen(false);
  }, []);

  const handleCompareDiff = useCallback(
    async (pathA: string, pathB: string) => {
      try {
        const diffResult = await invoke<DiffResult>('compare_markdown_files', {
          oldPath: pathA,
          newPath: pathB,
        });

        const newTab: TabItem = {
          id: generateId(),
          filePath: `${pathA}::${pathB}`,
          fileName: `Diff: ${pathA.split(/[\\/]/).pop()} ↔ ${pathB.split(/[\\/]/).pop()}`,
          content: '',
          isDiff: true,
          diffResult,
          diffViewMode: 'visual',
        };

        addTabToPane(activePaneId, newTab);
      } catch (e) {
        console.error('Diff error:', e);
        onError(String(e));
      }
    },
    [activePaneId, addTabToPane, onError]
  );

  return {
    isDiffModalOpen,
    diffModalInitialPath,
    handleOpenDiffModal,
    handleCloseDiffModal,
    handleCompareDiff,
  };
}
