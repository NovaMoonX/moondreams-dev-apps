import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import FoldedDateField from '@/components/FoldedDateField';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { store, useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import { CARD_WORDS, MAX_PURCHASE_CENTS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  payCard,
  undoCardPayment,
} from '@apps/runway/store/actions/cardActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard } from '@apps/runway/types';
import {
  selectClosingBase,
  selectRecentFrom,
} from '@apps/runway/store/selectors/historySelectors';
import { formatDateUTC } from '@/utils/formatUtils';
import { getCardName } from '@apps/runway/utils/cardText';

interface PayCardSheetProps {
  card: OpenCard;
  onClose: () => void;
  /** Where Cancel goes, when that is not where a save goes. */
  onCancel?: () => void;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** Pays a card off: the amount it waits for, the day, and an Undo on the toast that follows. Needs a connection. */
function PayCardSheet({ card, onClose, onCancel }: PayCardSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const isMounted = useRef(true);
  const today = todayAsUtcDate();
  const cards = useAppSelector(selectAllCards);
  const balances = useAppSelector(selectBalances);
  const reserveCents = Math.max(0, balances.reserveByCard[card.id] ?? 0);
  const name = getCardName(card, cards);
  const [initial] = useState(() => ({
    amount: reserveCents > 0 ? centsToInputValue(reserveCents) : '',
    day: toDateInputValue(today),
  }));
  const [amount, setAmount] = useState(initial.amount);
  const [day, setDay] = useState(initial.day);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const cents = parseMoneyToCents(amount);
  const paidCents =
    cents !== null && cents > 0 && cents <= MAX_PURCHASE_CENTS ? cents : null;
  const paidOn = fromDateInputValue(day) ?? null;
  // A payment before tracking started, or inside months already added up, would count nowhere.
  const floor = useAppSelector((state) =>
    Math.min(
      today,
      Math.max(
        state.runway.plan?.startDate ?? 0,
        selectClosingBase(state) === null ? 0 : (selectRecentFrom(state) ?? 0),
      ),
    ),
  );
  const extraCents =
    paidCents !== null && paidCents > reserveCents
      ? paidCents - reserveCents
      : 0;
  const getBlocker = () => {
    if (paidCents === null) return CARD_WORDS.needsAmount;
    if (paidOn === null || paidOn > today) return CARD_WORDS.needsDay;
    if (paidOn < floor) return CARD_WORDS.beforeTracking(formatDateUTC(floor));
    return null;
  };
  const blocker = getBlocker();

  const requestClose = useDiscardGuard({
    isDirty: amount !== initial.amount || day !== initial.day,
    onClose: onCancel ?? onClose,
    isBusy: isSaving,
  });

  const undo = async (paid: {
    moveId: string;
    date: number;
    amountCents: number;
  }) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoCardPayment(user.uid, encryption, {
        ...paid,
        cardId: card.id,
      });
      addToast({ title: CARD_WORDS.undone(name), type: 'success' });
    } catch (undoError) {
      addToast({
        title: CARD_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? CARD_WORDS.offline
          : getErrorMessage(undoError, CARD_WORDS.failed),
        type: 'error',
      });
    }
  };

  const handlePay = async () => {
    if (!user || paidCents === null || paidOn === null) return;
    if (!navigator.onLine) {
      setError(CARD_WORDS.offline);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const count = store
        .getState()
        .runway.moves.filter(
          (move) =>
            move.kind === 'cardPayment' &&
            !move.reversesMoveId &&
            move.refId === card.id &&
            move.date === paidOn,
        ).length;
      const moveId = await payCard(user.uid, encryption, {
        cardId: card.id,
        amountCents: paidCents,
        date: paidOn,
        count,
      });
      addToast({
        title: mask(CARD_WORDS.paidToast(formatCents(paidCents), name)),
        type: 'success',
        action: {
          label: CARD_WORDS.undo,
          onClick: () =>
            void undo({ moveId, date: paidOn, amountCents: paidCents }),
        },
      });
      onClose();
    } catch (payError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(payError)
            ? CARD_WORDS.offline
            : getErrorMessage(payError, CARD_WORDS.payFailed),
        );
        setIsSaving(false);
      }
    }
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={CARD_WORDS.payOff(name)}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        <div className='space-y-3'>
          <AmountHero
            label={CARD_WORDS.payAmount}
            value={amount}
            onChange={setAmount}
            disabled={isSaving}
          />
          {extraCents > 0 &&
            (isHidden ? (
              <NeedsALookRow />
            ) : (
              <InlineNotice tone='warning'>
                {CARD_WORDS.payMore(formatCents(extraCents))}
              </InlineNotice>
            ))}
        </div>
        <FoldedDateField
          label={CARD_WORDS.payDay}
          value={day}
          onChange={setDay}
          todayValue={toDateInputValue(today)}
          min={floor === 0 ? undefined : toDateInputValue(floor)}
          max={toDateInputValue(today)}
          disabled={isSaving}
        />
        <ModalFooterActions
          note={error ?? (blocker ? mask(blocker) : null)}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={requestClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isSaving}
              disabled={isSaving || blocker !== null}
              onClick={() => void handlePay()}
            >
              {CARD_WORDS.payAction}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default PayCardSheet;
