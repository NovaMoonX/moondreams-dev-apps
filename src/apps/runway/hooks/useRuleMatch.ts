import { useEffect, useRef, useState } from 'react';

import { store, useAppSelector } from '@/store';
import { SPEND_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { isTrackingLevel } from '@apps/runway/engine/level';
import {
  describeRulePlaced,
  toRulePlacedSealed,
} from '@apps/runway/engine/doneText';
import { planRulePlacements } from '@apps/runway/engine/rules';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectAutoBills,
  selectIsAutoPayReady,
} from '@apps/runway/store/selectors/autoPaySelectors';
import { selectTwinHeldIds } from '@apps/runway/store/selectors/emailSelectors';
import { selectLedgerOnlyBalances as selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectEnvelopes,
  selectIsAccountsLoaded,
  selectIsDaysLoaded,
  selectIsLinkHistory,
  selectIsMovesLoaded,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectIsRulesLoaded,
  selectItemLooks,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';

const MAX_ATTEMPTS = 3;

/** The charges a rule's own sheet is placing, which the pass leaves alone so the two never write one purchase at once. */
export const placingByHand = new Set<string>();

/** Sends the charges waiting in Needs a home that one of the person's rules fits, one transaction each that also records it in Done for you, whose Undo puts it back and stops the pass from redoing it. */
export function usePlaceByRules(uid: string | null) {
  const level = useAppSelector(selectLevel);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const isLinkHistory = useAppSelector(selectIsLinkHistory);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const rules = useAppSelector(selectRules);
  const twinHeld = useAppSelector(selectTwinHeldIds);
  const today = todayAsUtcDate();
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const autoBills = useAppSelector((state) => selectAutoBills(state, today));
  const accounts = useAppSelector(selectAccounts);
  const looks = useAppSelector(selectItemLooks);
  const { describe } = useRuleNames();
  const isReady = useAppSelector(
    (state) =>
      selectIsAutoPayReady(state) &&
      selectIsNeedsHomeLoaded(state) &&
      selectIsRulesLoaded(state) &&
      state.runway.purchasesFrom !== null &&
      state.runway.isCardsLoaded &&
      state.runway.isLinksLoaded &&
      selectIsAccountsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsPlanItemsLoaded(state) &&
      selectIsDaysLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const tried = useRef(new Set<string>());
  const attempts = useRef(new Map<string, number>());
  const isRunning = useRef(false);
  const isWaitingToRun = useRef(false);
  const [runs, setRuns] = useState(0);
  const latest = useRef({ describe, looks });

  useEffect(() => {
    latest.current = { describe, looks };
  });

  useEffect(() => {
    if (uid === null || !isReady || !isTrackingLevel(level)) return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const state = store.getState();
    const found = planRulePlacements(
      {
        level,
        today,
        needsHome,
        purchases,
        rules,
        autoBills,
        accounts,
        spill: {
          trackingPeriods: state.runway.plan?.trackingPeriods ?? [],
          envelopes,
          assignedByItem: () => selectBalances(store.getState()).assignedByItem,
        },
        twinHeld,
        isLinkHistory,
        isExcluded: ({ id, updatedAt }) =>
          tried.current.has(`${id}:${updatedAt}`) || placingByHand.has(id),
      },
      { postedOnly: false },
    ).map((placement) => ({
      ...placement,
      key: `${placement.purchase.id}:${placement.purchase.updatedAt}`,
    }));
    if (found.length === 0) return;
    found.forEach(({ key }) => tried.current.add(key));
    isRunning.current = true;

    const allowRetry = (key: string) => {
      const count = (attempts.current.get(key) ?? 0) + 1;
      attempts.current.set(key, count);
      if (count < MAX_ATTEMPTS) tried.current.delete(key);
    };

    const run = async () => {
      const { looks: names } = latest.current;
      const nameOf = (envelopeId: string) =>
        names.get(envelopeId)?.name ?? 'An envelope';
      try {
        const encryption = await getRunwayEncryption(uid);
        await found.reduce(async (previous, { purchase, rule, lines, key }) => {
          await previous;
          try {
            await assignPurchase(
              uid,
              encryption,
              purchase,
              lines,
              describeRulePlaced(
                purchase,
                lines,
                nameOf,
                latest.current.describe(rule),
              ),
              false,
              { ruleId: rule.id, assignedBy: 'auto' },
              (updatedAt) =>
                toRulePlacedSealed(
                  {
                    ...purchase,
                    lines,
                    needsHome: false,
                    assignedBy: 'auto',
                    ruleId: rule.id,
                    updatedAt,
                  },
                  latest.current.describe(rule),
                  names,
                ),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (
              message !== SPEND_WORDS.changedElsewhere &&
              message !== SPEND_WORDS.notFound
            ) {
              allowRetry(key);
              console.error('A purchase was not placed by a rule', error);
            }
          }
        }, Promise.resolve());
      } catch (error) {
        // The vault or the network failed before any purchase was tried, so they may be tried again.
        found.forEach(({ key }) => allowRetry(key));
        console.error('Rules were not applied', error);
      } finally {
        isRunning.current = false;
        if (isWaitingToRun.current) {
          isWaitingToRun.current = false;
          setRuns((count) => count + 1);
        }
      }
    };
    void run();
  }, [
    uid,
    level,
    isReady,
    needsHome,
    isLinkHistory,
    purchases,
    rules,
    twinHeld,
    envelopes,
    autoBills,
    accounts,
    today,
    runs,
  ]);
}
