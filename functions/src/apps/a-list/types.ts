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

export interface PopularMovie extends MovieSearchResult {
  /** Date-only (UTC midnight) when the film opens in the future; null once it is in theaters. */
  opensOn: number | null;
  /** https link to the film's trailer on YouTube; null when the provider has none. */
  trailerUrl: string | null;
  /** The film's synopsis, trimmed; null when the provider has none. */
  overview: string | null;
  /** Up to three genre names, most prominent first. */
  genres: string[];
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

export type TicketPriceKind = 'ADULT' | 'SENIOR' | 'CHILD';

/** AMC's list price for each kind of ticket, before tax and fees; null when AMC lists none. */
export type TicketPrices = Record<TicketPriceKind, number | null>;

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
  /** The list price of every kind of ticket AMC lists; `priceCents` is the adult one. */
  prices: TicketPrices;
  /** The nearest Standard showing's price of every kind, for a premium showing; all null otherwise. */
  standardPrices: TicketPrices;
  /** The sales tax AMC lists on one ticket of each kind; null when AMC lists none. */
  taxes: TicketPrices;
  /** https link to buy this showing on amctheatres.com. */
  purchaseUrl: string;
  isSoldOut: boolean;
}
