import { useCallback, useState, type PropsWithChildren } from 'react';

import type { Space } from '../types';
import { useActiveAction } from '../hooks/useActiveAction';
import {
  WorthTheWaitContext,
  type WorthTheWaitContextValue,
} from './worthTheWaitContext';

interface WorthTheWaitProviderProps extends PropsWithChildren {
  space: Space | null;
  removePendingApprovalModalDismissal: () => void;
}

export function WorthTheWaitProvider({
  children,
  space,
  removePendingApprovalModalDismissal,
}: WorthTheWaitProviderProps) {
  const { activeAction, dismissPresentedAction, presentedAction } =
    useActiveAction(space?.id ?? '');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [itemsDisclosureOpen, setItemsDisclosureOpen] = useState(false);

  const openBox = useCallback(
    (boxId: string, options?: { openItems?: boolean }) => {
      setSelectedBoxId(boxId);
      setItemsDisclosureOpen(Boolean(options?.openItems));
    },
    [],
  );

  const closeBox = useCallback(() => {
    setSelectedBoxId(null);
    setItemsDisclosureOpen(false);
  }, []);

  const value: WorthTheWaitContextValue = {
    space,
    activeAction,
    presentedAction,
    dismissPresentedAction,
    selectedBoxId,
    itemsDisclosureOpen,
    openBox,
    closeBox,
    setItemsDisclosureOpen,
    removePendingApprovalModalDismissal,
  };

  return (
    <WorthTheWaitContext.Provider value={value}>
      {children}
    </WorthTheWaitContext.Provider>
  );
}
