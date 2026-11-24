import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import FoldedDateField from '@/components/FoldedDateField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SuggestionChips from '@/components/SuggestionChips';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  CARD_WORDS,
  FORM_DRAFT_PREFIX,
  LINK_WORDS,
  MAX_PURCHASE_CENTS,
  STARTED_PAYMENT_WORDS,
} from '@apps/runway/constants';
import { isMinimumPaid } from '@apps/runway/engine/cards';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { isText, readDraftFields } from '@apps/runway/forms/draftParse';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  removeStartedPayment,
  startCardPayment,
} from '@apps/runway/store/actions/cardActions';
import { selectBankOwedByCard } from '@apps/runway/store/selectors/cardBankSelectors';
import { getLinkedStatement } from '@apps/runway/store/selectors/cardStatementSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenCard, OpenCardStatement } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

interface StartPaymentSheetProps {
  card: OpenCard;
  onClose: () => void;
  /** Where Cancel goes, when that is not where a save goes. */
  onCancel?: () => void;
}

interface StartPaymentDraft {
  amount: string;
  day: string;
}

const parseStartPaymentDraft = (stored: unknown) =>
  readDraftFields<StartPaymentDraft>(stored, { amount: isText, day: isText });

/** How far back a payment started at the bank can be dated. */
const STARTED_BACK_DAYS = 14;

/** The statement balance while no payment since the statement has covered it, never above what the card owes now; else null. */
const getUnpaidStatementCents = (
  statement: OpenCardStatement | null,
  balanceCents: number,
) => {
  if (statement === null || balanceCents <= 0) return null;
  const { statementCents } = statement;
  if (statementCents === null || statementCents <= 0) return null;
  return isMinimumPaid(statement, statementCents)
    ? null
    : Math.min(statementCents, balanceCents);
};

