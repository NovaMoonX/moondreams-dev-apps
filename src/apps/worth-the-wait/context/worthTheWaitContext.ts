import { createContext, useContext } from 'react';

import type { ActiveAction, Space } from '../types';

export interface WorthTheWaitContextValue {
  space: Space | null;
  activeAction: ActiveAction | null;
  presentedAction: ActiveAction | null;
  dismissPresentedAction: () => void;
  selectedBoxId: string | null;
  openBox: (boxId: string) => void;
  closeBox: () => void;
}

export const WorthTheWaitContext = createContext<WorthTheWaitContextValue | null>(
  null,
);

export function useWorthTheWait() {
  const context = useContext(WorthTheWaitContext);

  if (!context) {
    throw new Error('useWorthTheWait must be used within a WorthTheWaitProvider');
  }

  return context;
}
