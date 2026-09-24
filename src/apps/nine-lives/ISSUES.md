# Nine Lives — Issue Roadmap

> Companion to `nine-lives-TDD.md`. Each issue references types, paths, and patterns defined there — read that first if something here seems underspecified.

> **Tiers** mirror the README's Core MVP / Next Steps / Stretch Goals split, plus one final cross-app alignment issue that isn't a Nine Lives feature at all. Within a tier, issues are ordered by prerequisite, not importance. Push notification work is deliberately sequenced late — the UI should work end-to-end first.

> **On security rules and seed data**: per the TDD's Security Rules Design Criteria, every issue below that adds or changes a Firestore collection or field includes updating `firestore.rules` (and `storage.rules` where files are involved) and updating seed data as an explicit success criterion — not an assumed side effect that gets forgotten.

## Tier: MVP

### Issue 1: Central Redux Store Foundation, Optimistic Slice Utility & Firestore Listener Utility

**Prerequisites:** None

**Target PR Size:** ~300 lines

**Files:**

* `src/store/index.ts`
* `src/store/slices/userSlice.ts`
* `src/store/actions/globalActions.ts`
* `src/store/listeners/createFirestoreCollectionListener.ts`
* `src/store/utils/createOptimisticCollectionSlice.ts`
* `src/App.tsx`
* `src/contexts/AuthContext.tsx`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "Client State Management (Redux Toolkit)" section in full before starting — this issue implements exactly what's described there (store shape, `resetAllState`, the optimistic slice factory, the listener utility). This is the one issue in the roadmap that isn't Nine Lives-specific, so treat the TDD as the spec even though the code lives outside `src/apps/nine-lives/`.

#### Description

Introduce Redux Toolkit to the repo for the first time. Pure infrastructure — no Nine Lives-specific code — since every later issue builds on it, including the final cross-app alignment issue in this roadmap.

#### Possible Approach

1. Add `@reduxjs/toolkit` and `react-redux`.
2. Build `createOptimisticCollectionSlice.ts`: a generic factory producing `setAll`/`upsertOneOptimistic`/`removeOneOptimistic`/`revertOne` reducers, with `resetAllState` handled in `extraReducers`.
3. Build `createFirestoreCollectionListener.ts`: a generic `onSnapshot` wrapper that normalizes docs and dispatches.
4. Build `userSlice.ts` and `globalActions.ts` (`resetAllState`).
5. Wire `configureStore` in `store/index.ts`; export typed `useAppDispatch`/`useAppSelector`.
6. Wrap `App.tsx` with `<Provider store={store}>`.
7. In `AuthProvider`, dispatch into `userSlice` whenever `onAuthStateChanged`'s user changes, and dispatch `resetAllState` on UID change (covers both sign-out and `DevAccountSwitcher`).

#### Success Criteria

- [ ] Redux DevTools shows the store with `user` populated correctly after sign-in.
- [ ] Switching accounts via `DevAccountSwitcher` clears any previously-loaded user-scoped state via `resetAllState`.
- [ ] `createOptimisticCollectionSlice` and `createFirestoreCollectionListener` have no Nine Lives-specific imports or assumptions.

### Issue 2: App Registration, Manifest, Branding & Cloudflare OG Worker Integration

**Prerequisites:** None

**Target PR Size:** ~200 lines

**Files:**

* `public/manifest-nine-lives.json`
* `public/logos/by-app/logo-nine-lives.svg`
* `public/banners/by-app/banner-nine-lives.png`
* `cloudflare-worker.js`
* `src/lib/app/app.constants.ts`
* `src/lib/app/app.registry.ts`

**Context:** Read `src/apps/nine-lives/README.md`'s "The short" and "Under the Hood" sections for the app's name, framing, and positioning before writing manifest copy or branding placeholders.

#### Description

Register Nine Lives as an official mini-app: manifest, placeholder branding assets, and Cloudflare worker OG meta tag injection, following the same pattern Worth the Wait already uses.

#### Possible Approach

1. Create `manifest-nine-lives.json` with name, colors, and icon paths.
2. Add placeholder `logo-nine-lives.svg` and `banner-nine-lives.png`.
3. Register `nine-lives` in `app.registry.ts` with route `/nine-lives`.
4. Update `cloudflare-worker.js` to serve dynamic OG previews for `/nine-lives` paths.

#### Success Criteria

- [ ] Nine Lives appears in the app catalog on the home screen.
- [ ] `/manifest-nine-lives.json` loads successfully.
- [ ] Shared links to `/nine-lives` render correct OG meta tags.

### Issue 3: Household Model, Security Rules & Onboarding

**Prerequisites:** Issue 1, Issue 2

