import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { unlockSealedFormDrafts } from '@lib/app/formDrafts';
import { createDraftSealer, FORM_DRAFT_PREFIX } from '../security';

import type { Box, Item, MemberUpdateSummary, PendingMember, Space } from '../types';
import { useActiveAction } from '../hooks/useActiveAction';
import {
  WorthTheWaitContext,
  type WorthTheWaitContextValue,
} from './worthTheWaitContext';


interface WorthTheWaitProviderProps extends PropsWithChildren {
  space: Space | null;
  pendingMember: PendingMember | null;
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
  pendingMember,
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
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const spaceEncryption = space?.encryption ?? null;

  // The space arrives as a new object on every snapshot; unlock once per account and key.
  const unlockedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !spaceEncryption) return;
    const unlockFor = `${uid}:${spaceEncryption.keyId}:${spaceEncryption.keyVersion}`;
    if (unlockedForRef.current === unlockFor) return;
    unlockedForRef.current = unlockFor;
    void unlockSealedFormDrafts(uid, FORM_DRAFT_PREFIX, createDraftSealer(spaceEncryption));
  }, [uid, spaceEncryption]);

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
    pendingMember,
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
