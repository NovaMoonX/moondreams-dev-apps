import { createContext, useContext } from 'react';

import type { Box, BoxDraft } from '../types';

export interface BoxContextValue {
  box: Box;
  spaceId: string;
  onDelete?: (boxId: string) => void | Promise<void>;
  onEdit?: (boxId: string, draft: BoxDraft) => void | Promise<void>;
  onOpen?: (boxId: string) => void;
}

export const BoxContext = createContext<BoxContextValue | null>(null);

export function useBoxContext() {
  const context = useContext(BoxContext);

  if (!context) {
    throw new Error('useBoxContext must be used within a BoxProvider');
  }

  return context;
}
