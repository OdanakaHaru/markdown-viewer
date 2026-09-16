import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import type { FileEntry } from '../types';
import { useWorkspace } from '../hooks/useWorkspace';

export interface WorkspaceContextValue {
  folderPath: string | null;
  folderName: string | null;
  setFolderPath: React.Dispatch<React.SetStateAction<string | null>>;
  setFolderName: React.Dispatch<React.SetStateAction<string | null>>;
  rootEntries: FileEntry[];
  isLoadingRoot: boolean;
  loadDirectory: (path: string) => Promise<void>;
  handleOpenFolder: () => Promise<void>;
  handleRefreshFolder: () => Promise<void>;
  registerOnError: (cb: (msg: string) => void) => void;
  registerOnFolderOpened: (cb: () => void) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: React.ReactNode;
  onError?: (msg: string) => void;
  onFolderOpened?: () => void;
}

export function WorkspaceProvider({
  children,
  onError,
  onFolderOpened,
}: WorkspaceProviderProps) {
  const onErrorRef = useRef<((msg: string) => void) | undefined>(onError);
  const onFolderOpenedRef = useRef<(() => void) | undefined>(onFolderOpened);

  // プロップス変更時に ref を同期
  useEffect(() => {
    if (onError !== undefined) onErrorRef.current = onError;
    if (onFolderOpened !== undefined) onFolderOpenedRef.current = onFolderOpened;
  }, [onError, onFolderOpened]);

  const registerOnError = useCallback((cb: (msg: string) => void) => {
    onErrorRef.current = cb;
  }, []);

  const registerOnFolderOpened = useCallback((cb: () => void) => {
    onFolderOpenedRef.current = cb;
  }, []);

  const workspace = useWorkspace({
    onError: (msg) => onErrorRef.current?.(msg),
    onFolderOpened: () => onFolderOpenedRef.current?.(),
  });

  const value: WorkspaceContextValue = {
    ...workspace,
    registerOnError,
    registerOnFolderOpened,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return ctx;
}
