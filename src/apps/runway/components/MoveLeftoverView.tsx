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
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useValuesHidden } from '@/hooks/useValuesHidden';
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
import { deriveBalances } from '@apps/runway/engine/balances';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
} from '@apps/runway/store/actions/transferActions';
import { selectBalanceInputs } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { Cents, OpenMove } from '@apps/runway/types';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';

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
  const { isHidden } = useValuesHidden();
  const undoMove = useUndoTransfer();
  const inputs = useAppSelector(selectBalanceInputs);
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const emojiOf = useLiveEmojiResolver();
  const [moveId] = useState(newTransferMoveId);
  const [amount, setAmount] = useState(() =>
    isHidden ? '' : centsToInputValue(leftCents),
  );
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
        emoji: emojiOf(version.payload.emoji, version.payload.groupId),
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

  const toId = pick === FREE ? null : pick;
  const isReady = cents !== null && cents <= leftCents && toName !== null;
  const before = deriveBalances(inputs);
  const after = isReady
    ? deriveBalances({
        ...inputs,
        moves: [
          ...inputs.moves,
          {
            id: moveId,
            kind: 'transfer',
            date: today,
            refId: envelopeId,
            reversesMoveId: null,
            createdAt: today,
            payload: {
              fromId: envelopeId,
              toId,
              cents,
              note: null,
              isOutside: false,
            },
          } satisfies OpenMove,
        ],
      })
    : before;
  const figure = (value: Cents) => describeEnvelopeFigure('track', value).value;
  const change = (from: Cents, to: Cents) => `${figure(from)} → ${figure(to)}`;
  const freeRow = {
    name: MOVE_WORDS.freeToSpendNow,
    text: change(before.freeToSpendCents, after.freeToSpendCents),
  };
  const isFreeChanging =
    before.hasMoney && after.freeToSpendCents !== before.freeToSpendCents;
  const rows = !isReady
    ? []
    : [
        {
          name,
          text: change(leftCents, leftCents - cents),
        },
        pick === FREE
          ? {
              ...freeRow,
              text: before.hasMoney ? freeRow.text : `+${formatCents(cents)}`,
            }
          : {
              name: toName,
              text: change(
                before.assignedByItem[pick ?? ''] ?? 0,
                after.assignedByItem[pick ?? ''] ?? 0,
              ),
            },
        ...(pick !== FREE && isFreeChanging ? [freeRow] : []),
      ];
  const allLabel = isHidden
    ? MOVE_WORDS.moveAllHidden
    : MOVE_WORDS.moveAll(formatCents(leftCents));
  const isOverLeft = cents !== null && cents > leftCents;
  const isAllOffered =
    leftCents > 0 && (isOverLeft || (isHidden && amount === ''));

  const move = async () => {
    if (isSavingRef.current || !user || cents === null || toName === null) {
      return;
    }
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
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
        isOutside: false,
        leftCents,
        note: why,
        summary: MOVE_WORDS.summary(money, name, toName),
        undoText: MOVE_WORDS.undone(money, name, toName),
      });
      addToast({
        title: mask(MOVE_WORDS.moved(money, toName)),
        type: 'success',
        action: {
          label: MOVE_WORDS.undo,
          onClick: () =>
            void undoMove({
              moveId,
              bill: null,
              date,
              fromId: envelopeId,
              toId,
              cents,
              note: why,
              isOutside: false,
              undoText: MOVE_WORDS.undone(money, name, toName),
            }),
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
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{MOVE_WORDS.title(name)}</ActionTitle>
      <AmountHero
        label={MOVE_WORDS.amount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
      />
      {isAllOffered && (
        <div>
          <RevealChip onClick={() => setAmount(centsToInputValue(leftCents))}>
            {allLabel}
          </RevealChip>
        </div>
      )}
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
            <li key={row.name} className='px-3 py-2 text-sm'>
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
