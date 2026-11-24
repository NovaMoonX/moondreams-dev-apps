import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
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
  RUNWAY_SEARCH_THRESHOLD,
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
import { isOfflineFailure } from '@apps/runway/utils/offlineText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

const FREE = 'free';

interface MoveLeftoverViewProps {
  itemId: string;
  kind: 'envelope' | 'goal';
  name: string;
  /** What the envelope has left, or what the goal holds. */
  leftCents: Cents;
  /** Envelopes are places only where they track what is left in them. */
  hasEnvelopes: boolean;
  today: number;
  onBack: () => void;
}

interface Place {
  id: string;
  name: string;
  emoji: string | null;
}

/** The view an envelope's or goal's sheet swaps in to move its money to Free to Spend, an envelope or another goal. Nothing is picked until the person picks it. */
function MoveLeftoverView({
  itemId: envelopeId,
  kind,
  name,
  leftCents,
  hasEnvelopes,
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
  const [query, setQuery] = useState('');
  const [isNoting, setIsNoting] = useState(false);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const envelopePlaces: Place[] = hasEnvelopes
    ? envelopes
        .filter(({ item }) => item.id !== envelopeId)
        .map(({ item, version }) => ({
          id: item.id,
          name: version.payload.name,
          emoji: emojiOf(version.payload.emoji, version.payload.groupId),
        }))
    : [];
  const goalPlaces: Place[] = goals
    .filter(
      ({ item, version }) =>
        item.id !== envelopeId && version.payload.state !== 'paused',
    )
    .map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      emoji: emojiOf(version.payload.emoji, version.payload.groupId),
    }));
  const places = [...envelopePlaces, ...goalPlaces];
  const hasSearch = places.length >= RUNWAY_SEARCH_THRESHOLD;
  const trimmedQuery = hasSearch ? query.trim().toLowerCase() : '';
  const toOptions = (list: Place[]): PillOption<string>[] =>
    list
      .filter(
        ({ name: placeName }) =>
          trimmedQuery === '' || placeName.toLowerCase().includes(trimmedQuery),
      )
      .map(({ id, name: placeName, emoji }) => ({
        value: id,
        label: placeName,
        emoji: emoji ?? undefined,
      }));
  const sections = [
    { label: MOVE_WORDS.envelopes, options: toOptions(envelopePlaces) },
    { label: MOVE_WORDS.goals, options: toOptions(goalPlaces) },
  ].filter((section) => section.options.length > 0);
  const search = (text: string) => {
    setQuery(text);
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({ block: 'nearest' }),
    );
  };
  const choose = (value: string) => {
    setPick(value);
    setQuery('');
  };

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
    if (cents > leftCents) {
      return kind === 'goal' ? MOVE_WORDS.tooMuchSaved : MOVE_WORDS.tooMuch;
    }
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
        duration: UNDO_WINDOW_MS,
        action: {
          label: MOVE_WORDS.undo,
          onClick: () =>
            void undoMove({
              moveId,
              bill: null,
              cost: null,
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
            label={MOVE_WORDS.freeToSpend}
            options={[{ value: FREE, label: MOVE_WORDS.freeToSpend }]}
            value={pick}
            onChange={choose}
          />
          {hasSearch && (
            <div
              onKeyDown={(event) =>
                event.key === 'Enter' && event.preventDefault()
              }
            >
              <SearchInput
                value={query}
                onChange={search}
                placeholder={
                  hasEnvelopes ? MOVE_WORDS.search : MOVE_WORDS.searchGoals
                }
              />
            </div>
          )}
          <div ref={resultsRef} className='space-y-3'>
            {sections.map((section) => (
              <div key={section.label} className='space-y-2'>
                <SectionDivider label={section.label} />
                <PillGroup
                  label={section.label}
                  options={section.options}
                  value={pick}
                  onChange={choose}
                  isSearchable={false}
                />
              </div>
            ))}
            {trimmedQuery !== '' && sections.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {MOVE_WORDS.noMatch(query.trim())}
              </p>
            )}
          </div>
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
