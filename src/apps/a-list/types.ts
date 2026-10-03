export interface MembershipProfile {
  /** Equals the document id; immutable. */
  uid: string;
  /** Before tax: what the member typed in Setup. */
  monthlyCostCents: number;
  /** Tax included: the bill total. Equals `monthlyCostCents` when no bill total was given. */
  monthlyTotalCents: number;
  /** Decimal fraction gauged from the bill (0.075 = 7.5%); null when no bill total was given. */
  taxRate: number | null;
  /** Date-only (UTC midnight): the day the membership started. */
  startDate: number;
  weeklyGoal: number | null;
  monthlyGoal: number | null;
  /** Immutable; its presence is what "Setup is done" means. */
  setupCompletedAt: number;
  createdAt: number;
  lastEditedAt: number;
}

export type AListTab = 'dashboard' | 'calendar' | 'watchlist';

export type AmcFormat =
  'STANDARD' | 'DOLBY_CINEMA' | 'IMAX' | 'PRIME' | 'REALD_3D' | 'LASER';
export type WatchPriority = 'MUST_SEE' | 'WANT_TO_SEE' | 'IF_I_HAVE_TIME';

export interface MovieSnapshot {
  title: string;
  /** Date-only (UTC midnight): the US theatrical release date; null if unknown. */
  releaseDate: number | null;
  /** https URL from the provider; null for a manually added movie or when the provider has none. */
  posterUrl: string | null;
  runtimeMinutes: number | null;
  /** "PG-13", "R", …; null if unrated or unknown. */
  contentRating: string | null;
}

export interface MovieSearchResult {
  /** Provider-namespaced id, e.g. "imdb-tt0133093". */
  movieKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

export type AListOverlay = { kind: 'add'; destination: 'watchlist' };

export interface WatchlistItem {
  /** Provider-namespaced id ("imdb-tt0133093"); equals the document id; immutable. */
  movieKey: string;
  movie: MovieSnapshot;
  priority: WatchPriority;
  /** null = no preference. */
  preferredFormat: AmcFormat | null;
  createdAt: number;
  lastEditedAt: number;
}
