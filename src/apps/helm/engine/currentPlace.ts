import type { HelmProfile } from '@apps/helm/types';

export const CURRENT_PLACE_MS = 3 * 60 * 60 * 1000;

/** The place the person said they are at, while that still holds: said under three hours ago and the place still exists. */
export const readCurrentPlace = <T extends { id: string }>(
  profile: Pick<HelmProfile, 'currentPlace'>,
  places: T[],
  now: number,
): T | null => {
  const { currentPlace } = profile;
  if (!currentPlace || now - currentPlace.saidAt >= CURRENT_PLACE_MS) {
    return null;
  }
  return places.find((place) => place.id === currentPlace.placeId) ?? null;
};

/** When a place said at `saidAt` stops holding. */
export const getCurrentPlaceEndsAt = (saidAt: number) =>
  saidAt + CURRENT_PLACE_MS;
