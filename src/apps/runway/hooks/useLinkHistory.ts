import { useEffect, useRef } from 'react';
import {
  collection,
  getDocsFromServer,
  query,
  where,
} from 'firebase/firestore';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { db } from '@lib/firebase/config';
import { useAppSelector } from '@/store';
import { NEEDS_HOME_WORDS, SPEND_WORDS } from '@apps/runway/constants';
import { addUtcDays, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getPairSideIds,
  isStillCounted,
} from '@apps/runway/engine/linkHistory';
import { AUTO_MATCH_DAYS } from '@apps/runway/hooks/useBankMatch';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import { openPurchase } from '@apps/runway/store/listeners/openLedger';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectIsLinkHistory,
  selectIsMemoriesLoaded,
  selectIsNeedsHomeLoaded,
  selectRouteMemories,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, PurchaseDoc } from '@apps/runway/types';
import { describePurchaseHistory } from '@apps/runway/utils/purchaseText';

const SWEPT_KEY = 'runway.linkHistorySwept.v1';
const LINK_DAYS_BACK = 31;

const readSwept = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(SWEPT_KEY) ?? '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};

const keepSwept = (key: string) => {
  try {
    localStorage.setItem(
      SWEPT_KEY,
      JSON.stringify([...new Set([...readSwept(), key])]),
    );
  } catch {
    // Without storage the sweep runs again on the next open and finds nothing to change.
  }
};

/**
 * Turns what a link brought in from before it was made into history: not counted and never asked about.
 * Waiting ones are turned as they arrive; ones already placed in spending are found once per link on this device.
 */
export function useLinkHistory(uid: string | null) {
  const { addToast } = useToast();
  const level = useAppSelector(selectLevel);
  const isReady = useAppSelector(selectIsNeedsHomeLoaded);
  const waiting = useAppSelector((state) => state.runway.needsHome);
  const links = useAppSelector((state) => state.runway.links);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const isLinkHistory = useAppSelector(selectIsLinkHistory);
  const isMemoriesLoaded = useAppSelector(selectIsMemoriesLoaded);
  const routes = useAppSelector(selectRouteMemories);
  const tried = useRef(new Set<string>());
  const latest = useRef({ addToast });

  useEffect(() => {
    latest.current = { addToast };
  });

  useEffect(() => {
    if (uid === null || !isReady || !isMemoriesLoaded || level !== 'link') {
      return;
    }
    const swept = readSwept();
    const unswept = links.filter(
      (link) => !swept.includes(`${uid}:${link.id}`),
    );
    // A transfer whose other side arrived after the link is paired instead, which leaves both uncounted.
    const pairSides = getPairSideIds(
      waiting,
      addUtcDays(todayAsUtcDate(), -AUTO_MATCH_DAYS),
      routes,
    );
    const fresh = waiting.filter(
      (purchase) =>
        isLinkHistory(purchase) &&
        !pairSides.has(purchase.id) &&
        isStillCounted(purchase) &&
        !tried.current.has(`${purchase.id}:${purchase.updatedAt}`),
    );
    const toSweep =
      startDate === null
        ? []
        : unswept.filter((link) => !tried.current.has(`swept:${link.id}`));
    if (fresh.length === 0 && toSweep.length === 0) return;
    toSweep.forEach((link) => tried.current.add(`swept:${link.id}`));
    fresh.forEach((purchase) =>
      tried.current.add(`${purchase.id}:${purchase.updatedAt}`),
    );

    const findPlaced = async (): Promise<OpenPurchase[]> => {
      if (toSweep.length === 0 || startDate === null) return [];
      const linkDays = toSweep.map((link) => todayAsUtcDate(link.createdAt));
      const to = Math.max(...linkDays);
      const from = Math.max(
        startDate,
        addUtcDays(Math.min(...linkDays), -LINK_DAYS_BACK),
      );
      if (from >= to) return [];
      const read = createSealedReader(await getRunwayEncryption(uid), openJson);
      const snapshot = await getDocsFromServer(
        query(
          collection(db, 'apps', 'runway', 'plans', uid, 'purchases'),
          where('date', '>=', from),
          where('date', '<', to),
        ),
      );
      const opened = await Promise.all(
        snapshot.docs.map((entry) =>
          openPurchase(
            { ...(entry.data() as PurchaseDoc), id: entry.id },
            read,
          ),
        ),
      );
      return opened.filter(
        (purchase) =>
          !purchase.needsHome &&
          purchase.assignedBy === 'auto' &&
          isLinkHistory(purchase) &&
          isStillCounted(purchase),
      );
    };

    const run = async () => {
      const encryption = await getRunwayEncryption(uid);
      const placed = await findPlaced().catch((error: unknown) => {
        console.error('Purchases from before a link were not read', error);
        return null;
      });
      const work = [...fresh, ...(placed ?? [])];
      const placedIds = new Set((placed ?? []).map((purchase) => purchase.id));
      const outcomes = await work.reduce(
        async (previous, purchase) => {
          const done = await previous;
          try {
            await assignPurchase(
              uid,
              encryption,
              purchase,
              [],
              describePurchaseHistory(purchase, () => 'An envelope'),
              false,
              { ruleId: null, assignedBy: 'auto' },
            );
            return { ...done, turned: done.turned + 1 };
          } catch (error) {
            const message = error instanceof Error ? error.message : '';
            // A placed one changed meanwhile is found only by the sweep, so it runs again.
            const isSettled =
              message === SPEND_WORDS.notFound ||
              (message === SPEND_WORDS.changedElsewhere &&
                !placedIds.has(purchase.id));
            if (!isSettled) {
              tried.current.delete(`${purchase.id}:${purchase.updatedAt}`);
              console.error(
                'A purchase from before a link was not turned to history',
                error,
              );
            }
            return { ...done, failed: done.failed + (isSettled ? 0 : 1) };
          }
        },
        Promise.resolve({ turned: 0, failed: 0 }),
      );
      if (placed !== null && outcomes.failed === 0) {
        toSweep.forEach((link) => keepSwept(`${uid}:${link.id}`));
      } else {
        toSweep.forEach((link) => tried.current.delete(`swept:${link.id}`));
      }
      if (outcomes.turned === 0) return;
      latest.current.addToast({
        title:
          outcomes.turned === 1
            ? NEEDS_HOME_WORDS.historyOne
            : NEEDS_HOME_WORDS.historyMany(outcomes.turned),
        description: NEEDS_HOME_WORDS.historySub,
        type: 'info',
      });
    };

    void run();
  }, [
    uid,
    isReady,
    isMemoriesLoaded,
    level,
    waiting,
    links,
    startDate,
    isLinkHistory,
    routes,
  ]);
}