**Target PR Size:** ~350 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Household types)
* `src/apps/nine-lives/store/slices/householdsSlice.ts`
* `src/apps/nine-lives/store/actions/householdsActions.ts`
* `src/apps/nine-lives/store/listeners/householdListener.ts`
* `src/apps/nine-lives/components/HouseholdSetupModal.tsx`
* `src/apps/nine-lives/hooks/useNineLivesSync.ts`
* `src/apps/nine-lives/NineLives.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "1. Household" (Data Schema) and "Security Rules Design Criteria" sections before starting. The membership-check helper this issue builds gets reused by every later issue's rules, so it's worth getting right against the criteria rather than the minimum needed for this issue alone.

#### Description

Create the `Household` document (auto-created, pre-filled as "{Name}'s household," including the dormant `inviteCode`/`pendingMembers` fields), household-membership security rules, and the app's entry point. This is the foundational rule set every later issue's rules build on — get the relationship-based membership check right here once, per the Security Rules Design Criteria, rather than re-deriving it per collection.

#### Possible Approach

1. Define `Household`/`PendingHouseholdMember` types.
2. Build `householdsSlice`/`householdsActions` (create, rename) and `householdListener` (query by `members array-contains uid`).
3. Build `HouseholdSetupModal` shown on first entry, pre-filled from the signed-in user's display name, editable before confirming.
4. Build `useNineLivesSync(householdId)` to wire the household-level listeners (extended by later issues).
5. Write Firestore rules for `apps/nine-lives/households/{householdId}` scoped to `members`, and a reusable `isHouseholdMember(householdId)` rules helper function that every later collection's rules can call rather than re-implementing the membership check.

#### Success Criteria

- [ ] A new user entering Nine Lives is prompted with a pre-filled household name and can rename it before confirming.
- [ ] The household document is only readable/writable by UIDs in `members`.
- [ ] Reopening the app skips onboarding and loads the existing household directly.
- [ ] The `isHouseholdMember()` rules helper is written once and reusable by every subsequent issue's rules, per the Security Rules Design Criteria.

### Issue 4: Cat Profiles, Preset Option Lists & Key Dates

**Prerequisites:** Issue 3

**Target PR Size:** ~380 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Cat types)
* `src/apps/nine-lives/constants/presetOptions.ts`
* `src/apps/nine-lives/store/slices/catsSlice.ts`
* `src/apps/nine-lives/store/actions/catsActions.ts`
* `src/apps/nine-lives/store/listeners/catsListener.ts`
* `src/apps/nine-lives/components/CatCard.tsx`
* `src/apps/nine-lives/components/CatGrid.tsx`
* `src/apps/nine-lives/components/CatProfileForm.tsx`
* `src/apps/nine-lives/components/InsuranceCard.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "2. Cat" (Data Schema) section, and `src/apps/nine-lives/README.md`'s "For Cats" section for why fields like lifestyle and shelter origin exist — several of them aren't arbitrary and shouldn't get simplified away during implementation.

#### Description

Full cat profile CRUD: preset breed/insurance-provider options (each with a custom-entry fallback), and key-date tracking (adoption date plus arbitrary custom dates). Personality traits and diet reuse the same combobox pattern this issue establishes but are their own Next Steps-tier issues (15 and 16) — the `Cat` type already carries both fields; this issue just doesn't build UI for them yet.

#### Possible Approach

1. Define `Cat`, `CatKeyDate` types (all dates as millisecond timestamps, not strings).
2. Build `presetOptions.ts` with `CAT_BREEDS` and `INSURANCE_PROVIDER_OPTIONS`.
3. Build `catsSlice` (via `createOptimisticCollectionSlice`), `catsActions` (create/update/delete, optimistic per the established pattern), and `catsListener`.
4. Build `CatProfileForm` with combobox-style selects (preset + custom) for breed and insurance provider, plus the key-dates sub-form.
5. Build `CatCard`/`CatGrid` for the household dashboard and `InsuranceCard` for the profile detail view.
6. Write Firestore rules for `apps/nine-lives/households/{householdId}/cats/{catId}` using the `isHouseholdMember()` helper from Issue 3, validating only the security-critical fields (`householdId` immutable, `createdBy` matches auth) per the Security Rules Design Criteria — not an exhaustive field allowlist.

#### Success Criteria

- [ ] Creating a cat with only required fields succeeds; all optional fields (photo, lifestyle, microchip, shelter origin, key dates, insurance) can be added later without a rules change, since optional-field additions don't require new rule allowances per the Security Rules Design Criteria.
- [ ] Breed and insurance-provider fields offer preset options plus free-text entry.
- [ ] A failed profile update rolls back to the previous values in the UI.
- [ ] Firestore rules and seed data (`scripts/seeds/nineLives.ts`, once Issue 13 exists) both reflect the `Cat` shape.

### Issue 5: Vet Clinics & Doctors

**Prerequisites:** Issue 3

**Target PR Size:** ~280 lines

**Files:**

