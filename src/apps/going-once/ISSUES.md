# Going Once — Issue Roadmap

The tiers mirror PRODUCT.md's Build Plan: Core MVP is `## MVP`, Next Steps is `## Next Steps`, Stretch Goals is `## Beyond`. The inquiry push sits in MVP because the owner put it there (round 1); it comes after the inbox works without it. Within a tier, issues are ordered by prerequisite. Each issue adds only the fields, types, option lists and rules clauses its own feature uses, even where `TECHNICAL.md` already shows the fuller shape; a later field arrives with the issue that reads it, and readers default it for documents written before (`?? null`, `?? []`, `?? 'OPEN'`). Each MVP issue is a vertical slice a person can open in the running app, with Create and Read paired.

**Build order (owner, round 3):** Issues 1–9 merge first as one batch, so listing and sharing can start; Issues 10–14 follow as a second batch.

Every issue that adds or changes a field, permission, path or collection updates `firestore.rules` (and `storage.rules`) in the same PR, verified on the emulator as seller, co-seller, another signed-in person and signed out, against the base rules too, and updates `scripts/seeds/going-once.ts` when a seeded document's shape changes.

Every issue's Success Criteria end with the same two checks, repeated in each issue so each stands alone:

1. **Release and validation:** the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
2. **Docs current:** the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

## MVP

### Issue 1: Going Once on the site: register it, start a sale, open it

**Prerequisites:** The approved `README.md`, `PRODUCT.md`, `UX.md`, `TECHNICAL.md` and this file are committed under `src/apps/going-once/` in a docs PR (not one of these issues).
**Target PR Size:** ~400 lines (a third is registry, seed and docs)
**Files:**
- `public/banners/by-app/banner-going-once.png`, `public/logos/by-app/logo-going-once.svg` (new)
- `src/lib/app/app.registry.ts`, `src/lib/types/appCatalog.ts` (one entry each)
- `src/routes/AppRoutes.tsx` (a lazy `/going-once` route, no `ProtectedRoute appId`: any signed-in person, like Waypoint)
- `cloudflare-worker.js` (one app registry entry only)
- `README.md` (root "Current apps" line)
- `functions/src/apps/going-once/findFirstActivityAt.ts` (new), `functions/src/appUsage/registerAppUsage.ts` (`FIRST_ACTIVITY_FINDERS` entry), `functions/README.md` (its line)
- `src/apps/going-once/GoingOnce.tsx`, `types.ts`, `constants.ts`, `going-once.css`, `hooks/useGoingOnceSync.ts`, `hooks/useGoingOnceUrlState.ts`, `store/index.ts`, `store/listeners/salesListener.ts`, `store/listeners/openSaleListener.ts`, `store/actions/saleActions.ts`, `store/selectors.ts`, `components/sales/SalesList.tsx`, `components/sales/SaleFormSheet.tsx`
- `src/store/index.ts` (the `goingOnce` slice, reset on `resetAllState`)
- `src/lib/gates/gates.registry.ts` (`create-sales` in `FEATURE_GATES`, server-enforced, default everyone)
- `firestore.rules` (`apps/going-once/sales/{saleId}`)
- `scripts/seeds/going-once.ts` (new), `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:going-once`), `SEEDING.md`, `src/lib/dev/fixtureAccounts.ts`
- `.claude/rules/going-once.md`, `.github/instructions/going-once.instructions.md` (new)
**Context:** `TECHNICAL.md` "Decisions this design makes", "Data Schema" (the sale), "Security & Privacy Requirements" (the `sales/{saleId}` rows) and "Client State Management"; `UX.md` "Sitemap", S1, S2, S3, S15; `docs/conventions/new-app.md`.

### Description
Maya opens Going Once, starts "Fall clear-out" with a pickup area and a note for buyers, and lands on its empty Things tab. With two sales she sees Your sales. The look is the tag-sale theme. Who may start a sale is the `create-sales` switch.

