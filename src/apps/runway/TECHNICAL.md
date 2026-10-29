# Runway: Technical Design

Companion to `README.md` (what the app does) and `UX.md` plus the UX canvas (what it looks like). This document settles how it is stored, computed, secured and wired. Read the README's "Under the Hood" first; this expands it.

## Decisions made in this document

Items marked *Confirmed* changed something the README says or had a real alternative, and were confirmed before this revision. The rest follow from repo conventions.

1. **One private tree per person.** `apps/runway/plans/{uid}` is the plan document and everything else nests under it. No sharing, no `ownerUid` field, no `where` clause on `uid`. Rules are one line: `request.auth.uid == uid`.
2. **Sealed documents.** A document has a small set of readable fields (ids, dates, enums, flags, `createdAt`) and one `sealed` payload holding every sensitive value as a single AES-256-GCM ciphertext of a JSON object. The beta-tier rules never look at `sealed`. All validation of its shape and contents (integer cents, non-negative, enum values) is client-side, which is acceptable because a plan is private to its owner.
3. **Key custody: a server-wrapped data key. Confirmed.** Each plan has one random 256-bit data key. It is stored only wrapped (AES-256-GCM under a master key taken from a versioned keyring held in a Functions secret) in a server-only document. The client gets it from a callable `getRunwayKey`, holds it in memory only, and never persists it. Functions that import bank data unwrap the same key to seal what they write. This differs from Worth the Wait, which stores the raw key in a Firestore document readable by members. It uses the same payload format and the same `@lib/security` helpers. The README line "the approach Worth the Wait uses" should become "the same payload and helpers Worth the Wait uses, with the key held by the server". Alternatives and why not:
   - *Raw key in the plan document (Worth the Wait's way).* Simplest, and the ciphertext is then protected only by the rules. Anyone who can read the database can read the key beside the data.
   - *Key derived from a passphrase the person types.* The strongest protection and the only real end-to-end option, but bank-data functions cannot seal what they write, so Link cannot work, and a forgotten passphrase loses the plan.
   - Limits of the chosen design: a person with both database access and Secret Manager access can decrypt. Losing the keyring loses every plan, so its shape, its protection against deletion and its recovery are specified under "Master secret management".
4. **The plan is dated versions.** Each plan item (source, pay line, bill, envelope, goal, group) is a header document plus append-only version documents. "The plan on date D" and "the plan as it was known on date D" are both answered from versions (Plan versions, below).
5. **An income day is computed until touched.** A coming income day exists only as a schedule occurrence. A day document is created the first time the person overrides it, confirms it, or marks it not arrived. Confirmed content lives in append-only records beside it.
6. **The draft is a pure function on the device.** `buildDraft(plan, days, state)` returns the same lines for the same inputs, in the order of operations written under "Draft algorithm". Nothing about a draft is stored until the person confirms the day, when the draft as proposed is stored beside the confirmed split (opening a day writes nothing).
7. **Balances are derived from a ledger, with monthly closings. Confirmed.** No envelope holds a stored running balance. An envelope's figure is the sum of ledger entries since the starting point. To keep that cheap, a closing document per calendar month stores every balance at month end, and anything written into a closed month marks the closings from that month forward as stale (`dirtyFrom`). Closings are a cache and can always be rebuilt. The README's "derived values are never stored" holds for every figure except these caches. The scale seed (Issue 27) measured what they save and what a plan is wrong by without them ("Performance", below), so Issue 28 built them ("Balances and closings").
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

1. **Sensitive values are sealed.** A readable field never holds a name, an amount, a merchant or a note. The device checks its shape and contents; the rules check only who writes it.
2. **Day keys name occurrences.** A day key is `${payLineId}_${yyyymmdd}` and names one occurrence of a pay line whether or not a document exists for it. A draft line's id is `${dayKey}:${itemId}` and is stable across redraws, so ticks and overrides stay attached. *Round 7:* a schedule change moves the dates a key names, so what was keyed to an old date follows it to the new one (`engine/moved.ts` `matchMovedDates`: the nearest new date within half the gap to its neighbours (half a month each way for a one-time date), never one that is already an old date, nearest pairs first, so a date far from every new one moves nowhere). A bill's paid mark keeps its id and reads paid on the payment it moved to (`planBillPayments`). A pay line change carries each draft day's own choices to its new date after the version is saved (`carryDayOverrides`, one transaction per day that re-reads both documents and writes only into a day with no choices of its own; it runs after the change has saved without holding the sheet, tries every day (`Promise.allSettled`) and, when any day's write fails, says so in a toast that names the days: "2 income days kept their old choices"), and the change's effect preview says what moves and what has no new date near it (`previewOverrideCarry`, `MOVED_DAY_WORDS`), so a choice is never dropped without a word. Envelopes and bills that name chosen day keys, and an every-other anchor day, are not moved.
3. **Deterministic ids stop duplicates.** A day's document id is its day key. A bill-paid move is `paid_${billId}_${yyyymmdd}`, an auto-ended change is `ended_${itemId}`, a closing is `yyyy-mm`. Rules require the id to match the fields, so a second create fails instead of duplicating.
4. **A version is a whole payload, never a diff, and is create-only.** Of the versions covering a date, the one with the greatest `createdAt` wins. "Known on a date" keeps only versions with `createdAt < date + 86_400_000`.
5. **History is append-only.** Versions, day records, moves and changes allow `create` and `read` only. A mistake is superseded by a later entry. A confirmed day changes only through `correction` records; after confirmation the only writable field on the day is `doneLineIds`.
6. **A draft is a pure function.** The same plan, stance, overrides and state produce byte-identical output, in the order of operations under "Draft algorithm". A draft is stored only when the day is confirmed, as the `proposed` record beside the `confirmed` one.
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
export const CHANGE_KINDS = ['planChange', 'start', 'levelMove', 'whatIfApplied', 'ended', 'correction', 'purchaseChange'] as const;
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

