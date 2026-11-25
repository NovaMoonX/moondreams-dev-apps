import type {
  AlertLine,
  AlertTarget,
  Cents,
  EnvelopeVersion,
} from '@apps/runway/types';

import { getFreeToSpendFigure, type Balances } from './balances';
import { withExtras } from './parts';

/** The quick shares an envelope's alert offers, in basis points of what it gets each time. */
export const ALERT_SHARE_BPS = { half: 5_000, quarter: 2_500 } as const;

/** The most alerts a plan keeps: the app stops offering more, and the server reads no further. */
export const MAX_ALERTS = 50;

/** An alert held overnight older than this went off for a moment long past, so it is dropped rather than sent. */
export const ALERT_HOLD_MAX_MS = 24 * 60 * 60 * 1000;

/** What an envelope gets each time when that is a set amount; a share of a pay or "the rest" has no fixed figure, so it has no share lines. */
export function getEachTimeCents(
  envelope: EnvelopeVersion['payload'],
): Cents | null {
  const { amount } = withExtras(envelope);
  return amount.kind === 'exact' ? amount.cents : null;
}

/** The line in cents, or null when it is a share of an envelope with no set amount. */
export function getAlertLineCents(
  line: AlertLine,
  eachTimeCents: Cents | null,
): Cents | null {
  if (line.kind === 'cents') return line.cents;
  if (eachTimeCents === null) return null;
  return Math.round((eachTimeCents * line.bps) / 10_000);
}

/** The figure an alert watches, or null when it isn't known (Free to Spend not started) or its envelope isn't in the plan today. Over-assigned reads as below zero. */
export function getAlertFigure(
  target: AlertTarget,
  balances: Balances,
  liveEnvelopeIds: ReadonlySet<string>,
): Cents | null {
  if (target.kind === 'envelope') {
    if (!liveEnvelopeIds.has(target.itemId)) return null;
    return balances.assignedByItem[target.itemId] ?? 0;
  }
  const figure = getFreeToSpendFigure(balances);
  if (figure.kind === 'unknown') return null;
  return figure.kind === 'over' ? -figure.cents : figure.cents;
}

export interface AlertState {
  alertUpdatedAt: number;
  isBelow: boolean;
  lastFiredAt: number | null;
  heldSince: number | null;
}

/** An alert's next state: it goes off when the figure falls to or below its line from above, and rearms once the figure is back above. A new or changed alert takes where things stand without going off, and a held alert whose figure recovers is dropped. */
export function stepAlert(
  previous: AlertState | null,
  alertUpdatedAt: number,
  figure: Cents,
  lineCents: Cents,
  now: number,
): { state: AlertState; fires: boolean } {
  const isBelow = figure <= lineCents;
  if (previous === null || previous.alertUpdatedAt !== alertUpdatedAt) {
    return {
      state: {
        alertUpdatedAt,
        isBelow,
        lastFiredAt: previous?.lastFiredAt ?? null,
        heldSince: null,
      },
      fires: false,
    };
  }
  if (!isBelow) {
    return { state: { ...previous, isBelow, heldSince: null }, fires: false };
  }
  if (previous.isBelow) return { state: previous, fires: false };
  return { state: { ...previous, isBelow, lastFiredAt: now }, fires: true };
}
