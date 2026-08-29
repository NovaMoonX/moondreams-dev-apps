import { createContext, useContext } from 'react';

import type { ActiveAction, Box, Item, MemberUpdateSummary, Space } from '../types';

export interface WorthTheWaitContextValue {
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
  memberUpdateSummary: MemberUpdateSummary | null;
  memberUpdateLoading: boolean;
  markMemberUpdatesAsSeen: () => Promise<void>;
  activeAction: ActiveAction | null;
  presentedAction: ActiveAction | null;
  dismissPresentedAction: () => void;
  selectedBoxId: string | null;
  itemsDisclosureOpen: boolean;
  openBox: (boxId: string, options?: { openItems?: boolean }) => void;
  closeBox: () => void;
  setItemsDisclosureOpen: (open: boolean) => void;
  forceOpenPendingApprovalModal: () => void;
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
