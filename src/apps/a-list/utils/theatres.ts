import { generateUuid } from '@/utils/idUtils';
import type { TheatreDraft, TheatreSnapshot } from '@apps/a-list/types';

interface TheatreLike {
  city: string | null;
  state: string | null;
}

/** "Overland Park, KS", or whatever part is known. */
export function formatTheatreLocation(theatre: TheatreLike): string {
  const result = [theatre.city, theatre.state].filter(Boolean).join(', ');
  return result;
}

/** The few fields a showing keeps, so it outlives a removed theater. */
export function toTheatreSnapshot(theatre: TheatreSnapshot): TheatreSnapshot {
  return {
    theatreId: theatre.theatreId,
    name: theatre.name,
    city: theatre.city ?? null,
    state: theatre.state ?? null,
    timeZone: theatre.timeZone ?? null,
  };
}

/** A theater the member typed in by name. */
export function createTypedTheatre(name: string): TheatreDraft {
  return {
    theatreId: `manual-${generateUuid()}`,
    name: name.trim(),
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    timeZone: null,
  };
}

/** True for a theater typed in by name, which AMC has no record of. */
export function isTypedTheatre(theatre: { theatreId: string }): boolean {
  const result = theatre.theatreId.startsWith('manual-');
  return result;
}
