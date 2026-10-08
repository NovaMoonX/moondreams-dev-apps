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

export type AmcFormat = 'STANDARD' | 'DOLBY_CINEMA' | 'IMAX' | 'PRIME' | 'REALD_3D' | 'LASER';

export interface ShowtimeOption {
  /** AMC's showtime id. */
  showtimeId: string;
  /** Instant: when the showing starts. */
  startsAt: number;
  format: AmcFormat;
  /** The adult ticket price before tax and fees; null when AMC lists none. */
  priceCents: number | null;
  /** The cheapest Standard showing of the same movie that day, for a premium showing; null otherwise or when there is none. */
  standardPriceCents: number | null;
  /** https link to buy this showing on amctheatres.com. */
  purchaseUrl: string;
  isSoldOut: boolean;
}