* `src/apps/nine-lives/types.ts` (VetClinic, Doctor types)
* `src/apps/nine-lives/store/slices/vetClinicsSlice.ts`
* `src/apps/nine-lives/store/slices/doctorsSlice.ts`
* `src/apps/nine-lives/store/actions/vetClinicsActions.ts`
* `src/apps/nine-lives/store/actions/doctorsActions.ts`
* `src/apps/nine-lives/store/listeners/vetClinicsListener.ts`
* `src/apps/nine-lives/store/listeners/doctorsListener.ts`
* `src/apps/nine-lives/components/VetClinicFormModal.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "3. Vet Clinic" and "4. Doctor" sections, including the note on why doctors are scoped per clinic rather than per household.

#### Description

Vet clinics and the doctors seen at them, including the emergency-clinic flag used by Issue 12's readiness nudge.

#### Possible Approach

1. Define `VetClinic`, `Doctor` types.
2. Build both slices/actions/listeners, following the Issue 4 pattern.
3. Build `VetClinicFormModal` (name, phone, address, `isEmergency24Hour` toggle).
4. Add doctor creation as an inline "add new" option wherever a doctor select appears (used by Issue 9's visit form) — the same upsert-on-first-mention pattern used again in Issue 10 for custom health record types.
5. Write Firestore rules for both collections using `isHouseholdMember()`.

#### Success Criteria

- [ ] A clinic can be flagged as 24-hour emergency capable.
- [ ] Selecting a clinic on a doctor form scopes the doctor list to that clinic.
- [ ] Typing a new doctor name that doesn't match an existing one creates a `Doctor` document for future reuse.
- [ ] Rules and seed data cover both collections.

### Issue 6: Vaccination & Weight Tracking

**Prerequisites:** Issue 4, Issue 5

**Target PR Size:** ~350 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Vaccination, WeightEntry types)
* `src/apps/nine-lives/store/slices/vaccinationsSlice.ts`
* `src/apps/nine-lives/store/slices/weightEntriesSlice.ts`
* `src/apps/nine-lives/store/actions/vaccinationsActions.ts`
* `src/apps/nine-lives/store/actions/weightEntriesActions.ts`
* `src/apps/nine-lives/store/listeners/vaccinationsListener.ts`
* `src/apps/nine-lives/components/VaccinationFormModal.tsx`
* `src/apps/nine-lives/components/VaccinationTimeline.tsx`
* `src/apps/nine-lives/components/WeightEntryFormModal.tsx`
* `src/apps/nine-lives/components/WeightHistoryList.tsx`
* `firestore.rules`
* `firestore.indexes.json`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "6. Vaccination" and "7. Weight Entry" sections closely, especially the "On history" note — the append-only, one-document-per-event design is deliberate and shouldn't be redesigned into a "current status" model during implementation. Also read the "Snapshot listeners" subsection under Client State Management for why vaccinations load eagerly via a collection group rather than per-cat.

#### Description

Standalone vaccination and weight logging. Each is a discrete, append-only event (one dose, one measurement) — the full history for a cat is simply every document for that cat, nothing more to build for "history" beyond correct sorting. Includes the household-wide eager-loading query for vaccinations (`collectionGroup`) that later powers the due-dates timeline.

#### Possible Approach

1. Define `Vaccination`, `WeightEntry` types (both include `linkedVisitId`, populated later by Issue 9's outcome flow, but functional standalone before that exists).
2. Build `vaccinationsListener` as a `collectionGroup('vaccinations')` query filtered by `householdId`, subscribed in `useNineLivesSync` (not per-cat).
3. Build `weightEntriesSlice`/listener as a standard per-cat, lazily-loaded subcollection (subscribed in `useCatDetailSync`).
4. Build `VaccinationFormModal`/`VaccinationTimeline` and `WeightEntryFormModal`/`WeightHistoryList`.
5. Add the required composite index for the collection group query to `firestore.indexes.json`.
6. Write Firestore rules: the `vaccinations` collection group rule is the one place that genuinely needs the denormalized `householdId` field checked directly (a collection-group read can't reason about ancestor documents the way a normal nested-path rule can) — this is a case where a slightly more specific rule is warranted, not a violation of the "avoid over-fitting" criterion, since collection-group reads are structurally different from a normal path check.

#### Success Criteria

- [ ] A cat's full vaccination history is visible without any additional query beyond what's already loaded.
- [ ] Vaccinations from every cat in the household are available for Issue 12's due-dates timeline without opening individual cats.
- [ ] Weight entries display in chronological order per cat.
- [ ] The collection-group rule correctly restricts reads to the requester's own household's vaccinations, verified against a second household's data in the seed set.

### Issue 7: Condition Library Browsing & Cat Conditions

- [x] Complete

**Prerequisites:** Issue 4

**Target PR Size:** ~330 lines

**Files:**

* `src/apps/nine-lives/types.ts` (LibraryCondition, CatCondition types)
* `src/apps/nine-lives/store/slices/conditionLibrarySlice.ts`
* `src/apps/nine-lives/store/slices/catConditionsSlice.ts`
* `src/apps/nine-lives/store/actions/catConditionsActions.ts`
* `src/apps/nine-lives/store/listeners/conditionLibraryListener.ts`
* `src/apps/nine-lives/store/listeners/catDetailListeners.ts` (catConditions portion)
* `src/apps/nine-lives/components/ConditionLibraryBrowser.tsx`
* `src/apps/nine-lives/components/CatConditionFormModal.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "9. Condition Library" and "10. Cat Condition" sections, particularly why `linkedVisitIds` is an array here (unlike vaccinations/weight entries) — a condition can span many visits over time, and that reasoning shouldn't get lost during implementation.

#### Description

Browsing the shared condition library and attaching conditions or custom incidents (including accidents/injuries) to a specific cat. `CatCondition.linkedVisitIds` is an array from the start, since an ongoing condition can reasonably be discussed across many visits over time — Issue 9 is what actually populates it.

#### Possible Approach

1. Define `LibraryCondition`, `CatCondition` types (`linkedVisitIds: string[]`, not a single ID).
2. Build `conditionLibrarySlice`/listener (global, read-only).
3. Build `catConditionsSlice`/actions/listener (per-cat, lazy).
4. Build `ConditionLibraryBrowser` (search/filter by category) and `CatConditionFormModal` (pick from library or enter a fully custom entry).
5. Write rules: `conditionLibrary` read-only to any authenticated user, no client writes; `catConditions` scoped by household membership.

