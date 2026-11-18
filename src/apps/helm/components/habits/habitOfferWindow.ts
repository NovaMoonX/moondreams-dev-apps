import type { OpenHabit } from '@apps/helm/types';

/** How long after a habit is made the offer stays; after that the row on its page is the way in. */
const OFFER_WINDOW_MS = 15 * 60_000;

/** True while the habit is new enough that the offer, not the Reminders row's own opt-in, is what the page shows. */
export const isInOfferWindow = (
  habit: Pick<OpenHabit, 'createdAt'>,
  now: number,
) => now - habit.createdAt < OFFER_WINDOW_MS;
