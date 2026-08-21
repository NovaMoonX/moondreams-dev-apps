import { createContext, useContext } from 'react';

import type { ActiveAction, Space } from '../types';

export interface WorthTheWaitContextValue {
  space: Space | null;
  activeAction: ActiveAction | null;
  presentedAction: ActiveAction | null;
  dismissPresentedAction: () => void;
  selectedBoxId: string | null;
  itemsDisclosureOpen: boolean;
  openBox: (boxId: string, options?: { openItems?: boolean }) => void;
  closeBox: () => void;
  setItemsDisclosureOpen: (open: boolean) => void;
  removePendingApprovalModalDismissal: () => void;
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
