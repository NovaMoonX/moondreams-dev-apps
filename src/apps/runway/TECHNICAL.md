# Runway: Technical Design

Companion to `README.md` (what the app does) and `UX.md` plus the UX canvas (what it looks like). This document settles how it is stored, computed, secured and wired. Read the README's "Under the Hood" first; this expands it.

## Decisions made in this document

Items marked *Confirmed* changed something the README says or had a real alternative, and were confirmed before this revision. The rest follow from repo conventions.

1. **One private tree per person.** `apps/runway/plans/{uid}` is the plan document and everything else nests under it. No sharing, no `ownerUid` field, no `where` clause on `uid`. Rules are one line: `request.auth.uid == uid`.
2. **Sealed documents.** A document has a small set of readable fields (ids, dates, enums, flags, `createdAt`) and one `sealed` payload holding every sensitive value as a single AES-256-GCM ciphertext of a JSON object. Rules check the shape of `sealed`, never its contents. All validation of sealed contents (integer cents, non-negative, enum values) is client-side, which is acceptable because a plan is private to its owner.
3. **Key custody: a server-wrapped data key. Confirmed.** Each plan has one random 256-bit data key. It is stored only wrapped (AES-256-GCM under a master key taken from a versioned keyring held in a Functions secret) in a server-only document. The client gets it from a callable `getRunwayKey`, holds it in memory only, and never persists it. Functions that import bank data unwrap the same key to seal what they write. This differs from Worth the Wait, which stores the raw key in a Firestore document readable by members. It uses the same payload format and the same `@lib/security` helpers. The README line "the approach Worth the Wait uses" should become "the same payload and helpers Worth the Wait uses, with the key held by the server". Alternatives and why not:
   - *Raw key in the plan document (Worth the Wait's way).* Simplest, and the ciphertext is then protected only by the rules. Anyone who can read the database can read the key beside the data.
   - *Key derived from a passphrase the person types.* The strongest protection and the only real end-to-end option, but bank-data functions cannot seal what they write, so Link cannot work, and a forgotten passphrase loses the plan.
   - Limits of the chosen design: a person with both database access and Secret Manager access can decrypt. Losing the keyring loses every plan, so its shape, its protection against deletion and its recovery are specified under "Master secret management".
4. **The plan is dated versions.** Each plan item (source, pay line, bill, envelope, goal, group) is a header document plus append-only version documents. "The plan on date D" and "the plan as it was known on date D" are both answered from versions (Plan versions, below).
5. **An income day is computed until touched.** A coming income day exists only as a schedule occurrence. A day document is created the first time the person overrides it, confirms it, or marks it not arrived. Confirmed content lives in append-only records beside it.
6. **The draft is a pure function on the device.** `buildDraft(plan, days, state)` returns the same lines for the same inputs, in the order of operations written under "Draft algorithm". Nothing about a draft is stored until the person opens the day to confirm, when the draft as proposed is stored beside the confirmed split.
7. **Balances are derived from a ledger, with monthly closings. Confirmed.** No envelope holds a stored running balance. An envelope's figure is the sum of ledger entries since the starting point. To keep that cheap, a closing document per calendar month stores every balance at month end, and anything written into a closed month marks the closings from that month forward as stale (`dirtyFrom`). Closings are a cache and can always be rebuilt. The README's "derived values are never stored" holds for every figure except these caches.
8. **Spill-over results are recorded facts.** When a purchase overruns an envelope and a spill-over chain applies, the resulting split lines are stored on the purchase, because the result depends on balances at that moment and would otherwise change when later entries change.
9. **Money is integer cents; percentages are basis points; hours are minutes.** Allocation uses largest remainder with ties broken by id, so splits always add up and always come out the same.
10. **Dates.** Income days, due dates, effective dates and every other calendar-day value are date-only (UTC midnight). Schedules are generated with `getUTC*` math. "Today" for the person is their local calendar day mapped to UTC midnight (`todayAsUtcDate()`).
11. **Functions seal, the device decides.** Bank-data functions fetch, normalize, dedupe, seal and write purchases and balances. They do not apply merchant rules, match bills or match deposits. A reconcile pass on the device does that the next time the app is open, one transaction per purchase. Until then an imported purchase is `needsHome` and already comes out of Free to spend. Next Steps adds a server-side pass that does the same matching so notifications can be sent while the app is closed (Decision 21).
12. **Provider grants are server-only.** A provider's access grant is sealed with a second key derived from the current master key under a different label (the master key id is stored beside it), stored in a collection no client rule can read. The client only sees a link status document the server writes.
13. **Receipt images are sealed on the device.** Image bytes are encrypted before upload and stored under an owner-only Storage path. A daily scheduled function removes images past `expiresAt`.
14. **What-ifs are layered virtual versions.** An unsaved what-if exists only in memory. A saved one is stored sealed. Applying one writes ordinary versions and one change entry.
15. **One composite index.** The change log filtered by item needs one. Everything else is a single-field query with the rest filtered on the device.
16. **Beta access.** Runway is an access-gated app (`ProtectedRoute appId`) while it is in a beta phase.
17. **Look.** Runway has its own restrained theme (`runway.css`, `useRunwayTheme()`). Confirmed: the repo's guidance says "Playful by default"; Runway's README asks for plain and matter-of-fact. The app's rules file records the exception.
18. **No per-app manifest.** The site is one PWA. The repo's new-app checklist line "bump `SITE_VERSION`" is stale next to its own "never edit `SITE_VERSION`, label the PR `patch` or `minor`" rule. Runway follows the label rule.
19. **A short pairing is never covered silently.** A pairing that cannot be met from its own paycheck either tops up from the pool at the target's own tier (when the pairing allows it) or is held and needs a choice before the day can be confirmed (Draft algorithm, step 2).
20. **The master secret is a keyring.** One secret holds every master key ever used; ids are only added. Recovery safeguards are part of this design, not a later task.
21. **Server-side reconcile and notifications come after Link.** The same pure matching code runs in a Function when new posted purchases arrive, and pushes carry fixed text only (see "Server-side Reconcile and Notifications").

---

## System Invariants

The rules everything else depends on. Each is enforced where noted; breaking one is a bug, not a style choice.

1. **Sensitive values are sealed.** A readable field never holds a name, an amount, a merchant or a note. Rules check the shape of `sealed`; the device checks its contents.
2. **Day keys name occurrences.** A day key is `${payLineId}_${yyyymmdd}` and names one occurrence of a pay line whether or not a document exists for it. A draft line's id is `${dayKey}:${itemId}` and is stable across redraws, so ticks and overrides stay attached.
3. **Deterministic ids stop duplicates.** A day's document id is its day key. A bill-paid move is `paid_${billId}_${yyyymmdd}`, an auto-ended change is `ended_${itemId}`, a closing is `yyyy-mm`. Rules require the id to match the fields, so a second create fails instead of duplicating.
4. **A version is a whole payload, never a diff, and is create-only.** Of the versions covering a date, the one with the greatest `createdAt` wins. "Known on a date" keeps only versions with `createdAt < date + 86_400_000`.
5. **History is append-only.** Versions, day records, moves and changes allow `create` and `read` only. A mistake is superseded by a later entry. A confirmed day changes only through `correction` records; after confirmation the only writable field on the day is `doneLineIds`.
6. **A draft is a pure function.** The same plan, stance, overrides and state produce byte-identical output, in the order of operations under "Draft algorithm". A draft is stored only when the day is opened to confirm.
7. **Money is integer.** Cents, basis points and minutes are integers. Every split uses `allocate` (largest remainder, ties by id). No float ever holds dollars.
8. **A calendar day is UTC midnight.** Only `todayAsUtcDate()` reads the viewer's local day. A date-only end date is exclusive at `endDate + 86_400_000`.
9. **Balances derive from the ledger.** The only stored derived values are closings, valid only for months before `dirtyFrom`. Any write into a closed month sets `dirtyFrom` in the same transaction.
10. **A short pairing is never covered silently.** It is funded at its own tier or held, and a day with an unresolved hold cannot be confirmed.
11. **Spill-over results are stored facts.** The lines a purchase resolved to are saved on the purchase and are not recomputed when other entries change.
12. **The raw data key lives in memory only.** On the device it is in the query cache and `security.ts`; on the server, in a function's memory. It is never persisted, logged, put in Redux or returned except to its owner. `getRunwayKey` never creates a key when a wrapped one exists.
13. **Master key ids are never removed or reused, except through the retirement procedure.** Rotation adds an id and moves `current`; "Retiring a master key" is the only way an id leaves the keyring.
14. **A notification carries fixed text only.** No amount, name, merchant or note is ever interpolated into a push. A check script fails if a template takes a value from a sealed field.

---

## Data Schema

### Namespace root

`apps/runway/plans/{uid}` is the plan document. Everything below nests under it. Server-only data lives in `apps/runway/server/{uid}/…` with a deny-all client rule.

```text
apps/runway/
├── plans/{uid}                              PlanDoc (settings, stance, tracking periods, dirtyFrom)
│   ├── items/{itemId}                       PlanItemDoc          header of a source, pay line, bill, envelope, goal or group
│   ├── versions/{versionId}                 PlanVersionDoc       append-only, one per change to one item
│   ├── accounts/{accountId}                 AccountDoc
│   ├── days/{dayId}                         IncomeDayDoc         only once overridden, confirmed or marked not arrived
│   │   └── records/{recordId}               DayRecordDoc         append-only: proposed, confirmed, correction
│   ├── purchases/{purchaseId}               PurchaseDoc
│   │   └── receiptImages/{imageId}          ReceiptImageDoc      collection-group name is unique to Runway
│   ├── moves/{moveId}                       MoveDoc              append-only ledger entries that are not days or purchases
│   ├── expenses/{expenseId}                 ExpenseDoc           a named group of purchases ("Chicago trip")
│   ├── rules/{ruleId}                       MerchantRuleDoc
│   ├── changes/{changeId}                   ChangeDoc            append-only change log
│   ├── whatIfs/{whatIfId}                   WhatIfDoc
│   ├── closings/{yyyy-mm}                   ClosingDoc           derived cache, rebuildable
│   ├── links/{linkId}                       LinkDoc              written by functions only
│   └── accountBalances/{accountId}          AccountBalanceDoc    written by functions only
├── server/{uid}/keys/data                   WrappedKeyDoc        deny-all
├── server/{uid}/notified/{kind}_{subjectId}  NotifiedDoc          deny-all; create-only; stops a repeat push
├── keyChecks/{masterKeyId}                  KeyCheckDoc          deny-all; one canary per master key
├── server/{uid}/grants/{linkId}             ProviderGrantDoc     deny-all
└── usage/…                                  shared rule, already covered

Storage: apps/runway/receipts/{uid}/{purchaseId}/{imageId}       sealed bytes, owner-only
```

Receipt images are a subcollection of purchases (`receiptImages`) so the scheduled function can find expired ones with one collection-group query.

### Conventions applied

- Every field on a Firestore-backed type is a required key typed `T | null`. Absent values are written as `null`, arrays default to `[]`.
- Ids come from `generateUuid`. Some documents use deterministic ids so a duplicate create fails harmlessly: a day is `${payLineId}_${yyyymmdd}`, a bill-paid move is `paid_${billId}_${yyyymmdd}`, an auto-ended entry is `ended_${itemId}`, a closing is `yyyy-mm`.
- `createdAt` and `updatedAt` are instants in milliseconds. Everything else that is a day is date-only.
- Constants (enums, caps) live in `constants.ts`. `types.ts` holds types only.
- Superseded fields stay in the type with `@deprecated` and are written as `null`.

### Constants

```ts
export const ITEM_KINDS = ['source', 'payLine', 'bill', 'envelope', 'goal', 'group'] as const;
export const PRIORITIES = ['must', 'should', 'want'] as const;         // sealed; ordered must < should < want
export const STANCES = ['conservative', 'middle', 'optimistic'] as const;
export const SCHEDULE_KINDS = ['weekly', 'everyOtherWeek', 'twiceMonthly', 'monthly', 'once', 'irregular'] as const;
export const DAY_STATUSES = ['draft', 'confirmed', 'notArrived'] as const;
export const DAY_RECORD_KINDS = ['proposed', 'confirmed', 'correction'] as const;
export const MOVE_KINDS = [
  'start', 'billPaid', 'cardPayment', 'transfer', 'withdrawal',
  'balanceCorrection', 'trackingChange',
] as const;
export const CHANGE_KINDS = ['planChange', 'start', 'levelMove', 'whatIfApplied', 'ended', 'correction'] as const;
export const PURCHASE_SOURCES = ['manual', 'csv', 'link'] as const;
export const ACCOUNT_KINDS = ['checking', 'savings', 'cashManagement', 'investment', 'other'] as const;
export const LINK_STATUSES = ['linking', 'ok', 'needsReauth', 'revoked'] as const;
export const SEALED_SCHEMA_VERSION = 1;

export const MAX_CHANGE_ITEM_IDS = 20;
export const MAX_DONE_LINE_IDS = 200;
export const RECEIPT_LIFETIME_DAYS = 365;
export const RECEIPT_OFFER_DAYS = 30;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const LOOKAHEAD_MONTHS = 12;
```

Priority, schedule kind and ending are sealed (they describe a person's finances); the constants are used on the device only.

### Sealed payloads

```ts
/** Ciphertext of JSON.stringify({ v, ...fields }). Same shape @lib/security produces. */
export type Sealed = EncryptedFieldPayload;
export type Opened<T> = T & { v: typeof SEALED_SCHEMA_VERSION };
```

`openSealed<T>(sealed, key)` throws `UnsupportedSealedVersion` when `v` is newer than the app knows, and the screen shows "Update the app to open this" instead of partial data.

Shared value types used inside sealed payloads:

```ts
export type Cents = number;                 // integer, signed where noted
export type Bps = number;                   // integer basis points, 100 = 1%
export type DateOnly = number;              // UTC midnight, ms

export interface MoneyRange { lowCents: Cents; highCents: Cents }          // equal when exact

export interface Hourly { rateCents: Cents; minutesLow: number; minutesHigh: number }

/** What a funding line, pairing, tax or deduction asks for. Never a range. */
export type FundingAmount =
  | { kind: 'exact'; cents: Cents }
  | { kind: 'percent'; bps: Bps; of: 'dayMoney' | 'remaining' }
  | { kind: 'rest' };

export interface Ending {                  // all null = never; whichever is reached first
  onDate: DateOnly | null;
  afterCount: number | null;
  totalCents: Cents | null;
  resetsEachYear: boolean;                 // a yearly limit
}

export interface Schedule {
  kind: (typeof SCHEDULE_KINDS)[number];
  anchor: DateOnly | null;                 // first occurrence for weekly kinds, once, monthly
  monthDays: number[];                     // monthly: [d]; twiceMonthly: [d1, d2]; 31 clamps to the month's last day
  roughMonthly: MoneyRange | null;         // irregular only: what lookahead may expect
}

export interface Step { on: DateOnly; bps: Bps | null; cents: Cents | null }   // a scheduled increase

export interface Pairing {                 // where money from a source, pay line or day goes
  targetItemId: string;
  amount: FundingAmount;
  topUpFromAnySource: boolean;
}

export interface FundingRule {             // envelopes and goals
  amount: FundingAmount;
  cadence:
    | { kind: 'everyIncomeDay' }
    | { kind: 'everyNth'; n: 2 | 3; anchorDayKey: string }
    | { kind: 'monthly'; take: 'first' | 'last' | 'split' }
    | { kind: 'chosen'; dayKeys: string[] };
}
```

A **day key** names one occurrence of a pay line (Invariant 2).

Per-kind payloads (the `sealed` of a **version**; the item header holds only readable fields):

```ts
interface SourceSealed {
  name: string; notes: string | null;
  startsOn: DateOnly | null; endsOn: DateOnly | null;      // seasonal job, contract
  pairings: Pairing[];
}

interface PayLineSealed {
  name: string;
  schedule: Schedule;
  amount: MoneyRange | null;               // null when hourly
  hourly: Hourly | null;
  ending: Ending;
  stanceOverride: (typeof STANCES)[number] | null;
  pairings: Pairing[];
  steps: Step[];
  deductions: { name: string; amount: FundingAmount; buildsAsset: boolean }[];   // Next Steps; [] in the MVP
  grossEntered: boolean;
}

interface BillSealed {
  name: string; emoji: string | null; groupId: string | null;
  priority: (typeof PRIORITIES)[number];
  orderIndex: number;                       // fractional rank inside its tier
  amount: MoneyRange;
  timing:
    | { kind: 'date'; schedule: Schedule }                     // one time or repeating
    | { kind: 'window'; opensOn: DateOnly; closesOn: DateOnly }
    | { kind: 'none' };                                        // no date: use an envelope instead
  ending: Ending;
  fundedBy: { kind: 'suggested' } | { kind: 'chosen'; dayKeys: string[] };
  stanceOverride: (typeof STANCES)[number] | null;
  loan: LoanTerms | null;
  steps: Step[];
  accountId: string | null;
}

interface LoanTerms {                       // Next Steps
  balanceCents: Cents; rateBps: Bps; paymentCents: Cents; asOf: DateOnly;
}

interface EnvelopeSealed {
  name: string; emoji: string | null;
  priority: (typeof PRIORITIES)[number];
  orderIndex: number;
  funding: FundingRule;
  spillTo: string[];                        // ordered envelope ids, any depth
  accountId: string | null;
}

interface GoalSealed {
  name: string; emoji: string | null;
  priority: (typeof PRIORITIES)[number];
  orderIndex: number;
  targetCents: Cents; targetDate: DateOnly | null;
  funding: FundingRule;
  state: 'active' | 'paused';               // completed is derived; archived is on the header
  rateBps: Bps | null;                      // interest on the account holding it
  accountId: string | null;
}

interface GroupSealed {
  name: string; startingPriority: (typeof PRIORITIES)[number] | null;
}
```

`EnvelopeSealed` as built carries `name`, `emoji`, `priority`, `orderIndex` and `funding`; `spillTo` and `accountId` arrive with the issues that read them. `FundingAmount` is `exact` only and `FundingRule.cadence` offers `everyIncomeDay`, `everyNth` and `chosen`; `percent`, `rest` and `monthly` arrive with theirs. A new envelope's `orderIndex` is the tier's highest plus one. The Plan tab's pill is the `section` URL param (`income`, `envelopes`).

### PlanDoc

```ts
interface PlanDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: (typeof STANCES)[number];         // readable: three values, no amounts
  startDate: DateOnly | null;               // the starting point; null until set up
  trackingPeriods: { from: DateOnly; to: DateOnly | null }[];   // Track is on while the last period has to = null
  dirtyFrom: string | null;                 // 'yyyy-mm': first closing that is stale
  planTogetherDays: number | null;          // plan together income days within N days of each other
  notify: { moneyArrived: boolean; billPaid: boolean; billDue: boolean; incomeToday: boolean };   // Next Steps; all false until turned on
  keyId: string | null;                     // which data key sealed this plan
  sealed: Sealed | null;                    // { currencyCode, displayPrefs, notifyTimeZone, notifyHour }
}
```

The first issue to ship the plan document writes only `uid`, `createdAt`, `updatedAt`, `stance`, `keyId` and `sealed` (`{ currencyCode }`, opened when the plan loads: a payload that does not open puts the screen in its failed state); every other field arrives with the issue that reads it, and the rules allow only these keys until then.

`stance`, `trackingPeriods` and `notify` are readable on purpose: the rules, listener bounds and server functions need them, and none contains an amount or a name. Level is derived: Track is on when the last period has `to == null`; Link is on when any account has a live link.

### PlanItemDoc

```ts
interface PlanItemDoc {
  id: string;
  kind: (typeof ITEM_KINDS)[number];
  parentId: string | null;                  // a pay line's source id; a bill's group stays sealed
  createdAt: number;
  endedAt: DateOnly | null;                 // set once, when an ending is reached
  archivedAt: number | null;
}
```

The header holds no name. Everything the person would recognise is in the latest version.

### PlanVersionDoc

```ts
interface PlanVersionDoc {
  id: string;
  itemId: string;
  kind: (typeof ITEM_KINDS)[number];        // repeated so one listener can route without reading the header
  createdAt: number;
  effectiveFrom: DateOnly;
  effectiveUntil: DateOnly | null;          // null = until superseded; set for "for a stretch"
  changeId: string;                         // the ChangeDoc that made it
  sealed: Sealed;                           // the full payload for this kind, not a diff
}
```

A version holds the whole payload, so resolving a date never replays history (Invariant 4).

### AccountDoc

```ts
interface AccountDoc {
  id: string;
  createdAt: number;
  archivedAt: number | null;
  linkId: string | null;                    // set by the attach callable
  sealed: Sealed;                           // { name, institution, kind, countedTowardTotal }
}
```

`kind` is sealed because "investment" or "cash management" says where someone banks; nothing queries by it.

### IncomeDayDoc and records

```ts
interface IncomeDayDoc {
  id: string;                               // day key
  payLineId: string;
  sourceId: string;
  expectedOn: DateOnly;
  arrivedOn: DateOnly | null;
  status: (typeof DAY_STATUSES)[number];
  createdAt: number;
  confirmedAt: number | null;
  doneLineIds: string[];                    // checklist ticks; opaque ids, arrayUnion/arrayRemove
  sealed: Sealed | null;                    // while draft: the override { amountOrHours, pairings, lineOverrides, holdResolutions }
}

interface DayRecordDoc {
  id: string;
  dayId: string;
  kind: (typeof DAY_RECORD_KINDS)[number];
  createdAt: number;
  supersedesId: string | null;              // a correction names the record it replaces
  sealed: Sealed;
}
```

Sealed record contents:

- `proposed`: the draft lines as they stood when the day was opened to confirm, the plan fingerprint, and the stance used.
- `confirmed`: `arrivedCents`, the confirmed lines (`{ lineId, itemId, cents, paidBy: [{ dayId, cents }], note }`), the differences against `proposed` each with an optional note, and where extra money went or a shortfall came from.
- `correction`: the replacement lines, the before and after effect, and a note.

The day's effective split is the latest `correction` that no later correction supersedes, else `confirmed`. A day document can be updated while `status == 'draft'`; once confirmed, only `doneLineIds` can change (see rules).

A `notArrived` day has no records. Its draft disappears and lookahead reacts. Undoing it sets the status back to `draft`.

### PurchaseDoc

```ts
interface PurchaseDoc {
  id: string;
  date: DateOnly;                           // when it happened
  status: 'pending' | 'posted';
  source: (typeof PURCHASE_SOURCES)[number];
  needsHome: boolean;                       // readable so it can be queried
  accountId: string | null;
  expenseId: string | null;
  importBatchId: string | null;
  dedupeKey: string | null;                 // HMAC of provider ids, written by functions; lets pending settle in place
  createdAt: number;
  updatedAt: number;
  sealed: Sealed;
}
```

Sealed: `amountCents` (negative for a refund), `merchant`, `note`, `link`, `paidByCard`, `lines: { envelopeId, cents, via: 'chosen' | 'spill' | 'free' }[]`, `assignedBy: 'person' | 'auto' | null`, `incomeDayId`, `refundOfId`, `matchedBillKey`, `receiptText`. A purchase with `needsHome: true` has no `lines` yet and counts against Free to spend.

### MoveDoc

Append-only ledger entries that are neither a day nor a purchase.

```ts
interface MoveDoc {
  id: string;
  kind: (typeof MOVE_KINDS)[number];
  date: DateOnly;
  refId: string | null;                     // a bill id for billPaid, a link id for trackingChange
  reversesMoveId: string | null;            // an undo is a new move that names the one it undoes
  createdAt: number;
  sealed: Sealed;                           // lines, amounts, notes
}
```

`start` holds the starting point: money on hand, each envelope, goal, bill progress and account balance on the start date. It is the base of every balance. `billPaid` records the actual amount and day (a bill marked paid, including ahead of time, or matched from a purchase). `cardPayment` settles the card reserve against checking. `transfer` is "move leftover money" between envelopes, goals and Free to spend. `withdrawal` lowers a goal. `balanceCorrection` is a statement balance for a loan or an interest correction. `trackingChange` records Track moves with the starting amounts.

### Smaller documents

```ts
interface ExpenseDoc { id: string; createdAt: number; sealed: Sealed /* { name, note } */ }

interface MerchantRuleDoc {
  id: string; createdAt: number;
  sealed: Sealed;                           // { merchantKey, target: envelopeId | 'varies' }
}

interface ChangeDoc {
  id: string;
  kind: (typeof CHANGE_KINDS)[number];
  createdAt: number;
  effectiveFrom: DateOnly | null;
  itemIds: string[];                        // opaque, at most MAX_CHANGE_ITEM_IDS; array-contains for "filter by item"
  sealed: Sealed;                           // { summary, before, after, affectedDays, note }
}

interface WhatIfDoc {
  id: string; createdAt: number; savedAt: number; appliedAt: number | null;
  sealed: Sealed;                           // { name, versions: DraftVersion[], overrides }
}

interface ReceiptImageDoc {
  id: string; purchaseId: string;
  createdAt: number;
  expiresAt: number | null;                 // null once kept
  keptAt: number | null;
  bytes: number;
  sealed: Sealed;                           // { fileName, contentType, nonce for the bytes }
}

interface ClosingDoc {
  id: string;                               // 'yyyy-mm'
  month: string;
  createdAt: number;
  sealed: Sealed;                           // balances, free to spend by source, bill progress, loan balances at month end
}

interface LinkDoc {                         // functions write; client reads
  id: string;
  status: (typeof LINK_STATUSES)[number];
  lastSyncAt: number | null;
  createdAt: number;
  sealed: Sealed;                           // { institutionName, providerAccounts: [{ providerAccountId, accountId }] }
}

interface AccountBalanceDoc {               // functions write; client reads
  id: string;                               // accountId
  asOf: number;
  sealed: Sealed;                           // { cents }
}
```

Server-only:

```ts
interface WrappedKeyDoc {
  uid: string; keyId: string; keyVersion: number; createdAt: number; updatedAt: number;
  masterKeyId: string;                      // which keyring entry wrapped it
  algorithm: 'AES-256-GCM';
  ciphertext: string; nonce: string;        // data key sealed under that master key, tag appended, uid as authenticated data
}

interface ProviderGrantDoc {
  linkId: string; providerItemId: string; cursor: string | null;
  masterKeyId: string;
  wrapped: string; nonce: string; createdAt: number;
}

interface KeyCheckDoc {                     // lets verifyRunwayKeys prove a master key still works
  masterKeyId: string; createdAt: number;
  wrapped: string; nonce: string;           // a fixed test value sealed under that key
  expectedDigest: string;
}
```

### Readable versus sealed

| Readable (queries, rules, ordering) | Sealed (everything a person would recognise) |
|---|---|
| ids, `kind`, `createdAt`, `updatedAt` | names, emoji, notes, institution, merchant |
| every date-only value: `effectiveFrom`, `expectedOn`, `arrivedOn`, purchase `date`, `startDate` | every amount, range, rate, balance, target |
| status and flags: `status`, `needsHome`, `source`, `archivedAt`, `endedAt` | priority, order, schedule, ending, pairings, funding rule |
| opaque id lists: `itemIds`, `doneLineIds` | lines, differences, matches, receipt text |
| `stance`, `trackingPeriods`, `dirtyFrom` | account kind and whether an account counts |

What a reader of the database can still learn without the key: how often each pay line pays, when bills fall, how many purchases happened on which days, how many envelopes there are, and when money moved. Not what anything is called or how much it is. This is the "alone or in combination" decision the README deferred, and it is stated in the app's privacy copy.

### Derived values (never stored, except closings)

| Value | Derived from |
|---|---|
| Plan on a date; plan as it was known on a date | versions |
| Coming income days | pay line schedules, endings and day documents |
| Draft for a day | the plan on that date, stance, overrides and balances |
| Envelope "assigned", "left", "safe to spend" | closing plus ledger since; level decides the label |
| Free to spend and its split by source | closing plus ledger since |
| Bill progress | funding lines from confirmed days; paid state from `billPaid` moves |
| Loan balance and payoff date | `LoanTerms`, payments, interest and `balanceCorrection` moves |
| Goal pace and state `completed` | target, contributions, date |
| Lookahead headline and gaps | simulated drafts over `LOOKAHEAD_MONTHS` |
| Level (Plan, Track, Link) | `trackingPeriods` and live links |
| Plan fingerprint | hash of resolved versions, used to memoize drafts |

---

## State Machines & Logic

All of this lives in `src/apps/runway/engine/` as pure TypeScript: no React, no Firestore, no `Date.now()` (the clock is passed in). Everything that must come out the same every time is tested by `scripts/checks/runwayEngine.ts` (run by `npm run check:runway-engine`, the shape of `check:pinch-math`).

### Money

- `Cents` are integers. No float ever holds dollars.
- A percentage is `Bps`. `percentOf(cents, bps) = Math.floor(cents * bps / 10_000)`. The largest product (a $10M balance at 25%) is about 2.5e12, well inside 2^53.
- `allocate(total, weights, ids)` splits a total by largest remainder, ties broken by ascending id. Splits, refunds in original proportion, shared interest and "split across the month's income days" all use it.
- Hours are stored in minutes. Gross from hourly = `Math.round(rateCents * minutes / 60)`.
- Monthly interest = `Math.round(balanceCents * rateBps / 120_000)`, half up, computed on the payment date and labeled estimated until a `balanceCorrection` move exists.
- `formatCents` (the repo's edge formatter) is the only place cents become text. Formatters are built once.

### Dates and schedules

- `occurrences(schedule, ending, from, to)` yields date-only values. Weekly kinds step from `anchor` by 7 or 14 days. `monthly` and `twiceMonthly` use `monthDays`, clamped to the month's last day. `once` yields `anchor`. `irregular` yields nothing, and lookahead uses `roughMonthly` spread on the first of each month.
- An occurrence is cut off by `onDate`, `afterCount` (counting confirmed or paid occurrences plus remaining), or `totalCents`, whichever comes first. A yearly limit (`resetsEachYear`) restarts the running total each January 1.
- There is no weekend or holiday shifting. Money that lands on another day is confirmed on that day and the schedule does not move.
- Comparing an instant with a date-only end date uses `endDate + 86_400_000` as the exclusive bound.
- `todayAsUtcDate()` is the only function that reads the viewer's local day, and the only place a local getter appears.

### Plan versions

`resolveItem(versions, itemId, on, knownAt?)`:

1. Take the item's versions where `effectiveFrom <= on` and (`effectiveUntil == null` or `on < effectiveUntil`).
2. If `knownAt` is given, keep only versions with `createdAt < knownAt + 86_400_000`.
3. Return the one with the greatest `createdAt`. If none, the item does not exist on that date.

So the most recent decision that covers a date wins, and a temporary version that has run out stops covering dates, which makes the earlier version return with no write ("Vacation fund returns to $300 this time" is derived from that). A temporary change sitting inside a later permanent change loses to it only if the permanent change was made later, which is the order the person decided them in; the effect preview shows it before it is applied.

- The **draft for a coming day** uses `resolvePlan(versions, on)` with no `knownAt`.
- **Plan as of a past date** uses `resolvePlan(versions, on, knownAt = on)`, read-only: what the person's plan said that day, including changes already made for later dates, and excluding changes made afterwards.
- "For the next N income days" is turned into an `effectiveUntil` date when the change is made, using the schedule at that moment, and the note on the change says so.
- An item with `archivedAt` or `endedAt` has no versions that cover later dates; its older versions still resolve.

**As first shipped (Issue 5).** `SourceSealed` carries `name` and `PayLineSealed` carries `name`, `schedule` (`kind`, `anchor`, `monthDays`), `amount` (a `MoneyRange`, equal ends for an exact amount) and `ending` (`onDate`, `afterCount`); the other fields above arrive with the issues that read them, and readers default a missing one. `resolve(items, versions, on, knownAt?)` also drops an item that is archived or ended before `on`. `resolveCurrentOrNext` returns the version in force or, for an income that has not begun, the earliest later one, so the Income list shows a pay line whose first payday is ahead. `selectResolvedPlan(state, on)` is that list (each source with its pay lines) and `selectComingDays(state, today)` is `buildComingDays`: each pay line's schedule from its version in force, `LOOKAHEAD_MONTHS` ahead, each day taking its amount from the version in force on it. `createIncome` writes the headers, first versions and one change in a single `writeBatch`; the rules create an item only with `endedAt` and `archivedAt` null and require a version's item and change to exist in the same batch (`existsAfter`).

### Draft algorithm

`buildDraft(input) → Draft`, with `input = { days, plan, stance, state, overrides }`. `days` are one to many income days planned together, sorted by `expectedOn` then `payLineId`. `state` carries bill progress, loan balances and envelope balances. A draft allocates only the money of the days it plans; it never draws on existing Free to spend.

**Order of operations.** This is the contract the README points to.

0. **Day money.** For each day, `money = override ?? pick(stance, amount)`. `pick` takes `lowCents` for income under Conservative, `highCents` under Optimistic, and the midpoint (rounded down) under Middle; expenses use the opposite ends. A per-item `stanceOverride` replaces the plan's stance for that item. Hourly: `pick` over `minutesLow..minutesHigh`, then gross from hourly. In the MVP the entered amount is take-home. With gross (Next Steps), deductions are subtracted here in their listed order, each exact or a percent of gross.
1. **Demands.** For each day, collect what is due a line on it:
   - bills: the funding for that day (below);
   - envelopes and goals whose `FundingRule.cadence` selects the day (below);
   - the overspend annotation for any envelope below zero.

   Each demand carries `{ itemId, tier, dueBeforeNext, orderIndex, createdAt, amountSpec }`. `dueBeforeNext` is true when the item's next due date falls before the next income day after this one.
2. **Pairings.** A pairing sends part of one day's money to a named target (a bill, envelope or goal). For each day:
   1. Take the narrowest pairing set: the day's own, else its pay line's, else its source's.
   2. Order the paired targets by the sort key in step 4.
   3. Fund them only from that day's own money, in that order, with `available` starting at `money`:

      | Pairing amount | Takes |
      |---|---|
      | `exact` | `min(cents, available)` |
      | `percent of dayMoney` | `percentOf(money, bps)`, capped at `available` |
      | `percent of remaining` | `percentOf(available, bps)` at its turn |
      | `rest` | what is left after every other pairing of that day |

   4. A pairing replaces the target's own rule for that day, so the target is never funded twice.
   5. What a pairing cannot cover is its `shortBy`. Resolve it with this branch:

   ```
   if shortBy == 0:                       nothing more
   else if pairing.topUpFromAnySource:    add demand(target, shortBy, tier = target.tier)       // step 4 list
   else if target.tier in (must, should): add hold(target, shortBy, tier = target.tier)         // step 4 list
   else:                                  mark line short(shortBy), offer "Top up"; nothing held // want
   ```

   - *Demand:* an ordinary line at the target's own tier, so a short Must is funded before any Should or Want.
   - *Hold:* reserves pool money exactly where a funded line would, but is not funded. The line reads "Rent is $100 short from Main job. $100 is held until you choose", and no lower line can use the money. The day cannot be confirmed while a hold is unresolved. The person chooses *Top up* (the hold becomes a funded line) or *Leave it short* (the money is released to the lines below it). The choice is stored in the day's override as `holdResolutions`, so the draft stays deterministic. If the pool has less than the `shortBy`, the hold takes what is there and the rest stays short.
3. **Pool.** What each day has left after its pairings becomes a chunk `{ dayId, sourceId, cents }` in a first-in-first-out list, ordered by day.
4. **Everything else.** Sort the remaining demands by: tier (must, should, want); `dueBeforeNext` true first; `orderIndex` ascending; item `createdAt` ascending; `itemId` ascending. Walk the list. A hold takes pool money the same way a funded line does. Each line takes `min(demand, pool remaining)`; a `percent of remaining` amount is resolved at that point from the pool then left. A line consumes chunks from the front of the pool and records `paidBy: [{ dayId, cents }]`, so a planned-together list can say which day's money pays for which line.
5. **Unfunded.** A demand that got less than it asked for records `shortBy` and a reason code (`poolExhausted`). When two demands tie on the first four keys and the money covers only one, the one placed first records `tieBrokenBy: 'createdAt'`, and the draft says so.
6. **Free to spend.** Whatever is left in the pool is Free to spend from this draft, by source.
7. **Output.** Lines in sort order, pairings first for each day. Each line has `{ lineId, itemId, cents, shortBy, paidBy, reason }`, where `reason` is a structured code the screen words ("Rent: due Dec 1, Must, paid from Main job") and `lineId = ${dayKey}:${itemId}`, stable across redraws so `doneLineIds` and overrides stay attached.

**Demand rules.**

- *Bill, chosen days:* the amount is split across the chosen day keys with `allocate`.
- *Bill, suggested:* with `remaining = amount − funded so far` and `n` = income days from this one through the last income day on or before the due date, demand `Math.ceil(remaining / n)`; the last such day demands exactly what remains. A bill due before the next income day demands all of `remaining` (n is 1).
- *Bill, window:* the same as suggested, counting income days before `closesOn`.
- *Bill, paid ahead:* no demand. Whatever part of the payment was not yet set aside for it came out of Free to spend, and the money the bill would have asked for on later days stays in the pool, which is how the next drafts make it up.
- *Envelope or goal (cadence selection is `selectFundedDays` in `engine/schedule.ts`; an anchor that has left the coming-day list counts from the first day listed, so an `everyNth` envelope never silently funds nothing):* `everyIncomeDay` is every day; `everyNth` selects days whose index since `anchorDayKey` in the plan-wide chronological income-day list is a multiple of n; `chosen` selects named day keys; `monthly` selects the first or last income day of the month in that list, or all of them with the amount split by `allocate` ("split").
- *Goals:* a paused goal or one at its target demands nothing.
- *Loan payment:* a bill with `LoanTerms`; the demand is `paymentCents`, capped at the balance plus estimated interest, and the loan ends when the balance reaches zero.
- *Overspend:* the engine never changes a demand's size for an overspent envelope. It marks the first `min(line, −balance)` cents of that envelope's line as repaying the overspend.

**Properties the check script asserts.** Shuffling the input arrays changes nothing. The sum of line cents plus Free to spend equals the sum of day money. No line is negative. A planned-together draft's `paidBy` cents sum to each line. Dropping a lower-priority demand never reduces a higher-priority line. No line of a lower tier is funded from money a hold has reserved, and a Must demand is never starved by a hold on a Should. Re-running with the same inputs yields identical JSON.
### Lookahead

`lookahead(plan, startState, horizon)` chains drafts: for each coming income day, or planned-together set, build the draft, assume it is confirmed as proposed and nothing is spent, and carry bill progress, loan balances and Free to spend into the next. The horizon is `LOOKAHEAD_MONTHS` or the last income day, whichever comes first.

- *Holds through:* the last income day before the first day on which a Must goes unfunded (a Must held or short because of a pairing counts as unfunded), or a bill due on or before the next income day is not fully funded. In lookahead an unresolved hold stays reserved and shows as a gap on its day.
- *No income before a bill is due:* a bill whose due date falls after the last income day that could fund it.
- *Cushion:* the sum over ranges of the difference between the Conservative and Middle figures, shown only when the plan's stance is not Middle.
- It is memoized on the plan fingerprint and state key. With 200 items over a year this is under 60 drafts of a few hundred lines each, which fits comfortably in a single synchronous selector; if profiling says otherwise it moves to a worker without changing its signature.

### Proposals

`proposeCover(shortfall, plan, days)` returns temporary versions that lower funding: lowest tier first (want, then should), then highest `orderIndex` first, then id; a Must only if the person picks it. `proposePutToWork(newIncome, plan)` returns versions that add funding to the highest-priority gaps first. `proposeOverspend(envelope, amount)` lists where an overspend could come from by priority when no spill-over chain is set. All three return `ProposedChange[]` that go through the same "from when" and effect preview as any change. Nothing is applied until the person confirms.

### Balances and closings

`deriveBalances(closing | start, entries) → Balances` folds ledger entries in order:

| Entry | Effect |
|---|---|
| `start` move | sets every starting balance |
| confirmed day (latest correction wins) | adds each line to its envelope, goal, bill progress or reserve; leftover to Free to spend by source |
| purchase with `lines` | subtracts each line from its envelope; `via: 'free'` lines draw Free to spend; a `paidByCard` purchase also moves that amount into the card reserve |
| purchase with `needsHome` | draws Free to spend until assigned |
| refund purchase | returns to its original lines in proportion by `allocate`; an archived or unmatched original goes to the envelope the person picked, default Free to spend |
| `billPaid` | marks the occurrence paid; the part of the actual amount beyond what was set aside for the bill draws Free to spend, and a smaller actual returns the difference |
| `transfer`, `withdrawal`, `cardPayment`, `balanceCorrection` | as named; a move with `reversesMoveId` set cancels the move it names |

Free to spend is derived last: money on hand plus leftovers, minus draws. If it is below zero the Over-assigned line shows.

**Closings.**

- A closing for month M is valid when `plan.dirtyFrom == null` or M is earlier than `dirtyFrom`.
- A month is closable once it is strictly before the viewer's current month. On load, if the latest valid closing is more than one month behind, the device builds the missing closings in order and `create`s each one.
- Any write that adds or changes an entry dated in a closed month does, in the same transaction, `dirtyFrom = min(dirtyFrom, thatMonth)` on the plan document. Rebuilding advances from `dirtyFrom` and, in a transaction that re-reads the plan document and aborts if `dirtyFrom` changed, replaces the closings and moves `dirtyFrom` forward or to `null`.
- The loading window of the "recent" listeners starts at the first day of the month after the latest valid closing (or `startDate` if there is none), so cold start loads about a month, not the whole plan.
- Closings are never edited by hand and never read by rules.

### Spill-over and check an amount

- Spill-over at purchase time: `resolveSpill(envelopeId, cents, balances, chains)` returns lines `[{ envelopeId, cents, via }]`. The envelope's own balance goes first, then each name in `spillTo` in order, then the remainder as `via: 'free'`. The lines are stored on the purchase. Editing or removing a purchase resolves again against balances without it.
- Check an amount: `checkAmount(envelopeId, cents, balances, chains, plan)` returns what is left after, or by how much it falls short and the ordered list of sources it would use (the chain, then a by-priority list). It reads nothing it cannot show.

### Matching (Track and Link)

All of this runs on the device in the reconcile pass, after the listeners settle:

1. A `needsHome` purchase that matches a bill by merchant text, amount (within the bill's range) and date (within three days of the due date) marks the bill paid with a `billPaid` move and takes no envelope lines.
2. A purchase whose merchant key matches a `MerchantRuleDoc` goes to that envelope; `varies` never auto-assigns.
3. A purchase that settles a card payment becomes a `cardPayment` move.
4. A deposit (money in on a linked account, `needsHome`) matches an income day:
   1. *Candidates:* days that are `draft` or `confirmed`, not `notArrived`, that no purchase is already linked to (`incomeDayId`), and whose `arrivedOn ?? expectedOn` is within three days either side of the deposit's date.
   2. *Amount:* a draft day matches when the amount is inside its range, or within 15% of the expected amount when exact. A confirmed day is compared the same way against its confirmed `arrivedCents`.
   3. *Choice:* nearest by date, then closest amount, then earliest `expectedOn`. If two candidates still tie, or none remain, the deposit stays `needsHome` and asks.
   4. *On a draft day:* the purchase gets `incomeDayId`, the day is ready to confirm, and the `moneyArrived` push may be sent.
   5. *On a confirmed day* (the person confirmed while the deposit was pending): the purchase gets `incomeDayId` and nothing else changes. The confirmed split is not touched and no push is sent. If the amount differs from `arrivedCents`, the day shows the difference with the existing correction action.
5. A manual purchase and an arriving real one for the same account match on amount and date within three days; the manual one is offered as the match and nothing is counted twice.
6. Everything else stays `needsHome`.

Pending deposits are never matched, because a pending amount can change. A day confirmed in the meantime is still a candidate once the deposit posts, and a deposit never moves to a later day merely because its own day is no longer coming.

Each step is one `runTransaction` that re-reads the purchase and aborts if another device already changed it. A rule is suggested only after the same merchant key goes to the same envelope three assignments in a row.

**Properties the matching check asserts** (`scripts/checks/runwayEngine.ts`). A deposit never links to a day another deposit is linked to. A deposit that posts after its day was confirmed links to that day, changes no confirmed amount and sends no push. A deposit two weeks from any day asks. Two equal candidates ask, and the same input in any order gives the same result. A pending deposit produces no match.

### Lifecycles

| Thing | States and transitions |
|---|---|
| Income day | no document (draft, computed) → `draft` document on override → `confirmed` (refused while a hold is unresolved; transaction: status must be `draft`, writes the `proposed` and `confirmed` records, aborts with a readable message if another device confirmed first) · `draft` → `notArrived` · `notArrived` → `draft` · `confirmed` stays confirmed; changes are `correction` records |
| Plan item | active → ended (`endedAt`, written once when an ending is reached, with a `ended` change entry whose id makes a second write fail) · active → archived (`archivedAt`); older versions keep resolving |
| Goal | `active` ↔ `paused` (a version); `completed` is derived from the target; archive is the header |
| Bill occurrence | funding → paid (`billPaid` move, possibly ahead of its due date) → undone (a move with `reversesMoveId`) |
| Purchase | `needsHome` → assigned; `pending` → `posted` in place (same `dedupeKey`); edits recompute lines |
| Tracking | Plan → Track (new period with `from`) → Plan (period `to` set); each is a `trackingChange` move and a `levelMove` change; a purchase dated outside every period is refused |
| Link | `linking` → `ok` ⇄ `needsReauth` → `revoked`; the server owns every transition |
| What-if | in memory → saved (`WhatIfDoc`) → applied (`appliedAt`, versions written) or dropped (document deleted if saved, nothing otherwise) |
| Receipt image | stored (`expiresAt = createdAt + 365 days`) → offer window (last 30 days: keep or download) → kept (`expiresAt = null`) or removed by the scheduled function (document and Storage object deleted; the text details on the purchase remain) |
| Closing | valid → stale (`dirtyFrom`) → rebuilt |

Moving to Track requires a start date and starting amounts; moving to Link requires a start date and the confirmed line-up, and neither happens without them.

### What if

`applyWhatIf(plan, draftVersions)` layers virtual versions (synthetic `createdAt = Infinity`, so they win) over the real versions and returns a plan. Every selector that takes a plan (draft, lookahead, balances) takes this one the same way, so the comparison beside the real plan is two calls of the same function. Applying a what-if writes real versions with their own `effectiveFrom`/`effectiveUntil` and one `whatIfApplied` change in a single `writeBatch` (all new documents, no reads). Hours for an hourly pay line are a version of that pay line.

---

## Security Rules Design Criteria

The block lives in `firestore.rules` under `apps/runway/…`. The four-read-predicate pattern other apps use is not needed because nothing is shared: one predicate, `isOwner(uid)`.

1. **Owner only, one line.** Every client-readable path under `apps/runway/plans/{uid}/…` allows access only when `request.auth.uid == uid`. No `ownerUid` body check, no `where`, no composite index for access.
2. **Server-only paths deny everything.** `apps/runway/server/**` and `apps/runway/keyChecks/**` are `allow read, write: if false`. Admin SDK access from Functions bypasses rules.
3. **Server-written documents are read-only to the client.** `links` and `accountBalances` allow `read` for the owner and `write: if false`. A client cannot forge a link status or a balance.
4. **Shape, not content.** A helper `isSealed(v)` requires a map with `value` (string), `nonce` (string), `keyId` (string), `keyVersion` (number) and `algorithm == 'AES-256-GCM'`. Every `create` and `update` asserts `isSealed(request.resource.data.sealed)` where the field is required, and `sealed == null` where it is allowed to be null. Rules never inspect amounts.
5. **Required keys, explicit nulls.** Each collection's `create` asserts the full key set with `hasAll` and `hasOnly`, and each field's type or `null`. `get(field, default)` is used on reads of fields added later so legacy documents keep passing.
6. **Immutable fields.** After create, these never change: `id`-derived fields, `createdAt`, `kind`, `itemId`, `dayId`, `payLineId`, `sourceId`, `expectedOn`, `effectiveFrom`, `purchaseId`, `changeId`. Rules compare `request.resource.data.X == resource.data.X`.
7. **Append-only collections.** `versions`, `records`, `moves`, `changes` allow `create` and `read` only; `update` and `delete` are `false`. A mistake is superseded by a later entry, never edited. This is what makes history trustworthy.
8. **Write-once fields.** `endedAt` on a plan item may go from `null` to a date once and never change again. `confirmedAt` on a day likewise.
9. **Income day transitions.** An `update` of a day is allowed only when `resource.data.status == 'draft'` (any field except the immutable ones), when the status moves `draft → confirmed`, `draft → notArrived` or `notArrived → draft`, or when `affectedKeys().hasOnly(['doneLineIds'])` after the day is confirmed. A confirmed day's `arrivedOn` and `status` cannot change.
10. **Bounded arrays.** `doneLineIds.size() <= 200` and `itemIds.size() <= 20`. Lists inside a sealed payload cannot be checked by rules and are capped on the device.
11. **Deterministic ids.** A day, bill-paid move, auto-ended change and closing allow `create` only when the document id equals the value the fields imply (for example `paid_{refId}_{yyyymmdd}`), so a duplicate or a spoof fails.
12. **Plan document.** `create` and `update` allowed for the owner; `uid` and `createdAt` immutable; `dirtyFrom` is `null` or matches `^\d{4}-\d{2}$`; `stance` is one of three strings; `notify` is a map of four booleans; `trackingPeriods` is a list of maps whose `from` is a number and `to` is a number or `null`. `delete` is `false`; deleting a plan goes through the `deleteRunwayPlan` callable.
13. **Closings.** `create`, `update`, `delete` allowed for the owner, because they are a rebuildable cache; the id must match `yyyy-mm`.
14. **Purchases.** `delete` is allowed for the owner (removing a purchase is a real action and the ledger entry goes with it); `needsHome` is a boolean; `source` is in the allowlist; `date` is a number. `dedupeKey` is immutable once set.
15. **Storage.** `apps/runway/receipts/{uid}/{purchaseId}/{imageId}` allows read, write and delete to `request.auth.uid == uid`, `request.resource.size <= 10 MiB`, and `contentType == 'application/octet-stream'` (the bytes are sealed, so no image type is ever visible to Storage).
16. **No unauthenticated callable surface.** Every Runway callable checks `request.auth`. The provider webhook is the one HTTPS function that does not, and it authenticates by the provider's signature.
17. **Verified, not assumed.** Each rule above has at least one allowed and one denied write in the emulator run, signed in as the owner and as a second user, plus a legacy-shaped document with the newer keys removed.

### Indexes

`firestore.indexes.json`:

| Collection | Fields | Used by |
|---|---|---|
| `changes` | `itemIds` ARRAY_CONTAINS, `createdAt` DESC | change log filtered by one item |
| `receiptImages` (COLLECTION_GROUP, single-field exemption) | `expiresAt` ASC | the scheduled expiry function |

Everything else is a single-field query. Where the obvious query would need an index (confirmed days in a date window needs `status` plus a range on `expectedOn`; Needs a home needs `needsHome` plus an order by `date`), the query uses the one field and the device filters or sorts the rest. `npm run check:indexes` covers both entries.

---

## Client State Management

### Slice

`src/apps/runway/store/runwaySlice.ts`, registered in `src/store/index.ts`, cleared by `resetAllState`. It holds decrypted, in-memory data only and is never persisted.

```ts
interface RunwayState {
  keyStatus: 'idle' | 'loading' | 'ready' | 'failed';
  plan: OpenPlan | null;
  items: Record<string, OpenItem>;
  versions: OpenVersion[];                  // all of them; see Performance
  accounts: Record<string, OpenAccount>;
  rules: OpenRule[];
  expenses: Record<string, OpenExpense>;
  whatIfs: Record<string, OpenWhatIf>;
  links: Record<string, OpenLink>;
  accountBalances: Record<string, OpenBalance>;
  closings: Record<string, OpenClosing>;
  recent: { days: Record<string, OpenDay>; purchases: Record<string, OpenPurchase>; moves: OpenMove[] };
  needsHome: Record<string, OpenPurchase>;
  window: { from: DateOnly; to: DateOnly; changes: OpenChange[]; days: …; purchases: … } | null;
  loaded: Record<ListenerKey, boolean>;
  errors: Record<ListenerKey, string | null>;
  draftScratch: DraftVersion[];             // the unsaved what-if
}
```

`Open*` types are the readable fields merged with the opened sealed payload. A document whose payload fails to open (unsupported version) is kept as `{ id, unreadable: true }` so counts stay honest and the screen can say so.

### Key

`src/apps/runway/queries/runwayKeyQueries.ts` follows the Worth the Wait shape:

```ts
export const runwayQueryKeys = { all: ['runway'] as const, key: (uid: string) => [...runwayQueryKeys.all, 'key', uid] as const };
export function runwayKeyQueryOptions(uid: string) {
  return queryOptions({
    queryKey: runwayQueryKeys.key(uid),
    queryFn: () => callGetRunwayKey().then(normalizeRunwayEncryption),   // AppEncryption<'runway'>
    staleTime: Infinity,                                                  // written once, never rotated in the MVP
    retry: false,                                                         // a failure shows the failed state; "Try again" asks once more
  });
}
```

No `meta: { persist: true }`: key material is never persisted, and the cache is cleared on user switch. The key lives in the query cache and in `security.ts` closures only. It is not put in Redux.

### Listeners

Plain `startXListener(key, onChange)` functions in `store/listeners/`, started once from `useRunwaySync(uid)` (the shape of `useNineLivesSync`), never from a leaf component. Each snapshot is decrypted before it reaches the slice. Decryption is async, so every listener tags each snapshot with a sequence number and drops a result that finishes after a newer one has started; otherwise a slow decrypt could overwrite fresher data.

**Tier 1: the signed-in person's plan.** Starts when `keyStatus == 'ready'`:

| Listener | Query |
|---|---|
| plan | the plan document |
| items, versions, accounts, rules, expenses, whatIfs, links, accountBalances, closings | the whole collection (each is small and needed by the first screen) |
| recent days, purchases, moves | `date`/`expectedOn` `>= recentFrom`, where `recentFrom` is the first day of the month after the latest valid closing (or `startDate`) |
| needsHome | `where('needsHome', '==', true)`, any date |

When closings advance, `recentFrom` changes and the three "recent" listeners restart, which happens about once a month.

**Tier 2: the history window.** Keyed on `(from, to)`; only mounted while a history, import or search view is open. It listens to `changes`, `days` and `purchases` within the range, one window at a time. Changing the window restarts it. Search runs on the decrypted window in memory.

A listener whose collection errors sets `errors[key]` and `loaded[key]` to a failed state; screens show a loading or failed state, never "none", for any count fed by it.

### Actions

Thunks in `store/actions/`, by what can race:

| Action | Primitive |
|---|---|
| change a plan item (new version, change entry, header on first create) | `writeBatch` of new documents, no reads |
| confirm a day | `runTransaction`: read the day, abort if not `draft` or if a hold in its draft is unresolved, write the day update and the `proposed` and `confirmed` records, set `dirtyFrom` if the day is in a closed month |
| correct a day | `runTransaction` as above, writes a `correction` record |
| mark not arrived / undo | `runTransaction` on the day document |
| tick a checklist line | `updateDoc` with `arrayUnion` / `arrayRemove` on `doneLineIds` |
| add, edit, remove a purchase | `runTransaction` that also sets `dirtyFrom` when dated in a closed month; resolves spill-over against fresh balances |
| reconcile a purchase | `runTransaction` re-reading the purchase |
| rebuild closings | `runTransaction` re-reading the plan document, as above |
| change the stance, planTogetherDays | `updateDoc` of those fields |
| move level | `runTransaction`: new tracking period, `trackingChange` move, `levelMove` change |
| apply a what-if | `writeBatch` |
| receipts | upload to Storage first, then create the document; delete removes the document, then the object |

Side effects that talk to a function (attach an account, unlink, delete the plan) run outside any transaction and report their own failure in the sheet that asked.

### Selectors

`createSelector` chains, memoized on the plan fingerprint and the relevant slices: `selectResolvedPlan(on)`, `selectComingDays`, `selectDraft(dayKey | group)`, `selectLookahead`, `selectBalances`, `selectEnvelopeFigure(id)` (the level decides "assigned", "left" or "safe to spend"), `selectFreeToSpend`, `selectOverAssigned`, `selectNeedsHome`, `selectLevel`, `selectPlanAsOf(date)`. A calendar-style view reads a prebuilt day-keyed map, never a per-cell filter.

### Level gating

`selectLevel` derives Plan, Track or Link. `LevelGate` is a wrapper that renders nothing for a feature above the current level, so nothing greyed out ever reaches the screen. Data for a hidden level is still listened to; only its UI is absent.

---

## Component Encapsulation

- **Screens** read slices with `useAppSelector` and call thunks. They never touch Firestore, `@lib/security` or the engine directly.
- **The engine takes values and returns values.** It imports nothing from React, the store or Firebase.
- **`security.ts`** (in the app, like Worth the Wait's) wraps `@lib/security`: `sealJson`, `openJson`, `sealBytes`, `openBytes`, `normalizeRunwayEncryption`. Nothing else in the app calls `encryptValue` or `decryptValue`.
- **Query factories** hold the key and link callables; the store holds no callable results.
- **Components hold drafts, not Firestore.** A form keeps its own state and hands a finished value to an action. An open form's pending change is previewed through `EffectPreview`, which calls the engine with a layered what-if of one change.
- **Shared first.** Per the repo rule that a primitive with no app entities in its props lives in `src/components` from its first use: `AmountField` (modes passed as props: exact, range, percent with caller-supplied "of" labels, rest) and `BeforeAfterRow` are built there. `EffectPreview`, `FromWhenPicker`, `IncomeDayCard`, `DraftLine`, `PriorityBadge`, `CoverageHeadline` and `LevelGate` name income days, plans or levels and stay in the app. If the roadmap finds a second app that needs either shared one, nothing moves; they start shared.
- **Existing components used:** `SectionHeader`, `SectionDivider`, `Subview`, `FormSheet`, `ModalFooterActions`, `DeleteIconButton`, `AddFieldChips`, `PillGroup`, `MultiPillGroup`, `PickOrCreate`, `AppToggle`, `MoneyInput`, `SearchInput`, `SortControl`, `StatTile`, `HelpTip`, `BackLink`, `EntryTile`, `UndoSnackbar`, `ActionRow`, `DetailSheet`, `SummaryEditor`, `EmptyCard`, and `useActionModal().confirm` for destructive confirms.

---

## UI Conventions Applied

- **Containers.** A form with several sections is a `FormSheet` (drawer on a phone). Confirm, Correct this day, What if and Cover it swap content inside their sheet with `BackLink`; none stacks an overlay on an overlay. Setup, the line-up, Needs a home and History open as `Subview`s.
- **Dates.** Every income day, due date, effective date and purchase date is date-only: written with `fromDateInputValue`, displayed with `formatDateUTC`, picked with `toDateInputValue`. A confirmed-at time is an instant and shows in local time.
- **Money.** `MoneyInput` and `formatCents` only. A range is labeled everywhere it drives a figure.
- **Forms.** Submit disables until required fields are valid. Titles are plain nouns ("Bill", "Income", "Envelope"). A detail the path depends on (the amount that arrived, which pay line, ends when) is a visible question with pills; truly optional extras (group, emoji, note) are chips.
- **Deletes and removals.** There are almost none. Ending, pausing and archiving keep history; a purchase delete uses a destructive confirm; removing a row in a form uses the undo snackbar.
- **Copy.** Matter-of-fact and relationship-correct ("Dining is $18 over. It would take $18 from Everyday spending."), with no scoring or cheerleading. Copy lives in `constants.ts` where it is reused.
- **Lists at 5 and 50.** Envelopes, bills, goals and purchases are capped on the home screen, searchable from eight rows, and windowed in History.
- **Empty first run.** One `EmptyCard`, one action, and no control for data that does not exist.

### Theming

`runway.css` defines the app's tokens in light and dark blocks, including `--color-popover`, `--color-popover-foreground`, `--color-tooltip`, `--color-tooltip-foreground` and `--subview-backdrop` (enforced by `npm run check:apps`), a restrained blue accent with no tint on body text, and the subview tokens. `useRunwayTheme()` applies it. Emoji appear only where the person chose one for an envelope, bill or goal.

---

## Security & Privacy Requirements

### Encryption in the app

- `AppEncryption<'runway'>` uses the existing `createAppEncryptionKey`/`normalizeAppEncryption` types; `AppId` gains `'runway'`.
- `sealJson(obj)` = `encryptStringForApp(JSON.stringify({ v: SEALED_SCHEMA_VERSION, ...obj }), encryption)`. `openJson` reverses it and validates `v`.
- Bytes (receipt images) need a binary path. `src/lib/security/encryption.ts` gains general `encryptBytes(bytes, key, keyId, keyVersion)` and `decryptBytes(...)`, with no app words in names or errors, reusing `aesGcm`. The nonce is stored on `ReceiptImageDoc.sealed`.
- Plain-HTTP origins already fall back to `@noble/ciphers`; the same fallback serves bytes.
- No sealed value is ever logged, put in a URL, an error message or analytics, and the Firestore offline cache holds ciphertext only.

### The key

- `getRunwayKey` (callable, `request.auth` required): in one transaction reads `server/{uid}/keys/data`; if the document does not exist creates a random 256-bit key, wraps it with the current master key from the keyring (`RUNWAY_MASTER_KEYS`, AES-256-GCM, a fresh nonce) and stores it with that key's `masterKeyId`; if the document exists it unwraps it with the key its `masterKeyId` names, and if unwrapping fails it returns an error and raises an alert, never a new key; returns `{ appId: 'runway', keyId, keyVersion, key }` over TLS. The raw key is never stored and never logged.
- The Admin SDK reads the wrapped key; rules deny every client path to it.
- Function-side helpers `unwrapPlanKey(uid)` and `sealForPlan(uid, obj)` are the only code that handles the raw key on the server, in `functions/src/apps/runway/planKey.ts`.
- Rotation is not in the MVP. `keyVersion` and `keyId` are on every payload so a later rotation can re-seal lazily.
- Emulator and seeds: the emulator reads `RUNWAY_MASTER_KEYS` from `functions/.secret.local` or falls back to a fixed development keyring only when `FUNCTIONS_EMULATOR` is set, never in production. Seeds seal fixtures with `createSeedAppEncryptionKey('runway')` and write the matching wrapped key under the same development master key.

### Master secret management

Everything the server seals hangs on one secret. This is the contract for keeping it.

**Shape.** One Functions secret, `RUNWAY_MASTER_KEYS`, holds a keyring as JSON: `{ "current": "m2", "keys": { "m1": "<64 hex>", "m2": "<64 hex>" } }`. Wrapped data keys, provider grants and canaries record the `masterKeyId` that sealed them.

- **Why a keyring and not a single value.** With a single-value secret, adding a version makes `latest` the new key and strands every wrapped key made under the old one. With a keyring, rotation is a new secret version that contains every key ever used and moves `current`. The latest version is self-sufficient, so destroying an older version cannot strand data.
- **Ids are only added** (Invariant 13). A tool that publishes a new version refuses a keyring missing any id the previous version had.
- **Lazy re-wrap.** A wrapped data key whose `masterKeyId` is not current is re-wrapped under the current key the next time it is unwrapped, in a transaction. Nothing re-seals the data itself.
- **Fails closed.** A deploy-time check and a cold-start check reject a malformed keyring, a `current` that is not in `keys`, or any key that is not 32 bytes.
- **An unwrap failure never creates a key.** Overwriting a wrapped key destroys the plan, so `getRunwayKey` creates a key only when the document does not exist, and the screen says the plan cannot be opened right now.

**Keeping old versions.**

1. **Delayed destruction on the secret.** `gcloud secrets update RUNWAY_MASTER_KEYS --version-destroy-ttl=90d` (1 to 1000 days). A version that is destroyed is disabled at once and permanently destroyed only after the delay, and an admin can re-enable it in between. When first set it applies to every enabled and disabled version already there. It does not protect against deleting or expiring the whole secret, which destroys every version immediately.
2. **No expiry or TTL on the secret**, for that reason. Rotation is a manual, reviewed act.
3. **Least privilege.** The Functions runtime service account has `roles/secretmanager.secretAccessor` on this secret only. Everyday human accounts hold none of Secret Manager Admin, Editor or Secret Version Manager on it (the first and last include `versions.destroy`; Admin and Editor include `secrets.delete`). Project Owners and Editors still carry destroy and delete, so add an IAM deny policy on `secretmanager.googleapis.com/secrets.delete` and `secretmanager.googleapis.com/versions.destroy` with a named break-glass exception. **Not yet verified:** that Secret Manager is on Google's list of deny-supported services (the strings above follow the documented `SERVICE/RESOURCE.ACTION` format, and the permission is `secretmanager.versions.destroy`, not `secretVersions.destroy`); that the project sits under an organization, since the Deny Admin role is documented as granted on the organization; and that a project Owner cannot simply remove the policy. A scratch-project test settles all three. If any fails, this layer is dropped and the others carry it.
4. **Firebase CLI hazards.** `firebase functions:secrets:destroy` deletes a whole secret, and `secrets:prune` deletes secrets no deployed function references. Neither is run against this secret. A PR that removes the last function binding to it is rejected in review, because the next prune would delete it.
5. **Detection inside the recovery window.** `verifyRunwayKeys` (scheduled daily) reads the secret and, for every id in the keyring, unwraps that id's canary in `apps/runway/keyChecks/{masterKeyId}` (a fixed test value sealed when the key was added). Each run writes one structured log entry: `event: 'runway.keys.ok'` at INFO, or `event: 'runway.keys.failed'` at ERROR naming the id and the reason (`secret-unreadable` for a disabled or destroyed version, `missing-id`, `missing-canary`, `unwrap-failed`, `keyring-invalid`, `check-error`). A latest version that is disabled can stop the instance starting, so no entry is written at all; only the missing-heartbeat alert catches that. Nothing alerts you by default; three alert policies are created by hand in Cloud Monitoring, written into the runbook, and each tested once in a scratch project by breaking the thing it watches:
   - *Failure:* a log-based alert on `jsonPayload.event="runway.keys.failed"`.
   - *Missing heartbeat:* a log-based metric counting `runway.keys.ok`, with an alert when it is absent for 26 hours. This catches the function not running at all (scheduler paused, deploy broken), which a failure alert cannot.
   - *Secret activity:* see 6.

   All three notify one email channel (the account owner's), and the Google Cloud mobile app can add a push. Because of the destruction delay, an alert arrives while the version can still be re-enabled.
6. **Audit alert.** A log-based alert on Secret Manager Admin Activity entries for the methods `google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion`, `.DisableSecretVersion` and `.DeleteSecret` on this secret (Google's audit-logging reference lists all three as Admin Activity methods; Admin Activity logs are always on and cannot be turned off). A test version destroyed in a scratch project confirms the filter before the real one is trusted.
7. **Escrow outside Google Cloud.** After every rotation the keyring is saved, encrypted, to storage the Firebase project cannot reach, held by the account owner in two places: a password manager vault and a second secure cloud account that is separate from the Firebase project's Google account. This covers losing the project, the account or the secret itself, which the destruction delay does not. One person holds it in the MVP; "Succession" below is the plan for more than one.
8. **A recovery drill** before the first real user and after each rotation: in a scratch project, restore from escrow and unwrap a test plan's wrapped key.
9. **A runbook** in `functions/README.md` lists the above, who holds escrow, and the exact recovery steps.

**Limits.** Anyone holding the keyring and read access to the database can decrypt every plan. Cloud KMS would remove master key bytes from function memory, unwraps on request, tracks which key version wrapped what and destroys key versions on a schedule. The repo uses Secret Manager everywhere, so this design stays with it, and KMS is the alternative to weigh if the escrow burden proves too high (Open questions).

### Succession (after the MVP)

The MVP has one holder: the owner holds the Google Cloud project, the billing account and both escrow copies. Nothing is lost when the owner is unavailable for a while. The secret and the database stay where they are and the app keeps running. What is at risk is continuity: if billing lapses or the project is closed, the secret and every wrapped data key go with it, and escrow without access to the database cannot decrypt anything. So the plan protects the project and the ability to recover, not only the keyring.

In order, each step useful on its own:

1. **A second Owner** on the Google Cloud project and the billing account: one named, trusted person. They are subject to the same deny policy and break-glass rule as the first. Billing emails and budget alerts go to both.
2. **Access to escrow for the same person**, through the password manager's emergency access (a waiting period the owner chooses, cancellable by the owner) and a recovery contact on the second cloud account. Both are set once and checked each time escrow is updated.
3. **A runbook written for someone who did not build this.** It names the project, the secret, the escrow entries, the two alerts to expect and the exact recovery steps, with no unstated knowledge.
4. **The recovery drill done by the second person**, from the runbook alone, in the scratch project. The step passes when they unwrap a test plan's key without help. The drill is repeated after each rotation and after either person changes.
5. **Optional: split the keyring.** If one trusted person is more than the owner wants to rely on, divide the escrow with Shamir secret sharing (for example any 2 of 3 shares, held by the owner, a second person and a safe place). It adds tooling, a share register and a re-split at every rotation, so it is taken only if steps 1 to 4 are judged not enough.

Not part of this: moving to Cloud KMS. It does not solve succession; it moves custody into IAM, which still needs a second Owner.

When to do it: before the plan data of anyone other than the owner is held. It is not an MVP issue because the MVP has no such users. The retirement procedure's "Update escrow" step gains "confirm the second holder can still reach the new entry" once this ships.

### Retiring a master key

Invariant 13 stops a key id being dropped casually. When one must go (a suspected leak, or deliberate clean-up) this is the only way. It is run by a maintainer with Admin SDK credentials from `scripts/runway/retireMasterKey.ts`, never by a deployed function.

1. **Escrow first.** Save the current keyring to escrow, labeled with the date, before anything changes.
2. **Rotate if needed.** If the key being retired is `current`, add a new key and make it current first (a normal rotation).
3. **Re-wrap.** The script finds every `server/{uid}/keys/data` and `server/{uid}/grants/*` whose `masterKeyId` is the retiring id (collection-group queries; each needs a single-field collection-group index exemption on `masterKeyId`) and re-wraps it under `current`, one transaction per document that re-reads the document first. It is idempotent and resumable, and prints the count remaining per id.
4. **Prove zero.** The script exits non-zero unless both queries return nothing for the retiring id. It then deletes that id's canary.
5. **Publish without the id.** The publish tool normally refuses a keyring missing an id. Its `--retire <id>` flag is the only way past, and only when step 4 passed in the same run.
6. **Remove the old versions.** Disable, then destroy, the secret versions that still contain the retired key. With delayed destruction a destroyed version is disabled at once and gone after the delay.
7. **Update escrow.** The new keyring replaces the live escrow entry. Keep the old keyring only in a separate entry marked retired, and only if backups need it (below).
8. **Verify.** Run `verifyRunwayKeys` by hand and do the recovery drill.

**Limits.** A Firestore export or point-in-time recovery taken before step 3 holds wrapped keys under the retired id, and restoring one needs the retired key. In a leak response, delete those backups instead of keeping the key. Retirement also does not undo exposure that already happened: someone who held the retired key and a copy of the database could already have unwrapped the data keys. Closing that needs a data key rotation (a new data key and every document re-sealed), which is not in the MVP.

### Bank data

- One provider, Plaid, behind `BankDataProvider` in `functions/src/apps/runway/link/provider.ts` (the Plaid code lives in `providerPlaid.ts` and nowhere else):
  `createLinkSession(uid)`, `exchange(uid, publicToken)`, `listAccounts(grant)`, `getBalances(grant)`, `syncTransactions(grant, cursor)`, `revoke(grant)`. Normalized outputs are `NormalizedAccount`, `NormalizedBalance` and `NormalizedTransaction` (provider-neutral id, signed cents, posted date, pending flag, merchant text, account id). Provider names do not appear outside `provider*.ts`.
- Runway never receives or stores bank credentials. Where the bank supports OAuth, the person signs in on the bank's own site; Plaid's documentation says OAuth is used by "a number of" US institutions, not all, so for others the credentials are entered in Plaid's Link window and go to Plaid, not to Runway. The README's wording is corrected to say so.
- Plaid mapping: `createLinkSession` creates a link token; `exchange` swaps the public token for an access token (the sealed grant); `syncTransactions` uses the cursor-based sync endpoint, triggered by Plaid's "updates available" webhook; the webhook is verified with Plaid's signed header, so no separate webhook secret is expected. To confirm in the Link spike, along with whether Plaid covers cash-management accounts such as Wealthfront and whether its investments product makes a second provider unnecessary for the Beyond item.
- The grant is sealed under `HKDF(current master key, 'runway-provider-grant')`, a different key from the data key's wrapper, with the `masterKeyId` stored beside it, and stored in `server/{uid}/grants/{linkId}`. It is never returned to a client.
- `syncRunwayAccount` (triggered by the provider's webhook and by a scheduled backstop) fetches with the cursor, builds `dedupeKey = HMAC(HKDF(plan data key, 'runway-dedupe'), linkId + providerTransactionId)` (so master rotation never changes it; a future data key rotation must carry this subkey forward), upserts purchases (`needsHome: true`, `status` from the pending flag, same document when a pending charge posts) sealed with the plan key, writes `accountBalances`, and updates the link status. It logs counts and ids, never merchants or amounts.
- `attachRunwayAccount({ linkId, providerAccountId, accountId })` binds a provider account to a Runway account the person already named.
- `unlinkRunwayAccount` revokes at the provider, deletes the grant, sets the link to `revoked`, keeps what already came in.
- A person who never links has no `links`, no `server/…/grants` and no bank data anywhere.

### Receipts

- Images are sealed on the device, uploaded as opaque bytes, and decrypted on the device for display; thumbnails are generated on the device before sealing and sealed separately.
- `expireRunwayReceipts` (scheduled daily) queries the `receiptImages` collection group for `expiresAt <= now`, deletes the Storage object and then the document, and leaves the purchase's text details and links. It deletes nothing that has `expiresAt == null`.
- The keep-or-download offer is client-side from `expiresAt`: within `RECEIPT_OFFER_DAYS` of expiry, the purchase shows the offer; keeping sets `keptAt` and `expiresAt = null`, and a kept image is permanent: only the person (removing it) or deleting the plan removes it, and there is no per-plan cap. Kept images are the one part of a plan that grows without a limit, so storage use per plan is watched and a cap is added only if it matters. Downloading decrypts and saves the file.

### Deleting a plan

`deleteRunwayPlan` (callable) revokes every link, then removes the plan with the Admin SDK's recursive delete (all subcollections), the `server/{uid}` tree and the Storage prefix `apps/runway/receipts/{uid}/`. It requires a recent sign-in and a typed confirmation from the client. The shared `apps/runway/usage` records are left to the usage system.

### Optional AI

Not built here. When added, the call path is a callable that sends the least text needed, takes the plan key on the server, states what it will send before it sends, and omits account and bank identifiers. This document reserves no schema for it.

---

## Server-side Reconcile and Notifications

Next Steps, after Link. It ships as three pieces in this order, each usable on its own.

1. **Spike: sharing the engine.** `functions/` compiles with `rootDir: src` and imports nothing from the app. The matching steps, plan resolution, schedule generation and the `dirtyFrom` helper must run in both places and give identical answers. Candidates: copy the engine into `functions/` at build time with a parity check (the way Pinch's digest logic is kept in step), a small shared package, or a Functions build that includes the engine folder. The spike picks one by running the engine's golden checks against both copies. The requirement on the engine, already true, is that these modules are pure and import nothing from React, the store or Firebase.
2. **Server reconcile.**
   - *Trigger:* after `syncRunwayAccount` writes posted purchases, it marks the plan as needing a pass; a short per-plan debounce runs the pass once for a burst of webhooks.
   - *Loads only what matching needs:* items and versions with `kind` in `bill`, `payLine`, `source` (a readable field, so the query filters), the `rules` collection, the coming `days` window and the `needsHome` purchases. Not closings, not balances.
   - *Does:* the same steps as "Matching" on **posted** purchases only, one `runTransaction` per purchase that re-reads it. A purchase already assigned is left alone. The sealed `assignedBy` records `person` when the person assigned it and `auto` when a pass did; a pass only ever touches `needsHome` purchases, so it cannot overwrite a choice. A write into a closed month sets `dirtyFrom` in the same transaction.
   - *Fails soft:* if the pass cannot run (key trouble, a timeout) the purchases stay `needsHome` and the device pass catches up.
   - The device pass stays as the catch-up and for CSV imports.
3. **Notifications.**

| Kind | Needs | Text | Opens |
|---|---|---|---|
| `moneyArrived` | a deposit matched to a coming income day | "Money arrived. Ready to confirm." | that day |
| `billPaid` | a purchase matched to a bill | "A bill was paid." | the bill |
| `billDue` | the schedule only | "A bill is due tomorrow." | the bills list |
| `incomeToday` | the schedule only | "Income is expected today." | that day |

   - *Switches:* `PlanDoc.notify`, all four `false` until the person turns one on (a switch that interrupts starts off). Whether the browser receives notifications at all stays a site setting; Runway asks for permission on a tap, with the reason beside it.
   - *When:* the two matching kinds send right after the pass. The two schedule kinds are sent by `sendRunwayReminders`, scheduled hourly, which checks each plan with a switch on against its sealed `notifyTimeZone` and `notifyHour` (default 9:00 local) and the plan's schedules and bills for tomorrow or today.
   - *Once only:* before sending, a function creates `server/{uid}/notified/{kind}_{subjectId}` (create-only). If it already exists, nothing is sent, so a retried webhook, a pending charge that posts, or an hourly rerun cannot send twice. A purchase that is reversed after posting does not unsend.
   - *Delivery:* `sendPushToUsers` and `toAppUrl` from the existing `functions/src/notifications/sendPush.ts`, with the link inside the `resumeParams` allowlist. Dead device tokens are removed by the code that already does that. Runway never writes the `reminders` collection, which stores message text in plain text, and never shows a push by hand.
   - *Text:* fixed strings in `functions/src/apps/runway/notificationText.ts`. `scripts/checks/runwayNotifyText.ts` fails if a template interpolates anything from a sealed field or a purchase. A lock-screen detail opt-in is a later option, not part of this.
   - *iOS:* web push works only when the site is installed to the home screen; the switch says so where it applies.
4. **Cost and load.** One pass per burst, reading a few hundred small documents for one plan, not its whole history. Measured in the spike with the scale seed's largest plan. The hourly reminder function reads only plans with a schedule switch on.
5. **Security.** The function already unwraps the plan key to seal imports, so this adds no new access; it adds code that runs with it. Logs carry ids, kinds and counts. A failed unwrap raises the same alert as elsewhere and sends nothing.
6. **Tests.** Emulator fixtures: a webhook payload becomes an assigned purchase and exactly one notification record; the same payload again sends nothing; a purchase the person assigned is untouched; a pending purchase is skipped until it posts; a purchase in a closed month sets `dirtyFrom`; each template contains no value from the fixtures.

Functions added: `reconcileRunwayPurchases` (task-triggered, internal) and `sendRunwayReminders` (scheduled, hourly), with rows in `functions/README.md`. No new secret.

---

## Performance

- **Decrypt volume.** A plan with 5 years of use has about 2,000 versions, a few hundred items, up to 25,000 purchases and 1,500 moves and day records. Only items, versions and the current month's entries are decrypted at start (a few thousand small payloads, about 50 to 150 ms with WebCrypto). History and imports decrypt one window at a time.
- **Closings** bound cold start to a month of entries regardless of age.
- **Versions** are loaded whole. If a plan's version count passes a few thousand, a "plan snapshot" (the resolved plan on a date, sealed) can replace the older ones; this is measured on the scale seed before it is built.
- **Selectors** are memoized on the plan fingerprint; a keystroke in a form recomputes only the draft of the day being previewed.
- **One listener per key**, batched snapshots, async decrypt guarded by sequence numbers.
- **Lists are capped**; the home screen shows Free to spend and the most-used envelopes, and long lists are lazily mounted.
- **Formatters** (`Intl.NumberFormat`, date formatters) are built once.
- **Scale seed.** `scripts/seeds/runwayScale.ts` builds a five-year plan (three sources, 60 bills, 25 envelopes, 12 goals, 25,000 purchases, closings for every month) to test cold start, the history window, the lookahead and search with the dev build throttled. Targets: first useful screen within 1.5 s; a draft recompute under 30 ms; History window change under 300 ms.

---

## Component & File Architecture

```text
src/apps/runway/
├── README.md  UX.md  TECHNICAL.md  ISSUES.md
├── RunwayPage.tsx                  top-level page: useRunwaySync, useTrackAppUsage, theme, level shell
├── types.ts  constants.ts  security.ts  runway.css  useRunwayTheme.ts
├── engine/                         pure: money, dates, schedule, resolve, demands, draft, lookahead,
│                                   balances, closings, spill, matching, proposals, loans, whatIf
├── queries/                        runwayKeyQueries.ts, linkQueries.ts
├── store/                          runwaySlice.ts, listeners/, actions/, selectors/, useRunwaySync.ts
├── hooks/                          useReconcile.ts (the matching pass), useClosings.ts, useToday.ts
├── components/                     IncomeDayCard, DraftLine, PriorityBadge, CoverageHeadline, LevelGate,
│                                   FromWhenPicker, EffectPreview, forms/, sheets/
├── screens/                        one folder per sitemap entry in UX.md
└── utils/                          app-only helpers

src/components/AmountField.tsx      shared, from first use
src/components/BeforeAfterRow.tsx   shared, from first use
src/lib/security/encryption.ts      + encryptBytes, decryptBytes

functions/src/apps/runway/
├── findFirstActivityAt.ts          oldest createdAt the plan holds, or null
├── planKey.ts                      wrap, unwrap, sealForPlan
├── getRunwayKey.ts
├── deleteRunwayPlan.ts
├── expireReceiptImages.ts
├── reconcile.ts                    Next Steps: server-side matching pass
├── sendReminders.ts                Next Steps: hourly schedule-based pushes
├── notificationText.ts             Next Steps: the fixed push strings
└── link/                           provider.ts, provider<Name>.ts, normalize.ts, createLinkSession.ts,
                                    attachAccount.ts, unlinkAccount.ts, syncAccount.ts, webhook.ts

scripts/seeds/runway.ts  runwayScale.ts
scripts/checks/runwayEngine.ts
scripts/checks/runwayKeyGuard.ts     fake keyrings: every publish refusal and every check failure, against the Firestore emulator
scripts/runway/publishKeyring.ts     maintainer-only: validate and publish the keyring; refuses a missing key id
scripts/runway/retireMasterKey.ts   maintainer-only, Admin SDK; see Retiring a master key
```

### Functions and secrets

| Function | Trigger | Purpose |
|---|---|---|
| `getRunwayKey` | callable | create or return the plan's data key |
| `deleteRunwayPlan` | callable | remove the plan, links, grants and receipt objects |
| `expireRunwayReceipts` | scheduled, daily | remove receipt images past `expiresAt` |
| `verifyRunwayKeys` | scheduled, daily | prove every master key in the keyring still unwraps its canary; alert if not |
| `reconcileRunwayPurchases` | task-triggered (Next Steps) | match new posted purchases and deposits; send `moneyArrived` and `billPaid` pushes |
| `sendRunwayReminders` | scheduled, hourly (Next Steps) | send `billDue` and `incomeToday` pushes |
| `createRunwayLinkSession`, `attachRunwayAccount`, `unlinkRunwayAccount` | callable | link flow (Next Steps) |
| `runwayProviderWebhook` | HTTPS | provider notifications, signature-verified (Next Steps) |
| `syncRunwayAccounts` | scheduled | backstop when a webhook is missed (Next Steps) |

| Secret | Required to deploy | Used by |
|---|---|---|
| `RUNWAY_MASTER_KEYS` (JSON keyring of 32-byte hex keys) | yes, from the first issue that ships `getRunwayKey` | key wrapping, grant sealing, canaries |
| `RUNWAY_PLAID_CLIENT_ID`, `RUNWAY_PLAID_SECRET` (and the Plaid environment name as config) | yes, from the first Link issue | link functions |

CI deploys every function on merge, so a secret must exist in production before the PR that binds it merges. The Link functions therefore ship in their own PRs, after the provider is chosen and its secrets exist; the Core MVP needs only `RUNWAY_MASTER_KEYS`.

### Wiring checklist

Everything outside `src/apps/runway/` that must change, so nothing is found missing after merge:

- **Register:** `'runway'` in the `AppId` union (`src/lib/types/appCatalog.ts`), an `APP_REGISTRY` entry with `resumeParams` for its tab and the open day (`src/lib/app/app.registry.ts`), its route in `src/routes/AppRoutes.tsx` as a `ProtectedRoute appId`, logo and banner in `public/`, `cloudflare-worker.js`, and the root `README.md` "Current apps" line. No per-app manifest.
- **Usage:** `useTrackAppUsage('runway', user?.uid ?? null)` next to `useRunwaySync`; `functions/src/apps/runway/findFirstActivityAt.ts`; its entry in `FIRST_ACTIVITY_FINDERS`; its line in the `registerAppUsage` note in `functions/README.md`.
- **State:** the slice in `src/store/index.ts`, reset on `resetAllState`; listeners and `useRunwaySync`.
- **Data access:** the `firestore.rules` block; `storage.rules` for the receipts path; the two index entries.
- **Functions:** exports in `functions/src/index.ts`; rows in the `functions/README.md` Functions table; rows in "Secrets and config"; secrets in production before merge.
- **Security lib:** `encryptBytes`/`decryptBytes` in `src/lib/security`, exported from `@lib/security`.
- **Seeds:** `scripts/seeds/runway.ts` and its document count; `SeedScope`; the branch and scope checks in `scripts/seed.ts`; a `seed:runway` script; `runwayScale.ts`; `SEEDING.md`; `'runway'` in a fixture's `apps` list in `src/lib/dev/fixtureAccounts.ts`.
- **Checks:** `check:runway-engine` in `package.json`; `npm run check:apps` passes with the theme tokens.
- **Rules files and docs:** `.github/instructions/runway.instructions.md` and the identical `.claude/rules/runway.md`; `UX.md`, `TECHNICAL.md`, `ISSUES.md`, `README.md` under `src/apps/runway/`.
- **Release:** the PR carries one `patch` or `minor` label.

### Proposed changes to the repo's instructions

Per the project instruction to keep `copilot-instructions.md` current, these follow from this design and are for approval, not yet made:

1. **New-app checklist, Release line:** replace "bump `SITE_VERSION`" with the label rule it already states elsewhere.
2. **Data and app patterns:** add that a Firestore document may carry one `sealed` payload of sensitive fields beside readable ones, with the key held by a callable and never persisted; reference Runway's `security.ts`.
3. **Data and app patterns:** add the append-only collection and deterministic-id patterns (rules deny `update`/`delete`; a duplicate create fails by id).
4. **Shared security lib:** note `encryptBytes`/`decryptBytes` once they exist.
5. **`.github/instructions/runway.instructions.md`:** the restrained tone exception, the level-gating rule (hidden, not disabled), and the sealed-document rule.

---

## Open questions for the roadmap

Each becomes a spike or a decision in the Issue Roadmap rather than blocking it.

1. **Destruction delay and Google checks.** Confirm the 90-day delay. In a scratch project, settle the three deny-policy questions in Master secret management (service supported, organization present, Owner cannot remove it) and confirm the audit-alert filter and the three alert policies fire. Escrow is settled (a password manager vault and a separate secure cloud account, one holder); revisit a second holder if anyone else ever has a stake in the data.
2. **Closings (Decision 7).** Built last in the MVP, before Next Steps, and kept only if the scale seed shows cold start needs them. Measure on the scale seed; if a plan's current-month window plus incremental sums is fast enough without them, drop `dirtyFrom` and `closings` and keep the ledger.
3. **Plaid access.** Plaid is the provider. Confirm production access (it may need an application and lead time), pricing per linked account, coverage of the accounts in the UX (checking, savings, cash management such as Wealthfront) and whether its investments product covers retirement and brokerage accounts.
4. **CSV parsing.** Pick a parser already in the repo's dependencies if one exists; otherwise a small streaming one; handle the common bank layouts and a manual column map.
5. **Engine in a worker.** Only if the draft or lookahead exceeds budget on the scale seed.
6. **Version volume.** Whether a plan snapshot is needed, from the scale seed.
7. **Where reconcile runs.** Planned: the device does all matching through the Core MVP and Next Steps up to Link; a server pass and notifications follow ("Server-side Reconcile and Notifications"). Open inside that: how the engine is shared with Functions, decided in its spike.
8. **Testing home.** Confirm `scripts/checks/` plus the emulator for rules is the right place; if the repo has a unit-test runner, move the engine tests there.
9. **Gross-to-net and loans in the schema.** The fields exist in the sealed payloads now so Next Steps needs no migration; their engine code ships with those issues.
10. **Succession.** Who the second Owner and escrow holder is, and whether the optional keyring split is wanted. Decided before the "Succession" issue, which is not in the MVP.
