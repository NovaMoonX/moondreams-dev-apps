import { useDeferredValue, useMemo, useState } from 'react';

import BeforeAfterRow from '@/components/BeforeAfterRow';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CHANGE_WORDS, PREVIEW_SHOWN } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  previewChange,
  type PreviewDay,
  type PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectBillProgress,
  selectHeldByItem,
  selectSettledKey,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { ItemPayload } from '@apps/runway/utils/changeText';
import type { ItemKind } from '@apps/runway/types';

const MAX_LINES_SHOWN = 3;

interface EffectPreviewProps {
  itemId: string;
  kind: ItemKind;
  /** The item as the form has it now; null while the form is not finished. */
  payload: ItemPayload | null;
  /** The first day the change applies; null while it is not picked. */
  effectiveFrom: number | null;
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
  itemId,
  kind,
  payload,
  effectiveFrom,
}: EffectPreviewProps) {
  const today = todayAsUtcDate();
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const openDays = useAppSelector((state) => state.runway.days);
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectHeldByItem);
  const settledKey = useAppSelector(selectSettledKey);
  const billProgress = useAppSelector(selectBillProgress);
  const [isOpen, setIsOpen] = useState(false);

  const payloadKey = payload === null ? '' : JSON.stringify(payload);
  const virtual = useMemo<PreviewVersion | null>(
    () =>
      payloadKey === '' || effectiveFrom === null
        ? null
        : ({
            itemId,
            kind,
            effectiveFrom,
            effectiveUntil: null,
            changeId: 'what-if',
            payload: JSON.parse(payloadKey),
          } as PreviewVersion),
    [itemId, kind, payloadKey, effectiveFrom],
  );
  const settledVirtual = useDeferredValue(virtual);

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

  const getBody = () => {
    if (virtual === null || days === null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {CHANGE_WORDS.previewWaiting}
        </p>
      );
    }
    if (days.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          {CHANGE_WORDS.previewNone}
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
    </section>
  );
}

export default EffectPreview;
