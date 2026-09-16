import type { LitterBox, LitterEntry, Preventive, Vaccination, Visit } from '../types';

export const DUE_SOON_WINDOW_MS = 7 * 86_400_000;
export const LITTER_OVERDUE_DAYS = 30;

export type AttentionSeverity = 'now' | 'soon';

export type AttentionItem =
  | { kind: 'visit'; id: string; severity: AttentionSeverity; visitId: string; catIds: string[]; scheduledAt: number }
  | { kind: 'litter'; id: string; severity: AttentionSeverity; litterBoxId: string; daysSinceChange: number | null }
  | { kind: 'vaccination'; id: string; severity: AttentionSeverity; vaccinationId: string; catId: string; expiresAt: number }
  | { kind: 'preventive'; id: string; severity: AttentionSeverity; preventiveId: string; catIds: string[]; expiresAt: number };

export function getDaysSince(timestamp: number, now: number): number {
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}

/** Latest full-change `loggedAt` per litter box id, or `undefined` when a box has never had a full change logged. */
export function getLatestFullChangeByBox(litterEntries: LitterEntry[]): Map<string, number> {
  const latest = new Map<string, number>();

  litterEntries.forEach((entry) => {
    if (!entry.isFullChange) {
      return;
    }

    if ((latest.get(entry.litterBoxId) ?? 0) < entry.loggedAt) {
      latest.set(entry.litterBoxId, entry.loggedAt);
    }
  });

  return latest;
}

interface BuildAttentionItemsInput {
  visits: Visit[];
  vaccinations: Vaccination[];
  preventives: Preventive[];
  litterBoxes: LitterBox[];
  litterEntries: LitterEntry[];
  now: number;
}

export function buildAttentionItems({
  visits,
  vaccinations,
  preventives,
  litterBoxes,
  litterEntries,
  now,
}: BuildAttentionItemsInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const dueSoonBy = now + DUE_SOON_WINDOW_MS;

  visits.forEach((visit) => {
    if (visit.status !== 'upcoming' || visit.scheduledAt > dueSoonBy) {
      return;
    }

    items.push({
      kind: 'visit',
      id: visit.id,
      severity: visit.scheduledAt <= now ? 'now' : 'soon',
      visitId: visit.id,
      catIds: visit.catIds,
      scheduledAt: visit.scheduledAt,
    });
  });

  const latestFullChangeByBox = getLatestFullChangeByBox(litterEntries);

  litterBoxes
    .filter((box) => box.isActive)
    .forEach((box) => {
      const latestChangedAt = latestFullChangeByBox.get(box.id);
      const daysSinceChange = latestChangedAt === undefined ? null : getDaysSince(latestChangedAt, now);

      if (daysSinceChange === null || daysSinceChange >= LITTER_OVERDUE_DAYS - 7) {
        items.push({
          kind: 'litter',
          id: box.id,
          severity: daysSinceChange === null || daysSinceChange >= LITTER_OVERDUE_DAYS ? 'now' : 'soon',
          litterBoxId: box.id,
          daysSinceChange,
        });
      }
    });

  vaccinations.forEach((vaccination) => {
    if (vaccination.expiresAt === null || vaccination.expiresAt > dueSoonBy) {
      return;
    }

    items.push({
      kind: 'vaccination',
      id: vaccination.id,
      severity: vaccination.expiresAt <= now ? 'now' : 'soon',
      vaccinationId: vaccination.id,
      catId: vaccination.catId,
      expiresAt: vaccination.expiresAt,
    });
  });

  preventives.forEach((preventive) => {
    if (preventive.expiresAt === null || preventive.expiresAt > dueSoonBy) {
      return;
    }

    items.push({
      kind: 'preventive',
      id: preventive.id,
      severity: preventive.expiresAt <= now ? 'now' : 'soon',
      preventiveId: preventive.id,
      catIds: preventive.catIds,
      expiresAt: preventive.expiresAt,
    });
  });

  // Smaller = more urgent, on a comparable scale across kinds: a due timestamp sorts sooner-first,
  // while litter (measured in days overdue, not a timestamp) sorts more-overdue-first — a box
  // that's never been logged is the most urgent case, so it sorts ahead of everything else.
  const urgencyRank = (item: AttentionItem): number => {
    switch (item.kind) {
      case 'visit':
        return item.scheduledAt;
      case 'litter':
        return item.daysSinceChange === null ? Number.NEGATIVE_INFINITY : -item.daysSinceChange;
      case 'vaccination':
      case 'preventive':
        return item.expiresAt;
    }
  };

  return items.sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'now' ? -1 : 1;
    }

    return urgencyRank(left) - urgencyRank(right);
  });
}
