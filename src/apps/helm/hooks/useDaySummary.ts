import { useEffect, useState } from 'react';

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import { toDayKey } from '@apps/helm/utils/planDays';
import type { HelmDaySummary, HelmDaySummarySealed } from '@apps/helm/types';

/** A day's summary with its sealed words opened. */
export interface OpenDaySummary {
  status: HelmDaySummary['status'];
  text: string;
  counts: HelmDaySummarySealed['counts'];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A summary waiting on its batch is left alone this long; same value on the server. */
export const SUMMARY_BATCH_WAIT_MS = 6 * 60 * 60 * 1000;

const writeHelmDaySummaryCallable = httpsCallable<
  { dayKey: string },
  { status: string }
>(functions, 'writeHelmDaySummary');

/** "uid|dayKey|staleAt" marks the server answered this session, and those in flight, so a render, a snapshot or a reopened day never calls twice; a failure or a busy answer clears its mark so the next snapshot or reconnect asks again. */
const asked = new Set<string>();
const inFlight = new Set<string>();

/** The server writes no summary further back than this, so the device never asks for one. */
const DAYS_BACK = 30;

const isInWindow = (dayKey: string) =>
  dayKey >=
  toDayKey(Date.now() - DAYS_BACK * DAY_MS, getDeviceTimeZone() ?? 'UTC');

const isDue = (data: Partial<HelmDaySummary> | null, now: number) =>
  data === null ||
  typeof data.staleAt === 'number' ||
  (data.status === 'counted' &&
    (data.attempts ?? 0) < 3 &&
    !(
      typeof data.batchId === 'string' &&
      typeof data.batchedAt === 'number' &&
      now - data.batchedAt < SUMMARY_BATCH_WAIT_MS
    ));

/** The summary of a past day, read live while it is shown. A one-document subscription only the past day's card reads, keyed on the day, so it lives with that card rather than in the store; a reconnect resubscribes so a day first opened offline is asked for then; a missing, stale or only-counted one is asked of the server once per session, quietly. `undefined` until read, `null` when there is none to show. */
export function useDaySummary(uid: string | null, dayKey: string) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const [read, setRead] = useState<{
    key: string;
    summary: OpenDaySummary | null;
  } | null>(null);
  const key = `${uid ?? ''}|${dayKey}`;
  const isReady = uid !== null && keyStatus === 'ready';
  const [onlineAt, setOnlineAt] = useState(0);

  useEffect(() => {
    const onOnline = () => setOnlineAt(Date.now());
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!uid || !isReady) return;
    let isCurrent = true;
    const sequence = { latest: 0 };
    const stop = onSnapshot(
      doc(db, 'apps', 'helm', 'users', uid, 'daySummaries', dayKey),
      (snapshot) => {
        const data = snapshot.exists()
          ? (snapshot.data() as Partial<HelmDaySummary>)
          : null;
        const mark = `${key}|${data?.staleAt ?? ''}`;
        if (
          isDue(data, Date.now()) &&
          isInWindow(dayKey) &&
          navigator.onLine &&
          !asked.has(mark) &&
          !inFlight.has(mark)
        ) {
          inFlight.add(mark);
          writeHelmDaySummaryCallable({ dayKey })
            .then(({ data }) => {
              if (data.status !== 'busy') asked.add(mark);
            })
            .catch((error: unknown) =>
              console.warn('Helm day summary was not written', error),
            )
            .finally(() => inFlight.delete(mark));
        }
        sequence.latest += 1;
        const current = sequence.latest;
        const finish = (summary: OpenDaySummary | null) => {
          if (isCurrent && current === sequence.latest) {
            setRead({ key, summary });
          }
        };
        if (!data?.sealed || data.status === 'empty' || !data.status) {
          finish(null);
          return;
        }
        const { sealed, status } = data;
        getHelmEncryption(uid)
          .then((encryption) =>
            openJson<HelmDaySummarySealed>(sealed, encryption),
          )
          .then((payload) =>
            finish(
              typeof payload.text === 'string' &&
                typeof payload.counts === 'object'
                ? { status, text: payload.text, counts: payload.counts }
                : null,
            ),
          )
          .catch(() => finish(null));
      },
      (error) => {
        console.warn('Helm day summary did not load', error);
        if (isCurrent) setRead({ key, summary: null });
      },
    );
    return () => {
      isCurrent = false;
      stop();
    };
  }, [uid, isReady, dayKey, key, onlineAt]);

  return read?.key === key ? read.summary : undefined;
}
