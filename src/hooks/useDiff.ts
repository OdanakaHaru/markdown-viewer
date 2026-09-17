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

  const handleCompareGitDiff = useCallback(
    async (filePath: string, revision: string = 'HEAD') => {
      try {
        const diffResult = await invoke<DiffResult>('compare_git_markdown', {
          filePath,
          revision,
        });

        const fileNameOnly = filePath.split(/[\\/]/).pop() || filePath;
        const newTab: TabItem = {
          id: generateId(),
          filePath: `git://${revision}::${filePath}`,
          fileName: `Git Diff: ${fileNameOnly} (${revision} ↔ 作業ツリー)`,
          content: '',
          isDiff: true,
          isGitDiff: true,
          gitRevision: revision,
          gitFilePath: filePath,
          diffResult,
          diffViewMode: 'visual',
        };

        addTabToPane(activePaneId, newTab);
      } catch (e) {
        console.error('Git Diff error:', e);
        onError(String(e));
      }
    },
    [activePaneId, addTabToPane, onError]
  );

  const [isGitCommitModalOpen, setIsGitCommitModalOpen] = useState(false);
  const [gitCommitModalFilePath, setGitCommitModalFilePath] = useState<string | null>(null);

  const handleOpenGitCommitModal = useCallback((filePath: string) => {
    setGitCommitModalFilePath(filePath);
    setIsGitCommitModalOpen(true);
  }, []);

  const handleCloseGitCommitModal = useCallback(() => {
    setIsGitCommitModalOpen(false);
    setGitCommitModalFilePath(null);
  }, []);

  return {
    isDiffModalOpen,
    diffModalInitialPath,
    handleOpenDiffModal,
    handleCloseDiffModal,
    handleCompareDiff,
    handleCompareGitDiff,
    isGitCommitModalOpen,
    gitCommitModalFilePath,
    handleOpenGitCommitModal,
    handleCloseGitCommitModal,
  };
}


