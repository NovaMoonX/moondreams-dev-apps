import { useEffect, useRef, useState } from 'react';

import { store, useAppSelector } from '@/store';
import {
  DONE_FOR_YOU_WORDS,
  RULE_WORDS,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import {
  findBillCandidateIds,
  getMatchedKeys,
} from '@apps/runway/engine/autoPay';
import { findRulePlacements } from '@apps/runway/engine/rules';
import { recordDone } from '@apps/runway/hooks/useDoneForYou';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import {
  selectAutoBills,
  selectIsAutoPayReady,
} from '@apps/runway/store/selectors/autoPaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectEnvelopes,
  selectIsAccountsLoaded,
  selectIsDaysLoaded,
  selectIsMovesLoaded,
  selectIsNeedsHomeLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectIsRulesLoaded,
  selectItemLooks,
  selectRules,
  selectLinkWaiting,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getSpilledLines } from '@apps/runway/store/selectors/spillSelectors';
import type { OpenPurchase, OpenRule, PurchaseLine } from '@apps/runway/types';
import { toPurchaseSubject } from '@apps/runway/utils/doneForYouSubject';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';
import { describeRulePlaced } from '@apps/runway/utils/ruleText';

const MAX_ATTEMPTS = 3;

interface RuleWork {
  purchase: OpenPurchase;
  rule: OpenRule;
  lines: PurchaseLine[];
  key: string;
}

interface RulePlaced {
  placed: OpenPurchase;
  original: OpenPurchase;
  sentence: string;
}

/** The charges a rule's own sheet is placing, which the pass leaves alone so the two never write one purchase at once. */
export const placingByHand = new Set<string>();

/** The lines every purchase of the batch gets, worked out together from one reading of the balances, each seeing what the ones before it took, so two charges to one envelope never both count its whole balance. */
const getBatchLines = (works: readonly Omit<RuleWork, 'lines'>[]) => {
  const state = store.getState();
  return works.reduce<PurchaseLine[][]>((done, { purchase, rule }) => {
    const taken = done.flat().map((line) => ({ ...line, cents: -line.cents }));
    return [
      ...done,
      getSpilledLines(
        state,
        [
          {
            envelopeId: rule.target,
            cents: purchase.amountCents,
            via: 'chosen',
          },
        ],
        taken,
        purchase.date,
      ),
    ];
  }, []);
};

/** Sends the charges waiting in Needs a home that one of the person's rules fits, one transaction each, and records each in Done for you, whose Undo puts it back and stops the pass from redoing it. */
export function usePlaceByRules(uid: string | null) {
  const level = useAppSelector(selectLevel);
  const waiting = useAppSelector(selectLinkWaiting);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const rules = useAppSelector(selectRules);
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
    if (uid === null || !isReady || level !== 'link') return;
    if (isRunning.current) {
      isWaitingToRun.current = true;
      return;
    }
    const heldForBills = findBillCandidateIds({
      level,
      today,
      bills: autoBills,
      waiting,
      pullAccountId: resolvePayFromAccountId(null, accounts),
      matched: getMatchedKeys(purchases),
    });
    const found = findRulePlacements(
      waiting,
      purchases,
      rules,
      new Set(envelopes.map(({ item }) => item.id)),
    ).flatMap(({ purchase, rule }) => {
      const key = `${purchase.id}:${purchase.updatedAt}`;
      return tried.current.has(key) ||
        placingByHand.has(purchase.id) ||
        heldForBills.has(purchase.id)
        ? []
        : [{ purchase, rule, key }];
    });
    if (found.length === 0) return;
    found.forEach(({ key }) => tried.current.add(key));
    const lines = getBatchLines(found);
    const works = found.map((work, index) => ({
      ...work,
      lines: lines[index],
    }));
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
        const placed = await works.reduce(
          async (previous, { purchase, rule, lines: placedLines, key }) => {
            const list = await previous;
            try {
              const updatedAt = await assignPurchase(
                uid,
                encryption,
                purchase,
                placedLines,
                describeRulePlaced(
                  purchase,
                  placedLines,
                  nameOf,
                  latest.current.describe(rule),
                ),
                false,
                { ruleId: rule.id, assignedBy: 'auto' },
              );
              return [
                ...list,
                {
                  original: purchase,
                  placed: {
                    ...purchase,
                    lines: placedLines,
                    needsHome: false,
                    assignedBy: 'auto',
                    ruleId: rule.id,
                    updatedAt,
                  },
                  sentence: latest.current.describe(rule),
                } satisfies RulePlaced,
              ];
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              if (
                message !== SPEND_WORDS.changedElsewhere &&
                message !== SPEND_WORDS.notFound
              ) {
                allowRetry(key);
                console.error('A purchase was not placed by a rule', error);
              }
              return list;
            }
          },
          Promise.resolve([] as RulePlaced[]),
        );
        if (placed.length === 0) return;
        recordDone(
          uid,
          placed.map(({ placed: entry, sentence }) => {
            const envelopeId =
              entry.lines.find((line) => line.via === 'chosen')?.envelopeId ??
              '';
            return {
              kind: 'rule' as const,
              title: DONE_FOR_YOU_WORDS.ruleSent(
                getPurchaseTitle(entry, nameOf),
                nameOf(envelopeId),
              ),
              detail: null,
              why: `${RULE_WORDS.yourRule}, ${sentence}`,
              undo: { kind: 'rule' as const, placed: entry },
              subject: toPurchaseSubject(entry, {
                ruleId: entry.ruleId,
                itemId: envelopeId === '' ? null : envelopeId,
                toName: names.get(envelopeId)?.name ?? null,
                toEmoji: names.get(envelopeId)?.emoji ?? null,
              }),
            };
          }),
        );
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
    waiting,
    purchases,
    rules,
    envelopes,
    autoBills,
    accounts,
    today,
    runs,
  ]);
}
