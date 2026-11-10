import { toKnownZone } from './spoken.js';
import type { Effect, EffectRef } from './executeCommands.js';

const CURRENT_PLACE_MS = 3 * 60 * 60 * 1000;

export const NO_HOME_LINE = 'No place is set as home yet.';

export interface CurrentPlace {
  placeId: string;
  saidAt: number;
}

const formatClock = (at: number, timeZone: string) =>
  new Date(at).toLocaleTimeString('en-US', {
    timeZone: toKnownZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
  });

/** "You're home until 6:40 PM", in the person's zone. */
export const buildHomeLine = (saidAt: number, timeZone: string) =>
  `You're home until ${formatClock(saidAt + CURRENT_PLACE_MS, timeZone)}`;

export interface HomePlan {
  /** The profile fields to write. */
  data: { currentPlace: CurrentPlace; lastEditedAt: number };
  ref: EffectRef;
  effect: Effect;
  line: string;
}

/** What "I'm home" writes: the profile's `currentPlace` and one effect holding the previous value, so Undo puts it back. Null when the person has no home place. */
export function planSetCurrentPlace(input: {
  profileId: string;
  home: { id: string; name: string } | null;
  previous: CurrentPlace | null;
  now: number;
  timeZone: string;
}): HomePlan | null {
  const { home, previous, now } = input;
  if (!home) return null;
  const currentPlace = { placeId: home.id, saidAt: now };
  const title = { 'sealed.title': home.name };
  return {
    data: { currentPlace, lastEditedAt: now },
    ref: { op: 'update', collection: 'profile', docId: input.profileId },
    effect: {
      written: { currentPlace, ...title },
      previous: { currentPlace: previous, ...title },
    },
    line: buildHomeLine(now, input.timeZone),
  };
}