#### Success Criteria

- [ ] A condition can be attached to a cat either from the library or as a custom entry with no `libraryConditionId`.
- [ ] Custom entries never write back into `conditionLibrary` — verified by a rules test, not just app-level logic.
- [ ] Filtering the library by category (including `injury`) works correctly.
- [ ] Seed data includes at least one condition library entry per category, including `injury`.

### Issue 8: Symptom Log with Quick Tags

**Prerequisites:** Issue 4

**Target PR Size:** ~280 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Symptom types)
* `src/apps/nine-lives/store/slices/symptomsSlice.ts`
* `src/apps/nine-lives/store/actions/symptomsActions.ts`
* `src/apps/nine-lives/store/listeners/catDetailListeners.ts` (symptoms portion)
* `src/apps/nine-lives/components/SymptomFormModal.tsx`
* `src/apps/nine-lives/components/SymptomTimeline.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "11. Symptom" section and `src/apps/nine-lives/README.md`'s "For Cats" section — the quick tags exist specifically because cats mask illness through subtle behavior changes, so the tag set shouldn't be trimmed to "generic pet symptoms" during implementation.

#### Description

Per-cat symptom logging with cat-specific quick-tap tags (litter box changes, appetite, hiding, playfulness, grooming) alongside free text. `linkedVisitIds` is an array here too, for the same reason as conditions — a recurring symptom can be discussed across more than one visit.

#### Possible Approach

1. Define `Symptom`, `SymptomQuickTag` types (`linkedVisitIds: string[]`).
2. Build `symptomsSlice`/actions/listener (per-cat, lazy).
3. Build `SymptomFormModal` with quick-tag chip selection plus a free-text description, and optional condition linking (visit linking comes from Issue 9's outcome flow, but the field and query support exist here).
4. Build `SymptomTimeline`.
5. Write rules scoped by household membership.

#### Success Criteria

- [x] A symptom can be logged with quick tags only, free text only, or both.
- [x] Linking a symptom to a condition works from the symptom form.
- [x] Rules and seed data cover the collection.

### Issue 9: Visit Scheduling, Multi-Cat Support, Follow-Ups & Visit Outcome Flow

**Prerequisites:** Issue 5, Issue 6, Issue 7, Issue 8

**Target PR Size:** ~420 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Visit types)
* `src/apps/nine-lives/store/slices/visitsSlice.ts`
* `src/apps/nine-lives/store/actions/visitsActions.ts`
* `src/apps/nine-lives/store/listeners/visitsListener.ts`
* `src/apps/nine-lives/utils/dateHelpers.ts` (`getDefaultVisitTitle`)
* `src/apps/nine-lives/components/VisitFormModal.tsx`
* `src/apps/nine-lives/components/VisitTimeline.tsx`
* `firestore.rules`

**Context:** This is the most detail-dependent issue in the roadmap — read `src/apps/nine-lives/TECHNICAL.md`'s "8. Visit" section, the full "Visit Outcome Flow" subsection (including "Linking convention" and the Firestore filtering note), and "Household Due-Dates Timeline" before starting. Getting the five `linked*Ids` arrays and the batched-write requirement right here is what makes Issue 12's dashboard and the per-condition/symptom visit history actually work correctly.

#### Description

Household-level visit scheduling supporting one or more cats per entry, follow-up visits that reference the original, a derived default name based on time-of-day and date, and the outcome flow that lets completing a visit create vaccinations, conditions, weight entries, and symptoms in the same pass. This is the integration point of the whole feature set, which is why it's the largest issue and depends on four others.

#### Possible Approach

1. Define `Visit` types: `catIds: string[]`, `reason` (including `follow_up`), `customReasonLabel`, `followUpOfVisitId`/`followUpNote`, `title`, and the five `linked*Ids` forward arrays (`linkedSymptomIds`, `linkedConditionIds`, `linkedHealthRecordIds`, `linkedVaccinationIds`, `linkedWeightEntryIds`).
2. Build `getDefaultVisitTitle(scheduledAt)` — a pure function deriving something like "Morning Visit — Mar 4" from the time-of-day bucket and date; `title` stays optional so the derived value is never actually stored unless overridden.
3. Build `visitsSlice`/actions/listener at the household level (not nested under a cat).
4. Build `VisitFormModal` with multi-cat selection, a reason picker (including follow-up, which prompts for the original visit and an optional note), and clinic/doctor selects.
5. Add the outcome step: marking a visit completed offers per-cat quick-entry for vaccinations (Issue 6), weight (Issue 6), conditions (Issue 7), and symptoms (Issue 8). Each write is a batched Firestore write updating both sides of the link atomically — the child's `linkedVisitId`/`linkedVisitIds` and the visit's corresponding forward array — so the two never drift out of sync.
6. Build `VisitTimeline` for the household dashboard.
7. Write rules scoped by household membership; note that a visit write which also touches a symptom/condition's `linkedVisitIds` is a multi-document batch, so the rules for each collection must independently permit the relevant household member's write — there's no cross-document rule needed, just correct per-collection membership checks.

#### Success Criteria

- [x] A single visit can be created for two or more cats and shows up correctly on each cat's individual timeline.
- [x] A follow-up visit correctly links to its original visit and displays the optional note.
- [x] Completing a visit can create a vaccination, a condition, a weight entry, and a symptom in one flow, each correctly linked back, with the visit's forward arrays updated in the same batch.
- [x] Skipping the outcome step entirely still allows marking a visit completed.
- [x] A visit's default title reflects its time-of-day and date, and can be overridden.

#### CRUD & Entry-Point Requirements

- [x] Schedule a visit from the household dashboard and view it in the household timeline.
- [x] View visits in each linked cat's detail view.
- [x] Edit visit details after creation.
- [x] Cancel or delete a visit with confirmation; deleting an original clears follow-up references.

#### Documentation

- [x] README and this technical roadmap describe the shipped visit flow.

### Issue 10: Health Record File Uploads & Custom Record Types

**Prerequisites:** Issue 4

**Target PR Size:** ~330 lines

**Files:**

* `src/apps/nine-lives/types.ts` (HealthRecord, CustomHealthRecordType types)
* `src/apps/nine-lives/store/slices/healthRecordsSlice.ts`
* `src/apps/nine-lives/store/slices/customHealthRecordTypesSlice.ts`
* `src/apps/nine-lives/store/actions/healthRecordsActions.ts`
* `src/apps/nine-lives/store/actions/customHealthRecordTypesActions.ts`
* `src/apps/nine-lives/store/listeners/catDetailListeners.ts` (healthRecords portion)
* `src/apps/nine-lives/components/HealthRecordUploadModal.tsx`
* `src/apps/nine-lives/components/HealthRecordList.tsx`
* `firestore.rules`
* `storage.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "5. Health Record" section in full, including the rejected client-side-aggregation alternative — the reasoning there explains why `CustomHealthRecordType` is its own entity rather than a free-text field, and is worth understanding before touching this code rather than re-deriving it.

