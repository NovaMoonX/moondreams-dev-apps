import { useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { getErrorMessage } from '@/utils/errorUtils';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { saveDayOverride } from '@apps/runway/store/actions/dayActions';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  PreviewChange,
  PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import { selectComingDays } from '@apps/runway/store/selectors/runwaySelectors';
import {
  describeChange,
  isSamePayload,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import {
  getChangeSpan,
  INITIAL_FROM_WHEN,
  type ChangeSpan,
} from '@apps/runway/utils/fromWhen';
import { formatDateUTC } from '@/utils/formatUtils';
import type { EnvelopeSealed, GoalSealed, ItemKind } from '@apps/runway/types';

interface UseChangeFlowArgs {
  itemId: string;
  kind: ItemKind;
  current: ItemPayload;
  /** What the form builds now; null while it is not finished. */
  candidate: ItemPayload | null;
  /** The income day whose screen opened the form; the "this income day" answers then mean it. */
  presetDayKey?: string | null;
  onDone: () => void;
}

/** What one income day's own version of an envelope or goal may differ in. */
const getDayOnlyBlocker = (
  kind: ItemKind,
  current: ItemPayload,
  candidate: ItemPayload,
) => {
  if (kind !== 'envelope' && kind !== 'goal') return CHANGE_WORDS.dayOnlyFields;
  const own = current as EnvelopeSealed | GoalSealed;
  const next = candidate as EnvelopeSealed | GoalSealed;
  const allowed = {
    ...own,
    funding: next.funding,
    priority: next.priority,
    orderIndex: next.orderIndex,
  };
  return isSamePayload(allowed, next) ? null : CHANGE_WORDS.dayOnlyFields;
};

/** The change an edit would make, as text the preview reads: a new version, or one income day's own payload. */
const getChangeJson = (
  itemId: string,
  kind: ItemKind,
  candidate: ItemPayload | null,
  span: ChangeSpan | null,
) => {
  if (candidate === null || span === null) return null;
  if (span.kind === 'day') {
    const change: PreviewChange = {
      kind: 'day',
      day: span.day,
      itemId,
      payload: candidate as EnvelopeSealed | GoalSealed,
    };
    return JSON.stringify(change);
  }
  const change: PreviewChange = {
    kind: 'version',
    version: {
      itemId,
      kind,
      effectiveFrom: span.effectiveFrom,
      effectiveUntil: span.effectiveUntil,
      changeId: 'what-if',
      payload: candidate,
    } as PreviewVersion,
  };
  return JSON.stringify(change);
};

/** The state an edit shares across every kind of item: when it starts, the reason step, and one guarded save. */
export function useChangeFlow({
  itemId,
  kind,
  current,
  candidate,
  presetDayKey = null,
  onDone,
}: UseChangeFlowArgs) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const days = useAppSelector((state) => selectComingDays(state, today));
  const [from, setFrom] = useState(INITIAL_FROM_WHEN);
  const [step, setStep] = useState<'form' | 'reason'>('form');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const { span, blocker: spanBlocker } = getChangeSpan(from, {
    today,
    days,
    presetDayKey,
  });
  const effectiveFrom =
    span?.kind === 'version'
      ? span.effectiveFrom
      : span?.kind === 'day'
        ? span.day.on
        : null;
  const isUnchanged = candidate !== null && isSamePayload(current, candidate);
  const summaryText =
    candidate === null ? '' : describeChange(current, candidate);

  const changeJson = isUnchanged
    ? null
    : getChangeJson(itemId, kind, candidate, span);

  const getSummary = (name: string) => {
    const words = summaryText || 'Updated';
    if (span?.kind === 'day') {
      return `${name}: ${words}, for ${formatDateUTC(span.day.on)} only.`;
    }
    if (span?.kind === 'version' && span.effectiveUntil !== null) {
      return `${name}: ${words}, from ${formatDateUTC(span.effectiveFrom)} through ${formatDateUTC(span.effectiveUntil - DAY_MS)}, then it goes back.`;
    }
    return `${name}: ${words}, from ${formatDateUTC(span?.kind === 'version' ? span.effectiveFrom : today)}.`;
  };

  const save = async (reason: string | null) => {
    if (isSavingRef.current || !user || candidate === null || span === null)
      return;
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const summary = getSummary(candidate.name);
      if (span.kind === 'day') {
        await saveDayOverride(
          user.uid,
          encryption,
          {
            payLineId: span.day.payLineId,
            sourceId: span.day.sourceId,
            expectedOn: span.day.on,
          },
          (existing) => ({
            ...existing,
            payloads: {
              ...existing.payloads,
              [itemId]: candidate as EnvelopeSealed | GoalSealed,
            },
          }),
          { itemId, summary, note: reason },
        );
      } else {
        await changeItem(user.uid, encryption, {
          itemId,
          kind,
          payload: candidate,
          summary,
          note: reason,
          effectiveFrom: span.effectiveFrom,
          effectiveUntil: span.effectiveUntil,
        });
      }
      onDone();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This change did not save. Nothing was changed.',
        ),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const getBlocker = (formBlocker: string | null) => {
    if (formBlocker !== null) return formBlocker;
    if (spanBlocker !== null) return spanBlocker;
    if (isUnchanged) return CHANGE_WORDS.unchanged;
    if (span?.kind === 'day' && candidate !== null)
      return getDayOnlyBlocker(kind, current, candidate);
    return null;
  };

  return {
    getBlocker,
    from,
    setFrom,
    step,
    setStep,
    note,
    setNote,
    error,
    isSaving,
    effectiveFrom,
    span,
    changeJson,
    days,
    presetDayKey,
    isUnchanged,
    summaryText,
    today,
    save,
  };
}

export type ChangeFlow = ReturnType<typeof useChangeFlow>;
