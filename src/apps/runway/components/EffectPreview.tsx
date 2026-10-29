import { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import InlineNotice from '@/components/InlineNotice';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector, type RootState } from '@/store';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { formatCents } from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  COMPACT_MOVE_WORDS,
  EFFECT_FOLD_WORDS,
  FORM_FLOW_WORDS,
  MOVED_DAY_WORDS,
  PREVIEW_SHOWN,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  describeHoldsBlocks,
  isSameLookahead,
} from '@apps/runway/utils/lookaheadText';
import {
  previewChange,
  previewLookahead,
  previewOverrideCarry,
  type PreviewChange,
  type PreviewDay,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectBillProgress,
  selectIsMovesLoaded,
  selectIsRecordsReady,
  selectHeldByItem,
  selectSettledKey,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

const MAX_LINES_SHOWN = 3;

interface EffectPreviewProps {
  /** What is layered over the plan, as JSON of a `PreviewChange`; null while the form is not finished. */
  changeJson: string | null;
  /** Words for the empty case when a change moves no income day. */
  emptyText?: string;
  /** Words for a form that is finished but has no change in it yet. */
  waitingText?: string;
  /** One summary line with a door to each day, for a form whose subject is the change itself. */
  isCompact?: boolean;
  /** Warns, in place of the plan still holding, when any item gets less on a day; the words for the first one. */
  describeLess?: (name: string, day: string) => string;
}

interface EffectEntry {
  key: string;
  title: string;
  note: string | null;
  lines: { name: string; text: string }[];
  more: number;
  free: string | null;
  detail: string | null;
}

const toDayEntry = (day: PreviewDay): EffectEntry => {
  const lines = day.kind === 'changed' ? day.effect.lines : [];
  const shown = lines.slice(0, MAX_LINES_SHOWN).map((line) => ({
    name: day.names[line.itemId]?.name ?? 'Something removed',
    text: `${formatCents(line.beforeCents)} → ${formatCents(line.afterCents)}`,
  }));
  const isFreeMoved =
    day.kind === 'changed' &&
    day.effect.freeBeforeCents !== day.effect.freeAfterCents;
  return {
    key: day.dayKey,
    title: `${formatDateUTC(day.on)} · ${day.title}`,
    note:
      day.kind === 'added'
        ? CHANGE_WORDS.added
        : day.kind === 'removed'
          ? CHANGE_WORDS.removed
          : null,
    lines: shown,
    more: lines.length - shown.length,
    free: isFreeMoved
      ? `${formatCents(day.effect.freeBeforeCents)} → ${formatCents(day.effect.freeAfterCents)}`
      : null,
    detail: null,
  };
};

/** Days that move the same way, with nothing of their own to say, become one row; the days with lines that change come first, each on its own. */
const toEntries = (days: readonly PreviewDay[]): EffectEntry[] => {
  const kindOf = (day: PreviewDay) =>
    day.kind !== 'changed'
      ? day.kind
      : day.effect.lines.length === 0 &&
          day.effect.freeBeforeCents === day.effect.freeAfterCents
        ? 'same'
        : 'own';
  const own = days.filter((day) => kindOf(day) === 'own').map(toDayEntry);
  const folded = (['removed', 'added', 'same'] as const).flatMap((kind) => {
    const group = days.filter((day) => kindOf(day) === kind);
    if (group.length === 0) return [];
    if (group.length === 1 && kind !== 'same') return [toDayEntry(group[0])];
    const first = formatDateUTC(group[0].on);
    const last = formatDateUTC(group[group.length - 1].on);
    return [
      {
        key: kind,
        title: EFFECT_FOLD_WORDS[kind](group.length),
        note: null,
        lines: [],
        more: 0,
        free: null,
        detail: group.length > 1 ? `${first} to ${last}` : first,
      },
    ];
  });
  return [...own, ...folded];
};

/** Days a change only moves to other dates, each keeping what it leaves: pairs of a day taken away and a day added, in date order. */
const getMoves = (days: readonly PreviewDay[]) => {
  const removed = days.filter((day) => day.kind === 'removed');
  const added = days.filter((day) => day.kind === 'added');
  const isMove =
    removed.length > 0 &&
    removed.length === added.length &&
    removed.length + added.length === days.length &&
    removed.every(
      (day, index) =>
        day.effect.freeBeforeCents === added[index].effect.freeAfterCents,
    );
  return { removed, added, isMove };
};

/** What a change does when no day's "Left from this day" moves, or it only follows a day to its new date: the dates that move, or how many days change. */
const describeUnmoved = (days: readonly PreviewDay[]) => {
  const { removed, added, isMove } = getMoves(days);
  if (isMove && removed.length === 1)
    return COMPACT_MOVE_WORDS.movesTo(
      formatDateShortUTC(removed[0].on),
      formatDateShortUTC(added[0].on),
    );
  if (isMove)
    return COMPACT_MOVE_WORDS.manyMove(
      removed.length,
      formatDateShortUTC(removed[0].on),
    );
  if (days.length === 1)
    return COMPACT_MOVE_WORDS.oneChanges(formatDateShortUTC(days[0].on));
  return COMPACT_MOVE_WORDS.manyChange(
    days.length,
    formatDateShortUTC(days[0].on),
  );
};

/** Each upcoming income day a change would move, before and after, worked out by the same engine that drafts the days. */
function EffectPreview({
  changeJson,
  emptyText,
  waitingText,
  isCompact = false,
  describeLess,
}: EffectPreviewProps) {
  const today = todayAsUtcDate();
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const openDays = useAppSelector((state) => state.runway.days);
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectHeldByItem);
  const settledKey = useAppSelector(selectSettledKey);
  const billProgress = useAppSelector(selectBillProgress);
  const store = useStore<RootState>();
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [isOpen, setIsOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const settledJson = useDeferredValue(changeJson);
  const settledVirtual = useMemo<PreviewChange | null>(
    () => (settledJson === null ? null : JSON.parse(settledJson)),
    [settledJson],
  );
  const virtual = changeJson;

  const days = useMemo(() => {
    if (settledVirtual === null) return null;
    const result = previewChange(
      {
        items,
        versions,
        openDays,
        stance,
        today,
        heldByItem,
        settledKey,
        billProgress,
      },
      settledVirtual,
    );
    return result;
  }, [
    settledVirtual,
    items,
    versions,
    openDays,
    stance,
    today,
    heldByItem,
    settledKey,
    billProgress,
  ]);

  const movedNotes = useMemo(() => {
    if (settledVirtual === null) return [];
    const { carried, stranded } = previewOverrideCarry(
      { items, versions, openDays, today, settledKey },
      settledVirtual,
    );
    const result = [
      ...(carried.length > 0
        ? [
            {
              tone: 'info' as const,
              isOneCarried: carried.length === 1,
              text: MOVED_DAY_WORDS.carried(
                carried.length,
                formatDateUTC(carried[0].from.expectedOn),
                formatDateUTC(carried[0].to.on),
              ),
            },
          ]
        : []),
      ...(stranded.length > 0
        ? [
            {
              tone: 'warning' as const,
              isOneCarried: false,
              text: MOVED_DAY_WORDS.stranded(
                stranded.length,
                formatDateUTC(stranded[0].expectedOn),
              ),
            },
          ]
        : []),
    ];
    return result;
  }, [settledVirtual, items, versions, openDays, today, settledKey]);

  const holdsText = useMemo(() => {
    if (settledVirtual === null || !isLedgerReady) return null;
    const { before, after } = previewLookahead(
      store.getState(),
      today,
      settledVirtual,
    );
    const isSame = isSameLookahead(before, after);
    return { blocks: describeHoldsBlocks(before, after, isHidden), isSame };
    // The plan slices are what the lookahead reads; the store snapshot is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settledVirtual,
    isLedgerReady,
    today,
    items,
    versions,
    openDays,
    isHidden,
  ]);

  const lessText = useMemo(() => {
    if (describeLess === undefined || days === null) return null;
    const day = days.find(
      (entry) =>
        entry.kind === 'changed' &&
        entry.effect.lines.some((line) => line.afterCents < line.beforeCents),
    );
    const line = day?.effect.lines.find(
      (entry) => entry.afterCents < entry.beforeCents,
    );
    return day === undefined || line === undefined
      ? null
      : describeLess(
          day.names[line.itemId]?.name ?? 'An item',
          formatDateShortUTC(day.on),
        );
  }, [describeLess, days]);

  const isMoveSaid =
    isCompact &&
    !isOpen &&
    days !== null &&
    getMoves(days).isMove &&
    getMoves(days).removed.length === 1;
  const isCarrySaid =
    isMoveSaid && movedNotes.some((note) => note.isOneCarried);

  const getBody = () => {
    if (virtual === null || days === null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {waitingText ?? CHANGE_WORDS.previewWaiting}
        </p>
      );
    }
    if (days.length === 0) {
      return emptyText ? (
        <InlineNotice tone='info'>
          <MaskedText>{emptyText}</MaskedText>
        </InlineNotice>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {CHANGE_WORDS.previewNone}
        </p>
      );
    }
    const entries = toEntries(days);
    const shown = isOpen ? entries : entries.slice(0, PREVIEW_SHOWN);
    if (isCompact && !isOpen) {
      const first = getMoves(days).isMove
        ? undefined
        : days.find(
            (day) => day.effect.freeBeforeCents !== day.effect.freeAfterCents,
          );
      const count =
        days.length === 1
          ? FORM_FLOW_WORDS.compactOne
          : FORM_FLOW_WORDS.compactMany(days.length);
      return (
        <div className='space-y-1'>
          {first === undefined ? (
            <p className='text-sm'>
              {describeUnmoved(days)}
              {isCarrySaid && ` ${COMPACT_MOVE_WORDS.carriedWithIt}`}
            </p>
          ) : (
            <p className='text-sm'>
              {count} {formatDateUTC(first.on)}:{' '}
              <span className='whitespace-nowrap tabular-nums'>
                <MaskedText>
                  {`${formatCents(first.effect.freeBeforeCents)} to ${formatCents(first.effect.freeAfterCents)}`}
                </MaskedText>
              </span>
              {!isHidden && ` ${FORM_FLOW_WORDS.compactLeft}`}
            </p>
          )}
          <ShowMoreButton isOpen={false} onClick={() => setIsOpen(true)}>
            {FORM_FLOW_WORDS.compactDoor}
          </ShowMoreButton>
        </div>
      );
    }
    return (
      <div className='space-y-1'>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map((entry) => (
            <li key={entry.key} className='space-y-1 p-3 text-sm'>
              <p className='line-clamp-2 font-medium break-words'>
                {entry.title}
              </p>
              {entry.lines.map((line) => (
                <p
                  key={line.name}
                  className='flex items-baseline justify-between gap-3'
                >
                  <span className='min-w-0 break-words'>{line.name}</span>
                  <span className='font-medium whitespace-nowrap tabular-nums'>
                    <MaskedText>{line.text}</MaskedText>
                  </span>
                </p>
              ))}
              {entry.more > 0 && (
                <p className='text-muted-foreground'>and {entry.more} more</p>
              )}
              {entry.free && (
                <p className='text-muted-foreground flex items-baseline justify-between gap-3'>
                  <span>{CHANGE_WORDS.freeNow}</span>
                  <span className='whitespace-nowrap tabular-nums'>
                    <MaskedText>{entry.free}</MaskedText>
                  </span>
                </p>
              )}
              {entry.note && (
                <p className='text-muted-foreground'>{entry.note}</p>
              )}
              {entry.detail && (
                <p className='text-muted-foreground'>{entry.detail}</p>
              )}
            </li>
          ))}
        </ul>
        {(entries.length > PREVIEW_SHOWN || isCompact) && (
          <ShowMoreButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)}>
            {isOpen
              ? 'Show fewer'
              : `Show ${entries.length - PREVIEW_SHOWN} more`}
          </ShowMoreButton>
        )}
      </div>
    );
  };

  return (
    <ActionSection caption={CHANGE_WORDS.previewHeading}>
      {getBody()}
      {movedNotes
        .filter((note) => !(note.isOneCarried && isCarrySaid))
        .map((note) => (
          <InlineNotice key={note.text} tone={note.tone}>
            {note.text}
          </InlineNotice>
        ))}
      {holdsText &&
        !(isCompact && holdsText.isSame) &&
        holdsText.blocks
          .filter((block) => lessText === null || block.tone !== 'success')
          .map((block) =>
            isHidden && block.tone === 'warning' ? (
              <NeedsALookRow key={block.text} />
            ) : (
              <InlineNotice key={block.text} tone={block.tone}>
                {block.figure === null ? (
                  block.text
                ) : (
                  <>
                    {block.text.slice(0, block.text.indexOf(block.figure))}
                    <strong className='whitespace-nowrap text-(--runway-warning-ink)'>
                      {block.figure}
                    </strong>
                    {block.text.slice(
                      block.text.indexOf(block.figure) + block.figure.length,
                    )}
                  </>
                )}
              </InlineNotice>
            ),
          )}
      {lessText !== null &&
        !holdsText?.blocks.some((block) => block.tone === 'warning') &&
        (isHidden ? (
          <NeedsALookRow />
        ) : (
          <InlineNotice tone='warning'>{lessText}</InlineNotice>
        ))}
    </ActionSection>
  );
}

export default EffectPreview;
