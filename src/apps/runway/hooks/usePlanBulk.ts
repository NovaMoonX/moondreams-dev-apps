import { useRef, useState } from 'react';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { ACCOUNT_WORDS, PLAN_SELECT_WORDS } from '@apps/runway/constants';
import { getBillPins, type BillPin } from '@apps/runway/engine/billShare';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getVersionStretches,
  isSameValue,
  type VersionStretch,
} from '@apps/runway/engine/resolve';
import type { SelectView } from '@apps/runway/hooks/usePlanSelection';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  clearBillPins,
  PinsPartlyCleared,
  restoreBillPins,
} from '@apps/runway/store/actions/dayActions';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  OpenVersion,
} from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import {
  describeChange,
  isMoneylessChange,
} from '@apps/runway/utils/changeText';
import { UNDO_WINDOW_MS } from '@/lib/undo';

type MemberPayload = BillSealed | EnvelopeSealed | GoalSealed;
type MemberKind = 'bill' | 'envelope' | 'goal';
type MemberVersion = Extract<OpenVersion, { kind: MemberKind }>;

const KIND_OF: Record<SelectView, MemberKind> = {
  bills: 'bill',
  envelopes: 'envelope',
  goals: 'goal',
};

/** One ticked item's stretches from today on, as they are and as the change writes them. */
export interface BulkPlan {
  itemId: string;
  name: string;
  original: VersionStretch<MemberPayload>[];
  written: VersionStretch<MemberPayload>[];
}

interface Written extends BulkPlan {
  pins: BillPin[];
  isPinKept: boolean;
}

/** An item's stretches from `from` on, read from the store as it is now. */
export const readStretches = (
  kind: MemberKind,
  itemId: string,
  from: number,
): VersionStretch<MemberPayload>[] =>
  getVersionStretches<MemberVersion, MemberPayload>(
    store
      .getState()
      .runway.versions.filter(
        (version): version is MemberVersion => version.kind === kind,
      ),
    itemId,
    from,
  );

