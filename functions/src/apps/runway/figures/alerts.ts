import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

import { getNextMorning } from '../../../notifications/bundledPush.js';
import { getLocalClock } from '../../../notifications/localClock.js';
import { isQuietHour } from '../../../notifications/pushBudget.js';
import {
  sendPushReport,
  toAppUrl,
  type PushContent,
  type PushReport,
} from '../../../notifications/sendPush.js';
import {
  ALERT_HOLD_MAX_MS,
  getAlertFigure,
  getAlertLineCents,
  getEachTimeCents,
  MAX_ALERTS,
  stepAlert,
  type AlertState,
} from '../engine/alerts.js';
import type { Balances } from '../engine/balances.js';
import { resolveEnvelopes } from '../engine/figures.js';
import {
  alertBody,
  alertPath,
  RUNWAY_PUSH_TITLE,
} from '../notificationText.js';
import { openWithKey, type SealedPayload } from '../planKey.js';
import type {
  AlertDoc,
  AlertSealed,
  AlertStateDoc,
  OpenVersion,
  PlanItemDoc,
} from '../runwayTypes.js';

export type SendAlertPush = (
  uids: string[],
  content: PushContent,
) => Promise<PushReport>;

export interface AlertRun {
  uid: string;
  /** The plan's data key. */
  key: Buffer;
  balances: Balances;
  items: readonly PlanItemDoc[];
  versions: readonly OpenVersion[];
  today: number;
  zone: string;
  now: number;
}

interface Evaluated {
  id: string;
  alert: AlertSealed;
  /** The envelope's name, for a push that carries it. */
  envelope: string | null;
  previous: AlertStateDoc | null;
  state: AlertState;
  fires: boolean;
}

const hashOf = (uid: string) =>
  createHash('sha256').update(uid).digest('hex').slice(0, 12);

const toState = (
  id: string,
  state: AlertState,
  now: number,
): AlertStateDoc => ({
  id,
  alertUpdatedAt: state.alertUpdatedAt,
  isBelow: state.isBelow,
  lastFiredAt: state.lastFiredAt,
  heldSince: state.heldSince,
  updatedAt: now,
});

const isSame = (previous: AlertStateDoc | null, state: AlertState) =>
  previous !== null &&
  isDeepStrictEqual(
    [
      previous.alertUpdatedAt,
      previous.isBelow,
      previous.lastFiredAt,
      previous.heldSince,
    ],
    [state.alertUpdatedAt, state.isBelow, state.lastFiredAt, state.heldSince],
  );

const isCents = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

/** The rules check no shape, so an alert is used only when what it opens to is one the app writes. */
function isAlertShape(value: unknown): value is AlertSealed {
  const alert = value as Partial<AlertSealed> | null;
  const target = alert?.target;
  const line = alert?.line;
  const isTarget =
    target?.kind === 'freeToSpend' ||
    (target?.kind === 'envelope' && typeof target.itemId === 'string');
  const isLine =
    (line?.kind === 'cents' && isCents(line.cents)) ||
    (line?.kind === 'share' && isCents(line.bps));
  return isTarget && isLine && typeof alert?.isNamed === 'boolean';
}

/** An alert that will not open, or opens to a shape the app never writes, is skipped, and its state left alone. */
function openAlert(key: Buffer, doc: AlertDoc): AlertSealed | null {
  if (!isCents(doc.updatedAt)) return null;
  try {
    const opened: unknown = openWithKey(key, doc.sealed as SealedPayload);
    return isAlertShape(opened) ? opened : null;
  } catch {
    return null;
  }
}

const defaultSend =
  (firestore: Firestore): SendAlertPush =>
  (uids, content) =>
    sendPushReport(firestore, getMessaging(), uids, content);

/** One push for everything that went off; a send that throws or reaches no device that was good counts as failed. */
async function sendOnce(
  send: SendAlertPush,
  uid: string,
  fired: {
    isFreeToSpend: boolean;
    itemId: string | null;
    envelope: string | null;
  }[],
): Promise<'none' | 'sent' | 'failed'> {
  if (fired.length === 0) return 'none';
  const url = toAppUrl(alertPath(fired));
  if (url === null) return 'failed';
  try {
    const report = await send([uid], {
      title: RUNWAY_PUSH_TITLE,
      body: alertBody(fired),
      url,
    });
    return report.isFailure ? 'failed' : 'sent';
  } catch {
    return 'failed';
  }
}

/**
 * Judges the plan's alerts against the figures just written: an alert goes off when its figure falls to or below its
 * line from above, one push carries every alert that went off, and one that goes off in quiet hours is held for 08:00.
 * Returns when to run again for a held alert, or null.
 */
