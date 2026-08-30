import { useCallback, useState, type PropsWithChildren } from 'react';

import type { Box, Item, MemberUpdateSummary, Space } from '../types';
import { useActiveAction } from '../hooks/useActiveAction';
import {
  WorthTheWaitContext,
  type WorthTheWaitContextValue,
} from './worthTheWaitContext';

interface WorthTheWaitProviderProps extends PropsWithChildren {
  space: Space | null;
  boxes: Box[];
  boxesLoading: boolean;
  createCustomBox: (draft: { name: string; emoji: string; description: string }) => Promise<unknown>;
  editCustomBox: (boxId: string, draft: { name: string; emoji: string; description: string }) => Promise<void>;
  deleteBox: (boxId: string) => Promise<void>;
  itemsByBoxId: Record<string, Item[]>;
  getItemsByBoxId: (boxId: string) => Item[];
  itemsLoading: boolean;
  addItem: (boxId: string, content: string | { content: string }) => Promise<unknown>;
  deleteItem: (boxId: string, itemId: string) => Promise<void>;
  updateItem: (boxId: string, itemId: string, content: string) => Promise<void>;
  revealItem: (boxId: string, itemId: string) => Promise<void>;
  memberUpdateSummary: MemberUpdateSummary | null;
  memberUpdateLoading: boolean;
  markMemberUpdatesAsSeen: () => Promise<void>;
  forceOpenPendingApprovalModal: () => void;
}

export function WorthTheWaitProvider({
  children,
  space,
  boxes,
  boxesLoading,
  createCustomBox,
  editCustomBox,
  deleteBox,
  itemsByBoxId,
  getItemsByBoxId,
  itemsLoading,
  addItem,
  deleteItem,
  updateItem,
  revealItem,
  memberUpdateSummary,
  memberUpdateLoading,
  markMemberUpdatesAsSeen,
  forceOpenPendingApprovalModal,
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
    boxes,
    boxesLoading,
    createCustomBox,
    editCustomBox,
    deleteBox,
    itemsByBoxId,
    getItemsByBoxId,
    itemsLoading,
    addItem,
    deleteItem,
    updateItem,
    revealItem,
    memberUpdateSummary,
    memberUpdateLoading,
    markMemberUpdatesAsSeen,
    activeAction,
    presentedAction,
    dismissPresentedAction,
    selectedBoxId,
    itemsDisclosureOpen,
    openBox,
    closeBox,
    setItemsDisclosureOpen,
    forceOpenPendingApprovalModal,
  };

  return (
    <WorthTheWaitContext.Provider value={value}>
      {children}
    </WorthTheWaitContext.Provider>
  );
}
