import { formatCentsShort } from '@/utils/moneyUtils';
import type { StatusView } from '@apps/going-once/utils/status';
import { formatCollected } from '@apps/going-once/utils/status';
import { isListable } from '@apps/going-once/utils/listing';
import type { Item } from '@apps/going-once/types';

export interface StatusFigures {
  /** Available counts only what buyers can be shown; the rest wait behind "not listed yet". */
  count: number;
  askedCents: number;
  collectedCents: number;
  /** Available things buyers can't be shown yet; they are in no figure above. */
  notListedCount: number;
}

export type StatusSummary = Record<StatusView, StatusFigures>;

/** Counts and sums for the three views in one pass, for the switch's pills and every total; taken-off things are in none of them. */
export function getStatusSummary(items: Item[]): StatusSummary {
  const empty = (): StatusFigures => ({
    count: 0,
    askedCents: 0,
    collectedCents: 0,
    notListedCount: 0,
  });
  const summary: StatusSummary = {
    AVAILABLE: empty(),
    PENDING: empty(),
    SOLD: empty(),
  };
  items.forEach((item) => {
    if (item.status === 'WITHDRAWN') return;
    const figures = summary[item.status];
    if (item.status === 'AVAILABLE' && !isListable(item)) {
      figures.notListedCount += 1;
      return;
    }
    figures.count += 1;
    figures.askedCents += item.askingPriceCents ?? 0;
    figures.collectedCents += item.sale?.priceCents ?? 0;
  });
  return summary;
}

/** The line under a view's rows: "$800 asked · plus 1 not listed yet", "Collected $225 of $245 asked". */
export function formatStatusTotal(
  view: StatusView,
  summary: StatusSummary,
): string {
  const { askedCents, collectedCents, notListedCount } = summary[view];
  if (view === 'SOLD') return formatCollected(collectedCents, askedCents);
  const asked = `${formatCentsShort(askedCents)} asked`;
  if (notListedCount === 0) return asked;
  return `${asked} · plus ${notListedCount} not listed yet`;
}
