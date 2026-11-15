import { useEffect, useState } from 'react';

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@lib/firebase/config';
import { useAppSelector } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import type { HelmDaySummary, HelmDaySummarySealed } from '@apps/helm/types';

/** A day's summary with its sealed words opened. */
export interface OpenDaySummary {
  status: HelmDaySummary['status'];
  text: string;
  counts: HelmDaySummarySealed['counts'];
}

const writeHelmDaySummaryCallable = httpsCallable<
  { dayKey: string },
  { status: string }
>(functions, 'writeHelmDaySummary');

/** "uid|dayKey|staleAt" marks already asked this session, so a render, a snapshot or a reopened day never calls twice. */
const asked = new Set<string>();

const isDue = (data: Partial<HelmDaySummary> | null) =>
  data === null ||
  typeof data.staleAt === 'number' ||
  (data.status === 'counted' && (data.attempts ?? 0) < 3);

/** The summary of a past day, read live while it is shown; a missing, stale or only-counted one is asked of the server once per session, quietly. `undefined` until read, `null` when there is none to show. */
export function useDaySummary(uid: string | null, dayKey: string) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const [read, setRead] = useState<{
    key: string;
    summary: OpenDaySummary | null;
  } | null>(null);
  const key = `${uid ?? ''}|${dayKey}`;
  const isReady = uid !== null && keyStatus === 'ready';

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
        if (isDue(data) && navigator.onLine && !asked.has(mark)) {
          asked.add(mark);
          writeHelmDaySummaryCallable({ dayKey }).catch((error: unknown) =>
            console.warn('Helm day summary was not written', error),
          );
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
  }, [uid, isReady, dayKey, key]);

  return read?.key === key ? read.summary : undefined;
}
