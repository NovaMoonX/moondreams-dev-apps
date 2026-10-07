# Waypoint — Technical Design Document

Regenerated against the current `plan-mini-app` skill and everything settled in `waypoint-UX.md` — this replaces the version that carried a pending-reconciliation list instead of applying it.

## Data Schema

Namespace root: `apps/waypoint/`

**Every field is nullable, never optional** (`field: Type | null`, never `field?: Type`), per the skill's Firestore-null rule — Firestore can't store `undefined`. Arrays default to `[]`, not `null`.

**Enums / client constants** (not Firestore collections — fixed, non-admin-curated lists):

```typescript
export type UserRole = 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type EventType = 'TRAVEL' | 'DINING' | 'ACTIVITY' | 'FREE_TIME';
export type TransitType = 'FLIGHT' | 'DRIVE' | 'FERRY' | 'TRAIN' | 'WALK' | 'BIKE' | 'SCOOTER' | 'OTHER';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type ActivitySetting = 'INDOOR' | 'OUTDOOR';
export type EventStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
export type ExpenseTargetType = 'EVERYONE_CURRENT' | 'EVERYONE_INCLUDING_FUTURE' | 'JUST_ME' | 'SPECIFIC_MEMBERS';
export type ExpenseStatus = 'PAID' | 'EXPECTED';
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'DECLINED';
export type ChecklistCategory = 'DOCUMENTS' | 'PACKING' | 'BOOKINGS' | 'LOGISTICS' | 'OTHER';
export type CommentTargetType = 'TRIP' | 'EVENT' | 'STAY' | 'EXPENSE';
export type IdeaType = 'RESTAURANT' | 'ACTIVITY' | 'STAY';
export type TimeBlock = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type StayCriterionTier = 'MUST_HAVE' | 'NICE_TO_HAVE';
```

Currency codes stay a plain client-side list — not seeded or admin-curated.

#### 1. Trip Space Document (shared container)

Path: `apps/waypoint/trips/{tripId}`

```typescript
interface TripSpace {
  id: string;
  title: string;
  destinationLabels: string[]; // freeform, multi-value — [] until set; supports filtering My Trips by destination
  tags: string[]; // freeform, separate from destinationLabels — "Guys Trip", "Couples Vacation"; [] until set
  coverImageUrl: string | null;
  startDate: number; // required at creation, alongside title — see note below on why, and on handling later changes
  endDate: number;
  defaultCurrency: string | null;
  members: Record<string, TripMember>;
  inviteCode: string | null;
  sharedAlbumUrl: string | null; // e.g. a Google Photos/Drive folder link — Waypoint never stores photos itself
  sharedAlbumSetByUid: string | null;
  sharedAlbumSetAt: number | null;
  timeModel: 'RELATIVE' | 'ABSOLUTE'; // absent on trips created before relative times — read as 'ABSOLUTE'. See "Relative vs. absolute times" below
  timezone: string | null; // IANA default zone for the trip's wall-clock times; null on ABSOLUTE trips
  dateShiftStatus: 'IDLE' | 'PENDING' | null; // @deprecated — the date-shift lock no longer exists; kept so older trips keep the field. New trips write null
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}

interface TripMember {
  uid: string;
  role: UserRole;
  joinedAt: number;
  // no displayName/photoURL — resolved live via useUserInfo(uid) against the global users/{uid} profile
}
```

**Dates are required at creation, alongside title, but explicitly framed as estimates.** Trip dates are rarely locked in when planning starts, but every day-based feature (`dayIndex` grouping, Timeline, Stay segmentation) needs *some* `startDate` to build on — deferring them to "later" like destination/currency would leave those features with nothing to work from until a second visit to the app. So the create form asks for both, with UI copy making clear they're a starting estimate, not a commitment. That only works if changing them later is genuinely safe — see "Changing Trip Dates" in State Machines & Logic for what that requires.

The trip creator is automatically an `ADMIN` from creation.

#### 1a. Join Request Document — flat, app-scoped, never nested

Per the skill's pending-requests pattern: **multi-request scheme**, since a user can plausibly request to join more than one trip at once (no hard membership cap like a two-person space).

Path: `apps/waypoint/pendingRequests/{requestId}` — doc ID is `{uid}_{tripId}`, a composite key, not a random one, so a duplicate request to the same trip is rejected by the ID itself rather than a query-then-write race.

```typescript
interface TripJoinRequest {
  uid: string;
  tripId: string;
  requestedAt: number;
}
```