### Possible Approach
1. Walk `docs/conventions/new-app.md`: registry, catalog, route, logos, worker entry (one line), README line, `useTrackAppUsage('going-once', uid)` beside `useGoingOnceSync` in `GoingOnce.tsx`, the usage finder (oldest `createdAt` of a sale whose `members` holds the uid).
2. `Sale` type with only this issue's fields: `id`, `name`, `pickupArea`, `buyerNote`, `currency`, `ownerUid`, `createdBy`, `members`, `createdAt`, `lastEditedAt`. `generateUuid` for the id.
3. Listeners: my sales (`array-contains`), and the open sale keyed on `saleId` from `useGoingOnceUrlState` (`sale`, `tab`, via `nuqs`).
4. `SaleFormSheet` is a `FormSheet` with Name (`SuggestionChips`) and `AddFieldChips` for Pickup area and Note for buyers; the pickup hint says "An area, never your address".
5. Shell: the floating three-tab bar (Things, Inbox, Sale); Inbox and Sale render a placeholder `EmptyCard` until their issues. Landing rules from `UX.md` "Sitemap" (one sale opens it; none or 2+ shows Your sales).
6. Rules: read for members; create when `ownerUid == createdBy == me`, `members == [me]` and `isGateOpen('going-once', 'create-sales', 'everyone')`; update and delete denied for now (details editing is Issue 5); add the gate to the emulator matrix (`npm run check:gate-rules`).
7. Seed: Maya (seller) with "Fall clear-out" from `canvas.md` "Example data", and Theo's account with no sale yet; the theme stylesheet with the popover, tooltip and subview tokens `check:apps` requires.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Start a sale from S1's chip or Your sales' header "New sale".
- [ ] **Read:** the sale opens on its Things tab with its name in the header; Your sales lists every sale I'm in.
- [ ] **Update:** deferred to Issue 5 (the Sale tab's Details rows).
- [ ] **Delete:** deferred to Issue 5 (`deleteSale`).

### Success Criteria
- [ ] `/going-once` is reachable from Home and the app list, signed in, with no access grant; signed out it shows `AuthRequiredState`.
- [ ] With the `create-sales` switch closed for a person, the rule refuses their create and the UI says why (`GatesClosedNote`).
- [ ] `npm run check:apps` passes (finder, map entry, hook call, theme tokens).
- [ ] `firestore.rules` covers `sales/{saleId}` per `TECHNICAL.md`'s matrix (read, create; update and delete denied in this issue), verified as seller, another signed-in person and signed out, against the base rules too.
- [ ] Seed updated: `npm run seed:going-once` writes Maya's sale; `SEEDING.md` lists its count.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 2: Add things, photos first

**Prerequisites:** Issue 1
**Target PR Size:** ~400 lines
**Files:**
- `src/utils/imageCompression.ts` (`listing` use, per-use output type)
- `src/components/forms/PhotoSetPicker.tsx`, `src/components/PhotoStrip.tsx` (new, shared)
- `src/apps/going-once/components/things/NewThingFlow.tsx`, `ThingRow.tsx`, `ThingDrawer.tsx`, `PriceTag.tsx`, `ItemsSection.tsx`
- `src/apps/going-once/store/actions/itemActions.ts`, `store/listeners/openSaleListener.ts`, `store/selectors.ts`, `types.ts`, `constants.ts`, `utils/listing.ts`
- `firestore.rules`, `storage.rules`
- `scripts/seeds/going-once.ts`
- the Pattern index in `CLAUDE.md` (two new shared components)
**Context:** `TECHNICAL.md` "Data Schema" (a thing, `ItemPhoto`, "Shared image size", Storage), "Thing edits and photos"; `UX.md` S4–S10, H1, H4; `docs/conventions/forms-crud.md` "A photo a person picks is shrunk".

### Description
Maya walks a room: Take a photo four times, a name, a price (or Free) with a floor price beside it, a condition, then Next thing. Each thing saves from its first photo or name and shows on the Things list and in its drawer. A thing without a photo, name and price says Not listed yet.

### Possible Approach
1. `listing: { maxDimension: 2048, quality: 0.88, type: 'image/jpeg' }` in the shared util, with an optional per-use output type (WebP stays the default for every other use). Check every existing use still encodes WebP.
2. `PhotoSetPicker` (camera loop, library multi-pick, cover first, Make cover / Move earlier / Move later / Remove with undo, each photo through `useImageUpload(…, 'listing')`, 12 at most) and `PhotoStrip` (sideways snap row, `ImageViewer`), with no app words.
3. `Item` type with this issue's fields only: `id`, `saleId`, `title`, `condition`, `askingPriceCents`, `floorPriceCents`, `photos`, `status` (`'AVAILABLE'` only for now), `createdBy`, `createdAt`, `lastEditedAt`, `lastEditedBy`. `CONDITION_OPTIONS` in `constants.ts`.
4. Create the thing on the first answer; each later answer is a field-scoped `updateDoc`. A photo uploads to `…/items/{itemId}/{photoId}.jpg`, then joins `photos` in a transaction that refuses a 13th.
5. `isListable` in `utils/listing.ts`; the row and drawer show Not listed yet from it.
6. Rules: items read, create, update for members (path `saleId`); delete denied until Issue 3. Storage: the item photo path per `TECHNICAL.md` (members; < 5 MB; `image/*`; name pattern).

### CRUD & Entry-Point Requirements
- [ ] **Create:** the header's "New thing" opens `NewThingFlow`; Next thing starts another.
- [ ] **Read:** new rows at the top of the Things tab (cover, name, condition and floor price line, asking price), and a tap opens `ThingDrawer` with the photos, facts line and floor price.
- [ ] **Update:** the four answers can be changed in the flow; the full form is Issue 3.
- [ ] **Delete:** deferred to Issue 3 (seller delete and the co-seller's 10-minute undo).

### Success Criteria
- [ ] A 12 MP camera photo is stored as a JPEG under 2,048px and under 4.5 MB; leaving mid-thing loses nothing that was answered.
- [ ] The flow works offline for typed answers, and a photo upload holds only its own thumb, never the screen.
- [ ] `firestore.rules` and `storage.rules` cover the item and photo paths per the matrix, verified as seller, another signed-in person and signed out (co-seller rows run in Issue 6).
- [ ] Seed updated: Fall clear-out's 14 things with photos, from `canvas.md` "Example data".
- [ ] `PhotoSetPicker` and `PhotoStrip` carry no app words and have Pattern index lines.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 3: Change a thing, find it, and delete it

**Prerequisites:** Issue 2
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/going-once/components/things/ThingForm.tsx`, `NewThingFlow.tsx` (review step's `AddFieldChips`), `ThingDrawer.tsx`, `ItemsSection.tsx`
- `src/apps/going-once/store/actions/itemActions.ts`, `types.ts`, `constants.ts`
- `firestore.rules`, `storage.rules`
- `scripts/seeds/going-once.ts`, `scripts/seeds/goingOnceScale.ts` (new, 50 things)
**Context:** `TECHNICAL.md` "Data Schema" (a thing's optional fields), "Thing edits and photos"; `UX.md` S8, S9, H1, H17, "Not yet drawn" (the Thing form).

### Description
Maya adds a description, brand, size, original price with Show original price, where she got it (with a link to the store's page, shown as a preview) and notes, from the review step or Modify later. She reorders or removes photos, finds a thing by search, sorts the list, and deletes a thing. Right after adding one, Undo takes it back.

### Possible Approach
1. Add `description`, `brandModel`, `size`, `originalPriceCents`, `showOriginalPrice`, `boughtFrom`, `boughtOn` (date-only, `fromDateInputValue`), `boughtUrl`, `boughtUrlPreview` (`LinkPreview`, filled by `LinkAttachField`), `notes` to `Item`.
2. `ThingForm` as a `FormScreen` overlay in two sections, "Buyers see" and "Only you and your co-sellers see this", each a summary row saving its own field; private rows carry the lock caption.
3. Photo reorder and remove as transactions on `photos`; delete the removed file after the commit.
4. Search from 8 things (`SearchInput`), `SortControl` (newest, price, name), the "N not listed yet" door row.
5. Delete: `DeleteIconButton` + `confirm` naming its photos; deletes the photos, then the doc. S9's Undo deletes the thing just made.
6. Rules: item delete for the seller; for a co-seller only `createdBy == me`, within 10 minutes of `createdAt`, `sale == null` and `pending == null` (read with `get(…, null)` until those fields exist). Storage delete for members.

### CRUD & Entry-Point Requirements
- [ ] **Create:** covered by Issue 2.
- [ ] **Read:** the optional fields show in `ThingDrawer`'s description and private block; the store's link is a `LinkPreviewCard` there that opens the page.
- [ ] **Update:** Modify in the drawer's footer opens `ThingForm`; photos reorder and remove there.
- [ ] **Delete:** the seller's Delete thing in the drawer's More; the 6-second Undo after Next thing.

### Success Criteria
- [ ] A save never overwrites another member's concurrent field edit or photo change (two browsers, one per account).
- [ ] The store's link and its preview never reach `getSalePage`'s answer or the copied listing text (allowlist test).
- [ ] At 50 things on the scale fixture, the Things tab switches in under a second at 4× CPU, rows under `LazyMount`.
- [ ] `firestore.rules` and `storage.rules`: item and photo delete per the matrix, the co-seller's 10-minute window allowed at 9 minutes and refused at 11, verified against the base rules.
- [ ] Seed updated: the optional fields on several seeded things; the scale fixture added to `SEEDING.md`.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 4: Pending, Sold, and what was paid

**Prerequisites:** Issue 3
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/going-once/components/things/MarkPendingView.tsx`, `MarkSoldView.tsx`, `HistoryView.tsx`, `StatusDot.tsx`, `ThingDrawer.tsx` (`getThingOffer`), `ItemsSection.tsx` (status switch)
- `src/apps/going-once/store/actions/itemActions.ts`, `types.ts`, `constants.ts`
- `scripts/seeds/going-once.ts`
**Context:** `TECHNICAL.md` "Thing status", "Data Schema" (`pending`, `sale`, `statusHistory`); `UX.md` H2, H3, H5–H10; PRODUCT.md "Status, In Detail".

### Description
Theo (or Maya) marks the Gray sofa Pending for someone with a pickup day, then Sold for $170 by Venmo today. A typo is fixed with Change what was paid ("Collected goes from…"); Not sold after all puts it back. A thing can be taken off the list and put back. Each thing keeps its history.

### Possible Approach
1. Widen `ItemStatus` to `AVAILABLE | PENDING | SOLD | WITHDRAWN` with `STATUS_LABELS`; add `pending`, `sale`, `statusHistory`, `PaymentMethod` and `PAYMENT_METHOD_OPTIONS`.
2. One `runTransaction` per transition that re-reads the thing, aborts in words when the status it expected is gone ("Theo already marked this sold for $120"), and appends to `statusHistory` from its own read (last 50).
3. `MarkPendingView`: "Someone else" with a typed name and an "Add a pickup day" chip; the inquiry rows come in Issue 10. `MarkSoldView`: `AmountHero` prefilled with the asking price, How they paid, `FoldedDateField`, the under-floor `InlineNotice`.
4. The Things tab's status switch (`Available · n`, `Pending · n`, `Sold · n`, taken-off things after a `SectionDivider` in Sold) and each group's footer line.
5. No rules change: members already update items; the beta tier checks no shapes.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a status change creates its history entry; reached from the drawer's primary and More.
- [ ] **Read:** the status dot on rows and in the drawer, the facts line ("Pending for Nate", "Sold $170 · Venmo · Oct 31"), and History in More.
- [ ] **Update:** Change what was paid, Back to available, Not sold after all, Put back on the list.
- [ ] **Delete:** not applicable (history is read-only).

### Success Criteria
- [ ] Two browsers marking one thing Sold at once: one succeeds, the other shows the readable refusal and the live status.
- [ ] Offline, a status change says it needs a connection and changes nothing.
- [ ] `firestore.rules` checked: no clause needed; stated in the PR.
- [ ] Seed updated: Pending and Sold things with records, matching `canvas.md` "Example data".
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 5: The Sale tab: where it stands, details, delete the sale

**Prerequisites:** Issue 4
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/going-once/components/sales/SaleTab.tsx`, `utils/totals.ts`, `store/selectors.ts`, `store/actions/saleActions.ts`
- `functions/src/apps/going-once/deleteSale.ts` (new), `functions/src/index.ts`, `functions/README.md`
- `firestore.rules`
**Context:** `TECHNICAL.md` "Totals", "Backend Surface" (`deleteSale`), the `sales/{saleId}` update rows; `UX.md` S11; PRODUCT.md "Where the Sale Stands, In Detail".

### Description
Maya opens the Sale tab: Collected $225 of $245 asked, Pending 2, Left 7 with "1 has no price yet"; each tile opens Things on that status. She edits the name, pickup area and note, and can delete the sale.

### Possible Approach
1. One-pass `createSelector` totals in `utils/totals.ts`; one formatter per figure shared by the tile and the Things footer line.
2. Details as `SummaryEditor` rows (seller only), each a field-scoped `updateDoc`.
3. `deleteSale({ saleId })` (seller): photos, then things, then the sale, in chunks, safe to rerun; same answer for missing and someone else's. Later issues extend it (invites, inquiries, public folder, export).
4. Rules: sale update for the seller limited to `name`, `pickupArea`, `buyerNote`, `lastEditedAt`; delete stays denied (the callable deletes).

### CRUD & Entry-Point Requirements
- [ ] **Create:** not applicable.
- [ ] **Read:** the Sale tab's tiles, reached from the bottom bar.
- [ ] **Update:** the Details rows (sale `name`, `pickupArea`, `buyerNote`).
- [ ] **Delete:** Delete this sale, last on the tab, confirm says what goes with it.

### Success Criteria
- [ ] Totals match a hand count on the seed and the scale fixture; withdrawn things are in no figure; the floor price is never summed.
- [ ] `firestore.rules`: seller details update allowed, any other key refused, another signed-in person refused, verified against the base rules.
- [ ] `deleteSale` leaves nothing under the sale's Firestore and Storage paths; an interrupted run finishes on rerun.
- [ ] Seed checked: no shape change.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 6: Co-sellers: add by email, join, remove, leave

**Prerequisites:** Issue 5
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/going-once/components/people/PeopleSection.tsx`, `AddCoSellerSheet.tsx`, `CoSellerIntro.tsx`, `RemovedFromSale.tsx`
- `src/apps/going-once/GoingOnce.tsx` (invite auto-join, removal screen), `store/actions/memberActions.ts`, `store/listeners/invitesListener.ts`, `types.ts`
- `functions/src/apps/going-once/deleteSale.ts` (invites)
- `firestore.rules`
- `scripts/seeds/going-once.ts`
**Context:** `TECHNICAL.md` "Decisions this design makes" (email join), `emailInvites`, the join and remove rows, "Client State Management" (how a co-seller's sale appears; a removed co-seller); `UX.md` S12, S13, H18.

### Description
Maya adds theo@example.com. When Theo opens Going Once signed in with that email, Fall clear-out is waiting with the intro card; he sees everything, floor prices and notes included, and can do everything but delete things, manage co-sellers, edit details or run the link. Maya can remove him; Theo can leave. A removed co-seller sees "You're no longer on Fall clear-out".

### Possible Approach
1. `emailInvites/{saleId}_{emailLower}` with `saleName` and `inviterName` copied in; `memberJoinedAt` on the sale.
2. The invites listener (verified email only) and the auto-join transaction in `GoingOnce.tsx`, once per invite id per session; a refused join is dropped quietly.
3. Remove (seller) and leave (self) as transactions touching only `members`, `memberJoinedAt`, `lastEditedAt`.
4. Removal: the open sale leaving my-sales or a `permission-denied` under it shows `RemovedFromSale` with the sale's name captured before clearing.
5. Role in the UI: one `getThingOffer(status, role)` and the Sale tab read the role from `ownerUid`.
6. Rules per the matrix: invite create/delete for the seller, invitee read and delete-on-join, the join clause modelled on Waypoint's `isTripEmailInviteJoinValid`, remove and leave. `deleteSale` also deletes the sale's invites.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Add co-seller in the Sale tab's People header opens `AddCoSellerSheet`.
- [ ] **Read:** People rows (Maya, seller; Theo, co-seller; a not-yet-joined email as "Waiting for them to sign in"); for Theo, the sale in Your sales and the intro card.
- [ ] **Update:** not applicable (a role never changes).
- [ ] **Delete:** Remove in a co-seller row's sheet (seller); cancel a waiting invite; Leave this sale (co-seller).

### Success Criteria
- [ ] Flow complete in this issue: the seller adds; the invitee sees the sale on opening the app; the seller sees them joined; the seller removes or cancels; the co-seller leaves; a removed co-seller lands on the removal screen. None is deferred.
- [ ] An invitee reads only their invite, never the sale, before joining.
- [ ] `firestore.rules` per the matrix for `sales` membership and `emailInvites`, and every earlier path re-run as co-seller and removed co-seller, against the base rules.
- [ ] Seed updated: Theo as Maya's co-seller; an unjoined invite.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 7: The public page and its link

**Prerequisites:** Issue 6
**Target PR Size:** ~450 lines (functions included; split the share module move into its own small PR if it runs over)
**Files:**
- `functions/src/share/` (new: id minting, file copy under a new token, files-first delete, moved from Pinch with no app words; Pinch's functions import it)
- `functions/src/apps/going-once/salePageView.ts`, `getSalePage.ts`, `changeSalePublicLink.ts`, `functions/src/index.ts`, `functions/README.md`
- `scripts/checks/goingOnceShare.ts` (mirrored constants and `isListable`), `package.json`
- `src/apps/going-once/SalePage.tsx`, `components/public/BuyerCard.tsx`, `BuyerThingDrawer.tsx`, `components/sales/LinkCard.tsx`, `queries/salePageQueries.ts`, `types.ts`
- `src/routes/AppRoutes.tsx` (`/going-once/s/:linkId`), `src/ui/Layout.tsx` (shorten the route for presence), `cloudflare-worker.js` (`pages` entry)
- `functions/src/apps/going-once/deleteSale.ts` (link and public folder)
**Context:** `TECHNICAL.md` "Decisions this design makes" (live page), "What leaves for the public page", `publicLinks`, "Backend Surface" (`getSalePage`, `changeSalePublicLink`); `UX.md` S14, B1–B3, B7–B10; `docs/conventions/security-privacy.md`.

### Description
Maya turns the public page on and copies the link; Theo can copy and open it. Priya opens it signed out and sees the Available and Pending things with their public fields, live. Maya can get a new address or turn it off; an old or unknown link says "This sale isn't here anymore". Photos show placeholders until Issue 8.

### Possible Approach
1. Move Pinch's share helpers to `functions/src/share/`; Pinch's tests and share flows still pass.
2. `changeSalePublicLink` (`create`, `renew`, `stop`; seller; refuses a co-seller as `not-found`) writes `publicLinks/{id}` and `publicLinkId`/`publicLinkChangedAt`.
3. `getSalePage`: one path for every not-found case; the allowlist in `salePageView.ts`, applied when shaping and again before returning; `isMember` for the signed-in caller.
4. `SalePage` with `useNoIndex`, `salePageQueryOptions` (`staleTime` 30 s, `useOnTabReturn`), B9's "This is your sale's public page" line for members.
5. `LinkCard` in the Sale tab: the switch and ⋯ for the seller; Copy link (`CopyTextButton`) and Open for both.
6. Rules: the sale's `publicLink*` keys refused to every client write; no rule for `publicLinks` (denied).

### CRUD & Entry-Point Requirements
- [ ] **Create:** the Sale tab's "Public page on" switch (seller).
- [ ] **Read:** `/going-once/s/<linkId>` signed out; Open on the link card and the Things ⋯.
- [ ] **Update:** ⋯ Get a new address, with its confirm.
- [ ] **Delete:** the switch off; Delete this sale ends it too.

### Success Criteria
- [ ] The response body, read raw as signed out, another signed-in person and a member, holds no field outside the allowlist (no uid, floor price, notes, original price while off, inquiry).
- [ ] A malformed, unknown, stopped, renewed-away and deleted id give byte-identical answers.
- [ ] Opening the page signed in writes no link id to presence, logs or storage (grep each).
- [ ] `firestore.rules`: `publicLink*` refused to seller and co-seller writes; `publicLinks` denied to all four columns, against the base rules.
- [ ] Seed updated: Fall clear-out has a public link.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 8: Photos on the public page

**Prerequisites:** Issue 7
**Target PR Size:** ~300 lines
**Files:**
- `functions/package.json` (`sharp`), `functions/src/apps/going-once/syncSalePublicPhotos.ts`, `changeSalePublicLink.ts` (full sync on create and renew), `getSalePage.ts` (photo paths), `functions/src/index.ts`, `functions/README.md`
- `storage.rules` (the public path)
- `src/apps/going-once/components/public/BuyerCard.tsx`, `BuyerThingDrawer.tsx`
**Context:** `TECHNICAL.md` "Public copies", Storage table, "Backend Surface".

### Description
Priya sees each thing's photos, smaller than the stored ones, a few seconds after Maya adds them. When a thing sells or a photo is removed, its copies go; a new address gets its own copies.

### Possible Approach
1. Trigger on thing writes: re-read the thing and the sale, list `public/{linkId}/{itemId}/`, make missing 480px and 1,280px WebP copies of the first 12 photos with `sharp` (auto-rotate, metadata stripped), each under a new download token; delete copies no longer wanted.
2. `changeSalePublicLink` create and renew run the sync for every thing; renew removes the old folder after the new one exists.
3. `getSalePage` returns `photos: { s, m }[]` paths; cards use `FallbackImage`.
4. Storage: `get` for anyone on the patterned public path; `list` and write refused.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a photo added to a showing thing gets copies.
- [ ] **Read:** cards and the buyer drawer show them.
- [ ] **Update:** reorder changes the cover on the page.
- [ ] **Delete:** sold, taken off, photo removed, link off or renewed: copies gone.

### Success Criteria
- [ ] No listing-size file is reachable from the public page; copies carry no EXIF location.
- [ ] A rerun of the trigger changes nothing; out-of-order runs converge.
- [ ] `storage.rules`: public `get` allowed signed out on a real path, `list` refused, a malformed path refused, writes refused for all four columns.
- [ ] Seed checked: the seed script runs the sync (or the emulator trigger does) so seeded pages show photos.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 9: I'm interested, and the Inbox

**Prerequisites:** Issue 7
**Target PR Size:** ~450 lines
**Files:**
- `functions/src/apps/going-once/submitSaleInterest.ts`, `salePageView.ts` (limits), `deleteSale.ts` (inquiries, limits), `functions/src/index.ts`, `functions/README.md`
- `src/apps/going-once/components/public/InterestView.tsx`
- `src/apps/going-once/components/inbox/InboxTab.tsx`, `InquiryRow.tsx`, `InquiryDrawer.tsx`, `store/listeners/inquiriesListener.ts`, `store/actions/inquiryActions.ts`, `types.ts`, `constants.ts`
- `firestore.rules`, `firestore.indexes.json`
- `scripts/seeds/going-once.ts`
**Context:** `TECHNICAL.md` inquiries schema, "The interest form's limits", "Backend Surface" (`submitSaleInterest`), "Client State Management" (New and Handled listeners); `UX.md` B4–B6, H13–H16.

### Description
Priya taps I'm interested on the Gray sofa, gives her name, a phone number and a message, and sees "Sent". It lands in the Inbox for Maya and Theo, who text her from the inquiry and mark it Handled. A thing that just sold is refused in words.

### Possible Approach
1. `submitSaleInterest` per `TECHNICAL.md`: the one contact field read as email or phone, the visibility check, 100 a day per sale, 40 per thing, the per-instance throttle, the honeypot, the deterministic id and resend behaviour.
2. `InterestView` swapped into the buyer drawer; each status maps to B6's sentence.
3. Listeners: New (`status == NEW`, `lastSentAt desc`) and the 30 newest Handled; the badge from New.
4. `InquiryDrawer`: Text, Call, Email as native links; Mark handled / Back to New as a field-scoped update.
5. Rules: inquiries read, delete and update of `status`, `handledBy`, `handledAt` for members; create refused. Indexes: `(status, lastSentAt desc)`, `(status, handledAt desc)`.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the buyer's I'm interested on the public page.
- [ ] **Read:** the Inbox tab (New, Handled) and the inquiry drawer.
- [ ] **Update:** Mark handled, Back to New; a resend reopens.
- [ ] **Delete:** Delete in the inquiry drawer's More, with confirm.

### Success Criteria
- [ ] Flow: the buyer sends (here); the seller and co-seller see it (here); it resolves by Handled (here); the thing's own list and Hold for come in Issue 10; the push in Issue 13.
- [ ] Each limit answers its own status, verified by driving the callable past it; the IP never appears in a log or document.
- [ ] `firestore.rules`: inquiry create refused to every client; member update outside the three keys refused; `limits` denied to all four columns, against the base rules.
- [ ] `npm run check:indexes` passes with the two new entries.
- [ ] Seed updated: the seven inquiries from `canvas.md` "Example data".
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 10: Who asked about this thing, and older inquiries

**Prerequisites:** Issue 9, Issue 4
**Target PR Size:** ~300 lines
**Files:**
- `src/apps/going-once/hooks/useThingInquiries.ts`, `components/things/ThingDrawer.tsx`, `MarkPendingView.tsx`, `ThingRow.tsx`
- `src/apps/going-once/components/inbox/InboxTab.tsx`, `InquiryDrawer.tsx`, `queries/inquiryQueries.ts`
**Context:** `TECHNICAL.md` "Client State Management" (older Handled, a thing's inquiries), "Thing edits and photos" (deleted things); `UX.md` H1, H4, H5, H14, H15.

### Description
Theo opens the Gray sofa and sees everyone who asked, in order, and holds it for Priya from her inquiry ("Hold Gray sofa for Priya"). Rows show "10:57 AM · Priya asked". Handled loads older inquiries in pages. An inquiry about a deleted thing reads "(No longer listed)".

### Possible Approach
1. `useThingInquiries(itemId)`: a keyed listener mounted only while the drawer is open.
2. `MarkPendingView` gains this thing's inquiries as choices; `pending.inquiryId` and `buyerName` copied in (add `inquiryId` to `ItemPendingRecord` here).
3. "Show older" on Handled as a TanStack infinite query (pages of 30, cursor on `handledAt`, id); the Handled count by `getCountFromServer`, "Handled" with no number until it knows.
4. Rows and drawers resolve `itemId` against loaded things; a missing one shows `itemTitleAtSend` with "(No longer listed)".

### CRUD & Entry-Point Requirements
- [ ] **Create:** not applicable.
- [ ] **Read:** the thing drawer's Interest list; older Handled pages.
- [ ] **Update:** Hold for (Mark pending preset to the inquiry).
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] With 200 Handled inquiries seeded, the Inbox opens with 30 and pages without duplicates or gaps.
- [ ] `firestore.rules` checked: no change; stated in the PR.
- [ ] Seed updated: a deleted thing's inquiry; 200 Handled on the scale fixture.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 11: Relist one thing: copy its text, save its photos

**Prerequisites:** Issue 4
**Target PR Size:** ~250 lines
**Files:**
- `src/utils/fileUtils.ts` (`shareOrDownloadFiles`, shared)
- `src/apps/going-once/components/relist/CopyListingTextRow.tsx`, `SavePhotosRow.tsx`, `utils/listing.ts` (`listingText`), `components/things/ThingDrawer.tsx`, `MarkSoldView.tsx`, `types.ts`
- the Pattern index in `CLAUDE.md`
**Context:** `TECHNICAL.md` "One thing (Save photos)", `listingCopiedAt`; `UX.md` H4, H11; PRODUCT.md "Relisting Elsewhere, In Detail".

### Description
Theo copies the Gray sofa's listing text (name, condition, price, description, "Was $400" only when shown) and saves its photos to his camera roll through the share sheet, then posts it on Marketplace. When he later marks it Sold, the drawer reminds him to take that listing down too.

### Possible Approach
1. `listingText(item)` built from public fields only; `CopyTextButton` on an `ActionRow` with the subtitle naming what it copies.
2. After a successful copy, a field-scoped `updateDoc` of `listingCopiedAt`/`listingCopiedBy` (added here), never blocking the copy.
3. `shareOrDownloadFiles(files, { title })`: `navigator.canShare({ files })` then `share`, else downloads; prefetch the files with `getBlob` when the drawer opens so the share runs inside the tap.
4. `MarkSoldView`'s success shows "Take that listing down too" when `listingCopiedAt` is set.

### CRUD & Entry-Point Requirements
- [ ] **Create:** not applicable.
- [ ] **Read:** the "Post it somewhere else" rows in the drawer.
- [ ] **Update:** Copy listing text sets `listingCopiedAt`.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] The copied text never holds the floor price, notes, where bought, the store's link, original price while off, or any buyer detail.
- [ ] On iOS Safari and Android Chrome the share sheet opens on the first tap; on desktop the photos download.
- [ ] `firestore.rules` checked: no change; stated in the PR.
- [ ] Seed checked: no change.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 12: Save all photos as one zip

**Prerequisites:** Issue 11
**Target PR Size:** ~300 lines
**Files:**
- `functions/package.json` (zip streamer), `functions/src/apps/going-once/buildSalePhotoArchive.ts`, `deleteSale.ts` (export), `functions/src/index.ts`, `functions/README.md`
- `storage.rules` (export path)
- `src/apps/going-once/components/relist/SaveAllPhotosSheet.tsx`, `components/things/ItemsSection.tsx` (⋯ entry)
**Context:** `TECHNICAL.md` "All things (Save all photos)", "Backend Surface"; `UX.md` H12.

### Description
Theo saves every photo of the Available and Pending things in one download: the sheet says "41 photos · about 45 MB · best on Wi-Fi", builds, then downloads a zip with one folder per thing.

### Possible Approach
1. Size from `ItemPhoto.sizeBytes` before building.
2. The callable streams each listing file into a STORE-mode zip and the zip into `exports/photos.zip` with `Content-Disposition: attachment`; folders `NN Name`, files `Name 1.jpg`; refuses above 1,500 photos.
3. The client opens the download URL; building and failure states in the sheet.
4. Storage: members `get` the export; client writes refused.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Save all photos in the Things tab's ⋯.
- [ ] **Read:** the downloaded zip.
- [ ] **Update:** a new build replaces the old file.
- [ ] **Delete:** deleting the sale deletes it.

### Success Criteria
- [ ] 300 photos (about 300 MB) build without the function exceeding 1 GiB, timed in the PR.
- [ ] The zip opens on iPhone Files, Android and desktop with readable folder names, including a name with `/` and emoji.
- [ ] `storage.rules`: export `get` for members only; writes refused for all four columns.
- [ ] Seed checked: no change.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 13: A push when someone's interested, bundled

**Prerequisites:** Issue 9
**Target PR Size:** ~400 lines
**Files:**
- `functions/src/notifications/bundledPush.ts` (new, shared: `queueBundledPush`, `sendDueBundledPushes`, the app hook map), `functions/src/notifications/zonedTime.ts` (moved from Waypoint; Waypoint's imports updated)
- `functions/src/apps/going-once/notifySaleInquiry.ts`, `bundleHooks.ts`, `functions/src/index.ts`, `functions/README.md`
- `src/apps/going-once/components/inbox/PushCapsule.tsx`, `components/sales/SaleTab.tsx` (the switch), `store/actions/peopleActions.ts`, `store/listeners/peopleListener.ts`, `store/actions/saleActions.ts` (`timeZone` on create, backfilled on the seller's open), `types.ts`
- `firestore.rules` (`people/{uid}`)
- `docs/conventions/product.md` ("A push nobody asked for": the bundled rule for a person waiting on you), `docs/conventions/cloud-functions.md` (the bundled path beside `sendBudgetedPush`)
**Context:** `TECHNICAL.md` "Inquiry push" (all of it); `UX.md` R11 and the permission bar; BRIEF R2 OWNER line.

### Description
When Priya asks about the Gray sofa, Maya and Theo get "New interest in Gray sofa". Three more in the next ten minutes arrive as one "3 new inquiries · Gray sofa and 2 more". Nothing buzzes overnight; what came in arrives as one push at 08:00. Each can turn it off for this sale. The lock screen never shows a buyer's name, message or contact.

### Possible Approach
1. Shared `bundledPush.ts` per `TECHNICAL.md` "The window", with no app words; central `pushBundles/{appId}_{uid}`; `isQuietHour` reused; next 08:00 through the moved zoned-time helper.
2. `notifySaleInquiry` on inquiry writes: new or reopened only; recipients are members without the sale in `inquiryPushOffSaleIds`, sale `OPEN`.
3. Going Once's hooks: `confirmItems` (drops Handled, cleared or deleted inquiries, finished sales, people who turned it off or left; keeps an inquiry whose thing was deleted) and `summarize` (the copy in `TECHNICAL.md`).
4. Sale `timeZone` written on create and backfilled when the seller opens a sale without one; a missing zone reads as UTC.
5. Permission bar on a tap (first Inbox open for the seller, first open as co-seller), back up to 3 times after Not now; `enablePushNotifications`.
6. Rules: `people/{uid}` own only; `pushBundles` has no rule.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the first push queues or sends; turning the switch off creates `people/{uid}`.
- [ ] **Read:** the push on the device; the switch's state in the Sale tab.
- [ ] **Update:** the switch on and off.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] Driven on the emulator with a fake clock: one push, then a bundle 15 minutes later, then a 23:00 inquiry delivered at 08:00 in the sale's zone, and an inquiry handled before its bundle left out.
- [ ] Payloads hold no buyer name, message, contact or price (assert in a test).
- [ ] The tap opens the inquiry (one) or the New list (bundle).
- [ ] `firestore.rules`: `people/{uid}` own read/write only; `pushBundles` denied to all four columns.
- [ ] `docs/conventions/product.md` and `cloud-functions.md` updated with the bundled rule; Waypoint's pushes still pass after the helper move.
- [ ] Seed updated: Theo's push switch off for one seeded sale.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 14: Finish the sale, and clear buyers' details 30 days later

**Prerequisites:** Issue 13, Issue 12
**Target PR Size:** ~350 lines
**Files:**
- `functions/src/apps/going-once/finishSale.ts`, `clearSaleContacts.ts`, `submitSaleInterest.ts`, `buildSalePhotoArchive.ts`, `bundleHooks.ts`, `functions/src/index.ts`, `functions/README.md`
- `src/apps/going-once/components/sales/SaleTab.tsx`, `SalesList.tsx`, `components/things/ThingDrawer.tsx` (`getThingOffer` on a finished sale), `store/actions/itemActions.ts`, `types.ts`, `constants.ts`
- `firestore.rules`
- `scripts/seeds/going-once.ts`
**Context:** `TECHNICAL.md` "Finishing a sale and clearing buyer contact", "Thing status" (on a finished sale), "Sale"; `UX.md` (the Finish row and finished states); PRODUCT.md "When Something Goes Sideways".

### Description
Maya finishes Fall clear-out: the page closes, pushes stop, nothing new can be held, and Theo can still mark a Pending thing Sold or not. Thirty days later the buyers' names, contacts and messages are cleared; the totals and history still read. Maya can reopen before then and the clear is cancelled.

### Possible Approach
1. Add `status`, `finishedAt`, `finishedBy`, `contactsClearAt`, `contactsClearedAt` to `Sale` (readers default `status` to `OPEN`), `contactClearedAt` to inquiries, `SaleStatus` and its labels.
2. `finishSale` (finish, reopen) per `TECHNICAL.md`; `submitSaleInterest` and `buildSalePhotoArchive` refuse a finished sale; `confirmItems` drops its items.
3. `clearSaleContacts` daily, chunked, safe to rerun, logging counts only.
4. Mark pending's transaction reads the sale and refuses on a finished one; Your sales shows Finished.
5. Rules: client writes of `status`, `finished*`, `contactsClear*` refused.

### CRUD & Entry-Point Requirements
- [ ] **Create:** not applicable.
- [ ] **Read:** "Finished Nov 2 · buyers' details clear Dec 2" on the Sale tab and in Your sales.
- [ ] **Update:** Finish the sale and Reopen on the Sale tab (seller).
- [ ] **Delete:** the scheduled clear of buyer details.

### Success Criteria
- [ ] On the emulator with a fake clock: finish, reopen at day 10 (no clear), finish again, clear at day 30; a crash mid-clear finishes on the next run.
- [ ] After the clear, no inquiry or thing in the sale holds a buyer name, phone, email or message.
- [ ] `firestore.rules`: the finish keys refused to seller and co-seller writes, against the base rules.
- [ ] Seed updated: a finished sale with contacts due to clear.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

## Next Steps

### Issue 15: Who holds the money

**Prerequisites:** Issue 14
**Target PR Size:** ~350 lines
**Files:** `src/apps/going-once/components/sales/SaleTab.tsx`, a new `components/money/` section, `store/actions/handoverActions.ts`, `types.ts`, `constants.ts`, `utils/totals.ts`, `firestore.rules`, `scripts/seeds/going-once.ts`
**Context:** PRODUCT.md Next Steps ("who holds the money"); `TECHNICAL.md` "Thing status" (`sale.markedBy`), "Totals". `TECHNICAL.md` gains its schema in this issue (a handover record per co-seller, append-only with deterministic ids per `data-contracts.md`).

### Description
Maya sees what each co-seller collected and what they have handed over, and records a handover.

### Possible Approach
1. Collected per person from `sale.markedBy` (who marked it sold), in one pass.
2. A handover is an append-only record under the sale; corrections are new records that name the one they replace.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Record a handover from a co-seller's row.
- [ ] **Read:** per co-seller, collected, handed over and still with them.
- [ ] **Update:** a correction record.
- [ ] **Delete:** not applicable (append-only).

### Success Criteria
- [ ] Figures match a hand count; a correction never double counts.
- [ ] `firestore.rules` updated for the new collection (create only, no update or delete), verified per role.
- [ ] Seed updated with handovers.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 16: Start a later sale from what didn't sell

**Prerequisites:** Issue 14
**Target PR Size:** ~300 lines
**Files:** `src/apps/going-once/components/sales/SaleFormSheet.tsx`, `store/actions/saleActions.ts`, `functions/src/apps/going-once/copyUnsoldThings.ts` (new: copies photos server-side), `functions/src/index.ts`, `functions/README.md`
**Context:** PRODUCT.md Next Steps; `TECHNICAL.md` "Data Schema" (a thing, Storage).

### Description
Maya starts a new sale carrying over the Available and Pending things of a finished one, photos included, without their status, inquiries or history.

### Possible Approach
1. A callable copies chosen things and their listing files into the new sale under new ids, leaving the old sale untouched.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Start from Fall clear-out's leftovers" on Start a sale.
- [ ] **Read:** the copied things on the new sale's Things tab.
- [ ] **Update:** not applicable.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] Copies carry no buyer name, inquiry, sale record or history; photos are new files.
- [ ] `firestore.rules` and `storage.rules` checked: the callable writes as admin; no client widening.
- [ ] Seed checked.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 17: What's left at the end: kept, given away or donated

**Prerequisites:** Issue 14
**Target PR Size:** ~200 lines
**Files:** `src/apps/going-once/components/things/ThingDrawer.tsx`, `types.ts`, `constants.ts`, `store/actions/itemActions.ts`, `utils/totals.ts`
**Context:** PRODUCT.md Next Steps; `TECHNICAL.md` "Thing status" (WITHDRAWN).

### Description
On a finished sale, each thing still Available is marked kept, given away or donated, and the Sale tab counts them.

### Possible Approach
1. A `withdrawnReason` on withdrawn things (`KEPT | GIVEN_AWAY | DONATED`, with its option list), set in the Take off the list transaction.

### CRUD & Entry-Point Requirements
- [ ] **Create:** not applicable.
- [ ] **Read:** the reason on the row and the Sale tab counts.
- [ ] **Update:** change the reason from More.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] Legacy withdrawn things read as "Taken off the list" with no reason.
- [ ] `firestore.rules` checked: no change.
- [ ] Seed updated.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

## Beyond

### Issue 18: Photos in, a name and description out

**Prerequisites:** Issue 3
**Target PR Size:** ~350 lines
**Files:** a new callable under `functions/src/apps/going-once/`, `NewThingFlow.tsx`, `functions/README.md`
**Context:** PRODUCT.md Stretch Goals; `docs/conventions/security-privacy.md` "Every AI-backed feature requires sign-in"; `getAiReadFailureMessage`.

### Description
After the photos, Maya can ask for a suggested name, condition and description, and reviews them before they save.

### Possible Approach
1. A signed-in callable reads the cover photo with the site's AI reader and returns suggestions; nothing is written until she accepts.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Suggest from the photos" on the name question.
- [ ] **Read:** the suggestion card.
- [ ] **Update:** accept fills the answers.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] No AI request without sign-in; a failure uses `getAiReadFailureMessage`.
- [ ] `firestore.rules` checked: no change.
- [ ] Seed checked.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 19: A room's worth at once

**Prerequisites:** Issue 3
**Target PR Size:** ~400 lines
**Files:** `src/apps/going-once/components/things/RoomBatchFlow.tsx` (new), `store/actions/itemActions.ts`
**Context:** PRODUCT.md Stretch Goals; `TECHNICAL.md` "Thing edits and photos".

### Description
Maya picks thirty photos and sorts them into things on one screen, then names and prices each.

### Possible Approach
1. Group picked photos into draft things on the device; each becomes a thing (and its uploads) only when it gets a name or is confirmed.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Add a room at once" beside New thing.
- [ ] **Read:** the new things on the list.
- [ ] **Update:** move a photo between drafts.
- [ ] **Delete:** drop a draft before it saves.

### Success Criteria
- [ ] Thirty photos on a mid-range phone without the tab reloading.
- [ ] `firestore.rules` and `storage.rules` checked: no change.
- [ ] Seed checked.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 20: A printable flyer with a QR code

**Prerequisites:** Issue 7
**Target PR Size:** ~250 lines
**Files:** `src/apps/going-once/components/sales/FlyerSheet.tsx` (new), a vendored QR encoder with its licence beside it
**Context:** PRODUCT.md Stretch Goals; CLAUDE.md "A vendored third-party asset".

### Description
Maya prints a flyer for the building board: the sale's name, pickup area and a QR code to the public page.

### Possible Approach
1. Encode the link on the device (no third-party request); a print stylesheet.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Print a flyer" on the link card (seller).
- [ ] **Read:** the print preview.
- [ ] **Update:** not applicable.
- [ ] **Delete:** not applicable.

### Success Criteria
- [ ] The QR scans to the current link; a renewed link needs a new flyer and the sheet says so.
- [ ] `firestore.rules` checked: no change.
- [ ] Seed checked.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 21: A co-seller's share of what they sold

**Prerequisites:** Issue 15
**Target PR Size:** ~200 lines
**Files:** `src/apps/going-once/components/money/`, `types.ts`, `utils/totals.ts`
**Context:** PRODUCT.md Stretch Goals; Issue 15.

### Description
Maya sets a co-seller's share (a percent), and the money section shows what it comes to.

### Possible Approach
1. A per-member share in basis points (`parsePercentToBps`), applied to what they marked sold.

### CRUD & Entry-Point Requirements
- [ ] **Create:** set a share on a co-seller's row.
- [ ] **Read:** their share beside collected.
- [ ] **Update:** change it.
- [ ] **Delete:** clear it.

### Success Criteria
- [ ] Integer cents throughout; rounding stated.
- [ ] `firestore.rules` checked: seller-only write of the share.
- [ ] Seed updated.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 22: Other apps onto the shared photo set and bundled push

**Prerequisites:** Issue 2, Issue 13
**Target PR Size:** ~300 lines per app moved
**Files:** each moved app's photo picker and push function, `CLAUDE.md` Pattern index
**Context:** CLAUDE.md "When a UI primitive is promoted to `src/components`"; `TECHNICAL.md` "Inquiry push" (the shared window).

### Description
Apps that pick several photos for one record, or push when a person is waiting on someone, move onto `PhotoSetPicker` and the bundled push. Doesn't block Going Once.

### Possible Approach
1. Survey the other apps' multi-photo pickers and "waiting on you" pushes; move each identical copy, leaving apps whose push isn't a person waiting on budgeted pushes.

### CRUD & Entry-Point Requirements
- [ ] Not applicable: no entity changes.

### Success Criteria
- [ ] Each moved app's flows behave as before, with before/after screenshots.
- [ ] `firestore.rules` checked: no change.
- [ ] Seed checked.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.

### Issue 23: Use the store's photo from its link

**Prerequisites:** Issue 3
**Target PR Size:** ~300 lines
**Files:** a new callable under `functions/src/apps/going-once/` (`importSaleItemPhoto`), `functions/src/index.ts`, `functions/README.md`, `ThingForm.tsx`, `ThingDrawer.tsx`, `itemActions.ts`, `types.ts`, `storage.rules`
**Context:** `TECHNICAL.md` "Data Schema" (`boughtUrlPreview`, `ItemPhoto`), "Thing edits and photos"; `UX.md` "Where you got it"; `docs/conventions/security-privacy.md` (fetching a page a person pasted).

### Description
When Maya pastes the Wayfair link for the oak desk and its preview carries a product picture, the form asks "Add the store's photo to Oak desk?". Yes adds it as the thing's next photo, marked "Store photo", and she can make it the cover or move it like any other. The photo is copied into the sale's own storage, so the listing never depends on the store's page staying up.

### Possible Approach
1. A signed-in, member-only callable takes `{ saleId, itemId }`, reads `boughtUrlPreview.imageUrl` from the thing (never a URL from the client), fetches it server-side with a size and type cap (JPEG, PNG or WebP, at most 10MB, `https` only, no private hosts), shrinks it to the `listing` size with sharp, stores it beside the other photos and appends an `ItemPhoto` with `source: 'STORE'` in a transaction that refuses a 13th.
2. The offer shows once per link in `ThingForm` after the preview arrives, only when the thing has fewer than 12 photos; No thanks is remembered on the thing (`storePhotoOfferedFor: string | null`).
3. `PhotoSetPicker` shows a small "Store photo" caption on such a photo; Make cover and the move controls work unchanged.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Add the store's photo" after the link's preview, in the form.
- [ ] **Read:** the photo in the strip with its "Store photo" caption.
- [ ] **Update:** Make cover, Move earlier, Move later as for any photo.
- [ ] **Delete:** Remove, with undo, as for any photo.

### Success Criteria
- [ ] The callable refuses a non-member, a missing preview image, a non-image answer and a file over the cap, each in words in the form; it never fetches a URL the client sent.
- [ ] Copy tells the seller it is the store's picture, so she can choose her own photo as the cover for Marketplace.
- [ ] `firestore.rules` and `storage.rules`: the new photo path is written by the function only; checked on the emulator as seller, co-seller, another signed-in person and signed out, against the base rules too.
- [ ] Seed updated: one seeded thing has a store link with a preview image.
- [ ] Every field, type and rules clause added here is used by this issue.
- [ ] Release and validation: the PR carries one release label per CLAUDE.md "Release hygiene" (`minor` for a feature, `patch` for a fix), `npm run typecheck` and `npx eslint .` pass, and the feature was driven in a real browser at phone width in light and dark.
- [ ] Docs current: the PRODUCT.md Build Plan lines the issue delivers are checked off (and the README's Status list), and `UX.md`, `TECHNICAL.md` and the app's rules files still match what shipped.
