# Going Once: Technical Design

> App id `going-once` (🔨). Data, state and security boundaries only. Words follow PRODUCT.md: a **sale** holds **things**; the **seller** owns it, **co-sellers** help; the private floor is the **floor price**; a buyer's message is an **inquiry**.

## Decisions this design makes

- **Co-sellers join by email, Waypoint's way.** The seller adds an email; when that person opens Going Once signed in with that verified email, the app joins them by writing themselves into `members` and deleting the invite in one commit (Waypoint's `emailInvites` + `isTripEmailInviteJoinValid` shape). No accept step and no pending-request collection: the seller's Add is the consent. No email is sent.
- **The app route is open to any signed-in person (Waypoint's shape, not a `ProtectedRoute appId`)**, so a co-seller never needs an access grant; who may *start* a sale is a server-enforced feature switch, `create-sales` (see "For the owner" in the hand-off).
- **The public page is live, not a snapshot** (the documented exception to `security-privacy.md` "A share is a snapshot unless it says otherwise"; product asks for it). A function reads the sale and its things with the admin SDK on every call and runs each through an allowlist. Only photos are copied out.
- **One stored file per photo; public copies made by a trigger.** Each photo is uploaded once at the shared `listing` size. A trigger keeps a folder named by the public link equal to what the page shows (480px and 1,280px WebP copies) and deletes copies of anything that stops showing. Visitors never receive the listing-size file.
- **Signed-out interest is written by a callable** with field caps, 100 a day per sale, 40 per thing, a per-instance IP throttle, a honeypot and a deterministic id. No CAPTCHA.
- **Save all photos is a zip built by a function** from Available and Pending things, streamed into Storage.
- **Inquiry pushes are bundled, never capped or dropped** (owner, round 2): at most one push per person per 15 minutes, summarising what came in since the last; nothing 22:00–08:00 in the sale's zone, and what came in overnight arrives as one push at 08:00. On by default for the seller and every co-seller, off per person per sale. The lock screen names the thing only, never a buyer's name, message or contact. The window is a new shared, app-agnostic piece (`functions/src/notifications/bundledPush.ts` with a central `pushBundles` collection), because "a person is waiting on you" pushes in other apps want the same rule.
- **Finishing a sale** turns its public link off and schedules buyer contact details to be cleared 30 days later by a daily function.

## Data Schema

All app data under `apps/going-once/…`. Exceptions, deliberately not app-scoped: `users/{uid}` (names and photos for "marked by Theo"), `apps/{appId}/usage` (shared usage records), the site's device tokens read by `sendPushToUsers`, `featureGates/going-once`, and the new central `pushBundles/{appId}_{uid}` (see "Inquiry push"; admin SDK only, no client rule). The shared push budget (`apps/{appId}/pushBudget`) is not used: inquiry pushes don't go through `sendBudgetedPush`. Every field is `T | null` with an explicit `null`, arrays default `[]`, money is integer cents, times are millisecond numbers.

### `apps/going-once/sales/{saleId}` (the container)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `generateUuid` |
| `name` | `string` | "Fall clear-out"; public |
| `pickupArea` | `string \| null` | An area, never an address; public |
| `buyerNote` | `string \| null` | Public |
| `currency` | `'USD'` | Closed for now; read with a fallback |
| `timeZone` | `string` | The seller's IANA zone at create; the push quiet hours use it |
| `status` | `SaleStatus = 'OPEN' \| 'FINISHED'` | |
| `finishedAt`, `finishedBy` | `number \| null`, `string \| null` | |
| `contactsClearAt` | `number \| null` | `finishedAt + 30 days`; `null` while open and once cleared |
| `contactsClearedAt` | `number \| null` | When the purge finished |
| `ownerUid` | `string` | Immutable; the seller |
| `createdBy` | `string` | Immutable, equals `ownerUid` |
| `members` | `string[]` | Seller plus co-sellers; every rule keys off it |
| `memberJoinedAt` | `Record<string, number>` | Own key written on join |
| `publicLinkId`, `publicLinkChangedAt` | `string \| null`, `number \| null` | Functions only |
| `createdAt`, `lastEditedAt` | `number`, `number \| null` | |

`members: string[]` with `ownerUid` (Nine Lives' shape) rather than Waypoint's role map: two roles, so `uid in members` is membership and `uid == ownerUid` is the seller. No `inviteCode`: joining is by email.

### `apps/going-once/emailInvites/{saleId}_{emailLower}`

`{ saleId, email, invitedBy, saleName, inviterName, createdAt }` (`email` is lowercased). The names are copied in so the invitee never reads the sale before joining. Created and deleted by the seller; read by the invitee (their verified token email matches `email`) and members; deleted by the invitee in the join commit. The composite id means one invite per email per sale.

### `apps/going-once/sales/{saleId}/items/{itemId}` (a thing)

| Field | Type | Public? |
|---|---|---|
| `id`, `saleId` | `string` | id only, as an opaque key |
| `title` | `string` | yes |
| `description`, `brandModel`, `size` | `string \| null` | yes |
| `condition` | `ItemCondition \| null` = `'NEW' \| 'LIKE_NEW' \| 'GOOD' \| 'FAIR' \| 'WELL_USED'` | yes |
| `askingPriceCents` | `number \| null` | yes; `0` is Free, `null` is no price yet |
| `originalPriceCents` | `number \| null` | only when `showOriginalPrice` |
| `showOriginalPrice` | `boolean` | no |
| `floorPriceCents` | `number \| null` | never |
| `boughtFrom` | `string \| null` | never |
| `boughtUrl` | `string \| null` | never; the store's page, an `https` link checked with `isValidHttpUrl` |
| `boughtUrlPreview` | `LinkPreview \| null` (`@/lib/linkMetadata/types`) | never; title, site, image URL and `fetchedAt` from `LinkAttachField`'s lookup |
| `boughtOn` | `number \| null` | date-only (UTC midnight); never |
| `notes` | `string \| null` | never |
| `photos` | `ItemPhoto[]` | through the public copies only |
| `status` | `ItemStatus = 'AVAILABLE' \| 'PENDING' \| 'SOLD' \| 'WITHDRAWN'` | only AVAILABLE / PENDING things are served |
| `pending` | `ItemPendingRecord \| null` | never |
| `sale` | `ItemSaleRecord \| null` | never |
| `statusHistory` | `StatusChange[]` | never |
| `listingCopiedAt`, `listingCopiedBy` | `number \| null`, `string \| null` | never; set by Copy listing text, read by Mark sold's "Take that listing down too" line |
| `createdBy`, `createdAt`, `lastEditedAt`, `lastEditedBy` | | never |

- `ItemPhoto = { id; path; width; height; sizeBytes; createdAt }`. Array order is display order; index 0 is the cover. **Up to 12 per thing**, enforced in the client, the trigger (copies only the first 12) and the zip.
- `ItemPendingRecord = { inquiryId: string | null; buyerName: string | null; pickupOn: number | null; markedBy: string; markedAt: number }`. `buyerName` is a typed name, optional, or the inquiry's name copied in; `pickupOn` is date-only. Cleared on Back to Available and on Sold.
- `ItemSaleRecord = { priceCents: number; method: PaymentMethod | null; soldOn: number; buyerName: string | null; markedBy: string; markedAt: number }`, `PaymentMethod = 'CASH' | 'VENMO' | 'ZELLE' | 'OTHER'`, `soldOn` date-only. Cleared by Not sold after all.
- `StatusChange = { kind: StatusChangeKind; status: ItemStatus; byUid: string; at: number; priceCents: number | null; fromPriceCents: number | null; buyerName: string | null; pickupOn: number | null }`, appended in the status transaction, last 50 kept. `kind` is the act that wrote it (`MARK_PENDING`, `CHANGE_HOLD`, `BACK_TO_AVAILABLE`, `MARK_SOLD`, `CHANGE_PAID`, `NOT_SOLD`, `RESTORE_SALE`, `TAKE_OFF`, `PUT_BACK`); `status` is the status after the change; `priceCents` is what was paid on a sale; `fromPriceCents` is the figure a correction replaced ("$170 → $160") or a Not sold after all undid ("Sale of $170 undone"); `buyerName` and `pickupOn` are the hold a Mark pending or a changed hold wrote ("Held for Priya · pickup Sat"). A thing's history rows are described from these alone (`describeStatusChange`). `toItem` reads every entry with each key present and gives an older entry its `kind` from its status.
- `buyerName` on these records and on `statusHistory` entries is a buyer's personal data, so the 30-day purge clears it too.
- **Not listed yet** is derived, never stored: `isListable(item) = photos.length > 0 && title !== '' && askingPriceCents !== null`. One pure helper in `utils/`, mirrored in the functions (they can't import `src/`); a check script fails on drift, like `scripts/checks/pinchShare.ts`.
- **Sold under your floor price** is derived at render.
- Unions in `types.ts`; option lists and labels (`CONDITION_OPTIONS`, `STATUS_LABELS`, `PAYMENT_METHOD_OPTIONS`) in `constants.ts`. Every switch over `ItemStatus` has a default branch.

### `apps/going-once/sales/{saleId}/inquiries/{inquiryId}`

| Field | Type |
|---|---|
| `id` | `string`: 26 chars of base32 SHA-256(`itemId` + normalized contact) |
| `saleId`, `itemId` | `string` |
| `itemTitleAtSend` | `string` (still reads if the thing is renamed) |
| `name` | `string \| null` (≤ 80; `null` once cleared) |
| `email` | `string \| null` (≤ 254) |
| `phone` | `string \| null` (7–20 digits after stripping `+ ( ) - .` and spaces) |
| `message` | `string \| null` (≤ 1,000; `null` once cleared) |
| `status` | `InquiryStatus = 'NEW' \| 'HANDLED'` |
| `handledBy`, `handledAt` | `string \| null`, `number \| null` |
| `sendCount` | `number` |
| `createdAt`, `lastSentAt` | `number` |
| `contactClearedAt` | `number \| null` |

The buyer types one "Phone or email" field; the function reads it as an email when it has `@` and a dot after it, else as a phone, and stores the other as `null`. Created and resent only by `submitSaleInterest`: a resend from the same contact about the same thing replaces `message`, bumps `lastSentAt` and `sendCount`, and moves it back to `NEW`. Members update only `status`, `handledBy`, `handledAt`, and may delete. Deleting a thing never deletes its inquiries: they keep `itemTitleAtSend`, and the inbox shows "(No longer listed)" for an `itemId` no longer among the sale's things.

### `apps/going-once/people/{uid}` (per-person settings)

`{ inquiryPushOffSaleIds: string[] }`. One-line `request.auth.uid == uid` rule (`data-contracts.md` "Per-member private data"). Read by the push function with the admin SDK. Kept outside the sale so a co-seller's switch is theirs alone and needs no rule on the sale.

### Function-only documents (no client rule matches them)

- `apps/going-once/sales/{saleId}/limits/interest`: `{ dayKey: string, count: number }`, the sale's interest count for the current UTC day.
- `apps/going-once/publicLinks/{linkId}`: `{ id, saleId, createdBy, createdAt }`. `linkId` is 26 chars of `[2-9a-hj-np-z]` (130 bits) minted with `crypto.randomInt` (Pinch's `mintShareId`).

### Storage

| Path | Who | What |
|---|---|---|
| `apps/going-once/sales/{saleId}/items/{itemId}/{photoId}.jpg` | members read, create, delete; < 5 MB, `image/*`, name `^[A-Za-z0-9-]{8,40}[.]jpg$` | The one stored listing-size file |
| `apps/going-once/sales/{saleId}/exports/photos.zip` | members `get`; no client writes | Save all photos; replaced on each build |
| `apps/going-once/public/{linkId}/{itemId}/{photoId}-{s\|m}.webp` | anyone `get` on a path matching the id patterns; nobody `list` or writes | Public copies, each under its own download token |

### Shared image size

`src/utils/imageCompression.ts` gains `listing: { maxDimension: 2048, quality: 0.88, type: 'image/jpeg' }`; a use gains an optional output type (default WebP, as now). Listing photos are JPEG because they leave for camera rolls and Marketplace, where JPEG is accepted everywhere (whether Marketplace takes WebP is unverified). About 0.5–1.5 MB each, under `MAX_PHOTO_UPLOAD_BYTES`; the existing fallback ladder still applies. No app words in the util.

## State Machines & Logic

### Thing status

```
AVAILABLE ⇄ PENDING          (Mark pending writes `pending`; Change who or when rewrites it; Back to available clears it)
AVAILABLE | PENDING → SOLD   (writes `sale`, clears `pending`)
SOLD → AVAILABLE             (Not sold after all: clears `sale`; its Undo writes the same `sale` back)
AVAILABLE | PENDING → WITHDRAWN → AVAILABLE   (Take off the list / Put back on the list)
```

**Built in `store/actions/statusActions.ts`** (`changeStatus`, one function for the nine transitions: Mark pending, Change who or when, Back to available, Mark sold, Not sold after all, Restore sale, Take off the list, Put back on the list, Change what was paid). It checks `navigator.onLine` first and treats an `unavailable` error the same ("Changing the status needs a connection."); the name in a refusal is the first name from `users/{uid}` of whoever last appears in `statusHistory`, "You" for the person themselves and "Someone" for a profile that holds an email. Take off the list clears `pending`, so taking a held thing off ends the hold (the history keeps who held it); undoing it passes the hold back (`restorePending`) so a held thing returns held. **An Undo is tied to the act it undoes:** `changeStatus` answers `{ ok: true, at }` with the stamp of the history entry it wrote, and the Undo of a Take off, a Put back or a Not sold after all (`undoesAt`) is refused with the usual conflict sentence unless that entry is still the thing's last, so an Undo never rewinds someone else's later change. Not sold after all's Undo (`RESTORE_SALE`) writes back the exact sale record it cleared. Before the transaction a figure that is not a non-negative whole number of cents, or a day that is not a finite number (or `null`), is refused, and a correction that changes nothing (no sale, or the same price) writes nothing and adds no history entry. **No rules change:** members already update every field of a thing (only `createdAt`, `saleId`, `id` are fixed), and the co-seller delete clause already reads `sale` and `pending` by these names. The finished-sale check below joins the same transaction when the sale has a finished state; until then `changeStatus` has the one place to add it.

Each transition is one `runTransaction` that re-reads the thing and aborts with a readable message when the status it expected is gone ("Theo already marked this sold for $120", the name from `users`). It writes the new status, the record or its clearing, `lastEditedBy`/`At`, and appends to `statusHistory` from its own read (capped, so not `arrayUnion`). Correcting a sold price is its own transaction that aborts unless the thing is still `SOLD`, and changing a hold aborts unless it is still `PENDING`. A status change fails offline with a clear line, on purpose: the race it guards is two people promising one thing (`state-data.md` "A picker never writes").

**On a finished sale** the transaction also reads the sale: Mark sold, Not sold after all, Back to available, Take off the list and correcting a sold price still work (wrapping up what was promised); Mark pending is refused ("This sale is finished. Reopen it to hold things for buyers."). The client hides the action and the transaction is the check; the beta rules don't enforce it.

**After Mark sold**, when `listingCopiedAt` is set the drawer says "Take that listing down too" (the thing was copied out to relist elsewhere). Copy listing text writes `listingCopiedAt`/`listingCopiedBy` as a field-scoped `updateDoc` after the copy succeeds, never blocking it.

### Thing edits and photos

- Field edits save as the person goes with `updateDoc` of only that field (never `status`, `pending`, `sale`, `photos`, `statusHistory`).
- **Add a photo:** shrink with `usePhotoSetUploads` (the `listing` use of `compressImageForUse`), upload, then append the `ItemPhoto` in a transaction that refuses a 13th. Reorder and remove are transactions on `photos`; a removed photo's file is deleted after the commit, and an orphan is swept by the sale delete.
- A thing is created from its first answer (photo or name) with `title: ''` and `askingPriceCents: null`, so it starts Not listed yet.
- **Delete** (`deleteItem`) deletes the document first, then its photo files, best-effort (a failure is logged and the rest go on; an orphan is swept by the sale delete). The document write is not awaited, since offline it never settles: a refusal shows a toast and the thing comes back in the list. A photo added after the document is gone fails its transaction and deletes its own file.
- **Undo right after adding** (S9) deletes the thing and its photos. The seller can delete any thing; a co-seller can delete only a thing they created in the last 10 minutes that has no `sale` and no `pending` (a narrow rule). Deleting a thing never deletes its inquiries; they keep `itemTitleAtSend` and read "(No longer listed)".

### Inquiry

`NEW → HANDLED → NEW` (Back to New, or a resend reopens it). Handled is a field-scoped `updateDoc` that touches only its own control.

### Sale

```
OPEN → FINISHED   (seller; callable `finishSale`: turns the public link off, sets finishedAt and contactsClearAt)
FINISHED → OPEN   (seller; same callable: clears contactsClearAt if contacts are not yet cleared; the link stays off until turned on)
```

Contacts already cleared stay cleared after a reopen.

### Public link

`none → on → renewed → … → none`, seller only, through `changeSalePublicLink`.

### Totals

`selectStatusSummary` (a `createSelector` over the open sale's things, no second totals module) runs `getStatusSummary`, one pass bucketing by status: collected (sum of `sale.priceCents`), asked for those, pending count and asking, left count and asking, unpriced count. Withdrawn things are excluded everywhere; `floorPriceCents` is never summed. One formatter per figure shown twice (tile and footer line). The Things tab's pills and its totals line come from `getStatusSummary` in `utils/statusSummary.ts`: Available counts and sums only what is listed (a thing not listed yet waits behind its door, and a missing price is counted, "1 has no price yet"); the pills follow the search, the line under the rows never does (while a search is on it says "All pending ·"); "Collected $225 of $245 asked" is `formatCollected`, used by the line and the sold confirmation; the Sale tab's Collected tile shows the same two parts as `$225` and `formatOfAsked`, and its Pending and Left tiles use `formatStatusTotal`, so a tile and the line under the rows never disagree.

## Inquiry push

### Who, and what the lock screen shows

- **Who:** every member of the sale whose `people/{uid}.inquiryPushOffSaleIds` doesn't hold it, while the sale is `OPEN`. On by default: nothing is written until someone turns it off. A member with no registered device gets nothing, so the phone still needs permission once.
- **What counts as new:** an inquiry created, or a resend that moves one from `HANDLED` back to `NEW`. Never a resend while it is still New, a member's tap, or the purge.
- **One inquiry:** title `New interest in Gray sofa`, body `Fall clear-out · Open your inbox to reply.`
- **A bundle:** title `3 new inquiries`, body `Gray sofa and 2 more · Fall clear-out` (two things: `Gray sofa and Oak desk`; from two sales: the sale name is left off).
- **Never on the lock screen:** a buyer's name, message, phone or email, or a price. Thing and sale names are clipped to 40 characters; both are already on the public page.
- **Where a tap lands:** one inquiry: `/going-once?sale=<saleId>&tab=inbox&inquiry=<id>`; a bundle from one sale: `/going-once?sale=<saleId>&tab=inbox&view=new` (the New list; the Inbox owns `view`); a bundle from several sales: `/going-once`. Through `toAppUrl`; the URL holds no secret.

### The window (where its state lives)

Central `pushBundles/{appId}_{uid}` (admin SDK only; no client rule matches it, so clients are denied):

| Field | Type | Meaning |
|---|---|---|
| `appId`, `uid` | `string` | |
| `lastSentAt` | `number \| null` | The last push to this person from this app |
| `nextSendAt` | `number \| null` | When the waiting items go out; `null` when nothing waits |
| `items` | `BundleItem[]` | `{ key: string; groupId: string; label: string; groupLabel: string; url: string; queuedAt: number }`, at most 50 kept (newest), deduped by `key` |
| `zone` | `string \| null` | The zone of the newest item (the sale's `timeZone`) |

Flow, all in `functions/src/notifications/bundledPush.ts` (no app words; the app passes its items and a summary builder):

1. **`queueBundledPush(appId, uid, item, zone, now)`** runs in a transaction on the person's bundle doc. If nothing is waiting, `lastSentAt` is more than 15 minutes ago and it isn't a quiet hour in `zone`, it marks the push as sent (`lastSentAt = now`) and returns "send now", and the caller sends that one item at once, after the commit. Otherwise it adds the item and sets `nextSendAt` to the later of `lastSentAt + 15 min` and, when that lands in quiet hours, the next 08:00 in `zone`.
2. **`sendDueBundledPushes`**, scheduled every minute, queries `pushBundles where nextSendAt <= now` (one range field, no composite index; at most 100 per run). For each it claims the doc in a transaction (re-read; skip if `nextSendAt` moved), asks the app's `confirmItems` hook which items still matter (Going Once drops an inquiry already Handled, cleared or deleted, a sale now finished, and a sale the person turned off or left; an inquiry whose thing was deleted still counts, named by `itemTitleAtSend`), sends one summary built by the app's `summarize`, and sets `lastSentAt = now`, `items = []`, `nextSendAt = null`. If nothing is left it sends nothing and just clears. A doc whose `nextSendAt` is far behind (an outage) sends one summary of what still matters; it doesn't drop it, because a buyer is still waiting (the rule for a push that is a person waiting on you; `product.md` gains it in the docs PR).
3. The app registers its hooks in a map keyed by `appId` (like `FIRST_ACTIVITY_FINDERS`); an unknown `appId` is cleared and logged.

- **Quiet hours** use `isQuietHour` from `pushBudget.ts` (22:00–08:00). The zone is the sale's `timeZone`: nobody's own zone is stored, so a co-seller in another zone gets the seller's quiet hours (accepted).
- **"Next 08:00 in a zone"** needs a zoned wall time to an instant: Waypoint's `zonedDateTimeToEpoch` (`functions/src/apps/waypoint/zonedTime.ts`) moves to `functions/src/notifications/` (or a shared `functions/src/time/`) in the push issue, with Waypoint's imports updated.
- **Window latency:** a bundled push lands within a minute of its window ending. The first inquiry after a quiet spell pushes at once.
- **Races:** two inquiries at the same moment both run the transaction; one gets "send now", the other is queued. A trigger retried after a crash may push one inquiry twice; accepted.
- **Cost:** one scheduled run a minute with a single indexed range query; free-tier sized.

### Asking for permission (on a tap, never on load)

- A quiet bar, "Get a push when someone's interested · Turn on · Not now", the first time the seller opens the Inbox and on a co-seller's first open of a sale they joined. Turn on calls `enablePushNotifications(uid)` on that tap.
- Not drawn once this device has a token or while the person has this sale's switch off. After "Not now" it comes back on a later Inbox open, up to 3 times in all (count per uid in `localStorage`: `going-once:<uid>:push-asks`), then never again; the switch stays the way to turn it on.
- A refused or unsupported browser says why in the bar, once.
- **The switch:** "Push me when someone's interested" (`AppToggle`) in the Sale tab, per person, writing `arrayUnion`/`arrayRemove` on their own `people/{uid}`. Turning it on asks for permission on that tap if this device has none.

## Finishing a sale and clearing buyer contact

- `finishSale({ saleId, action: 'finish' | 'reopen' })`, seller only. Finish stops the public link (public folder deleted first, then `publicLinks/{id}`, then the sale fields, the same order as `changeSalePublicLink` stop) and sets `status`, `finishedAt`, `finishedBy` and `contactsClearAt = finishedAt + 30 × 86,400,000`. It is a callable because the public folder is function-only.
- `clearSaleContacts`: scheduled daily (04:30 UTC). Query `sales where contactsClearAt <= now` (one range field, no composite index). Per sale, inquiries in chunks of 400: set `name`, `email`, `phone`, `message` to `null` and `contactClearedAt`; then things whose `pending.buyerName` or `sale.buyerName` is set: clear that field. Then the sale: `contactsClearAt: null`, `contactsClearedAt: now`. Re-reading per chunk and skipping inquiries already cleared makes a rerun after a crash finish the job. A late run clears late rather than skipping (the opposite of a sender's rule, on purpose: clearing late is still clearing). Logs counts and the first four characters of the sale id only.
- **What stays:** the inquiry's thing, dates, status and who handled it, and the thing's sale record without a buyer name, so the totals and history still read.
- **What a finished sale can't do:** show the public page (the link is off), take new inquiries (`submitSaleInterest` also checks `status == 'OPEN'`), take a new Pending hold, build Save all photos (`buildSalePhotoArchive` answers `failed-precondition` "This sale is finished."), or push (`notifySaleInquiry` skips it and `confirmItems` drops anything still waiting). Members still read and edit it, and can finish what was promised (see "Thing status").

## Security & Privacy Requirements

The beta tier keeps access (sign-in, ownership, membership, the seller's powers, the invite join, immutable ownership fields) and checks no field types, lengths or list caps (`firestore-rules.md`); those caps live in the client and, for anything a visitor sends, in the functions. "Seller" is `uid == ownerUid`; "co-seller" is `uid in members` and not the seller; "other" is any other signed-in person.

A member may write any `photos[].path` on a thing, so the public function (and the trigger and zip) derives every file path from the thing's own sale and item path and the photo id, and never trusts `photos[].path` or a `saleId` in the request body.

### Firestore, per path

| Path | Seller | Co-seller | Other signed in | Signed out |
|---|---|---|---|---|
| `sales/{saleId}` read | yes | yes | no | no |
| create | yes when `ownerUid == createdBy == me`, `members == [me]`, `publicLink*`, `finished*`, `contactsClear*` all `null`, `status == 'OPEN'`, and gate `create-sales` open | (same, as the seller of a new sale) | (same) | no |
| update: `name`, `pickupArea`, `buyerNote`, `lastEditedAt` | yes | no | no | no |
| update: remove a member | yes, anyone but themselves; only `members`, `memberJoinedAt`, `lastEditedAt` change and members only shrink | only themselves (leave), same keys | no | no |
| update: join | — | — | yes when their verified token email has an invite `{saleId}_{email}` made by the seller, they add exactly themselves (and their own `memberJoinedAt` key), and the invite is gone after the commit | no |
| update: `ownerUid`, `createdBy`, `status`, `finishedAt`, `finishedBy`, `contactsClearAt`, `contactsClearedAt`, `publicLinkId`, `publicLinkChangedAt` | no (functions) | no | no | no |
| delete | no (`deleteSale`) | no | no | no |
| `emailInvites/{saleId}_{email}` get / list | yes (list by `saleId`) | yes | only an invite whose `email` is their verified email | no |
| create | yes, id matches `saleId + '_' + email`, `invitedBy == me`, email not already a member's (client check) | no | no | no |
| delete | yes | no | the invitee, in the join commit | no |
| update | no | no | no | no |
| `sales/{saleId}/items/{itemId}` read, create, update | yes | yes (a create's `createdAt` is a number at most a minute ahead of the server) | no | no |
| update: `createdBy`, `createdAt`, `saleId`, `id` | no | no | no | no |
| delete | yes | only when `createdBy == me`, `createdAt` within 10 minutes, `sale == null`, `pending == null` | no | no |
| `sales/{saleId}/inquiries/{id}` read, delete | yes | yes | no | no |
| update | yes, only `status`, `handledBy`, `handledAt` | same | no | no |
| create | no (`submitSaleInterest`) | no | no | no |
| `sales/{saleId}/limits/{doc}` | no | no | no | no |
| `publicLinks/{linkId}` | no | no | no | no |
| `people/{uid}` read, write | own only | own only | own only | no |
| `pushBundles/{id}` (central) | no | no | no | no |

The item create/update and the sale create checks above use the item's own `saleId` path segment, never a body field, so a thing can't be written into another sale. Every rule matching a sale's children reads the parent's `members` once through a helper (`isSaleMember(saleId)`, `isSaleSeller(saleId)`).

### Storage, per path

| Path | Seller | Co-seller | Other signed in | Signed out |
|---|---|---|---|---|
| `apps/going-once/sales/{saleId}/items/{itemId}/{photoId}.jpg` read | yes | yes | no | no |
| create | yes, < 5 MB, `image/*`, name pattern | yes, same | no | no |
| delete | yes | yes (a removed photo, or the young-thing undo) | no | no |
| update, list | no | no | no | no |
| `…/sales/{saleId}/exports/photos.zip` get | yes | yes | no | no |
| write, list | no (function) | no | no | no |
| `apps/going-once/public/{linkId}/{itemId}/{file}` get | anyone, when `linkId` matches `^[2-9a-hj-np-z]{26}$` and `file` matches `^[A-Za-z0-9-]{8,40}-(s\|m)[.]webp$` | same | same | same |
| list, write | no | no | no | no |

### What each rule widens

Everything is a new path under `apps/going-once/` or new central infrastructure, so no existing person's access changes. In particular:

- **Widened:** a signed-out visitor can `get` a public photo copy whose full path they know (the link id is the capability, as with Pinch's covers). Nothing else is readable without sign-in, and nothing under a sale is readable by anyone outside `members`.
- **New narrow powers:** the invite join (an "other" person adds themselves to one sale, gated by an invite the seller made for their verified email); the co-seller's young-thing delete; self-leave.
- **New function-only state:** `publicLinks`, `limits`, the export zip, the public folder, `pushBundles`. No client rule matches them, so the emulator matrix proves each is denied to all four columns.
- **Unchanged:** `featureGates` keeps its existing rule (members read, admin writes); the `create-sales` gate is read by `isGateOpen` on sale create, which adds one `get()` per create.
- **Rules size:** about 3,500 characters, roughly 6,000 estimated bytes (`check:rules-size`), well inside the beta tier's room.

Verified per `firestore-rules.md`: the matrix above as seller, co-seller, other and signed out against the emulator, beside the base rules so only these outcomes differ, plus a removed co-seller (denied at once), an invitee before and after joining, and a legacy-shaped sale missing a later field.

### What leaves for the public page (the PR's `## Privacy` list)

| Field | Leaves? | Why |
|---|---|---|
| Sale `name`, `pickupArea`, `buyerNote` | include | The page needs them; shown as typed, the form warns against a name or address |
| Sale `ownerUid`, `members`, any name, email or photo, `timeZone`, `status` | exclude | Never says who shared it; a finished sale has no page |
| Thing `id` | include | Opaque key for the interest form |
| `title`, `description`, `brandModel`, `size`, `condition`, `askingPriceCents` | include | What a buyer decides on |
| `originalPriceCents` | only when `showOriginalPrice === true` | The seller's per-thing choice |
| `status` | `AVAILABLE \| PENDING` only | Sold and withdrawn things are never served |
| Photo copies (`s`, `m` paths, first 12) | include | Smaller copies only |
| `floorPriceCents`, `boughtFrom`, `boughtOn`, `boughtUrl`, `boughtUrlPreview`, `notes`, `pending`, `sale`, `statusHistory`, `createdBy`, `lastEditedBy`, timestamps | exclude | Private money, notes, people, history |
| Inquiries and their counts | exclude | Buyer contacts are members-only; a count says how wanted a thing is |
| `isMember` | computed per caller | Maya or Theo signed in sees "This is your sale's public page", with no id that says whose |

- Fields are copied by name into a new object when shaping and again before returning; a thing failing the allowlist is dropped whole.
- A malformed, unknown, stopped or renewed-away id, a finished sale and a deleted sale all answer `{ status: 'not_found' }` through one path.
- The page calls `useNoIndex`; `cloudflare-worker.js` gets a `pages` entry for `/going-once/s/` with a generic preview ("Things for sale"), `noindex, nofollow`, `no-referrer`. `Layout` shortens the route before writing presence. Functions log at most four characters of a link id and only a Storage error's code.
- Nothing third-party loads on the public page.

### The interest form's limits (in `submitSaleInterest`, not the UI)

- Field caps (name 80, contact 254, message 1,000); payload under 4 KB; the one contact field must read as an email or a phone.
- The thing must be showing now (listable, AVAILABLE or PENDING, sale OPEN, link current), else `not_available`.
- **Per sale:** 100 new inquiries per UTC day (`limits/interest`, in the write's transaction), else `busy`.
- **Per thing:** 40 inquiries; a resend of an existing one always passes.
- **Per instance:** 5 sends per IP per 10 minutes, in memory only, never stored or logged; resets on a cold start, per instance (`maxInstances: 5`), else `slow_down`.
- **Honeypot:** a hidden field; filled, it gets `sent` and writes nothing.
- **Deterministic id:** a double tap or retry is one inquiry.
- **What this doesn't stop:** someone with the link can send up to 100 a day from many addresses and type any name or contact (nothing is verified). Buyer contact is plain text, readable by Maya and her co-sellers, until 30 days after the sale is finished (or the sale is deleted). A removed co-seller who saved a buyer's number elsewhere keeps it; the app can't take it back.

### Other caps (client, and where named, the functions)

A person owns at most 20 sales; a sale holds at most 300 things (and `getSalePage` serves at most 300); 12 photos per thing (client, `syncSalePublicPhotos`, `buildSalePhotoArchive`); one public link per sale (the callable); 10 co-sellers and invites per sale (client).

## Photo flow, sized

### One thing (Save photos)

Opening a thing's drawer prefetches its listing files as `Blob`s (`getBlob`; `storage-cors.json` already allows GET from the site's origins), so the tap calls `navigator.share({ files })` inside the gesture (iOS refuses a share after an `await` that outlives it). Where `navigator.canShare({ files })` is false the row reads "Download photos" and each file downloads through an object URL. Up to 12 files of about 1 MB: fine on any phone. Shared helper `shareOrDownloadFiles(files, { title })` in `src/utils/fileUtils.ts` (the name UX.md uses), no app words, reporting `'shared' | 'downloaded' | 'cancelled'`.

### All things (Save all photos)

Available and Pending things only. 60 things × 5 photos × ~1 MB ≈ **300 MB**; the worst case at the caps (300 × 12) is about 3.6 GB, so the function refuses above 1,500 photos with a line to pick fewer (by status).

- **Client zip (rejected):** hundreds of fetches over a phone connection into one 300 MB `Blob`; iPhone Safari kills the tab well before that, and there is no streaming-to-disk there.
- **Share sheet in batches (rejected):** share sheets stall at this count, and every batch needs its own tap and its own gesture.
- **Function-built zip (decided):** `buildSalePhotoArchive({ saleId })` streams each listing file from Storage into a STORE-mode zip (JPEG doesn't compress) and the zip straight into `exports/photos.zip`, never holding it in memory (1 GiB, 540 s timeout; 300 MB in-region takes well under a minute). One folder per thing, `NN Name` (sanitized, duplicates numbered), files `Name 1.jpg`…; `Content-Disposition: attachment; filename="<sale name> photos.zip"`. The client gets the download URL and opens it: Android and desktop save to Downloads, iPhone to Files. The sheet shows the count and size from `ItemPhoto.sizeBytes` before building ("41 photos · about 45 MB · best on Wi-Fi"), then a building state, then the download. The file is replaced on each build and deleted with the sale. The camera roll is per-thing Save photos.

### Public copies

`syncSalePublicPhotos` (trigger on thing writes) re-reads the thing and the sale fresh (never the event payload, so out-of-order runs converge), lists `public/{linkId}/{itemId}/`, makes the missing `s`/`m` WebP copies of the first 12 photos with `sharp` (auto-rotated, metadata stripped) and deletes copies no longer wanted (not showing, photo removed, link off or renewed). A rerun finds nothing to do. Until a copy exists the card shows the photo placeholder for a few seconds. Turning the link on or renewing it runs the same sync for every thing from the callable.

## Client State Management (Redux Toolkit)

- **Slice `goingOnce`** (`GoingOnceState`, `selectGoingOnce`) in `store/index.ts`, reset on `resetAllState`: `sales`, `myInvites`, `openSale`, `items`, `saleInvites` (tagged with the sale they were read for), `removedFrom` (the sale a co-seller was taken off, by name) and `leavingSaleId` (a departure that is not shown as a removal); the inbox's and `people` (my settings) arrive with their issues.
- **`useGoingOnceSync`**, started once from `GoingOnce.tsx`:
  - User tier: my sales (`where('members', 'array-contains', uid)`), my invites (`where('email', '==', verifiedEmailLower)`, only when the token's email is verified), my `people/{uid}` doc.
  - Open-sale tier (keyed on `saleId`): the sale, its things, New inquiries (`where('status', '==', 'NEW').orderBy('lastSentAt', 'desc')`), the 30 newest Handled (`where('status', '==', 'HANDLED').orderBy('handledAt', 'desc').limit(30)`), the sale's invites (`where('saleId', '==', id)`).
- **How a co-seller's sale appears (answers design):** the invites listener sees an invite for this verified email; `useJoinFromInvites` (mounted by `GoingOnce.tsx`) joins for each in one batched commit (their uid is added with `arrayUnion` and their `memberJoinedAt` key and the invite delete ride in the same commit, since they cannot read the sale to run a read-then-write transaction), once per invite id per session, and the sale arrives through the my-sales listener. The co-seller lands on it when it is their only sale (S15 rules), with the intro card and the push capsule. A join the rules refuse (the seller cancelled a second ago) is dropped quietly. It happens only inside Going Once, so the seller's "Copy app link" is what brings them there. An unverified email never matches (Google sign-in is always verified).
- **Older Handled inquiries (answers design):** the Handled view shows the 30 from the listener; "Show older" loads pages of 30 as a one-shot TanStack infinite query (`queries/inquiryQueries.ts`, cursor `startAfter(lastHandledAt, lastId)`, `staleTime` 1 minute, invalidated when the sale changes). The switch's count is `getCountFromServer` on the same filter, refreshed when the Inbox opens, and reads "Handled" without a number until it knows. New is never paged: it is the work queue, bounded by the daily cap.
- **A thing's inquiries in its drawer** come from a small keyed listener mounted only while that drawer is open (`where('itemId', '==', id)`, sorted in memory; at most 40 by the cap), the one modal-local listener `state-data.md` allows. A row's "Priya asked" line reads New inquiries already loaded.
- **Remove and leave** are one `removeMember` write (`arrayRemove` on `members`, the person's `memberJoinedAt` key deleted, `lastEditedAt`): one atomic update that touches only those three fields, so it needs no read. Leaving sets `leavingSaleId` first so the person's own departure goes back to Your sales instead of the removal screen.
- **A removed co-seller (answers product):** the rules read live `members`, so their next read or write is refused. The client treats it as removal, not an error: when the open sale leaves the my-sales listener, or a listener or write under it answers `permission-denied` while the sale is open, `GoingOnce.tsx` stops the open-sale tier, clears that sale from the slice (keeping only its name, captured before clearing) and shows "You're no longer on Fall clear-out" with a way back to Your sales. A queued offline write that is later refused lands on the same screen.
- **Actions:** `saleActions` (create, edit details), `memberActions` (invite, cancel, join, remove, leave), `itemActions` (create, field update, photo transactions, status transactions, sold-record correction, delete), `inquiryActions` (Handled, New, delete), `peopleActions` (push switch).
- **TanStack Query:** `queries/salePageQueries.ts` (`getSalePage`, `staleTime` 30 s, refetched on `useOnTabReturn`, no `persist`), `queries/inquiryQueries.ts` (older Handled, Handled count). Callables for the link, finishing, archive and interest are uncached mutations.
- **URL state:** `useGoingOnceUrlState` (`sale`, `tab`, `status` (the Things tab's `available` / `pending` / `sold`, which the Sale tab's tiles set; cleared when the tab changes to anything but Things), `view` (the Inbox's `new` / `handled`), `thing`, `inquiry`), so a push opens the inquiry or the New list.
- **Context:** none.

## Backend Surface

### Functions (final list)

All `region: 'us-central1'`, callables with the site's `cors` list. Errors are `HttpsError` codes with a sentence the client shows as written; answers a visitor can trigger are statuses, not errors, so a probe learns nothing from the code. Each logs at most four characters of an id.

| Function | Kind | Who | Input | Output | Errors / statuses |
|---|---|---|---|---|---|
| `getSalePage` | callable, auth optional | anyone with the link | `{ linkId }` | `{ status: 'ok', sale: { name, pickupArea, buyerNote }, things: PublicThing[], isMember }` or `{ status: 'not_found' }` | Only `not_found` (malformed, unknown, stopped, renewed-away, finished, deleted alike) |
| `submitSaleInterest` | callable, auth optional | anyone with the link | `{ linkId, itemId, name, contact, message, website }` (`website` is the honeypot) | `{ status: 'sent', contact: 'email' \| 'phone' }`, or `not_found`, `not_available`, `busy`, `slow_down`, `invalid` (with `field: 'name' \| 'contact' \| 'message'`) | `invalid` names the field; nothing else says more |
| `changeSalePublicLink` | callable | seller | `{ saleId, action: 'create' \| 'renew' \| 'stop' }` | `{ linkId: string \| null }` | `unauthenticated`; `invalid-argument` (a sale id that isn't 1-128 letters, digits, `_` or `-`); `not-found` (missing, someone else's or a co-seller's call alike); `failed-precondition` "This sale is finished. Reopen it to turn the page on." |
| `syncSalePublicPhotos` | Firestore trigger, `apps/going-once/sales/{saleId}/items/{itemId}` written | — | the event's ids (re-reads both docs) | public copies made or deleted | Logs and returns; a failed copy is retried on the thing's next write or by the link callable's full sync |
| `buildSalePhotoArchive` | callable, 1 GiB, 540 s | members | `{ saleId }` | `{ path, photoCount, sizeBytes }` | `not-found`; `failed-precondition` "Nothing to save yet: no Available or Pending thing has a photo." or "This sale is finished."; `resource-exhausted` "That's more than 1,500 photos. Save fewer at a time." |
| `finishSale` | callable | seller | `{ saleId, action: 'finish' \| 'reopen' }` | `{ status: 'OPEN' \| 'FINISHED', contactsClearAt }` | `not-found`; `failed-precondition` "Already finished." / "Already open." |
| `clearSaleContacts` | scheduled, daily 04:30 UTC | — | — | counts logged | A sale that fails is left for the next run |
| `notifySaleInquiry` | Firestore trigger, `apps/going-once/sales/{saleId}/inquiries/{inquiryId}` written | — | before/after of the inquiry | `queueBundledPush` per recipient, and an immediate push where it says "send now" | Logs; a push failure never touches the inquiry |
| `sendDueBundledPushes` | scheduled, every minute (shared, every app) | — | — | summaries sent | A bundle that fails keeps its items for the next run |
| `deleteSale` | callable, 540 s | seller | `{ saleId }` | `{ deleted: true }` | `unauthenticated`; `invalid-argument` (a sale id that isn't 1-128 letters, digits, `_` or `-`); `not-found` (missing, someone else's or a co-seller's call alike, and a sale a finished run already removed); `internal` "The sale wasn't fully deleted. Delete it again to finish." (the sale stays, so a rerun finishes it). Order: its Storage files, then `recursiveDelete` of the sale, which takes the things and any other subcollection (inquiries, invites) with it. The client calls it with a 540 s timeout, counts `not-found` as deleted, and reads `deadline-exceeded` as "Still deleting. Check again in a moment." |
| `findFirstActivityAt` | usage finder for `registerAppUsage` | — | uid | oldest `createdAt` of a sale they are in, or `null` | — |

`PublicThing = { id, title, description, brandModel, size, condition, askingPriceCents, originalPriceCents, status, photos: { s: string, m: string }[] }`, the copy paths only; `originalPriceCents` is `null` unless shown.

### Everything else

| Kind | Name / path | Why | Lands in |
|---|---|---|---|
| Indexes | `inquiries (status ASC, lastSentAt DESC)`; `inquiries (status ASC, handledAt DESC)` | New list; Handled pages | Inbox issue |
| No index needed | sales `array-contains`, invites by `email` or `saleId`, items `status in`, inquiries by `itemId`, `pushBundles.nextSendAt <=`, `sales.contactsClearAt <=` | Single field each | — |
| Feature switch | `create-sales` in `FEATURE_GATES`, `isServerEnforced`, default everyone | Who may start a sale | First issue |
| Shared, functions | `bundledPush.ts`, the zoned-time helper moved from Waypoint, a general `functions/src/share/` (id minting, file copy under a new token, files-first delete) taken from Pinch | Reused by the next app | Push issue; public page issue |
| Dependencies | `sharp`; a zip streamer (`archiver` or `fflate`, MIT) | First native dependency in `functions/` (prebuilt linux-x64) | Public photos issue; Save all photos issue |
| Storage rules | three paths above | | With their first consumer |
| Worker | `pages` entry `/going-once/s/` | Generic preview, noindex, no-referrer | Public page issue |
| Secrets, env vars, console steps | none | | — |

Everything deploys with the merge workflow (`fb:deploy:smart` opens new callables and deploys indexes). `getSalePage` and `submitSaleInterest` are the repo's first callables made for signed-out visitors that read or write a member's data; `functions/README.md` says so for each, with `maxInstances` 5–10 bounding cost under abuse. Two new scheduled jobs (`clearSaleContacts`, `sendDueBundledPushes`) fit the free Cloud Scheduler allowance with the existing ones or cost cents a month.

## Component & File Architecture

```
src/apps/going-once/
  GoingOnce.tsx                 orchestrator: sign-in gate, open sale, invite auto-join, sections, useGoingOnceSync, useTrackAppUsage
  SalePage.tsx                  public route /going-once/s/:linkId (no sign-in, useNoIndex, getSalePage)
  types.ts  constants.ts  going-once.css
  components/
    sales/        SalesList, SaleFormSheet, SaleTab (StatTiles, LinkCard, People, Details, Finish, Delete)
    things/       ThingRow, StatusDot, PriceTag, ThingDrawer (getThingOffer), ThingForm (Modify), MarkPendingView,
                  MarkSoldView, SoldConfirmation, ChangePaidView, HistoryView, StatusViewFooter, DeleteThingConfirm, NewThingFlow (QuestionFlow), ThingQuestions + thingRows (the questions
                  both share, and each row's label, fields and summary), ItemsSection (search, sort, the door)
    inbox/        InboxTab, InquiryRow, InquiryDrawer, PushCapsule
    people/       PeopleSection, PersonSheet, AddCoSellerSheet, CoSellerIntro (once per sale per person, remembered on the device), RemovedFromSale
    relist/       CopyListingTextRow, SavePhotosRow, SaveAllPhotosSheet
    public/       BuyerCard, BuyerThingDrawer, InterestView
  hooks/          useGoingOnceSync.ts, useGoingOnceUrlState.ts, useDeleteThing.tsx (the E2 confirm and the delete), useStatusWrite.ts (one write of a status view: no double tap, a kept refusal), useSingleFlight.ts (one drawer act at a time), usePersonNames.ts, useJoinFromInvites.ts (the auto-join), useThingInquiries.ts (drawer-only listener)
  store/          index.ts (slice), listeners/, actions/, selectors.ts
  queries/        photoUrlQueries.ts (a photo's download address), salePageQueries.ts, inquiryQueries.ts
  utils/          listing.ts (isListable, canDeleteItem, sortItems, getDeleteEffects, listingText), status.ts (getThingOffer, getStatusFacts, formatCollected, describeStatusChange, describeMovedOn), statusSummary.ts (getStatusSummary, formatStatusTotal; the Sale tab reads it through `selectStatusSummary`), statusDrafts.ts (what a status view holds while it is open, held by the drawer so closing asks Keep editing / Discard), personName.ts, thingAnswers.ts (answers <-> stored fields)
functions/src/apps/going-once/
  salePageView.ts (allowlist, limits, mirrored constants), getSalePage.ts, changeSalePublicLink.ts,
  syncSalePublicPhotos.ts, submitSaleInterest.ts, notifySaleInquiry.ts, buildSalePhotoArchive.ts,
  finishSale.ts, clearSaleContacts.ts, deleteSale.ts, findFirstActivityAt.ts
src/utils/imageCompression.ts   + 'listing' use and a per-use output type (shared)
src/utils/fileUtils.ts          + shareOrDownloadFiles: share sheet with download fallback (shared)
src/components/forms/PhotoSetPicker.tsx, src/hooks/usePhotoSetUploads.ts, src/components/PhotoStrip.tsx   (design's shared components; the hook holds the uploads in the screen that owns the thing, so a photo still shrinking or saving when the person moves to the next answer finishes)
```

Reused, not rebuilt: `MoneyInput`/`AmountHero`, `formatCents`/`formatCentsShort`, `parseMoneyToCents`, `generateUuid`, `CopyTextButton`/`copyToClipboard`, `FallbackImage`, `useNoIndex`, `useOnTabReturn`, `StatTile`, `AppToggle`, `enablePushNotifications`, `sendPushToUsers`, `isQuietHour`, `toAppUrl`, `isGateOpen`/`useIsGateOpen`, `useActionModal().confirm`; Waypoint's email-invite join (reimplemented on `members: string[]`); Pinch's id minting, file copy under a new download token and files-first delete. Those Pinch share helpers become a general `functions/src/share/` module in the public page issue, with no app words.
