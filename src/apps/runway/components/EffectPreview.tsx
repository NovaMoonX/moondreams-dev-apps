import { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector, type RootState } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { formatCents } from '@/utils/moneyUtils';
import {
  CHANGE_WORDS,
  EFFECT_FOLD_WORDS,
  FORM_FLOW_WORDS,
  PREVIEW_SHOWN,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { describeHoldsChange } from '@apps/runway/utils/lookaheadText';
import {
  previewChange,
  previewLookahead,
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

/** Each upcoming income day a change would move, before and after, worked out by the same engine that drafts the days. */
function EffectPreview({
  changeJson,
  emptyText,
  waitingText,
  isCompact = false,
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

  const holdsText = useMemo(() => {
    if (settledVirtual === null || !isLedgerReady) return null;
    const { before, after } = previewLookahead(
      store.getState(),
      today,
      settledVirtual,
    );
    const isSame =
      before.holdsThrough === after.holdsThrough &&
      JSON.stringify(before.problems[0] ?? null) ===
        JSON.stringify(after.problems[0] ?? null);
    return { text: describeHoldsChange(before, after), isSame };
    // The plan slices are what the lookahead reads; the store snapshot is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledVirtual, isLedgerReady, today, items, versions, openDays]);

  const getBody = () => {
    if (virtual === null || days === null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {waitingText ?? CHANGE_WORDS.previewWaiting}
        </p>
      );
    }
    if (days.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          {emptyText ?? CHANGE_WORDS.previewNone}
        </p>
      );
    }
    const entries = toEntries(days);
    const shown = isOpen ? entries : entries.slice(0, PREVIEW_SHOWN);
    if (isCompact && !isOpen) {
      const [first] = days;
      const count =
        days.length === 1
          ? FORM_FLOW_WORDS.compactOne
          : FORM_FLOW_WORDS.compactMany(days.length);
      return (
        <div className='space-y-1'>
          <p className='text-sm'>
            {count} {formatDateUTC(first.on)}:{' '}
            <span className='whitespace-nowrap tabular-nums'>
              {formatCents(first.effect.freeBeforeCents)} to{' '}
              {formatCents(first.effect.freeAfterCents)}
            </span>{' '}
            {FORM_FLOW_WORDS.compactLeft}
          </p>
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
                    {line.text}
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
                    {entry.free}
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
      {holdsText?.text && !(isCompact && holdsText.isSame) && (
        <p className='text-sm'>{holdsText.text}</p>
      )}
    </ActionSection>
  );
}

export default EffectPreview;