/** Saving one change to every ticked item of a Plan view: one history line per item, one toast with one Undo, and the ids that did not save so they stay ticked. */
export function usePlanBulk(view: SelectView) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isWriting, setIsWriting] = useState(false);
  const writingRef = useRef(false);
  const handledUndos = useRef(new Set<readonly Written[]>());
  const kind = KIND_OF[view];
  const noun = PLAN_SELECT_WORDS.noun[view];

  /** What applying `change` to each item's stretches writes, leaving out an item it would not change. */
  const plan = (
    items: readonly { itemId: string; name: string }[],
    change: (payload: MemberPayload) => MemberPayload,
    from = todayAsUtcDate(),
  ): BulkPlan[] =>
    items.flatMap(({ itemId, name }) => {
      const original = readStretches(kind, itemId, from);
      const written = original.map((stretch) => ({
        ...stretch,
        payload: change(stretch.payload),
      }));
      return original.length === 0 || isSameValue(original, written)
        ? []
        : [{ itemId, name, original, written }];
    });

  const summarize = (
    before: MemberPayload,
    after: MemberPayload,
    today: number,
  ) => {
    const state = store.getState();
    const groupName = (groupId: string) =>
      state.runway.versions
        .filter(
          (version): version is Extract<OpenVersion, { kind: 'group' }> =>
            version.kind === 'group' && version.itemId === groupId,
        )
        .at(-1)?.payload.name ?? 'a group';
    const accountName = (accountId: string | null) =>
      state.runway.accounts.find((account) => account.id === accountId)?.name ??
      ACCOUNT_WORDS.payFromNone;
    const change =
      describeChange(
        before,
        after,
        getCardNamer(state.runway.cards),
        groupName,
        undefined,
        accountName,
      ) || 'Updated';
    return isMoneylessChange(before, after)
      ? { change, isMoneyless: true }
      : { change, isMoneyless: false, from: formatDateOrdinalUTC(today) };
  };

  const write = async (
    uid: string,
    entry: BulkPlan,
    stretches: VersionStretch<MemberPayload>[],
    before: MemberPayload,
    today: number,
  ) => {
    const encryption = await getRunwayEncryption(uid);
    const told = summarize(before, stretches[0].payload, today);
    await changeItem(uid, encryption, {
      itemId: entry.itemId,
      kind,
      payload: stretches[0].payload,
      summary: told.isMoneyless
        ? PLAN_SELECT_WORDS.summaryMoneyless(entry.name, told.change)
        : PLAN_SELECT_WORDS.summary(entry.name, told.change, told.from ?? ''),
      note: null,
      effectiveFrom: today,
      changeEffectiveFrom: told.isMoneyless ? null : today,
      stretches,
    });
  };

  const undo = async (uid: string, written: readonly Written[]) => {
    if (handledUndos.current.has(written)) return;
    handledUndos.current.add(written);
    try {
      const today = todayAsUtcDate();
      const isUntouched = (entry: Written) => {
        const starts = new Set(entry.written.map((s) => s.effectiveFrom));
        return isSameValue(
          readStretches(
            kind,
            entry.itemId,
            entry.written[0].effectiveFrom,
          ).filter((stretch) => starts.has(stretch.effectiveFrom)),
          entry.written,
        );
      };
      const untouched = written.filter(isUntouched);
      const results = await Promise.allSettled(
        untouched.map(async (entry) => {
          await write(
            uid,
            entry,
            entry.original,
            entry.written[0].payload,
            Math.max(entry.written[0].effectiveFrom, today),
          );
          if (entry.pins.length === 0) return;
          const encryption = await getRunwayEncryption(uid);
          await restoreBillPins(
            uid,
            encryption,
            entry.itemId,
            entry.name,
            entry.pins,
          );
        }),
      );
      const done = untouched.filter(
        (_, index) => results[index].status === 'fulfilled',
      );
      const skipped = written
        .filter((entry) => !done.includes(entry))
        .map((entry) => entry.name);
      addToast({
        title:
          skipped.length === 0
            ? PLAN_SELECT_WORDS.undone
            : PLAN_SELECT_WORDS.undoPartly(
                done.length,
                written.length,
                skipped,
              ),
        type: skipped.length === 0 ? 'success' : 'warning',
      });
    } catch (error) {
      handledUndos.current.delete(written);
      addToast({
        title: getErrorMessage(error, PLAN_SELECT_WORDS.undoFailed),
        type: 'error',
      });
    }
  };

  /** Saves every plan; a bill whose Paid from changes also loses its per-pay figures from today, put back by the Undo. Returns the ids that did not save, or null when nothing ran (a save already running). */
  const run = async (
    plans: readonly BulkPlan[],
    options: { clearsPins?: boolean } = {},
  ): Promise<string[] | null> => {
    if (!user || writingRef.current || plans.length === 0) return null;
    writingRef.current = true;
    const uid = user.uid;
    const today = todayAsUtcDate();
    setIsWriting(true);
    const results = await Promise.allSettled(
      plans.map(async (entry): Promise<Written> => {
        await write(
          uid,
          entry,
          entry.written,
          entry.original[0].payload,
          Math.max(entry.written[0].effectiveFrom, today),
        );
        if (!options.clearsPins || kind !== 'bill')
          return { ...entry, pins: [], isPinKept: false };
        const pins = getBillPins(
          store.getState().runway.days,
          entry.itemId,
          today,
        );
        if (pins.length === 0) return { ...entry, pins: [], isPinKept: false };
        return getRunwayEncryption(uid)
          .then((encryption) =>
            clearBillPins(uid, encryption, entry.itemId, entry.name, pins),
          )
          .then((cleared) => ({ ...entry, pins: cleared, isPinKept: false }))
          .catch((error: unknown) => ({
            ...entry,
            pins: error instanceof PinsPartlyCleared ? error.cleared : [],
            isPinKept: true,
          }));
      }),
    );
    writingRef.current = false;
    setIsWriting(false);
    const written = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failed = plans.filter(
      (_, index) => results[index].status === 'rejected',
    );
    const kept = written
      .filter((entry) => entry.isPinKept)
      .map((entry) => entry.name);
    if (written.length === 0) {
      const reason = results.find((result) => result.status === 'rejected');
      addToast({
        title: PLAN_SELECT_WORDS.failed,
        description: getErrorMessage(
          reason?.status === 'rejected' ? reason.reason : null,
          '',
        ),
        type: 'error',
      });
      return failed.map(({ itemId }) => itemId);
    }
    addToast({
      title:
        failed.length === 0
          ? PLAN_SELECT_WORDS.updated(written.length, noun)
          : PLAN_SELECT_WORDS.updatedPartly(
              written.length,
              plans.length,
              failed.map(({ name }) => name),
            ),
      description:
        kept.length === 0 ? undefined : PLAN_SELECT_WORDS.pinsKept(kept),
      type: failed.length === 0 && kept.length === 0 ? 'success' : 'warning',
      duration: UNDO_WINDOW_MS,
      action: {
        label: PLAN_SELECT_WORDS.undo,
        onClick: () => void undo(uid, written),
      },
    });
    return failed.map(({ itemId }) => itemId);
  };

  return { plan, run, isWriting, kind, noun };
}