**Rules** (adapting the skill's template directly — `resourceCollection` is `trips`, `resourceId` is `tripId`, `isMemberOf` is `isMemberOfTrip`):

```
match /apps/waypoint/pendingRequests/{requestId} {
  function requestUid() { return requestId.split('_')[0]; }
  function tripIdFromRequest() { return requestId.split('_')[1]; }
  function isMemberOfTrip(tripId) {
    return request.auth.uid in get(/databases/$(database)/documents/apps/waypoint/trips/$(tripId)).data.members;
  }

  allow read: if request.auth != null && (
    request.auth.uid == requestUid() ||
    (resource != null && resource.data.uid == request.auth.uid) ||
    (resource != null && isMemberOfTrip(resource.data.tripId))
  );
  allow create: if request.auth.uid == request.resource.data.uid
    && exists(/databases/$(database)/documents/apps/waypoint/trips/$(request.resource.data.tripId))
    && !isMemberOfTrip(request.resource.data.tripId);
  allow delete: if request.auth.uid == requestUid() || (resource != null && isMemberOfTrip(resource.data.tripId));
  allow update: if false;
}
```

**Both directions are plain, single-collection queries** — no `collectionGroup`, no manual index: "my pending trips" via `where('uid', '==', myUid)` against `apps/waypoint/pendingRequests`; an Admin's incoming requests for their own trip via `where('tripId', '==', tripId)` against the same collection. If `firestore.indexes.json` ever needs a manual entry for this collection, that's a signal a `collectionGroup` scope crept back in.

**Approving is one atomic `writeBatch`**: add the uid to `trips/{tripId}.members` with the chosen role, and delete the request doc, in the same `batch.commit()`. Declining just deletes the request doc. Neither step happens as two separate writes.

**Both sides need real, reachable UI** — `MyPendingTrips.tsx` (requester side, with a way to cancel) and `PendingMembersPanel.tsx` (Admin side, approve/decline, role chosen at approval) are two distinct surfaces, not one; see Flow Completeness in Phase 4. The request doc only has `uid`/`tripId`/`requestedAt` — no trip name — so rendering "Pending: join *Tokyo Summer 2026*" needs a follow-up fetch per result to resolve `tripId` to a title (see Client State Management).

**Security Rules Design Criteria #8 is already satisfied by construction**: `trips/{tripId}`'s own read rule (below) is members-only with no pending-related exception, so a requester's access is exactly their own request document — nothing on the trip itself.

#### 2. Timeline Event Document

Path: `apps/waypoint/trips/{tripId}/events/{eventId}`

```typescript
interface TimelineEvent {
  id: string;
  tripId: string;
  eventType: EventType;
  dayIndex: number | null; // null = "no specific day" (RELATIVE trips only)
  endDayIndex: number | null; // equal to dayIndex for the common single-day case; higher for events spanning multiple days
  title: string; // always stored non-empty, but the form never requires one — a blank title is derived on save ("Flight DL 482", the location name, or the event type)
  startTime: string | null; // "HH:mm" wall-clock time on dayIndex, floating — shown the same to every viewer (RELATIVE trips)
  endTime: string | null;
  timezone: string | null; // zone override for this event's start (and end, unless endTimezone says otherwise); null follows the trip's timezone
  endTimezone: string | null; // zone the end is in when it differs from the start's (a flight landing elsewhere); null = same zone. Absent on older events — read it with `?? null`
  startAt: number | null; // @deprecated — ABSOLUTE trips only (null on RELATIVE ones); superseded by dayIndex + startTime
  endAt: number | null; // @deprecated — ABSOLUTE trips only; superseded by endDayIndex + endTime
  locationName: string | null; // not every event type has one — e.g. FREE_TIME
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDetails: EventDetails | null;
  notes: string | null;
  assignedMemberIds: string[]; // []
  changeHistory: EventChangeSnapshot[]; // [] — every post-trip-start edit, appended, never overwritten
  place: PlaceRef | null; // set by a Google Places pick — see "Enrichment: place search and link previews" below
  linkUrl: string | null; // booking/menu/listing link — any type but FREE_TIME
  linkKind: 'WEBSITE' | 'RESERVATION' | 'MENU' | 'BOOKING' | null; // what the link is; null on events saved before it existed
  groupLabel: string | null; // free-text group name — events of the same eventType sharing a label render as one collapsible group; derived at render time, no group document
  stackLabel: string | null; // free-text stack name — several itineraries (groups of legs, or single events) of one eventType shown as one stack; stacking a leg stacks its whole group
  linkPreview: LinkPreview | null; // scraped from linkUrl by the fetchLinkMetadata cloud function
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

**Event details — predefined per `eventType`:**

```typescript
interface TravelEventDetails {
  transitType: TransitType;
  transitDetails: TransitDetails | null;
  isAutoGenerated: boolean; // true until the user customizes or explicitly confirms an auto-proposed commute leg (Next Steps — see State Machines)
}

interface DiningEventDetails {
  mealType: MealType;
  cuisines: string[]; // [] — the menu is just the event's `linkUrl` with `linkKind: 'MENU'`
}

interface ActivityEventDetails {
  settings: ActivitySetting[]; // [] — multi-select; a zoo or festival can genuinely be both indoor and outdoor
}

interface FreeTimeEventDetails {
  // intentionally empty — "nothing planned for this block"
}

type EventDetails = TravelEventDetails | DiningEventDetails | ActivityEventDetails | FreeTimeEventDetails;
// Which variant applies is read off the sibling `eventType` field — no duplicate discriminant.
```

**Transit details — predefined per `transitType`, plus custom fields for `OTHER`:**

```typescript
interface TransitDetailsBase {
  notes: string | null;
  estimatedTravelTimeMs: number | null; // duration, not a point in time — milliseconds for consistency with every other time field; only asked when the leg has no end time (an end time implies the duration)
}

interface PointToPointTransitDetails extends TransitDetailsBase {
  startLocation: string | null; // free text — null means "from the previous event"
  endLocation: string | null; // null means "to the next event"
}

interface FlightTransitDetails extends TransitDetailsBase {
  airline: string | null;
  airlineIataCode: string | null; // set when the airline is picked from the list; null for a custom one
  airlineIcaoCode: string | null; // FlightAware links use this 3-letter code, not the IATA one
  flightNumber: string | null;
  confirmationCode: string | null;
  departureAirportCode: string | null;
  arrivalAirportCode: string | null;
}

interface DriveTransitDetails extends PointToPointTransitDetails {
  // no confirmationCode — a rental's code belongs to the planned Rentals section, not a leg
  vehicleInfo: string | null;
}

interface FerryTransitDetails extends TransitDetailsBase {
  operator: string | null;
  confirmationCode: string | null;
  departurePort: string | null;
  arrivalPort: string | null;
}

interface TrainTransitDetails extends TransitDetailsBase {
  operator: string | null;
  trainNumber: string | null;
  confirmationCode: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
}

interface WalkTransitDetails extends PointToPointTransitDetails {}

interface BikeTransitDetails extends PointToPointTransitDetails {
  operator: string | null;
}

interface ScooterTransitDetails extends PointToPointTransitDetails {
  operator: string | null;
}

interface OtherTransitDetails extends TransitDetailsBase {
  customFields: Record<string, string> | null;
}

type TransitDetails =
  | FlightTransitDetails | DriveTransitDetails | FerryTransitDetails | TrainTransitDetails
  | WalkTransitDetails | BikeTransitDetails | ScooterTransitDetails | OtherTransitDetails;
// The event's own location is entered once and mirrored into the route on save: `endLocation` for
// Drive/Walk/Bike/Scooter ("going to"), `departureStation`/`departurePort` for Train/Ferry; a Flight's
// location comes from its departing airport.
// startLocation/endLocation only apply to Drive/Walk/Bike/Scooter — Flight/Ferry/Train already
// have their own departure/arrival pair, so a generic start/end there would be a second way to
// say the same thing. Which variant applies is read off the sibling `transitType` field.
```

**Change tracking:**

```typescript
interface EventFieldChange {
  field: 'startAt' | 'endAt' | 'startTime' | 'endTime' | 'locationName' | 'dayIndex' | 'endDayIndex';
  previousValue: number | string | null;
  changedBy: string;
  changedAt: number;
}

interface EventChangeSnapshot {
  changes: EventFieldChange[]; // every field changed in one edit, together — each carrying its own attribution
  latestChangedBy: string; // denormalized — same as the last entry in `changes`, kept for quick access without scanning
  latestChangedAt: number;
}
```

#### 3. Stay Document

Path: `apps/waypoint/trips/{tripId}/stays/{stayId}`

```typescript
interface Stay {
  id: string;
  tripId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  checkInDayIndex: number | null; // RELATIVE trips: a trip day + "HH:mm" for each of the four points below
  checkInTime: string | null; // official booking check-in — informational
  checkOutDayIndex: number | null;
  checkOutTime: string | null; // official booking check-out — informational
  plannedArrivalDayIndex: number | null; // drives Stay/Leg Segmentation — defaults to the check-in at creation
  plannedArrivalTime: string | null;
  plannedDepartureDayIndex: number | null; // defaults to the check-out at creation
  plannedDepartureTime: string | null;
  checkInTimezone: string | null; // IANA name (e.g. "Asia/Tokyo") — zone override for the stay's times; null follows the trip's timezone
  checkInAt: number | null; // @deprecated — ABSOLUTE trips only; superseded by checkInDayIndex + checkInTime
  checkOutAt: number | null; // @deprecated — ABSOLUTE trips only
  plannedArrivalAt: number | null; // @deprecated — ABSOLUTE trips only
  plannedDepartureAt: number | null; // @deprecated — ABSOLUTE trips only
  confirmationCode: string | null;
  notes: string | null;
  place: PlaceRef | null;
  linkUrl: string | null; // e.g. an Airbnb/Booking.com listing link
  linkPreview: LinkPreview | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

#### Rental Document

Path: `apps/waypoint/trips/{tripId}/rentals/{rentalId}` — surfaced like Stays: a Rentals tab on desktop, a Rentals entry under Stays on a phone's Overview. Cars only for now (`rentalType: 'CAR'`).

```typescript
interface Rental {
  id: string;
  tripId: string;
  rentalType: 'CAR';
  name: string; // the rental company
  vehicle: string | null; // free text, e.g. "Toyota RAV4 or similar"
  pickupAddress: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupPlace: PlaceRef | null;
  returnAddress: string | null; // null = returned where it was picked up
  returnLatitude: number | null;
  returnLongitude: number | null;
  returnPlace: PlaceRef | null;
  pickupDayIndex: number; // trip day + "HH:mm", on every trip — absolute-model trips never move their dates
  pickupTime: string;
  returnDayIndex: number;
  returnTime: string;
  timezone: string | null; // zone override; null follows the trip's timezone
  confirmationCode: string | null;
  notes: string | null;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Write permissions match Stays (`canCreateItem` / `canEditExistingItem`, mirrored in `firestore.rules`), and `shiftTripDates` rebases `pickupDayIndex`/`returnDayIndex` like every other dated item. On a live trip Overview shows a card for each pickup and return that falls on today, right after the check-in cards, labelled "Picking up today" / "Returning today" and flipping to "Picked up" / "Returned" once the time passes. Rentals aren't part of the "What's new" notifications yet.

#### Weather

Forecasts come from Open-Meteo (`src/lib/weather/`, keyless, CC BY 4.0 — `WeatherAttribution` credits it wherever weather shows). Nothing is stored in Firestore: `useTripWeather` plans what to fetch from data the trip already has and reads it through TanStack Query (`weatherForecastQueryOptions`, 30 minute `staleTime`, persisted offline).

- **When:** `getWeatherDayIndexes` shows every trip day inside the provider's window: the next 14 days and the last 90, whatever the trip's state (a finished or archived trip within that window still shows how it went), plus any buffer day that has an event. A day with nothing located of its own takes the nearest located day (the earlier one on a tie), so a multi-city trip never shows a blank day inside the window.
- **Where:** a day's location is its first non-archived event with coordinates, else a stay covering the day. A day with neither borrows the nearest located day's place: always for today, so the live forecast never depends on what's planned, and for other days only when every located event and stay on the trip is within ~100 km of the others (a multi-city trip shows no weather rather than guess the city). An event gets its own hourly chip only on a `RELATIVE` trip with coordinates and a start time; its floating `"HH:mm"` matches the provider's zone-local hours directly.
- **Requests:** places are keyed by coordinates rounded to ~10 km and zone, and each key is one request spanning the dates that need it. A loading or failed request reads as "no weather" and never blocks the Timeline.
- **UI:** `WeatherDayStrip` heads the Timeline with every day that has a forecast (past days dimmed, today highlighted and centred); tapping a day jumps the Timeline to it. `DayWeather` tops each Timeline day (its header fades in a sky photo from `public/by-app/waypoint/weather/`, picked per condition by `WEATHER_BANNER_IMAGES`) (compact in the day header when "Compact weather" is on in the Timeline's View options, remembered in `localStorage`); the hour-by-hour `HourlyWeatherStrip` for today appears only in Overview's "Today's weather".

#### Enrichment: place search and link previews

Both `TimelineEvent` and `Stay` carry the same three enrichment fields:

```typescript
interface PlaceRef {
  placeId: string; // the only field Google's terms allow storing indefinitely
  mapsUrl: string;
  primaryType: string | null;
  photoUrl: string | null; // reserved for a future Places Photo lookup; currently always null
  photoRefreshedAt: number | null;
}

interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  fetchedAt: number;
}
```

**Cost discipline — fetch once, store.** A Places pick costs one Details (Essentials-tier)
call; typing itself is free because a session token ties the keystrokes to that call.
Picked places carry no photo: the Places Photo SKU is billed separately, and Google Maps
pages only expose a place photo to allowlisted crawlers, so covers come from attached links'
previews. Once stored, rendering never calls Google or the function again; a broken image
just hides itself. These are app-agnostic, so other mini-apps can reuse them: the
Places client lives at `src/lib/places/placesApi.ts`, the link-metadata client and the
image component at `src/lib/linkMetadata/fetchLinkMetadata.ts` and
`src/components/FallbackImage.tsx`, and the Cloud Function at
`functions/src/linkMetadata/fetchLinkMetadata.ts`.

**On keeping these as timestamps, not strings:** the skill's Data Schema rule is explicit and repeated three times — "no excuse for a TDD to introduce a `string` date field." I kept `checkInAt`/`checkOutAt` as `number` rather than following the string suggestion, but added `checkInTimezone` to solve the actual underlying concern: a hotel's "3pm check-in" means 3pm *local to the property*, and a raw millisecond timestamp alone doesn't carry that — the timezone field is what lets it render correctly as local time without abandoning the convention. This is the "date + timezone" option floated as an alternative, applied without the string-typing part. Flagging this as a real judgment call rather than silently picking a side — happy to revisit if the intent was specifically to break from the timestamp convention here.

No `linkedEventIds` — the relationship to events and days is derived, not stored (see State Machines).

#### 4. Checklist Item Document

Path: `apps/waypoint/trips/{tripId}/checklist/{checklistId}`

```typescript
interface ChecklistItem {
  id: string;
  tripId: string;
  title: string;
  category: ChecklistCategory;
  customCategoryLabel: string | null; // populated only when category is 'OTHER' — used as that Disclosure group's label
  assignedToUids: string[]; // [] — can be assigned to more than one member
  isCompleted: boolean;
  markedCompletedByUid: string | null; // who checked it off — not necessarily who did the underlying task
  markedCompletedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

#### 5. Expense Document

Path: `apps/waypoint/trips/{tripId}/expenses/{expenseId}`

```typescript
interface TripExpense {
  id: string;
  tripId: string;
  dayIndex: number | null; // null = the "Other" bucket — not tied to any specific day (e.g. paying for the whole stay upfront)
  title: string;
  amount: number | null; // exactly one of `amount` or the amountMin/amountMax pair is populated
  amountMin: number | null; // for an estimate/range instead of a known figure (e.g. "$10-$30")
  amountMax: number | null;
  currency: string;
  isPerPerson: boolean; // amount fields are per person; totals, dues, and the split multiply by the split's headcount
  payerUid: string;
  status: ExpenseStatus; // PAID or EXPECTED/upcoming
  targetType: ExpenseTargetType; // defaults to EVERYONE_CURRENT on Add; changeable via the separate Split action
  targetMemberIds: string[]; // snapshot for EVERYONE_CURRENT (informational only; "Everyone" resolves against current members) and SPECIFIC_MEMBERS; [] for EVERYONE_INCLUDING_FUTURE (computed live from trip.members) and JUST_ME (implied as [payerUid])
  splitAmounts: Record<string, number> | null; // per-member override once adjusted away from the auto-suggested even split; null = still even
  paidMemberStatus: Record<string, { isPaid: boolean; paidAt: number | null }>;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

**Add and Split are genuinely separate actions, not one form.** Add only needs `title`/`amount-or-range`/`payerUid`/`dayIndex` — it's saved immediately with `targetType: 'EVERYONE_CURRENT'` and `targetMemberIds` snapshotted from the trip's current members, so the fast path costs one step. Split is an explicit follow-up that lets the four target options be reconsidered (including switching to `EVERYONE_INCLUDING_FUTURE`, which clears `targetMemberIds` back to `[]` since that option is computed live rather than snapshotted) and lets the auto-suggested even split be adjusted per person via `splitAmounts`, or reset back to even by nulling it out.

`isCoveredByOther`/`coveredByUid` from the original draft are dropped for now — they're Stretch Goal fields (per the README's Covered-By Toggle) and don't need to exist on the MVP schema until that feature is actually being built.

**Confirming this covers the "who actually consumed this" case** (e.g., 4 adults at a zoo, one of whom is also paying for a child): the simplest path — one `TripExpense` per ticket, each with its own `payerUid` and `targetType: 'JUST_ME'` — already works with zero schema changes. The adult covering a child's ticket just creates two `JUST_ME` expenses under their own `payerUid`; their personal total (a plain filter on `payerUid`) naturally includes both, while everyone else only ever sees their own. Visually clustering related expenses under one heading ("Zoo tickets") so they don't read as unrelated line items is a real but separate improvement — worth a `groupLabel: string | null` field if it's ever prioritized, not designed further here.

#### 6. Comment / Proposal Document

Path: `apps/waypoint/trips/{tripId}/comments/{commentId}`

```typescript
interface TripComment {
  id: string;
  tripId: string;
  targetType: CommentTargetType;
  targetEntityId: string; // an eventId, stayId, or expenseId — or the tripId itself when targetType is 'TRIP'
  authorUid: string;
  authorName: string; // denormalized fallback only — UI prefers a live useUserInfo(authorUid) lookup
  authorPhotoURL: string | null;
  text: string;
  isProposal: boolean;
  proposalData: {
    field: string;
    suggestedValue: any;
    status: ProposalStatus;
    reviewedByUid: string | null;
    reviewedAt: number | null;
  } | null;
  createdAt: number;
  lastEditedAt: number;
}
```

#### 7. Trip Idea Document (restaurant, activity & stay idea board)

Path: `apps/waypoint/trips/{tripId}/ideas/{ideaId}`

```typescript
interface TripIdea {
  id: string;
  tripId: string;
  ideaType: IdeaType;
  title: string;
  notes: string | null;
  linkUrl: string | null;
  ideaDetails: IdeaDetails | null;
  addedByUid: string;
  voterUids: string[]; // []
  convertedToEntityId: string | null; // the resulting TimelineEvent or Stay id, once converted
  createdAt: number;
  lastEditedAt: number;
}

interface IdeaDetailsBase {} // shared base, mirroring TransitDetailsBase — no common fields yet

interface SingleOccasionIdeaDetails extends IdeaDetailsBase {
  // shared by ideas that happen on one day at roughly one time — Restaurant and Activity, not Stay
  suggestedDays: number[]; // [] — dayIndex values; empty means no day preference (e.g. "lunch works any day")
  suggestedTimeBlocks: TimeBlock[]; // [] — multi-select; brunch is Morning *and* Afternoon
}

interface RestaurantIdeaDetails extends SingleOccasionIdeaDetails {
  cuisines: string[]; // []
}

interface ActivityIdeaDetails extends SingleOccasionIdeaDetails {
  settings: ActivitySetting[]; // [] — multi-select, matches ActivityEventDetails.settings
}

interface StayIdeaDetails extends IdeaDetailsBase {
  location: string; // a plain free-text grouping tag ("Tokyo", "Kyoto leg") — not a formal Leg entity
  matchedCriteriaIds: string[]; // [] — which of the trip's shared StayCriterion docs this idea satisfies
  perks: string[]; // [] — free-form extras not on the shared list
}

type IdeaDetails = RestaurantIdeaDetails | ActivityIdeaDetails | StayIdeaDetails;
```

Converting carries every known `ideaDetails` field straight across (see State Machines): Restaurant/Activity → a `TimelineEvent` with `eventDetails.cuisines`/`settings` copied directly, and `suggestedDays`/`suggestedTimeBlocks` used to pre-fill (not auto-commit) the day/time the conversion form opens to; Stay → a `Stay`, with `matchedCriteriaIds`/`perks` intentionally *not* carried over — they did their job during the decision and aren't needed once a place is booked.

Before the conversion form opens, `IdeaToEventModal` looks the idea's title up with `findTopPlace` (`queries/ideaPlaceQueries.ts`, a TanStack Query; a failed or empty search reads as no place): a hit prefills the event's location, address and coordinates and leaves the title blank so the place's name becomes the title, and only a miss prefills the idea's title as a custom one.

`convertIdeaToEvent` (Editor/Admin, same gate as creating an event) is one `runTransaction`: it re-reads the idea, aborts if it was removed or already converted, then creates the event and sets `convertedToEntityId` together; the reminder is scheduled first and cancelled if the transaction fails. `firestore.rules` allow that single-field idea update only when the event is created in the same commit by the same user.

#### 8. Stay Criterion Document (shared trip-level stay preferences)

Path: `apps/waypoint/trips/{tripId}/stayCriteria/{criterionId}`

```typescript
interface StayCriterion {
  id: string;
  tripId: string;
  label: string; // "Near a train station", "Has air conditioning"
  tier: StayCriterionTier;
  createdBy: string;
  createdAt: number;
}
```

A shared, group-agreed checklist of what matters in a place to stay, set once at the trip level rather than each `StayIdea` inventing its own list.

#### Shared Album — a link, not stored photos

No `AlbumPhoto` collection, no Storage usage — just the `sharedAlbumUrl`/`sharedAlbumSetByUid`/`sharedAlbumSetAt` fields on `TripSpace` above.

#### Live Travel Status (Realtime Database, not Firestore)

Path: `/waypointStatus/{tripId}/{uid}`

```typescript
{
  status: string; // capped at 50 characters, enforced client-side and by an RTDB validation rule
  note: string | null;
  updatedAt: number;
}
```

Ephemeral by design, mirroring the existing `/presence/{userId}` pattern: no history, latest write wins.

---

## State Machines & Logic

**1. Event Active Status Machine**

```
[UPCOMING] ---> now >= start ---> [ACTIVE] ---> now >= impliedEnd ---> [COMPLETED]
```

`start`/`impliedEnd` are real instants, computed by `getEventTime` in `utils/tripTime.ts`: on a relative trip, the event's trip day + `startTime` read in its effective zone (`event.timezone ?? trip.timezone`); on an absolute trip, `startAt`. `impliedEnd` is the explicit end when set, otherwise the end of the event's own day — an event with no end time doesn't stay "Active Now" forever. An event with no day, or on a day outside the trip's dates, has no instant and is never live. A trip's Active/Past badge and progress are judged by the viewer's local calendar day, so its last day still counts as active; who may write (admin-only once underway) uses the UTC boundaries `firestore.rules` can see (`startDate` to `endDate` + one day). Among several simultaneously `ACTIVE` events, the Now pill shows whichever started most recently.

**2. Proposal Approval State Machine**

```
[PENDING] ---> Editor/Admin clicks "Approve" ---> Batch apply change to Event/Stay/Expense doc + set ProposalStatus to APPROVED
           ---> Editor/Admin clicks "Decline" ---> Set ProposalStatus to DECLINED
```

Once the trip has started, approving a proposal against an **event** specifically is Admin-only, not Editor — approving is itself a way of changing the event, so it follows the same rule as a direct edit (see #4). Proposals against Stays/Expenses are unaffected.

**3. Stay / Leg Segmentation (derived, not stored)**

No separate "Leg" entity. The timeline groups by `dayIndex`/`endDayIndex`; which `Stay` is "active" for a day is derived by checking whether the day falls between each Stay's planned arrival and departure days — the group's actual intent, not the official check-in/check-out. A transition day can have more than one Stay active (checking out of one place, into another the same day) — the derivation returns every matching Stay, not just one, and the UI stacks their banners.

**4. Event Change Visibility — append-only history, Admin-only after start**

Two conditions, both required:
- **Gated to an already-started trip**: `changeHistory` only accumulates once `now >= trip.startDate`.
- **Every edit is appended, not overwritten**: on a write touching `startTime`/`endTime` (`startAt`/`endAt` on absolute trips)/`locationName`/`dayIndex`/`endDayIndex`, the client diffs against the previous state, collects every changed field into one `EventChangeSnapshot`, and appends it. If Admin A moves the start time and Admin B later moves the location, both snapshots survive in order.

Combined with the write rule below, every entry in `changeHistory` was necessarily made by an Admin, which is what makes the log trustworthy. Updating or deleting an *existing* event once the trip has started is Admin-only; creating a brand-new event or stay follows the same narrowing — open to Editors before the trip starts, Admin-only once it has (`canCreateItem`) — since an already-underway plan needs one steward either way.

**Worth flagging in the UI**: the *live* value of a field is always whoever wrote last, even though both edits remain visible in `changeHistory`. If Admin A moves an event to 2pm and Admin B independently moves the same event to 3pm moments later, A's edit doesn't disappear from the record, but it's no longer what's shown by default — someone would need to expand the history to see it happened at all. That's expected last-write-wins behavior, not a bug, but the UI shouldn't make it look like B's edit is the *only* one that occurred.

**Relative vs. absolute times**

Trips carry a `timeModel`. A **relative** trip stores every dated item as a trip day number plus a floating `"HH:mm"` — "Day 2, 09:00" is 9:00 AM wherever you are, shown identically to every viewer, which is what makes moving the trip's dates a single trip-document write. An **absolute** trip (anything created before relative times; a document with no `timeModel`) keeps events and stays as real timestamps and its dates are fixed: the date editor is hidden and `firestore.rules` rejects a change to `startDate`/`endDate`/`timezone`. `utils/tripTime.ts` is the one place that knows about both: `getEventTime`/`getStayTime` normalise either shape for the UI and selectors, and `buildEventTimeFields`/`buildStayTimeFields` build the right write for each. Superseded fields (`startAt`, `checkInAt`, …) stay in the types, marked `@deprecated`, because existing trips still carry them.

A zone is only needed to turn a relative time into a real instant — for reminders and the Now / Up next pill. `trip.timezone` is the default (the creator's zone at creation, editable from the trip header); an event or stay can override it, and an event's end can be in yet another zone (`endTimezone`, e.g. a flight that lands elsewhere: its clock times then read in their own zones, and ordering is checked on the real instants, since the end can read earlier on the clock than the start). Zones come from the runtime's IANA database, so daylight saving is automatic and a zone that doesn't observe it (Phoenix) stays put; the picker (`@/utils/timezoneSearch`) searches by city, nearby well-known cities and zone name ("Eastern Time Zone"), and an airport's own zone fills a flight's departure and arrival zones. Day-of views, grouping and display never use it.

**Days around the trip.** An event, stay, rental or expense may be dated up to `MAX_DAYS_OUTSIDE_TRIP` (3) days before the first day or after the last, for travel days; those days get their own timeline tab ("1 day before · Oct 14") once something is planned on them. Anything further out is still stored but shows under "Outside trip dates". A **checklist item's** due day is unbounded (book the car two months ahead) and is a distance from the trip's start, so it always moves with the trip.

**4a. Changing Trip Dates**

On a relative trip the default is one write to the trip document: every item keeps its day number, so everything moves with the trip. Items whose day is now more than 3 days past the last day (or before the first) are kept, not nulled — they render under an "Outside trip dates" group and come back if the trip is extended again; the edit form warns about how many will land there. Every date input that is part of a range (trip, event, stay) carries the end along when the start moves, keeping the range's length.

When the start date moves, the edit form also asks **"What happens to your plans?"** as two pills, "They move with the trip" (the default, with a line saying how many days everything slides) and "They stay on their dates". Choosing the second, the client calls the `shiftTripDates` callable, which rebases every event, stay, rental and expense's day number, and each idea's suggested days (checklist due days are never rebased: they stay relative to the trip's start), by the start-date delta inside one Admin SDK transaction — Admin because `firestore.rules` limit who can write events and stays on a live trip, and a transaction so a concurrent edit can't be half-applied. A trip with more than ~450 items is refused rather than half-rebased.

Reminders are absolute instants (the delivery function only reads `scheduledFor`), so they have to follow the trip: the `rescheduleTripReminders` Firestore trigger runs when a relative trip's `startDate`, `endDate` or `timezone` changes and re-derives every reminder from the stored events — moved when the event is still on the calendar, cancelled when it falls outside the trip or has no day, and re-created (with `reminderId` written back) when it returns to range after its reminder was cancelled or sent. Clients can only cancel a reminder, so this is the one place a reminder is rescheduled.

**4b. Deleting a Trip**

An Admin deletes a trip through the `deleteTrip` callable, not a client `deleteDoc` — deleting a Firestore parent document leaves its subcollections behind, and the invite-code rule denies client deletes. The function removes the trip document and its invite code in one batch (so a trip is never left with a live invite), then recursively deletes the trip's subcollections, its `pendingRequests`, its events' scheduled reminders, and its Storage files.

**5. Dues / Settle-Up Calculation**

Client-side (`splitCalculators.ts`) over the already-loaded expenses, with two qualifications the earlier draft didn't have:
- **Only `status: 'PAID'` expenses with a resolved `amount` feed the per-expense dues** (early payments, below, are the exception: they net in from an `EXPECTED` expense). An `EXPECTED`/range expense contributes to the Expected and Total figures on the Expenses screen, but not to "who owes whom" yet — it doesn't have a final, splittable number until it's actually paid.
- **Paid early (`earlyPayments`).** On an `EXPECTED` expense a member in its split can record money they already sent a someone: `earlyPayments[fromUid] = { toUid, amount, paidAt, isReturned, returnedAt }`, one per member per expense, written with dotted-path `updateDoc` (`setEarlyPayment`, `removeEarlyPayment`, `setEarlyPaymentReturned`) so it never overwrites a someone's concurrent write or an editor's save. The amount can't exceed the sender's share (for an estimated range, the share of the maximum; the default is the share of the minimum). Money sent early is money the recipient holds for the sender, so `computePairSettlements` lowers what the sender owes the recipient by it until it is returned, and a pair with only early payments still appears. Once the recipient pays the expense, their share of it cancels against the early payment (anything extra stays owed back); if someone else pays, or the plan falls through, the recipient still owes it, and the sender taps "Got it back". Netting is per expense (`groupOwedByDirection`): an applied early payment covers that sender's share, only the excess is owed back, and marking a share repaid cannot double-count it. The Dues summary opens with a notice for the signed-in person's pending or held early payments, and the pair sheet lists how the net adds up. Rules: a member writes only their own key; amount, recipient and shape are validated; once the expense is paid only `isReturned`/`returnedAt` can change (or the entry be removed); editors can't add or change one but can remove one (a wrong claim, or its author left); an expense that has any early payment can't be deleted until each is removed; an amount can't exceed the whole expense, and an everyone-expense counts whoever is on the trip now. Documents without the key read as `{}` (`getEarlyPayments`).
- **The Expenses totals have three views**: per person, group, and mine (`computeMemberTotals`: what I paid, what is still expected for me, my total share; ranges stay ranges).
- **"Everyone" expenses (`EVERYONE_CURRENT`, and the legacy `EVERYONE_INCLUDING_FUTURE`) compute their share against the trip's *current* `members` at calculation time**, not the stored `targetMemberIds` snapshot, so someone who joins later is included even in already-paid dues. The Split modal offers a single "Everyone on the trip" option. `SPECIFIC_MEMBERS` uses the stored `targetMemberIds`. `splitAmounts`, when set, overrides the even split per member, but only while it covers everyone in the split; once a new member is missing from it, the split falls back to an even division across whichever member set applies.

**6. Total Expenses Rollup (derived, not stored)**

Three figures on the Expenses screen — Paid so far, Expected/upcoming, and their combined Total — are each a sum over the day-grouped (or "Other") expense list, filtered by `status`. When any contributing `EXPECTED` expense is a range, the Expected and Total figures are themselves ranges (sum of mins, sum of maxes).

**7. Live Travel Status**

Writes go straight to Realtime Database at `/waypointStatus/{tripId}/{uid}` — ephemeral and high-frequency, outside Firestore/Redux's optimistic-write machinery, the same way presence does.

**8. Shared Album Reminder — visibility, not notification**

A plain selector: *(current time is near the end of `dayIndex`, or near the trip's `endDate`)*. If `sharedAlbumUrl` is set, nudge everyone to add today's photos there; if not, nudge an Editor/Admin to add one. No device tokens, no scheduled Cloud Function.

**9. Realtime Presence Integration**

Unchanged: consumed from the global `/presence/{userId}` RTDB path, matched against trip members.

**10. Idea Board Prominence (derived, not stored)**

Whether the idea board renders prominent (pre-trip) or quiet (post-start) is derived purely from `now < trip.startDate` — the same UTC boundary `firestore.rules` uses to close idea creation (`hasTripStarted`, not the header's local-day status). Pre-trip, Overview shows one prominent card (an Activities / Restaurants toggle, defaulting to Activities, over that type's top three undecided ideas with inline voting; tapping one opens its details (drawer on phones, popover on wider screens); plus an "Add an idea" button and "See all"); once the trip starts it becomes a quiet chevron row on phones, the Ideas tab stays on desktop, nobody can post a new idea, and voting and reading never close. An idea with `convertedToEntityId` set shows an "On the itinerary" badge and drops out of the Overview preview.

**11. Idea → Itinerary Conversion**

One atomic write either way: create the target entity (a `TimelineEvent` for Restaurant/Activity, a `Stay` for a Stay idea) and set `convertedToEntityId` on the source `TripIdea` in the same batch. Follows the same permission as creating that target type directly (`EDITOR`/`ADMIN`), even though posting/voting on the idea itself is open to everyone.

**12. Stay Idea Grouping (derived, not stored)**

A client-side `groupBy` on `ideaDetails.location` over the already-loaded ideas list — a plain string tag, not a query.

**13. Member Approval, Removal, and Role Changes (Admin-only)**

```
[REQUESTED] (apps/waypoint/pendingRequests/{uid}_{tripId} created on following the invite link)
   ---> Admin approves, choosing a role ---> atomic batch: add uid to trips/{tripId}.members with that role + delete the request doc
   ---> Admin declines ---> delete the request doc, no membership granted
[MEMBER] ---> a different Admin changes their role (promotion to Admin included) ---> role updated
         ---> a different Admin removes ("kicks") them ---> uid removed from `members`; historical
              assignments (past checklist/expense/comment records) are left as-is — only future access is revoked
```

**13a. Event Archive, Activity Tracking, and Suggested Replacements**

`TimelineEvent` additionally carries `isArchived: boolean` and `seenBy: Record<uid, number>`. Archiving mirrors the trip-level pattern (`isArchived`/`setTripArchived`) — an Admin-only toggle (enforced in the action, the UI, and `firestore.rules` alike — whatever the trip's phase, since approving a suggestion archives its source event even pre-trip), offered in the Timeline once the trip has started, that excludes the event from the default Timeline view without deleting it. `seenBy` tracks, per member, when they last viewed an event; a member writes only their own key, through a Firestore transaction (not a plain `updateDoc`) since it's a genuinely multi-writer map — the same reasoning `runTransaction`-based writes elsewhere in this doc apply to `members`.

An event is "unseen activity" for a member when its `createdAt` (if `>= trip.startDate`, i.e. created post-start) or its latest `changeHistory` entry's `latestChangedAt` is newer than that member's `seenBy` entry. Overview surfaces these under a "Recent updates" list; opening an event's details marks it seen.

A separate, flat trip subcollection, `apps/waypoint/trips/{tripId}/eventSuggestions/{id}`, lets any member propose a replacement (new title/time/location) for an existing event and upvote others' suggestions (own-uid-only array membership). A suggestion's end time must fall after its start time (checked in the form, the action, and the rule). Editing one runs in a transaction and writes only its content fields, never `upvotedBy`, so a concurrent vote can't conflict with the edit. Approving one — Admin-only, a single transaction that re-reads the source event and the suggestion and aborts if either was archived, removed, or edited meanwhile — archives the source event (stamping `archivedBy`/`archivedAt`, so other members see the "Archived" update), creates a new `TimelineEvent` from the suggested fields (carrying over everything not overridden: event type, attendees, reminders, notes), and deletes the suggestion, in one batch.

**13b. Admin Announcements**

`apps/waypoint/trips/{tripId}/announcements/{id}`: `severity` (`INFO`/`HEADS_UP`/`URGENT`), `title`, `body`, an optional `expiresAt`, and `dismissedBy: Record<uid, number>` (own-key-only, transactional, same shape/reasoning as `seenBy` above). Create/delete is Admin-only, and the author can't dismiss their own announcement (the rule rejects it, not just the UI) — the one subcollection in this schema where `EDITOR` doesn't suffice for create. "Live" for a given member is `!expired && uid not in dismissedBy`; Overview stacks every live announcement at the top, each opening a detail modal with a Dismiss action.

No member — Admin included — can change their own role; it always has to be a different Admin, which also means the trip creator can never self-demote.

**14. Auto-Generated Transit Leg (Next Steps tier, not MVP)**

```
Add an event --> is there a prior event that day?
  --> yes: propose a DRIVE TimelineEvent (isAutoGenerated: true) between the prior event and this one
  --> no, it's the day's first: propose one beforehand
--> user's call:
  --> keep as transit: customize transitType/transitDetails, set isAutoGenerated: false
  --> it's actually downtime: convert straight to a FREE_TIME event, discarding the transit-specific fields
  --> not needed: delete it
```

Defaults to driving as the common case, but genuine downtime between events (no real travel) is just as common, so converting straight to Free Time needs to be exactly as easy as accepting the default — never just accept-or-delete. `isAutoGenerated` distinguishes a still-default leg from one the user has actually looked at.

---

## Security Rules Design Criteria

- **`trips/{tripId}`**: read allowed if `request.auth.uid` is a key in `members` — nothing else, no pending-related exception (see Criterion #8). Changing a role and removing a member are security-critical transitions restricted to `ADMIN`.
- **`pendingRequests/{requestId}`**: see the full rules block in the Data Schema section above — three-branch read (path-based self-check, "my requests" query safety, "requests for my trip" query safety), create requires the caller's own uid plus a real, not-yet-joined trip, delete restricted to the requester or a trip Admin, update always denied.
- **`events/`, `checklist/`, `expenses/`, `stays/` subcollections**: membership-based against the parent trip's `members` map, role-checked for write (`ADMIN`/`EDITOR` full write; `COMMENTER` write on their own assigned items/proposals; `VIEWER` limited to their own expense-paid toggle and their own `earlyPayments` entry — the paid toggle may insert the member's own missing `paidMemberStatus` key on an `EVERYONE_INCLUDING_FUTURE` expense, since people who join later aren't backfilled). `createdBy` can't be spoofed post-creation; everything else — `notes`, `transitDetails`, `changeHistory`, `splitAmounts`, `dayIndex` — is a type/shape check only, so a new nullable field never touches `firestore.rules`. **`events/` and `stays/` specifically**: updating/deleting an *existing* item once `now >= trip.startDate` is `ADMIN`-only, and creating a brand-new one narrows the same way (`isTripCreateAllowed`) — `EDITOR`s can add new events/stays before the trip starts, `ADMIN`-only once it has. Event and stay shapes branch on the parent trip's `timeModel`: a relative trip's events require a `"HH:mm"` `startTime` and null `startAt`/`endAt`, `dayIndex`/`endDayIndex` are null together or an int pair, and stays need all four day + time points in order; an absolute trip keeps the timestamp shape. New trips must be created `RELATIVE` with a `timezone`, `timeModel` can't change afterwards, and an absolute trip's dates and timezone can't be edited. A trip counts as active through its whole last day (`endDate` + one day).
- **`comments/{commentId}`**: posting is covered by the general membership rule; approving/declining a proposal is a dedicated narrow rule restricted to `ADMIN`/`EDITOR` (or `ADMIN`-only post-trip-start for event-targeted proposals, per State Machine #2).
- **`ideas/{ideaId}`**: reading open to any trip member, and creating open to any member (every role) **until `now >= trip.startDate`**, as themselves (`addedByUid`) with no votes but their own and no `convertedToEntityId`. Voting is narrow and never closes: a member can only add/remove *their own* uid from `voterUids`. `linkUrl` must be `null` or an `http(s)://` URL (it is rendered as an href), validated client-side by the shared `isValidHttpUrl` in `src/utils/urlUtils.ts`. Editing and deleting are open in any trip phase, but editing is the idea's poster only (an Admin can additionally delete anyone's idea): an edit may change only `ideaType`, `title`, `notes`, `linkUrl`, `ideaDetails` and `lastEditedAt` (never votes, `addedByUid` or `convertedToEntityId`), and a delete of an already-converted idea leaves its event untouched. Setting `convertedToEntityId` is denied until the issue that adds it. Idea `suggestedDays` follow the "keep plans on their original dates" shift like other items, except that suggested days landing outside the new range are cleared — the idea itself is always kept, and with none left it just has no day preference. Without that option the days stay put, and the card hides any beyond the trip's length.
- **`stayCriteria/{criterionId}`**: reading open to any member; write follows the same `EDITOR`/`ADMIN` rule as the departure checklist.
- **Criterion #7 (visibility field as query filter)**: not applicable — Waypoint has no private/public-style field anywhere in this schema.
- **Criterion #8**: confirmed satisfied by construction — see the Data Schema section's pending-requests writeup.

---

## Client State Management (Redux Toolkit)

- **Central vs. app-scoped**: if no earlier mini app has introduced `src/store/` yet, Waypoint's Phase 4 roadmap includes the one-time central store foundation issue. Otherwise, Waypoint builds directly on it.
- **Typed per-app state**: `WaypointState` composes `trip`, `expenses`, `events`, `eventSuggestions`, `announcements`, `ideas`, `checklist`, `stays`, and `pendingRequests` sub-slices (no `album` slice — the shared album is just fields on the trip doc), exposed via a base `selectWaypoint(state)`.
- **Member display info is never in Waypoint's own state.** `TripMember` only carries `uid`/`role`/`joinedAt`; any component rendering a member's name or avatar resolves it via the existing central `useUserInfo(uid)` hook.
- **`resetAllState`**: dispatched on UID change, including via `DevAccountSwitcher`.
- **Multi-doc atomic mutations get their own actions**: `proposalActions.ts` (approve/decline), `membershipActions.ts` (approve/decline pending request, change role, remove member — all Admin-only, atomic per State Machine #13), `ideaActions.ts` (post an idea, toggle a vote, edit (poster only) and delete (poster or Admin); conversion to an event or stay joins it later).
- **Snapshot listener tiering**: all Firestore listeners are started from `useWaypointSync.ts`, called once at the app root (`Waypoint.tsx`), mirroring Nine Lives' `useNineLivesSync.ts` — never from inside a leaf/tab component, so switching tabs or reopening the same trip never tears down and resubscribes a listener.
  - *User-level* (while signed in, not tied to any open trip): every trip the user belongs to, and "my pending trips" — `where('uid', '==', myUid)` against `apps/waypoint/pendingRequests`, rendered via `MyPendingTrips.tsx` with a follow-up fetch per result to resolve `tripId` to a trip title, and a Withdraw action that deletes the requester's own doc (`cancelJoinRequest` — see Client hooks pattern: the requester-facing cancel action is mandatory, not a later follow-up).
  - *Eager* (on opening a trip): the trip doc, events, stays, checklist, ideas, stay criteria, a lightweight expenses listener (dues/totals are whole-trip visibility, not a per-item drill-down), a pending-proposal *count* for `ADMIN`/`EDITOR`, and — for an `ADMIN` — a `where('tripId', '==', tripId)` query against `apps/waypoint/pendingRequests`, gated the same way the Members tab UI is (Admin only).
  - *Loading gate*: the trip page doesn't render until every trip-scoped slice (events, stays, rentals, ideas, checklist, expenses, suggestions, announcements) has delivered its first snapshot for that trip (`selectIsTripDataLoaded`) — otherwise each section flashes its empty state, and Overview briefly reads "done for today" and shows the album banner, before its data pops in.
  - *Lazy* (only while open): full comment/proposal threads per event.
  - This hook has more than one item to key off, so it's worth explicitly following the skill's Known Footguns: key an effect on a stable derived string (not the array reference itself), and resolve `loading` to `false` immediately when there are zero pending requests rather than waiting on a listener that will never fire.
- **No Context/Provider.** `waypointContext.ts`/`WaypointProvider.tsx` from the very first draft don't exist in this design — components read via `useAppSelector`/`useAppDispatch` directly.

---

## Component Encapsulation

`Waypoint.tsx` is the sole top-level orchestrator — there is no separate `WaypointLayout.tsx` wrapper duplicating its job, which the original draft had and the skill's Component Encapsulation rule rules out directly. `Waypoint.tsx` owns exactly:
- The auth/loading gate.
- Which trip is currently selected — rendering the My-Trips-style picker (plus `MyPendingTrips`) when none is, or the tab-shell layout when one is.
- The modal state for switching trips or creating a new one.
- The layout/composition of the seven section components below — their order, nothing about how any one works internally.

Everything else — a section's own data selectors, its own "is the create form open" state, its own dispatches — lives inside that section's component, not the orchestrator.

---

## UI Component Conventions Applied

Every `*Section.tsx` below owns its create/edit forms via DreamerUI's `Form`/`FormFactories`, rendered in a `Modal`, per the skill's standing default — noted per-component in the file tree rather than repeated here. Two named exceptions:
- **Live Travel Status** — a lightweight popover/inline quick-entry rather than a full modal, given how frequent and small this action is (flagged as a genuine exception in the UX doc's Design Principles, not a silent deviation).
- **`EventFormModal`** uses **Steps** (local step-index state, no DreamerUI stepper exists) rather than `Disclosure` — the type-branching gives a natural sequence (pick category, then answer that category's one question) that Disclosure's independent-groups model doesn't fit as well.
- **`ChecklistSection`** groups its categories with stacked `Disclosure` (via the shared central `FormSection.tsx`), the default per the skill.

---

## Security & Privacy Requirements

- **Read Access**: full trip content (events, stays, checklist, expenses, comments) readable only by `members`. A join request is readable only by the person who sent it or an `ADMIN` of that trip.
- **Admin Write Boundaries**: everything an `EDITOR` can do, plus updating/deleting an existing event once the trip has started, approving/declining pending requests (assigning the role at approval), changing an existing member's role, and removing a member.
- **Editor Write Boundaries**: create, update, and delete stays, checklist items, stay criteria, and expenses; create new events and stays before the trip starts (Admin-only once it has — `canCreateItem`). Once the trip has started, updating/deleting an *existing* event is Admin-only.
- **Commenter Write Boundaries**: view all trip data, toggle checklist items assigned to them, update their own expense-paid status and early payment, post comments, submit edit proposals.
- **Viewer Write Boundaries**: read trip data and toggle their own expense-paid status only.
- **Social vs. planning actions**: live travel-status updates, and adding a Trip Idea (until the trip starts) and voting on one (any time), are open to every trip member regardless of role.
- **Shared Album Link**: any member can set it if unset; changing an existing link requires `EDITOR`/`ADMIN`.
- **Role Mutability Guard**: an `ADMIN` can change any *other* member's role, including promoting to `ADMIN` — never their own.
- **Member Removal**: revokes access immediately; historical assignments, expense shares, and authored comments stay intact.
- **Live Status Privacy**: visible only to trip members, writable only by the UID it belongs to; `status` capped at 50 characters.
- **Pending Request Privacy**: a requester's access is exactly their own request document — never any part of the trip they've requested to join (Security Rules Design Criteria #8).

---

## Component & File Architecture

```
src/apps/waypoint/
├── components/
│   ├── OverviewSection.tsx        (live only: today's check-ins, pickups, weather and agenda. Returns null pre-trip)
│   ├── NowPill.tsx                (live only: the floating Now / Up next pill over every main screen)
│   ├── IdeasOverview.tsx          (Overview: prominent pre-trip Ideas card, quiet row once the trip starts)
│   ├── TimelineSection.tsx        (day tabs incl. "All", stay banner(s), auto-transit legs)
│   │   ├── EventCard.tsx
│   │   ├── EventFormModal.tsx     (DreamerUI Form, Steps-grouped — see UI Component Conventions)
│   │   ├── TransitDetailsFields.tsx (dynamic sub-form keyed by transitType, incl. custom fields for OTHER)
│   │   ├── ChangeBadge.tsx        (shows the latest changeHistory entry, expandable to the full list)
│   │   └── MapNavigationButton.tsx
│   ├── ChecklistSection.tsx       (DreamerUI Form for items; Disclosure-grouped by category via FormSection)
│   ├── ExpensesSection.tsx        (day tabs incl. "All"/"Other"; Totals block)
│   │   ├── ExpenseFormModal.tsx   (DreamerUI Form — Add only: title/amount-or-range/payer/day)
│   │   └── ExpenseSplitModal.tsx  (DreamerUI Form — the distinct Split action: target type + members + splitAmounts)
│   ├── IdeasSection.tsx           (type filter: All/Restaurants/Activities; nested screen on phones)
│   │   ├── IdeaCard.tsx           (tap opens IdeaDetailsOverlay; timing line, tags, vote; converted ideas sit under an "Already on the itinerary" divider)
│   │   ├── IdeaDetailsOverlay.tsx (full idea, with Modify for the poster opening IdeaFormModal in edit mode and its guarded delete, and a guarded Delete for an Admin viewing someone else's idea: a drawer with a big centered vote on phones, a hover popover beside the idea's text, one at a time, with the compact vote on wider screens)
│   │   ├── IdeaVoteButton.tsx
│   │   ├── IdeaFormModal.tsx      (DreamerUI Form, create or edit: type + name up front; optional fields appear from a grid of add-chips, `AddFieldChips`)
│   │   └── StayCriteriaPanel.tsx  (DreamerUI Form — Editor/Admin-managed must-have/nice-to-have list)
│   ├── StaysSection.tsx
│   │   ├── StayCard.tsx
│   │   └── StayFormModal.tsx      (DreamerUI Form)
│   ├── MembersSection.tsx
│   │   ├── MemberRoleBadge.tsx
│   │   └── PendingMembersPanel.tsx (Admin-only — approve/decline, assign role at approval)
│   ├── MyPendingTrips.tsx          (a user's own pending requests, rendered by Waypoint.tsx when no trip is selected)
│   ├── SharedAlbumLinkCard.tsx     (DreamerUI Form, single field)
│   ├── TravelStatusPicker.tsx      (popover/inline, not a modal — see UI Component Conventions)
│   └── ProposalReviewModal.tsx
├── store/                          (app-scoped: slices, actions, listeners, selectors)
│   ├── slices/
│   │   ├── tripSlice.ts
│   │   ├── eventsSlice.ts
│   │   ├── staysSlice.ts
│   │   ├── checklistSlice.ts
│   │   ├── expensesSlice.ts
│   │   ├── commentsSlice.ts
│   │   ├── ideasSlice.ts
│   │   ├── stayCriteriaSlice.ts
│   │   └── pendingRequestsSlice.ts
│   ├── actions/
│   │   ├── proposalActions.ts      (approve/decline — atomic multi-doc write)
│   │   ├── membershipActions.ts    (approve/decline pending, change role, remove member — Admin-only, atomic)
│   │   └── ideaActions.ts          (createIdea, updateIdea, deleteIdea, toggleIdeaVote; conversion → event/stay joins later)
│   ├── listeners/
│   │   ├── tripListeners.ts        (eager tier — trip, events, stays, checklist, stayCriteria,
│   │   │                             expenses, proposal counts)
│   │   └── pendingRequestsListeners.ts (startMyPendingRequestsListener + startTripPendingRequestsListener —
│   │                                     plain functions, called only from useWaypointSync.ts)
│   ├── selectors.ts                (selectWaypoint + derived selectors, incl. dues/totals/stay-segmentation)
│   └── index.ts                    (exports WaypointState, reducer, selectWaypoint)
├── hooks/                          (thin — mostly listener-wiring, not data hooks)
│   ├── useWaypointSync.ts          (app-scoped Firestore sync, mirrors Nine Lives' useNineLivesSync.ts —
│   │                                 every listener starts here, called once from Waypoint.tsx, never from
│   │                                 a leaf/tab component; see Known Footguns note above)
│   ├── useTripTimeline.ts
│   └── useTravelStatus.ts          (thin RTDB read/write wrapper, outside Redux)
├── utils/
│   ├── tripTime.ts                 (relative/absolute time adapter — see "Relative vs. absolute times")
│   ├── mapUrlHelpers.ts
│   ├── roleGuards.ts               (incl. canApproveMembers/canChangeRole/canRemoveMembers — Admin-only, blocks self-role-changes)
│   └── splitCalculators.ts         (dues/settle-up netting, status- and range-aware per State Machine 5)
├── index.ts
├── README.md
├── security.ts
├── TECHNICAL.md
├── types.ts
├── UX.md
└── Waypoint.tsx                    (sole orchestrator — see Component Encapsulation)
```

## Email invitations

`apps/waypoint/emailInvites/{tripId}_{email}` (flat, a sibling of `pendingRequests`) is an Admin's standing yes for an email address (nothing is emailed; the UI calls it "adding" someone): `{ tripId, email (lower-cased), role (EDITOR | COMMENTER | VIEWER), invitedBy, invitedAt }`. The invited person never requests access. Opening the trip's invite link or code (or the invitation modal and icon button on My Trips) shows `EmailInviteJoinModal`, and joining is one `writeBatch`: the member is written by field path (`members.{uid}`; they can't read the trip yet, so there is no read-modify-write) and the invitation is deleted in the same commit. `firestore.rules` allow that update only for a signed-in user with a **verified** email matching the invitation, as themselves, with exactly the invited role, changing only `members`/`lastEditedAt`, and only if the invitation is consumed (`!existsAfter`). Admins create, re-role and withdraw invitations; the invitee reads and deletes (turns down) their own; every trip member can read the trip's. `deleteTrip` removes a trip's invitations.

## Filling a form from a confirmation

**After a save, the rest of the item.** `RelatedFlowProvider` (mounted once in `TripDetailPage`) hosts `AddRelatedFlow`, and `useRelatedFlow().startFollowUp(subject)` opens it from the event, stay and rental forms (create only; free time, walk/bike/scooter legs and "Add another flight" skip it, `isWorthFollowUp`) and after an idea becomes an event. The subject (`utils/relatedSubjects.ts`) carries the saved item's title, trip day and a matching expense and checklist category; the sheet offers an expense (`ExpenseFormModal` with `prefill`) and a checklist item (`ChecklistItemFormModal` with `prefill`, due that day), one overlay at a time, back to the sheet after each save. It lives above the trip's screens because an idea leaves the Overview list the moment it is converted, which would unmount anything owned by the idea's card. An expense records what it pays for in `linkedTo: { kind: 'EVENT' | 'STAY' | 'RENTAL', id } | null` (required key on new documents; older ones lack it and read as `null`, the listener defaults it and the edit actions write it back). The expense form's "What is this paying for?" select sets it, and the follow-up sheet links the expense to the item it just saved. `linkExpenseToPlan` links an existing expense in one transaction (re-reads it, refuses if it was linked meanwhile, and sets `dayIndex` only when the expense has none), reached from the badge's `LinkExpenseSheet`. `selectExpenseLinkKeys` is the set of linked items; `NotPaidForBadge` (via `useHasExpense`) shows "Not paid for yet" on an activity, stay or rental that is not in it, and the Timeline's "Only activities not paid for yet" filter uses the same set. A new expense can start split between specific people (`targetType: 'SPECIFIC_MEMBERS'` with the picked uids, which must all be trip members; the follow-up and the plan picker pre-select it from the event's attendees), so `firestore.rules` allow a create with `EVERYONE_CURRENT` or `SPECIFIC_MEMBERS` only (`JUST_ME` and `EVERYONE_INCLUDING_FUTURE` still come from Edit split), and a later split change is unchanged. `firestore.rules` validate the link's shape only (`kind` in the three, a non-empty `id`), never that the target exists: a target deleted later leaves a link that reads as none and must not block editing the expense.

**Weather details and timeline logistics.** The weather plan records, per day, the plan its forecast location came from (`placeName`, `isBorrowed` for a day with nothing located of its own); `useTripWeather().getDayDetails` adds that day's hours, and `WeatherDetailSheet` shows them over the condition's full backdrop. Stays and rentals reach the Timeline through `getLogisticsEntries` (`utils/timelineLogistics.ts`): planned arrival/departure, else official check-in/out, else the day alone (top of the day), merged by minute with the day's event items in `renderEventItems`.

Every leg except a flight has a location field that also shows `ItineraryPlacePicks`: stays, rental pickups and returns, and events with an address, deduped by place id or address, read from the store.

The flight (Travel + Flight), stay and rental forms show `UploadAutofill` when creating. A photo, screenshot or PDF goes to the Firebase AI (Gemini) model with a response schema (`lib/extractBookingFromFile.ts`, temperature 0, the trip's dates in the prompt so a date with no year lands on the trip; images shrunk with the shared `@/utils/imageCompression`). `utils/bookingImport.ts` maps the first entry onto the form's own shape (`flightToPrefill`, `stayToFields`, `rentalToFields`): dates become day numbers, an airport code gives the airport's coordinates and zone, a flight's airline is matched from the airlines list. It is lenient: a field it couldn't read is defaulted and named in `unread` so the form says what to check, and extra flights on the document are counted for the person to add. The form's own draft is replaced, so everything stays editable; nothing is stored from the file itself. A flight with no title is named from its route (`getDerivedTravelTitle`: "Flight DL 482 · SEA → JFK").

## Travel prompts and "my" Overview

`TravelPrompts` asks each member (who may add events) for their own arrival and departure until they have a travel event (non-archived, for them or everyone) in the first two or last two days; it can be dismissed per person per trip (local preference) and then shrinks to one line. The Now / Up next pill and the Today/Tomorrow agenda list only events the viewer is part of (`isEventForMember`); the Timeline still shows everyone's, with its own "only events I'm attending" filter.

## Form containers

Phone first, a form's container follows its content (CLAUDE.md, "Pick the container by the content"). Short forms stay `Modal`s: create trip, trip title, dates, cover, announcement, join code, album link, mark paid, stack, group, the email-invite welcome. Any other form that can scroll on a phone goes through `@/components/FormSheet`, a tall `Drawer` below `sm` (the screen behind stays in view, `ModalFooterActions` pinned to the bottom of the sheet) and a `Modal` from `sm` up: the stay, rental, expense, split, checklist-item, idea and suggestion forms. The event form, the most involved one, stays on `@/components/FormScreen`, a full-screen overlay `Subview` (own history entry so the back gesture closes it) below `sm`. An item's details drawer closes before its editor opens. Read-only detail of unpredictable length (notes, dues) uses `@/components/DetailSheet`, a drawer on phones. The forms ask what the journey depends on as visible `Pill` questions rather than "+ Add" chips: who's coming (it decides whose Overview shows the event), "Know when you arrive?" on a travel leg, "Already booked?" on a stay or rental, "Returning it somewhere else?" on a rental.

## Scale and speed
`scripts/seeds/waypointScale.ts` seeds "Big Group Reunion (scale test)" (code `BIGGROUP`: 120 members, a live 14-day timeline, 60 stays, 30 rentals, 250 checklist items, 60 ideas, 150 expenses with custom splits and early payments). Open any new list on it at phone width and switch tabs with the dev build throttled to 4× CPU (Playwright + CDP `Emulation.setCPUThrottlingRate`, `Profiler.start` to find the hot spot).

What keeps it quick:
- `useUserInfo` is a shared store: one listener per person that lingers five minutes after its last watcher leaves (tab switches remount every avatar), a per-person revision, batched notifications, cleared on sign-out.
- `zonedDateTimeToEpoch` and the `getEventTime`/`getStayTime`/`getRentalTime` resolvers are cached; `Intl` formatters are built once.
- `computePairSettlements` splits each expense once for all its debtors; the Expenses tab memoizes its totals and settlements.
- The Timeline and the Expenses list mount a day only near the viewport (`LazyMount`, the first 2 or 3 days eager) and mark each day `defer-offscreen` with a calibrated `--defer-size`; the filter sheet renders only while open.
- A tab switch renders in a transition (the nav answers at once) and `TimelineSection`/`ExpensesSection` are `memo`, so the tab that is leaving does not re-render for the nav's urgent update.

Dev build at 4× CPU on the scale trip, tab switch to first paint / main-thread blocking: Timeline ~200 ms / ~400 ms (was ~2.4 s), Expenses ~100–160 ms / ~500 ms (was ~1.0 s), Overview ~90 ms / ~130 ms. Still to try if a screen must show everything at once: real windowing of the day groups.

Background: [content-visibility](https://web.dev/articles/content-visibility) (skips offscreen rendering work; pair it with `contain-intrinsic-size`), and React's [`useTransition`](https://react.dev/reference/react/useTransition) and [`memo`](https://react.dev/reference/react/memo) for keeping a tap responsive while a heavy screen renders.
