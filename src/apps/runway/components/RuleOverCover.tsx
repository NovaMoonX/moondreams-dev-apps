import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import CoverShortfallSheet, {
  type CoverChoice,
} from '@apps/runway/components/CoverShortfallSheet';
import { COVER_WORDS } from '@apps/runway/constants';
import { moveShortToFree } from '@apps/runway/engine/spill';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useShortfallMove } from '@apps/runway/hooks/useShortfallMove';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import { selectLedgerOnlyBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import { getPlacedOver } from '@apps/runway/store/selectors/spillSelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { describePurchaseAssigned } from '@apps/runway/utils/purchaseText';

interface RuleOverCoverProps {
  purchaseId: string;
  onClose: () => void;
}

const findPurchase = (id: string): OpenPurchase | null =>
  store.getState().runway.purchases.find((purchase) => purchase.id === id) ??
  null;

/** Offers the cover choices for a purchase a rule sent to an envelope it took below zero; leaving it over changes nothing. */
function RuleOverCover({ purchaseId, onClose }: RuleOverCoverProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const looks = useAppSelector(selectItemLooks);
  const moveShortfall = useShortfallMove();
  const mask = useMaskedText();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAppSelector(selectLedgerOnlyBalances);
  const purchase = useAppSelector(
    (state) =>
      state.runway.purchases.find((entry) => entry.id === purchaseId) ?? null,
  );
  const over =
    purchase === null ? null : getPlacedOver(store.getState(), purchase.lines);
  if (purchase === null || over === null) return null;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const name = nameOf(over.envelopeId);
  const short = formatCents(over.shortCents);

  const takeRestFromFree = async (uid: string) => {
    const current = findPurchase(purchaseId);
    if (current === null || current.updatedAt !== purchase.updatedAt) {
      throw new Error(COVER_WORDS.changedSince);
    }
    assertStillOver();
    const lines = moveShortToFree(
      current.lines,
      over.envelopeId,
      over.shortCents,
    );
    const encryption = await getRunwayEncryption(uid);
    const updatedAt = await assignPurchase(
      uid,
      encryption,
      current,
      lines,
      describePurchaseAssigned(current, lines, nameOf),
      false,
      { ruleId: current.ruleId, assignedBy: 'person' },
    );
    addToast({
      title: mask(COVER_WORDS.usedRest(short)),
      type: 'success',
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () =>
          void assignPurchase(
            uid,
            encryption,
            { ...current, lines, assignedBy: 'person', updatedAt },
            current.lines,
            describePurchaseAssigned(current, current.lines, nameOf),
            false,
            { ruleId: current.ruleId, assignedBy: current.assignedBy },
          ).catch((undoError: unknown) =>
            addToast({
              title:
                undoError instanceof Error
                  ? undoError.message
                  : COVER_WORDS.changedSince,
              type: 'error',
            }),
          ),
      },
    });
  };

  const assertStillOver = () => {
    const now = getPlacedOver(store.getState(), purchase.lines);
    if (now?.shortCents !== over.shortCents) {
      throw new Error(COVER_WORDS.changedSince);
    }
  };

  const moveIn = async () => {
    assertStillOver();
    const takeBack = await moveShortfall(
      over.envelopeId,
      over.shortCents,
      name,
    );
    addToast({
      title: mask(COVER_WORDS.movedIn(short, name)),
      type: 'success',
      duration: UNDO_WINDOW_MS,
      action: { label: 'Undo', onClick: () => void takeBack() },
    });
  };

  const choose = async (choice: CoverChoice) => {
    if (choice === 'goOver') {
      onClose();
      return;
    }
    if (!user) return;
    setIsBusy(true);
    setError(null);
    try {
      await (choice === 'useRest' ? takeRestFromFree(user.uid) : moveIn());
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : COVER_WORDS.changedSince,
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <CoverShortfallSheet
      isPlaced
      name={name}
      leftCents={over.leftCents}
      shortCents={over.shortCents}
      isBusy={isBusy}
      error={error}
      onChoose={(choice) => void choose(choice)}
      onClose={onClose}
    />
  );
}

export default RuleOverCover;
