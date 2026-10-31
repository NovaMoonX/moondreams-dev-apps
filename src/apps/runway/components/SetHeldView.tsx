import { useRef, useState } from 'react';

import { Check } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  MAX_PURCHASE_CENTS,
  MOVE_WORDS,
  SET_HELD_WORDS,
} from '@apps/runway/constants';
import { deriveBalances } from '@apps/runway/engine/balances';
import { useUndoTransfer } from '@apps/runway/hooks/useUndoTransfer';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveLeftover,
  newTransferMoveId,
} from '@apps/runway/store/actions/transferActions';
import { selectBalanceInputs } from '@apps/runway/store/selectors/balanceSelectors';
import type { Cents, OpenMove } from '@apps/runway/types';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';

interface SetHeldViewProps {
  envelopeId: string;
  name: string;
  /** What the envelope holds now. */
  heldCents: Cents;
  today: number;
  onBack: () => void;
}

const isOfflineFailure = (error: unknown) =>
  !navigator.onLine ||
  /offline|unavailable/i.test(error instanceof Error ? error.message : '');

/** The view an envelope's sheet swaps in to say what it holds now; the person says whether the difference moves with Free to Spend or came from, or left to, outside the plan. */
function SetHeldView({
  envelopeId,
  name,
  heldCents,
  today,
  onBack,
}: SetHeldViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const undoMove = useUndoTransfer();
  const inputs = useAppSelector(selectBalanceInputs);
  const [moveId] = useState(newTransferMoveId);
  const [amount, setAmount] = useState(() =>
    isHidden ? '' : centsToInputValue(heldCents),
  );
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{
    choice: 'outside' | 'free';
    isRaising: boolean;
  } | null>(null);

  const parsed = parseMoneyToCents(amount);
  const target =
    parsed !== null && parsed >= 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const difference = target === null ? 0 : target - heldCents;
  const cents = Math.abs(difference);
  const isRaising = difference > 0;
  const source = picked?.isRaising === isRaising ? picked.choice : null;
  const fromId = isRaising ? null : envelopeId;
  const toId = isRaising ? envelopeId : null;
  const isOutside = source === 'outside';
  const amountBlocker =
    target === null
      ? SET_HELD_WORDS.needsAmount
      : difference === 0
        ? SET_HELD_WORDS.unchanged
        : null;
  const blocker =
    amountBlocker ??
    (source === null
      ? isRaising
        ? SET_HELD_WORDS.needsSourceRaise
        : SET_HELD_WORDS.needsSourceLower
      : null);
  const money = formatCents(cents);
  const options = [
    {
      choice: 'outside' as const,
      ...(isRaising ? SET_HELD_WORDS.outsideIn : SET_HELD_WORDS.outsideOut),
    },
    {
      choice: 'free' as const,
      title: isRaising
        ? SET_HELD_WORDS.freeOut.title
        : SET_HELD_WORDS.freeIn.title,
      body: (isRaising ? SET_HELD_WORDS.freeOut : SET_HELD_WORDS.freeIn).body(
        money,
      ),
    },
  ];

  const before = deriveBalances(inputs);
  const after =
    blocker === null
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
              payload: { fromId, toId, cents, note: null, isOutside },
            } satisfies OpenMove,
          ],
        })
      : before;
  const figure = (value: Cents) => describeEnvelopeFigure('track', value).value;
  const change = (from: Cents, to: Cents) => `${figure(from)} → ${figure(to)}`;
  const rows =
    blocker !== null || target === null
      ? []
      : [
          { name, text: change(heldCents, target) },
          ...(before.hasMoney &&
          after.moneyOnHandCents !== before.moneyOnHandCents
            ? [
                {
                  name: SET_HELD_WORDS.moneyOnHand,
                  text: change(before.moneyOnHandCents, after.moneyOnHandCents),
                },
              ]
            : []),
          ...(before.hasMoney &&
          after.freeToSpendCents !== before.freeToSpendCents
            ? [
                {
                  name: MOVE_WORDS.freeToSpendNow,
                  text: change(before.freeToSpendCents, after.freeToSpendCents),
                },
              ]
            : []),
        ];

  const save = async () => {
    if (isSavingRef.current || !user || blocker !== null) return;
    if (!navigator.onLine) {
      setError(MOVE_WORDS.offline);
      return;
    }
    const free = MOVE_WORDS.freeToSpend;
    const fromName = isRaising ? free : name;
    const toName = isRaising ? name : free;
    const undoText = !isOutside
      ? MOVE_WORDS.undone(money, fromName, toName)
      : isRaising
        ? SET_HELD_WORDS.undoneOutsideIn(money, name)
        : SET_HELD_WORDS.undoneOutsideOut(money, name);
    const summary = !isOutside
      ? MOVE_WORDS.summary(money, fromName, toName)
      : isRaising
        ? SET_HELD_WORDS.summaryOutsideIn(money, name)
        : SET_HELD_WORDS.summaryOutsideOut(money, name);
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const date = await moveLeftover(user.uid, encryption, {
        moveId,
        fromId,
        toId,
        cents,
        isOutside,
        leftCents: heldCents,
        note: null,
        summary,
        undoText,
      });
      addToast({
        title: SET_HELD_WORDS.moved(name),
        type: 'success',
        action: {
          label: MOVE_WORDS.undo,
          onClick: () =>
            void undoMove({
              moveId,
              date,
              fromId,
              toId,
              cents,
              note: null,
              isOutside,
              undoText,
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
      <ActionTitle>{SET_HELD_WORDS.title(name)}</ActionTitle>
      <AmountHero
        label={SET_HELD_WORDS.amount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
      />
      {amountBlocker === null && (
        <div className='grid grid-cols-2 gap-2'>
          {options.map((option) => {
            const isChosen = source === option.choice;
            return (
              <Button
                key={option.choice}
                type='button'
                variant='tertiary'
                aria-pressed={isChosen}
                disabled={isSaving}
                className={join(
                  'text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-1.5! text-left font-normal whitespace-normal',
                  isChosen &&
                    'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
                )}
                onClick={() => setPicked({ choice: option.choice, isRaising })}
              >
                <span className='flex w-full items-start justify-between gap-2'>
                  <span className='text-[15px] leading-[1.125rem] font-medium'>
                    {option.title}
                  </span>
                  <span
                    aria-hidden='true'
                    className={join(
                      'grid size-5 shrink-0 place-items-center rounded-full border',
                      isChosen
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {isChosen && <Check className='size-3.5' />}
                  </span>
                </span>
                <span className='text-muted-foreground block text-[13px] leading-[1.125rem]'>
                  <MaskedText>{option.body}</MaskedText>
                </span>
              </Button>
            );
          })}
        </div>
      )}
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
            onClick={() => void save()}
          >
            {SET_HELD_WORDS.action}
          </Button>
        }
      />
    </div>
  );
}

export default SetHeldView;
