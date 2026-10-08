# A-List Tracker — Technical Design Document

Built against this app's `README.md` and `UX.md`, and against the conventions in `.github/copilot-instructions.md` and `CLAUDE.md`. Waypoint's `TECHNICAL.md` is the format reference. A-List is much smaller than Waypoint in one respect: **every byte of data is private to one signed-in member**, apart from the calendar snapshots a member chooses to share by link (Data Schema #5). There is no invite flow, no roles, no pending requests, and so no cross-user concurrency. That removes most of the atomic-write and rule complexity and puts the design weight on three things instead: the money/date math, the calendar read model, and a server-side movie lookup.

## Decisions made in this document

These shape everything below. Each is also listed under [Open questions](#open-questions-for-the-roadmap) where it needs the owner's confirmation.

1. **Money is stored as integer cents** (`priceCents`, not `price`), US dollars only. The app sums many small amounts; integer cents make every total exact and every rule check simple.
2. **Watchlist "Seen" is derived**, never stored: a movie is seen when any of its viewings has `status: 'SEEN'`. Editing or removing a viewing can't leave the watchlist wrong.
3. **A viewing is an instant keyed by the viewer's local day.** The calendar, the counters and the week/month goals all key off `toLocalDateInputValue(showtimeAt)`. Release dates are date-only (UTC midnight).
4. **Savings count what a non-member would have paid: price + convenience fee + tax.** Members pay no convenience fee, so the fee on a ticket is one *avoided*; it counts as value and is also totalled on its own as "fees avoided". (See [Savings and break-even](#5-savings-and-break-even).)
5. **Aggregates are never stored.** Savings, break-even, counters, format splits and chips are all computed from the collections by memoized selectors. A member has on the order of 150 viewings a year, so there is nothing to optimize and nothing to drift.
6. **Movie data comes from TMDB (whenever its key is set) or OMDb, behind two `onCall` functions** that hold the keys. OMDb's free tier allows about 1,000 lookups a day **for the whole app, not per member** (TMDB isn't rationed), so the functions share a server-side cache and a daily budget guard, the browser debounces and caches, and a manual "add by title" path keeps the app usable when the budget is spent. A small **snapshot** of each movie is copied into the watchlist item and each viewing, so the calendar renders with no network.
7. **There is no tax-rate source, so tax behaves like the convenience fee:** the membership's rate is gauged from the bill the member types in Setup (total ÷ cost − 1), and from then on ticket tax is a choice among chips built from the rates used on past tickets, the most-used one preselected. Each ticket stores its own rate and tax amount.
8. **The membership start date is a required Setup field.** It anchors the billing cycle (cost so far and break-even) and is the earliest date a viewing can be given.
9. **The app never tries to learn which formats a movie plays in.** Format is always the member's pick from a fixed list.
10. **A ticket is entered as the three amounts AMC itemizes: price, fee and tax in dollars.** It stores them with `total = price + fee + tax`, and `taxRate = tax ÷ price` for history. The old all-in entry mode was dropped; tickets saved that way keep `entryMode: 'ALL_IN'` and reopen as the same three amounts, and every save writes `'ITEMIZED'`.

---

## Data Schema

Namespace root: `apps/a-list/`

**Per-member private tree.** Everything lives under the member's own document, keyed by their `uid`:

```
apps/a-list/memberships/{uid}                    → MembershipProfile
apps/a-list/memberships/{uid}/watchlist/{movieKey}  → WatchlistItem
apps/a-list/memberships/{uid}/viewings/{viewingId}  → Viewing
```

Why nested under the `uid`, rather than three flat collections with an `ownerUid` field: the rule for every document is the same one-line path check (`request.auth.uid == uid`) with no body check to forget; every listener is a plain collection listener with no `where` and so no composite index; and nothing can leak across members through a mis-scoped query. Why `memberships/{uid}` rather than `users/{uid}`: the global `users` collection holds shared profile data, and an app's private data stays in the app's own namespace.

**Every field is a required key typed `T | null`, never optional.** Absent values are written as explicit `null`; arrays default to `[]`. Timestamps are millisecond numbers.

**Enums and constants** (fixed lists only the developer extends; options arrays are derived from `constants.ts` at render time, never redeclared):

```typescript
export type AmcFormat = 'STANDARD' | 'DOLBY_CINEMA' | 'IMAX' | 'PRIME' | 'REALD_3D' | 'LASER';
export type WatchPriority = 'MUST_SEE' | 'WANT_TO_SEE' | 'IF_I_HAVE_TIME';
export type ViewingStatus = 'PLANNED' | 'SEEN';
export type TicketEntryMode = 'ITEMIZED' | 'ALL_IN';
```

```typescript
// constants.ts (runtime values live here, never in types.ts)
export const AMC_FORMAT_LABELS: Record<AmcFormat, string> = {
  STANDARD: 'Standard', DOLBY_CINEMA: 'Dolby Cinema', IMAX: 'IMAX',
  PRIME: 'PRIME at AMC', REALD_3D: 'RealD 3D', LASER: 'Laser',
};
export const PREMIUM_FORMATS: AmcFormat[] = ['DOLBY_CINEMA', 'IMAX', 'PRIME', 'REALD_3D', 'LASER'];
export const WATCH_PRIORITY_LABELS: Record<WatchPriority, string> = {
  MUST_SEE: 'Must See', WANT_TO_SEE: 'Want to See', IF_I_HAVE_TIME: 'If I Have Time',
};
export const DEFAULT_WATCH_PRIORITY: WatchPriority = 'WANT_TO_SEE';
export const OPENING_WINDOW_DAYS = 7;
export const DEFAULT_RUNTIME_MINUTES = 120;   // when the provider has none
export const PREVIEWS_BUFFER_MINUTES = 20;    // trailers before the feature; end = showtime + previews + runtime
export const WEEK_STARTS_ON = 5;              // Friday: AMC's week turns over when new releases open
export const MAX_FEE_CHIPS = 4;
export const MAX_TAX_CHIPS = 4;
export const MOVIE_SEARCH_MIN_CHARS = 2;
export const MOVIE_DETAILS_STALE_MS = 24 * 60 * 60 * 1000;
```

`PRIME`, `LASER` and the others are the keys in the data; the UI always shows the labels above ("PRIME at AMC", "Laser"). `STANDARD` is a real value so a ticket always has a format; "no preference" on a watchlist item is `null`.

#### 1. Membership Profile

Path: `apps/a-list/memberships/{uid}` (document id is the member's `uid`; one per member)

```typescript
interface MembershipProfile {
  uid: string;                       // equals the document id; immutable
  monthlyCostCents: number;          // before tax — what the member typed in Setup
  monthlyTotalCents: number;         // tax included — the bill total; what "cost incurred" multiplies. Equals monthlyCostCents when no bill total was given
  taxRate: number | null;            // decimal fraction gauged from the bill, 0.075 = 7.5%; null when no bill total was given. Seeds the ticket tax chips
  startDate: number;                 // DATE-ONLY (UTC midnight): the day the membership started; required; anchors the billing cycle
  weeklyGoal: number | null;         // the member's own target, not a rule the app enforces
  monthlyGoal: number | null;
  favoriteTheatreId: string | null;  // the theater new showings default to; one pointer, so there can never be two favorites. Documents written before theaters existed lack the key (readers use `?? null`)
  setupCompletedAt: number;          // instant; its presence is what "Setup is done" means. Immutable
  createdAt: number;
  lastEditedAt: number;
}
```

- **The document is written once, at the end of Setup** (one `writeBatch` with the theaters picked in the last step). Setup's draft lives in component state, so there is never a half-finished membership document, and "no document yet" is exactly "first launch".
- **`startDate` is required and may not be in the future** (the form enforces it). It is the one input the billing math cannot do without, and it is also the lower bound for a viewing's date, enforced in the add and edit forms (not in the rules, which would need a second document read for a convenience check).
- **`monthlyTotalCents` is stored, not recomputed from cost × rate.** The member types the amount on their bill, and the rate is back-computed from it (e.g. `$27.94` on `$25.99` → `0.0750`), so the stored total is the bill's exact number and the stored rate is a rounded derivative. Recomputing the total from the rate would drift by a cent.
- **`taxRate` is only a seed.** There is no free tax-rate source, so nothing is looked up: the rate gauged here becomes one chip on the ticket form, and ticket history (each ticket stores its own `taxRate`) takes over as the default once tickets exist (see Logic §9).
- **Editing from Membership settings** uses a field-scoped `updateDoc` of only the fields the form owns, plus `lastEditedAt`. Two devices editing the same profile at once is the only race here, and last-write-wins on disjoint scalar fields is acceptable.
- **Changing the monthly cost applies to the whole history**: the app holds a single monthly total, not a price history. Supporting a cost that changes over time is a planned later goal (see Logic §4, "Planned later").

#### 2. Watchlist Item

Path: `apps/a-list/memberships/{uid}/watchlist/{movieKey}` — the document id **is** the `movieKey`, so one movie can only ever be on the list once, by construction.

```typescript
interface WatchlistItem {
  movieKey: string;                  // provider-namespaced id, e.g. "imdb-tt0133093", or "manual-<uuid>" for a movie added by title; equals the document id; immutable
  movie: MovieSnapshot;
  priority: WatchPriority;           // defaults to WANT_TO_SEE
  preferredFormat: AmcFormat | null; // null = no preference
  createdAt: number;
  lastEditedAt: number;
}

interface MovieSnapshot {
  title: string;
  releaseDate: number | null;        // DATE-ONLY (UTC midnight): the US theatrical release date; null if unknown
  posterUrl: string | null;          // https URL from the provider; null for a manually added movie or when the provider has none
  runtimeMinutes: number | null;
  contentRating: string | null;      // "PG-13", "R", … ; null if unrated or unknown
}
```

- **No `seen` field.** "Seen", "next planned date" and "latest watched date (×2)" are joined from viewings by `movieKey` in a selector. This also makes the watchlist drawer's "Remove" safe: removing an item doesn't touch its viewings, and the movie simply stops appearing in the list.
- **No `priority` on the viewing**, and no free-text notes in the MVP.
- The `movieKey` string is provider-namespaced on purpose. The `imdb-` and `tmdb-` ids are each provider's own title id (`getMovie` asks whichever issued the key); `manual-` movies come from the "Add it by title" path and have no poster and no refresh. If OMDb's terms turn out not to allow what this design does (see [Movie Data Service](#movie-data-service)), the key format and the snapshot shape survive a provider swap; only the functions change.

#### 3. Viewing

Path: `apps/a-list/memberships/{uid}/viewings/{viewingId}` (client-generated id)

```typescript
interface Viewing {
  id: string;
  movieKey: string;                  // immutable; to change the movie, remove the viewing and add another
  movie: MovieSnapshot;              // copied at creation and never refreshed, so a viewing outlives its watchlist item
  showtimeAt: number;                // INSTANT: when the showing starts
  endsAt: number;                    // INSTANT: showtimeAt + previews buffer + runtime (fallback runtime if null); recomputed whenever showtimeAt changes
  status: ViewingStatus;             // PLANNED → SEEN; never back
  rating: number | null;             // 0.5–5 stars in half steps (older ones are whole stars); only meaningful when SEEN
  ticket: Ticket | null;             // null until "Mark paid" or the add form's "Yes, I paid"
  theatre: TheatreSnapshot | null;   // copied when picked, so a showing outlives a removed theater; documents written before theaters existed lack the key
  trailerReminderId: string | null;  // the pending push (`reminders/{id}`, `TRAILER_REMINDER_DELAY_MINUTES` after showtimeAt); documents written before it existed lack the key
  createdAt: number;
  lastEditedAt: number;
}

interface Ticket {
  entryMode: TicketEntryMode;        // how the member entered it; reopening the ticket form restores this mode
  format: AmcFormat;
  priceCents: number;                // before tax. Exact when ITEMIZED; estimated from the total when ALL_IN
  standardPriceCents: number | null; // what a Standard ticket for this showing costs before tax; null when format is STANDARD, or not known
  feeAvoidedCents: number;           // the convenience fee a non-member would have been charged; members pay none. 0 if unknown/none
  taxRate: number | null;            // the rate chosen on this ticket (a chip or "Other"); feeds the chips; null when none was chosen
  taxCents: number;                  // tax on the price; round(price × taxRate) when ITEMIZED, the remainder when ALL_IN
  totalCents: number;                // priceCents + feeAvoidedCents + taxCents, always. Exact as entered when ALL_IN
}
```

- **Rewatches are just more viewings of the same `movieKey`.** Nothing else is needed.
- **`endsAt` is stored**, not derived, so the Seen prompt and a later reminder (Stretch) work from one number that doesn't move if the provider later changes a runtime. The cost is that editing a showtime must rewrite both fields (it does, in the same `updateDoc`).
- **`status` at creation:** `SEEN` when `endsAt ≤ now`, otherwise `PLANNED`. This refines the UX doc's "a date in the past saves as Seen": a movie that started an hour ago and is still running is still planned.
- **Ticket fields are all required once a ticket exists**, which is why "Mark paid" writes the whole `ticket` object in one `updateDoc` (the form owns the whole object). `ticket: null` is the legitimate state of a back-filled movie with no prices entered yet.
- **Premium savings need `standardPriceCents`.** If a premium ticket has `standardPriceCents: null` the ticket still counts in total savings but contributes nothing to premium savings (and the Dashboard says how many tickets that is).
- **`totalCents` is stored even though it's a sum.** Itemized, it is just `price + fee + tax`; all-in, it is the one exact number the member typed and the other three are derived from it. Storing it lets the rules assert `totalCents == priceCents + feeAvoidedCents + taxCents` for every ticket, so the two entry modes can never disagree.
- **Indexes:** none. Every listener is a whole-collection read; no query filters or orders on the server. `firestore.indexes.json` is unchanged.

#### 4. Theater

Path: `apps/a-list/memberships/{uid}/theatres/{theatreId}` (the document id is `manual-` plus a random id for a theater the member typed, so two devices adding at once never collide; the UI refuses a name already on the list)

```typescript
interface AListTheatre {
  theatreId: string;                 // equals the document id; immutable
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

interface TheatreSnapshot { theatreId: string; name: string; city: string | null; state: string | null }
```

- **Typed, not looked up (for now).** The member types a name; the address, city, state, postal code and coordinates stay `null`, so a theater found through AMC later fits the same document. A viewing keeps a `TheatreSnapshot`, like its movie, so removing a theater never changes a past showing.
- **At most 10 saved theaters** (`MAX_THEATRES`) and **no duplicate names** (compared case-insensitively with spaces collapsed) are enforced in the UI only, so two devices, or a device whose theaters listener failed, can briefly exceed the cap or save the same name twice. Accepted: a duplicate is harmless (two pills) and removable, and a real cap would need a counter on the membership.
- **Two devices can race the favorite** (one removes the last theater while another adds, or the next-in-line theater vanishes mid-removal): the worst outcome is a saved theater with no star, which still works (pills, tagging) and is fixed by tapping a star. Accepted. **Adding the first theater makes it the favorite**, in the same transaction; removing the favorite hands the star to another saved theater in the same transaction (Setup does the same), and unstarring it is the only way to have none. Setting a favorite is a single field write on the membership.
- **Indexes:** none (a whole-collection listener).

#### 5. Calendar share

Path: `apps/a-list/calendarShares/{shareId}` (flat, not under the member's uid: a link has to find its document from the id alone, so `ownerUid` stands in for the nesting)

```typescript
interface CalendarShare {
  id: string;                  // equals the document id and the token in the link; 26 characters, immutable
  ownerUid: string;            // immutable; never sent to a visitor
  startDate: number;           // date-only (UTC midnight): first day included
  endDate: number;             // date-only (UTC midnight): last day included
  pin: string | null;          // 4 characters of A–Z/2–9 (no I or O), or null for an open link
  viewings: SharedViewing[];   // the frozen copy, 1–400 showings
  createdAt: number;
  lastEditedAt: number;
}

interface SharedViewing {
  title: string; posterUrl: string | null; runtimeMinutes: number | null; contentRating: string | null;
  showtimeAt: number; status: 'PLANNED' | 'SEEN'; format: AmcFormat | null; theatreName: string | null;
}
```

- **A snapshot, copied at creation and never refreshed.** Quick ranges are resolved to the member's local days when they tap Create: this/next week run Friday to Thursday (`WEEK_STARTS_ON`, AMC's week, the same one the "Since Friday" counter uses; the form says so under the pills), this/next month are the calendar month. A custom range is two local day keys, up to 366 days, picked by tapping the first and last day on Dreamer UI's range `Calendar` (a second tap on the same day is a single day). A showing is in the range when its local day key falls between the two, the same rule the calendar uses. Nothing is stored for an empty range: Create is disabled.
- **Allowlisted, not spread.** `SharedViewing` copies eight fields from a viewing by name. It has no viewing id, `movieKey`, ticket, price, fee, rating, `trailerReminderId`, theater id, city or state, and the share holds no display name, email or `uid` besides `ownerUid` (which the function strips). `format` is the ticket's format, so it is `null` until a ticket is on record.
- **Visitors never read Firestore.** The rules give only the owner read access. A visitor opens `/a-list/shared/{shareId}`, which calls the `getCalendarShare` callable (no sign-in), which reads the document with the admin SDK, checks the PIN, and returns `{ status: 'ok', calendar }` or `pin_required`, `wrong_pin`, `not_found`. A malformed, unknown or deleted id is `not_found`, so ids can't be probed for which exist. The function rebuilds each showing from the allowlist again, so a field added to a document later (or written by a modified client) can't reach a visitor.
- **The id is the secret.** `generateToken(26)` is 26 characters over 32 symbols (130 bits) from `crypto.getRandomValues`; nothing about the link can be guessed or enumerated, and no listing of shares exists for visitors.
- **The PIN** is `generateToken(4)` uppercased, stored in plain text because the owner has to read it back to send it; only the owner can read the document and the function never returns it. Turning the lock off writes `null`; turning it on writes a fresh PIN, so off-then-on retires the old one. The owner's row shows it as •••• until they tap Show PIN, and "Copy PIN" works while it is hidden. A visitor's box masks what is typed (CSS, not `type=password`, because Dreamer UI's password eye is a submit button and would try to unlock) with its own Show PIN / Hide PIN button, and takes typing or a paste: case and any spaces, dashes or label ("PIN: k7-m2", or a whole message ending in the PIN) are cleaned to the 4 characters, then it is compared in constant time. **There is no attempt limit** (an accepted trade-off: 32^4 is about a million PINs, and a link is already unlisted); add one in the function if a share ever holds something more sensitive.
- **At most 10 shares per member** (`MAX_CALENDAR_SHARES`) is enforced in the client only: the create thunk counts the member's shares on the server (`getCountFromServer`, so a stale tab can't slip past it, and offline fails instead of making a link that doesn't exist yet), and the UI hides "+ New" at 10. A modified client could exceed it; accepted, since it only costs the owner storage.
- **Deleting is the only way to stop sharing** and is immediate (the next open is `not_found`). There is no rename and no re-snapshot: the only edit is the PIN. Create a new link for new plans.
- **Times** are instants shown in the *viewer's* local time, like everywhere in the app, and the page says so ("Times are shown in your time zone"). A friend in another zone sees a shifted showtime and may see a late showing on the next day; storing the sharer's zone to show theirs is a follow-up.
- **Free text is shown as typed.** A title added by hand or a theater name can hold anything the member wrote, and the form's note says so. Poster URLs are kept only when `https` and on the movie providers' image hosts (`image.tmdb.org`, `m.media-amazon.com`), so a modified client can't make the page load an arbitrary image.
- **Link previews** (Cloudflare worker) say only that a movie calendar was shared, whether or not it has a PIN. `noindex` is sent as an `X-Robots-Tag` header by the worker and as a meta tag by the page.
- **The token never reaches presence.** The site shell writes the signed-in person's current path to the world-readable Realtime Database, so `Layout` shortens `/a-list/shared/<id>` to `a-list/shared` first.
- **Indexes:** none (`where('ownerUid', '==', uid)` is a single-field equality query).

#### Derived values (never stored)

| Value | Computed from | Where |
|---|---|---|
| Watchlist "Seen", next planned date, latest watched date, rewatch count | viewings joined on `movieKey` | `selectWatchlistRows` |
| Day → viewings map for the calendar | viewings keyed by local day | `selectViewingsByDay` |
| Movies watched, movies since Friday, goal status | `SEEN` viewings by local day | `selectCounters` |
| Billing cycles elapsed, membership cost incurred | `startDate`, `monthlyTotalCents`, today | `selectSavingsSummary` |
| Total ticket savings, fees avoided, net savings, break-even, premium savings | `SEEN` viewings with tickets | `selectSavingsSummary` |
| Opening tab contents and its count | watchlist release dates, local today | `selectOpeningRows` |
| Convenience-fee chips and tax-rate chips (and the default rate) | distinct `ticket.feeAvoidedCents` and `ticket.taxRate` over viewings, plus the membership's `taxRate` | `selectFeeChips`, `selectTaxRateChips` |
| Pending Seen prompts | `PLANNED` viewings with `endsAt ≤ now` | `selectPendingSeenPrompts` |
| Previews window | the earliest `PLANNED` viewing with `showtimeAt − 10 min ≤ now ≤ showtimeAt + 30 min` (`PREVIEWS_WINDOW_*_MINUTES`) | `selectPreviewsWindowViewing` |
| Format split (count and %), activity over time, rating groups, per-format premium averages (Next Steps) | viewings | `selectDashboardBreakdowns` |

---

## Movie Data Service

### How a lookup works, end to end

This is the one place that ties the pieces together; the sections below hold the reasoning and the provider details.

**Searching** (`MoviePicker` → `searchMovies`)
1. **Browser.** After a pause in typing (450 ms) and at least 2 characters, TanStack Query asks for the search. Its key is the normalized text under `a-list/movies/search/v2`, it is fresh for a day and persisted, so a repeat costs nothing, even offline.
2. **`searchMovies`** (signed-in callers only) trims and lowercases the text and requires 2 to 100 characters.
3. **Which provider** (`pickProvider`): `MOVIE_PROVIDER` if it is set to `tmdb` or `omdb`; otherwise **TMDB whenever `TMDB_API_KEY` is set; otherwise OMDb** (which answers from sample movies in the emulator when no key can be read).
4. **Server cache.** `apps/a-list/searchCache/<hash of provider + version + text>`. If it is under 7 days old the answer returns with no upstream call. The provider is in the key, so TMDB and OMDb never serve each other's results.
5. **On a miss**, OMDb calls are counted against the daily budget (900 for the app, 100 per member, refused with "resting for today" beyond that). TMDB calls are not budgeted.
6. **Fetch.** Page 1, then page 2 only if the provider says there is more (OMDb: over 10 matches; TMDB: more than one page). If page 2 fails, page 1 is still returned.
7. **Shape.** Merge, drop duplicates, sort newest first (OMDb by year, TMDB by release date, so upcoming films lead), keep 20, cache, return `{ movieKey, title, year, posterUrl }`.
8. **Browser.** A result is hidden when it is already on the watchlist, by key or, for the same film saved under the other provider's key, by title and year.

**Opening a movie** (`AddFlow` → `getMovie`)
1. **Which provider:** by the key's prefix, not the current default: `tmdb-` asks TMDB, `imdb-` asks OMDb (`manual-` never reaches the server). A key whose provider has no key configured gets "isn't set up", and the manual path is offered.
2. **Server cache.** `apps/a-list/movieCache/<movieKey>`: 30 days once released, 1 day while unreleased or undated (those dates move).
3. **On a miss** (OMDb budgeted, TMDB not), the provider's details become one snapshot: title, release date (date-only, UTC midnight), poster, runtime, content rating. For TMDB the date is the US theatrical release and the rating is the US certification.
4. **Browser.** The snapshot is copied into the watchlist item or viewing, so the calendar renders with no network. `useRefreshUnreleasedMovies` re-asks for up to 10 unseen, unreleased `imdb-` or `tmdb-` items a day and writes back only what changed.

**Where a failure lands:** no key, or TMDB rejecting its key → "isn't set up"; TMDB's 429, OMDb's 401 (its way of saying the daily limit is spent) or our own budget → "resting for today"; anything else → "unavailable". Each of those leaves the manual "Add it by title" path open.

| Situation | Provider used |
| --- | --- |
| `TMDB_API_KEY` set, no override | TMDB |
| No TMDB key | OMDb |
| `MOVIE_PROVIDER=omdb` or `tmdb` | that one |
| A movie already saved as `imdb-…` | OMDb, whatever the default is |
| A movie already saved as `tmdb-…` | TMDB, whatever the default is |

Code: `functions/src/apps/a-list/` (`searchMovies.ts`, `getMovie.ts`, `movieProvider.ts`, `tmdb.ts`, `omdb.ts`, `movieCache.ts`, `lookupBudget.ts`) and, in the app, `components/add/MoviePicker.tsx`, `queries/movieQueries.ts`, `hooks/useRefreshUnreleasedMovies.ts`.

**The problem:** the app needs search, release dates, runtimes, content ratings and posters from a free source. No free source knows which AMC formats or showtimes exist, and the app never tries to find out (formats and prices stay member-entered).

**Providers: TMDB (primary when `TMDB_API_KEY` is set) and OMDb (the alternative).** TMDB lists unreleased films, which OMDb mostly doesn't; the functions pick it automatically and `MOVIE_PROVIDER` forces one. Search is `GET /3/search/movie` (20 a page; a second page when there is one; merged, newest release first, capped at 20) and details are `GET /3/movie/{id}?append_to_response=release_dates` (US theatrical date, US certification, runtime, `image.tmdb.org` poster). TMDB's terms: free for non-commercial use only, credit line and logo required, cached data under 6 months. Everything below about OMDb still applies to it. **OMDb:** what I confirmed on its site: free keys exist, its content is licensed CC BY-NC 4.0, and a separate high-resolution Poster API exists but is patron-only. What I could **not** confirm from its pages, and am taking from the owner (the 1,000-lookups-a-day free limit) or from memory (everything else), so it is unverified until one real call is made before the mapper is written:

- *Search* (`?s=<title>&type=movie&page=<n>`) returns up to 10 results per page with title, year, an id of the form `tt1234567`, and a poster URL, in no useful order and with no sort option. The function fetches a second page only when `totalResults` is over 10, merges, drops duplicates, sorts newest year first and keeps 20. It carries **no release date and no runtime**, so every field the app needs beyond a title card costs a second call.
- *By id* (`?i=<id>`) returns a release date as text (like `31 Mar 1999`, or `N/A`), a runtime as text (like `136 min`, or `N/A`), a rating (`PG-13`, `Not Rated`, `N/A`) and the poster URL. The mapper treats every `N/A` as `null`.
- **Terms.** CC BY-NC 4.0 is a non-commercial license that requires credit; this is a personal, non-commercial app, so it fits, and the plan is an About row in Membership settings that credits OMDb. Whether OMDb separately allows caching results, or hot-linking its poster images, I could not confirm; both are gated before the movie-data PR merges (see Open questions).
- **What a real response confirms** (the owner's sample by-id response for `tt3896198`): `Released` is `"05 May 2017"`, `Runtime` is `"136 min"`, `Rated` is `"PG-13"`, `Poster` is an `https://m.media-amazon.com/…` URL, and `imdbID` is `tt` plus digits. The mapper (`functions/src/apps/a-list/omdb.ts`) parses exactly these shapes and maps `N/A` (and "Not Rated"/"Unrated" for the rating) to `null`.
- **Search response shape** is corroborated by third-party OMDb client docs (not a live call): `{ Response: "True", Search: [{ Title, Year, imdbID, Type, Poster }], totalResults }`, or `{ Response: "False", Error }` where `Error` is `"Movie not found!"` or `"Too many results."` (a very short query); both errors map to an empty result.
- **Still unverified, because the build sandbox can't reach `omdbapi.com` or the poster host (a pre-merge gate for the owner):** a live search and by-id call, whether OMDb's terms allow caching and hot-linking, and how a spent daily limit is reported (handled as HTTP 401 → `resource-exhausted`). Make one real search and one by-id call after setting the key. Until a key is set, the **local emulator** answers from an OMDb-shaped fixture catalog in the same module (a deployed function never does), so the whole flow runs offline.
- **Release-date accuracy (OMDb).** It isn't clear that OMDb's release date is the *US theatrical* date, or that it carries movies a week from release at all (a live check found it lacks unreleased films such as Vampire Carnival, which is why TMDB is primary). The Opening tab depends on both, so this is a real risk to test early with a few upcoming titles. The mitigation is built in: the manual path takes a release date.

**The budget is the design constraint.** About 1,000 lookups a day for *everyone using the app combined* (the key lives on the server, so it is one shared bucket, not one per member). One lookup is one upstream call, so a search with more than 10 matches costs two. Rough cost: a member adding a movie spends one or two searches (typing pauses) plus one details call, so backfilling ten movies costs on the order of thirty, and a few such sessions in a day could exhaust it. Four layers keep that from happening, cheapest first:

1. **The browser** debounces typing (`useDebouncedValue` with `DEBOUNCE_MS.autocomplete`), searches only from `MOVIE_SEARCH_MIN_CHARS`, never searches an empty box (it shows the watchlist), and remembers results with TanStack Query (persisted, so a repeat is free even offline). Search results never trigger per-result details calls; details are fetched only for the movie actually picked.
2. **A shared server-side cache** (Firestore, written and read only by the functions through the admin SDK; clients have no access): `apps/a-list/searchCache/{key}` and `apps/a-list/movieCache/{movieKey}`, each `{ value, cachedAt }`. Search results live 7 days; details live 30 days for a movie already released and 1 day when the release date is null or in the future (those are the ones that change). A cache hit costs no lookup, and the second member to search for the same movie costs nothing.
3. **A daily budget guard** in the functions: before any upstream call, a transaction increments `apps/a-list/lookupUsage/{yyyy-mm-dd}` (the whole app) and `apps/a-list/lookupUsage/{yyyy-mm-dd}_{uid}` (that member). The call is refused with `resource-exhausted` once the app total reaches 900 (headroom under 1,000, since the provider's own day boundary isn't documented; the guard uses UTC dates) or a member reaches 100. Cache hits are never counted.
4. **A manual path.** When the guard refuses, or a movie isn't in the database, the picker's "Add it by title" link opens `ManualMovieForm`: a title and an optional release date. It builds the snapshot on the client with `movieKey: 'manual-<uuid>'`, no poster (the cover is a title tile) and no runtime (the fallback runtime applies). The picker's message on a refusal is one warm line, not an error.

**Why a proxy and not a direct browser call (as Places does):** an OMDb key is passed as a query parameter, so a key shipped to the browser is a key anyone can take, and the shared cache and budget guard above can only live on the server anyway. A side benefit is privacy: OMDb sees the function's address, never the member's.

**Two callables** (`functions/src/apps/a-list/`, exported from `functions/src/index.ts`):

```typescript
// searchMovies({ query: string })  → { results: MovieSearchResult[] }   (≤ 20, newest year first)
interface MovieSearchResult {
  movieKey: string;                  // "imdb-tt0133093"
  title: string;
  year: number | null;
  posterUrl: string | null;
}

// getMovie({ movieKey: string })   → MovieSnapshot
//   release date and runtime parsed from text; every "N/A" becomes null
```

Both follow the existing callable conventions: reject without `request.auth?.uid`; validate and length-cap input (`query` ≤ 100 characters, `movieKey` matches `^(imdb-tt[0-9]{7,10}|tmdb-[0-9]{1,9})$`); a hard timeout on the upstream call; `maxInstances` capped low. The provider keys are Functions secrets (`TMDB_API_KEY`, `OMDB_API_KEY`) and never appear in a response or a log, **including the upstream URL, since the key is in it**; the query text is not logged. Per `CLAUDE.md`, a newly added `onCall` may need its public-invoker grant (the symptom is a CORS error on the preflight); that step is in the wiring checklist at the end.

**Client queries** (`src/apps/a-list/queries/movieQueries.ts`, `queryOptions` factories; keys include every parameter that changes the result and nothing else):

```typescript
export const movieQueryKeys = {
  all: ['a-list', 'movies'] as const,
  search: (query: string) => [...movieQueryKeys.all, 'search', normalizeString(query)] as const,
  details: (movieKey: string) => [...movieQueryKeys.all, 'details', movieKey] as const,
};
// movieSearchQueryOptions(query):  staleTime DAY_MS,                 meta: { persist: true }
// movieDetailsQueryOptions(key):   staleTime MOVIE_DETAILS_STALE_MS, meta: { persist: true }
```

`persist: true` is right for both: they reach a third party and hold nothing sensitive, so search and a re-opened movie work at the theater with poor signal. There is no tax query: nothing is looked up for tax.

**Posters** load straight from the URL the provider returns (`posterUrl`; `image.tmdb.org` for TMDB) with `referrerPolicy='no-referrer'`. They are small (OMDb's free posters are around 300 px wide), which is fine for a phone cell and soft on a large screen. `FallbackImage` hides itself when an image fails, which is wrong for a calendar cell that has to stay filled, so `PosterCover` is its own small component: `<img loading="lazy">` with an `onError` fallback to a flat tile showing the title. That fallback also makes a hot-linking refusal degrade gracefully instead of breaking the calendar.

**Keeping release dates honest.** The Opening tab is only as right as the stored release date, and studios move dates. A `useRefreshUnreleasedMovies` hook (mounted once in the orchestrator, no listener) takes the *unseen* watchlist items with an `imdb-` or `tmdb-` key (never `manual-`) whose `releaseDate` is null or not yet past (capped at 10 a session, picked by a daily rotation: the eligible items sorted by `movieKey`, starting at offset `(days since epoch × 10) mod count` and wrapping, so every eligible movie is checked within a few days without any stored bookkeeping), and for each calls `queryClient.fetchQuery(movieDetailsQueryOptions(key))`. The query's 24-hour `staleTime` and the server's 1-day cache for unreleased movies mean a device asks at most once a day and the whole app asks its provider at most once a day per movie. If the fresh snapshot differs from the stored one, it writes `{ movie, lastEditedAt }` to that watchlist item with a field-scoped `updateDoc`. Viewings' snapshots are never refreshed.

---

## Theater Data

Theaters are typed by the member for now: no vendor, key, cache or lookup is involved, and nothing about a theater leaves the app. The theaters listener feeds the loading gate but not the fatal load-error screen, so a failure there leaves the Calendar, Dashboard and Watchlist working.

## State Machines & Logic

#### 1. Viewing lifecycle

```
              add (endsAt > now)                         "Seen it" (optionally with stars)
  (none) ───────────────────────────▶ PLANNED ───────────────────────────────────────▶ SEEN
     │                                   │   ▲                                           │
     │  add (endsAt ≤ now)               │   └── edit showtime / ticket (stays PLANNED)  │ edit anything, add/edit ticket,
     └──────────────────────────────────────────────────────────────────────────▶ SEEN   │ edit/clear rating (stays SEEN)
                                         │ "Didn't go" (destructive confirm)
                                         ▼
                                      (removed)         any state ── Remove (destructive confirm) ──▶ (removed)
```

What the member sees in each state (all derived from `status`, `showtimeAt`, `endsAt` and `now`; this is the UX table, made precise):

| Stored | Derived | Shown as |
|---|---|---|
| `PLANNED` | `now < endsAt` | an ordinary row (covers "not started" and "in progress") |
| `PLANNED` | `now ≥ endsAt` | "Did you catch it?" chip; joins the Seen-prompt queue |
| `SEEN` | — | stars if rated; counts toward every counter |

- **A viewing never goes from `SEEN` back to `PLANNED`.** Editing a seen viewing's date is allowed only to a time that has already started; the form validates it and the rules enforce it with the server's clock (`showtimeAt ≤ request.time`).
- **"Didn't go"** deletes the viewing. The movie stays on the watchlist and its "Seen" is derived, so it is unseen again.
- **Editing a showtime** recomputes `endsAt`. If the viewing is `PLANNED` it stays so, even if the new time is in the past and has ended; it then simply joins the prompt queue, which is the honest outcome.
- **Marking seen** writes `{ status: 'SEEN', rating, lastEditedAt }` with a field-scoped `updateDoc`. It assigns literal values to disjoint scalar fields, so it needs no transaction; two devices answering the same prompt write the same thing.

#### 2. Local-day keys (the calendar's only time model)

A viewing is an instant, and everything on the calendar asks "which day?" in the **viewer's local timezone**. One tiny utility owns it:

```typescript
getDayKey(timestamp: number): string // = toLocalDateInputValue(timestamp), "YYYY-MM-DD"
```

- `selectViewingsByDay` builds `Record<dayKey, Viewing[]>`, each day sorted by `showtimeAt` ascending (the order covers are cut in).
- The Calendar's `renderCell(date, …)` receives a `Date` for the cell; the key for it is `getDayKey(date.getTime())`. **To verify in the first calendar PR:** that Dreamer UI hands each cell a local-midnight `Date`. If it doesn't (for example it hands UTC midnight), key the cell from the calendar date the component means, read with the matching getters (`toDateInputValue` for a UTC-midnight `Date`); never round-trip it through `fromDateInputValue` and then a local read, which lands a day early west of UTC.
- Day keys compare correctly as strings (`'2026-10-03' < '2026-10-04'`), so week and month membership is string comparison, with no timezone arithmetic anywhere in the counters.
- **Known edge:** a viewing is keyed by where the viewer is *now*, so a member who flies from Los Angeles to New York after a 10 pm showing will see it move a day later. For a theater membership used locally this is accepted; the alternative, storing a zone with every viewing, isn't worth it.
- **Release dates are the other kind.** `movie.releaseDate` is date-only (UTC midnight), displayed with `formatDateUTC`, never `formatDate`. Showtimes display with `formatDateTime`/`formatTime`. The two never share a helper.
- The Calendar has no month-change callback, so nothing here is scoped to the visible month. That is fine: all viewings are already loaded, and the counters are defined on *today*, not on the month on screen.

#### 3. Counters and goals

All counts are over `SEEN` viewings only (planned ones are future by definition, and an ended-but-unconfirmed one is not yet a watched movie), bucketed by `getDayKey(showtimeAt)`:

- **Movies watched** — count of `SEEN` viewings. A rewatch counts again.
- **Movies since Friday** — `SEEN` viewings with a day key in `[weekStartKey, weekEndKey]`, the viewer's local week starting on `WEEK_STARTS_ON` (Friday, because AMC's week turns over then; the calendar grid still starts on Sunday). The tile reads "Since Friday" and carries a help icon. Shown as `count / weeklyGoal` (e.g. `1/4`), or just `count` when no goal is set.
- **Weekly goal met** — `count ≥ weeklyGoal`. **Monthly goal met** — `SEEN` viewings whose key shares today's `YYYY-MM` prefix, `≥ monthlyGoal`. The month is the calendar month.
- A goal is the member's own target, so `null` means "no goal" and the chip is hidden.

#### 4. Billing cycles and membership cost incurred

The membership bills monthly on the day-of-month of `startDate`. Cost incurred is `cyclesElapsed × monthlyTotalCents`, written as a sum over the cycle dates of `getMonthlyTotalAt(cycleDate)` so a future price history only has to replace that one function (see "Planned later" below).

```
todayDay      = fromDateInputValue(toLocalDateInputValue(now))   // UTC midnight of the viewer's local day
cycle k date  = the start day-of-month in month (startMonth + k), clamped to that month's last day
cyclesElapsed = number of k ≥ 0 whose cycle date ≤ todayDay      // the first charge is on the start date itself
```

- Each cycle date is computed **from the start date**, not chained from the previous one, so a membership that started on the 31st bills Feb 28, Mar 31, Apr 30 and never "drifts" to the 28th.
- All of it is UTC day arithmetic on date-only values, in whole days from the anchor, consistent with the repo's date-only rule. The only local-time step is deriving `todayDay` from `now`.
- The Setup form doesn't allow a `startDate` in the future; if one ever appeared, `cyclesElapsed` would simply be `0`.
- There is no cancel/pause; out of scope (Open questions).

**Planned later: membership cost that changes over time.** Today one `monthlyTotalCents` applies to every month, so editing it rewrites history. The planned fix is a `priceHistory` list on the membership, each entry `{ effectiveFrom (date-only), monthlyCostCents, monthlyTotalCents, taxRate }`, with cost incurred becoming the sum over each billing cycle of the total in effect on that cycle's date. It is additive: today's single total is the entry in effect now, and a profile with no history reads as a one-entry history. To keep that change small, `billing.ts` is written now as a sum over cycle dates of `getMonthlyTotalAt(cycleDate)`, which today just returns the single stored total, so the later issue only replaces that one function and adds the field and its form (the field itself is not added until that issue, per the no-pre-added-fields rule). It is a Beyond-tier roadmap item.

#### 5. Savings and break-even

Per viewing that is `SEEN` and has a ticket (a planned movie hasn't been used yet, so a pre-bought ticket is stored but counts once it's seen):

```
ticketValueCents    = totalCents                       // = price + fee avoided + tax: what a non-member would have paid
premiumSavingsCents = priceCents − standardPriceCents  // only when format ≠ STANDARD and standardPriceCents ≠ null
```

Totals (`selectSavingsSummary`, all integers):

```
totalTicketSavings   = Σ totalCents
feesAvoided          = Σ feeAvoidedCents                 // the fee part of the line above, shown as its own counter
membershipCost       = cyclesElapsed × monthlyTotalCents
netSavings           = totalTicketSavings − membershipCost
isBrokenEven         = netSavings ≥ 0                    // shown as "Not yet" / "Broken even"
premiumFormatSavings = Σ premiumSavingsCents
unpricedCount        = SEEN viewings with ticket === null    // drives "N movies don't have prices yet"
premiumUnpricedCount = SEEN premium tickets with standardPriceCents === null
```

- **Worked example from the spec**, as a test case: monthly total `$27.94` (`2794`), one cycle elapsed, one seen Standard ticket with price `$15.56`, fee `$0`, tax `$1.26` → `totalCents = 1682`. `netSavings = 1682 − 2794 = −1112` → **−$11.12**; `isBrokenEven = false` → "Not yet"; `premiumFormatSavings = 0` → **$0.00**; `feesAvoided = 0` → **$0.00**. Every number on the spec's dashboard reproduces.
- **Itemized entry:** `taxCents = round(priceCents × taxRate)` (half-up, `Math.round`; `0` when no rate is chosen), `totalCents = priceCents + feeAvoidedCents + taxCents`. The fee is assumed untaxed.
- **All-in entry:** the member types `totalCents`, picks a fee chip and a tax chip, and the split is derived: `priceCents = round((totalCents − feeAvoidedCents) / (1 + taxRate))` and `taxCents = totalCents − feeAvoidedCents − priceCents`, so the three always add back to the total exactly. With no rate chosen, `priceCents = totalCents − feeAvoidedCents` and `taxCents = 0`. Example: total `2139`, fee `150`, rate `0.075` → price `1850`, tax `139`. Total savings and fees avoided don't depend on the estimate; premium savings do, which is why the form suggests itemizing a premium ticket.
- **Entry validation:** all amounts are non-negative; the all-in total can't be less than the fee. A saved ticket's `taxRate` is the chip or "Other" rate that was chosen (null if none), and is what the chips are built from later.
- **Rounding** happens in exactly three places: the itemized tax, the all-in price split, and the bill-derived membership rate (`round(total / cost − 1, 4 decimal places)`). Everything else is integer addition.
- **Changing the membership's rate later never rewrites old tickets**, because each ticket stores its own tax amount.

#### 6. Setup branching

```
Step 1 Membership (confirm perks, read-only copy)
  → Step 2 Cost & start date
        cost before tax            required
        start date                 required; today or earlier
        total on your bill (tax in)  optional
           left blank       → monthlyTotalCents = cost,  taxRate = null
           ≥ cost           → monthlyTotalCents = total, taxRate = round(total / cost − 1, 4 dp)   // shown as "about 7.5%"
           < cost           → inline error, Next disabled
           implied rate > 0.25 → inline error (almost certainly a typo)
  → Step 3 Goals (weekly, monthly; both optional)
  → Step 4 Theaters (optional: type the theaters you go to, star a favorite) → one writeBatch (membership + theaters) → "Add movies you've already seen?"
        ├─ Add past movies → the add subview in past-movies mode (dates can't precede the start date)
        └─ Skip            → empty Calendar (with its "Add your first movie" / "Add past movies" nudge)
```

The tax rate comes from the member's own bill, never a lookup. The "Add movies you've already seen?" offer is ephemeral UI state in the orchestrator. If the member reloads while it's showing, they land on the empty Calendar with the nudge, which is the same destination as "Skip" and loses nothing.

#### 7. Opening window

A watchlist item is in the **Opening** tab when it is **unseen**, its `releaseDate` is not null, and

```
todayDay ≤ releaseDate ≤ todayDay + OPENING_WINDOW_DAYS × 86_400_000
```

where `todayDay` is the viewer's local day as a UTC-midnight value (as in §4). Both sides are date-only, so it's a plain comparison; no `endDate + 1 day` adjustment is needed (that rule is for comparing an *instant* against a date-only end). The window is today through seven days out, inclusive. The tab's badge is the number of rows, shown only when greater than zero. A movie in the window also appears in All and its priority tab.

#### 8. Watchlist rows and tab filters

`selectWatchlistRows` joins each item with its viewings: `isSeen` (any `SEEN` viewing), `seenCount`, `nextPlannedAt` (earliest `PLANNED` viewing with `showtimeAt ≥ now`), `lastWatchedAt` (latest `SEEN` showtime). Tabs are filters over the rows:

| Tab | Rows |
|---|---|
| Opening (default) | §7 |
| All | unseen only, ordered by priority then release date (nulls last) |
| Must See / Want to See / If I Have Time | unseen, that priority, ordered by release date |
| Seen | seen only, latest watched first; priority pills narrow it too |

A sort control (Default, Release date, Title, Date added) re-orders whichever rows are showing; Default keeps the orders above. Release date, Title and Date added have a natural direction (newest first, A to Z, newest first) that an Order pill flips; entries with no release date stay last either way. It is client-side state only and resets to Default when the list has fewer than two movies.

#### 9. Fee chips and tax-rate chips

Neither a fee nor a tax rate can be looked up, so both are offered as chips built from what the member has already entered.

**Fee chips** (`selectFeeChips`): the distinct `ticket.feeAvoidedCents` across all viewings with a ticket, ordered by most recent `showtimeAt` using that value, the first `MAX_FEE_CHIPS` of them, with a `$0` chip always first and de-duplicated against it. "Other" reveals a money input.

**Tax-rate chips and the default** (`selectTaxRateChips`):

```
used     = distinct non-null ticket.taxRate across viewings, each rounded to 5 dp (so a three-decimal percent like 8.875% survives), with use counts and last-used times
default  = the most-used rate; ties go to the most recently used
           no tickets yet → membership.taxRate
           neither        → no default (the row shows only "Other")
chips    = default first, then the remaining used rates by recency, with membership.taxRate included if not already there; at most MAX_TAX_CHIPS
label    = the rate as a percent with up to three decimals, trimmed ("7.5%", "8.875%")
```

So the membership's gauged rate is where it starts, and the moment the member's tickets show a different rate being used more, that one becomes the preselected default. "Other" reveals a rate input (a percent, 0 – 25).

Neither has a separate collection: chips are pure functions of viewings (and, for tax, the membership), so editing or deleting a ticket updates them.

#### 10. The Seen-prompt queue

`selectPendingSeenPrompts(state, now)` is every `PLANNED` viewing with `endsAt ≤ now`, oldest first. The host component shows the first one only when no other overlay is open, and keeps a session-local set of "Later" ids in its own state (not stored: "Later" means *until the next open*). Answering "Seen it" or "Didn't go" removes the viewing from the queue by changing or deleting the document, and the next one appears.


#### 11. The previews strip

`selectPreviewsWindowViewing(state, now)` returns the earliest `PLANNED` viewing whose previews are near: `showtimeAt − 10 min ≤ now ≤ showtimeAt + 30 min` (display only, the viewer's local clock; `useNow`'s 15-second tick moves the edges). `PreviewsNudge` shows a small bubble for it above the Calendar icon, folds it into a chip when the user dismisses it (in component state, so until the next open; tapping the chip unfolds it again), and never opens an overlay: its button opens the ordinary add subview in `quick` mode. Because it is not a drawer it cannot stack on the Seen prompt, which may appear over it for an earlier showing. Quick mode saves a tapped result as `WANT_TO_SEE` with no preferred format and no details step, skips a title already on the watchlist (by key, or by title and year across providers) with an "Already on your watchlist" toast, and, when the details lookup fails (poor signal in a theater), saves what the search returned and leaves the rest to `useRefreshUnreleasedMovies`, which covers null-dated items.
---

## Security Rules Design Criteria

1. **Everything is owner-only.** Every path under `apps/a-list/memberships/{uid}` allows read and write only when `request.auth.uid == uid`. There is no member-of, admin, or role branch.
2. **`isAdmin()` and `isDevUser()` get no access to member data.** They already gate the app *catalog* document (`apps/a-list`), as for every other app. Neither is added to these rules: a seeded dev fixture signs in as its own `uid` like anyone else.
3. **The app document** `apps/a-list` follows the existing four-read-predicate shape (admin/dev, unrestricted-public, uid-allowed, email-allowed) and admin-only writes, and the block goes in alphabetical position, **above** `nine-lives`.
4. **Shape validation covers every field on every type**, with the `T | null` convention (the key must exist; `null` is a legal value only where the type says so). Cents are integers `0 … 1,000,000`; `rating` is null or `0.5 … 5` in half steps; goals are null or in a sane range; `taxRate` (membership and ticket) is null or `0 … 0.25`; enums are checked with `in [...]` against the same strings as `constants.ts`; strings have length caps.
5. **Immutable fields only:** `uid`/`movieKey`/`id`, `createdAt`, and a viewing's `movie` snapshot, and the membership's `setupCompletedAt`. Everything the UI edits stays editable.
6. **Cross-field integrity the client could get wrong:** `endsAt > showtimeAt`; `status == 'SEEN'` implies `showtimeAt ≤ request.time.toMillis()` (the server's clock, so a skewed device can't create a seen movie in the future); arriving at `SEEN` (a create, or a `PLANNED → SEEN` update) also requires `endsAt ≤ request.time.toMillis()`, so a movie can't be marked seen while it is still running; an update whose stored `status` is `SEEN` must keep `SEEN` (no `SEEN → PLANNED`); `status == 'PLANNED'` implies `rating == null`; `ticket.format == 'STANDARD'` implies `standardPriceCents == null`; `ticket.totalCents == priceCents + feeAvoidedCents + taxCents`; `monthlyTotalCents ≥ monthlyCostCents`.
7. **Deletes:** the owner may delete viewings and watchlist items (both have UI). The membership document cannot be deleted (no UI; there is no "reset" in the MVP).
8. **No cross-document rules.** A viewing doesn't require its watchlist item to exist: the app's "add viewing" writes both in one transaction for user-experience atomicity, but the data is the member's own, and nothing reads a viewing in a way that needs the watchlist document. This keeps the rules `get()`-free.
9. **Rules tolerate older documents** the way every collection in this repo must: a field added later is validated on the *incoming* document with `request.resource.data.get('field', default)` (so a write that omits it still passes, and a write that sets it is checked), and `resource.data.get('field', default)` is used only to compare against the stored value (immutability, transitions). Every edit action backfills the new key with its empty value in the same write. (Older viewings lack `ticket`, `rating`, `theatre`, `trailerReminderId`; older memberships lack `favoriteTheatreId`.)
10. **No `storage.rules` change.** The app stores no files.
11. **The movie cache and the lookup-budget counters are server-only.** `apps/a-list/searchCache`, `apps/a-list/movieCache` and `apps/a-list/lookupUsage` are read and written only by the Cloud Functions through the admin SDK, which bypasses rules, so their rules deny every client read and write. A member must not be able to read other members' usage counters or poison the shared cache.
12. **Theaters:** `memberships/{uid}/theatres/{theatreId}` is owner-only like everything else; the document id must be `manual-…` and equal `theatreId`, every field is validated (`T | null`, length caps, coordinates in range), and `createdAt` is immutable. `favoriteTheatreId` on the membership and `theatre` on a viewing arrived later, so they are allowed but not required (`get(field, null)`), and a viewing's `theatre` must be a map of exactly `theatreId`, `name`, `city`, `state`.
13. **Calendar shares:** `apps/a-list/calendarShares/{shareId}` is readable and deletable only by `ownerUid`, creatable only by a member (their membership document must exist) whose `ownerUid` is their uid, with the id matching the 26-character share alphabet and equal to the field, exact keys, `endDate ≥ startDate` and at most 365 days later, a null-or-valid PIN, and 1–400 viewings. An update may change only `pin` and `lastEditedAt`. Visitors have no read; the function uses the admin SDK.

The shape of the block (helpers are declared in the `memberships/{uid}` match so the nested matches reuse them):

```
// --- App: a-list ---
match /apps/a-list {
  allow read: if isAdmin() || isDevUser();
  allow read: if isUnrestrictedPublicApp(resource.data);
  allow read: if isUidAllowedApp(resource.data);
  allow read: if isEmailAllowedApp(resource.data);
  allow create, update, delete: if isAdmin();
}

match /apps/a-list/memberships/{uid} {
  function isOwner() { return request.auth != null && request.auth.uid == uid; }
  function isCents(value) { return value is int && value >= 0 && value <= 1000000; }
  function isNullOrIntBetween(value, low, high) { return value == null || (value is int && value >= low && value <= high); }

  function isMembershipValid(data) {
    // `favoriteTheatreId` is allowed but not required (documents written before theaters lack it) and, when present, must match isTheatreId.
    return data.keys().hasOnly(['uid','monthlyCostCents','monthlyTotalCents','taxRate',
                                'startDate','weeklyGoal','monthlyGoal','setupCompletedAt','createdAt','lastEditedAt','favoriteTheatreId'])
      && data.keys().hasAll(['uid','monthlyCostCents','monthlyTotalCents','taxRate',
                             'startDate','weeklyGoal','monthlyGoal','setupCompletedAt','createdAt','lastEditedAt'])
      && data.uid == uid
      && isCents(data.monthlyCostCents) && isCents(data.monthlyTotalCents)
      && data.monthlyTotalCents >= data.monthlyCostCents
      && (data.taxRate == null || (data.taxRate is number && data.taxRate >= 0 && data.taxRate <= 0.25))
      && data.startDate is number
      && isNullOrIntBetween(data.weeklyGoal, 1, 21) && isNullOrIntBetween(data.monthlyGoal, 1, 93)
      && data.setupCompletedAt is number && data.createdAt is number && data.lastEditedAt is number;
  }

  function isMovieValid(m) {
    return m.keys().hasOnly(['title','releaseDate','posterUrl','runtimeMinutes','contentRating'])
      && m.keys().hasAll(['title','releaseDate','posterUrl','runtimeMinutes','contentRating'])
      && m.title is string && m.title.size() > 0 && m.title.size() <= 200
      && (m.releaseDate == null || m.releaseDate is number)
      && (m.posterUrl == null || (m.posterUrl is string && m.posterUrl.size() <= 500 && m.posterUrl.matches('^https://[^\\s]+$')))
      && isNullOrIntBetween(m.runtimeMinutes, 1, 1000)
      && (m.contentRating == null || (m.contentRating is string && m.contentRating.size() <= 20));
  }

  allow read: if isOwner();
  allow create: if isOwner() && isMembershipValid(request.resource.data);
  allow update: if isOwner() && isMembershipValid(request.resource.data)
    && request.resource.data.setupCompletedAt == resource.data.setupCompletedAt
    && request.resource.data.createdAt == resource.data.createdAt;
  allow delete: if false;

  match /watchlist/{movieKey} {
    // valid: exact keys; movieKey field == document id and matches ^(imdb-tt[0-9]{7,10}|tmdb-[0-9]{1,9}|manual-[A-Za-z0-9-]{8,40})$; isMovieValid(movie);
    //        priority in the three values; preferredFormat null or one of the six; createdAt/lastEditedAt numbers
    allow read, delete: if isOwner();
    allow create: if isOwner() /* && isWatchlistItemValid(request.resource.data) */;
    allow update: if isOwner() /* && valid && movieKey and createdAt unchanged */;
  }

  match /theatres/{theatreId} {
    // valid: exact keys (the ten on AListTheatre); theatreId == document id and matches ^manual-[A-Za-z0-9-]{8,40}$;
    //        name 1–120 characters; address fields null or short text; coordinates null or in range; createdAt/lastEditedAt ints
    allow read, delete: if isOwner();
    allow create: if isOwner() /* && isTheatreValid(request.resource.data) */;
    allow update: if isOwner() /* && valid && createdAt unchanged */;
  }

  match /viewings/{viewingId} {
    // `theatre` is allowed but not required: null or a map of exactly theatreId, name, city, state.
    // valid: exact keys; id == document id; isMovieValid(movie); endsAt > showtimeAt; the status/rating/showtime
    //        rules in criterion 6; ticket null or isTicketValid (exact keys, format in the six, cents helpers,
    //        STANDARD ⇒ standardPriceCents == null; entryMode in the two values; taxRate null or 0–0.25;
    //        totalCents == priceCents + feeAvoidedCents + taxCents); createdAt/lastEditedAt numbers
    allow read, delete: if isOwner();
    allow create: if isOwner() /* && isViewingValid(request.resource.data) */;
    allow update: if isOwner() /* && valid && id, movieKey, movie, createdAt unchanged */;
  }
}

// Written and read only by the Cloud Functions (admin SDK); clients get nothing.
match /apps/a-list/searchCache/{key}   { allow read, write: if false; }
match /apps/a-list/movieCache/{key}    { allow read, write: if false; }
match /apps/a-list/lookupUsage/{key}   { allow read, write: if false; }

// Owner-only; visitors go through the getCalendarShare function.
match /apps/a-list/calendarShares/{shareId} {
  allow read, delete: if isShareOwner();
  allow create: if isMember() /* && isShareCreateValid(request.resource.data) */;  // exists(membership) in the real rule
  allow update: if isShareOwner() /* && only pin and lastEditedAt change, pin valid */;
}
```

(The commented placeholders are the helper calls the implementation PR writes out in full; the structure and every constraint are as listed in the criteria above.)

---

## Client State Management (Redux Toolkit)

Per-app store under `src/apps/a-list/store/`, exposing `AListState` and `aListReducer`, mounted in the central `src/store/index.ts` as `aList` (next to `nineLives` and `waypoint`).

```typescript
interface MembershipState { membership: MembershipProfile | null; isLoaded: boolean }
interface WatchlistState  { items: WatchlistItem[];                isLoaded: boolean }
interface ViewingsState   { items: Viewing[];                      isLoaded: boolean }
interface TheatresState   { items: AListTheatre[];                 isLoaded: boolean }
export interface AListState { membership: MembershipState; watchlist: WatchlistState; viewings: ViewingsState; theatres: TheatresState }
```

Every slice resets on the shared `resetAllState`, so a user switch never shows the previous member's data.

**One listener tier.** Waypoint and Nine Lives need a second, per-open-resource tier; A-List has no "open resource", so there's a single effect scoped to the signed-in `uid`:

- `startMembershipListener(uid, onChange)` → `onSnapshot(doc(memberships/{uid}))`
- `startWatchlistListener(uid, onChange)` → `onSnapshot(collection(memberships/{uid}/watchlist))`
- `startViewingsListener(uid, onChange)` → `onSnapshot(collection(memberships/{uid}/viewings))`
- `startTheatresListener(uid, onChange)` → `onSnapshot(collection(memberships/{uid}/theatres))`

All four live in `store/listeners/`, and are started once by `useAListSync(uid)`, called once from `AList.tsx` (the only orchestrator). No tab, panel or drawer has an `onSnapshot` of its own.

**Loading and first-launch gate.** `AList.tsx` shows a skeleton until `membership.isLoaded && watchlist.isLoaded && viewings.isLoaded && theatres.isLoaded`. Then: `membership === null` → the Setup modal is open and can't be dismissed (nothing works without a monthly cost and start date); otherwise the app renders on the Calendar tab.

**Actions (thunks)** in `store/actions/`, writing to the member's own paths:

| Action | Write |
|---|---|
| `completeSetup(draft)` | one `writeBatch`: the membership document (all keys, explicit `null`s; `taxRate` null when no bill total was given) and the theaters picked in the last step |
| `addTheatre(theatre)` / `removeTheatre(theatreId)` | one `runTransaction` each: the theater document and, when needed, the membership's `favoriteTheatreId` (only the member's first theater becomes the favorite; removing the favorite hands the star to another saved theater in the same transaction, and tapping the star again clears it for good) |
| `setFavoriteTheatre(theatreId \| null)` | one `runTransaction`: confirms the theater still exists, then writes `favoriteTheatreId`, so a stale device can't leave it dangling |
| `updateMembership(fields)` | field-scoped `updateDoc` (+ `lastEditedAt`) |
| `addWatchlistItem(movie, priority, preferredFormat)` (a manual movie is just a snapshot built by `ManualMovieForm` with a `manual-<uuid>` key) | `setDoc` at `watchlist/{movieKey}`; **create-if-absent** inside a `runTransaction` so a double-tap or two devices can't overwrite an existing priority |
| `updateWatchlistItem(movieKey, fields)` | field-scoped `updateDoc` |
| `removeWatchlistItem(movieKey)` | `deleteDoc`, after `useActionModal().confirm({ destructive: true })`; viewings untouched |
| `addViewing({ movie, showtimeAt, ticket, theatre })` | **one `runTransaction`**: `transaction.get` the watchlist item; if absent `transaction.set` it (priority default, no preferred format); `transaction.set` the new viewing. `status` and `endsAt` are derived inside the action. A showing still ahead also gets a `reminders` doc (`appId: 'a-list'`, a fixed title and a body that names the movie) scheduled after the transaction commits, best-effort, with its id pre-generated and stored as `trailerReminderId`. |
| `updateViewing(id, fields)` | field-scoped `updateDoc` of what the edit form owns (`showtimeAt` + recomputed `endsAt`, `ticket`, `rating`, `theatre`) and, only when the showtime moved, a fresh `trailerReminderId` (a still-pending previous reminder is cancelled and a new one scheduled after the write, neither awaited); any other edit leaves the reminder alone |
| `recordTicket(id, ticket)` | `updateDoc({ ticket, lastEditedAt })` — the form owns the whole object |
| `markViewingSeen(id, rating)` | `updateDoc({ status: 'SEEN', rating, lastEditedAt })` |
| `removeViewing(id)` | a transaction (so it needs a connection) that reads and deletes the viewing after a destructive confirm (also what "Didn't go" does); a trailer reminder still ahead is cancelled afterwards, not awaited |

No cached document is ever written back whole. A transaction is used only where one action must create two documents consistently or create-if-absent; the single-member data has no other concurrency hazard.

**Selectors** (`store/selectors.ts`): `createSelector` for everything that builds a new array or object, so no `useAppSelector` returns a fresh reference without `shallowEqual`. Time-dependent selectors take `now` as an argument (`useNow()` supplies it in the screen). The ones listed under *Derived values* above, plus `selectViewingsByDay`'s per-day arrays, which are what `renderCell` reads.

**Overlay coordination.** The orchestrator owns one discriminated-union state, `overlay: null | { kind: 'viewing'; id } | { kind: 'add'; mode: 'single' | 'past'; movie?; date? } | { kind: 'watchlistItem'; movieKey } | { kind: 'settings' }`, exposed through a small context. One value means "never an overlay on an overlay" is true by construction; the in-place swaps (Mark paid, Edit, Add to calendar) are internal view state of the drawer that's already open. The destructive confirm is the one thing rendered above it. The Seen prompt shows only when `overlay === null`.

---

## Component Encapsulation

- **`AList.tsx`** — the only orchestrator: the auth uid, `useAListSync`, the loading/Setup gate, the bottom nav and active tab (`?tab=` like Waypoint), the overlay state, and the two hosts below. It renders no feature UI itself.
- **`CalendarScreen`** — owns the selected day (local state, set from `onDateSelect`), the counters row, the Calendar, and the inline day panel. Reads `selectViewingsByDay` and `selectCounters`; knows nothing about tickets.
- **`PosterCell`** — pure: `(dayViewings) → PosterSplit`. No store access; `renderCell` is a thin closure over the map.
- **`ViewingDrawer`** — owns its internal view (`details | ticket | edit`) and the swap-in-place back link; calls actions and the destructive confirm. Everything else about a viewing (row, badges, stars) is a pure presentational component.
- **`AddFlow`** (shown full-page by `AddSubview`, or inside the watchlist drawer for "Add to calendar") — owns the two-step pick-then-details state, the "added · N so far" counter for past-movies mode, and calls `addViewing`/`addWatchlistItem`. In the watchlist's `quick` mode (the trailers loop) a tap on a result saves it straight away with the default priority and no toast (only a duplicate or a failure toasts), falling back to what the search knew if the details lookup fails. `TrailerPicksList` shows the picks, derived from the watchlist (items created since the previews window opened, as of the screen opening), and its Undo calls `removeWatchlistItem`. `MoviePicker` is purely a picker: given a query it returns a chosen `MovieSearchResult` or a chosen watchlist item.
- **`SeenPromptHost`** and **`useRefreshUnreleasedMovies`** — the two background concerns, each mounted once in `AList.tsx`. Neither renders anything except the prompt drawer.
- **`PreviewsNudge`** (`components/shell/`) — a third, quieter one: rendered by `BottomNav` above the Calendar button (so on every tab, never as an overlay) while a showing's previews are near. It keeps its own session-local list of folded showings, like "Later".
- **Pure utilities** (`utils/`): `money.ts` (parse/format cents), `dayKeys.ts`, `billing.ts`, `savings.ts`, `viewingState.ts`, `tax.ts` (itemized tax, all-in split, bill-derived rate), `watchlistRows.ts`, `opening.ts`, `chips.ts` (fee and tax-rate chips). All are plain functions over plain data with no React or Firebase, so the arithmetic that decides "have I broken even?" is exercised without a UI.
- **Reuse, not copy:** `useDebouncedValue`/`DEBOUNCE_MS`, `useNow`, `queryClient`/`DAY_MS`, `normalizeString`, `formatDateUTC`/`formatDate`/`formatTime`/`formatDateTime`, `fromDateInputValue`/`toLocalDateInputValue`/`fromLocalDateAndTimeInputValues`, `useActionModal`, and `AppToggle` if an immediate-effect toggle ever appears. **`SectionHeader`, `ModalFooterActions` and `DeleteIconButton` currently live in Waypoint's `components/`.** A-List is the second app that needs them, so they move to central `src/components/` in the first A-List PR that uses one, with Waypoint's imports updated in the same PR. A-List never imports from `@apps/waypoint`.

---

## UI Component Conventions Applied

- **Overlays.** Setup and Membership settings are `Modal`s. Every movie flow (Add, viewing details, watchlist item, Seen prompt) is a `Drawer` at every width: the deliberate exception recorded in the UX doc. Mark paid, Edit and Add to calendar swap the open drawer's content in place with a "‹ Back" link. Only the destructive confirm (`useActionModal().confirm({ destructive: true })`) is ever stacked.
- **Titles are plain nouns:** "Membership", "Movie", "Ticket", "Viewing", "Watchlist item". The verb belongs on the button ("Add", "Save", "Add + another", "Add & finish").
- **Forms use `Form` + `FormFactories`.** Setup's three steps are three small `Form`s inside a stepper; the Ticket and Edit forms are `Form`s; the movie picker, fee chips, tax chips and star rating are `FormFactories.custom` fields. The Ticket form's itemized / all-in switch is local form state that decides which amount field renders. Money is entered through a text input with `inputMode="decimal"` and parsed by `parseMoneyToCents`; a number input's spinner and float parsing are wrong for money.
- **Submit disables until valid** (`onDataChange` + `isValid`). Ticket details sit behind the "Already bought your ticket?" question (pills: "Yes, I paid" / "Not yet"); a "Custom/Other" fee or tax-rate input renders only once "Other" is selected.
- **Layout.** One border per card, flat rows inside; `StatTile` is the only card allowed on a screen. Counts appear only when greater than zero. Posters carry no border of their own; the cell is the frame.
- **No raw `<button>/<input>/<select>/<textarea>/<a>`** anywhere, including the star rating (a pointer-event `role="slider"` row) and the cell tap target (the Calendar's own). `join()` for every conditional class.
- **Date-only and instants never share a formatter** (see Logic §2). Every screen that shows a date is validated in a timezone behind UTC.
- **Copy** is warm and short ("Not yet", never a red alarm; "Did you catch it?"). Footer labels stay short.

---

## Security & Privacy Requirements

- **Private by construction.** One member's membership, watchlist and viewings are readable and writable only by them. There is no admin read; the rules in Security Rules Design Criteria #1–2 are the whole access model. The one thing that leaves is a calendar share the member makes on purpose (Data Schema #5): a frozen, allowlisted copy behind an unguessable link, optionally PIN-locked, served by a function and deletable at any time.
- **What leaves the app, and where it goes.** Movie search text and a chosen `movieKey` go to the app's own Cloud Functions, which forward them to the movie provider; the provider sees the function's address and the text, never the member's identity, and the functions don't log the text. The functions do keep a shared cache of results and per-member lookup counts (server-only, no text, no identity beyond a `uid` in a counter's document id). Besides a share the member makes on purpose, nothing else leaves the app: there is no location, and tax is never looked up. Posters load straight from the host OMDb names in its response, which sees the viewer's address when they load, as with any image; the app sets `referrerPolicy='no-referrer'` as `FallbackImage` does.
- **The provider credential never reaches the browser, a response, or a log** (Functions secret). Inputs to the callables are validated and length-capped; every callable requires an authenticated caller except `getCalendarShare`, which serves visitors who have no account and so answers only from a link's id and optional PIN.
- **Stored data minimization.** No location of any kind is collected or stored. No ticket confirmation numbers or card data are ever collected. The only venue detail is the theater's name (and AMC's id once theaters come from AMC), stored on the member's own theater list and copied onto a showing; address and coordinates stay `null`.
- **Persistence on the device.** Only the movie search/details queries are persisted to IndexedDB (public third-party data). Nothing from the member's own documents is persisted by the app beyond Firestore's own cache. The query cache is cleared on user switch in `AuthContext`, as everywhere.
- **Attribution and terms** for the movie provider are an About row in Membership settings and a verification gate before the movie-data PR merges (see Movie Data Service).
- **Rules are verified against the emulator, not by the UI hiding a control:** owner allowed and a second signed-in user denied on every path (membership, watchlist, viewings, theaters), signed-out denied; and one denied write per integrity rule (rating 6, negative cents, `SEEN` with a future showtime, `PLANNED` with a rating, changed `movieKey`).

---

## Component & File Architecture

```
src/apps/a-list/
├── AList.tsx                    # sole orchestrator
├── README.md  UX.md  TECHNICAL.md
├── constants.ts  types.ts
├── hooks/
│   ├── useAListSync.ts
│   ├── useRefreshUnreleasedMovies.ts
│   └── useAListOverlay.tsx      # overlay state + context
├── queries/
│   └── movieQueries.ts
├── store/
│   ├── index.ts  selectors.ts
│   ├── slices/     membershipSlice.ts  watchlistSlice.ts  viewingsSlice.ts
│   ├── actions/    membershipActions.ts  watchlistActions.ts  viewingActions.ts
│   └── listeners/  membershipListeners.ts  watchlistListeners.ts  viewingListeners.ts
├── utils/
│   ├── money.ts  dayKeys.ts  billing.ts  savings.ts  viewingState.ts
│   ├── tax.ts  watchlistRows.ts  opening.ts  chips.ts
└── components/
    ├── shell/       BottomNav.tsx  LoadingSkeleton.tsx  PreviewsNudge.tsx
    ├── setup/       SetupModal.tsx  SetupStepper.tsx  CostStep.tsx  MembershipSettingsModal.tsx
    ├── calendar/    CalendarScreen.tsx  CounterRow.tsx  PosterCell.tsx  PosterSplit.tsx  DayDrawer.tsx  DayHoverCard.tsx  ViewingRow.tsx
    ├── viewing/     ViewingDrawer.tsx  TicketForm.tsx  EditViewingForm.tsx  FeeChips.tsx  TaxChips.tsx  SeenPromptHost.tsx  SeenPrompt.tsx
    ├── add/         AddFlow.tsx  AddSubview.tsx  MoviePicker.tsx  PastMoviesStrip.tsx
    ├── watchlist/   WatchlistScreen.tsx  WatchlistFilters.tsx  WatchlistDetailsFields.tsx  WatchlistRow.tsx  WatchlistItemDrawer.tsx
    ├── dashboard/   DashboardScreen.tsx  StatTile.tsx  (Next Steps: FormatSplit.tsx  ActivityChart.tsx  RatingsSpend.tsx  PremiumInsights.tsx)
    └── shared/      PosterCover.tsx  FormatBadge.tsx  PriorityBadge.tsx  ViewingStatusBadge.tsx

functions/src/apps/a-list/       searchMovies.ts  getMovie.ts  lookupBudget.ts  movieCache.ts
scripts/seeds/aList.ts
```

Charts use `recharts` (already a dependency), following Nine Lives' `TrendLineChart` pattern.

**Wiring checklist** (everything a new mini-app has to touch; each item is in the roadmap):

- `src/lib/types/appCatalog.ts`: `'a-list'` in `AppId`. `src/lib/app/app.registry.ts`: a registry entry (`status: 'draft'`, `path: '/a-list'`).
- `src/routes/AppRoutes.tsx`: lazy route to `@apps/a-list/AList`.
- `public/manifest-a-list.json`, a logo and a banner under `public/logos` and `public/banners/by-app`, the entry in `cloudflare-worker.js`, and the root `README.md` (the registry's own comment lists exactly these). The root README's "Current apps" list is stale (it names only Worth the Wait), so this first PR rewrites it to list every app, each with an emoji; `CLAUDE.md` (Release hygiene) and `.github/copilot-instructions.md` (Documentation quality) each gain a rule that adding or renaming an app updates that list in the same PR.
- `src/store/index.ts`: `aList` reducer and `RootState`.
- `firestore.rules`: the block above (including the three server-only deny blocks), in alphabetical order, with emulator verification noted in the PR; `firestore.indexes.json` unchanged (state this in the PR).
- `functions/src/index.ts`: export `searchMovies` and `getMovie`; set the `TMDB_API_KEY` and `OMDB_API_KEY` secrets (create `TMDB_API_KEY` in production before the PR merges); after the first deploy, confirm the invoker access (README's Deployment section) if the browser reports a CORS error.
- `scripts/seeds/aList.ts`, the `'a-list'` value in `SeedScope`, an `npm run seed:a-list` script, and the app's `firestoreDocuments` count. The seed covers: a membership; a watchlist with all three priorities, a movie opening this week, and a seen one; viewings that are planned, ended-awaiting-answer, seen with a Standard ticket, seen with a premium ticket and a standard price, a rewatch, one day with four movies, and one that starts 5 minutes after the seed runs so the trailers strip shows (it leaves the window about 35 minutes later) and carries a pending trailer reminder. Seeds use `posterUrl: null` so they work offline, which also exercises the cover fallback.
- `SITE_VERSION` bumped (minor) in `src/lib/app/app.constants.ts` in each PR; `README.md`, `UX.md`, `TECHNICAL.md` current.

---

## Open questions for the roadmap

Each has a default the design already assumes; the owner can change any of them cheaply now and expensively later.

1. **OMDb terms, free-tier limit and field formats are unverified.** The site confirms CC BY-NC 4.0 and a patron-only Poster API, and the 1,000-a-day limit comes from the owner; caching, hot-linking and the response fields are from memory. Gates the movie-data PR, not the schema or UI work, which can proceed against a stub.
2. **OMDb's release dates and coverage of upcoming films are untested.** If its date isn't the US theatrical one, or it lacks movies a week out, the Opening tab leans on the manual path. Worth three real lookups of upcoming titles before the Opening issue.
3. **The daily budget numbers** (stop at 900 app-wide, 100 per member, UTC day) are my choices; the provider's own day boundary is undocumented.
4. **"Add it by title" is an addition beyond the UX doc** (now added to it), made because the shared lookup quota can run out. A manually added title can be duplicated if added twice.
5. **Money in integer cents, US dollars.** Waypoint's expenses use a plain `amount` number; A-List uses cents because it sums many small amounts. A non-US member isn't supported.
6. **The week starts on Friday (AMC's week); the "month" is the calendar month; billing is anchored on the start date's day.** All three are constants. The calendar grid itself still starts on Sunday.
7. **Showtime end** = showtime + 20 minutes of previews + runtime (120 if unknown). The 20 minutes is my assumption.
8. **"Spend per rating"** (a Next Steps chart) sums what the tickets would have cost (their totals), since members pay no fee and nothing else is spent. Say so if you want it to mean something else.
9. **"Mark paid" is the name the spec uses,** but it now records what a non-member would have paid. The copy in the form says so; the action label can become "Add ticket details" if you'd rather it not suggest the member paid.
10. **The fee is assumed untaxed.** Only affects how an all-in total is split into price and tax.
11. **No test runner exists in the repo** (`package.json` has none). The savings, billing and day-key math is pure and worth real tests. Default: a throwaway `tsx` check of the worked examples above plus the timezone-pinned browser pass the repo already requires. Alternative: add Vitest, which is a repo-wide decision.
12. **Cost changes over time are a planned later goal** (see Logic §4); until then, editing the monthly cost rewrites history, and there's no cancel/pause.
13. **Two small additions beyond the UX doc:** the Dashboard's "N movies don't have prices yet" line (from `unpricedCount`) and an About/credits row for the movie provider in Membership settings.
