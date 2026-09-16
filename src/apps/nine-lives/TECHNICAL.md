# Nine Lives — Technical Design Document

> **Global Data Keying**: All application data is namespaced under the mini-app identifier `nine-lives` (e.g., Firestore root path `apps/nine-lives/...`), with two exceptions: the shared user profile (`users/{uid}`) and the cross-app reminder system (`reminders/{reminderId}`), both intentionally central so other mini-apps can use them too.

> **Household model**: cats belong to a `Household`, not directly to a single user. `Household.members` is an array of UIDs and the household uses a shared `inviteCode` plus a top-level `pendingRequests` collection to support multiple caretakers. All household-owned data (cats, vet clinics, doctors, visits, emergency info, care instructions) is nested under `households/{householdId}` and access-checked against `members`, the same pattern Worth the Wait uses for `space.members`.

> **Timestamp convention**: every date and time field in this document is a millisecond Unix timestamp (`number`), never an ISO string — this matches the repo's existing convention (see `.github/copilot-instructions.md`). An earlier draft of this document used ISO date strings for a few fields (`Cat.dateOfBirth`, `CatKeyDate.date`, `Cat.adoptedAt`, `Cat.insurance.coverageStartDate`, `HealthRecord.recordDate`); that was an oversight, corrected below. Fields that represent a calendar date without a meaningful time-of-day (like a birthday) still store as `number` — midnight UTC of that date — rather than switching format just because there's no clock time involved.

## Data Schema

### 1. Household

Path: `apps/nine-lives/households/{householdId}`

`inviteCode` is generated when a household is created and stays stable while the household is active. Join requests are stored in a top-level `pendingRequests` collection (sibling to `households`, not nested under one) so multiple people can request access without mutating a single list field. Unlike Worth the Wait's two-person cap, a household isn't "locked" at any size, so multiple join requests can be pending at once — including, for a single user, requests to several different households simultaneously.

```typescript
interface PendingHouseholdRequest {
  uid: string;
  householdId: string;
  inviteCode: string;
  requestedAt: number;
}

interface Household {
  id: string;
  name: string; // pre-filled as "{Full Name}'s household", editable
  members: string[]; // UIDs
  inviteCode: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Path: `apps/nine-lives/pendingRequests/{uid}_{householdId}`

A pending request is a one-document write for the requester themselves, keyed by `{uid}_{householdId}` so one user can hold multiple concurrent requests (one per household) without collisions. Being flat rather than nested under a household means both "my requests" (`where('uid','==',me)`) and "requests for my household" (`where('householdId','==',householdId)`) are plain `COLLECTION`-scope queries — no `collectionGroup`, no manual index. Any current household member can read/query the collection (scoped to their household) to review incoming requests and accept or decline them.

Path: `apps/nine-lives/inviteCodes/{inviteCode} -> { householdId }`

A non-member can't read a household doc directly (it's member-scoped), so resolving an invite code before joining goes through this small, world-readable-to-any-signed-in-user lookup collection instead — mirroring Worth the Wait's own `inviteCodes` collection. It's written in the same batch as the household it points to, and never updated or deleted (unlike Worth the Wait's one-time code, a household's code is permanent since membership isn't capped).

### 2. Cat

Path: `apps/nine-lives/households/{householdId}/cats/{catId}`

```typescript
type CatLifestyle = 'indoor' | 'outdoor' | 'indoor_outdoor';

interface CatKeyDate {
  label: string; // e.g. "Gotcha day", "Spayed/neutered"
  date: number;
}

type CatFoodType = 'dry' | 'wet' | 'mixed';

interface CatDiet {
  foodType?: CatFoodType;
  brand?: string;
  feedingsPerDay?: number;
  usesAutomaticFeeder?: boolean;
  treats?: string; // free text — snacks, treat brands, etc.
  notes?: string;
}

