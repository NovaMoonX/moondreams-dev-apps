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
  /** The theater new showings default to; null for none. Documents written before theaters existed lack the key. */
  favoriteTheatreId: string | null;
  /** Immutable; its presence is what "Setup is done" means. */
  setupCompletedAt: number;
  createdAt: number;
  lastEditedAt: number;
}

export type AListTab = 'dashboard' | 'calendar' | 'watchlist';

export type AmcFormat =
  'STANDARD' | 'DOLBY_CINEMA' | 'IMAX' | 'PRIME' | 'REALD_3D' | 'LASER';
export type WatchPriority = 'MUST_SEE' | 'WANT_TO_SEE' | 'IF_I_HAVE_TIME';
export type ViewingStatus = 'PLANNED' | 'SEEN';
export type WatchlistFilter = 'opening' | WatchPriority | 'seen';
export type TicketEntryMode = 'ITEMIZED' | 'ALL_IN';

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
  /** Provider-namespaced id, e.g. "tmdb-438631", "imdb-tt0133093". */
  movieKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

export type AListOverlay =
  /** `quick` is the trailers loop: one tap saves a result with the default priority and the search stays open. */
  | { kind: 'add'; destination: 'watchlist'; mode?: 'quick' }
  /** `date` is a local "YYYY-MM-DD" the date field starts on. */
  /** `past` is the backfill loop: "Add + another" keeps the drawer open for the next movie. */
  | {
      kind: 'add';
      destination: 'calendar';
      date: string;
      mode: 'single' | 'past';
    }
  | { kind: 'day'; dayKey: string }
  | { kind: 'viewing'; id: string }
  | { kind: 'watchlistItem'; movieKey: string }
  | { kind: 'tickets'; view: 'paid' | 'unpriced' }
  | { kind: 'theaters' }
  | { kind: 'membership' };

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

export interface Viewing {
  id: string;
  /** Immutable; to change the movie, remove the viewing and add another. */
  movieKey: string;
  /** Copied at creation and never refreshed, so a viewing outlives its watchlist item. */
  movie: MovieSnapshot;
  /** Instant: when the showing starts. */
  showtimeAt: number;
  /** Instant: showtime + previews + runtime; recomputed whenever the showtime changes. */
  endsAt: number;
  /** PLANNED → SEEN; never back. */
  status: ViewingStatus;
  /** null until "Mark paid" or "Yes, I paid" in the add form. Documents written before tickets existed lack the key. */
  ticket: Ticket | null;
  /** Copied when the theater is picked, so a showing outlives a removed theater. Documents written before theaters existed lack the key. */
  theatre: TheatreSnapshot | null;
  /** 0.5–5 stars in half steps, only once seen. Older documents hold whole stars, and those written before ratings existed lack the key. */
  rating: number | null;
  /** The pending push that nudges them to add trailers once the showing starts. Documents written before it existed lack the key. */
  trailerReminderId: string | null;
  createdAt: number;
  lastEditedAt: number;
}

/** What a non-member would have paid. Always `totalCents = priceCents + feeAvoidedCents + taxCents`. */
export interface Ticket {
  /** How the member entered it; reopening the form restores this mode. */
  entryMode: TicketEntryMode;
  format: AmcFormat;
  /** Before tax. Exact when itemized; estimated from the total when all-in. */
  priceCents: number;
  /** A Standard ticket for the same showing, before tax; null for a Standard ticket or when unknown. */
  standardPriceCents: number | null;
  /** The convenience fee a non-member would have paid; members pay none. */
  feeAvoidedCents: number;
  /** The rate chosen on this ticket; null when none was chosen. */
  taxRate: number | null;
  taxCents: number;
  /** Exact as entered when all-in. */
  totalCents: number;
}

export interface TheatreSnapshot {
  theatreId: string;
  name: string;
  city: string | null;
  state: string | null;
}

/** A theater the member goes to; the document id is `theatreId`. */
export interface AListTheatre {
  /** Equals the document id; immutable. */
  theatreId: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: number;
  lastEditedAt: number;
}

/** A theater before it is saved. */
export type TheatreDraft = Omit<AListTheatre, 'createdAt' | 'lastEditedAt'>;
