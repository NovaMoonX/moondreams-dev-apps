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
  dateShiftStatus: 'IDLE' | 'PENDING'; // 'PENDING' while shiftTripDates is re-dating the trip — see 4a below
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
  dayIndex: number;
  endDayIndex: number; // equal to dayIndex for the common single-day case; higher for events spanning multiple days
  title: string;
  startAt: number;
  endAt: number | null;
  locationName: string | null; // not every event type has one — e.g. FREE_TIME
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDetails: EventDetails | null;
  notes: string | null;
  assignedMemberIds: string[]; // []
  changeHistory: EventChangeSnapshot[]; // [] — every post-trip-start edit, appended, never overwritten
  place: PlaceRef | null; // set by a Google Places pick — see "Enrichment: place search and link previews" below
  linkUrl: string | null; // booking/listing link — DINING and ACTIVITY only; other event types leave this null
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
  menuLink: string | null;
  cuisines: string[]; // []
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
  estimatedTravelTimeMs: number | null; // duration, not a point in time — milliseconds for consistency with every other time field
}

interface PointToPointTransitDetails extends TransitDetailsBase {
  startLocation: string | null; // free text — not every trip has a "city"
  endLocation: string | null;
}

interface FlightTransitDetails extends TransitDetailsBase {
  airline: string | null;
  flightNumber: string | null;
  confirmationCode: string | null;
  departureAirportCode: string | null;
  arrivalAirportCode: string | null;
}

