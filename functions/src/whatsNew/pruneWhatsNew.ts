import { getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (getApps().length === 0) {
  initializeApp();
}

// Mirrors the site's retention window; functions can't import from the site's code.
const RETENTION_DAYS = 183;

/** Removes What's new notes older than the retention window from the feed, weekly. */
export const pruneWhatsNew = onSchedule(
  { schedule: '23 6 * * 1', timeZone: 'UTC', timeoutSeconds: 120 },
  async () => {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const ref = getDatabase().ref('whatsNew/notes');
    const notes = ((await ref.get()).val() ?? {}) as Record<
      string,
      { publishedAt?: number }
    >;
    const expired = Object.keys(notes).filter(
      (id) => (notes[id]?.publishedAt ?? Infinity) < cutoff,
    );
    if (expired.length > 0) {
      await ref.update(Object.fromEntries(expired.map((id) => [id, null])));
    }
    logger.info("What's new pruned", {
      removed: expired.length,
      kept: Object.keys(notes).length - expired.length,
    });
  },
);