Priority, schedule kind and ending are sealed (they describe a person's finances); the constants are used on the device only. *As built:* the `correction` change kind is reserved and unused: a correction is a day record (`kind: 'correction'`) and `correctDay` writes no change-log entry, so it shows on the day's record and not in the change log. `MOVE_KINDS` is `['billPaid', 'start', 'trackingChange']`; the other move kinds below are not built yet.

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
    | { kind: 'chosen'; dayKeys: string[] }
    | { kind: 'calendar'; period: 'weekly' | 'every2Weeks' | 'twiceMonthly' | 'monthly' | 'yearly'; startsOn: DateOnly | null }
    | { kind: 'none' };           // a goal that is not being added to
  sourceId?: string | null;      // a paycheck rule counts only this source's pays; missing counts all
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

`GoalSealed` as built carries `name`, `emoji`, `priority`, `orderIndex`, `targetCents`, `targetDate`, `funding`, `startingCents` (round 4: what the goal held when it was added, kept only while the plan has no starting day; a version written before it existed has none) and `state` (Issue 19: `paused` stops new money, a version written before it existed has none and reads as `active`); `rateBps` and `accountId` arrive with the issues that read them.

`EnvelopeSealed` as built carries `name`, `emoji`, `priority`, `orderIndex` and `funding`; `spillTo` and `accountId` arrive with the issues that read them. `FundingAmount` is `exact`, `percent` (whole or half percents as `bps`, `of: 'dayMoney'`) or `rest`; a document whose `amount` has no `kind` reads as exact (`normalizeFunding`, applied when the listener opens a version). `FundingRule.cadence` offers `calendar` (round 4: an amount per weekly, every-2-weeks, twice-a-month, monthly or yearly period, spread over the income days that fall in it, below), the per-income-day ways `everyIncomeDay`, `everyNth` and `chosen`, and `none` (a goal with only a target; its amount is `exact` 0, the draft asks nothing and `getPace` has no state). The forms ask "How often?" first (Weekly, Every 2 weeks, Twice a month, Monthly, Yearly, From a paycheck, and for a goal Not adding to it); "From a paycheck" offers which pay (`sourceId`: "Each Northwind Studio pay" or "Each pay, all sources"), which pays (every, every other, every third, chosen) and the amount modes "Exact amount", "% of each pay" and "Whatever is left of each pay" (with a HelpTip saying what is left: after the bills and the envelopes above it in priority). A calendar rule is an exact amount only. The new fields live in the sealed version (a rule that says what it asks is as sensitive as the amount); no readable field, collection, index or rule changed, and a version without them reads as before (`everyIncomeDay`, every source). The goal form also asks "How much is in it now?" (new goals only): with a starting day it writes a `start` move for the goal on that day through `recordHolding` (the starting day and every other holding stay as they are), without one it keeps the figure as `startingCents` for the Where things stand step to prefill. A new envelope's `orderIndex` is the tier's highest plus one. The Plan tab's pill is the `section` URL param (`income`, `envelopes`).

### PlanDoc

```ts
interface PlanDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: (typeof STANCES)[number];         // readable: three values, no amounts
  startDate: DateOnly | null;               // the starting point; null until set up
  trackingPeriods: { from: DateOnly; to: DateOnly | null }[];   // Track is on while the last period has to = null
  dirtyFrom: string | null;                 // 'yyyy-mm': first closing that is stale; absent on a plan written before closings
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
  sealed: Sealed | null;                    // while draft: the override { amountOrHours, pairings, lineOverrides, holdResolutions }; as built { pairings, holdResolutions, payloads }
}

interface DayRecordDoc {
  id: string;                               // `${dayId}_proposed`, `${dayId}_confirmed` or `${supersedesId}_corrected`
  dayId: string;
  kind: (typeof DAY_RECORD_KINDS)[number];  // 'proposed' | 'confirmed' | 'correction'
  createdAt: number;
  sealed: Sealed;
  supersedesId: string | null;              // a correction names the record it replaces; null on the other two (records written before it existed lack the key)
}
```

Sealed record contents as shipped:

- `proposed`: `{ fingerprint, stance, expectedCents, freeToSpendCents, lines }`, the draft as it stood when the day was confirmed.
- `confirmed`: `{ fingerprint, stance, arrivedCents, expectedCents, freeToSpendCents, lines, differences }`. Each line is `{ lineId, itemId, name, emoji, tier, demandCents, cents, shortBy, paidBy: [{ dayId, cents }] }`, with the name it had that day so history never needs the plan to read it. `differences` holds one `{ kind: 'amount', plannedCents, actualCents, note }` when the amount that arrived is not the amount expected, and one `{ kind: 'line', lineId, itemId, name, plannedCents, actualCents, note }` for each line whose confirmed amount is not the proposed one (Issue 14). Where extra money went or a shortfall came from is those line differences (a line up is where it went, a line down is where it came from); Free to spend is never stored as a difference.
- `correction` (Issue 16): `{ stance, arrivedCents, freeToSpendCents, lines, before: { arrivedCents, freeToSpendCents }, changes: [{ lineId, itemId, name, emoji, beforeCents, afterCents }], note }`. It carries the whole replacement split, not a diff, so balances never need the records before it; `changes` and `before` are what the history shows. A correction can change the amount that arrived and any line's amount (a line can go to nothing); it cannot add a line, move the arrival date or change the stance.

The day's effective split is the latest `correction` that no later correction supersedes, else `confirmed` (`engine/correct.ts`: `getRecordChain` walks from the confirmed record through the correction that names it, and so on; a correction no chain reaches is ignored, and if two name one record the earlier wins, so every device reads the same chain). A correction's id is `<supersedesId>_corrected`, so a record can be corrected once: a device holding an older split gets a create on an existing id, which the rules refuse, and `correctDay` reports it before that. `sumConfirmedByItem` (a goal's held money), `collectFunded` (bill progress), the checklist's lines and the day's Free to spend all read the effective split. A correction unticks the checklist lines whose amount it changed, in the same transaction, so a ticked line never claims money that moved; ticks of lines it leaves alone stay. A day document can be updated while `status == 'draft'`; once confirmed, only `doneLineIds` can change (see rules).

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

`start` holds the starting point: money on hand, each envelope, goal, bill progress and account balance on the start date. It is the base of every balance. `billPaid` records the amount and day (a bill marked paid, including ahead of time; matching from a purchase is not built yet). *As built:* the amount is the payment's planned total (`useBillPaid` `markPaymentPaid`), `paidOn` is today, and no actual amount is asked. `cardPayment` settles the card reserve against checking. `transfer` is "move leftover money" between envelopes, goals and Free to spend. `withdrawal` lowers a goal. `balanceCorrection` is a statement balance for a loan or an interest correction. `trackingChange` records Track moves.

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
  sealed: Sealed;                           // { summary, before, after, affectedDays, note }; as first shipped (Issue 18) { summary, note }, the from and to words living in the summary and the affected days worked out when read
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
  sealed: Sealed;                           // as built (Issue 28): ClosingSealed, below
}

/** ClosingSealed as built: what the ledger summed to at the end of `month`, counted from `startDay` (the plan's starting day). */
interface ClosingSealed {
  version: number;                          // 1; a closing of another version is rebuilt
  startDay: number;                         // days since 1970; a closing counted from another starting day is not used
  arrivedCents: Cents;                      // what the confirmed days that arrived since the start brought in
  given: Record<string, Cents>;             // what those days gave each item (envelopes, goals, bills)
  spentCents: Cents;                        // purchases since the start, refunds taken off; applied only while tracking is on
  spentByItem: Record<string, Cents>;
  funded: Record<string, [number, Cents][]>;                       // each bill: [day, cents] for every confirmed day that set money aside
  paid: Record<string, [number, Cents, number, Cents, number | string][]>;   // each bill: [dueDay, cents, paidDay, fromFreeCents, mark] for every payment not undone
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

**As first shipped (Issue 5).** `SourceSealed` carries `name` and `PayLineSealed` carries `name`, `schedule` (`kind`, `anchor`, `monthDays`), `amount` (a `MoneyRange`, equal ends for an exact amount) and `ending` (`onDate`, `afterCount`); the other fields above arrive with the issues that read them, and readers default a missing one. `resolve(items, versions, on, knownAt?)` also drops an item that is archived or ended before `on`. `resolveCurrentOrNext` returns the version in force or, for an income that has not begun, the earliest later one, so the Income list shows a pay line whose first payday is ahead. `selectResolvedPlan(state, on)` is that list (each source with its pay lines) and `selectComingDays(state, today)` is `buildComingDays`: each pay line's schedule from its version in force, `LOOKAHEAD_MONTHS` ahead, each day taking its amount from the version in force on it. `createIncome` writes the headers, first versions and one change in a single `writeBatch`; the rules create an item only with `endedAt` and `archivedAt` null and require a version's item and change to exist in the same batch (`existsAfter`). *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape.

**Change an item from a date (Issue 18).** Every kind of item (source, pay line, bill, envelope, goal) is edited by `changeItem`: one `writeBatch` that creates a version holding the item's whole new payload with `effectiveFrom` (today, or a day after today) and one `planChange` change whose sealed payload is `{ summary, note }` (`summary` is "Rent: Amount $1,250.00 to $1,300.00, from December 1."; `note` is the person's optional reason, absent on changes written before it existed). Nothing already written is updated, so an earlier day keeps what it had and a confirmed day never moves; two devices editing one item each add a version and the later `createdAt` wins where both cover a date (a version made later replaces an earlier-scheduled one for the dates it covers, which the effect list shows before saving). The edit forms (`IncomeForm` for a pay line or a source's name, `BillForm`, `EnvelopeForm`, `GoalForm`, `PairingsEditor` for what a source or pay line funds) take `editing`, start from the version in force today, and append `changeField` (`FromWhenPicker` plus `EffectPreview`, reached through `ChangeFlowContext`) under their fields; their primary becomes "Next", which swaps in `ChangeReason` (starter chips, one note box, "Save without a reason"). `useChangeFlow` holds the shared state and a ref-guarded save. `FromWhenPicker` offers "From now on" and "From a date ahead"; Issue 19 adds the rest, below.

**Stretch, one income day, end, pause and archive (Issue 19).** `FromWhenPicker` draws only the answers that mean something for the item and the screen: "From now on" and "From a date ahead" always; "From this income day on" only when an income day's screen opened the form and that day is after today; "This income day only" for envelopes and goals (an income day's own payload; names and targets cannot change for one day, the footer says so); "For a stretch" for everything but a source, either the next N income days or until a last day, from today. `utils/fromWhen.ts` `getChangeSpan` turns the answer into `{ kind: 'version', effectiveFrom, effectiveUntil }` or `{ kind: 'day', day }`, or the footer sentence that says what is missing. A stretch is an ordinary whole-payload version with `effectiveUntil` (the day after the last day it covers; N income days is the Nth plan-wide coming day from today, `engine/stretch.ts` `getStretchEnd`, and the change entry says "from Oct 23 through Nov 6, then it goes back"). Nothing is written when it runs out: resolution stops covering the date and the earlier version is back. The rules require an `effectiveUntil` that is a whole day after `effectiveFrom` and at most ten years out. **A return is visible:** `findReturning` names the envelopes and goals whose stretch ended between the previous income day (else 14 days back) and the day being drafted; `buildDraft` turns the funded line of each into reason code `returns` and the line reads "Vacation fund returns to $300.00 this time" on that one day only. Bills and pay lines go back silently (a bill's line is a payment share, a pay line has no line).

"This income day only" writes no version: `saveDayOverride` merges the whole payload into the day override's `payloads[itemId]` and, in the same transaction, a `planChange` entry ("Eating out: Funding $80.00 every income day to $5.00 every income day, for October 26 only.", with the note) whose `effectiveFrom` is that day. `computeDraftView` reads `payloads[itemId]` in place of the version's for funding, priority and order on that day, so the draft for any other day is untouched and the day's fingerprint (`hashOverride`) includes the payloads; a day written before `payloads` existed has none (the listener and `saveDayOverride` default `{}`). A settled day refuses the write as before, and the previews leave settled days out, so a confirmed day never moves. "Use the plan again" clears payloads with the rest of the override. A draft line opens the item's form through its "Change" chip (`DraftLine` `onChange`, only for an envelope, goal or bill on a day that is not past), with `presetDayKey` set so "from this income day on" and "this income day only" mean that day.

`previewChange(inputs, change)` takes a `PreviewChange`: a layered `version` (as before), an `end` (the header with `endedAt`), an `archive` (the header with `archivedAt`) or a `day` (the day's override with the payload). Both runs use the same `computeDraftView`, so each preview is the saved result for the same inputs (`scripts/checks/runwayEngine.ts` compares them for a stretch, a day, an end, an archive and a pause).

**End, pause, archive.** A row opens the item's `ItemSheet` (a `FormSheet` whose rows are `ActionRow`s; each Stop or pause action, never offered for a source, swaps in its own view behind `BackLink` with the effect preview, "Why?" chips and one primary). A goal offers "Pause saving" or "Start saving again" (`setGoalState`: a whole-payload version with `state`, from today; a paused goal is dropped from the draft's demands, its pace line says "Paused", and its balance, history and confirmed days are untouched); every item offers "End it" and "Archive". `endItem` is one transaction: it reads the header, does nothing when `endedAt` is already set (the sheet says so), and otherwise sets `endedAt` (the item's last day, inclusive: `resolve` drops it from the next day on) and creates the `ended` entry `ended_${itemId}` whose sealed `{ summary, note }` is why it ended. Lists (`isListed`), the coming days and `resolve` drop an ended item the day after `endedAt` and an archived one from the day `archivedAt` names (today when archived); every older version, record and confirmed day still resolves, so ending and archiving never erase. `archiveItem` is the same shape with `archivedAt` and a generated `planChange` entry; there is no un-archive. The rules add one `update` clause on `items`: only `endedAt` (null to a whole day, only in a write that creates `changes/ended_${itemId}` of kind `ended`) and `archivedAt` (null to a time, once) may change, every other field and every second write is refused, and a document written before those keys existed passes. *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape.

**When an ending is reached by itself (Issue 19, Invariant 3).** A pay line whose own ending (`afterCount` or `onDate`, or a one-time schedule) has been reached is marked ended by the device: `useRunwaySync` watches `selectReachedEndingsKey` and, once the plan, versions and days are read, calls `endItem` for each (the same transaction, the entry `ended_${itemId}`, `endedAt` the last income day), so a second device or a second load finds it ended and writes nothing. It runs on the first load after the last income day (`last < today`), and on the load after the last income day is confirmed when that day is today (`engine/endings.ts` `findReachedEnding`). Bills are not swept: a bill ends when the person ends it (a paid-off bill's own ending arrives with the payoff issue). The marker changes no figure, since the schedule already stopped, and it is what lets the Income list and Home drop the pay line. A pay line with a version scheduled to start later is left alone, since that version may continue it and `endedAt` is written once. An ended bill's `ending` is cut at `endedAt` (`capEnding`), so no payment past its last day is planned or funded. A stretch's last day and an ending's date stop at `MAX_CHANGE_DAYS_AHEAD`, inside the rules' ten years.

`EffectPreview` runs the engine twice per upcoming income day, walking them in chunks until `MAX_PREVIEW_DAYS` (26) moved days are found or the days run out: over the real versions and over the real versions with one virtual version layered on (`engine/whatIf.ts` `layerVersion`: a synthetic id and the largest `createdAt`, so it wins wherever it covers). `previewChange` (`store/selectors/previewSelectors.ts`) calls `computeDraftView`, the function `selectDraft` memoizes, on both, so the preview is the saved result for the same inputs; a day is listed when its lines, its Free to spend or its day money differ, or when the change adds or removes the day. The list leads each row with the lines that change and shows "Left from this day" only when it moves; days that move alike (removed, added, or nothing else changing) fold into one row, and `PREVIEW_SHOWN` (3) rows show before "Show N more". Coming days follow a pay line's version in force on each date: `buildComingDays` splits the window where an item's versions start or stop and takes each stretch's schedule from the version in force at its start, so a schedule that changes from a date ahead applies from that date and the old one stops the day before. `resolveNextChange` finds the change made but not yet started, which a row shows as "From December 1: Amount $1,250.00 to $1,300.00". The rules check only the dates a change adds: a version's or change's `effectiveFrom` is a whole UTC day and at most ten years ahead (`isDateAhead`; the picker stops at `MAX_CHANGE_DAYS_AHEAD`, 3,600 days); versions and changes stay create-only and no item field is written. *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape. `scripts/checks/runwayEngine.ts` covers a change from a date ahead leaving earlier days alone, the preview equal to the saved result, two devices' versions in either order, a schedule change from a date, a legacy pay line (no pairings or stance), and a 50-envelope preview (about 40 ms).

### Draft algorithm

`buildDraft(input) → Draft`, with `input = { days, plan, stance, state, overrides }`. `days` are one to many income days planned together, sorted by `expectedOn` then `payLineId`. `state` carries bill progress, loan balances and envelope balances. A draft allocates only the money of the days it plans; it never draws on existing Free to spend.

**Order of operations.** This is the contract the README points to.

0. **Day money.** For each day, `money = override ?? pick(stance, amount)`. `pick` takes `lowCents` for income under Conservative, `highCents` under Optimistic, and the midpoint (rounded down) under Middle; expenses use the opposite ends. A per-item `stanceOverride` replaces the plan's stance for that item. Hourly: `pick` over `minutesLow..minutesHigh`, then gross from hourly. In the MVP the entered amount is take-home. With gross (Next Steps), deductions are subtracted here in their listed order, each exact or a percent of gross.
1. **Demands.** For each day, collect what is due a line on it:
   - bills: the funding for that day (below);
   - envelopes and goals whose `FundingRule.cadence` selects the day (below);
   - the overspend annotation for any envelope below zero (*not built yet*: no demand or annotation reads an envelope's overspend).

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
- *Envelope or goal (cadence selection is `selectFundedDays` in `engine/schedule.ts`; an anchor that has left the coming-day list counts from the first day listed, so an `everyNth` envelope never silently funds nothing):* `everyIncomeDay` is every day; `everyNth` selects days whose index since `anchorDayKey` in the plan-wide chronological income-day list is a multiple of n; `chosen` selects named day keys; `calendar` selects every income day and sizes each one as below; `none` selects nothing. A rule with a `sourceId` first keeps only that source's income days (`selectRuleDays`).
- *Calendar rules (round 4, `engine/calendar.ts` `spreadCalendarAmount`):* the amount is for one period. An income day belongs to the period its date-only UTC date falls in: weekly is Monday to Sunday, every 2 weeks is the 14-day block counting from Monday Jan 5 1970 (a biweekly pay is always one per block, whatever its phase), twice a month is the 1st to the 15th and the 16th to the end, monthly is the calendar month, yearly the calendar year. The period's amount is shared over its income days by `allocate` with equal weights, so the remainder cents go to the lowest day keys, whatever order the days arrive in ($600 over two paydays is $300 each, over three $200 each). A period with no income day passes its amount to the next period that has one (a weekly amount over a biweekly pay asks two weeks of it each time). Days before the rule's `startsOn` (the day the period or amount was last set) are not counted and the period it starts in is not prorated: the whole amount goes over the days that are left. `priorIncomeDays` are the earlier income days of the first period (settled or past, found by `getPriorDays` from the first listed day's period start): they take their share first and are not drafted, so a month's second payday asks only for what the first did not. Periods before the first income day given are not walked, and periods past the lookahead horizon are cut at it. A goal takes the same shares, each cut to what is left of its target. All of it is whole UTC days, so a first of the month west of UTC stays in its own month (`check:runway-engine`: 1, 2, 3 and 0 paydays in a month, odd cents, weekly over biweekly, yearly, twice a month, a mid-period start, an earlier payday, the Los Angeles zone, a source filter, legacy rules, and a goal with `none`). A day the rule's map has no entry for (before `startsOn`) asks 0, never the full amount; the walk covers up to `MAX_PERIODS` (20,000) periods; `getCalendarCents` remembers a rule's spread for the same days, so one lookahead works each rule out once (25 monthly and 25 weekly envelopes over 53 weekly days: 284 ms before, about 65 ms after; the same walk with every-income-day rules about 40 ms).
- *Envelope or goal, percent and rest (Issue 10):* `percent of dayMoney` asks `percentOf(day money, bps)` on each day its cadence selects, where day money is the day's override or its plan figure. The percentage lines of one day are shared out together: their total is `percentOf(money, sum of bps)`, split by `allocate` weighted by bps with ties on ascending item id, so the lines add to that one rounded figure and never to more than the money (over 100% in all, each rounds alone and the walk cuts the later lines short). A goal cut short by its target keeps the cut. A `rest` demand has no size when demands are built: it sorts last inside its tier (before the next tier, after every other demand of its own tier, then by the normal keys when a tier holds two), and when the pool is walked it takes everything the pool then holds from its own day's money, capped by a goal's target left. A second `rest` in the tier therefore finds nothing, shows $0 funded and the reason "nothing was left of this day's money for the rest" (`nothingLeft`). A `rest` goal has no pace to measure. A pairing's `rest` (above) is unchanged.
- *Goals:* a paused goal or one at its target demands nothing. A goal's demand on a funded day is `min(amount, target − held − what earlier funded days already put in)`, worked out over the whole plan-wide income-day list (`planGoalContributions` in `engine/pace.ts`), so the last contribution is cut to what is left and nothing is asked after the target. `held` is zero until a confirmed day or a starting point exists (the starting amount counts once the person has entered it); the draft and the pace line therefore read from the plan alone, and they assume each earlier funded day is fully funded.
- *Loan payment:* a bill with `LoanTerms`; the demand is `paymentCents`, capped at the balance plus estimated interest, and the loan ends when the balance reaches zero.
- *Overspend (not built yet):* the engine never changes a demand's size for an overspent envelope. It marks the first `min(line, −balance)` cents of that envelope's line as repaying the overspend. As built, nothing marks it: the overspend has already lowered Free to spend (an envelope sum counts an over envelope as 0), and the next refill is the envelope's usual amount.

**Properties the check script asserts.** Shuffling the input arrays changes nothing. The sum of line cents plus Free to spend equals the sum of day money. No line is negative. A planned-together draft's `paidBy` cents sum to each line. Dropping a lower-priority demand never reduces a higher-priority line. No line of a lower tier is funded from money a hold has reserved, and a Must demand is never starved by a hold on a Should. Re-running with the same inputs yields identical JSON.
**As first shipped (Issue 7).** `engine/demands.ts` (`buildDemands`, `compareDemands`) and `engine/draft.ts` (`buildDraft`) cover steps 0, 1 and 3 to 7 for envelopes. The input is `{ days, plan: { envelopes, incomeDays }, stance, overrides: { dayCents } }`: `plan.incomeDays` is the plan-wide list cadences count over, and `state` is left out until bills and balances exist. The stance is read as of Issue 12 (see below). A line is `{ lineId, dayKey, itemId, tier, demandCents, cents, shortBy, paidBy: [{ dayKey, sourceId, cents }], reason: { code: 'funded' | 'poolExhausted', tier, cadence }, tieBrokenBy }`; wording for a reason lives in `constants.ts` and `utils/draftText.ts`. `tieBrokenBy` is `'createdAt'` or `'itemId'`, the key that put a funded line ahead of an envelope with the same tier, urgency and order that then got less (the first four keys in step 5 are tier, urgency, order and date added; an equal date added falls through to the id). Sorting uses code-unit string order, never the viewer's locale. `selectDraft(state, dayKey, today)` resolves the envelopes in force on the day, hashes the resolved version ids with the stance and income days (`engine/fingerprint.ts`) and keeps the `DraftView` in a `WeakMap` held by the versions array, so an unrelated store change returns the same object and a sign-out frees it. The open day is the `day` URL param (`?tab=days&day=<dayKey>`, in the registry's `resumeParams`; a day that is no longer coming is ignored); opening or leaving a day replaces history, and the subview's own entry makes Back close it. Opening a day reads the store and writes nothing. In the dev build a 50-envelope draft over 26 income days takes about 0.3 ms.

**Bills as first shipped (Issue 8).** `BillSealed` is `{ name, emoji, priority, orderIndex, amount, timing: { kind: 'date', schedule }, ending, fundedBy }`; windows, groups, a stance override, loans and steps arrive with their issues. `planBillPayments(bill, incomeDays, horizon)` lists every payment up to `horizon` (the lookahead's end) with what each income day sets aside: a payment is funded by the income days after the previous payment through its due date (the first payment by every coming day through its due date). Suggested shares are `ceil(left / days left)`, so the last day takes what remains; chosen days split the amount with `allocate`, ignore a picked day that has left the coming list, and apply to a one-time bill only (the form offers them only then). A day with no income before the due date sets nothing aside, and the bill row says no income day comes before it is due. What a bill has already been given by confirmed days, and whether a payment was marked paid, is read from the records and moves (Issue 15, below). A demand is `dueBeforeNext` when its due date falls before the next income day after that day, so the last day of a window sorts ahead of equals; `DraftLine.bill` carries `{ dueOn, totalCents }` so the day screen reads "Due Dec 1 · $500.00 of $1,200.00". Bills are resolved on the day like envelopes, and `selectDraft` hashes their version ids and the horizon into its cache key. `firestore.rules` already allowed `bill` items and versions, so nothing changed there.

**Ranges and the stance as first shipped (Issue 12).** `engine/stance.ts` holds `pick(stance, range, side)` (income: low under Conservative, high under Optimistic; expenses the opposite ends; the midpoint rounded down under Middle), `effectiveStance(planStance, override)` and `readStance`, which reads a missing or unknown `stance` as conservative (the plan listener and `selectStance` both go through it). `buildDraft` picks each day's money and each income day's figure (`plan.incomeDays[].amount`) and `buildDemands`/`planBillPayments` pick each bill's total, so no screen picks an end itself except for a single row's figure, which uses the same `pick`. `stanceOverride` is sealed on pay lines and bills only (a source has no amount, so it has none); a version written before it existed reads as null. A bill's draft line carries `bill.ranged` (the range, the stance that picked it, whether it is the bill's own) so `RangeNote` can say it; an exact bill carries null, which is why a draft with no range is identical under every stance. `RangeNote` words every ranged figure (income cards and rows, the day's money, bill rows and bill lines, the form hint); `RangeBasisNote` says the same once over a goal's pace, which is built from many days. `setStance` is a field-scoped `updateDoc` of `stance` and `updatedAt`; the rules already allowed it and were not changed (indexes unchanged). Plan > More lists Settings (`?section=more&more=settings`, in `resumeParams`), whose planning stance row saves as soon as a pill is tapped. Forms offer Exact or A range, and for a range "Plan it at" (follow the plan, or one of the three).

**Pairings as first shipped (Issue 11).** `buildDraft` takes each day's pairing sets (`DraftDayInput.pairings`: day, pay line, source) and applies step 2 as written: the narrowest non-empty set (`pickPairings`; a day's own set wins even when empty), targets ordered by the step 4 key with `rest` last, each funded only from its own day's money, and the target's own rule dropped for that day. A pairing line is `DraftLine.pairing = { state, heldCents }` with `state` one of `funded`, `autoTopUp`, `held`, `offered` (a short Want), `leftShort` or `toppedUp`; the person's choice arrives as `overrides.holdResolutions` keyed by line id and is stored in the day's sealed override keyed by item id. A top-up or a hold is a walk item at the target's own tier; a top-up merges into the pairing's line (one line per day and item), and a hold takes pool money exactly as a funded line would and shows in `Draft.heldCents`, so lines plus held plus Free to spend equal the day money. A day draft plans one day, so its pool is that day's leftover, which a short pairing has already used: a hold reserves $0 there and the screen says the line stays short until chosen; the amounts in the TDD example appear once several days are planned together. `PairingsEditor` sets pairings on a source or pay line (the whole set, so a pairing can be changed or removed, saved as a change through `changeItem`, Issue 18) and on a day (the whole set, stored in the day override). `days/{payLineId_yyyymmdd}` is created by `saveDayOverride` (a transaction that reads the override, merges and re-seals it) the first time a day is changed; the rules allow create with the id matching the pay line and date, and while the day is a draft update of `sealed` (Issue 13 widened them to the confirm and not-arrived moves, below). "Use the plan again" writes an empty override and keeps the document. `startDaysListener` listens to days from a window back (`expectedOn >=`, no index; 180 days since Issue 13). Pairing amounts offered: exact, percent of the day's money, percent of what is left, the rest. *Round 7:* a pairing never sends a target more than it still needs: a goal's target less what it holds, a bill's next payment less what is set aside (nothing once it is paid or when no payment is left), shared across the days drafted together per payment, so two days that fall before two payments of one bill each fill their own; the rest stays with the day. A pairing to an item that is archived, ended or paused still pays nothing, but the pay's "Pay these first" list says so on the row (`PAIRING_STOP_WORDS`), and pausing, ending or archiving an item that a pay pays first says in its effect preview that the pairing stops.

**Confirming a day as first shipped (Issue 13).** `confirmDay`, `markNotArrived` and `undoNotArrived` (`store/actions/dayActions.ts`) are `runTransaction`s on the day document. `confirmDay` refuses, with a readable sentence, a day that is already confirmed (another device got there first), one marked not arrived, one whose override no longer matches the `overrideFingerprint` the person's draft was built from (`hashOverride`, so a draft computed from a stale override is never recorded), a draft with an unresolved hold (`countUnresolvedHolds`, also stated on the screen and the button is off), and lines that take more than arrived (a negative remainder; *round 7:* beyond what the person chose to cover from Free to spend, see Issue 14 below). It then writes the day (`status`, `arrivedOn`, `confirmedAt`; created confirmed when the day had no document) and the two records `<dayId>_proposed` and `<dayId>_confirmed`, whose ids are fixed so a second device cannot add a second pair and whose `create` rule needs the day to be a draft before and confirmed after. *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape. The amount that differs from the expected one is recorded as one `amount` difference with its optional note.

**Adjusting lines at confirmation (Issue 14).** `engine/differences.ts` is pure: `applyLineEdits` gives a line the person's amount (`shortBy` recomputed from its demand, `paidBy` shared out again by `allocate` in the same proportions, empty at zero), `getRemainder(arrived, lines)` is Free to spend, always the remainder, so lines plus Free to spend equal the amount that arrived to the cent, `suggestShortfall(lines, need, protectedIds)` takes a shortfall out of the lines Wants, then Shoulds, then Musts, and a protected line (a bill due before the next income day, `getProtectedLineIds` in `engine/confirm.ts`) only once nothing else is left (later line first within a tier, never below zero, the cuts adding up to the need to the cent), and `getLineDifferences` returns only the differing lines with their optional notes. `buildRecords` takes `edits` and `lineNotes` (by line id); the `proposed` record keeps the draft untouched. By default extra money goes to Free to spend; "Choose where the $100 goes" swaps the sheet's content in place (`BackLink`) to the lines. *Round 7:* a shortfall is never covered or cut on its own. `getCoverable(gap, freeToSpend)` is how much of the gap the plan's Free to spend (`selectBalances`) can take; the person taps "Cover it from Free to spend" and the day confirms with its lines kept and its confirmed `freeToSpendCents` ("Left from this day") below zero by exactly that much. No new document kind or field: balances never read a record's `freeToSpendCents` (money on hand gains what arrived, assigned gains the lines), so Free to spend drops by exactly the cover, and a closing rebuilt over such a day equals the replay (checked in `check:runway-engine`). `confirmDay` takes `coverCents` and refuses a record below `-coverCents` (`isWithinCover`); `correctDay` takes `addedCoverCents` and allows a correction to leave no less than the day's cover (`getDayCover`, what it already left below nothing) plus that (`getCorrectionCover`). Correct a day runs the same journey (`components/ShortfallJourney`: `CoverCard`, `CutsSection`, `BlockerDoor`, shared with Confirm): `getCorrectionGap` is how far the correction goes beyond the day's cover, and the cover it may add is `getCoverable(gap, getFreeForCorrection(freeToSpend, base))`, Free to spend less what the day left, since a correction gives that back first; the sheet re-reads Free to spend before writing and asks again when it fell. Bills are protected from the cuts on a correction, since a past day has no next income day to compare with. What Free to spend does not cover is proposed by `suggestShortfall` and applied only on "Use these" (with an Undo) or changed item by item; Confirm stays off, with a warning icon and a door to the fix in its footer, until the rest adds up. Notes never block. A line raised for a goal or envelope counts once toward it through `sumConfirmedByItem`. No rule changed: the payload is sealed and the rules only check its envelope. A day with an unconfirmed date in the last `OVERDUE_DAYS` (14) is still listed and drafted ("Waiting to be confirmed", `buildComingDays(..., from)`), so money that lands late can be confirmed; older unconfirmed days are not offered. **A transaction cannot be queued offline.** Unlike the Pinch writes that close a sheet once their pure checks pass, these need the server: offline they fail after about 8 seconds, `ConfirmSheet` stays open with "Confirming needs a connection. Nothing was saved." in its footer (a failure after the sheet closed, such as losing a race, is a toast), and nothing is written. The statuses on the Days list are `coming` (no document), `draft` (an override exists), `confirmed` and `notArrived`, plus a derived "overdue"; a card is tagged only when it is confirmed, not arrived or overdue, and a confirmed or not-arrived day leaves `selectComingDays` (so forms and goal pace stop counting it). Confirmed days are listed under their own divider, three shown and the rest behind "Show more".

**Bill progress, paid ahead and the checklist as first shipped (Issue 15).** `DraftBillInput.progress` (`engine/progress.ts`) carries `funded` (the `cents` of the bill's lines in every confirmed record, each with its day's scheduled date) and `paid` (the payments marked paid and not undone). `planBillPayments` reads it: a payment's funded-so-far is the confirmed funding dated after the previous payment through its due date (a chosen-days bill counts every confirmed day), the coming days share only `total - funded` (`ceil` of what is left over the days left, as before), and a payment with a `paid` mark has no parts, so no day asks for it and the money it would have asked for stays in the pool of the later days. A `BillPayment` also reports `fundedCents`, `fundedDays` and `paid`; "1 of 3 days" is `fundedDays + parts.length`. A bill set aside in full asks nothing more; one with money still to come and no income day left is listed as waiting. `selectBillProgress` joins the records, the days' scheduled dates and the moves; `selectDraft` hashes it into its cache key and `selectBillPayments` is the one plan the Bills screen and the checklist read. This replaces the earlier "funded so far is zero" caveat: nothing spreads a part-funded bill in full any more. A draft day and the "Mark paid" chip wait for the moves and the confirmed records to be read (`isMovesLoaded`, `selectIsRecordsReady`), so a paid bill is never asked for again and a mark never records the whole amount as coming from Free to spend; undoing a mark from the checklist unticks its line. Money a bill held before Runway is its starting amount (Issue 17, below), counted as a funded entry dated the start day that is never a funded day; money from before the recent window comes from the closing (`base.billFunded`, Issue 28). A correction's effect on a bill's lines now flows through the effective split (Issue 16).

A move is `billPaid` with `date` the payment's **due date** (not the day it was marked, which is `paidOn` in the sealed payload, with `amountCents` and `fromFreeCents`, the part of the amount not yet set aside, which came out of Free to spend). The id is `paid_<billId>_<yyyymmdd of dueOn>`, plus `_<n>` for the nth mark after an undo, so a second tap of the same mark writes nothing and marking again after an undo is a new move. The undo is a `billPaid` move with `reversesMoveId` set and the id `unpaid_<id of the mark>`, with the same `date` and `refId`; a mark that a later move reverses is not paid. *Round 7:* the stored `fromFreeCents` is a floor, not the last word: `settlePaid` (`engine/progress.ts`) walks a bill's counted payments by due date and lets each use at most what the bill held by the later of its due date and the day it was paid (its starting amount and the confirmed days dated on or before then, less what earlier payments used), so a correction that lowers a day a paid payment used moves the cut to Free to spend and the bill never holds less than nothing. `deriveBalances` and `deriveBillProgress` both settle, so the paid mark's "came from Free to spend" and the figures agree, and a closing gives the same answer because it keeps each bill's dated funded days. A payment paid late uses what was set aside after its due date and up to the day it was paid (a start after the due date, a chosen day after it), so that money is counted once; paid ahead, a day dated after the payday stays held. The mark itself reads the same way: a payment's `heldNowCents` (`getHeldForPayment`) is what it would use if marked today, and the mark stores the rest as `fromFreeCents`. A mark stored before this kept the smaller set-aside of its window, which stays the floor. Both are created in a transaction that finds an existing id and stops. `firestore.rules` gains one `moves` clause: create only (no update or delete), keys exactly `id, kind, date, refId, reversesMoveId, createdAt, sealed`, `kind == 'billPaid'`, a date-only `date`, a `refId` that is an existing bill item, a sealed payload, and the id rule above; an undo must name an existing mark of the same bill and date that is not itself an undo. *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape. `dayStamp` and `isDateOnly` moved up to the plan level so days and moves share them. The checklist writes `doneLineIds` with `arrayUnion`/`arrayRemove` through the existing confirmed-day clause (at most 200), so no `doneLineIds` clause was added. `firestore.indexes.json` is unchanged (the moves listener is one range filter on `date`).

The checklist (`ChecklistScreen`, in a confirmed day) lists the day's bill lines: those whose bill is not waiting are "Bills to pay" with a box each and one box for the whole list (partly ticked, "N of M"); those still waiting for more money are listed apart with their progress and no box. "Move to accounts" does not exist until accounts do (Issue 53). Marking a bill paid is its own chip ("Mark paid", then "Undo") on the row and on the Bills screen, and also ticks the line; "Mark everything done" only ticks. Marking a bill that is not set aside in full asks first and says how much comes out of Free to spend. Nothing computes a Free to spend balance yet, so `fromFreeCents` is recorded and shown, and balances arrive with Track.

**Starting out and Home as first shipped (Issue 17).** `PlanDoc.startDate` is the starting point (a readable date-only field; a plan written before it existed reads as `null`, and a new plan writes an explicit `null`). `recordStart` writes, in one batch, `startDate`, one `start` change (`ChangeDoc` kind `start`, append-only like every change) and one `start` move per holding: `SealedStart { amountCents, holding: 'money' | 'goal' | 'bill' }`, `refId` null for the money on hand, else the goal or bill. A move's id is `start_<refId | money>_<createdAt>`, its `date` must equal the plan's `startDate` in the same batch (`getAfter`), and the rules refuse a `start` that reverses anything. *Beta tier:* this rule check is no longer in `firestore.rules` (Security Rules Design Criteria 5); the action keeps the shape. Rerunning the setup appends newer moves and the latest per holding on the start day wins (`collectStarted`), so the ledger stays append-only; an entry left blank that was set before is written as 0. The moves listener adds a second query (`kind == 'start'`, no composite index) so a starting point older than the 180-day window still loads. `deriveBalances` (`engine/balances.ts`, pure) sums the ledger since the start: money on hand is the start money plus the confirmed days that arrived on or after the start date, less bills marked paid; each item's assigned figure is its starting amount plus its lines in the latest split of each counted day, less the set-aside a paid bill used; Free to spend is money on hand less everything assigned (negative reads "Over-assigned $X", never blocked). *Round 7:* an item whose header has a `heldReleasedOn` day holds nothing in the sums from that day (`BalancesInput.releasedFrom`, read against `asOf`, today; `deriveBalancesBefore` reads it as of the day before), so what it held is Free to spend; its own figure still shows what it held, a paused goal keeps its money, and no ledger entry is written, so a closing gives the same figures. *Round 7, G9:* the release is the person's choice. Archive and End ask, when the item holds money, "Make it Free to spend" or "Keep it held" (nothing preselected, the primary off until one is picked); `archiveItem`/`endItem` write `heldReleasedOn` in the same transaction as `archivedAt`/`endedAt` (`getHeldReleaseDay`: the archive day, or the day after the last day, or null to keep). A kept item is listed under "Stopped, still holding money" (`StoppedHoldingList`) and its sheet's "Release what it holds" writes the day (`releaseHeld`, `getLaterReleaseDay`: today, or the day after a last day still ahead) with an Undo (`undoReleaseHeld`, only while the day is the one it wrote; when it finds the item changed since, it writes nothing and its toast says why). A header written before the field existed has no key and `readHeldReleasedOn` reads it as round 7 shipped it (the earlier of the archive day and the day after the last day); a stored null is a kept item. No `transfer` move exists, so moving the money straight to another envelope or goal is not offered. Removing a row in Starting out that holds money asks the same question (`HeldChoiceList`, nothing preselected, the figure masked while hidden), and "Start over" asks it once for every item that holds money; a row that holds nothing keeps the plain confirm and is archived as released. With no money entered, Free to spend is unknown ("Not set yet"), never zero. Nothing is stored; `selectBalances` re-derives it, so a cleared cache gives the same figures. A bill's starting amount is a funded entry dated the start day with the reserved day key `start`, so it counts toward the payment whose window holds that day and `fundedDays` skips it. Home shows Free to spend (opens Free to spend in detail), the lookahead's `HoldsThroughLine` (Issue 21 replaced Issue 17's `getBillCoverage`; "No bills added yet" when there are none), the next income day and up to six envelopes with *assigned* (`getLevelWords(level).envelopeFigure`: *assigned* at Plan, *left* at Track) and "See all N envelopes". Envelopes carry no starting amount at Plan; Issue 22 adds them at Track. Starting Out is an overlay `Subview` reached by `?view=start`; only the income source blocks Next. *Round 4:* it has six steps (income, bills, envelopes, goals, where things stand, done), built by `screens/start/StartFlow.tsx` over two data sources, `SavedStart` (the plan, written as each form saves) and `DeviceStart` (a local draft). Each form opens in its own sheet with an optional `draft` prop (`forms/draftSink.ts`): given one, it hands the built value over instead of writing it, and starts from the entry being changed. Removing a saved row archives it (`archiveItem`); "Start over" archives everything in the plan, or clears the draft.

**The signed-out draft.** `ProtectedRoute` takes `allowSignedOut` for `/runway`, and `RunwayPage` shows a signed-out visitor only a landing card and Starting out. Their answers are kept in `localStorage` under `runway:signed-out-draft` (no uid in the key; a `version` field, and a draft of another version or with an entry of the wrong shape is dropped; the key is removed when the last entry goes), as plain JSON: names, amounts and dates are **not encrypted**, because the data key belongs to an account. The draft is on this browser only, is never sent anywhere, and is deleted 7 days after the last change (`START_DRAFT_DAYS`; an expired one is removed the next time Runway opens) once it is written to a plan or the person chooses Start over, and when anyone signs out of this browser or another account signs in (`clearViewerSessions` removes every `<app>:signed-out-draft` key). A draft left by one signed-out visitor is offered to whoever signs in next on that browser only with the ask that names what would be added, so a shared browser's next person can decline it. On sign-in `DraftHandoff` writes it with the normal actions (`commitStartDraft`: `createIncome`, `createBill`, `createEnvelope`, `createGoal`, one write each, new `orderIndex` values after the plan's own, the goal's starting amount recorded as a `start` move when the plan has a starting day), then clears it. The person is always asked first, naming what will be added ("Add them to my plan" or "Keep my plan as it is" / "Do not add them"): items whose name the plan already holds are skipped, never doubled, and the names are compared only after a read from the server shows the app has the plan's whole item list (a cold cache never reads as an empty plan). A drafted envelope's or goal's "From a paycheck" source is the drafted income source's `draft:<name>` id until the hand-off maps it to the real one; a goal's starting amount that did not record is said in a toast naming where to add it. A failed write keeps the draft. No rule or index changed: the draft never reaches Firestore before sign-in. Not yet derivable: money from confirmed days older than the 180-day window and a bill's set-aside that belongs to a later payment than the one the start day falls in.

*What counts toward a goal's `heldCents` now.* `selectConfirmedByItem` adds, for every item, the `cents` of its lines in the `confirmed` records of the confirmed days in the 180-day window, and a goal's draft (`DraftGoalInput.heldCents`) and its pace (`GoalsScreen`) read it, so a goal a confirmed day filled up to its target is not asked for on later days. `selectHeldByItem` (the renamed selector) adds a goal's starting amount from the `start` moves (Issue 17), and once a start exists it counts only the confirmed days that arrived on or after it (a starting amount already includes earlier ones, as `deriveBalances` does), the same filter bill progress uses. Home and Free to spend in detail wait for the moves and records before drawing a figure. A withdrawal, interest and a goal's balance on a day it was not confirmed are not derivable yet. A goal's earlier gifts come from the closing (`deriveHeldByItem`), so one a confirmed day filled up long ago is not asked for again. A bill's progress is counted separately, from the same records (Issue 15, below). Cadences count over the days still coming, so an "every other" envelope or goal whose anchor day is confirmed counts from the first day left, the same quirk a day passing has always had.

### Lookahead

`lookahead(plan, startState, horizon)` chains drafts: for each coming income day, or planned-together set, build the draft, assume it is confirmed as proposed and nothing is spent, and carry bill progress, loan balances and Free to spend into the next. The horizon is `LOOKAHEAD_MONTHS` or the last income day, whichever comes first.

- *Holds through:* the last income day before the first day on which a Must goes unfunded (a Must held or short because of a pairing counts as unfunded), or a bill due on or before the next income day is not fully funded. In lookahead an unresolved hold stays reserved and shows as a gap on its day.
- *No income before a bill is due:* a bill whose due date falls after the last income day that could fund it.
- *Cushion:* the sum over ranges of the difference between the Conservative and Middle figures, shown only when the plan's stance is not Middle.
- It is memoized on the plan fingerprint and state key. With 200 items over a year this is under 60 drafts of a few hundred lines each, which fits comfortably in a single synchronous selector; if profiling says otherwise it moves to a worker without changing its signature.

**Lookahead as shipped (Issue 21).** `engine/lookahead.ts` is pure and takes the coming days, each bill's payments and a `draftOf(day, carry)` callback, so nothing in `engine/` imports the store. `store/selectors/lookaheadSelectors.ts` supplies the callback: it calls `computeDraftView` (the same function the day screen uses, with `isCached: false` and the coming days built once) after adding to `heldByItem` and to each bill's `funded` list what the days before it gave, which is the carry. Free to spend and loan balances are not carried because nothing reads them yet. Problems, in date order: `overdue` (a payment past due, not marked paid, on or after the latest of the plan's start date, the day the bill was created and the start of the recent window, which since Issue 28 is the day after the newest closing; holds through nothing), `noIncome` (a payment up to the horizon that no coming income day can set aside and that is not set aside in full; holds through the day before it, as the first-shipped Home line did), `short` (a Must line with `shortBy > 0`, or a bill line whose payment falls due before the next income day, on a day; holds through the last income day before it; the last day's next income day is the day after the horizon). Each bill reports only its first payment of each kind. `incomeEndsOn` is the last income day when the horizon is more than `INCOME_END_GAP_DAYS` (45) beyond it. With no problem the plan holds through `incomeEndsOn ?? horizon`. `getStanceCushion` adds, over the next `CUSHION_DAYS` (30), each ranged pay day's middle less its planned figure and each unpaid ranged bill payment's planned figure less its middle, and counts distinct sources and bills; it is null unless positive. A change that starts in the future needs no special case: `computeDraftView` resolves every item on the day's own date, so a version from Mar 1 first shows on the day it starts and the lookahead shows it now. `previewLookahead` runs `selectLookahead` over the real state and over a copy with the change layered in (the same `layerPlan` the day preview uses) and `EffectPreview` words the difference ("Your plan would hold through Nov 3 instead of Dec 14."). The Days list draws at most `COMING_DAYS_CAP` (50) days while the lookahead walks all of them. A day's own screen drafts without the carry, so a later day can read short in the lookahead only because an earlier one left a bill short. `scripts/checks/runwayEngine.ts` times the walk over 53 days with 50 envelopes (about 20 ms). No documents, rules, indexes or seed data changed: the lookahead is derived.

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
| `billPaid` | marks the occurrence paid; the part of the amount beyond what was set aside for the bill draws Free to spend (`settlePaid`). *Not built yet:* an actual amount, and a smaller actual returning the difference; a mark records the planned total |
| `transfer`, `withdrawal`, `cardPayment`, `balanceCorrection` | *not built yet;* as named; a move with `reversesMoveId` set cancels the move it names (as built, only a `billPaid` undo uses it) |
| archived or ended item | *as built:* from its `heldReleasedOn` day the item's figure leaves the sums, so what it held is Free to spend (`releasedFrom`); a kept item (null) keeps it until "Release what it holds" |

Free to spend is derived last: money on hand plus leftovers, minus draws. If it is below zero the Over-assigned line shows.

**Purchases as first shipped (Issue 24).**

- *Document.* `PurchaseDoc` carries only `id`, `date` (the spending day, date-only), `source` (`manual`), `needsHome` (`false`), `createdAt`, `updatedAt` and `sealed`; the status, account, expense, import and dedupe keys arrive with the issues that read them. Sealed: `{ amountCents, merchant, note, lines, refundOfId }`, each line `{ envelopeId, cents, via: 'chosen' | 'free' }`, a refund's amount and lines negative, and a null `envelopeId` meaning Free to spend (a refund the person sends there). Whether it was paid by card is not stored until card purchases exist (Issue 50), so Paid by is not asked.
- *Write.* `addPurchase` (`purchaseActions.ts`) is one `runTransaction`: it reads the plan fresh and refuses a day outside every tracking period (each period is checked on the device, the rules check the first start and the last end) and a day before the open period's start (`getCountedFrom`: the figures count purchases only from there, so an earlier stretch's day would be listed and never counted), reads each envelope named and refuses one that is gone or archived, and writes the document under a `generateUuid` id. It needs a connection, and the form says so rather than queueing.
- *Balances.* `deriveBalances` takes `purchases` (the selector passes them only at Track, and only those dated on or after the starting day): money on hand falls by each amount, each line lowers its envelope's figure, and the figure of an envelope that is over goes below zero ("−$18.00 over") while the envelope total in Free to spend counts it as zero, so an overspend draws Free to spend by exactly the amount it is over and a refund after an overspend restores it with no extra step. `engine/purchases.ts` holds the pure parts: `splitEvenly` (largest remainder, the odd cent to the lowest id), `getRefundLines` (a refund goes back to the envelopes the purchase took from, in the proportions of what each still has to get back after the refunds already made, so many small refunds never return one envelope's share twice; a part from an archived envelope, or a purchase with no envelope lines, asks where it goes, default Free to spend), `getRefundableCents` (what refunds already made leave, checked on the device only, since the rules cannot sum sealed amounts), `getLineEffect` and `getPurchaseEffect` (what a purchase would leave over and how far Free to spend falls, shown in the form before saving).
- *Reading.* One listener, `startPurchasesListener`, reads `date >= today - RECENT_DAYS_WINDOW` (180 days) with a single-field range, so no index; each snapshot is opened with the sequence guard the others use, and a purchase that will not open fails the plan load like a move does. `selectIsMovesLoaded` now also waits for it, so no screen draws a figure before the ledger is whole. The purchases before the window are in the closing, so every figure counts them (Issue 28: before it, a plan tracked for more than 180 days left the older purchases out and the scale plan's "left" and Free to spend were wrong, "Performance", below). The Spend tab lists the window (since the newest closing) newest first under month dividers, 30 rows before "Show more", with a search from 5 rows (`RUNWAY_SEARCH_THRESHOLD`) that covers the whole window and an envelope filter kept in the URL (`spendEnvelope`); older months are picked from the period chip (`@/components/ScopeChip`) on the Purchases header and read on demand (see "What reaches back" under Closings).
- *Rules.* `purchases` allows `read` and `create` for the owner only; update and delete arrive with Issue 25 (below). A create needs exactly the seven keys, an id equal to the document id, a date-only `date` no more than a day ahead and not before the plan's first tracking period or after its last one's end (`get` of the plan, one lookup), `source` in the allowlist, a boolean `needsHome`, bounded `createdAt` and `updatedAt`, and a sealed payload. Sealed lines are capped at 12 on the device. `firestore.indexes.json` is unchanged. *Beta tier:* none of these create checks is in `firestore.rules` any more (Security Rules Design Criteria 5); `addPurchase` keeps them, and the form allows only today or earlier (its date picker stops at today), not a day ahead.

**Closings as built (Issue 28).**

- *What one holds.* `closing(month, previous, entries)` (`engine/closings.ts`) is pure: the closing before it plus the month's entries, counted from the plan's starting day. It keeps the sums `deriveBalances` takes from the ledger (what arrived, what each item was given, what was spent and from which envelope) and, for each bill, every confirmed day that set money aside and every payment not undone, which is what bill progress and the lookahead read. It also keeps the few confirmed days whose money arrived after the month ended (`late`), so "Where is your money now?" can leave out what arrived on or after the day it is asked for. It does not keep the starting amounts (they are always read, so the starting day's amounts can be corrected without touching a closing), Free to spend by source (nothing reads it yet) or loan balances (no loans yet). Spending is kept apart from the rest and applied only while Track is on, so moving between Plan and Track never makes a closing wrong.
- *Which entries go where.* An entry is placed by the date its listener reads it by: a day by `expectedOn` (its records go with it), a move by `date`, a purchase by `date`. A closing for month M holds every entry in months up to M, and the recent window starts on the first day of the month after it, so each entry is counted once. The first closing of a plan also reads the month before the starting day's month, because a day expected or a payment due then still counts when it arrives or is paid after the starting day, and the window never reaches back that far. `deriveBalances`, `deriveHeldByItem` and `deriveBillProgress` take the closing as their base, and `check:runway-engine` proves, for every month of a five-year plan (with corrections, refunds, a payment undone and marked again, a payment marked paid a month late, a day that arrives after its month, purchases before the starting day), that closing plus the ledger since equals the whole ledger.
- *When a month is closed.* A month closes once it ended `CLOSING_SETTLE_DAYS` (15) ago, so the recent window always reaches back past the 14 days an unconfirmed day stays on the list, and a device whose clock is a day ahead never closes a month another is still writing into. A load rebuilds when a write marked closings stale or when the newest valid one is two months behind (`CLOSING_LAG_MONTHS`); a closing one month behind is used as it is, with a window of up to about 75 days. A plan too new to have a closable month reads the usual 180 days.
- *Which closing applies.* One that is before `plan.dirtyFrom` (or any, when it is null) and was counted from the plan's current starting day. The closing listener asks for the newest one (`month < dirtyFrom`, `orderBy month desc`, `limit 1`; a single field, so no index) and restarts when `dirtyFrom` changes. A closing that will not open is read as none and rebuilt. `selectHistory` says `loading`, `building`, `failed` or `ready` with the closing and the day the window starts; the days, moves and purchases are read for that day and count as loaded only while they were read for it, so a closing and a window from different times are never added together.
- *Every ledger write marks.* A write that adds, changes or removes a day (confirm, correction), a bill paid or undone, a purchase (add, edit, remove) or the plan's starting day (`recordStart`, `moveToTrack`) reads the plan in its own transaction and writes `dirtyFrom = min(dirtyFrom, month)` for each closed month the entry was and is dated in, together with a larger `updatedAt` (`getLedgerMark`, `markLedgerWrite` in `closingActions.ts`). A write is checked against the last month that closes two days from now, so a device a day behind still marks what a device a day ahead may have closed. Marking a day not arrived, saving a day's override, ticking a checklist line, Plan changes and moving down to Plan are not ledger entries and do not mark. A server pass that writes purchases (Reconcile) must go through the same rule.
- *Rebuilding.* `rebuildClosings` runs on the device (`hooks/useClosings.ts`), one rebuild at a time, while the history says `building`. It reads the plan and the newest valid closing from the server, reads each month from the server (three months ahead of the one being summed) and writes the closings six at a time, each write one transaction that checks the plan's `updatedAt` is still the one it read, writes the closings, moves `dirtyFrom` forward to the month after the last one written (or to null at the end, when it also deletes any closing past the last closable month) and raises `updatedAt`. A ledger write that lands in the middle changes `updatedAt`, so the rebuild stops and starts again from what is now on the server (three tries); two devices rebuilding can never both commit. A rebuild interrupted halfway resumes from the closing it reached. A closing is a cache, so its rules let the owner write and delete it.
- *What the person sees.* While the history is `building` the app shows one card, "Updating your history", in place of every screen. A rebuild that cannot finish (offline, a rule refusal) leaves the plan on the newest closing that applies, which is correct but reads a longer window; with none it shows "Your history could not be updated right now" and a "Try again".
- *What reaches back, and what does not.* The Days list and the lookahead's late-bill check (`since` follows the window) cover the months since the newest closing. Days reaches back through its "Earlier months" chip (`?daysMonth=yyyy-mm`): the days of that month before `recentFrom` and their records are read into `historyDays`/`historyRecords`, never into `days`/`records` that the balances sum, and open read-only (`selectIsDayCorrectable` is `expectedOn >= recentFrom`). Spend reaches back further: its period chip offers every month back to the month of `startDate` (`SpendScreen` "Older months", at most 120), read on demand by the period listener, so an older purchase lists, opens and edits there. "Where is your money now?" cannot pick a day before the window, since the figures of an earlier day are not listed. Marking a payment paid reads past marks that were undone, so a payment from a month the device has not loaded can be marked again. While the delete-plan screen is open no rebuild starts (the delete removes the closings first, which would otherwise read as a missing history), and `deleteRunwayPlan` sweeps the plan's collections once more after it deletes the plan document.
- *Still a limit.* A rebuild needs a connection. A device with a wrong clock can close a month early; its writes are then not marked. A closing is read whole (about 150 KB at the end of five years of the scale plan, well under the 1 MiB document limit); a plan with far more bills or paid payments than that is a reason to keep only the payments that can still matter.

**Editing, removing and checking an amount (Issue 25).**

- *History.* An edit or a removal is kept as a `purchaseChange` change-log entry written in the same transaction (`effectiveFrom: null`, `itemIds` the envelopes before and after, at most 20), sealed `{ summary, note: null }` with a sentence of what changed ("Purchase changed: Safeway, amount $54.18 to $64.18."). A removal deletes the purchase document (Criteria 14: removing is a real action), so the entry is the record that it existed. The log's rules list gained the kind and the entry stays append-only.
- *Write.* `editPurchase` and `deletePurchase` (`purchaseActions.ts`) re-read the purchase in the transaction and refuse when its `updatedAt` is not the one the person opened (another device edited or removed it first), so two devices never both apply a change; the form holds the purchase it opened with, not the live one. An edit checks the day against the plan's tracking periods and only newly picked envelopes against archiving (one already on the purchase may have been archived since and stays). Adding refuses a day before the open stretch (`getCountedFrom`); an edit refuses it only when the day is being moved there, so a purchase from an earlier, closed stretch can still have its note changed, be corrected or be removed (removing checks no day). Lines are the person's choices, so nothing is recomputed from balances; the envelope figures and Free to spend are derived from the stored lines and never stored. The form adds back the purchase's own lines when it shows what an envelope would have left, and an original cannot be edited below what its refunds already returned, in total or per envelope (a device check). A refund saved with the same amount keeps the lines it has. A refund keeps being a refund: the "This is a refund" switch is not offered while editing.
- *Delete of a refunded original.* Allowed after a confirm that says its refunds stay and keep returning money; they read as not tied to a purchase afterwards.
- *Reading.* The Spend list rows open `PurchaseScreen` (`?purchase=<id>`, a `Subview`, the trash icon with `useActionModal().confirm`, destructive) with "Change this purchase" opening `PurchaseForm` in edit mode. A purchase from before the newest closing is listed once its month is picked from Spend's period chip, and opens and edits the same way.
- *Mark all paid.* `markBillsPaid` writes the group's unpaid bills in transactions of 5 (each re-reads its bills' paid marks, keeping a transaction under the rules' 20-document read limit) and reports the marks it really wrote; `undoBillsPaid` reverses only those. The batches are not one transaction: if a later batch fails, the earlier ones stay paid, and the toast says "Marked N of M bills paid" with an Undo for the N (`PartlyMarkedError`). A tick or Mark all paid needs a connection (a transaction), and fails fast with that sentence when the browser reports offline.
- *Check an amount.* `checkAmount(envelopeId, cents, envelopes, freeCents)` (`engine/checkAmount.ts`, pure) says "fits, $X left" or "over by $X" with what could cover it: Free to spend first when it holds money (`envelopeId: null` in a source), then the other envelopes holding money, lowest priority first (Want, Should, Must), list order within a priority, each taking only what is still needed; whatever neither Free to spend nor an envelope holds is said to leave Free to spend over-assigned. Goals are not sources (the README names envelopes only), and spill-over chains arrive with Issue 43. It reads the same balances as Home, moves nothing and is drawn only at Track (`LevelGate`, and the `checkAmount` view falls back to Home at Plan). It opens from the Spending group of an envelope's sheet and from the Free to spend detail (`?view=checkAmount&checkEnvelope=<id>`, plus `checkFrom=true` from the Free to spend detail so Back returns to it). `firestore.indexes.json` is unchanged.

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

**Goal pace (Issue 9).** `engine/pace.ts` is pure: `getPace({ targetCents, targetDate, heldCents, funding }, incomeDays, priorDays?)` returns `{ isComplete, remainingCents, dayCount, neededPerDayCents, plannedByDateCents, reachedOn, state }`. With a date, `dayCount` is the income days on or before it and `neededPerDayCents = ceil(remaining / dayCount)`, null when none comes first. Let `n = ceil(remaining / amount)` funded days and `have` the funded days on or before the date: `state` is `behind` when `have < n`, `onPace` when `have = n` and `ahead` when `have > n` (the target is reached at least one funded day early). A goal with no date has `state: null` and says which income day the plan reaches it on, or that the days ahead never do. `completed` is derived (`remaining` is zero) and never stored. Before any day is confirmed contributions are zero, so the pace line reads from the plan alone; `selectDraft` and the Goals screen pass `heldCents: 0` until confirmed days exist. The Goals pill is the `section=goals` URL param; goals and their rows come from `selectGoals`, `createGoal` writes the header, first version and change in one batch like the other creators, the form refuses a date past `LOOKAHEAD_MONTHS`, since the coming income days stop there and a later date would read as behind for want of days to count, and and the rules needed no change because `goal` was already an allowed item and version kind.

### Lifecycles

| Thing | States and transitions |
|---|---|
| Income day | no document (draft, computed) → `draft` document on override → `confirmed` (refused while a hold is unresolved; transaction: status must be `draft`, writes the `proposed` and `confirmed` records, aborts with a readable message if another device confirmed first) · `draft` → `notArrived` · `notArrived` → `draft` · `confirmed` stays confirmed; changes are `correction` records |
| Plan item | active → ended (`endedAt`, written once, with the `ended` change entry whose id `ended_${itemId}` makes a second write fail; by the person, or by the sweep when a pay line's own ending is reached) · active → archived (`archivedAt`, once, with a `planChange` entry); older versions keep resolving |
| Goal | `active` ↔ `paused` (a version); `completed` is derived from the target; archive is the header |
| Bill occurrence | funding → paid (`billPaid` move, possibly ahead of its due date) → undone (a move with `reversesMoveId`) |
| Purchase | `needsHome` → assigned; `pending` → `posted` in place (same `dedupeKey`); edits recompute lines |
| Tracking | Plan → Track (new period with `from`) → Plan (period `to` set); each is a `trackingChange` move and a `levelMove` change; a purchase dated outside every period is refused |
| Link | `linking` → `ok` ⇄ `needsReauth` → `revoked`; the server owns every transition |
| What-if | in memory → saved (`WhatIfDoc`) → applied (`appliedAt`, versions written) or dropped (document deleted if saved, nothing otherwise) |
| Receipt image | stored (`expiresAt = createdAt + 365 days`) → offer window (last 30 days: keep or download) → kept (`expiresAt = null`) or removed by the scheduled function (document and Storage object deleted; the text details on the purchase remain) |
| Closing | valid → stale (`dirtyFrom`, or counted from another starting day) → rebuilt; or missing → built |

Moving to Track requires a start date and starting amounts; moving to Link requires a start date and the confirmed line-up, and neither happens without them.

### What if

`applyWhatIf(plan, draftVersions)` layers virtual versions (synthetic `createdAt = Infinity`, so they win) over the real versions and returns a plan. Every selector that takes a plan (draft, lookahead, balances) takes this one the same way, so the comparison beside the real plan is two calls of the same function. Applying a what-if writes real versions with their own `effectiveFrom`/`effectiveUntil` and one `whatIfApplied` change in a single `writeBatch` (all new documents, no reads). Hours for an hourly pay line are a version of that pay line.

---

## Cascades

What each kind of edit writes, what is worked out again from it, and what stays as it was. The README's "How Runway Works" is the same ground from the person's side.

Three things hold for every row. **Nothing derived is stored:** a draft (`selectDraft`), the coming days (`buildComingDays`), the lookahead and its problems (`engine/lookahead.ts`: `short` for a Must or a bill due before the next income day, `overdue`, `noIncome`), bill payments (`planBillPayments`), goal pace and every balance (`deriveBalances`) are recomputed from the versions, the days' overrides, the records, the moves and the purchases, so an edit cascades by being read again and never by a second write. **Only a ledger write marks a closing:** a confirm or correction, a bill paid or undone, a purchase added, edited or removed, and the starting day or a starting holding go through `getLedgerMark`/`markLedgerWrite`, which moves `plan.dirtyFrom` back to the earliest closed month among the entry's dates (before and after) and bumps `updatedAt`; the next load rebuilds from there, six closings per transaction, and draws "Updating your history" until it is done. A plan edit (a version, a change entry, an end, an archive, a day override, the stance) is not a ledger entry and marks nothing. **History is append-only:** a version, a change, a move and a day's record are only ever created, so what was true before an edit stays readable.

| Edit | Written | Recomputed | Closings | Stays frozen |
|---|---|---|---|---|
| Income amount or schedule (`changeItem`) | one version (whole payload, `effectiveFrom` today or later, `effectiveUntil` for a stretch) and one `planChange` change, in one batch; when the new schedule moves a day that had its own choices, `carryDayOverrides` then moves them (below) | the coming days from the version in force on each date, each day's money, every draft, the lookahead, goal pace, bill shares | none | confirmed days' records; a day before `effectiveFrom` keeps the version it had; bills and envelopes funded on chosen days keep the day keys they named (nothing remaps them) |
| A moved payday's own choices (`carryDayOverrides`) | one transaction per day: the old day must still be a draft and the new one a draft with no choices of its own (or no document); the old override is emptied and the new day gets it. It runs after the change saves, without holding the sheet; every day is tried, a day whose write fails keeps its choices on the old date, and a toast names those days ("2 income days kept their old choices"). The change stays saved | the moved day's draft | none | a day with no new date near it (`planOverrideCarry` `stranded`) keeps its override on a date that no longer occurs, which applies to nothing; the change preview says so (`MOVED_DAY_WORDS`) |
| Bill amount, priority or due date (`changeItem`) | a version and a change | its payments (`occurrences`), what each coming day sets aside, every draft, the lookahead (`overdue`, `noIncome`, `short`), what a pairing to it may give | none | money already set aside: each funded entry is counted against the payment whose window holds its day's scheduled date; a `billPaid` move keeps its `date`, id and amount, and is matched to the nearest new due date at read time (`matchMovedDates` in `planBillPayments`: within half the gap to the neighbouring dates, `LONE_GAP` 31 days for a one-time date, never onto a date that was already an old one, nearest pairs first), so nothing is written for it |
| Envelope funding, goal contribution or target | a version and a change | every draft, the lookahead, goal pace, a goal's pairing ceiling (`target − held`) | none | confirmed days |
| This income day only (`saveDayOverride`) | the payload merged into that day's override and a `planChange` change, in one transaction; refused once the day is not a draft | that day's draft | none | every other day |
| A stretch | a version with `effectiveUntil` | the days it covers; the earlier version returns with no write, and the first day back says so | none | |
| Pause or restart a goal (`setGoalState`) | a version with `state` | demands (a paused goal asks nothing), pairings give it nothing (`PAIRING_STOP_WORDS.paused`) | none | its balance: a paused goal keeps holding its money |
| End an item (`endItem`) | `endedAt` (write-once, the last day inclusive), `heldReleasedOn` (the person's choice: the day after `endedAt`, or null to keep; an item that holds nothing when it stops, and every ending the sweep in `useRunwaySync` reaches on its own, is asked nothing and stored as kept, null, so money that reaches it later, such as a bill's set-aside or an ended item's last days, stays with it until the person releases it; it is listed under "Stopped, still holding money" only once it holds more than zero) and the `ended_${itemId}` change, in one transaction | the item leaves the coming days and `resolve` from the next day; a bill's ending is cut at `endedAt` (`capEnding`); from its `heldReleasedOn` day its figure leaves the balance sums (`releasedFrom`, read against today), so what it held is Free to spend, and a kept item keeps it; pairings to it give nothing | none: the release is applied over the closing's sums by `deriveBalances`, so a closing gives the same figures | every version, record and confirmed day |
| Archive an item (`archiveItem`) | `archivedAt` (today, write-once), `heldReleasedOn` (today, or null to keep; null too when it held nothing, as for End, except Starting out's Remove, which writes today for an entry that holds nothing; when nothing was asked, a release day the header already has is kept, so archiving an item whose last day has passed, which `ItemSheet` offers, never takes back its release) and a `planChange` change | as for End, from `archivedAt`; a pay line's overdue days leave the list too | none | as for End; there is no un-archive |
| Confirm a day (`confirmDay`) | the day (`confirmed`, `arrivedOn`, `confirmedAt`) and its `_proposed` and `_confirmed` records, in one transaction; refused for an unresolved hold, a day not a draft, an override changed since the draft was built (`overrideFingerprint`), a negative item, or a remainder below `-coverCents` (`isWithinCover`). A cover from Free to spend is nothing more than that negative `freeToSpendCents` | balances (money on hand by the arrival, each item by its amount, Free to spend by the remainder, so by `-coverCents` when covered); bill progress, so later days ask less; a goal's held amount, so later contributions stop at the target; every later draft and the lookahead; a pay line whose last day this was is marked ended on the next load | `markLedgerWrite([expectedOn])` | the two records |
| Correct a day (`correctDay`) | a `correction` record (id from the record it replaces, `supersedesId`), carrying the whole new split, `before` and `changes`; `doneLineIds` loses the ticks of changed items; no change-log entry. Refused when nothing changed, when the record was already corrected elsewhere, or when it leaves the day below its cover plus what the person chose to add from Free to spend | as for Confirm, from the end of the correction chain (`getEffectiveSplits`); a paid payment is settled again (`settlePaid`), so when the correction lowers what a paid bill held the cut moves to Free to spend instead of the bill going below zero | `markLedgerWrite([expectedOn])` | the original records and every earlier correction |
| Not arrived, or put back (`markNotArrived`, `undoNotArrived`) | the day's `status` only | the day leaves the plan (or returns), every later draft, the lookahead | none: a not-arrived day has no records | |
| Mark paid, or undo (`markBillPaid`, `undoBillPaid`, `markBillsPaid`) | a `billPaid` move (`paid_<billId>_<due yyyymmdd>`, the planned total, `paidOn` today, `fromFreeCents`); an undo is another move with `reversesMoveId` | bill progress (the payment asks nothing more and its money stays in later days' pool), balances, the `overdue` problem | `markLedgerWrite([dueOn])` | the moves |
| Add, edit or remove a purchase (Track) | the purchase (re-read in the transaction for an edit or removal) and, for an edit or removal, a `purchaseChange` change | balances, an envelope's "left", Check an amount | `markLedgerWrite` with the old and new dates | |
| Starting amounts again, same day (`recordStart`) | newer `start` moves (the newest per holding wins) and a `start` change | balances only | none while the starting day is unchanged | the earlier `start` moves |
| A holding for an item added later (`recordHolding`) | one `start` move dated the starting day | balances, that item's progress | `markLedgerWrite([startDate])` | |
| Move the starting day, or start tracking (`recordStart`, `moveToTrack`) | `startDate` (and for Track a tracking period and a `trackingChange` move) and fresh `start` moves | everything counted since the start; a closing counted from another starting day no longer applies | the old and new day | purchases before the new start stay stored and are never counted |
| Stance (`setStance`) | the plan's `stance` | every ranged figure, every draft, the lookahead | none | confirmed days keep the stance they were confirmed under |
| Checklist ticks (`setLinesDone`) | `doneLineIds` (`arrayUnion`/`arrayRemove`, at most 200 on the device) | the day's "done" state | none | |

What the device refuses for being old: a change dated before today (`utils/fromWhen.ts` `getChangeSpan`), an end date before today (the `ItemSheet` date field's `min`), a purchase before the open tracking stretch (`purchaseActions.ts` `checkDayAndEnvelopes`), confirming a day more than `OVERDUE_DAYS` (14) past its date (it is not listed), correcting a day before the recent window (it is not listed), and "Change what you started with" after its window (`canChangeStart`, shown or hidden only; nothing refuses the write). Nothing is refused for falling in a closed month: the write marks `dirtyFrom` and the closings are rebuilt.

A cover from Free to spend, in Confirm and in Correct alike, is checked against Free to spend as this device's store has it just before the write (`handleConfirm`, `handleSave`), not inside the transaction: a purchase saved on another device in between can leave Free to spend below zero, which then reads "Over-assigned". When the difference grows after a cover is taken (an item raised), `CoverCard` keeps the cover and its Undo and offers covering the larger difference ("Cover $X instead") as the footer's door, before any cuts.

---

## Security Rules Design Criteria

The block lives in `firestore.rules` under `apps/runway/…`. Runway is a beta app, so its rules are the beta tier (`docs/conventions/firestore-rules.md` "Firestore and Storage rules"): they decide who may do what to which collection and leave a document's shape to the client. Nothing is shared, so one predicate does it, `isUser(uid)`. The strict per-field block the MVP was built with is kept in git history (`git show 9cb21269:firestore.rules`, the Runway block) as the starting point when Runway graduates (`GRADUATING.md`). Where another section says a rule checks a type, a key list, a cap, a date or a transition (the "as first shipped" notes), the app's actions are what hold it now.

1. **Owner only, one line.** Every client-readable path under `apps/runway/plans/{uid}/…` allows access only when `request.auth.uid == uid`. No `ownerUid` body check, no `where`, no composite index for access. A plan's `uid` field is not checked: the Functions take the uid from the caller's sign-in, never from the document.
2. **Server-only paths deny everything.** `apps/runway/server/**` and `apps/runway/keyChecks/**` have no `match`, and Firestore refuses what no rule allows. Admin SDK access from Functions bypasses rules.
3. **Append-only collections.** `versions`, `changes`, `moves` and a day's `records` allow `create` and `read` only, so a write over an existing one is refused rather than overwriting it, and a mistake is superseded by a later entry, never edited. Moves and records have ids built from their own fields (`paid_{refId}_{yyyymmdd}`, `<dayId>_<kind>`, `<recordId>_corrected`), so a second tap or a second device that writes the same one fails on the id; versions and changes have random ids. This is access, not shape, so it stays in the beta tier.
4. **What may change and what may go.** `update` is allowed on the plan, `items`, `days`, `purchases` and `closings`; `delete` on `purchases` (removed with its ledger entry) and `closings` (a rebuildable cache) only. A client never deletes the plan document: `deleteRunwayPlan` does it with the Admin SDK.
5. **Shape is the client's.** The sealed envelope's keys, key lists, types, enums, date-only values, list caps (`doneLineIds` 200, `itemIds` 20), timestamp bounds, write-once `endedAt`/`archivedAt`/`confirmedAt`, a day's draft-to-confirmed moves and a purchase's tracked span are kept by the app's actions (types, caps in `constants.ts`, transactions that re-read), not by the rules. A caller who can write the plan can write any shape into it, and the only one who can is its owner.
6. **Server-written documents (Next Steps).** `links` and `accountBalances` will be read-only to the client. The plan's wildcard allows `create` everywhere under it, so they need the wildcard narrowed by a condition on the collection name, not a second `match` beside it, since every `allow` that matches is OR-ed.
7. **Storage.** `apps/runway/receipts/{uid}/{purchaseId}/{imageId}` allows read, write and delete to `request.auth.uid == uid`, `request.resource.size <= 10 MiB`, and `contentType == 'application/octet-stream'` (the bytes are sealed, so no image type is ever visible to Storage).
8. **No unauthenticated callable surface.** Every Runway callable checks `request.auth`. The provider webhook is the one HTTPS function that does not, and it authenticates by the provider's signature.
9. **Verified, not assumed.** `npm run check:runway-rules` reads and writes every collection as the owner, a second user and a signed-out visitor: the owner gets the operations above (and create and read under any other collection name, which the plan's wildcard allows) and nobody else gets any. When the rules moved to the beta tier, the strict rules' own matrix (2,253 cases, every write the app makes and every shape it refused) was run against both files: no case the strict rules allowed is refused now.

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
  closing: ClosingState | null;            // the newest closing that applies, with the dirtyFrom it was read for (closingFor)
  loadDay: DateOnly | null; failedRebuild: string | null;   // the day the visit began; a rebuild that did not finish
  recent: { days: Record<string, OpenDay>; purchases: Record<string, OpenPurchase>; moves: OpenMove[] };   // each kept with the recentFrom it was read for (daysFrom, movesFrom, purchasesFrom)
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
| items, versions, accounts, rules, expenses, whatIfs, links, accountBalances | the whole collection (each is small and needed by the first screen) |
| closing | the newest closing that applies: `month < dirtyFrom` (all, when nothing is dirty), `orderBy month desc`, `limit 1`; restarted when `dirtyFrom` changes. Started with the plan, so the recent listeners wait for both |
| recent days, purchases, moves | `date`/`expectedOn` `>= recentFrom`, where `recentFrom` is the first day of the month after the newest closing that applies, or `RECENT_DAYS_WINDOW` (180) days back when none applies (a plan too new to have a closable month). Each result is kept with the `recentFrom` it was read for and counts as loaded only while that is the current one |
| day records | one listener on `days/{dayId}/records` for each confirmed day in that window (a collection-group query would need a wildcard rule); restarted when the set of confirmed days changes, and `recordsFor` in the slice says which set the records belong to |
| needsHome | `where('needsHome', '==', true)`, any date |

When closings advance, `recentFrom` changes and the three "recent" listeners restart, which happens about once a month. The listeners start only once the history is `ready`; while a rebuild runs there is no window at all.

**Tier 2: the history window.** Keyed on `(from, to)`; only mounted while a history, import or search view is open. It listens to `changes`, `days` and `purchases` within the range, one window at a time. Changing the window restarts it. As built: Spend's period (`periodPurchases`), the change log (`changes`) and Days' earlier month (`historyDays` and `historyRecords`, keyed `historyFor`, with `historyFailedFor`; `startDaysListener` takes an exclusive `to`, and `startRecordsListener` reads one listener per confirmed day of the window) each run while their screen, or a day opened from it, is open, and clear on leaving. Search runs on the decrypted window in memory.

*As first shipped (Issue 20), for `changes` only.* The window lives in the URL (`more=changeLog`, `logSpan` 30, 90 or 365 days, `logPage` the number of windows back, `logItem` an item id), so a reload or the back gesture lands on the same window. `useRunwaySync` reads it and runs one more effect, started only while the log is open and keyed on the span, page and item: `startChangesListener` (`store/listeners/changeListeners.ts`) queries `createdAt >= from`, `createdAt < to`, newest first, at most `MAX_WINDOW_CHANGES` (500), adding `itemIds array-contains` when an item is picked (the one composite index, `itemIds` ARRAY_CONTAINS + `createdAt` DESC; the item filter is a readable-id filter, the names are matched on the device). A window is `getChangeWindow(today, span, page)`: whole local days (an entry's `createdAt` is an instant, so the edges are local midnights, not UTC midnights, or an evening change west of UTC would fall outside today's window) ending at the end of today, `page` spans back. The slice keeps `changes`, `changesFor` (the window key the entries were read for, so a stale window is never shown as the new one) and `changesFailedFor`. Each snapshot is opened with a sequence guard; an entry whose sealed payload will not open is delivered as `isUnreadable` with its readable fields, so a decrypt failure shows one unreadable row and never an empty log, and a query failure sets `changesFailedFor` only (the plan stays open). Search covers the entries of the window in view. A row's "Planned and confirmed" chip goes to the earliest confirmed day on or after the change's `effectiveFrom` that was confirmed after the change was made, from the days already in the slice; the summary and "from" date are read from the entry, so the affected income days are not stored (`ChangeSealed` is still `{ summary, note }`). The starting point, level moves and applied what-ifs show as rows of their own kinds once they write entries. Rules are unchanged: `changes` stays create-only.

A listener whose collection errors sets `errors[key]` and `loaded[key]` to a failed state; screens show a loading or failed state, never "none", for any count fed by it.

### Actions

Thunks in `store/actions/`, by what can race:

| Action | Primitive |
|---|---|
| change a plan item (new version, change entry, header on first create) | `writeBatch` of new documents, no reads |
| confirm a day | `runTransaction`: read the day, abort if it is not a draft, if its override changed since the person looked, or if a hold in its draft is unresolved, then write the day update (or create the day) and the `proposed` and `confirmed` records; sets `dirtyFrom` (with `updatedAt`) in the same transaction if the day is in a closed month |
| correct a day | `runTransaction` as above, writes a `correction` record |
| mark not arrived / undo | `runTransaction` on the day document |
| tick a checklist line | `updateDoc` with `arrayUnion` / `arrayRemove` on `doneLineIds` |
| mark a bill paid / undo | `runTransaction` that reads the plan, creates the move (a mark that exists and was undone is skipped to the next number) and sets `dirtyFrom` for a due date in a closed month |
| add, edit, remove a purchase | `runTransaction` that also sets `dirtyFrom` for the old and the new day when either is in a closed month; resolves spill-over against fresh balances |
| reconcile a purchase | `runTransaction` re-reading the purchase |
| set or move the starting day | `runTransaction` that reads the plan, writes the start moves and, when the day changed, `dirtyFrom` for both the old and the new day |
| rebuild closings | `runTransaction` per chunk of six closings: re-reads the plan, stops if its `updatedAt` moved, writes the closings and moves `dirtyFrom` forward ("Closings as built") |
| change the stance, planTogetherDays | `updateDoc` of those fields |
| move level | `runTransaction`: new tracking period, `trackingChange` move, `levelMove` change |
| apply a what-if | `writeBatch` |
| receipts | upload to Storage first, then create the document; delete removes the document, then the object |

Side effects that talk to a function (attach an account, unlink, delete the plan) run outside any transaction and report their own failure in the sheet that asked.

### Selectors

`createSelector` chains, memoized on the plan fingerprint and the relevant slices: `selectResolvedPlan(on)`, `selectComingDays`, `selectDraft(dayKey | group)`, `selectLookahead`, `selectBalances`, `selectEnvelopeFigure(id)` (the level decides "assigned", "left" or "safe to spend"), `selectFreeToSpend`, `selectOverAssigned`, `selectNeedsHome`, `selectLevel`, `selectPlanAsOf(date)`. A calendar-style view reads a prebuilt day-keyed map, never a per-cell filter.

### Level gating

**As first shipped (Issue 22).** `PlanDoc.trackingPeriods` is the one stored fact: `{ from, to }` date-only periods, oldest first, a plan without the field reading as Plan. `engine/level.ts` is pure (`getLevel`, `startTrackingPeriod`, `stopTrackingPeriod`, `getEarliestTrackingStart`): a period opens only while none is open and no earlier than the day after the last one ended, and closes no earlier than it began, so periods never overlap; every failure is a readable sentence that says another device probably changed it. `moveToTrack` and `moveToPlan` (`planActions.ts`) are one `runTransaction` each that reads the plan fresh, so a device still showing the old level is refused, not applied twice. Moving up writes the new periods list and `startDate` on the plan, one `start` move per holding as of that day (the moves of Issue 17, now also `holding: 'envelope'`, and the plan's start moves count from the plan's `startDate`, so tracking begins a fresh base, and an earlier base stays in the ledger), one `trackingChange` move (`SealedTrackingChange { direction: 'up' | 'down' }`, id `tracking_<yyyymmdd>_<createdAt>`, `refId` null) and a `levelMove` change ("Started tracking from …"); moving down closes the period (the last day it counted is today), writes a `trackingChange` move and a `levelMove` change, and deletes nothing. The starting amounts are prefilled from the plan's own figures as they stood at the start of the chosen day (`deriveBalancesBefore` over `selectBalanceInputs`), because a start dated that day adds the days that arrive and the bills paid from it on top, and prefilling today's current figures would count them twice; the day cannot be earlier than the plan's own `startDate`, whose base is where the ledger begins. Leaving with typed amounts or a changed day asks Keep editing / Discard. "Where is your money now?" (`LineUpScreen`, an overlay `Subview`) shows what is assigned beside the one money-on-hand total, "Over-assigned $X" when assigned passes it, reusing `AmountList` from the starting-amounts sheet. Named accounts and the gap offer ("add what you spent since") arrive with accounts (Issue 52) and purchases (Issue 24); until then moving up again starts fresh from the chosen day. `selectLevel` (`levelSelectors.ts`) derives the level from `trackingPeriods`; `getLevelWords(level)` is the one function that words an envelope's figure (*assigned* at Plan, *left* at Track, and Free to spend's "Assigned to envelopes" row as "Left in envelopes"). Until purchases exist an envelope's left figure is its assigned figure. `LevelGate level='track'` draws its children only at Track; the Spend tab and Add purchase (Issue 24) sit behind it, and editing and removing a purchase arrive with Issue 25. The moves rules gain `trackingChange` (create-only; the id names the day and `createdAt`; its date must be the first or last day of the plan's newest period, read with `getAfter`, so it is written in the same commit as the periods), and a `start` move no longer looks its item up: a commit may make only 20 rules lookups, and a plan can start with more holdings than that. `firestore.indexes.json` is unchanged.

`selectLevel` derives Plan, Track or Link (*as built:* `LEVELS` is `['plan', 'track']`, so it derives Plan or Track; Link is not built yet). `LevelGate` is a wrapper that renders nothing for a feature above the current level, so nothing greyed out ever reaches the screen. Data for a hidden level is still listened to; only its UI is absent.

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
- **Lists at 5 and 50.** Envelopes, bills, goals and purchases are capped on the home screen, searchable from five rows (`RUNWAY_SEARCH_THRESHOLD`), and windowed in History.
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

`deleteRunwayPlan` (callable, `request.auth` required, no new secret) takes `{ phrase }`. It refuses, with a readable message, a wrong phrase (`invalid-argument`) and a sign-in older than five minutes (`auth_time`, `failed-precondition` with `details.reason: 'recent-sign-in'`; the client signs in again with Google and retries). The uid is always the caller's, so nobody can delete another person's plan. It removes, in this order: every document under every collection below `apps/runway/plans/{uid}` (children before parents, in chunks, found by listing, so it needs no list of collection names), the plan document last of the plan tree, then the `apps/runway/server/{uid}` tree (the wrapped data key) and the objects under `apps/runway/receipts/{uid}/`. An interrupted run leaves the plan document in place when children remain and can be run again; a re-run on a plan that is already gone answers `{ deleted: 0 }` exactly as for a plan that never existed, and a failed run says so and asks to run it again. It returns the number of documents that really existed. With the wrapped key gone, nothing sealed under it can be opened again; a plan made afterwards gets a new random key. Links and grants, and receipt images, do not exist yet: the receipt prefix is already listed (it is empty) and the Link and Receipts issues extend this function to revoke links and clear their documents. The shared `apps/runway/usage/{uid}` record is not part of the plan and is left to the usage system, so `findFirstActivityAt` returns `null` for a deleted plan while the usage record keeps its date. `verifyRunwayKeys` checks master-key canaries only and is unaffected.

The client keeps its listeners running through the delete, so the device's own copy drops what the server removes, waits (up to five seconds) until they report the plan gone, then clears the plan's Redux state and the cached key and reopens, which creates the new key and an empty plan (the first-run screen).

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

Measured in Issue 27 on the scale seed: `npm run seed:runway-scale`, signed in as Morgan. It holds five years of Track: three sources and three pay lines, 25 envelopes, 60 bills, 12 goals (103 items), 600 versions and their change entries, 311 confirmed days with 622 records, 1,449 moves (1,440 bills marked paid) and 25,000 purchases, about 28,700 documents sealed the way the app seals them. Chromium at 390 px, the CPU throttled 4× with `Emulation.setCPUThrottlingRate`, the dev build against the emulators, the median of the warm runs (the first run after a browser start is 2 s slower). The dev build adds React's development checks and Redux Toolkit's state checks (a 33 to 83 ms warning on the biggest dispatches), which the production build does not run; no production build was measured, because the fixture sign-in exists only in dev.

| What | Before | After | Target |
|---|---|---|---|
| Cold start to the first useful screen (Home's Free to spend) | 8.6 to 8.7 s | 6.8 to 7.1 s | 1.5 s |
| A draft recomputed (one income day, nothing cached) | 27.6 ms | 8.4 ms | 30 ms |
| The lookahead (62 income days, 60 bills, 25 envelopes) | 1,530 ms on the first paint | 480 ms, after the first paint | n/a |
| Balances summed, bill progress, what goals hold | 28.7, 22.6, 18.7 ms | 3.2, 1.0, 1.0 ms | n/a |
| Preview of a change (26 days, then its lookahead) | 1,738 ms, 1,452 ms | 504 ms, 495 ms | n/a |
| Tab switches (Home, Days, Spend, Plan) | 67 to 271 ms | 67 to 287 ms | 1 s |
| Plan: Bills (60 rows), Envelopes (25), Goals (12) | 805 / 359 / 172 ms | 485 to 504 / 354 / 143 to 189 ms | 1 s |
| Spend: search over the window (2,465 rows) | 168 ms | 143 ms | n/a |
| Change log: window change, 3 months / a year | 138 / 264 to 315 ms | 127 to 149 / 253 to 306 ms | 300 ms |
| Add a purchase until the figures show it | 3.9 s | 3.8 s | n/a |

No "Maximum update depth" and no render storm appeared on any tab, section or full screen (the only console lines are the dev-only state-check warnings above).

**What the numbers settled.**

- **A draft and the lookahead.** A draft is 8 ms and the lookahead, which walks every income day of the year ahead once, is 480 ms; a worker is not needed (Open question 5). What made them slow was not the draft but `planBillPayments`: a bill that began five years ago listed 72 payments and asked every income day whether it fell in each payment's window, once per walked day. It now cuts a window with a binary search, never lists payments before the first income day it is asked for, and the dates a schedule produces are kept by what names them. The lookahead is drawn after the screen has painted (`useDeferredLookahead`), so Home and Days no longer wait for it.
- **What a plan is wrong by without closings.** Home and Free to spend read the last 180 days of days, moves and purchases. On the scale plan every one of the 25 envelopes' "left" differs from the five-year ledger, and Free to spend reads $13,753.59 where the ledger says $69,400.65 (money on hand $9,778.51 against $186,297.39: $49,200 of the $494,400 that arrived, $19,712 of the $203,057 spent and $31,709 of the $117,046 paid to bills are counted). The Spend list opens on the current month; any older month is read on demand from its period pill.
- **Why the window cannot simply grow.** With the window at the whole plan, no useful screen came within 150 s even unthrottled: the first snapshots took 35 to 41 s, and then the 311 per-day record listeners failed with Listen stream errors. The cost is per document, about 1 ms each at 4× through the Firestore client and the decrypt (decrypting 2,464 purchases alone is 0.5 s at 4×), so 25,000 purchases would be over 25 s at 4× before anything else. A purchase added to a 2,465-row window takes 1.9 s at 4× to show, most of it spent inside the Firestore client keeping the query's documents in order.
- **Closings are needed (Open question 2).** The same cold start with a 30-day window, which is what a closing leaves to load, is 2.9 to 3.1 s against 6.8 to 6.9 s for 180 days. With 103 versions it is 2.5 to 2.6 s: the floor is the key (1.3 s), the 103 items and the month's documents, and 1.5 s is not reachable on the dev build at 4× even with nothing else loaded.
- **Versions (Open question 6).** Each version costs about 1.2 ms at 4×: with a 30-day window the first screen is 2.5 s at 103 versions, 3.0 s at 600 and 4.7 s at 2,000. The 2,000 versions this document first assumed for five years cost 2.2 s more than 103; a plan snapshot is not built now and is worth building when a real plan reaches about 1,500.
- **Listeners.** Each listener keeps what it opened (`createSealedReader`), so a snapshot that changes one document opens that one: the second snapshot after a write dropped from 302 to 107 ms. One listener per confirmed day reads the records, so the wait between the ledger and the first screen is 0.8 s with 5 confirmed days and 2.5 s with 31 (about 70 ms a day at 4×); closings cut it to the month's days.

**Rules that keep it fast.**

- **Selectors** are memoized on their slices; a keystroke in a form recomputes only the drafts of the days the preview shows, and a draft's cache key names each bill's progress by a hash kept per progress object, not by the lists behind it.
- **Sums and groupings** are one pass into a map or object, never a spread per entry (balances, what days gave each item, bill progress).
- **Long lists mount in chunks** of 12 rows under `LazyMount` with `defer-offscreen` (the 60 bills); lists that stay under about 30 rows draw whole.
- **Formatters** (`Intl.NumberFormat`, the date formatters) are built once; `formatDateUTC` was building one per call and was 155 ms of the Bills tab.
- **After closings (Issue 28).** Cold start of the five-year plan with its closings, to the first Home with its figures, dev build, three to four loads each: at 4× throttle 2.9 to 3.4 s against 7.2 to 8.7 s on the 180-day window before (the first load of a session is the slow end of each); unthrottled 1.26 to 1.36 s against 2.15 to 2.37 s. The dev build's 3.5 s target at 4× is met; the unthrottled figure is under the 1.5 s the issue first asked for. Every figure on that plan (Free to spend, money on hand, paid and spent, all 25 envelopes' left and all 12 goals' holdings) equals the five-year ledger summed on its own (a script reading every document through the emulator) after the first build, after a purchase from three months back was edited, after a payment from that time was undone and marked again (which writes `…_2`) and after the starting day was moved 100 days later. A closing is about 150 KB at the end of five years (60 bills, 12 goals), so a plan stays far under the 1 MiB limit; the first build writes sixty of them, 4.5 MB in all, six to a transaction.
- **Production build and the history window (Issue 77).** Same plan with closings built, Chromium at 390 px, five loads each after one warm-up, in the cloud sandbox (slower than Issue 28's machine: `main` measured 2.2 s unthrottled and 5.3 s at 4× on the dev build there, against 1.3 s and 3.4 s before). Cold start to Home's figures on the production build (`vite build`, `vite preview`): 1.37 s median unthrottled (1.33 to 1.74 s), under the 1.5 s target, and 3.83 s at 4×. The dev build with the window was 2.1 s unthrottled and 5.7 s at 4×, the same as `main` there, so the window adds nothing to the first screen (it is read only while an earlier month is open). Changing the Days window to another month: 163 to 197 ms unthrottled on the production build, under the 300 ms target, and 583 to 688 ms at 4×, most of it the one records listener per confirmed day of the month (about 70 ms a day at 4×, as above).
- **Scale seed.** `scripts/seeds/runwayScale.ts` writes the plan above and nothing else of Runway's, shaped like a plan written before closings (no `dirtyFrom`), so the first open builds them; `RUNWAY_SCALE_CLOSINGS=1` writes them too. `RUNWAY_SCALE_VERSIONS=2000` writes 2,000 versions, the volume this document first assumed. Extend it whenever a list is added.

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

Per the project instruction to keep `copilot-instructions.md` current, these follow from this design. Made in the polish PR (the owner's list, applied as written unless noted):

1. **New-app checklist, Release line:** replaced "bump `SITE_VERSION`" with the label rule (never edit `SITE_VERSION`; one `patch` or `minor` label). Made.
2. **One PWA:** the checklist says the site installs as one PWA and an app has no manifest of its own. Made.
3. **Sealed payloads:** a document may carry one `sealed` payload beside readable fields, the key held by a callable and never persisted, a sealed payload gaining a field only in the change that reads it. Made in "Data and app patterns".
4. **Append-only and deterministic ids:** rules deny `update`/`delete`, a duplicate create fails by id, corrections are new records. Made.
5. **Shared security lib:** note `encryptBytes`/`decryptBytes` once they exist. **Held for Issue 47** (receipts, a Next Steps issue), which adds them: writing the note is one of that issue's success criteria.
6. **Functions and secrets:** a secret an issue binds must exist in production before merge, and `functions/README.md` mirrors `index.ts`. Already stated in "Documentation quality" and "Cloud Functions"; nothing added.
7. **Shared primitives:** a component with no app entities goes in `src/components` from its first use. Already stated; `AmountField` and `BeforeAfterRow` are now named as examples.
8. **Terminology:** "mini-app" is "app" in prose in `CLAUDE.md` and `copilot-instructions.md`, "New mini-app checklist" is "New app checklist", paths under `src/apps/<name>/` are unchanged, and "beta" is defined once, as an access-gated app. Made. The `build-app-mvp` skill keeps its name.
9. **`.github/instructions/runway.instructions.md` and `.claude/rules/runway.md`:** the restrained tone exception, the level-gating rule (hidden, not disabled) and the sealed-document rule were written in Issue 2 and extended since. The owner confirmed the tone exception.
10. **The `plan-mdd-app` skill (was `plan-mini-app`)** (UX phase as a canvas plus a short `UX.md` with no Mermaid; the hidden-not-disabled checklist item; the roadmap preamble's two closing checks using the label rule; a sealed payload gaining a field only in the issue that uses it; its description "Plan an app for the Moondreams Dev Apps repo"): the four rules were already in the skill; its description and its prose now say "app". The skill lives outside this repository (in the owner's skills) and is renamed `plan-mdd-app`, by the owner's choice.

---

## Open questions for the roadmap

Each becomes a spike or a decision in the Issue Roadmap rather than blocking it.

1. **Destruction delay and Google checks. OPEN until the operator records outcomes.** Settled in the repo by Issue 26: the runbook ("Runway: master keyring protection runbook" in `functions/README.md`) holds the exact commands and checklists for the 90-day delay, the IAM audit, the three deny-policy questions and their three recordable outcomes (in place, impossible with compensating controls, deferred), the three alerts with their filters and how to test each, the escrow procedure and the recovery drill, and `scripts/runway/drillKeyring.ts` is the drill's helper (tested against the emulator only). Escrow is settled (a password manager vault and a separate secure cloud account, one holder); revisit a second holder if anyone else ever has a stake in the data. **Not settled, because none of it can be run from the repo's sandbox:** that Secret Manager is deny-supported and the project can hold a deny policy, whether Owner bypasses it, that each alert fires and its email arrives, that the 26-hour absence window is accepted by Cloud Monitoring (its documented maximum for an absence condition may be shorter than the daily cadence, in which case the runbook lists the alternatives to choose from), that the audit filter's method names match the real entries, and that an escrow copy restores a test plan. This question is closed only when every row of the operator record below is filled in by the owner, and the outcome of the deny policy is stated in "Master secret management" item 3 in place of "Not yet verified".

   **Operator record** (filled in by the owner from the runbook's record table; empty means not done):

   | Item | Done? | Date | Result |
   | --- | --- | --- | --- |
   | Each of the three alerts fired in a scratch project and the email arrived | | | |
   | Each of the three alerts fired in the real project and the email arrived | | | |
   | 26-hour heartbeat window: option chosen | | | |
   | Recovery drill from escrow alone (duration, unclear points) | | | |
   | Deny policy outcome: in place / impossible with compensating controls / deferred | | | |
   | `--version-destroy-ttl=90d` set, no expiry, IAM audited | | | |

2. **Closings (Decision 7). SETTLED by Issue 27, BUILT by Issue 28.** Issue 27 showed both reasons: without closings the figures are wrong past 180 days (Free to spend $13,753.59 against $69,400.65; every envelope's "left" differs), and the window cannot be widened to fix it. Issue 28 built them as "Closings as built" (under "Balances and closings"): a closing carries every figure the first screen reads (balances, what each item was given, spending, and each bill's funded days and paid payments), the three recent listeners and the lookahead's late-bill check follow the newest closing, building them is one resumable pass shown as "Updating your history", and the Spend list and its note follow the window. Measured on the scale plan: the cold start went from 7.2 to 7.3 s to 2.9 to 3.1 s at 4× on the dev build ("Performance", below); the first build of sixty months took 25 s unthrottled and 50 s at 4×, once, so it is slower than the 7 s (unthrottled) Issue 27 estimated: it reads 28,000 documents from the server at about a millisecond each; it was not tuned further.

3. **Plaid access.** Plaid is the provider. Confirm production access (it may need an application and lead time), pricing per linked account, coverage of the accounts in the UX (checking, savings, cash management such as Wealthfront) and whether its investments product covers retirement and brokerage accounts.
4. **CSV parsing.** Pick a parser already in the repo's dependencies if one exists; otherwise a small streaming one; handle the common bank layouts and a manual column map.
5. **Engine in a worker. SETTLED by Issue 27: not built.** A draft is 8 ms and the lookahead 480 ms at 4× on the five-year plan, and the lookahead is drawn after the first paint. Revisit only if a screen has to wait for a figure of this size.
6. **Version volume. SETTLED by Issue 27: no plan snapshot yet.** Versions cost about 1.2 ms each at 4× on the first screen: 0.6 s at the 600 of the scale seed, 2.2 s at 2,000. It is built when a real plan reaches about 1,500 versions (a sealed resolved plan on a date replaces the versions before it).
7. **Where reconcile runs.** Planned: the device does all matching through the Core MVP and Next Steps up to Link; a server pass and notifications follow ("Server-side Reconcile and Notifications"). Open inside that: how the engine is shared with Functions, decided in its spike.
8. **Testing home.** Confirm `scripts/checks/` plus the emulator for rules is the right place; if the repo has a unit-test runner, move the engine tests there.
9. **Gross-to-net and loans in the schema.** The fields exist in the sealed payloads now so Next Steps needs no migration; their engine code ships with those issues.
10. **Succession.** Who the second Owner and escrow holder is, and whether the optional keyring split is wanted. Decided before the "Succession" issue, which is not in the MVP.

## Round 4, package C: screens

- **Things to fix** is a `DetailSheet` driven by the `fixes` URL param (`useRunwayUrlState`). A row that opens an income day calls `keepEntryFor('fixes')` first: the sheet's layer is about to close and the day would take its history entry, so a plain entry is pushed to keep it and Back lands on the open list. `sortProblems` orders the list and the summary row, so both name the same first problem.
- **Why History was empty from an income day.** `RunwayPage` checked the open income day before the change log, Check an amount and the other screens, so a screen opened from a day was set in the URL but never drawn until the day closed. The day is now checked last, and Check an amount calls `keepEntryFor('day')` so Back returns to the day. *Round 4:* an item's History (`ItemHistoryView`, its own listener over a year) and Purchases (`ItemPurchasesView`, this month from the slices already loaded) are views inside `ItemSheet`, so they leave the URL and the day alone; a purchase opened from there is `PurchaseScreen` with an `onOpen`, and the purchase sheet on the Spend tab keeps its form over it so the browser's back returns to the purchase.
- **Spend by period.** `periodPurchases` and `periodFor` in the slice hold the purchases of the chosen period, read by `startPurchasesListener(..., to)` (a single-field range, no index) from `useRunwaySync` only while the Spend tab is open. `selectSpendPurchases` is the recent window plus the period's purchases, so a purchase from an older month opens and edits like any other. `utils/spendPeriod.ts` turns a period into its days. Months older than the plan's start are not offered.

## Round 4, package D: private amounts

- **Where the provider sits.** `RunwayPage` wraps everything it draws in `ValuesHiddenProvider scopeId='runway'` (one outer wrapper, the page body is `RunwayContent`), so the five-minute re-hide also runs while a subview is open. The choice is `values-hidden:runway:<uid>` in `localStorage`, hidden unless it says `shown`, on this device only. `RunwayTabs` draws the eye (`ValuesEyeButton`) on the title line of every tab, so one tap shows or hides every tab.
- **What is masked.** Every figure in Runway, on every surface, except the field being typed in (the open question's hero or field). Rows go through `ItemRow` (the figure, every amount in its detail line and its accessible name; `isPrivate` is on unless a row lists the person's own answers), sheets through `SheetHead` (figure, suffix, fact and a text help), and loose lines through `MaskedText` (nodes) or `useMaskedText` / `maskFigures` (strings, aria-labels, a confirm's message); `utils/maskText.ts` owns the one pattern: an amount, a range as one, and the "short", "over" or "left" that follows it. Nothing beside a hidden figure may give away its sign or size: no over/left word, no refund wording (`getPurchaseTitle` and `PurchaseRow` drop "Refund to" while hidden), no warning colour keyed to the value, and Check an amount and the goal chart say "Show amounts" instead of drawing a result or a line drawn to scale. *Round 7, G9:* while hidden, a plan-level warning says neither its figure nor its item names: the Home warning row, Things to fix, an effect preview's warning, an income day's held-item footer note and a purchase form's "would be over" line are each one `NeedsALookRow` ("Something needs a look" over "Show amounts to see it", a tap that shows amounts), and a Days card's short line, an income day's "Not fully funded" divider (open and confirmed) and a short or held row's detail (`DraftLine`, its sheet's fact line, `RecordLineRow`) read "Needs a look". While hidden, a row's accessible name drops the amount ("Rent. Amount hidden. Open") and the mask reads "Hidden amount". The mask is the same "••••" in the muted colour for every figure, so it gives away neither size, sign nor colour. Every sheet, screen or subview carries the one `ValuesEyeButton` on its title line (`FormSheet` and `DetailSheet` `actions`, `Subview` `headerAction`), and the button draws itself only while its own surface (the nearest dialog, subview card or page) holds a `[data-sensitive]` node: `SensitiveValue` and `MaskedText` carry it, and a text that drops its figure while hidden (a problem row, Check an amount's result, the goal chart) marks its wrapper by hand. Starting out's subview carries the eye too (`StartFlow`), since its lists are masked.
- **What is never masked.** Only the field being typed in: the open question's hero or field. *Round 7, G9:* a form's own answers are masked once folded: the add and change forms' summary rows (`utils/maskSummaries`, which wraps every summary holding an amount in `MaskedText` and masks its accessible name) and footer notes, Confirm money arrived's and Correct a day's notices, footer reasons, "Left from this day" and before/after rows (`BeforeAfterRow isPrivate`), the item lists in Correct a day and a purchase's split (`LineAmountList`), and Starting out's lists, amounts and next income day (`SummaryEditor summaryNode` for the amounts already entered).
- **Every short line is a problem.** `lookahead` returns one `short` problem for each line of a day that goes unfunded (a Must, or a bill due before the next income day), each carrying its `tier`; problems sort by date, then kind, then priority, then name, so the summary row's count and the "Things to fix" list are the same number. `shortByDay` keeps the first line of each day for the Days row.

**Round 4 review fixes (screens).** `groupProblems` (`utils/lookaheadText.ts`) folds the lookahead's problems into one group per income day plus single groups for problems with no day; the summary row, the list rows and the cap (`FIX_ROWS_SHOWN`, 12) all count groups. `periodPurchases` is cleared when Spend closes (`clearPeriodPurchases`), a period read error sets `periodFailedFor` and Spend alone says so (the key status is untouched), and `useRunwaySync` takes `today` from one ticking `useNow`. An item's history is read by `hooks/useItemChanges` and says when it stops at its window. A purchase's Edit calls `keepEntryFor('purchase')` and swaps the form in for the sheet, so the browser's back lands on the purchase; one extra plain history entry remains behind it. `ValuesEyeButton` has one fixed label; `ItemRow` masks the amounts inside a detail line itself (round 5: every row masks; only a row listing the person's own answers sets `isPrivate={false}`).

## Round 4, package G4

- **`FloatingAction`** (`src/components/FloatingAction.tsx`) is fixed above `[data-bottom-bar]` (the tab bar sets it; the pill reads its height) or the safe area, lined up with the page's `max-w-4xl` column. It is hidden while `html[data-subview-open]` is set or `hasDialogOnTop()` is true, watched by a `MutationObserver`, and renders a 48px spacer in the flow so the last row scrolls clear of it. The label collapses to the icon after scrolling down 96px and returns on any scroll up.
- **The starting-amounts window is UI-only.** `utils/startingCorrection.ts` (`canChangeStart`) decides whether Free to spend draws "Change what you started with": no confirmed day on or after the start day, and now within 14 days of the first start record's `createdAt`. Nothing refuses the write: `StartingAmountsSheet` and the rules are unchanged, so the door going away is not a guard. Cases are in `scripts/checks/runwayStartCorrection.ts`.
- **Free to spend's sum** reads `selectBalances` (`moneyOnHandCents` less the three assigned totals), the same figures as the card above it; the result row shows `−$x` inside a `SensitiveValue` when over-assigned, so its label never changes with the sign.
- **Spend's filter** keeps the chosen envelope only in the URL (`spendEnvelope`); the drawer's history step adopts the current address when it closes by its own control, so a pick survives the close and Back leaves the tab, not the pick.
- **A goal's series** is `utils/goalSeries.ts` (`getGoalSeries`, cases in `scripts/checks/runwayGoalSeries.ts`), fed by `hooks/useGoalSeries.ts`: confirmed days' effective splits for the goal by arrival day, the first point carrying whatever the closing base held before the days read so the last point always equals `selectHeldByItem`, and `planGoalContributions` for the days ahead (none for a paused, stopped or "whatever is left" goal). `TrendLineChart` now accepts `y: number | null` so the projection can cover days the main line does not.
- **Free to spend and Check an amount** are one `Subview`: `FreeToSpendScreen` shows `CheckAmountBody` while `view=checkAmount`, with the title and back step swapped (`closeCheckAmount` returns to `view=freeToSpend`), so the card and the hidden site header stay mounted across the swap.
- **Settings, Tracking, Line up and Delete your plan** are stacked, not swapped: Settings stays mounted and Tracking and Delete your plan are `overlay` subviews over it (Line up over Tracking), each with its own history entry, so the back gesture and Escape step out one layer. Swapping one `Subview` for another unmounted the layer below, and one Back closed both.
- **Starting out hands off to an income day** by clearing `view` and setting `day` in the same tick (both `replace`), so the day's card is mounted before the Starting out card leaves and no frame shows the page between them.
- **Check an amount** folds an envelope that is already chosen (opened from its sheet) into one summary row; the row swaps the body for the choices ("Which envelope?") and takes its own back step with `useBackStep`.

## Round 5, package G6

- **Twice a month's day lists** cap the listbox and Dreamer's inner scroller (`max-h-48!` plus `[&_[data-scroll-area-viewport]]:max-h-48!`) and open upward (`bottom-full!`), so every row sits inside the list's own box and the box inside the viewport at 320x568, 390x844 and 1280x900.
- **The add pill** (`FloatingAction`) is always drawn while no sheet or subview is open, like a bank app's floating action: it may sit over a row mid-list, and every page ends in a spacer of its height plus a gap, so the last row and its chevron scroll clear of it. Hiding it at rest when it overlaps a row was tried and dropped: on a long page the tab's one add action vanished.
- **`canChangeStart`** returns false for a start date with no start record in hand (the Free to spend screen waits for the ledger before asking).
- **The goal chart** leaves a strip above the plot for the readout (`isReadoutAbove`) and names the guide line on the soft look (`referenceLabelSoft`); its height follows the viewport.
- **"Pay these first"** swaps into the "Paid first from {source}" sheet in place of the list (the form stays mounted, hidden), led by `BackLink`; the rows write through `ValueChangeHandle`, which hands the form field's change callback to the sheet.