interface Cat {
  id: string;
  householdId: string;
  name: string;
  photoURL?: string;
  dateOfBirth: number;
  isDateOfBirthEstimated: boolean; // true for shelter cats with an unknown exact birthday
  breed: string; // free text; UI offers a preset list plus custom entry
  lifestyle?: CatLifestyle;
  microchipNumber?: string;
  shelterOrigin?: {
    name: string;
    address?: string;
  };
  adoptedAt?: number; // the most common key date, called out explicitly
  customKeyDates?: CatKeyDate[]; // anything else worth tracking (spay/neuter date, etc.)
  diet?: CatDiet; // Next Step
  currentClinicId?: string; // ref to VetClinic
  insurance?: {
    provider: string; // free text; UI offers a preset list plus custom entry
    policyNumber: string;
    monthlyPremium?: number;
    coverageStartDate?: number;
    coverageNotes?: string;
  };
  personalityTraits?: string[]; // free text; UI offers a preset list plus custom entry — Next Step
  notes?: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Diet is structured rather than folded into freeform care instructions, since "what food, how often, any automatic feeder" are concrete facts worth their own fields — care instructions stays for the nuance around them (e.g. "she's picky about wet food brands, always check the label first").

Breed, personality trait, and insurance provider options are **client-side constants**, not Firestore collections — they're static reference lists for form comboboxes ("pick one, or enter your own"), not data that needs admin editing or live sync. See `constants/presetOptions.ts` in the file architecture below.

### 3. Vet Clinic

Path: `apps/nine-lives/households/{householdId}/vetClinics/{clinicId}`

```typescript
interface VetClinic {
  id: string;
  householdId: string;
  name: string;
  phone?: string;
  address?: string;
  isEmergency24Hour?: boolean;
  notes?: string;
  createdAt: number;
  lastEditedAt: number;
}
```

### 4. Doctor

Path: `apps/nine-lives/households/{householdId}/doctors/{doctorId}`

A specific veterinarian at a clinic, created on first mention on a visit form. Subsequent visits offer existing doctors for that clinic as a select instead of free text. (Scoped per clinic, not per household — if a doctor changes clinics, they'd show up as a new entry at the new clinic. Acceptable tradeoff for MVP.)

```typescript
interface Doctor {
  id: string;
  householdId: string;
  clinicId: string;
  name: string;
  notes?: string;
  createdAt: number;
}
```

### 5. Health Record

Path: `apps/nine-lives/households/{householdId}/healthRecords/{recordId}`

Household-scoped, not cat-scoped — a record can be attached to more than one cat (`catIds`), the same tradeoff as `Expense` and `Visit`, since paperwork like a shared insurance policy or joint checkup often covers multiple cats.

Custom record types are their own small, household-scoped entity rather than a free-text field copied onto every record — the same reasoning as `Doctor`: type it once, reuse it via a select from then on. This was a real tradeoff worth spelling out, since it wasn't the only reasonable option:

- **Rejected: client-side aggregation.** Deriving "previously used custom labels" by scanning a household's health records client-side works, but means either loading every record just to extract labels, or running that aggregation somewhere expensive. It also leaves typos and casing drift uncorrected ("Lab Result" vs. "lab result" become two different labels with nothing tying them together).
- **Chosen: a dedicated `CustomHealthRecordType` entity.** A record references it by ID rather than embedding the label as a string. Reading the small reference list is cheap, there's no drift between entries, and if a label ever does get renamed, every record referencing it updates for free — a nice side effect, even though (as you noted) it's not really why this exists; the main win is just not re-typing the same label every time.

```typescript
type HealthRecordType =
  | 'lab_result'
  | 'vet_paperwork'
  | 'insurance'
  | 'shelter_adoption'
  | 'prescription'
  | 'microchip_registration'
  | 'miscellaneous'
  | 'custom';

interface HealthRecord {
  id: string;
  householdId: string;
  catIds: string[];
  fileURL: string;
  fileType: 'pdf' | 'image';
  fileName: string;
  label: string | null; // user-facing display name; falls back to fileName when unset (most useful for images, whose filenames rarely describe the content)
  recordType: HealthRecordType;
  customRecordTypeId: string | null; // present only if recordType === 'custom', ref to CustomHealthRecordType
  recordDate: number | null;
  linkedVisitId: string | null; // convenience back-pointer, mirrors the other linked entities
  notes: string | null;
  uploadedBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Path: `apps/nine-lives/households/{householdId}/customHealthRecordTypes/{typeId}`

```typescript
interface CustomHealthRecordType {
  id: string;
  householdId: string;
  label: string;
  createdBy: string;
  createdAt: number;
}
```

Health record files are stored at
`nine-lives/households/{householdId}/health-records/{recordId}` in Storage.
Records live in their own household-level "Records" section (alongside
Expenses and Vet Clinics), not the cat details modal, and the listener starts
as soon as a household is selected. The section supports opening files,
editing record metadata, and deleting both the Firestore record and its
Storage object. New custom labels are upserted into the household's reference
collection before the record is created, so they are available to every cat
in that household.

### 6. Vaccination

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/vaccinations/{vaccinationId}`

`householdId` is denormalized here specifically so the household-wide "what's due soon" view can run a `collectionGroup('vaccinations')` query rather than fetching every cat individually — see Client State Management below. `linkedVisitId` supports logging a vaccination directly from a visit's outcome flow, but a vaccination can also stand alone (e.g., historical records from a previous vet).

**On history**: each `Vaccination` document already represents one specific dose given on one specific date — not an ongoing "status" for a vaccine type that gets overwritten. A cat's full vaccination history is just every `Vaccination` document for that cat, naturally, including repeat doses of the same vaccine (e.g. three separate "Rabies" documents across three years) each with its own `linkedVisitId` pointing at whichever visit it happened at. There's no single "current visit" being tracked here to worry about losing history — `linkedVisitId` only ever needs to point at the one visit where that one dose was actually given.

```typescript
interface Vaccination {
  id: string;
  householdId: string;
  catId: string;
  name: string; // e.g. "FVRCP", "Rabies", "FeLV"
  administeredAt: number;
  expiresAt?: number; // next dose/booster due date — primary candidate for a Reminder
  clinicId?: string;
  doctorId?: string;
  lotNumber?: string;
  linkedVisitId?: string;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

### 7. Preventive

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/preventives/{preventiveId}`

Preventives use the same append-only, one-document-per-dose model as vaccinations, but represent recurring parasite treatments that are often administered at home. `householdId` is denormalized so the household-wide due-dates view can run a `collectionGroup('preventives')` query without fetching every cat individually. Each dose can be edited or deleted, while the remaining history stays intact.

```typescript
type PreventiveType = 'flea-tick' | 'heartworm' | 'mite' | 'dewormer' | 'other';

interface Preventive {
  id: string;
  householdId: string;
  catId: string;
  name: string;
  type: PreventiveType;
  administeredAt: number;
  expiresAt: number | null; // next dose due date
  dosage: string | null;
  clinicId: string | null;
  doctorId: string | null;
  linkedVisitId: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

### 8. Weight Entry

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/weightEntries/{weightEntryId}`

Data capture is Core MVP; the growth chart visualization built on top of it stays a stretch goal. Same reasoning as vaccinations: each entry is one point-in-time measurement, so the full weight history is just every `WeightEntry` for the cat, sorted — nothing to lose by keeping `linkedVisitId` singular.

```typescript
interface WeightEntry {
  id: string;
  catId: string;
  weight: number;
  unit: 'lb' | 'kg';
  measuredAt: number;
  linkedVisitId?: string;
  createdBy: string;
  createdAt: number;
}
```

### 8. Visit

Path: `apps/nine-lives/households/{householdId}/visits/{visitId}`

Lives at the household level, not nested under a single cat, so one entry can cover multiple cats seen the same day.

```typescript
type VisitStatus = 'upcoming' | 'completed' | 'cancelled';
type VisitReason = 'checkup' | 'illness' | 'accident' | 'vaccination' | 'follow_up' | 'custom';

interface Visit {
  id: string;
  householdId: string;
  catIds: string[];
  clinicId?: string;
  doctorId?: string;
  status: VisitStatus;
  reason: VisitReason;
  customReasonLabel?: string; // required if reason === 'custom'
  followUpOfVisitId?: string; // required if reason === 'follow_up'
  followUpNote?: string; // optional — the original visit may have covered several things; this says which one
  title?: string; // optional override; default is derived from scheduledAt (time-of-day + date), see dateHelpers.ts
  scheduledAt: number;
  completedAt?: number;
  summary?: string;
  linkedSymptomIds: string[];
  linkedConditionIds: string[];
  linkedHealthRecordIds: string[];
  linkedVaccinationIds: string[];
  linkedWeightEntryIds: string[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

`title` defaults to something like "Morning Visit — Mar 4" or "Late Night Emergency — Mar 4" derived purely from `scheduledAt`'s time bucket and date (a pure function, nothing stored unless the owner overrides it) — but is always renameable, since sometimes "Jamie's Follow-up" is just clearer than a timestamp bucket.

See **Visit Outcome Flow** below for how vaccinations, conditions, weight entries, and symptoms get logged as part of completing a visit, and how the five `linked*Ids` arrays above turn a visit into a complete record of everything that happened during it.

The shipped client keeps visits in the household Redux sync and exposes scheduling and editing from the household dashboard only — the per-cat details modal does not repeat a visits tab. `VisitTimeline` supports free-text search, a status filter, a cat filter (household view only), and toggling the date sort direction. Cancelling keeps the record for historical context and can be undone (a cancelled visit can be reopened back to upcoming); deleting an original visit clears its follow-up references in the same batch.

### 9. Condition Library (shared, global reference)

Path: `apps/nine-lives/conditionLibrary/{conditionId}`

```typescript
type ConditionCategory = 'illness' | 'injury' | 'chronic' | 'parasite' | 'allergy' | 'other';

interface LibraryCondition {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  source: 'seed' | 'api';
  sourceRef?: string;
  createdAt: number;
}
```

### 10. Cat Condition

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/conditions/{catConditionId}`

A custom condition is a `CatCondition` with `source: 'custom'`, no `libraryConditionId`, and `name`/`category`/`description` entered directly by the owner. Accidents and injuries live here too — either the library's `injury` category, or a custom entry for a one-off incident.

```typescript
type CatConditionSource = 'library' | 'custom';
type CatConditionStatus = 'active' | 'ongoing' | 'resolved';

interface CatCondition {
  id: string;
  catId: string;
  source: CatConditionSource;
  libraryConditionId?: string;
  name: string;
  category: ConditionCategory;
  status: CatConditionStatus;
  occurredAt: number;
  resolvedAt?: number;
  description?: string;
  linkedVisitIds?: string[]; // every visit where this condition was discussed, monitored, or treated
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Unlike vaccinations and weight entries, a condition is genuinely ongoing — "diagnosed with CKD in 2024" might get discussed, monitored, or treated across a dozen visits over the following years. A single `linkedVisitId` would silently lose that history, so this is an array, updated (via a batched write) alongside `Visit.linkedConditionIds` each time the condition comes up at a visit. Clicking through from the condition's detail view to any of those visits is just reading each ID.

### 11. Symptom

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/symptoms/{symptomId}`

```typescript
type SymptomSeverity = 'mild' | 'moderate' | 'severe';
type SymptomQuickTag =
  | 'litter_box_change'
  | 'appetite_change'
  | 'vomiting'
  | 'lethargy'
  | 'hiding'
  | 'playfulness_change'
  | 'grooming_change'
  | 'other';

interface Symptom {
  id: string;
  catId: string;
  description: string;
  quickTags: SymptomQuickTag[];
  firstNoticedAt: number;
  severity: SymptomSeverity | null;
  linkedVisitIds: string[]; // every visit where this symptom was reported or discussed
  linkedConditionId: string | null;
  resolvedAt: number | null;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

Symptoms can be logged with quick tags only, free text only, or both. The quick-tag set stays cat-focused (litter box changes, appetite, hiding, playfulness, grooming, plus common red flags like vomiting/lethargy) because cats often hide illness via subtle behavior shifts rather than loud, obvious signs. Same reasoning as conditions: a persistent or recurring symptom (say, intermittent vomiting tracked across three visits while a cause gets narrowed down) can reasonably span more than one visit, so this is an array too, kept in sync with `Visit.linkedSymptomIds`.

### 12. Vaccine Library (shared, global reference)

Path: `apps/nine-lives/vaccineLibrary/{vaccineId}`

```typescript
interface LibraryVaccine {
  id: string;
  name: string;
  description: string;
  isCore: boolean; // core (FVRCP, rabies) vs. lifestyle-dependent (FeLV, Bordetella)
  createdAt: number;
}
```

### 13. Expense

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/expenses/{expenseId}`

```typescript
type ExpenseCategory =
  | 'adoption_fee'
  | 'insurance'
  | 'food'
  | 'litter'
  | 'vet'
  | 'grooming'
  | 'supplies'
  | 'medication'
  | 'microchipping'
  | 'spay_neuter'
  | 'other';
type RecurrenceInterval = 'monthly' | 'yearly';

interface Expense {
  id: string;
  catId: string;
  category: ExpenseCategory;
  amount: number;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval;
  incurredAt: number;
  notes?: string;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number;
}
```

`ExpenseCategory` doubles as the default preset list on the expense form — no separate template collection needed.

### 14. Emergency Info

Path: `apps/nine-lives/households/{householdId}/emergencyInfo/default` (singleton per household)

```typescript
interface EmergencyInfo {
  householdId: string;
  emergencyClinicId?: string; // ideally a VetClinic with isEmergency24Hour: true
  emergencyPhone?: string;
  notes?: string;
  lastEditedAt: number;
}
```

### 15. Care Instructions (stretch)

Path: `apps/nine-lives/households/{householdId}/careInstructions/joint`
Path: `apps/nine-lives/households/{householdId}/cats/{catId}/careInstructions/default`

```typescript
interface CareInstructions {
  householdId: string;
  catId?: string; // absent for the joint/household-level doc
  content: string;
  lastEditedBy: string;
  lastEditedAt: number;
}
```

### 16. Growth Photo (stretch)

Path: `apps/nine-lives/households/{householdId}/cats/{catId}/growthPhotos/{photoId}`

```typescript
interface GrowthPhoto {
  id: string;
  catId: string;
  photoURL: string;
  takenAt: number;
  note?: string;
  createdBy: string;
  createdAt: number;
}
```

### 17. Glossary Term (shared, global reference)

Path: `apps/nine-lives/glossary/{termId}`

```typescript
interface GlossaryTerm {
  id: string;
  term: string; // e.g. "FVRCP"
  definition: string;
  relatedResourceIds?: string[];
  createdAt: number;
}
```

### 18. Resource (shared, global reference)

Path: `apps/nine-lives/resources/{resourceId}`

```typescript
interface Resource {
  id: string;
  title: string;
  body: string;
  relatedConditionIds?: string[];
  relatedGlossaryTermIds?: string[];
  source: 'seed' | 'internal';
  createdAt: number;
}
```

### 19. Reminder (central, cross-app infrastructure)

Path: `reminders/{reminderId}` — deliberately **not** under `apps/nine-lives`.

```typescript
type NotificationChannel = 'push' | 'email'; // only 'push' implemented in MVP
type ReminderStatus = 'pending' | 'sent' | 'cancelled';

interface Reminder {
  id: string;
  appId: string;
  targetUids: string[];
  title: string;
  body: string;
  scheduledFor: number;
  status: ReminderStatus;
  channels: NotificationChannel[];
  relatedEntityPath?: string;
  createdBy: string;
  createdAt: number;
}
```

### 20. User doc addition (central, existing collection)

```typescript
interface UserProfile {
  // ...existing fields (uid, email, displayName, photoURL, isAdmin)
  fcmTokens?: string[];
}
```

## State Machines & Logic

### Visit status

```
[UPCOMING] ---> owner marks completed ---> [COMPLETED]
[UPCOMING] ---> owner cancels          ---> [CANCELLED]
```

### Cat condition status

```
[ACTIVE] ---> owner marks resolved ---> [RESOLVED]
[ACTIVE] ---> owner marks chronic  ---> [ONGOING]
```

### Visit Outcome Flow

Marking a visit completed opens the same form back up with a lightweight "what happened" step, scoped per cat in `catIds`:

- **Vaccinations given** → creates one `Vaccination` per entry, `linkedVisitId` set, `clinicId`/`doctorId` pre-filled from the visit, and the new ID appended to `Visit.linkedVaccinationIds`.
- **Conditions diagnosed** → creates or updates a `CatCondition`, appending the visit to `linkedVisitIds` and the condition to `Visit.linkedConditionIds`.
- **Current weight** → creates a `WeightEntry`, `linkedVisitId` set, appended to `Visit.linkedWeightEntryIds`.
- **Symptoms reported** → creates or links existing `Symptom` entries, appending the visit to `linkedVisitIds` and the symptom to `Visit.linkedSymptomIds` — usually *why* the visit happened in the first place.

None of this is required to mark a visit completed — it's an optional, streamlined path so the common case (you were just at the vet, several things changed at once) doesn't require navigating to separate screens afterward. Each created record remains independently editable later, same as if it had been entered standalone.

The outcome form is a drill-down: a summary field plus one tappable card per selected cat (avatar, name, an "Added" badge once that cat has entries), each opening a per-cat screen where existing open symptoms/conditions can be linked via checkbox instead of retyped, alongside repeatable "add another" inputs for new symptoms, conditions, and vaccinations (a visit can produce more than one of each) and a single weight field. Submitting moves to a review screen listing everything that will be attached, each removable, before the visit is actually marked completed. The "Complete without entries" action skips straight to completion with an empty outcome via the same completion thunk.

**Follow-up visits**: a visit with `reason: 'follow_up'` sets `followUpOfVisitId` pointing at the original visit, plus an optional `followUpNote` — useful because the original visit might have covered several things (say, a checkup plus a skin issue), and the follow-up is usually about just one of them.

**Linking convention**: every one of the five `linked*Ids` arrays on `Visit` is a forward list, since a visit can span multiple cats and needs one place that knows everything tied to it. Going the other direction:

- `Vaccination`, `WeightEntry`, and `HealthRecord` are single-point-in-time artifacts — one dose, one measurement, one document — so each just carries a singular `linkedVisitId` back-pointer. There's no history to lose here; the *history* is simply "every one of these documents for this cat," and each one only ever belongs to the one visit where it happened.
- `CatCondition` and `Symptom` are the two entity types that can genuinely span an ongoing history of visits (a condition monitored for years, a symptom tracked across a few follow-ups), so they carry `linkedVisitIds` arrays instead, kept in sync with `Visit`'s forward arrays via a single batched write whenever a link is created or removed.

**On Firestore filtering**: this doesn't create a filtering problem. In the common direction — "what's linked to this visit" — you already have the visit document loaded, so its forward arrays give you the IDs directly; no query needed at all. In the other direction — "what visits is this condition/symptom linked to" — same thing, you already have that document loaded and its `linkedVisitIds` array gives you the IDs to look up. Firestore's `array-contains` operator would also work fine here if a query were ever needed (e.g. "find every condition mentioning visit X" via a `collectionGroup` query), it just isn't the common path for this feature.

### Household readiness (derived, not stored)

- `isEmergencyReady` = `Boolean(emergencyInfo?.emergencyClinicId || emergencyInfo?.emergencyPhone)`
- `hasInsuranceOnFile(cat)` = `Boolean(cat.insurance)`

Both nudges dismiss themselves once the underlying data exists; no explicit "dismissed" state is needed.

### Reference library population

`conditionLibrary`, `vaccineLibrary`, `glossary`, and `resources` are populated once via seed scripts following the existing `scripts/seeds/` pattern (see `scripts/seeds/worthTheWait.ts` for precedent), not live-synced on read. This needs its own seeding issue in the roadmap. Owners never write to these collections directly.

### Budgeting math (derived, not stored)

- **Monthly total** = sum of one-off expenses with `incurredAt` in the current month, plus each active recurring expense's `amount` counted once for the current month.
- **Lifetime total** = sum of all one-off expense amounts, plus each recurring expense's `amount` × billing cycles elapsed between `incurredAt` and now.

### Household Due-Dates Timeline (independent of push notifications)

This is a distinct concept from the `Reminder` entity below, and doesn't depend on it. "What's coming up" should be fully visible in the UI at any time — past and future, out to roughly a year — computed directly from `Visit` and `Vaccination` data that's already loaded, not from a separately-scheduled notification record:

```typescript
interface HouseholdDueDateItem {
  type: 'visit' | 'vaccination';
  id: string;
  catIds: string[];
  label: string; // e.g. a visit's title, or "Rabies booster — Whiskers"
  dueAt: number;
  isPast: boolean;
}

export const selectHouseholdDueDatesTimeline = (
  state: RootState,
  householdId: string,
  options?: { horizonMonths?: number }, // default 12
): HouseholdDueDateItem[] => { /* merges upcoming/past visits + vaccination expiresAt, sorted */ };
```

The UI groups this into buckets like "This month," "Next 3 months," "Beyond," and "Past" (shown grayed out) — similar to a printed vet visit summary that shows both what's already happened and what's scheduled months out, not just what's imminent. This only reads existing `visits`/`vaccinations`/`preventives` slice data and ships without any dependency on the push notification work below — it's a Core MVP–tier feature, not a Beyond-tier one.

### Reminder lifecycle (push notifications specifically — Beyond MVP)

`Reminder` documents exist purely to drive an actual push notification at some point before an event — they're not the mechanism for the due-dates timeline above, which reads source data directly instead.

```
[PENDING] ---> scheduled Cloud Function finds scheduledFor <= now ---> sends push via FCM ---> [SENT]
[PENDING] ---> creator cancels (e.g. visit was rescheduled)        ---> [CANCELLED]
```

Nine Lives would create a `Reminder` when a `Visit` is scheduled (a day before `scheduledAt`) and when a `Vaccination.expiresAt` or `Preventive.expiresAt` approaches. This is explicitly sequenced after the rest of Nine Lives' UI is working, not early — see the Issue Roadmap's tiering.

## Client State Management (Redux Toolkit)

Nine Lives is the first mini-app on this pattern; the repo has no Redux yet, so the central foundation is built alongside it.

### Store shape and per-app typing

Every mini-app exports its own named state interface and reducer, so `RootState` composes named types instead of an inline blob — and any selector built on top of `selectNineLives(state)` is typed against `NineLivesState` without casting:

```typescript
// src/apps/nine-lives/store/index.ts
export interface NineLivesState {
  households: HouseholdsState;
  cats: CatsState;
  vetClinics: VetClinicsState;
  doctors: DoctorsState;
  conditionLibrary: ConditionLibraryState;
  vaccineLibrary: VaccineLibraryState;
  glossary: GlossaryState;
  resources: ResourcesState;
  visits: VisitsState;               // household-keyed, eager
  vaccinations: VaccinationsState;   // household-keyed, eager — see tiering below
  preventives: PreventivesState;     // household-keyed, eager — see tiering below
  healthRecords: HealthRecordsState; // cat-keyed, lazy
  customHealthRecordTypes: CustomHealthRecordTypesState; // household-keyed
  weightEntries: WeightEntriesState; // cat-keyed, lazy
  catConditions: CatConditionsState; // cat-keyed, lazy
  symptoms: SymptomsState;           // cat-keyed, lazy
  expenses: ExpensesState;           // cat-keyed, lazy
  growthPhotos: GrowthPhotosState;   // cat-keyed, lazy — stretch
  emergencyInfo: EmergencyInfoState; // household-keyed
  careInstructions: CareInstructionsState; // household- and cat-keyed
}

export const nineLivesReducer = combineReducers<NineLivesState>({ /* ... */ });

export const selectNineLives = (state: RootState): NineLivesState => state.nineLives;
```

```typescript
// src/store/index.ts
export interface RootState {
  user: UserState;
  reminders: RemindersState;
  nineLives: NineLivesState; // typed via the mini-app's own exported interface
}
```

The `user` slice is a thin mirror of `AuthContext`/`useAuth()` — `AuthProvider` keeps owning the Firebase Auth session and dispatches into the slice whenever its `user` changes.

### Global reset action

```typescript
// src/store/actions/globalActions.ts
export const resetAllState = createAction('global/resetAllState');
```

Every slice handles this in `extraReducers`. Dispatched on UID change, including via `DevAccountSwitcher` (which swaps the Firebase Auth user without a page reload) — without this, one fixture account's cats/visits would linger after switching to another.

### Optimistic mutations: one generic pattern, reused everywhere

Rather than hand-rolling optimistic-update/rollback logic per entity, a single generic slice factory in the central store provides it once:

```typescript
// src/store/utils/createOptimisticCollectionSlice.ts
interface OptimisticCollectionState<TDoc> {
  items: TDoc[];
  previousById: Record<string, TDoc | null>; // null = "didn't exist before" (for creates)
  loaded: boolean;
}

export function createOptimisticCollectionSlice<TDoc extends { id: string }>(name: string) {
  const initialState: OptimisticCollectionState<TDoc> = { items: [], previousById: {}, loaded: false };

  return createSlice({
    name,
    initialState,
    reducers: {
      setAll(state, action: PayloadAction<TDoc[]>) {
        state.items = action.payload;
        state.loaded = true;
      },
      upsertOneOptimistic(state, action: PayloadAction<TDoc>) {
        const existing = state.items.find((item) => item.id === action.payload.id);
        state.previousById[action.payload.id] = existing ?? null;
        state.items = existing
          ? state.items.map((item) => (item.id === action.payload.id ? action.payload : item))
          : [...state.items, action.payload];
      },
      removeOneOptimistic(state, action: PayloadAction<{ id: string }>) {
        const existing = state.items.find((item) => item.id === action.payload.id);
        state.previousById[action.payload.id] = existing ?? null;
        state.items = state.items.filter((item) => item.id !== action.payload.id);
      },
      revertOne(state, action: PayloadAction<{ id: string }>) {
        const previous = state.previousById[action.payload.id];
        state.items = previous
          ? state.items.map((item) => (item.id === action.payload.id ? previous : item))
          : state.items.filter((item) => item.id !== action.payload.id);
        delete state.previousById[action.payload.id];
      },
    },
    extraReducers: (builder) => {
      builder.addCase(resetAllState, () => initialState);
    },
  });
}
```

Every entity thunk follows the same shape — apply optimistically, write to Firestore, roll back on failure:

```typescript
// src/apps/nine-lives/store/actions/catsActions.ts
export const updateCat = createAsyncThunk(
  'nineLives/cats/update',
  async (input: { catId: string; changes: Partial<Cat> }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as RootState;
    const current = state.nineLives.cats.items.find((c) => c.id === input.catId);
    if (!current) return rejectWithValue('Cat not found');

    const optimisticCat = { ...current, ...input.changes, lastEditedAt: Date.now() };
    dispatch(catsSlice.actions.upsertOneOptimistic(optimisticCat));

    try {
      await updateDoc(catDocRef(input.catId), input.changes);
      return optimisticCat;
    } catch (error) {
      dispatch(catsSlice.actions.revertOne({ id: input.catId }));
      return rejectWithValue(error);
    }
  },
);
```

### Snapshot listeners: one standard, central pattern

```typescript
// src/store/listeners/createFirestoreCollectionListener.ts
export function createFirestoreCollectionListener<TDoc>({
  query: firestoreQuery,
  normalize,
  onData,
}: {
  query: Query<DocumentData>;
  normalize: (id: string, data: DocumentData) => TDoc | Promise<TDoc>;
  onData: (docs: TDoc[]) => void;
}): () => void {
  return onSnapshot(firestoreQuery, async (snapshot) => {
    const docs = await Promise.all(
      snapshot.docs.map((doc) => normalize(doc.id, doc.data())),
    );
    onData(docs);
  });
}
```

Subscription tiers:

- **On mount** (`useNineLivesSync`): the household doc, `cats`, `vetClinics`, `doctors`, `visits` (household-level), and the four global reference collections. **`vaccinations` and `preventives` also load here**, via collection-group queries filtered by `where('householdId', '==', householdId)` — promoted to household-level listeners specifically so `selectHouseholdDueDatesTimeline` and full treatment histories are available without opening any single cat. Preventive and vaccination volume per cat is small enough that this doesn't carry the same cost as eagerly loading, say, every symptom or health record.
- **Lazily, per open cat** (`useCatDetailSync(catId)`): `healthRecords`, `weightEntries`, `catConditions`, `symptoms`, `expenses`, `growthPhotos`, `careInstructions`.
- **Central, app-wide** (`useReminderSync`, in the app shell): `reminders` where `targetUids array-contains uid`.

This is also what answers "can a cat's full vaccination or preventive history be viewed" — yes, trivially, since the eager `vaccinations` and `preventives` slices already hold every record for every cat in the household; a detail view just filters them client-side by `catId`.

### Cross-slice selectors

```typescript
export const selectCatWithClinic = (state: RootState, catId: string) => {
  const { cats, vetClinics } = selectNineLives(state);
  const cat = cats.items.find((c) => c.id === catId);
  if (!cat) return null;
  const clinic = cat.currentClinicId ? vetClinics.items.find((v) => v.id === cat.currentClinicId) : null;
  return { ...cat, clinic };
};

export const selectDoctorsForClinic = (state: RootState, clinicId: string) =>
  selectNineLives(state).doctors.items.filter((d) => d.clinicId === clinicId);

export const selectUpcomingVisitsForHousehold = (state: RootState) => { /* used by DashboardQuickActions; selectHouseholdDueDatesTimeline covers the full past+future view */ };
export const selectVisitHistoryForCondition = (state: RootState, catId: string, conditionId: string) => { /* resolves linkedVisitIds to full Visit docs */ };
export const selectMonthlyExpenseTotal = (state: RootState, catId: string) => { /* budgetCalculators.ts */ };
export const selectLifetimeExpenseTotal = (state: RootState, catId: string) => { /* budgetCalculators.ts */ };
export const selectIsHouseholdEmergencyReady = (state: RootState, householdId: string) => { /* see State Machines & Logic */ };
```

## Security Rules Design Criteria

Rules need to be secure and comprehensive without becoming so field-specific that they break every time a feature evolves slightly. These criteria apply to every collection in this document, and every issue in the roadmap that touches `firestore.rules` should be checked against them:

1. **Default to relationship-based checks, not field-diffing.** For most collections, "is this UID a member of the owning household" (or "is this UID the author") is sufficient. Reach for exhaustive `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` validation only when a collection has a genuine security-critical invariant to protect — not as the default posture for every write path.
2. **Identify the small set of fields that are actually security-critical, and validate only those explicitly.** `householdId` can't change after creation. `createdBy` can't be spoofed to someone else's UID. A join request's `uid` must match the requester. Everything else — names, notes, dates, categories — just needs a type/shape check, not a value check.
3. **Prefer type and shape checks over exact-value checks** where the specific value doesn't affect access control (`request.resource.data.name is string`, not asserting what that name says).
4. **Adding an optional field to a schema should not require a rules change.** If a rule enumerates an exhaustive allowlist of every permitted field for a write, every new optional field becomes a rules change and a silent trap for whoever forgets it. Reserve that pattern for collections with a genuinely locked-down, multi-step lifecycle (Worth the Wait's space-locking flow is the one example of this actually being warranted in this repo) rather than applying it by default.
5. **Give security-critical transitions their own narrow, explicit rule; let a general membership rule cover everything else.** Approving a household join request is a distinct, tightly-scoped rule. Editing a cat's notes field is just covered by "any household member can write to this household's data."
6. **Every issue that adds or changes a Firestore-backed collection or field must treat `firestore.rules` (and `storage.rules`, if files are involved) as an explicit success criterion — not an implied one.** Seed data must be checked and updated the same way: if a schema change affects what a seeded document looks like, that's part of the same issue, not a follow-up someone remembers later.

## Security & Privacy Requirements

* **Household-scoped ownership**: only a UID present in `Household.members` can read or write that household's cats, vet clinics, doctors, custom health record types, visits, emergency info, care instructions, and any of those cats' health records, vaccinations, preventives, weight entries, conditions, symptoms, and expenses.
* **Vaccination collection-group query**: the `collectionGroup('vaccinations')` read is constrained to documents whose `householdId` matches a household the requesting user belongs to — the denormalized `householdId` field exists specifically to make this rule expressible.
* **Preventive collection-group query**: the `collectionGroup('preventives')` read is constrained to documents whose denormalized `householdId` matches a household the requesting user belongs to.
* **Invite lookup privacy**: `apps/nine-lives/inviteCodes/{code}` exposes only a `householdId` mapping, mirroring Worth the Wait's `inviteCodes` collection; readable by any authenticated user, writable only as part of a valid household-creation/join transaction once that flow ships.
* **Reference library read access**: any authenticated user can read `conditionLibrary`, `vaccineLibrary`, `glossary`, and `resources`; no client-side create, update, or delete — writes happen only through the seed process.
* **Custom conditions stay private**: `CatCondition` documents with `source: 'custom'` are never written back into the shared `conditionLibrary`.
* **File storage scoping**: health record files, cat photos, and growth photos are stored under a path keyed by the household ID, mirroring the Firestore ownership guard in Storage rules.
* **Reminder access**: a client can create a `Reminder` where `createdBy == request.auth.uid` and `request.auth.uid` is included in `targetUids`, and can update status only to `cancelled`. Only the scheduled Cloud Function (Admin SDK, bypasses rules) may set `status: 'sent'`. Reads are restricted to UIDs present in `targetUids`.
* **Immutable household linkage**: a cat's `householdId` cannot change after creation — no cross-household transfer flow in MVP.

## Component & File Architecture

Central store and notification foundation (new — neither exists in the repo yet):

```
src/store/
├── index.ts                                   # configureStore, RootState, AppDispatch, useAppDispatch/useAppSelector
├── slices/
│   ├── userSlice.ts                           # central currentUser mirror, fed by AuthProvider
│   └── remindersSlice.ts                      # central, cross-app
├── actions/
│   └── globalActions.ts                       # resetAllState
├── listeners/
│   ├── createFirestoreCollectionListener.ts   # generic, reusable snapshot-to-slice utility
│   └── remindersListener.ts
└── utils/
    └── createOptimisticCollectionSlice.ts     # generic, reusable optimistic-update slice factory

src/lib/notifications/
├── requestPushPermission.ts
├── registerDeviceToken.ts     # writes into users/{uid}.fcmTokens
└── scheduleReminder.ts        # thin helper any mini-app calls to create a Reminder doc

functions/src/notifications/
└── sendDueReminders.ts        # scheduled Cloud Function, queries reminders, sends via FCM, marks sent
```

Mini-app–scoped state and components:

```
src/apps/nine-lives/
├── components/
│   ├── HouseholdSetupModal.tsx
│   ├── CatCard.tsx
│   ├── CatGrid.tsx
│   ├── CatProfileForm.tsx
│   ├── InsuranceCard.tsx
│   ├── EmergencyReadinessBanner.tsx
│   ├── HealthRecordUploadModal.tsx  # includes custom type select/create, upsert-on-first-mention like Doctor
│   ├── HealthRecordTimeline.tsx  # search, cat/type filters, date/name sort — mirrors ExpenseTimeline
│   ├── VaccinationFormModal.tsx
│   ├── VaccinationTimeline.tsx
│   ├── PreventiveFormModal.tsx
│   ├── PreventiveTimeline.tsx
│   ├── PreventivesSection.tsx
│   ├── WeightEntryFormModal.tsx
│   ├── WeightHistoryList.tsx
│   ├── CatDietForm.tsx
│   ├── VisitFormModal.tsx          # multi-cat selection, follow-up linking, outcome flow (vaccinations/conditions/weight/symptoms)
│   ├── VisitTimeline.tsx
│   ├── VisitsSection.tsx            # household dashboard entry point and visit CRUD
│   ├── VetClinicFormModal.tsx
│   ├── ConditionLibraryBrowser.tsx
│   ├── CatConditionFormModal.tsx
│   ├── SymptomFormModal.tsx        # includes quick-tag chips
│   ├── SymptomTimeline.tsx
│   ├── ExpenseFormModal.tsx        # includes category presets
│   ├── BudgetSummary.tsx
│   ├── GlossaryBrowser.tsx
│   ├── ResourceBrowser.tsx
│   ├── GrowthPhotoTimeline.tsx
│   ├── DashboardQuickActions.tsx   # multi-cat CTAs: add visit/reminder without opening a cat
│   ├── DashboardDueDatesTimeline.tsx # past + upcoming visits, vaccinations & preventives, up to a year out
│   └── NineLivesLayout.tsx
├── constants/
│   └── presetOptions.ts            # CAT_BREEDS, PERSONALITY_TRAIT_OPTIONS, INSURANCE_PROVIDER_OPTIONS
├── store/
│   ├── slices/
│   │   ├── householdsSlice.ts
│   │   ├── catsSlice.ts
│   │   ├── vetClinicsSlice.ts
│   │   ├── doctorsSlice.ts
│   │   ├── conditionLibrarySlice.ts
│   │   ├── vaccineLibrarySlice.ts
│   │   ├── glossarySlice.ts
│   │   ├── resourcesSlice.ts
│   │   ├── visitsSlice.ts
│   │   ├── vaccinationsSlice.ts
│   │   ├── preventivesSlice.ts
│   │   ├── weightEntriesSlice.ts
│   │   ├── healthRecordsSlice.ts
│   │   ├── customHealthRecordTypesSlice.ts
│   │   ├── catConditionsSlice.ts
│   │   ├── symptomsSlice.ts
│   │   ├── expensesSlice.ts
│   │   ├── emergencyInfoSlice.ts
│   │   ├── careInstructionsSlice.ts
│   │   └── growthPhotosSlice.ts
│   ├── actions/
│   │   ├── householdsActions.ts
│   │   ├── catsActions.ts
│   │   ├── vetClinicsActions.ts
│   │   ├── doctorsActions.ts
│   │   ├── visitsActions.ts        # includes the outcome-flow writes
│   │   ├── vaccinationsActions.ts
│   │   ├── preventivesActions.ts
│   │   ├── weightEntriesActions.ts
│   │   ├── healthRecordsActions.ts
│   │   ├── customHealthRecordTypesActions.ts
│   │   ├── catConditionsActions.ts
│   │   ├── symptomsActions.ts
│   │   ├── expensesActions.ts
│   │   ├── emergencyInfoActions.ts
│   │   └── careInstructionsActions.ts
│   ├── listeners/
│   │   ├── householdListener.ts
│   │   ├── catsListener.ts
│   │   ├── vetClinicsListener.ts
│   │   ├── doctorsListener.ts             # household-wide reference data
│   │   ├── conditionLibraryListener.ts
│   │   ├── vaccineLibraryListener.ts
│   │   ├── glossaryListener.ts
│   │   ├── resourcesListener.ts
│   │   ├── visitsListener.ts
│   │   ├── vaccinationsListener.ts  # collectionGroup query, household-scoped
│   │   ├── preventivesListener.ts   # collectionGroup query, household-scoped
│   │   ├── catDetailListeners.ts    # healthRecords, weightEntries, catConditions, symptoms, expenses, growthPhotos, careInstructions
│   │   └── customHealthRecordTypesListener.ts
│   ├── selectors.ts
│   └── index.ts                     # exports NineLivesState, nineLivesReducer, selectNineLives
├── hooks/
│   ├── useNineLivesSync.ts    # household-level: household, cats, clinics, doctors, visits, vaccinations, reference libraries
│   └── useCatDetailSync.ts    # per-cat subcollections, only while that cat's detail view is open
├── utils/
│   ├── budgetCalculators.ts
│   ├── catHelpers.ts
│   └── dateHelpers.ts          # includes getDefaultVisitTitle(scheduledAt)
├── index.ts
├── README.md
├── TECHNICAL.md
├── types.ts
└── NineLives.tsx
```

`context/` and a `NineLivesProvider.tsx` are intentionally absent — components read via `useAppSelector` and dispatch thunks via `useAppDispatch` directly. Purely ephemeral view state that nothing else needs (e.g. "which cat's detail view is open") stays as local component state rather than a slice.