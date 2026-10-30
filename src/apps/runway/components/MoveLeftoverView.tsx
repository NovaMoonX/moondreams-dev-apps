import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  LIFECYCLE_WORDS,
  MAX_NOTE_LENGTH,
  MAX_PURCHASE_CENTS,
  MOVE_WORDS,
} from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
  undoTransfer,
} from '@apps/runway/store/actions/transferActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents } from '@apps/runway/types';

const FREE = 'free';

interface MoveLeftoverViewProps {
  envelopeId: string;
  name: string;
  /** What the envelope has left. */
  leftCents: Cents;
  today: number;
  onBack: () => void;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** The view an envelope's sheet swaps in to move what is left in it to another envelope, a goal or Free to Spend. Nothing is picked until the person picks it. */
function MoveLeftoverView({
  envelopeId,
  name,
  leftCents,
  today,
  onBack,
}: MoveLeftoverViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const balances = useAppSelector(selectBalances);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const [moveId] = useState(newTransferMoveId);
  const [amount, setAmount] = useState(centsToInputValue(leftCents));
  const [pick, setPick] = useState<string | null>(null);
  const [isNoting, setIsNoting] = useState(false);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const places = [
    ...envelopes
      .filter(({ item }) => item.id !== envelopeId)
      .map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        emoji: version.payload.emoji,
      })),
    ...goals
      .filter(({ version }) => version.payload.state !== 'paused')
      .map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
        emoji: version.payload.emoji,
      })),
  ];
  const options: PillOption<string>[] = [
    { value: FREE, label: MOVE_WORDS.freeToSpend },
    ...places.map(({ id, name: placeName, emoji }) => ({
      value: id,
      label: placeName,
      emoji: emoji ?? undefined,
    })),
  ];

  const parsed = parseMoneyToCents(amount);
  const cents =
    parsed !== null && parsed > 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const toName =
    pick === FREE
      ? MOVE_WORDS.freeToSpend
      : (places.find(({ id }) => id === pick)?.name ?? null);
  const getBlocker = () => {
    if (cents === null) return MOVE_WORDS.needsAmount;
    if (cents > leftCents) return MOVE_WORDS.tooMuch;
    if (toName === null) return MOVE_WORDS.needsPlace;
    return null;
  };
  const blocker = getBlocker();

  const toBefore =
    pick === FREE
      ? balances.freeToSpendCents
      : (balances.assignedByItem[pick ?? ''] ?? 0);
  const rows =
    cents === null || cents > leftCents || toName === null
      ? []
      : [
          {
            name,
            text: `${formatCents(leftCents)} → ${formatCents(leftCents - cents)}`,
          },
          {
            name: toName,
            text:
              pick === FREE && !balances.hasMoney
                ? `+${formatCents(cents)}`
                : `${formatCents(toBefore)} → ${formatCents(toBefore + cents)}`,
          },
        ];

  const undo = async (moved: {
    date: number;
    cents: Cents;
    toId: string | null;
    toName: string;
    note: string | null;
  }) => {
    if (!user) return;
    const money = formatCents(moved.cents);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoTransfer(user.uid, encryption, {
        moveId,
        date: moved.date,
        fromId: envelopeId,
        toId: moved.toId,
        cents: moved.cents,
        note: moved.note,
        summary: MOVE_WORDS.undoSummary(money, name, moved.toName),
      });
      addToast({
        title: mask(MOVE_WORDS.undone(money, name)),
        type: 'success',
      });
    } catch (undoError) {
      addToast({
        title: MOVE_WORDS.undoFailed,
        description: isOfflineFailure(undoError)
          ? MOVE_WORDS.offline
          : getErrorMessage(undoError, MOVE_WORDS.failed),
        type: 'error',
      });
    }
  };

  const move = async () => {
    if (isSavingRef.current || !user || cents === null || toName === null) {
      return;
    }
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    const toId = pick === FREE ? null : pick;
    const why = note.trim() === '' ? null : note.trim();
    const money = formatCents(cents);
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const date = await moveLeftover(user.uid, encryption, {
        moveId,
        fromId: envelopeId,
        toId,
        cents,
        leftCents,
        note: why,
        summary: MOVE_WORDS.summary(money, name, toName),
      });
      addToast({
        title: mask(MOVE_WORDS.moved(money, toName)),
        type: 'success',
        action: {
          label: MOVE_WORDS.undo,
          onClick: () => void undo({ date, cents, toId, toName, note: why }),
        },
      });
      onBack();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? MOVE_WORDS.offline
          : getErrorMessage(saveError, MOVE_WORDS.failed),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{MOVE_WORDS.title(name)}</ActionTitle>
      <AmountHero
        label={MOVE_WORDS.amount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
      />
      <ActionSection caption={MOVE_WORDS.moveTo}>
        <div className='space-y-3'>
          <PillGroup
            label={MOVE_WORDS.places}
            options={options}
            value={pick}
            onChange={setPick}
          />
        </div>
      </ActionSection>
      {rows.length > 0 && (
        <ul
          aria-label='What changes'
          className='border-border divide-border bg-card divide-y rounded-2xl border'
        >
          {rows.map((row) => (
            <li key={row.name} className='p-3 text-sm'>
              <p className='flex items-baseline justify-between gap-3'>
                <span className='min-w-0 break-words'>{row.name}</span>
                <span className='font-medium whitespace-nowrap tabular-nums'>
                  <MaskedText>{row.text}</MaskedText>
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {isNoting && (
        <NoteTextField
          label='Note'
          value={note}
          onChange={setNote}
          placeholder='Why you are moving it'
          maxLength={MAX_NOTE_LENGTH}
          rows={1}
        />
      )}
      <div>
        <RevealChip
          onClick={() => {
            if (isNoting) setNote('');
            setIsNoting(!isNoting);
          }}
        >
          {isNoting ? LIFECYCLE_WORDS.removeReason : LIFECYCLE_WORDS.addReason}
        </RevealChip>
      </div>
      <ModalFooterActions
        note={error ?? blocker}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void move()}
          >
            {cents === null
              ? MOVE_WORDS.open
              : mask(MOVE_WORDS.action(formatCents(cents)))}
          </Button>
        }
      />
    </div>
  );
}

export default MoveLeftoverView;