interface DriveTransitDetails extends PointToPointTransitDetails {
  confirmationCode: string | null;
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
// startLocation/endLocation only apply to Drive/Walk/Bike/Scooter — Flight/Ferry/Train already
// have their own departure/arrival pair, so a generic start/end there would be a second way to
// say the same thing. Which variant applies is read off the sibling `transitType` field.
```

**Change tracking:**

```typescript
interface EventFieldChange {
  field: 'startAt' | 'endAt' | 'locationName' | 'dayIndex' | 'endDayIndex';
  previousValue: number | string;
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
  checkInAt: number; // official booking check-in — informational
  checkOutAt: number; // official booking check-out — informational
  checkInTimezone: string | null; // IANA name (e.g. "Asia/Tokyo") — one field covers both, since check-in/out are almost always the same property
  plannedArrivalAt: number; // drives Stay/Leg Segmentation — defaults to checkInAt at creation
  plannedDepartureAt: number; // defaults to checkOutAt at creation
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
`src/components/EnrichedImage.tsx`, and the Cloud Function at
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
[UPCOMING] ---> now >= startAt ---> [ACTIVE] ---> now >= endAt ---> [COMPLETED]
```

**2. Proposal Approval State Machine**

```
[PENDING] ---> Editor/Admin clicks "Approve" ---> Batch apply change to Event/Stay/Expense doc + set ProposalStatus to APPROVED
           ---> Editor/Admin clicks "Decline" ---> Set ProposalStatus to DECLINED
```

Once the trip has started, approving a proposal against an **event** specifically is Admin-only, not Editor — approving is itself a way of changing the event, so it follows the same rule as a direct edit (see #4). Proposals against Stays/Expenses are unaffected.

**3. Stay / Leg Segmentation (derived, not stored)**

No separate "Leg" entity. The timeline groups by `dayIndex`/`endDayIndex`; which `Stay` is "active" for a day is derived by matching the current time against each Stay's `plannedArrivalAt`/`plannedDepartureAt` window — the group's actual intent, not the official `checkInAt`/`checkOutAt`. A transition day can have more than one Stay active (checking out of one place, into another the same day) — the derivation returns every matching Stay, not just one, and the UI stacks their banners.

**4. Event Change Visibility — append-only history, Admin-only after start**

Two conditions, both required:
- **Gated to an already-started trip**: `changeHistory` only accumulates once `now >= trip.startDate`.
- **Every edit is appended, not overwritten**: on a write touching `startAt`/`endAt`/`locationName`/`dayIndex`/`endDayIndex`, the client diffs against the previous state, collects every changed field into one `EventChangeSnapshot`, and appends it. If Admin A moves the start time and Admin B later moves the location, both snapshots survive in order.

Combined with the write rule below, every entry in `changeHistory` was necessarily made by an Admin, which is what makes the log trustworthy. Updating or deleting an *existing* event once the trip has started is Admin-only; creating a brand-new event stays open to Editors throughout — this only restricts changing something already part of the plan.

**Worth flagging in the UI**: the *live* value of a field is always whoever wrote last, even though both edits remain visible in `changeHistory`. If Admin A moves an event to 2pm and Admin B independently moves the same event to 3pm moments later, A's edit doesn't disappear from the record, but it's no longer what's shown by default — someone would need to expand the history to see it happened at all. That's expected last-write-wins behavior, not a bug, but the UI shouldn't make it look like B's edit is the *only* one that occurred.

**4a. Changing Trip Dates**

Since `startDate`/`endDate` are only ever estimates at creation, shifting them later has to be safe by design, not just possible. When the trip has any dated items and the dates actually change, the client doesn't touch the affected subcollections itself — it calls the `shiftTripDates` callable, which does the work with the Admin SDK (so it isn't bound by per-document rules or client-side timeouts) and can reschedule a reminder directly, something a client write can only ever cancel.

The edit form offers a **"shift dated items" checkbox**, checked by default: checked, every event's `startAt`/`endAt` and every stay's `checkInAt`/`checkOutAt`/`plannedArrivalAt`/`plannedDepartureAt` shifts by the same delta as `trip.startDate`, preserving each item's `dayIndex` and its position relative to everything else (stays have no `dayIndex`, so this is the only path that keeps them aligned with the trip). Unchecked, events/expenses/checklist items keep their exact absolute date and time and have their `dayIndex`/`completeByDayIndex` recomputed against the new range instead (clamped for events, since `dayIndex` is required; set to `null` — "no specific day" — for expenses/checklist that now fall outside it); stays are left untouched either way, since nothing about them is relative.

While the function runs, `trip.dateShiftStatus` is `'PENDING'` — `firestore.rules` denies every write to the trip document and its subcollections until it flips back to `'IDLE'` (or the function fails and resets it), and the client mirrors that lock by hiding every edit entry point and showing a banner. This is what makes the two-phase "shift, then reassign" work safely: nothing else can write to the trip mid-shift.

**5. Dues / Settle-Up Calculation**

Client-side (`splitCalculators.ts`) over the already-loaded expenses, with two qualifications the earlier draft didn't have:
- **Only `status: 'PAID'` expenses with a resolved `amount` feed the dues calculation.** An `EXPECTED`/range expense contributes to the Expected and Total figures on the Expenses screen, but not to "who owes whom" yet — it doesn't have a final, splittable number until it's actually paid.
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

Whether the idea board renders prominent (pre-trip) or tucked into a discovery tab (post-start) is derived purely from `now < trip.startDate`.

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
- **`events/`, `checklist/`, `expenses/`, `stays/` subcollections**: membership-based against the parent trip's `members` map, role-checked for write (`ADMIN`/`EDITOR` full write; `COMMENTER` write on their own assigned items/proposals; `VIEWER` limited to their own expense-paid toggle). `createdBy` can't be spoofed post-creation; everything else — `notes`, `transitDetails`, `changeHistory`, `splitAmounts`, `dayIndex` — is a type/shape check only, so a new nullable field never touches `firestore.rules`. **`events/` specifically**: updating/deleting an *existing* event once `now >= trip.startDate` is `ADMIN`-only (creating new ones stays open to `EDITOR`s). Every write to any of these, and to `trips/{tripId}` itself, additionally requires `trip.dateShiftStatus != 'PENDING'` — see "Changing Trip Dates" above.
- **`comments/{commentId}`**: posting is covered by the general membership rule; approving/declining a proposal is a dedicated narrow rule restricted to `ADMIN`/`EDITOR` (or `ADMIN`-only post-trip-start for event-targeted proposals, per State Machine #2).
- **`ideas/{ideaId}`**: creating and reading open to any trip member (#1 — not a planning-permission surface). Voting is narrow: a member can only add/remove *their own* uid from `voterUids` (#5). Setting `convertedToEntityId` follows the same permission as creating the resulting entity.
- **`stayCriteria/{criterionId}`**: reading open to any member; write follows the same `EDITOR`/`ADMIN` rule as the departure checklist.
- **Criterion #7 (visibility field as query filter)**: not applicable — Waypoint has no private/public-style field anywhere in this schema.
- **Criterion #8**: confirmed satisfied by construction — see the Data Schema section's pending-requests writeup.

---

## Client State Management (Redux Toolkit)

- **Central vs. app-scoped**: if no earlier mini app has introduced `src/store/` yet, Waypoint's Phase 4 roadmap includes the one-time central store foundation issue. Otherwise, Waypoint builds directly on it.
- **Typed per-app state**: `WaypointState` composes `trip`, `events`, `stays`, `checklist`, `expenses`, `comments`, `ideas`, `stayCriteria`, and `pendingRequests` sub-slices (no `album` slice — the shared album is just fields on the trip doc), exposed via a base `selectWaypoint(state)`.
- **Member display info is never in Waypoint's own state.** `TripMember` only carries `uid`/`role`/`joinedAt`; any component rendering a member's name or avatar resolves it via the existing central `useUserInfo(uid)` hook.
- **`resetAllState`**: dispatched on UID change, including via `DevAccountSwitcher`.
- **Multi-doc atomic mutations get their own actions**: `proposalActions.ts` (approve/decline), `membershipActions.ts` (approve/decline pending request, change role, remove member — all Admin-only, atomic per State Machine #13), `ideaActions.ts` (convert idea → event or stay).
- **Snapshot listener tiering**: all Firestore listeners are started from `useWaypointSync.ts`, called once at the app root (`Waypoint.tsx`), mirroring Nine Lives' `useNineLivesSync.ts` — never from inside a leaf/tab component, so switching tabs or reopening the same trip never tears down and resubscribes a listener.
  - *User-level* (while signed in, not tied to any open trip): every trip the user belongs to, and "my pending trips" — `where('uid', '==', myUid)` against `apps/waypoint/pendingRequests`, rendered via `MyPendingTrips.tsx` with a follow-up fetch per result to resolve `tripId` to a trip title, and a Withdraw action that deletes the requester's own doc (`cancelJoinRequest` — see Client hooks pattern: the requester-facing cancel action is mandatory, not a later follow-up).
  - *Eager* (on opening a trip): the trip doc, events, stays, checklist, ideas, stay criteria, a lightweight expenses listener (dues/totals are whole-trip visibility, not a per-item drill-down), a pending-proposal *count* for `ADMIN`/`EDITOR`, and — for an `ADMIN` — a `where('tripId', '==', tripId)` query against `apps/waypoint/pendingRequests`, gated the same way the Members tab UI is (Admin only).
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
- **Editor Write Boundaries**: create, update, and delete stays, checklist items, stay criteria, and expenses; create new events at any time. Once the trip has started, updating/deleting an *existing* event is Admin-only.
- **Commenter Write Boundaries**: view all trip data, toggle checklist items assigned to them, update their own expense-paid status, post comments, submit edit proposals.
- **Viewer Write Boundaries**: read trip data and toggle their own expense-paid status only.
- **Social vs. planning actions**: live travel-status updates, and adding or voting on a Trip Idea, are open to every trip member regardless of role.
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
│   ├── OverviewSection.tsx        (pre-trip: idea teaser, checklist progress, album link.
│   │                                live: Active/Up Next HUD, travel-status feed. DreamerUI-free, no form)
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
│   ├── IdeasSection.tsx           (type filter: Restaurant/Activity/Stay)
│   │   ├── IdeaCard.tsx           (votes, Add-to-Itinerary/Select-as-Stay)
│   │   ├── IdeaFormModal.tsx      (DreamerUI Form, fields branch by ideaType)
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
│   │   └── ideaActions.ts          (convert idea → event or stay — atomic multi-doc write)
│   ├── listeners/
│   │   ├── tripListeners.ts        (eager tier — trip, events, stays, checklist, ideas, stayCriteria,
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
│   ├── dateUtils.ts
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