#### Description

PDF/image upload and management for a cat's health records, plus persisted custom record types so a user-invented label (e.g. "Allergy Test") gets typed once and offered as a select afterward — the same upsert-on-first-mention pattern as `Doctor` from Issue 5, rather than free text re-typed per record or an expensive client-side aggregation over every record to find prior labels.

#### Possible Approach

1. Define `HealthRecord` and `CustomHealthRecordType` types.
2. Build `customHealthRecordTypesSlice`/actions (household-scoped, small reference list) — same shape as `doctorsSlice`.
3. Build `healthRecordsSlice`/actions/listener (per-cat, lazy).
4. Build `HealthRecordUploadModal`: file picker restricted to PDF/image, a record type select (built-ins plus custom types, with inline "add new" creating a `CustomHealthRecordType` on first mention), optional record date.
5. Build `HealthRecordList`.
6. Add Storage rules scoping uploads to the household's UID path, and Firestore rules for both collections.

#### Success Criteria

- [x] Uploading a PDF or image succeeds and appears in the cat's record list immediately.
- [x] Attempting to upload an unsupported file type is rejected client-side with a clear message.
- [x] Typing a new custom record type label once makes it available as a select option on every subsequent record, for any cat in the household.
- [x] Only household members can read or write a given cat's health record files, verified in both `firestore.rules` and `storage.rules`.

#### CRUD & Entry-Point Requirements

- [x] Upload a record from the dedicated Records tab on a cat's details view.
- [x] Open a record's uploaded file from the record list.
- [x] Edit record metadata without re-uploading the file.
- [x] Delete a record with confirmation, removing both its Firestore document and Storage file.

#### Documentation

- [x] README and this technical roadmap describe the shipped health record flow.

### Issue 11: Budgeting Tool with Default Category Presets

**Prerequisites:** Issue 4

**Target PR Size:** ~300 lines

**Files:**

* `src/apps/nine-lives/types.ts` (Expense types)
* `src/apps/nine-lives/store/slices/expensesSlice.ts`
* `src/apps/nine-lives/store/actions/expensesActions.ts`
* `src/apps/nine-lives/store/listeners/catDetailListeners.ts` (expenses portion)
* `src/apps/nine-lives/utils/budgetCalculators.ts`
* `src/apps/nine-lives/components/ExpenseFormModal.tsx`
* `src/apps/nine-lives/components/BudgetSummary.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "13. Expense" section and the "Budgeting math (derived, not stored)" subsection — the monthly/lifetime totals are computed at read time, not stored fields, and the exact math (including how recurring expenses factor into the lifetime total) is specified there.

#### Description

Per-cat expense tracking with default category presets, monthly totals, and a running lifetime total.

#### Possible Approach

1. Define `Expense`, `ExpenseCategory` types.
2. Build `expensesSlice`/actions/listener (per-cat, lazy).
3. Build `budgetCalculators.ts` implementing the monthly/lifetime math from the TDD.
4. Build `ExpenseFormModal` (category presets, recurring toggle) and `BudgetSummary`.
5. Write rules scoped by household membership.

#### Success Criteria

- [ ] A recurring expense contributes correctly to both the monthly and lifetime totals.
- [ ] Editing or deleting an expense updates both totals immediately.
- [ ] All default categories are selectable, plus an "other" fallback.
- [ ] Rules and seed data cover the collection.

### Issue 12: Emergency Readiness & Household Due-Dates Timeline

**Prerequisites:** Issue 4, Issue 5, Issue 6, Issue 9

**Target PR Size:** ~340 lines

**Files:**

* `src/apps/nine-lives/types.ts` (EmergencyInfo types)
* `src/apps/nine-lives/store/slices/emergencyInfoSlice.ts`
* `src/apps/nine-lives/store/actions/emergencyInfoActions.ts`
* `src/apps/nine-lives/store/selectors.ts`
* `src/apps/nine-lives/components/EmergencyReadinessBanner.tsx`
* `src/apps/nine-lives/components/DashboardQuickActions.tsx`
* `src/apps/nine-lives/components/DashboardDueDatesTimeline.tsx`
* `src/apps/nine-lives/components/NineLivesLayout.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "Household readiness" and "Household Due-Dates Timeline (independent of push notifications)" subsections closely — the second one explicitly explains why this issue must not take a dependency on the `Reminder` entity or push infrastructure, even though "reminders" is a natural word to reach for here.