/** At Link, notes a card payment the person started at their bank: the amount and the day, then it waits until the bank shows it. Needs a connection. */
function StartPaymentSheet({
  card,
  onClose,
  onCancel,
}: StartPaymentSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const isMounted = useRef(true);
  const today = todayAsUtcDate();
  const cards = useAppSelector(selectAllCards);
  const name = getCardName(card, cards);
  const owed = useAppSelector(selectBankOwedByCard)[card.id];
  const statement = useAppSelector((state) =>
    getLinkedStatement(state.runway, card),
  );
  const bankName = useAppSelector(
    (state) =>
      state.runway.links.find((link) => link.id === card.linkId)
        ?.institutionName || LINK_WORDS.fallbackBank,
  );
  const waitingCents = (owed?.waiting ?? []).reduce(
    (sum, entry) => sum + entry.payment.amountCents,
    0,
  );
  const balanceCents = Math.max(0, (owed?.postedCents ?? 0) - waitingCents);
  const statementCents = getUnpaidStatementCents(statement, balanceCents);
  const minimumCents =
    statement?.minimumCents !== null &&
    statement?.minimumCents !== undefined &&
    statement.minimumCents > 0
      ? statement.minimumCents
      : null;
  const [initial] = useState(() => {
    const cents = statementCents ?? balanceCents;
    return {
      amount: cents > 0 ? centsToInputValue(cents) : '',
      day: toDateInputValue(today),
    };
  });
  const draftKey = `${FORM_DRAFT_PREFIX}start-payment:${card.id}`;
  const kept = useFormDraft({
    key: draftKey,
    base: null,
    parse: parseStartPaymentDraft,
  });
  const [amount, setAmount] = useState(kept.restored?.amount ?? initial.amount);
  const [day, setDay] = useState(kept.restored?.day ?? initial.day);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const cents = parseMoneyToCents(amount);
  const amountCents =
    cents !== null && cents > 0 && cents <= MAX_PURCHASE_CENTS ? cents : null;
  const startedOn = fromDateInputValue(day) ?? null;
  const floor = today - STARTED_BACK_DAYS * DAY_MS;
  const quickAmounts = [
    statementCents === null
      ? null
      : {
          text: mask(
            STARTED_PAYMENT_WORDS.statementQuick(formatCents(statementCents)),
          ),
          cents: statementCents,
        },
    balanceCents > 0 && balanceCents !== statementCents
      ? {
          text: mask(
            STARTED_PAYMENT_WORDS.balanceQuick(formatCents(balanceCents)),
          ),
          cents: balanceCents,
        }
      : null,
    minimumCents === null ||
    balanceCents <= 0 ||
    (statement !== null && isMinimumPaid(statement, minimumCents)) ||
    minimumCents === statementCents ||
    minimumCents === balanceCents
      ? null
      : {
          text: mask(CARD_WORDS.minimumQuick(formatCents(minimumCents))),
          cents: minimumCents,
        },
  ].filter((option) => option !== null);
  const getBlocker = () => {
    if (amountCents === null) return STARTED_PAYMENT_WORDS.needsAmount;
    if (startedOn === null || startedOn > today || startedOn < floor)
      return STARTED_PAYMENT_WORDS.needsDay;
    return null;
  };
  const blocker = getBlocker();
  const isDirty = amount !== initial.amount || day !== initial.day;
  const keptValue = useMemo(() => ({ amount, day }), [amount, day]);
  useKeepFormDraft({
    isRestored: kept.restored !== null,
    key: draftKey,
    base: null,
    value: keptValue,
    isDirty,
  });
  const startOver = () => {
    setAmount(initial.amount);
    setDay(initial.day);
    kept.hideNotice();
  };
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: onCancel ?? onClose,
    isBusy: isSaving,
  });

  const undo = async (id: string) => {
    if (!user) return;
    try {
      await removeStartedPayment(user.uid, id);
      addToast({ title: STARTED_PAYMENT_WORDS.undone, type: 'success' });
    } catch (undoError) {
      addToast({
        title: STARTED_PAYMENT_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? CARD_WORDS.offline
          : getErrorMessage(undoError, CARD_WORDS.failed),
        type: 'error',
      });
    }
  };

  const handleSave = async () => {
    if (!user || amountCents === null || startedOn === null) return;
    if (!navigator.onLine) {
      setError(CARD_WORDS.offline);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const id = await startCardPayment(user.uid, encryption, {
        cardId: card.id,
        amountCents,
        startedOn,
      });
      addToast({
        title: mask(
          STARTED_PAYMENT_WORDS.savedToast(formatCents(amountCents), name),
        ),
        description: STARTED_PAYMENT_WORDS.savedDetail(bankName),
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: CARD_WORDS.undo,
          onClick: () => void undo(id),
        },
      });
      onClose();
    } catch (saveError) {
      if (isMounted.current) {
        setError(
          isOfflineFailure(saveError)
            ? CARD_WORDS.offline
            : getErrorMessage(saveError, STARTED_PAYMENT_WORDS.failed),
        );
        setIsSaving(false);
      }
    }
  };

  return (
    <FormSheet
      isOpen
      onClose={requestClose}
      title={STARTED_PAYMENT_WORDS.action}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-5'>
        {kept.isNoticeShown && (
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={kept.hideNotice}
          />
        )}
        <div className='space-y-3'>
          <AmountHero
            label={STARTED_PAYMENT_WORDS.amount(name)}
            value={amount}
            onChange={setAmount}
            disabled={isSaving}
          />
          {quickAmounts.length > 1 && (
            <SuggestionChips
              label={CARD_WORDS.quickAmounts}
              suggestions={quickAmounts.map((option) => option.text)}
              isDisabled={isSaving}
              onPick={(text) => {
                const picked = quickAmounts.find(
                  (option) => option.text === text,
                );
                if (picked) setAmount(centsToInputValue(picked.cents));
              }}
            />
          )}
        </div>
        <FoldedDateField
          label={STARTED_PAYMENT_WORDS.day}
          value={day}
          onChange={setDay}
          todayValue={toDateInputValue(today)}
          min={toDateInputValue(floor)}
          max={toDateInputValue(today)}
          disabled={isSaving}
        />
        <ModalFooterActions
          note={
            error ??
            (blocker ? mask(blocker) : STARTED_PAYMENT_WORDS.note(bankName))
          }
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
              onClick={() => void handleSave()}
            >
              {STARTED_PAYMENT_WORDS.save}
            </Button>
          }
        />
      </div>
    </FormSheet>
  );
}

export default StartPaymentSheet;
