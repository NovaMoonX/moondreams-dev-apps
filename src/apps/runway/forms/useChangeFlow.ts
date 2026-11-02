import { useRef, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useStore } from 'react-redux';

import { useAppSelector, type RootState } from '@/store';
import {
  CARRY_WORDS,
  CHANGE_WORDS,
  PAY_SHARE_WORDS,
} from '@apps/runway/constants';
import type { BillPin } from '@apps/runway/engine/billShare';
import { restoreBillPins } from '@apps/runway/store/actions/dayActions';
import { getErrorMessage } from '@/utils/errorUtils';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import type { VersionStretch } from '@apps/runway/engine/resolve';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  carryDayOverrides,
  saveDayOverride,
} from '@apps/runway/store/actions/dayActions';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import {
  previewOverrideCarry,
  type PreviewChange,
  type PreviewUnpin,
  type PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectAllCards,
  selectComingDays,
  selectGroups,
  selectResolvedPlan,
  selectSettledKey,
} from '@apps/runway/store/selectors/runwaySelectors';
import {
  describeChange,
  isSamePayload,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describePayChoice } from '@apps/runway/utils/payFrom';
import {
  getChangeSpan,
  INITIAL_FROM_WHEN,
  type ChangeSpan,
  type FromWhenValue,
} from '@apps/runway/utils/fromWhen';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import type {
  EnvelopeSealed,
  GoalSealed,
  GroupSealed,
  ItemKind,
} from '@apps/runway/types';

/** What an afterSave step cleared, so the toast can offer an Undo. */
export interface PinsCleared {
  cleared: BillPin[];
  billId: string;
  billName: string;
}