#### Description

Ties several earlier issues together into the household dashboard: emergency-contact readiness nudges, and a full past-and-upcoming timeline of visits and vaccination due dates (roughly a year out), computed entirely from data already loaded via `visits`/`vaccinations` — **this has no dependency on the push notification issues later in this roadmap.** The "due soon" framing from earlier drafts of this plan is intentionally broadened here: past items show too (grayed out, like a printed vet visit summary), not just what's imminent.

#### Possible Approach

1. Define `EmergencyInfo` types; build its slice/actions.
2. Implement `selectIsHouseholdEmergencyReady` and `selectHouseholdDueDatesTimeline` (merging visits + vaccination `expiresAt`, past and future, with an `isPast` flag) in `selectors.ts`.
3. Build `EmergencyReadinessBanner` (dismisses itself once emergency info or insurance exists).
4. Build `DashboardDueDatesTimeline` grouping into "This month," "Next 3 months," "Beyond," and "Past," and `DashboardQuickActions` (opens `VisitFormModal` pre-selecting multiple cats).
5. Assemble `NineLivesLayout` around these.
6. Write rules for `emergencyInfo` scoped by household membership.

#### Success Criteria

- [ ] The emergency readiness banner disappears once an emergency clinic or phone number is on file.
- [ ] The dashboard timeline shows both past (grayed out) and upcoming visits/vaccinations, out to roughly a year, without navigating into any specific cat.
- [ ] A quick-action CTA can create a visit for two or more cats without opening either cat's profile first.
- [ ] This issue ships and is fully functional with no `Reminder`/push notification infrastructure in place.

### Issue 13: Reference Data Seeding

**Prerequisites:** Issue 3

**Target PR Size:** ~350 lines

**Files:**

* `scripts/seeds/nineLives.ts`
* `scripts/seed.ts`
* `scripts/seeds/types.ts`
* `SEEDING.md`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "Reference library population" subsection, and skim the full Data Schema section to know which fields the demo fixtures should exercise. Also read `scripts/seeds/worthTheWait.ts` directly as the structural precedent this should follow.

#### Description

Seed the shared reference collections (`conditionLibrary`, `vaccineLibrary`, `glossary`, `resources`) from a public data source, plus a demo household/cats for local development, following the existing `scripts/seeds/worthTheWait.ts` pattern. Because this can be built in parallel with several other MVP issues, revisit it once Issues 4-12 land to confirm the demo data still reflects every field introduced since (diet and personality traits included, once Issues 15/16 exist) — per the Security Rules Design Criteria, seed data is expected to be kept current as part of whichever issue changes the schema, but a final pass here catches anything missed.

#### Possible Approach

1. Source feline condition, vaccine, and glossary data from a public reference (research and pick one during implementation; document the source in `SEEDING.md`).
2. Write `seedNineLives()` upserting `conditionLibrary`, `vaccineLibrary`, `glossary` (with `relatedResourceIds` links), and `resources`.
3. Seed a demo household with one or two fixture cats exercising most fields (vaccinations, a visit with an outcome flow, an expense, a custom health record type).
4. Register the new scope in `scripts/seed.ts` and document it in `SEEDING.md`.

#### Success Criteria

- [ ] Running the seed script populates all four reference collections idempotently.
- [ ] Glossary terms correctly reference related resources.
- [ ] A fresh emulator environment has a usable demo household after seeding, reflecting the current schema as of the latest merged issue.

## Tier: Next Steps

### Issue 14: Glossary & Resource Browsing

**Prerequisites:** Issue 13

**Target PR Size:** ~250 lines

**Files:**

* `src/apps/nine-lives/types.ts` (GlossaryTerm, Resource types)
* `src/apps/nine-lives/store/slices/glossarySlice.ts`
* `src/apps/nine-lives/store/slices/resourcesSlice.ts`
* `src/apps/nine-lives/store/listeners/glossaryListener.ts`
* `src/apps/nine-lives/store/listeners/resourcesListener.ts`
* `src/apps/nine-lives/components/GlossaryBrowser.tsx`
* `src/apps/nine-lives/components/ResourceBrowser.tsx`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "17. Glossary Term" and "18. Resource" sections — the cross-linking between the two (`relatedResourceIds`/`relatedGlossaryTermIds`) is what this browsing UI needs to surface.

#### Description

Read-only browsing UI for the glossary and resource library seeded in Issue 13, with glossary terms linking through to their related resources.

#### Possible Approach

