import React, { createContext, useContext } from 'react';
import { usePanes } from '../hooks/usePanes';

export type PaneContextValue = ReturnType<typeof usePanes>;

const PaneContext = createContext<PaneContextValue | null>(null);

export interface PaneProviderProps {
  children: React.ReactNode;
}

export function PaneProvider({ children }: PaneProviderProps) {
  const value = usePanes();

  return (
    <PaneContext.Provider value={value}>
      {children}
    </PaneContext.Provider>
  );
}

export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) {
    throw new Error('usePaneContext must be used within PaneProvider');
  }
  return ctx;
}
