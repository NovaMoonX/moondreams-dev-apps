import { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import BeforeAfterRow from '@/components/BeforeAfterRow';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector, type RootState } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CHANGE_WORDS, PREVIEW_SHOWN } from '@apps/runway/constants';
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
}

const getLineText = (day: PreviewDay) => {
  const lines = day.effect.lines.map(({ itemId, beforeCents, afterCents }) => {
    const name = day.names[itemId]?.name ?? 'Something removed';
    return `${name} ${formatCents(beforeCents)} to ${formatCents(afterCents)}`;
  });
  const shown = lines.slice(0, MAX_LINES_SHOWN);
  const more = lines.length - shown.length;
  return more > 0 ? [...shown, `and ${more} more`] : shown;
};

/** Each upcoming income day a change would move, before and after, worked out by the same engine that drafts the days. */
function EffectPreview({
  changeJson,
  emptyText,
  waitingText,
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
    return describeHoldsChange(before, after);
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
    const shown = isOpen ? days : days.slice(0, PREVIEW_SHOWN);
    return (
      <div className='space-y-1'>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map((day) => {
            const lines = day.kind === 'changed' ? getLineText(day) : [];
            const note =
              day.kind === 'added'
                ? CHANGE_WORDS.added
                : day.kind === 'removed'
                  ? CHANGE_WORDS.removed
                  : null;
            return (
              <BeforeAfterRow
                key={day.dayKey}
                title={`${formatDateUTC(day.on)} · ${day.title}`}
                before={formatCents(day.effect.freeBeforeCents)}
                after={formatCents(day.effect.freeAfterCents)}
                beforeLabel={CHANGE_WORDS.freeNow}
                afterLabel={CHANGE_WORDS.freeAfter}
                detail={
                  note || lines.length > 0 ? (
                    <div className='text-muted-foreground space-y-0.5 text-sm'>
                      {note && <p>{note}</p>}
                      {lines.map((line) => (
                        <p key={line} className='break-words'>
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </ul>
        {days.length > PREVIEW_SHOWN && (
          <ShowMoreButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? 'Show fewer' : `Show all ${days.length}`}
          </ShowMoreButton>
        )}
      </div>
    );
  };

  return (
    <section aria-label={CHANGE_WORDS.previewHeading} className='space-y-2'>
      <SectionDivider label={CHANGE_WORDS.previewHeading} />
      {getBody()}
      {holdsText && <p className='text-sm'>{holdsText}</p>}
    </section>
  );
}

export default EffectPreview;