1. Define `GlossaryTerm`, `Resource` types.
2. Build both slices/listeners (global, read-only).
3. Build `GlossaryBrowser` (searchable term list) and `ResourceBrowser`, with a glossary term linking to its `relatedResourceIds`.
4. Confirm rules already permit read-only access for any authenticated user (should already be true from earlier issues' reference-library pattern).

#### Success Criteria

- [ ] Searching the glossary for a term (e.g. "FVRCP") returns its definition.
- [ ] Selecting a glossary term's related resource navigates to that resource's content.

### Issue 15: Cat Personality Traits

**Prerequisites:** Issue 4

**Target PR Size:** ~120 lines

**Files:**

* `src/apps/nine-lives/constants/presetOptions.ts` (add `PERSONALITY_TRAIT_OPTIONS`)
* `src/apps/nine-lives/components/CatProfileForm.tsx`

**Context:** Read `src/apps/nine-lives/README.md`'s Next Steps list to confirm this is intentionally scoped smaller than the other cat-profile fields — no new collection or rules change is expected here.

#### Description — the `Cat.personalityTraits` field already exists from Issue 4; this wires it into the profile form using the same preset-plus-custom combobox pattern already established for breed and insurance.

#### Possible Approach

1. Add `PERSONALITY_TRAIT_OPTIONS` to `presetOptions.ts`.
2. Add a multi-select combobox field to `CatProfileForm` for personality traits.

#### Success Criteria

- [x] Personality traits can be selected from presets or entered as custom tags, and persist correctly.

### Issue 16: Cat Diet Tracking

**Prerequisites:** Issue 4

**Target PR Size:** ~180 lines

**Files:**

* `src/apps/nine-lives/components/CatDietForm.tsx`
* `src/apps/nine-lives/components/CatProfileForm.tsx`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "2. Cat" section for the `CatDiet` shape and the note on why diet is structured rather than folded into freeform care instructions.

#### Description

Structured diet tracking per cat — food type, brand, feedings per day, automatic feeder use, and treats/snacks — using the `Cat.diet` field already defined in Issue 4's types. Kept structured rather than folded into freeform care instructions, since these are concrete, comparable facts.

#### Possible Approach

1. Build `CatDietForm` as a sub-section of the cat profile: food type (dry/wet/mixed), brand, feedings-per-day stepper, automatic feeder toggle, treats free text, notes.
2. Wire it into `CatProfileForm`.

#### Success Criteria

- [ ] Diet information saves and displays correctly on the cat profile.
- [ ] All diet fields are optional — a cat profile without diet info set still displays cleanly.

## Tier: Beyond (Stretch)

### Issue 17: Central Cross-App Reminder & Push Notification Infrastructure

**Prerequisites:** Issue 1

**Target PR Size:** ~350 lines

**Files:**

* `src/store/slices/remindersSlice.ts`
* `src/store/listeners/remindersListener.ts`
* `src/lib/notifications/requestPushPermission.ts`
* `src/lib/notifications/registerDeviceToken.ts`
* `src/lib/notifications/scheduleReminder.ts`
* `functions/src/notifications/sendDueReminders.ts`
* `functions/src/index.ts`
* `firestore.rules`

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "19. Reminder" section and the "Reminder lifecycle (push notifications specifically — Beyond MVP)" subsection — note it explicitly says this is distinct from, and not a prerequisite for, the due-dates timeline built in Issue 12.

#### Description

Build the reminder system as shared infrastructure any mini-app can call — deliberately sequenced late in this roadmap. The due-dates visibility that matters most for MVP (Issue 12) already works without this; this issue is specifically about the proactive push notification, which is a genuine stretch goal, not a blocker for the rest of Nine Lives shipping.

#### Possible Approach

1. Register the FCM service worker alongside the existing PWA `registerSW` setup.
2. Build `requestPushPermission` and `registerDeviceToken` (writes into `users/{uid}.fcmTokens`).
3. Build `remindersSlice` (via `createOptimisticCollectionSlice`) and `remindersListener` filtered by `targetUids array-contains uid`.
4. Build `scheduleReminder(input)` as a thin, app-agnostic helper that writes a `Reminder` doc.
5. Build `sendDueReminders` as an `onSchedule` Cloud Function (e.g. every 5 minutes): query `reminders` where `status == 'pending' && scheduledFor <= now`, send via `admin.messaging().sendEachForMulticast`, mark `status: 'sent'`.
6. Add Firestore rules for `reminders` per the Security & Privacy Requirements above.

#### Success Criteria

- [x] A manually-created `Reminder` with `scheduledFor` in the past triggers a push notification within one scheduled run.
- [x] The `reminders` slice reflects only reminders where the signed-in user is in `targetUids`.
- [x] `scheduleReminder()` is callable without any Nine Lives-specific imports.

### Issue 18: Wire Nine Lives to the Reminder System

**Prerequisites:** Issue 17, Issue 6, Issue 9

**Target PR Size:** ~220 lines

**Files:**

* `src/apps/nine-lives/store/actions/visitsActions.ts`
* `src/apps/nine-lives/store/actions/vaccinationsActions.ts`
* `src/apps/nine-lives/store/actions/preventivesActions.ts`
* `src/apps/nine-lives/store/actions/litterBoxesActions.ts`
* `src/apps/nine-lives/store/actions/litterEntriesActions.ts`
* `src/apps/nine-lives/store/actions/catsActions.ts`
* `src/apps/nine-lives/utils/reminders.ts` (new, shared scheduling/cancellation helper)
* `src/apps/nine-lives/utils/catAnniversaries.ts` (exports `nextOccurrenceOnOrAfter` for reuse)
* `src/apps/nine-lives/components/AttentionSection.tsx` (shows the time alongside "Today" for visits due today)

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "Reminder lifecycle" subsection for exactly when reminders should fire (a day before a visit; near a vaccination's `expiresAt`), and `src/lib/notifications/scheduleReminder.ts`'s own signature from Issue 17 rather than guessing its shape.

#### Description

Connects Nine Lives to the central reminder infrastructure built in Issue 17: scheduling a reminder when a visit is created, and when a vaccination's due date approaches. Expanded past the original scope, based on follow-up feedback, to cover every other date-driven "needs attention" item the same way: preventives (mirroring vaccinations), litter box changes, and cats' birthdays/adoption anniversaries (yearly-recurring, via `Reminder.recurrence` from Issue 17).

#### Possible Approach

1. In `createVisit`, call `scheduleReminder()` with `targetUids: household.members`, `scheduledFor` one day before `scheduledAt`, and `relatedEntityPath` pointing at the visit.
2. In `createVaccination`/`updateVaccination` and `createPreventive`/`updatePreventive`, schedule two reminders per `expiresAt` if present — a week before (matching the dashboard's own due-soon window) and the day of.
3. Cancel the associated reminder(s) if a visit is rescheduled or cancelled, or a vaccination/preventive's `expiresAt` changes.
4. In `litterEntriesActions.ts`, recompute a box's "litter change coming up" reminder (two days before the 30-day overdue mark) from its latest full-change entry whenever one is created, edited, or deleted.
5. In `createCat`/`updateCat`, schedule a yearly-recurring reminder for the birthday, and one more for the adoption anniversary if `adoptedAt` is set.

#### Success Criteria

- [x] Scheduling a visit creates a corresponding `Reminder` targeting all household members.
- [x] Rescheduling or cancelling a visit cancels the stale reminder rather than leaving it pending.
- [x] A vaccination with an `expiresAt` date produces a reminder a week before and a reminder the day of.
- [x] A preventive with an `expiresAt` date produces the same pair of reminders.
- [x] Logging a full litter change reschedules that box's "coming up" reminder to two days before its next 30-day mark.
- [x] A cat's birthday and (if set) adoption anniversary each produce a yearly-recurring reminder.

## Tier: Cross-App Alignment (final)

### Issue 19: Migrate Worth the Wait to the Shared Redux Infrastructure

**Prerequisites:** Issue 1

**Target PR Size:** ~450 lines

**Files:**

* `src/apps/worth-the-wait/store/slices/*.ts` (new: space, boxes, items, activeAction)
* `src/apps/worth-the-wait/store/actions/*.ts` (new)
* `src/apps/worth-the-wait/store/listeners/*.ts` (new)
* `src/apps/worth-the-wait/hooks/useSpace.ts`, `useBoxes.ts`, `useItems.ts`, `useActiveAction.ts`, `useMemberUpdates.ts`, `useWelcomeModal.ts` (removed or thinned to nothing)
* `src/apps/worth-the-wait/context/*.ts`, `WorthTheWaitProvider.tsx` (removed)
* `src/apps/worth-the-wait/components/*.tsx` (updated to read via `useAppSelector`)

**Context:** Read `src/apps/nine-lives/TECHNICAL.md`'s "Client State Management (Redux Toolkit)" section as the pattern to replicate, and `src/apps/worth-the-wait/README.md`/`TECHNICAL.md` for Worth the Wait's own existing data model and behavior before changing how it's wired — this issue must not change what Worth the Wait does, only how its state is managed.

#### Description

Not a Nine Lives feature — this is the follow-up alignment work flagged from the start of this planning process: bringing Worth the Wait onto the same Redux Toolkit patterns Nine Lives established, so the whole repo shares one state management approach instead of two. Sequenced last because it depends only on the foundational Issue 1, not on anything Nine Lives-specific, and doesn't block any Nine Lives feature from shipping.

#### Possible Approach

1. Define `WorthTheWaitState` (space, boxes, items, activeAction) exported from `worth-the-wait/store/index.ts`, mirroring `NineLivesState`'s pattern exactly.
2. Replace `useSpace`, `useBoxes`, `useItems`, `useActiveAction` with slices (via `createOptimisticCollectionSlice` where applicable) plus thunks and listeners (via `createFirestoreCollectionListener`), following Nine Lives' conventions.
3. Remove `WorthTheWaitContext`/`WorthTheWaitProvider`; components read via `useAppSelector`/`useAppDispatch` directly, the same shift Nine Lives made from the start.
4. Pull the current user from `state.user.currentUser` instead of `useAuth()` wherever only identity — not auth actions like sign-out — is needed.
5. Verify `resetAllState` correctly clears Worth the Wait state on account switch, same as Nine Lives.

#### Success Criteria

- [ ] All existing Worth the Wait functionality (space creation/joining, boxes, items, reveals, presence-gated actions) behaves identically after migration.
- [ ] No `WorthTheWaitContext`/`WorthTheWaitProvider` remain; all state access goes through `useAppSelector`.
- [ ] Switching accounts via `DevAccountSwitcher` correctly resets Worth the Wait state via the shared `resetAllState` action.
- [ ] No regressions to existing Firestore security rules — this issue changes client state management only, not the data model or rules.