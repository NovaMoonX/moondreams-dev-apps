import { ALERT_WORDS } from '@apps/runway/constants';
import { ALERT_SHARE_BPS, getAlertLineCents } from '@apps/runway/engine/alerts';
import type { AlertLine, Cents, OpenAlert } from '@apps/runway/types';
import { formatCents } from '@/utils/moneyUtils';

export interface AlertEntry {
  alert: OpenAlert;
  /** Null when the alert is a share of an envelope that no longer gets a set amount. */
  lineCents: Cents | null;
}

const toPercent = (bps: number) => Math.round(bps / 100);

/** The alert's line in words, unmasked: "Half left · $150", "Runs out", "Below $50". */
export function getAlertTitle(line: AlertLine, lineCents: Cents | null) {
  if (line.kind === 'cents') {
    return line.cents === 0
      ? ALERT_WORDS.runsOut
      : ALERT_WORDS.below(formatCents(line.cents));
  }
  const title =
    line.bps === ALERT_SHARE_BPS.half
      ? ALERT_WORDS.half
      : line.bps === ALERT_SHARE_BPS.quarter
        ? ALERT_WORDS.quarter
        : ALERT_WORDS.shareLeft(toPercent(line.bps));
  return lineCents === null
    ? title
    : ALERT_WORDS.withAmount(title, formatCents(lineCents));
}

/** The line as it ends "next …" in the Alerts row. */
function getNextPhrase(line: AlertLine) {
  if (line.kind === 'cents') {
    return line.cents === 0
      ? ALERT_WORDS.nextRunsOut
      : ALERT_WORDS.nextAmount(formatCents(line.cents));
  }
  return line.bps === ALERT_SHARE_BPS.half
    ? ALERT_WORDS.nextHalf
    : line.bps === ALERT_SHARE_BPS.quarter
      ? ALERT_WORDS.nextQuarter
      : ALERT_WORDS.nextShare(toPercent(line.bps));
}

/** Alerts with their lines worked out, highest line first (an unresolved share last), the older first on a tie. */
export const toAlertEntries = (
  alerts: readonly OpenAlert[],
  eachTimeCents: Cents | null,
): AlertEntry[] =>
  alerts
    .map((alert) => ({
      alert,
      lineCents: getAlertLineCents(alert.line, eachTimeCents),
    }))
    .sort(
      (a, b) =>
        (b.lineCents ?? -Infinity) - (a.lineCents ?? -Infinity) ||
        a.alert.createdAt - b.alert.createdAt ||
        a.alert.id.localeCompare(b.alert.id),
    );

/** Whether the figure has fallen to or past the alert's line. */
export const isPassed = (lineCents: Cents | null, figure: Cents | null) =>
  lineCents !== null && figure !== null && figure <= lineCents;

/** The key an alert's deferred removal hides it by. */
export const toAlertRemovalKey = (alertId: string) =>
  `runway-alert-removal:${alertId}`;

/** "3 alerts · next at half left": the next is the highest line the figure has not yet reached. */
export function getAlertsSummary(
  entries: readonly AlertEntry[],
  figure: Cents | null,
) {
  if (entries.length === 0) return ALERT_WORDS.rowEmpty;
  const count = ALERT_WORDS.rowCount(entries.length);
  const next = entries.find(
    ({ lineCents }) => lineCents !== null && !isPassed(lineCents, figure),
  );
  return next
    ? ALERT_WORDS.rowNext(count, getNextPhrase(next.alert.line))
    : count;
}