interface UseChangeFlowArgs {
  itemId: string;
  kind: ItemKind;
  current: ItemPayload;
  /** What the form builds now; null while it is not finished. */
  candidate: ItemPayload | null;
  /** The income day whose screen opened the form; the "this income day" answers then mean it. */
  presetDayKey?: string | null;
  /** A group the person named while changing a bill, written in the same batch as the change. */
  newGroup?: GroupSealed | null;
  onDone: () => void;
  /** Runs once the change is written, for what the change makes stale; a failure is told, never hidden. */
  afterSave?: (
    effectiveFrom: number,
    effectiveUntil: number | null,
  ) => Promise<PinsCleared | void>;
  /** For a change to one field only: the item's stretches from the day the change starts, each written as its own version so later versions and their ends are kept. */
  buildStretches?: (
    effectiveFrom: number,
    effectiveUntil: number | null,
  ) => VersionStretch<ItemPayload>[] | undefined;
  /** The change replaces this bill's per-pay figures, so its preview is drawn without them. */
  clearsPins?: boolean;
  /** A kept draft's note and "from when", when the form starts from one. */
  initialNote?: string;
  initialFrom?: FromWhenValue;
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
  stretches: VersionStretch<ItemPayload>[] | undefined,
  unpin: PreviewUnpin | undefined,
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
  const change: PreviewChange = stretches
    ? {
        kind: 'versions',
        versions: stretches.map(
          (stretch) =>
            ({
              itemId,
              kind,
              effectiveFrom: stretch.effectiveFrom,
              effectiveUntil: stretch.effectiveUntil,
              changeId: 'what-if',
              payload: stretch.payload,
            }) as PreviewVersion,
        ),
        unpin,
      }
    : {
        kind: 'version',
        version: {
          itemId,
          kind,
          effectiveFrom: span.effectiveFrom,
          effectiveUntil: span.effectiveUntil,
          changeId: 'what-if',
          payload: candidate,
        } as PreviewVersion,
        unpin,
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
  newGroup = null,
  onDone,
  afterSave,
  buildStretches,
  clearsPins = false,
  initialNote = '',
  initialFrom = INITIAL_FROM_WHEN,
}: UseChangeFlowArgs) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const store = useStore<RootState>();
  const today = todayAsUtcDate();
  const days = useAppSelector((state) => selectComingDays(state, today));
  const groups = useAppSelector((state) => selectGroups(state, today));
  const allCards = useAppSelector(selectAllCards);
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const [from, setFrom] = useState(initialFrom);
  const [step, setStep] = useState<'form' | 'reason'>('form');
  const [note, setNote] = useState(initialNote);
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
    candidate === null
      ? ''
      : describeChange(
          current,
          candidate,
          getCardNamer(allCards),
          (groupId) =>
            groups.find(({ item }) => item.id === groupId)?.version.payload
              .name ??
            newGroup?.name ??
            'a group',
          (fundedBy) => describePayChoice(fundedBy, plan, true),
        );

  const stretches =
    span?.kind === 'version' && candidate !== null
      ? buildStretches?.(span.effectiveFrom, span.effectiveUntil)
      : undefined;
  const changeJson = isUnchanged
    ? null
    : getChangeJson(
        itemId,
        kind,
        candidate,
        span,
        stretches,
        clearsPins && span?.kind === 'version'
          ? {
              billId: itemId,
              from: span.effectiveFrom,
              until: span.effectiveUntil,
            }
          : undefined,
      );

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
        const state = store.getState();
        const carry =
          changeJson === null
            ? null
            : previewOverrideCarry(
                {
                  items: state.runway.items,
                  versions: state.runway.versions,
                  openDays: state.runway.days,
                  today,
                  settledKey: selectSettledKey(state),
                },
                JSON.parse(changeJson) as PreviewChange,
              );
        await changeItem(user.uid, encryption, {
          itemId,
          kind,
          payload: candidate,
          newGroup,
          summary,
          note: reason,
          effectiveFrom: span.effectiveFrom,
          effectiveUntil: span.effectiveUntil,
          stretches,
        });
        if (carry !== null && carry.carried.length > 0) {
          const moves = carry.carried.map(({ from, to }) => ({
            fromId: from.id,
            fromOn: from.expectedOn,
            to: {
              payLineId: to.payLineId,
              sourceId: to.sourceId,
              expectedOn: to.on,
            },
          }));
          const tellFailed = (failedOn: number[]) => {
            if (failedOn.length === 0) return;
            const dates = failedOn.map(formatDateShortUTC);
            const named =
              dates.length <= 3
                ? dates.join(', ').replace(/, ([^,]*)$/, ' and $1')
                : `${dates.slice(0, 2).join(', ')} and ${dates.length - 2} more`;
            addToast({
              title: CARRY_WORDS.failedTitle(failedOn.length),
              description: CARRY_WORDS.failedBody(named),
              type: 'error',
            });
          };
          void carryDayOverrides(user.uid, encryption, moves)
            .then(({ failedOn }) => tellFailed(failedOn))
            .catch((carryError: unknown) => {
              console.error('Moving day choices failed', carryError);
              tellFailed(moves.map((move) => move.fromOn));
            });
        }
      }
      if (afterSave) {
        try {
          const done = await afterSave(
            span.kind === 'version' ? span.effectiveFrom : today,
            span.kind === 'version' ? span.effectiveUntil : null,
          );
          if (done && done.cleared.length > 0) {
            const { cleared, billId, billName } = done;
            addToast({
              title: PAY_SHARE_WORDS.pinsClearedToast(billName, cleared.length),
              type: 'success',
              action: {
                label: PAY_SHARE_WORDS.undoPins,
                onClick: () =>
                  void restoreBillPins(
                    user.uid,
                    encryption,
                    billId,
                    billName,
                    cleared,
                  ).catch((undoError: unknown) =>
                    addToast({
                      title: PAY_SHARE_WORDS.undoFailed,
                      description: getErrorMessage(undoError, ''),
                      type: 'error',
                    }),
                  ),
              },
            });
          }
        } catch (afterError) {
          addToast({
            title: CHANGE_WORDS.savedButStale,
            description: getErrorMessage(afterError, ''),
            type: 'error',
          });
        }
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
