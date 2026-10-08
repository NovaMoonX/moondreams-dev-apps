export interface MovieSnapshot {
  title: string;
  /** Date-only (UTC midnight): the release date; null if unknown. */
  releaseDate: number | null;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  contentRating: string | null;
}

export interface MovieSearchResult {
  movieKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

export interface TheatreResult {
  /** AMC's theatre number, as digits. */
  theatreId: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** IANA zone like "America/Chicago"; null when AMC didn't say or it isn't a real zone. */
  timeZone: string | null;
  /** From the searched point; null when AMC didn't say. */
  distanceMiles: number | null;
}