export async function runAlerts(
  firestore: Firestore,
  run: AlertRun,
  send: SendAlertPush = defaultSend(firestore),
): Promise<number | null> {
  const { uid, now } = run;
  const under = (name: string) =>
    firestore.collection(`apps/runway/plans/${uid}/${name}`);
  const alertDocs = await under('alerts').limit(MAX_ALERTS).get();
  const stateDocs = await under('alertStates').limit(MAX_ALERTS * 2).get();
  if (alertDocs.empty && stateDocs.empty) return null;
  const states = new Map(
    stateDocs.docs.map((entry) => [entry.id, entry.data() as AlertStateDoc]),
  );

  const live = resolveEnvelopes(run.items, run.versions, run.today);
  const liveIds = new Set(live.map(({ item }) => item.id));
  const evaluated = alertDocs.docs.flatMap((entry): Evaluated[] => {
    const doc = entry.data() as AlertDoc;
    const alert = openAlert(run.key, doc);
    if (alert === null) return [];
    const target = alert.target;
    const envelope =
      target.kind === 'envelope'
        ? (live.find(({ item }) => item.id === target.itemId)?.version
            .payload ?? null)
        : null;
    const figure = getAlertFigure(target, run.balances, liveIds);
    const line = getAlertLineCents(
      alert.line,
      envelope === null ? null : getEachTimeCents(envelope),
    );
    if (figure === null || line === null) return [];
    const stored = states.get(entry.id) ?? null;
    const isStale =
      stored?.heldSince != null && now - stored.heldSince > ALERT_HOLD_MAX_MS;
    const previous =
      stored === null || !isStale ? stored : { ...stored, heldSince: null };
    const stepped = stepAlert(previous, doc.updatedAt, figure, line, now);
    return [
      {
        id: entry.id,
        alert,
        envelope: envelope?.name ?? null,
        previous: stored,
        fires: stepped.fires,
        state: stepped.state,
      },
    ];
  });

  const isQuiet = isQuietHour(getLocalClock(now, run.zone).hour);
  const held = (entry: Evaluated) =>
    entry.state.isBelow && entry.state.heldSince !== null;
  const heldNow = evaluated.map((entry) =>
    isQuiet && entry.fires
      ? { ...entry, state: { ...entry.state, heldSince: now } }
      : entry,
  );
  const toSend = isQuiet
    ? []
    : heldNow
        .filter((entry) => entry.fires || held(entry))
        .map((entry) => ({
          ...entry,
          state: { ...entry.state, heldSince: entry.state.heldSince ?? now },
        }));
  const sendIds = new Set(toSend.map((entry) => entry.id));
  const before = heldNow.map(
    (entry) => toSend.find(({ id }) => id === entry.id) ?? entry,
  );

  const gone = [...states.keys()].filter(
    (id) => !alertDocs.docs.some((entry) => entry.id === id),
  );
  const batch = firestore.batch();
  before
    .filter((entry) => !isSame(entry.previous, entry.state))
    .forEach((entry) =>
      batch.set(
        under('alertStates').doc(entry.id),
        toState(entry.id, entry.state, now),
      ),
    );
  gone.forEach((id) => batch.delete(under('alertStates').doc(id)));
  await batch.commit();

  const outcome = await sendOnce(
    send,
    uid,
    toSend.map((entry) => ({
      isFreeToSpend: entry.alert.target.kind === 'freeToSpend',
      itemId:
        entry.alert.target.kind === 'envelope'
          ? entry.alert.target.itemId
          : null,
      envelope: entry.alert.isNamed ? entry.envelope : null,
    })),
  );

  // A clear that fails after a good send leaves the alert held, so the next run may send it again: once too often, never lost.
  const cleared = firestore.batch();
  toSend.forEach((entry) =>
    cleared.set(
      under('alertStates').doc(entry.id),
      { heldSince: null, updatedAt: now },
      { merge: true },
    ),
  );
  const isCleared =
    outcome !== 'sent' ||
    (await cleared.commit().then(
      () => true,
      () => false,
    ));

  const stillHeld = before.filter(
    (entry) => held(entry) && !(outcome === 'sent' && sendIds.has(entry.id)),
  );
  logger.info('runway.alerts.run', {
    uidHash: hashOf(uid),
    alerts: alertDocs.size,
    fired: evaluated.filter((entry) => entry.fires).length,
    sent: outcome === 'sent' ? toSend.length : 0,
    failed: outcome === 'failed',
    clearFailed: !isCleared,
    skipped: alertDocs.size - evaluated.length,
    held: stillHeld.length,
  });
  return stillHeld.length === 0 ? null : getNextMorning(now, run.zone);
}
