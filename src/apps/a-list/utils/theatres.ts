import type { TheatreSnapshot } from '@apps/a-list/types';

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
  };
}
