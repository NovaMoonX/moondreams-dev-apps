# Pinch — Issue Roadmap

Tiers mirror the README's Core MVP / Next Steps / Stretch Goals (Beyond). Within a tier, issues are ordered by prerequisite, and each issue adds only the fields, types and rules clauses it uses. Issue numbers here are this roadmap's own until the issues are filed; then each is labeled with its tier and set to Pinch on the board's Apps field. Each MVP issue is a vertical slice a person can use in the running app, with its Create and Read paired.

Every issue's Success Criteria end with the same two checks, written once here and listed in each issue so they can't be skipped: **(1)** `SITE_VERSION` bumped (minor), `npx tsc -b --force` and `npx eslint .` pass, and the feature was driven in a real browser at 390×844 in light and dark; **(2)** the README Build Plan lines it delivers are checked off and `UX.md`, `TECHNICAL.md` and the Pinch rules files still match what shipped. Any issue that adds or changes a field, permission, path or collection also updates `firestore.rules` (and `storage.rules`) in the same PR, verified on the emulator as owner, another user and signed out, and says in the PR whether `firestore.indexes.json` changed.


## MVP

### Issue 1: Register Pinch, make it reachable, and refresh the root README's app list

**Prerequisites:** The approved Pinch `README.md`, `UX.md` and `TECHNICAL.md` are committed under `src/apps/pinch/` (`TECHNICAL.md` is the TDD) in an initial docs PR. That PR is not one of these issues.
**Target PR Size:** ~250 lines (mostly the registry entries and docs)
**Files:**
- `public/banners/by-app/banner-pinch.png` (new)
- `public/logos/by-app/logo-pinch.svg` (new)
- `src/routes/AppRoutes.tsx` (a lazy `/pinch` route)
- `src/apps/pinch/Pinch.tsx` (new; a placeholder screen)
- `src/lib/app/app.registry.ts` (one entry)
- `src/lib/types/appCatalog.ts` (one catalog entry)
- `cloudflare-worker.js` (exactly one new entry in its app registry)
- `README.md` (root: the "Current apps" list)

**Context:** Read the registry comment at the top of `src/lib/app/app.registry.ts` (it lists what must stay in sync), `src/apps/pinch/README.md` (name, tagline, the 🧂 identity) and the root `README.md`'s "Current apps" and PWA sections. Pinch is a draft app, like the others.

### Description
Make Pinch a real mini-app that opens to a placeholder screen, so every later issue can be opened and checked in the running app. In the same PR, add Pinch to the root README's app list, in the format the list already uses (emoji, name, registry description).

### Possible Approach
1. Add the registry entry (`id: 'pinch'`, `name: 'Pinch'`, `path: '/pinch'`, a `createdAt` of today, and a one-sentence description in the same voice as the others) and widen `AppId` in `appCatalog.ts`.
2. Create `Pinch.tsx` as a placeholder (a title and one muted line), exported as the default, and add the lazy route in `AppRoutes.tsx` following the A-List entry exactly (including `ProtectedRoute` if it uses it).
3. Add no per-app manifest (the site installs as one app through `manifest-main.json`; each mini-app only gets its tab icon and title from its logo). Add the logo SVG (a salt-pinch mark in the orange accent) and the banner PNG (same dimensions as the other banners).
4. Add exactly one entry to `cloudflare-worker.js`'s app registry, copying A-List's shape without its `params`. Change nothing else in the file.
5. Root `README.md`: add one line for Pinch, in registry order, with its emoji and registry description.
6. Do not touch `src/apps/pinch` data code or `SITE_VERSION` beyond the standard bump.

### CRUD & Entry-Point Requirements
- [ ] No entity in this issue.
- [ ] **Entry point:** `/pinch` opens the placeholder from the running app, and the app appears with its logo on the home screen's app list, matching how the other draft apps appear.

### Success Criteria
- [ ] The two net-new asset files exist and the route resolves in the running app.
- [ ] Registry and catalog entries are added; the home screen shows Pinch, and its tab shows the Pinch logo and title.
- [ ] `cloudflare-worker.js` gained exactly one entry and nothing else changed.
- [ ] The root README lists Pinch with an emoji and the registry's description, in registry order.
- [ ] No Firestore field, rule or seed is introduced (so none is required).
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 2: Shell, theme and a browsable ingredient catalog

**Prerequisites:** Issue 1
**Target PR Size:** ~450 lines of hand-written code, plus generated catalog data (the data files are produced by the build script and reviewed by sampling, not line by line)
**Files:**
- `src/apps/pinch/Pinch.tsx`, `types.ts`, `constants.ts`, `pinch.css`
- `src/apps/pinch/hooks/usePinchTheme.ts`
- `src/apps/pinch/components/shell/BottomNav.tsx`, `LoadingSkeleton.tsx`
- `src/apps/pinch/components/kitchen/KitchenScreen.tsx`, `IngredientRow.tsx`, `FamilyGroup.tsx`, `IngredientDrawer.tsx` (read-only)
- `src/apps/pinch/components/shared/IngredientIcon.tsx`, `NutritionLine.tsx`
- `src/apps/pinch/components/recipes/RecipesScreen.tsx`, `calendar/CalendarScreen.tsx` (empty-state placeholders, so the three tabs exist)
- `src/apps/pinch/catalog/*` and `scripts/catalog/buildCatalog.ts`
- `src/apps/pinch/utils/catalogSearch.ts`
- `public/vendor/ingredient-icons/*` and its licence notice
- `src/store/index.ts` (mount `pinch` with an empty reducer shell for now) and `src/apps/pinch/store/index.ts`
- `firestore.rules` (the `apps/pinch` catalog-document block only)
- `.github/instructions/pinch.instructions.md` and `.claude/rules/pinch.md` (identical bodies)
- `CLAUDE.md` / `.github/copilot-instructions.md` (a third-party assets and licences rule, if not already present)

**Context:** Read `TECHNICAL.md`'s "Catalog (constants, not documents)", Theming and Component & File Architecture; `UX.md`'s shell diagram and the Kitchen tab; A-List's `BottomNav.tsx`, `a-list.css`, `useAListTheme` and `a-list.instructions.md` for shape; CLAUDE.md's "Designing a mini-app's look".

### Description
Open Pinch to a three-tab shell: Calendar (left), Recipes (centre, raised) and Kitchen (right), in a warm orange-on-slate theme with light and dark modes. The Kitchen tab already works as a catalog browser: grouped by family, searchable, each ingredient with an icon and a drawer showing its nutrition per 100 g. Calendar and Recipes show friendly empty states.

### Possible Approach
1. Write `buildCatalog.ts`: a one-off author-time script that reads a curated list of ~200 everyday ingredients (staples, produce, proteins, dairy, grains, pantry, and a full spice rack) and pulls nutrition per 100 g from USDA FoodData Central, writing the typed constants (`catalogIngredients.ts`, `catalogFamilies.ts`, `catalogStores.ts` stays for Issue 4). Keep a `source` note per row and the serving size and conversions (`gramsPerMl`, `gramsEach`) the TDD describes. Confirm FDC's licence before committing the output and record it in the PR.
2. Vendor the chosen emoji SVG set with its licence notice; `IngredientIcon` matches an ingredient's `iconKey` (or name) to an SVG and falls back to a generic jar glyph.
3. Build `catalogSearch` once at module load (lowercased name + aliases) and use it for the Kitchen search (`SearchInput` from 8 rows). Group by family with `SectionDivider`, mount groups near the viewport with `LazyMount`.
4. `pinch.css` overrides the semantic tokens on `html.pinch-theme` (orange primary on slate, raised radii, field inset, soft-tint selected pill, tertiary buttons in the normal text colour, the six meal-type colour tokens), switched on by `usePinchTheme()`. Check a filled button, a selected pill, a badge, a highlighted card and a banner in light and dark.
5. `BottomNav` with Recipes centred and raised (check at 320px). `Pinch.tsx` is the sole orchestrator and renders the active tab in a transition.
6. Rules: the `apps/pinch` catalog-document block with the four read predicates, in alphabetical position. Write both Pinch rules files (metaphor, palette roles, shape language, emoji meanings, nudge wording, "missing details appear only as in-context nudge lines").
7. `NutritionLine` renders per-100 g values for now; the opt-in switches arrive in Issue 13.

### CRUD & Entry-Point Requirements
- [ ] No stored entity yet (the catalog is code).
- [ ] **Read:** a person opens `/pinch`, taps Kitchen, scrolls the families, searches "paprika", and opens an ingredient's drawer to see its nutrition.

### Success Criteria
- [ ] Three tabs render with Recipes raised; the app opens on Calendar; each empty state has one muted line.
- [ ] The Kitchen search finds by name and alias and shows one empty state, never results and an empty line together.
- [ ] About 200 catalog ingredients ship, each with a family, nutrition per 100 g, a serving size and an icon or the jar fallback; the data build is reproducible from the script.
- [ ] The theme is correct in light and dark on a filled button, selected pill, badge and highlighted card; nothing outside Pinch is re-themed.
- [ ] Licence notices for the icon set (and the FDC licence outcome) are recorded; "About the numbers" at the end of every View options sheet surfaces them.
- [ ] The `apps/pinch` rule is verified against the emulator (admin allowed, a random user denied per the predicates); no kitchen rule is added yet (state this in the PR); `firestore.indexes.json` is unchanged.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 3: Add your own ingredients and families

**Prerequisites:** Issue 2
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/pinch/types.ts`, `constants.ts` (units, dimensions)
- `src/apps/pinch/components/kitchen/IngredientFormSheet.tsx`, `IngredientDrawer.tsx`, `KitchenScreen.tsx` (+ New, Yours / All pills)
- `src/apps/pinch/components/shared/UnitSelect.tsx`
- `src/apps/pinch/store/slices/ingredientsSlice.ts`, `familiesSlice.ts`, `actions/ingredientActions.ts`, `listeners/kitchenListeners.ts`, `selectors.ts` (`selectIngredientsById`, `selectIngredientFamilies`)
- `src/apps/pinch/hooks/usePinchSync.ts`
- `firestore.rules` (the `kitchens/{uid}` block with `ingredients` and `families`, including the shape validation)
- `scripts/seeds/pinch.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:pinch`), `SEEDING.md`
- `.claude/rules/pinch.md` and `.github/instructions/pinch.instructions.md`

**Context:** Read `TECHNICAL.md`'s `IngredientRecord`, `Family`, resolved-ingredient notes, Redux (two listener tiers, actions) and Security Rules Design Criteria; `UX.md`'s Ingredient details drawer, Kitchen tab and Form Field Organization; A-List's `useAListSync.ts` and its seed for shape references.

### Description
A person can add an ingredient with just a name (a ready-to-eat food like Doritos included), put it in an existing family, a new family or its own, adjust nutrition and a serving size, edit it, and remove it. An adjusted catalog ingredient keeps the person's changes. The Kitchen's Yours pill lists what they've added and adjusted; All shows the whole catalog.

### Possible Approach
1. Types and constants exactly as in the TDD (all keys required, `T | null`); `generateUuid` for ids; the catalog id as the document id for an adjusted catalog ingredient.
2. Slices for `ingredients` and `families`, `resetAllState` handling, and `startIngredientsListener` / `startFamiliesListener` in `listeners/kitchenListeners.ts`, started once from `usePinchSync(uid)` in `Pinch.tsx` (the user tier only).
3. `selectIngredientsById` merges the catalog and the records (record fields fall back to catalog values); `selectIngredientFamilies` groups for Kitchen and hides archived.
4. `IngredientFormSheet` (a `FormSheet`): name and family (`PickOrCreate` with a dashed "New family" pill first, nothing preselected, an "its own family" choice); nutrition per 100 g, a serving size and an icon are chips under "+ Add X". Title "Ingredient"; the verb is on the button.
5. Actions: `saveIngredient` (`setDoc` full shape on create, field-scoped `updateDoc` on edit), `removeIngredient` (plain delete for now behind a destructive `confirm`; the archive-when-in-use check arrives in Issue 17), `saveFamily`.
6. Kitchen: a "+ New" in the header, thin Yours / All `PillGroup`; "Yours" lists custom and adjusted ingredients (and, once later issues land, those with a product or used in a recipe).
7. Rules for `ingredients` and `families` with full shape validation, `T | null`, enum and length checks, immutable `id`/`catalogId`/`createdAt`; seed a custom family, a custom ingredient, an adjusted catalog ingredient and a ready-to-eat food.

### CRUD & Entry-Point Requirements
- [ ] **Create:** + New in Kitchen opens the form; the drawer's "Modify" opens the same form.
- [ ] **Read:** custom and adjusted ingredients appear in Yours; the drawer shows resolved values.
- [ ] **Update:** edit any field; adjusting a catalog ingredient creates its record on first save.
- [ ] **Delete:** the drawer's Modify form has the trash icon with a destructive confirm.

### Success Criteria
- [ ] Every action in the table above works from a reachable screen on a phone; a catalog ingredient adjusted by the person shows the person's values and can be cleared back to the catalog's.
- [ ] Rules verified on the emulator as owner, another user and signed out, including one denied write per integrity rule touched (a bad enum, an oversized name, a changed `catalogId`); a legacy-shaped record (new keys removed) reads and edits fine.
- [ ] The seed includes the new documents and the app's `firestoreDocuments` count is updated; `firestore.indexes.json` unchanged (stated).
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 4: Stores: a list of well-known stores with logos, and your own

**Prerequisites:** Issue 3
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/pinch/catalog/catalogStores.ts`
- `src/apps/pinch/components/shared/StoreLogo.tsx`
- `src/apps/pinch/components/kitchen/StoresSubview.tsx` (merged into `ProductsSubview`, Stores & prices, by the audit), `StoreFormSheet.tsx`, `StorePicker.tsx`, `KitchenScreen.tsx` (a Stores entry row)
- `src/apps/pinch/store/slices/storesSlice.ts`, `actions/storeActions.ts`, `listeners/kitchenListeners.ts`, `selectors.ts`
- `firestore.rules` (`stores`) and `storage.rules` (`apps/pinch/kitchens/{uid}/stores/{storeId}/…`)
- `.env.example` (the logo token name), `src/apps/pinch/constants.ts` (`storeLogoUrl` provider switch)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `Store`, Security & Privacy (the logo token), and open question 1; `UX.md`'s Stores, Store and Product screens; `src/components/forms/PhotoPicker.tsx`, `useImageUpload.ts`, `useStoragePhoto.ts`, `FallbackImage.tsx`. Read the chosen logo provider's terms before writing the URL builder.

### Description
Pinch ships a curated list of well-known grocery stores and warehouse clubs with their logos. A person can open Stores from Kitchen, pick from the list, or add their own with a name and an optional photo or logo; stores without an image get a letter tile. The same `StorePicker` is what products will use in Issue 5.

### Possible Approach
1. **First, decide the logo source** (see open question 1): read the terms and attribution rules, pick one provider (or letter tiles plus uploads only), and put the URL builder behind one function, `storeLogoUrl(domain)`, so the provider can change without touching callers. Record the decision and any attribution row in the PR.
2. `catalogStores.ts`: ~30 stores as `{ id, name, domain }` with `cat-store-…` ids. `StoreLogo` renders the logo with `FallbackImage` (a letter tile as the fallback, `referrerPolicy` set as the provider requires) or the person's own image via `useStoragePhoto`.
3. `Store` type, slice, listener (user tier), selectors, and actions: `saveStore`, `ensureCatalogStore(catalogStoreId)` (create-if-absent in a `runTransaction` so a double tap makes one), `removeStore` (plain delete behind a confirm; the in-use check arrives in Issue 17).
4. `StorePicker` is a `PickOrCreate` of the person's stores with "Show all" opening the well-known list inside the same row (capped height, search past 12). `StoreFormSheet`: search the well-known list, or "Can't find it? Add your own" reveals name and `PhotoPicker`. Images are compressed and uploaded to the Storage path before the document is written.
5. Rules: `stores` shape validation; Storage rules for the store logo path (owner-only, `image/*`, ≤ 5 MB, file name `logo.webp`). Seed two catalog stores and one custom store with a seeded image.

### CRUD & Entry-Point Requirements
- [ ] **Create:** + Add in the Stores subview (reached from the Kitchen's Stores row); picking a well-known store creates the person's own store document.
- [ ] **Read:** the Stores subview lists them with logo, name and product count (zero until Issue 5).
- [ ] **Update:** tapping a store opens the form to rename it or replace its image (a well-known store's name is fixed).
- [ ] **Delete:** the form's trash icon with a destructive confirm.

### Success Criteria
- [ ] Logos load for well-known stores and fall back to a letter tile when blocked or offline; no logo request carries anything but a domain and the publishable token.
- [ ] The chosen provider's terms and any required attribution are met and noted in the PR.
- [ ] Rules and Storage rules verified on the emulator as owner, another user and signed out; one denied write per integrity rule touched.
- [ ] The scale of the list is checked with 5 and with 50 stores.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 5: Products: what you buy, where, and what it costs

**Prerequisites:** Issue 3, Issue 4
**Target PR Size:** ~500 lines
**Files:**
- `src/utils/moneyUtils.ts` (`parseMoneyToCents`, `formatCents`, `centsToInputValue` moved here from `src/apps/a-list/utils/money.ts`; A-List's imports updated)
- `src/apps/pinch/components/kitchen/ProductFormSheet.tsx`, `IngredientDrawer.tsx` (Products section and "Add a product"), `IngredientRow.tsx` (default product line), `ProductsSubview.tsx`, `KitchenScreen.tsx` (a Products entry row)
- `src/apps/pinch/store/slices/productsSlice.ts`, `actions/productActions.ts`, `listeners/kitchenListeners.ts`, `selectors.ts` (`selectDefaultProducts`)
- `firestore.rules` (`products`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `Product`, `saveProduct` and `setDefaultProduct`; `UX.md`'s Product form sheet and Ingredient details drawer; `src/components/MoneyInput.tsx`; the A-List files that import `money.ts`.

### Description
A person attaches products to any ingredient: store, price and package size, with an optional label and link. The first product is the default; later ones can be made the default with a star. Ingredient rows show their default product's store, price and size, and a Products subview lists every product grouped by store.

### Possible Approach
1. Move the money helpers to `src/utils/moneyUtils.ts` with their names unchanged and update A-List's imports in the same PR (no behaviour change; re-drive A-List's ticket form).
2. `Product` type, slice, listener, and `saveProduct`: one `writeBatch` of the product and, for the first live product or an explicit "Make this the default", the ingredient record's `defaultProductId` (an upsert for a catalog ingredient with no record). `setDefaultProduct` confirms the product still exists in a transaction.
3. `ProductFormSheet`: the store question first (`StorePicker`), price (`MoneyInput`) and package size (amount plus `UnitSelect`) side by side, chips for label and link (https only), "Make this the default" from the second product. Opens from the ingredient drawer's "Add a product" (the drawer closes first).
4. Ingredient drawer shows its products with the star; row and sheet edits go through the same form. `removeProduct` re-points `defaultProductId` to another live product or `null` in the same batch (archive-when-in-use arrives in Issue 17).
5. Yours now also includes ingredients that have a product. `ProductsSubview` groups by store (`SectionDivider`) and searches from 8 rows. Rules for `products` with cents and size bounds.

### CRUD & Entry-Point Requirements
- [ ] **Create:** "Add a product" in an ingredient's drawer.
- [ ] **Read:** the drawer's Products list, the row's default-product line, the Products subview, and each store's product count.
- [ ] **Update:** tap a product row to edit; the star changes the default.
- [ ] **Delete:** the form's trash icon with a destructive confirm.

### Success Criteria
- [ ] A product can be added to a catalog ingredient (creating its record) and to a custom one; the default pointer is never left dangling after a removal, even from a second tab (emulator check).
- [ ] Prices are integer cents end to end; a price typed as `$9.5` saves as 950¢ and reopens as `9.50`.
- [ ] Rules verified as owner, other user, signed out; denied writes for a negative price, a zero size, an unknown unit and an `http://` link.
- [ ] A-List still works after the money helpers moved (ticket form re-driven).
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 6: Recipes by hand: create, read, edit and delete

**Prerequisites:** Issue 3
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/pinch/components/recipes/RecipesScreen.tsx`, `RecipeRow.tsx`, `RecipeSubview.tsx`, `RecipeForm.tsx`, `RecipeDrawer.tsx`
- `src/apps/pinch/components/plan/ItemSearch.tsx`, `ServingStepper.tsx`
- `src/apps/pinch/components/shared/CoverImage.tsx`
- `src/apps/pinch/store/slices/recipesSlice.ts`, `actions/recipeActions.ts`, `listeners/kitchenListeners.ts`, `selectors.ts`
- `firestore.rules` (`recipes`) and `storage.rules` (`…/recipes/{recipeId}/cover.webp`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `Recipe`, `saveRecipe` and the recipe rules; `UX.md`'s Recipes tab, Recipe subview (create and edit) and Recipe details; `FormScreen`/`Subview`, `DetailSheet`, `AddFieldChips`, `PhotoPicker`.

### Description
A person writes a recipe by hand — a title, servings and ingredients with amounts and units — then adds steps, a description, times and a cover photo from "+ Add X" chips. Recipes list in the Recipes tab, open in a drawer, and can be edited or deleted. A line may have no amount ("salt to taste"): it saves as its words and is left out of cost and nutrition.

### Possible Approach
1. `Recipe` and `RecipeIngredient` types, slice, user-tier listener and `saveRecipe` (full-shape `setDoc` on create, field-scoped `updateDoc` on edit; a cover uploads to Storage first).
2. `RecipeSubview` hosts `RecipeForm`: title, a servings stepper (halves allowed), ingredient rows (`ItemSearch` over the catalog and the person's ingredients with a "New ingredient" entry that opens the ingredient sheet, amount, `UnitSelect`), "+ Add ingredient", then chips for Steps, Description, Times, Cover photo. Footer: `ModalFooterActions` with the trash icon on edit.
3. `RecipesScreen`: the thin Recipes / Meals `PillGroup` (Meals is empty for now and says so), a `SearchInput` from 8, `RecipeRow` (cover or tinted emoji tile, title, servings, time). `RecipeDrawer` shows ingredients and steps; actions block: Modify, Delete (red, confirm).
4. Rules for `recipes` (array caps, enum, bounds) and Storage for covers. Seed three recipes using catalog and custom ingredients.

### CRUD & Entry-Point Requirements
- [ ] **Create:** + New recipe in the Recipes header opens the Recipe subview.
- [ ] **Read:** the list, and the drawer on tap.
- [ ] **Update:** Modify in the drawer opens the same subview.
- [ ] **Delete:** the subview's trash icon with a destructive confirm (a recipe used by planned days is archived from Issue 17).

### Success Criteria
- [ ] A recipe with 1 and with 60 ingredients both save and read; a 61st is blocked in the UI and denied by the rules.
- [ ] The subview's footer is pinned and reachable at 390×844 and 320px; the list is checked at 5 and 50 recipes.
- [ ] Rules and Storage verified as owner, other user and signed out; legacy-shaped recipe (no `description`, no `cookMinutes`) reads and edits.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 7: Recipe cost, from your own products

**Prerequisites:** Issue 5, Issue 6
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/pinch/utils/quantity.ts`, `unitCost.ts`, `recipeMath.ts`, `gaps.ts`
- `src/apps/pinch/store/selectors.ts` (`selectRecipeCosts`)
- `src/apps/pinch/components/recipes/RecipeRow.tsx`, `RecipeDrawer.tsx` (cost line)
- `src/apps/pinch/components/shared/CostLine.tsx` (a cost with its "leaves out" note; the audit folded it into the recipe drawer's Cost tile and `LeftOutTip`)
- `scripts/checks/pinchMath.ts` (a throwaway worked-examples check)

**Context:** Read `TECHNICAL.md`'s Logic §1 (quantity and cost) and the worked example, Derived values, and open question 9; `UX.md`'s Recipe details.

### Description
Every recipe shows its total cost and cost per serving, calculated from its ingredients' default products. When an amount can't be compared with a package size, or an ingredient has no product, the cost covers what it can and says what it leaves out, by name.

### Possible Approach
1. `quantity.ts`: `toBase`, `bridge` and the dimension tables exactly as in the TDD; `unitCost.ts`: the default (else first live) product's cost per base unit; `recipeMath.ts`: `{ totalCents, perServingCents, leftOut: Gap[] }`; `gaps.ts`: gap kinds only (dismissals arrive in Issue 8).
2. `selectRecipeCosts`: a `createSelector` returning a `Map<recipeId, RecipeCost>`, computed once per change of recipes, products or ingredients.
3. `CostLine` shows "$12.80 · $3.20 / serving" and, when something is left out, "· leaves out 2 ingredients" with the names in the drawer's ingredient list (a muted "no price" or "can't compare" beside the row).
4. Write the worked examples from the TDD as a throwaway `tsx` check (chicken breast 3 lb for $9.48; 2 lb line = $6.32; 1 cup of chicken breast = not comparable; an `EACH` product against an `EACH` line) and run it before the PR; delete it or keep it under `scripts/checks/` per the repo's convention.

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** cost appears on every recipe row and in the recipe drawer.

### Success Criteria
- [ ] The worked examples produce the stated numbers; rounding happens once at the display edge (no drift between a total and the sum of its lines).
- [ ] A recipe with no prices shows no cost tile; the price note under its ingredients invites "See what it costs: … · Add prices", never $0.00.
- [ ] A recipe whose only product changes price updates its cost live; an archived or removed product no longer counts.
- [ ] The recipe list at 200 recipes stays instant at 4× throttle (`selectRecipeCosts` is the only per-recipe computation).
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 8: Gentle nudges for missing details

**Prerequisites:** Issue 7
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/pinch/components/shared/GapNudge.tsx`, `FillInSheet.tsx`
- `src/apps/pinch/components/recipes/RecipeDrawer.tsx`, `kitchen/IngredientRow.tsx` (nudge placement)
- `src/apps/pinch/store/slices/settingsSlice.ts`, `actions/settingsActions.ts` (`saveSettings`), `listeners/kitchenListeners.ts`
- `src/apps/pinch/utils/gaps.ts` (dismissals)
- `firestore.rules` (the `kitchens/{uid}` document: settings shape validation)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Logic §4 (gaps and nudges), `KitchenSettings`, and the rules; `UX.md`'s Nudge and fill-in screen and its wording table; the README's "Filling In As You Go".

### Description
Where a gap changes a number, one quiet line says so and offers to fix it: "2 ingredients need a price · Add prices". Tapping it opens a short sheet that walks through just those ingredients. Closing the line keeps it away for that ingredient. Missing details appear only as these in-context lines. Superseded in the Pinch audit: the close is "Not now", which quiets the line until the page reloads; the stored dismissal is still read but no longer written.

### Possible Approach
1. `KitchenSettings` type, slice and listener; the kitchen document is created lazily by the first `saveSettings` (an early build also created it on a dismissal) (a field-scoped dotted-path write). Rules for the document: `showNutrition` shape, `dismissedNudges` ≤ 500 keys.
2. `gaps.ts` now filters by `dismissedNudges`; `GapNudge` renders only when the filtered list is non-empty (muted text, a link, a ✕ with a 40px hit area).
3. `FillInSheet` (`FormSheet`): one row per ingredient with only the fields that gap needs (a product's store, price and size; a package size for "can't compare"); rows left blank stay unchanged; Save is always available; saving goes through `saveProduct` and clears that ingredient's dismissal keys in the same write.
4. Place the nudge in the recipe drawer under the cost line and on an ingredient row ("No price yet", muted, no ✕). The stats row and meal builder reuse it in Issues 10 and 12.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** the fill-in sheet creates products and sets sizes through the same actions as the full forms.
- [ ] **Read:** the nudge appears wherever a gap changes a number (recipe drawer, ingredient row).
- [ ] **Delete:** ✕ dismisses a nudge for those ingredients; nothing else stores a gap, since gaps are derived from the data.

### Success Criteria
- [ ] Gaps appear only as in-context nudge lines (grep the UI for "task", "to do" and badge usage to confirm nothing else surfaces them).
- [ ] Dismissing, then fixing, then removing the product brings the nudge back (dismissal keys were cleared on the fix).
- [ ] A recipe that arrives with 12 unpriced ingredients still shows one line and a sheet that steps through them.
- [ ] Rules verified: the kitchen document is owner-only and a 501st dismissal key is denied.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 9: Plan a recipe or ingredient on the calendar

**Prerequisites:** Issue 7
**Target PR Size:** ~550 lines (the largest slice: split the day peek off if it runs over)
**Files:**
- `src/apps/pinch/components/calendar/CalendarScreen.tsx`, `MealBarCell.tsx`, `DayDrawer.tsx`, `DayPeek.tsx`, `PlannedMealView.tsx`
- `src/apps/pinch/components/plan/PlanMealSubview.tsx`, `MealBuilder.tsx` (single-item for now)
- `src/apps/pinch/store/slices/plannedMealsSlice.ts`, `actions/plannedMealActions.ts`, `listeners/plannedMealsListener.ts`, `selectors.ts` (`selectPlannedByDay`)
- `src/apps/pinch/utils/dayKeys.ts`, `weeks.ts`
- `src/apps/pinch/hooks/usePinchSync.ts` (the visible-window tier), `usePinchOverlay.tsx`
- `firestore.rules` (`plannedMeals`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `PlannedMeal`, day keys, copy-on-plan, the visible-window listener tier and Calendar notes; `UX.md`'s Calendar, Day drawer, Planned meal and Plan a meal; A-List's `CalendarScreen.tsx`, `PosterCell.tsx` and `selectViewingsByDay`; CLAUDE.md's "A Calendar `renderCell` reads a prebuilt day-keyed map".

### Description
A month calendar where each planned meal is a thin meal-type bar with its emoji. Tapping a day opens its drawer; "+ Add" plans a recipe or ingredient on that day and meal type; a planned meal can be opened, removed and has its cost shown. On a computer, hovering a day peeks at it.

### Possible Approach
1. **Spike first:** prove Dreamer UI's `Calendar` can host the taller cell via `cellClassName`/`monthGridClassName`, and whether it can start the week on Monday (open question 4); record the outcome.
2. `plannedMeals` slice, window listener (`date >= start && date < end` for the shown month ±1, keyed on the window key), `usePinchSync(uid, shownMonth)`; `selectPlannedByDay` builds `Map<dayKey, PlannedMeal[]>` once (`toDateInputValue` keys; the cell's `Date` is keyed with `toLocalDateInputValue`).
3. `MealBarCell`: up to three bars in meal-type order and a "+N"; today accent, selected ring; no per-cell filtering. `DayDrawer` groups by meal type; `DayPeek` is a hover `Popover` with `max-sm:hidden` and the same content.
4. `PlanMealSubview` opens from "+ Add" (the drawer closes first) on the chosen day and type (`PillGroup` of meal types, change day), a single `ItemSearch` over recipes and ingredients, a serving stepper, and "Add to Tuesday". `planMeal` writes a planned meal with `refIds` derived and `date` from `fromDateInputValue`.
5. `PlannedMealView` swaps in place inside the drawer with "‹ Back" and shows items, servings and cost; "Remove from this day" is last (since round 7, in its ⋯ More), red, with a confirm. Calendar empty state offers "Plan your first meal" and "Add a recipe".
6. Check the day math in a timezone behind UTC (`America/Los_Angeles`): a meal planned for Oct 13 reads Oct 13 everywhere.

### CRUD & Entry-Point Requirements
- [ ] **Create:** + Add in a day's drawer.
- [ ] **Read:** bars on the calendar, the day drawer, the planned meal view.
- [ ] **Update:** change items and day arrive in Issue 10; this issue ships create, read and remove only (stated, so the CRUD list is complete by Issue 10).
- [ ] **Delete:** Remove from this day with a destructive confirm.

### Success Criteria
- [ ] Cells show 0, 1, 3 and 5 meals correctly; a day with 10 meals stays readable in the drawer.
- [ ] Dates are correct west of UTC (Playwright with `timezoneId: 'America/Los_Angeles'`).
- [ ] Rules verified as owner, other user, signed out; denied writes for a `date` that isn't UTC midnight and for an item with servings 0.
- [ ] Paging months restarts only the window listener when the window key changes.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 10: Build a meal from several items, with servings on each

**Prerequisites:** Issue 9
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/pinch/components/plan/MealBuilder.tsx`, `ItemSearch.tsx`, `ServingStepper.tsx`, `PlanMealSubview.tsx`
- `src/apps/pinch/components/calendar/PlannedMealView.tsx` (Modify)
- `src/apps/pinch/store/actions/plannedMealActions.ts` (`updatePlannedMeal`)
- `src/apps/pinch/utils/mealMath.ts`
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `MealItem`, the item-cost rows of Derived values and the ingredient serving-size note (open question 11); `UX.md`'s Plan a meal and Planned meal screens.

### Description
A planned meal can hold any mix of recipes and ingredients, each with its own serving count (halves allowed). A person can change a day's items or servings, move it to another day or meal type, and see its total cost with a nudge for what's missing.

### Possible Approach
1. `mealMath.ts`: item cost (`servings ×` recipe per-serving cost, or an ingredient's per-serving cost through its serving size, default 100 g for a custom ingredient) and planned-meal totals with `leftOut`.
2. `MealBuilder`: day and type pills with "Change" (round 7: a framed "When" row that opens the day and meal editor, the header "Plan a meal"), the item search (recipes, ingredients, and later saved meals) with kind labels, per-row steppers and remove controls, a cost line with the `GapNudge`, footer `Cancel` / `Add to Tuesday` (or `Save` when editing).
3. `updatePlannedMeal`: a field-scoped `updateDoc` of `date`, `mealType`, `items`, `refIds`, `name`. Modify in the planned meal view closes the drawer and opens the subview.
4. Add an optional serving-size chip to the ingredient form (so a Doritos item can say what "1 serving" is).

### CRUD & Entry-Point Requirements
- [ ] **Create:** + Add with several items. **Read:** the planned meal view lists items and totals. **Update:** Modify (items, servings, day, type). **Delete:** Remove from this day (Issue 9).
- [ ] **Entry point:** reachable from a day's drawer on the calendar.

### Success Criteria
- [ ] Editing a planned meal changes only that document (another planned meal made from the same recipe is untouched); a recipe edit still reaches it.
- [ ] A meal with 30 items saves; a 31st is blocked and denied by the rules.
- [ ] Cost lines match the TDD examples for a recipe item and an ingredient item.
- [ ] The builder's footer is pinned at 390×844 with 8 items and the keyboard open.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 11: Save meals and plan them again

**Prerequisites:** Issue 10
**Target PR Size:** ~450 lines
**Files:**
- `src/apps/pinch/components/recipes/MealRow.tsx`, `MealDrawer.tsx`, `MealSubview.tsx`, `RecipesScreen.tsx` (the Meals pill)
- `src/apps/pinch/components/plan/MealBuilder.tsx` (recent recipes and saved meals; saved meals are also in the search)
- `src/apps/pinch/components/calendar/PlannedMealView.tsx` (Save to Saved meals, swaps in place)
- `src/apps/pinch/store/slices/mealsSlice.ts`, `actions/mealActions.ts`, `listeners/kitchenListeners.ts`
- `firestore.rules` (`meals`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `Meal`, copy-on-plan and edit-semantics table; `UX.md`'s Recipes tab (Meals), Plan a meal (`PickOrCreate`) and Planned meal.

### Description
A person saves the meals they eat again (adobo chicken with cilantro lime rice and beans) and plans them in a tap. Planning a saved meal copies its items onto that day; the day can then be tweaked without touching the saved meal, and editing the saved meal later leaves days already planned alone. A tweaked day can be saved as a new meal.

### Possible Approach
1. `Meal` slice and listener; `saveMeal` / `removeMeal`; `planMeal` accepts `sourceMealId` and `name` and copies items with new row ids.
2. Meals pill in Recipes: `MealRow`s, `MealDrawer` (items, servings, total cost with nudge, "Plan it" primary that closes the drawer and opens Plan a meal on a chosen day, Modify / Copy / Delete in the muted block); `MealSubview` is the same builder without a day.
3. In `MealBuilder`, recent recipes and saved meals as a captioned pill row while the plate is empty (nothing preselected; round 7: roomy rows with their facts and stock that stay after the first pick) and saved meals in the one search. "Save to Saved meals" lives on a planned meal, which swaps the drawer in place to a name field and Save (`savePlannedAsMeal`).
4. Rules for `meals` (≤ 30 items, shape); seed a few meals and a planned meal copied from one.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Save to Saved meals (from a planned meal) and + New saved meal in the Saved meals pill. **Read:** the Saved meals list and drawer. **Update:** Modify. **Delete:** the subview's trash icon with a destructive confirm (a meal is always deletable: nothing reads `sourceMealId` for display).

### Success Criteria
- [ ] Planning a saved meal, editing the saved meal, then opening the planned day shows the old items; editing the planned day leaves the saved meal as it was.
- [ ] Saving a tweaked day as a meal creates a new document and leaves the original saved meal alone.
- [ ] Rules verified; a meal with no items is denied.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 12: The calendar's stats row and breakdown

**Prerequisites:** Issue 10
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/pinch/components/calendar/StatsRow.tsx`, `BreakdownDrawer.tsx`, `CalendarScreen.tsx`
- `src/apps/pinch/utils/stats.ts`
- `src/apps/pinch/store/selectors.ts` (`selectDayTotals`, `selectMonthStats`)
- `src/components/StatTile.tsx` (use as is)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Derived values (month stats, average per fully priced meal) and open question 6; `UX.md`'s Calendar (stats row) and Breakdown; A-List's `CounterRow` and `StatTile` use.

### Description
Above the month, a stats row shows what the month cost and the average cost per meal. Tapping it opens a breakdown by day or by meal type. When items are left out, the row says so and offers the fill-in sheet. Superseded in the Pinch audit (tranche 1): one summary line and a summary sheet replace the stats row and breakdown. Round 7 brings the stats back as a choice: the Settings tab has "Calendar stats" (off to start; it began as the Calendar's View options "Show stats"), which draws a row of tiles under the summary line for the period shown (Total, Avg per fully priced meal, Per g protein, fully priced while protein is on, and the daily nutrition switched on) and takes the total off the line. A day's drawer carries the same stats for that day: the tiles under its title with "Show stats" on, or a "Stats for this day" row that swaps them in place while it is off and the day has more than its total.

### Possible Approach
1. `selectMonthStats(monthKey)` in one pass over the window's planned meals: `{ spendCents, mealsPriced, avgPerMealCents, leftOut }`; the average, as first built, divided by planned meals that have at least one priced item; round 7 replaced it with the meals that have nothing left out (`fullyPricedMeals`, `avgPerFullyPricedMealCents`), from three of them, because an average of floors read as a real price.
2. `StatsRow` (two `StatTile`s, a `HelpTip` explaining the average, a "leaves out N items · Add prices" `GapNudge` that opens the fill-in sheet for the month's gaps). `BreakdownDrawer`: thin By day / By meal pills and one scrolling list under a fixed header.
3. Check the row at 320px with five-figure amounts and with the nudge present (no height jump when it first appears).

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** the stats row on the Calendar; the breakdown drawer from tapping it; a day's own stats in its drawer (the Total and the nutrition switched on, and the "Stats for this day" row for the cost averages).

### Success Criteria
- [ ] Numbers equal the sum of the visible days for a seeded month; an empty month reads $0.00 and "—".
- [ ] A month with unpriced items shows the left-out note and the nudge; dismissing the nudge never hides the note.
- [ ] The month stats recompute in one pass (no per-cell work) on the scale fixture once Issue 18 lands.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 13: Nutrition, when you want it

**Prerequisites:** Issue 12, Issue 3
**Target PR Size:** ~500 lines
**Files:**
- `src/apps/pinch/components/settings/NutritionSection.tsx` (the four switches, in the Settings tab), `components/shared/ListViewControls.tsx` (each list's View options and its door to them), `CalendarScreen.tsx` (the eye)
- `src/apps/pinch/components/shared/NutritionLine.tsx`
- `src/apps/pinch/utils/recipeMath.ts` (nutrition), `mealMath.ts`, `stats.ts`
- `src/apps/pinch/components/recipes/RecipeForm.tsx` ("+ My own nutrition" chip), `RecipeDrawer.tsx`, `MealDrawer.tsx`, `PlannedMealView.tsx`
- `src/apps/pinch/store/actions/settingsActions.ts` (`saveSettings`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Logic §2 (nutrition) and `KitchenSettings`; `UX.md`'s View options, Calendar (summary line) and Recipe form; the README's "Cost and Nutrition".

### Description
Nutrition is always stored and shown only when switched on. The Settings tab has four `AppToggle`s under "Numbers" (calories, protein, carbs, fat), all off to start, and each View options sheet points to them while none is on. A recipe's nutrition adds up from its ingredients, and the person can type their own over it. With a metric on, it shows per serving on recipes and meals and as a daily average on the calendar's stats row; with protein on, the row adds average price per gram of protein.

### Possible Approach
1. `saveSettings({ showNutrition })` with dotted-path writes; the Settings tab's Numbers group (`NutritionSection`) carries the switches and an "About the numbers" line for licences and attributions, and the eye on the Calendar, Recipes, Meals and Kitchen holds a door row to it (`ListViewControls`, `CalendarViewOptions`).
2. Nutrition math per metric as in the TDD (grams from the same bridge as cost; the override replaces a derived metric when non-null); `NO_NUTRITION` gaps only for metrics that are on.
3. `NutritionLine` renders only the metrics that are on and renders nothing when all are off; wire it into the recipe row and drawer, meal drawer, planned meal view and the summary sheet; `selectMonthStats` adds daily averages and `proteinPriceCentsPerGram` over meals where both are known.
4. Recipe form: "+ My own nutrition" chip (visible whether or not anything is on) with four optional per-serving fields.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update:** settings switches and a recipe's nutrition override. **Read:** nutrition on the surfaces above. **Delete:** the chip's "Remove" clears the override.
- [ ] **Entry point:** the eye on the Calendar, Recipes, Meals and Kitchen.

### Success Criteria
- [ ] With all four off, no nutrition appears anywhere and no nutrition nudge shows; turning one on shows it immediately and only that metric.
- [ ] Override and derived values agree with a hand calculation for a seeded recipe; a metric with an unknown ingredient reads as left out, not 0.
- [ ] Rules verified for the settings shape; the kitchen document stays owner-only.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 14: Recipes from pasted text, a photo or a PDF

**Prerequisites:** Issue 6
**Target PR Size:** ~550 lines
**Files:**
- `src/apps/pinch/lib/extractRecipe.ts`
- `src/apps/pinch/components/recipes/RecipeAutofill.tsx`, `RecipeForm.tsx`
- `src/apps/pinch/utils/ingredientMatch.ts`
- `src/apps/pinch/store/actions/recipeActions.ts` (new custom ingredients saved with the recipe in one `writeBatch`)
- `CLAUDE.md` / `copilot-instructions.md` (only if a rule changes)

**Context:** Read `TECHNICAL.md`'s Logic §5 (ingestion), `src/lib/firebase/ai.ts`, `src/apps/waypoint/components/UploadAutofill.tsx`, `src/utils/uploadMimeType.ts`, `src/utils/imageCompression.ts`, Nine Lives' `extractProposalFromText.ts` / `extractProposalFromFile.ts`; CLAUDE.md's "A document fills the form".

### Description
At the top of the recipe form, "Have a recipe on paper or a screenshot?" and "Copied one from a chat?" fill the real form from a photo, screenshot or PDF (up to 10 MB) or from pasted text. Anything it couldn't read is named; ingredients Pinch doesn't know arrive as "Add as new ingredient"; nothing is saved until the person confirms.

### Possible Approach
1. `extractRecipeFromText` / `extractRecipeFromFile` with the response schema in the TDD, files as `inlineData` (images through `compressIngestionImage`, MIME from `getUploadMimeType`), a prompt that treats the input as data. Not cached.
2. `ingredientMatch` normalizes names and matches the person's custom ingredients, then catalog names and aliases; unmatched rows are flagged and, if kept, create custom ingredients in the same `writeBatch` as the recipe.
3. `RecipeAutofill`: idle / reading / done / failed / too-big states with the exact copy in `UX.md`; a paste box capped at `MAX_PASTE_CHARS` with a counter near the limit. Errors map to one warm sentence; the detail is logged.
4. Fills only what it read and never overwrites what the person already typed; `source` is saved as `AI_TEXT` / `AI_FILE`.

### CRUD & Entry-Point Requirements
- [ ] **Create:** the form filled by the reader, then saved by the person. **Read / Update / Delete:** as in Issue 6.

### Success Criteria
- [ ] A recipe photo, a screenshot, a PDF and pasted text each fill the form on the real service; a too-big file and a no-recipe file each show their message.
- [ ] Unknown ingredients are offered as new, and declining one leaves the row unresolved until the person picks or adds something (the form won't save with an unresolved row).
- [ ] A prompt-injection style recipe text only fills fields and never triggers a save or a change outside the form (tried and noted in the PR).
- [ ] Error messages from the service never reach the screen.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 15: Copy to Markdown: recipes, a day, a week and your ingredients

**Prerequisites:** Issue 9, Issue 6
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/pinch/utils/markdown/recipeMarkdown.ts`, `dayMarkdown.ts`, `weekMarkdown.ts`, `ingredientsMarkdown.ts`
- `src/apps/pinch/components/shared/CopySheet.tsx`
- Entry points in `RecipeDrawer.tsx`, `MealDrawer.tsx`, `DayDrawer.tsx`, `PlannedMealView.tsx`, `KitchenScreen.tsx` (the 📋 icon)

**Context:** Read `TECHNICAL.md`'s Logic §6 (Markdown copy), CLAUDE.md's "Text that leaves the app is safe to paste" and "Security and privacy"; `src/utils/clipboardUtils.ts`; `UX.md`'s Copy sheet.

### Description
Recipes, a saved meal, a day, a week (Monday to Sunday) and the person's ingredient list each copy as clean Markdown for any AI chat. A small sheet previews the text and says what is and isn't included. Prices, stores and products never leave.

### Possible Approach
1. Four pure builders, each an allowlist (copy fields by name); user text escaped for Markdown; ingredients grouped by family, capped at `MAX_COPIED_INGREDIENTS` ("and N more"); "your ingredients" = custom + adjusted + with a product + used in a recipe.
2. `CopySheet` (a small `Drawer`): scrollable preview, one sentence on what's included, Dreamer UI's `CopyButton` through `copyToClipboard`.
3. Round trip: the recipe Markdown is read back by Issue 14's paste reader into the same recipe (try it).

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Entry points:** Copy in the recipe and meal drawers, the day drawer and planned meal view, a week action on the Calendar, and the 📋 icon in Kitchen.

### Success Criteria
- [ ] A grep of each builder's output for `$`, store and product names finds nothing; a title containing `*`, `#` or `@` copies safely.
- [ ] A week copy covers exactly Monday to Sunday of the chosen week; an empty day says so in one line.
- [ ] A recipe copied, pasted into the reader and saved matches the original's ingredients and steps.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 16: Past days keep their numbers

**Prerequisites:** Issue 12
**Target PR Size:** ~350 lines
**Files:**
- `src/apps/pinch/store/actions/freezeActions.ts`, `productActions.ts`, `recipeActions.ts`, `ingredientActions.ts` (freeze-before-edit)
- `src/apps/pinch/utils/mealMath.ts`, `stats.ts` (read a snapshot for frozen meals)
- `src/apps/pinch/components/calendar/DayDrawer.tsx` (the "Prices as they were that day" line)
- `firestore.rules` (the write-once `snapshot`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Logic §3 (copy-on-plan, the freeze) and open question 5; `UX.md`'s Day drawer note.

### Description
Once a day has passed, its cost and nutrition are fixed. Changing a price or editing a recipe changes what's ahead, not last month's totals.

### Possible Approach
1. `freezePastMeals`: one `writeBatch` of field-scoped `snapshot` writes for loaded unfrozen past meals, run once after the window first loads and as the first step of any action that changes a price, size, recipe or ingredient nutrition. A meal planned on a past day is frozen in the same write.
2. `mealMath` and `stats` read `snapshot` when present. The day drawer shows "Prices as they were that day" on a frozen day.
3. Rules: `snapshot` is writable only while the stored value is `null` and is then immutable; `frozenAt ≤ request.time`. (Later, the owner can have a day priced again with today's prices, the one write that replaces a snapshot: it must carry an instant `repricedAt`; see `TECHNICAL.md` decision 22.)
4. Verify the sequence on the emulator: plan yesterday's meal, change a price, confirm the day didn't move; try overwriting a snapshot as the owner and expect a denial.

### CRUD & Entry-Point Requirements
- [ ] No new entity. **Read:** frozen days show their frozen numbers on the calendar, drawer and stats.

### Success Criteria
- [ ] Changing a product's price leaves every past day's cost unchanged and moves every future day's.
- [ ] A snapshot cannot be overwritten by a stale device (emulator write denied).
- [ ] The "honest limit" in the TDD is restated in the PR body with how it was exercised.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 17: Keep what's in use: archive instead of removing

**Prerequisites:** Issue 9, Issue 11, Issue 5
**Target PR Size:** ~400 lines
**Files:**
- `src/apps/pinch/store/actions/recipeActions.ts`, `ingredientActions.ts`, `productActions.ts`, `storeActions.ts`, `mealActions.ts` (the shared check)
- `src/apps/pinch/utils/references.ts`
- Pickers, search and list selectors (hide archived)
- `scripts/seeds/pinch.ts` (an archived recipe used on a planned day)

**Context:** Read `TECHNICAL.md`'s Logic §3a (archive on delete) and Security Rules #7–8; `UX.md`'s drawers' delete notes.

### Description
Deleting a recipe, ingredient, product, store or family that something still uses hides it from lists and pickers and keeps every planned day and total whole. The confirm says which will happen.

### Possible Approach
1. `references.ts`: for each kind, the "in use" test, using the loaded collections plus one `plannedMeals` `array-contains` query on `refIds` with `limit(1)`.
2. Each remove action: archive when used, delete otherwise (and delete Storage files only on delete); the confirm text says "Used on N planned days, so it will be hidden, not erased".
3. Archived items are hidden from pickers, search and lists and never count as a default product, but still resolve for display ("Adobo chicken" on an old day).

### CRUD & Entry-Point Requirements
- [ ] No new entity. **Delete:** every remove in the app routes through the check.

### Success Criteria
- [ ] A recipe on a planned day (also one only in a planned day outside the loaded window) is archived, not erased; the day's title and total survive.
- [ ] An unused recipe is fully deleted along with its cover.
- [ ] A product used as a default is re-pointed or cleared in the same batch.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 18: Scale fixture and a performance pass

**Prerequisites:** Issues 1–17
**Target PR Size:** ~300 lines (seed and measurements; fixes as needed)
**Files:**
- `scripts/seeds/pinchScale.ts`, `scripts/seeds/types.ts`, `scripts/seed.ts`, `package.json` (`seed:pinch-scale`), `SEEDING.md`
- Whatever selectors, lists or components the measurements flag

**Context:** Read `TECHNICAL.md`'s Performance section; CLAUDE.md's "Performance is a design check" and Waypoint's scale seed for the shape.

### Description
"Big Kitchen (scale test)" holds the volume a long-time cook might reach, and every main tab and drawer is checked on it at phone width with the dev build throttled 4×.

### Possible Approach
1. Seed 300 custom ingredients across 40 families, 150 products across 12 stores, 200 recipes, 60 saved meals and ~1,100 planned meals over three months, and extend the document count.
2. Measure tab switches (Calendar ↔ Recipes ↔ Kitchen), the day drawer, the recipe drawer and the fill-in sheet; profile before changing anything; fix what is slow (typically memoizing selectors, `LazyMount` on family groups, capping pickers).
3. Write a `## Performance` section in the PR with the fixture, throttle and before/after numbers.

### CRUD & Entry-Point Requirements
- [ ] No new entity.
- [ ] **Read:** the existing screens on the scale kitchen.

### Success Criteria
- [ ] No tab switch takes over a second at 4×; no "Maximum update depth" or render storm in the console.
- [ ] The seed's document count is updated and `npm run seed:reset` restores the baseline.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.


## Next Steps

### Issue 19: Track what you have: stock, with "not tracked" kept separate from "out" (packages, with their dates, are Issue 46)

**Prerequisites:** MVP complete
**Target PR Size:** ~450 lines
**Files:**
- `stock` collection types, slice, listener, actions, rules, seed
- Kitchen: a Stock entry row and the ingredient drawer's "On hand" section
- `utils/markdown/ingredientsMarkdown.ts` (adds amounts and low stock)

**Context:** TDD Logic §7 (reserved stock design); README Next Steps.

### Description
A person can say how much of an ingredient they have. An ingredient they haven't counted is "not tracked", which is different from "out". The ingredient copy carries what's on hand and what's running low. **Issue 46 delivered what a person has as packages (an amount, a place and a date each) with sums per kind of measure; what is left here is the "not tracked" against "out" distinction for an ingredient nobody added a package for, a low-stock threshold and the ingredient copy.** The `stock` collection below is no longer the plan: a count would be a package with no date.

### Possible Approach
1. Add `stock/{ingredientId}` (`amount`, `unit`, `lastCountedAt`, `isTracked`), where a missing document means not tracked.
2. Count and adjust UI in the ingredient drawer; a low-stock threshold per ingredient as a chip.
3. Rules with legacy tolerance; extend the ingredient copy.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** count, show, adjust and clear an ingredient's stock.

### Success Criteria
- [ ] "Not tracked" and 0 are visibly different everywhere; rules verified; seed extended.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 20: Mark a meal as made: stock comes out (batches became prepared containers, Issue 41; cooking mode's take-out is Issue 46)

**Prerequisites:** Issue 19
**Target PR Size:** ~500 lines
**Files:**
- `plannedMeals.madeAt`, prepared-servings collection, actions, Kitchen entry
- Planned meal view: "Mark as made" and "Made a batch"

**Context:** TDD Logic §7; the agreed rule: stock deducts on "mark as made", and prepared servings are consumed separately so nothing deducts twice.

### Description
Marking a meal made takes its ingredients out of stock. Prepared servings are already built, as containers (Issue 41), and eating from one never touches ingredient stock; this issue is the ingredient side that is left. **Issue 46 delivered the take-out for cooking mode's Finish panel (an explicit "Take out" with a tick per ingredient and an Undo); what is left is the same from a drawer's or the plan's "Mark as cooked", where nothing comes out today.**

### Possible Approach
1. A transaction on made: deduct tracked stock only (untracked is untouched), set `madeAt`.
2. Prepared servings need nothing here: Issue 41's containers are eaten from a plan and never deduct ingredients.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** mark and unmark made.

### Success Criteria
- [ ] No double deduction (emulator walk-through); untracked ingredients never go negative or to zero.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 21: The shopping list with stock, low stock and stores

**Prerequisites:** Issue 19, Issue 9. The list itself has shipped as the Shopping tab: a stored `shoppingItems` collection, filled from a recipe, saved meal or a day or range of planned days (or one ingredient), merged by ingredient and unit, each line remembering and naming what put it there, in shop sections, with To buy / Got it / All, an approximate cost, and "Meals on your list" to see what the list is for and take one meal's share off (TECHNICAL.md §5b).
**Target PR Size:** ~350 lines
**Files:**
- Shopping tab: `ShoppingScreen` (`components/shopping/`), `utils/shopping.ts`, a low-stock section and a group-by-store option

**Context:** README Next Steps; UX Shopping list.

### Description
Subtract tracked stock from what the list asks for, add a section for low-stock ingredients, and offer grouping by the default product's store with totals from the person's own products. **Issue 46 delivered the first part where it is safe: an add sheet starts a line unticked when the pantry already covers it (never removing the line, and the list's own lines are untouched).**

### Possible Approach
1. When adding, subtract tracked stock per ingredient and unit; an untracked ingredient is listed in full.
2. Low-stock section from thresholds; a "By store" filter next to the shop sections the list is grouped by, from each ingredient's default product.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the list by family or by store, and the low-stock section; **Update:** tick off, change amount (both exist).

### Success Criteria
- [ ] Totals match the products' prices; an untracked ingredient is listed in full.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 22: Add many ingredients at once from photos of your fridge, cabinets or a grocery receipt

**Prerequisites:** Issue 19
**Target PR Size:** ~500 lines
**Files:**
- `lib/extractInventory.ts`, bulk review subview

**Context:** Same AI infrastructure as recipes; the repo rule that a document fills a form and the person reviews.

### Description
A photo fills a review list of ingredients (and stock or prices when it can read them); the person confirms rows before anything is saved.

### Possible Approach
1. Structured extraction of items; match with `ingredientMatch`; a review subview with per-row accept/skip.

### CRUD & Entry-Point Requirements
- [ ] **Create:** ingredients, stock and products from the review.

### Success Criteria
- [ ] Nothing saved before confirmation; unreadable items are named.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 23: Update an existing recipe by pasting changes into it

**Prerequisites:** Issue 14
**Target PR Size:** ~350 lines
**Files:**
- `RecipeForm` "Paste changes" entry, diff view

**Context:** Recipe ingestion (Issue 14); a diff review.

### Description
Paste text from a chat; Pinch shows what would change (ingredients, amounts, steps) and applies it only on confirm.

### Possible Approach
1. Extract a draft, diff against the stored recipe, render added/changed/removed rows, apply selected changes.

### CRUD & Entry-Point Requirements
- [ ] **Update:** a recipe from pasted changes.

### Success Criteria
- [ ] Declining all changes leaves the recipe untouched.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 24: Week view and a dedicated day detail

**Prerequisites:** Issue 12
**Target PR Size:** ~400 lines
**Files:**
- `WeekScreen`, `DayDetail` subview

**Context:** UX Calendar; README Next Steps.

### Description
A week (Monday to Sunday) with its meals by day and the week's stats, and a full-page day detail. Superseded in the Pinch audit (tranche 1): below `lg` the week is seven days from today, from `lg` seven columns Sunday to Saturday; one summary line and a summary sheet carry its numbers, and the Day view is gone (a day is its drawer).

### Possible Approach
1. Reuse day totals and planned-by-day selectors; a Month / Week switch.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the week and day pages.

### Success Criteria
- [ ] Week stats equal the sum of its days.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 25: Use one recipe inside another

**Prerequisites:** Issue 6, Issue 7
**Target PR Size:** ~450 lines
**Files:**
- `RecipeIngredient` gains a recipe reference; math handles nesting; rules

**Context:** TDD Recipe, Derived values.

### Description
A recipe can use another (a house sauce in a dish), with cost and nutrition flowing through.

### Possible Approach
1. Add `recipeId` to a line (an `ItemKind`-style union), guard against cycles, extend `recipeMath` recursively with memoization.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** lines referencing recipes.

### Success Criteria
- [ ] Cycles are blocked in the UI and the math; a nested recipe's edit reaches its parent.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 26: Collections: group recipes your own way, and star the saved meals you make again

**Prerequisites:** Issue 6, Issue 11
**Target PR Size:** ~2,200 lines (the collection record and its listener, the recipe form's row and editor, the filter question and the Collections sheet, the drawer's pills, the star, the suggestions helper, the rules, the seeds, checks and docs)
**Files:**
- `Collection` and `Recipe.collectionIds` and `Meal.isFavorite` in `types.ts`; the collection constants in `constants.ts`; `utils/collections.ts` (labels, counts, the filter, the suggestions, the form's choice, the delete's chunks) and `utils/favorites.ts`
- `collectionsSlice.ts`, `startCollectionsListener`, `collectionActions.ts` (rename, delete), `saveRecipe`'s `collectionIds` and `newCollections`, `setMealFavorite`
- `RecipeCollectionsField.tsx` (the form's row and editor), `CollectionsSheet.tsx`, the Recipes filter's Collections and Favorites questions, `RecipeDrawer`'s pills, `StarButton` on `MealRow` and `MealDrawer`
- `firestore.rules` (`collections`, `collectionIds`, `isFavorite`), the seeds (Alex's two collections and a starred meal, Taylor's twelve), `scripts/checks/pinchOrganize.ts`

**Context:** The owner asked for recipes in several groups ("Bulk", "High-protein"), suggested ones, and starred meals. Modeled on Sources (a record per person, an id on the recipe); read `TECHNICAL.md` §6a.2 and §5a.2, Security Rules criterion 15 and open question 26, and CLAUDE.md's "A record created only because another record names it", "A filter lists only values that are present" and "A toggled icon-button state is shown by filling the icon".

### Description
A recipe can be in many collections the person names. They are made in the recipe form (where the recipe's own numbers suggest High-protein, Quick and Freezer-friendly, never added on their own), listed in a Collections question in the Recipes filter with the ones that hold a recipe and their counts, shown on the recipe's drawer beside its source, and renamed or deleted from a sheet behind the filter. A saved meal can be starred: favorites list first, the plan builder's recents lead with them, and a long list's filter gets a Favorites pill.

### Possible Approach
1. A `collections` record per person (`{ id, label, createdAt, updatedAt }`) and `Recipe.collectionIds: string[]`, so a rename follows every recipe; a missing key reads as empty and every save of the form writes it.
2. New collections typed in the form are written in the recipe's own batch (never an orphan); deleting one re-reads every recipe in chunked transactions and says how many it came off.
3. Suggestions are a pure helper over the recipe's protein (trusted only when every ingredient's protein is known or typed), times and storage notes; Vegetarian is left out because nothing stored can say it.
4. `Meal.isFavorite` is written only by the star (a field-scoped update of the value asked for), and `selectMeals` is a stable favorites-first sort of newest first.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** put a recipe in collections and take it out, make a collection in the form, see it in the filter and the drawer, rename or delete it from the sheet; star and unstar a saved meal.
- [x] **Entry points:** the recipe form's Collections row; the Recipes filter's Collections question and its pencil; the drawer's collection pills; the star on a saved meal's row and drawer; the Favorites question on Saved meals.

### Success Criteria
- [x] A recipe and a saved meal written before this (no `collectionIds`, no `isFavorite`) read, edit and save, checked in the browser and on the emulator over legacy-shaped documents.
- [x] The rules matrix (owner, another user, signed out; valid, extra key, missing key, 41-character label, 20 and 21 ids, wrong types, legacy documents) gives the intended new allows and no other change against the previous rules.
- [x] Deleting a collection that 450 recipes name takes it off every one in three transactions and says 450.
- [x] Checks cover the suggestions at their edges (25 g, 30 minutes, an unknown time, an unknown protein, already in), the delete's chunks and re-read, the filter's options and counts, favorites order and the tap guard, and the rules' caps.
- [x] Driven in a real browser at 390×844, 320×568 and 1280 in light and dark, with 0, 3 and 50 collections and a recipe in 8.
- [x] `UX.md`, `TECHNICAL.md`, `JOURNEYS.md` and the README match what shipped.

### Issue 27: Add a one-off item to a meal

**Prerequisites:** Issue 10
**Target PR Size:** ~300 lines
**Files:**
- `MealItem` kind `ONE_OFF` with name, cost and nutrition

**Context:** TDD MealItem.

### Description
Dinner out is one item with a name, a cost and optional nutrition.

### Possible Approach
1. Extend the item union, rules, the builder's "+ One-off" chip, and the math.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** a one-off item in a meal.

### Success Criteria
- [ ] One-off costs count in stats; the item is never offered in pickers.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 28: Set your own unit conversions, with AI suggestions

**Prerequisites:** Issue 7
**Target PR Size:** ~400 lines
**Files:**
- Ingredient form conversion chips (`gramsPerMl`, `gramsEach`), a suggestion call

**Context:** TDD Logic §1 and open question 10 (fields already in the schema).

### Description
"1 can = 400 g" lets any ingredient be priced; an AI can suggest a conversion for review.

### Possible Approach
1. UI for the existing fields; a suggestion extractor behind a review step; `NOT_COMPARABLE` gaps link to it.

### CRUD & Entry-Point Requirements
- [ ] **Create / Update / Delete:** conversions on an ingredient.

### Success Criteria
- [ ] A previously left-out recipe line prices after a conversion is set.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 29: AI suggestions for a custom ingredient's nutrition

**Prerequisites:** Issue 3, Issue 13
**Target PR Size:** ~300 lines
**Files:**
- Nutrition chip suggestion, shared AI helper

**Context:** AI infrastructure; review-before-save.

### Description
For a custom ingredient, an AI proposes per-100 g values for review.

### Possible Approach
1. Structured suggestion, shown as editable fields with a note that it's an estimate.

### CRUD & Entry-Point Requirements
- [ ] **Update:** an ingredient's nutrition.

### Success Criteria
- [ ] Nothing is saved before confirmation; estimates are labelled.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 30: Swap an ingredient for another in its family and see the cost change

**Prerequisites:** Issue 7
**Target PR Size:** ~300 lines
**Files:**
- Recipe drawer swap action

**Context:** Family model; cost math.

### Description
In a recipe, swap chicken breast for chicken thighs and see the cost and protein change.

### Possible Approach
1. Family-scoped picker; preview delta; apply to the recipe or to one day's copy.

### CRUD & Entry-Point Requirements
- [ ] **Update:** a recipe line.

### Success Criteria
- [ ] The preview delta equals the saved result.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 31: Compare products and see the cheapest per gram of protein

**Prerequisites:** Issue 5
**Target PR Size:** ~250 lines
**Files:**
- Ingredient drawer comparison

**Context:** Product model; protein.

### Description
An ingredient's products ranked by price per gram and, with protein known, per gram of protein.

### Possible Approach
1. Selector over products; tie to the nutrition switches.

### CRUD & Entry-Point Requirements
- [ ] **Read:** the comparison.

### Success Criteria
- [ ] Ranking matches hand calculations.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 32: Create a recipe from a web link

**Prerequisites:** Issue 14
**Target PR Size:** ~400 lines
**Files:**
- A fetch path that respects the repo's third-party rules

**Context:** Cloud Functions rules; recipe ingestion.

### Description
Paste a link and a recipe form fills in for review.

### Possible Approach
1. A server-side fetch behind an `onCall` (the browser can't fetch arbitrary pages), same reader, same review step; a daily budget guard per the repo's rule.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a recipe from a link.

### Success Criteria
- [ ] Failure to fetch falls back to paste; no secret reaches the browser.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 33: Cooking mode: one step at a time

**Prerequisites:** Issue 6
**Target PR Size:** ~300 lines (as built it also carries the timers and the ingredients view)
**Files:**
- `CookingSubview` (an overlay `Subview`) with `CookDishStrip`, `CookStepView`, `CookStepTray`, `CookNoteCard`, `CookStepTimer`, `CookStepAmounts`, `CookTimerView`, `CookIngredientsView` and `CookTimerStrip`, the `useCookTimers` hook, and general `useWakeLock` and `SwipeArea` pieces

**Context:** UX Recipe details.

### Description
A big-type, one-step-at-a-time view that keeps the screen awake. As built, each step leads in large type with a ready timer card for each time it mentions (its digits a size below the step); one tap starts it and the timer becomes the screen while the person waits (the time left large, a progress bar, the other timers as rows, Up next with the next step's first sentence and Next, and on a plate a Meanwhile line to the other dish; Pause is its only control while it runs, Resume and Reset when paused, Dismiss when it's done, and a finished timer comes to the front by itself, says how long ago it rang and rings again about once a minute until dismissed), and back or Next leaves it running as a pill above the buttons and, set apart below, a quieter block of the ingredients it names with their amounts in kitchen measures; an Ingredients button beside the step counter opens the full list (beside the steps from `lg`), which scales and ticks them, cooking opens at the recipe's own servings, leaving while a timer is going asks first, the recipe's latest note shows above the steps, a planned dinner of several recipes opens as one session (dish cards that say each recipe's step, one slim row of pills for the timers in the background, up to four timers for all of them; a step's own timer card is reached by scrolling and the dish switch stays on screen), and Finish records the cook, one per recipe, in one panel with one Undo, put-away and a note. Round 8 gave the step room (a slim dish line, what the step uses in a tray above Back and Next, the note from last time as a card on the first step with Got it and Apply, 32px above and below the instruction), and made a timer that rang while the screen was off say how long ago it rang. A reload or a discarded tab no longer ends a cook: a small per-device copy (recipes, servings, step in view, timers as clock deadlines, 12 hours) is offered back as a quiet "Pick up" row on the next screen.

### Possible Approach
1. Wake Lock API with a graceful fallback; step navigation by buttons, swipe and arrow keys; an Ingredients view that scales amounts with the shopping list's own `scaleAmount`; timers that run to a clock deadline.

### CRUD & Entry-Point Requirements
- [ ] **Read:** a recipe in cooking mode, from the recipe drawer and from a planned meal.

### Success Criteria
- [ ] The screen stays awake on supported browsers and the view works without it.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.


### Issue 40: Recipe care: how to keep what a recipe makes

**Prerequisites:** Issue 6, Issue 14, Issue 33
**Target PR Size:** ~600 lines (the row and its editor, the drawer section, one line in cooking mode, the readers' schema, the rules and the checks)
**Files:**
- `Recipe.care` and `RecipeCare` in `types.ts`, the caps in `constants.ts`, `utils/recipeCare.ts` (the helpers the form, drawer, cooking mode and readers share), `isRecipeCare` in `firestore.rules`
- `RecipeCareField` (the form row and its editor), `RecipeCareSection` (the drawer), the leftovers line in `CookingSubview`
- `lib/extractRecipe.ts` (schema and prompt) and `utils/normalizeRecipe.ts` for the three readings
- The seed: care on two of Alex's recipes (one full, one fridge only) and on half the scale kitchen's, the rest left in the older shape

**Context:** Read `TECHNICAL.md` §5f and open question 20; `UX.md`'s Recipe, Recipe details and Cooking mode; CLAUDE.md's "A phone form shows a few inputs at a time" and "Text that leaves the app is safe to paste" (Pinch has no copy to the clipboard, and a share, Issue 48, draws care as text, so it only matters if a copy returns).

### Description
A recipe can say how many days what it makes keeps in the fridge and the freezer, how to reheat it, and carry a tip. It is a "Keeping it" row in the recipe form, a quiet section on the recipe, the keeping times on cooking mode's put-away pills ("Fridge · keeps 3 days") and something the three readings fill in for review when the source says so.

### Possible Approach
1. `Recipe.care: RecipeCare | null`, a required key written by every save of the recipe (so an older recipe, which has no key, gains it), read through `getRecipeCare`; days are whole numbers from 1 to 365, reheat and tip at most 300 characters.
2. The row is a `SummaryEditor` between Steps and Nutrition: two "days" fields, a reheating line and a tip, with the summary "Fridge 3 days, freezer 3 months, reheating, tip".
3. Extend the readers' shared schema and prompt with the four fields and the rule never to estimate; normalise in `normalizeExtractedRecipe`.
4. `isRecipeCare` in the rules, with `data.get('care', null)` so a document without the key stays valid; verify the owner, another user and a signed-out visitor against the emulator, with the base rules as the control.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update:** write, see and change a recipe's care from its form; clearing every part saves it as none.
- [ ] **Entry points:** the recipe form's "Keeping it" row, the recipe drawer's section, cooking mode's last screen, and the three readings.

### Success Criteria
- [ ] A recipe written before this (no `care` key) opens, shows no section, edits and saves, and its save writes `care` explicitly; checked in the browser over a legacy-shaped document.
- [ ] A save that changes only a cooked recipe's care writes no tweak and leaves the drawer's "changed" date alone.
- [ ] The rules accept a valid care, null and a missing key for the owner and refuse bad days, an extra key and a wrong type, for everyone else too; the cases are listed in the PR as owner, another user and signed out.
- [ ] A reading with no storage lines leaves the row quiet and lists nothing under "We couldn't read"; one with them fills the row for review and saves nothing until the recipe is saved.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 and 320×568 in light and dark and at 1280, and the editor was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 41: Prepared containers: meal prep kept in the fridge or freezer

**Prerequisites:** Issue 7, Issue 11, Issue 14, Issue 33, Issue 40
**Target PR Size:** ~2,500 lines (data and rules, a listener and store slice, the Kitchen row and list, the container sheet, list insight, cooking mode's question, eating from a plan, the shopping line, seeds, checks and docs)
**Files:**
- `Container`, `ContainerEvent` and the place, status and event kinds in `types.ts`, the caps and the named defaults in `constants.ts`, `utils/containers.ts` (every pure rule: eat-by classification and defaults, the plans, the history cap, the stock maps, the bulk-meal rule, the copy helpers), `isContainer` in `firestore.rules` and the Finished index in `firestore.indexes.json`
- `store/slices/containersSlice.ts`, `startContainersListener`, `store/actions/containerActions.ts`, `queries/containerQueries.ts`, the container selectors, `hooks/useContainerActions.ts`, `useContainerDraft.ts`, `usePutAway.ts`
- `components/containers/` (`PreparedEntry`, `ContainersSubview`, `ContainerRow`, `ContainerSheet`, `ContainerFormSheet`, `ContainerFields`, `EatByField`, `EatByBadge`, `StockLine`, `StockRows`, `EatFromStock`), `components/cooking/CookPutAway.tsx`
- Changed: Kitchen (the row), `EntryTile` (the Fridge & freezer door, which began as `EntryChip`), Recipes and Meals (rows, filter, drawers), the plate builder's search, the planned meal view, the shopping sheet, the cooking history sheet, `CookingSubview`
- The seeds: thirteen containers in every state for Alex (three of them past their date in the fridge), about 300 in stock and 260 finished for the scale kitchen
- Bulk acts (round 8): `changeContainersInPlace`, `planBulk` and `planUndoMove` (one planner for the clear-out, a toss, "Ate it all" and a move), `src/hooks/useSelection.ts`, `src/components/SelectionBar.tsx`, `src/components/PromptRow.tsx`, `scripts/checks/pinchFridge.ts`

**Context:** Read `TECHNICAL.md` decision 23, §5g, criterion 13 and open question 22; `UX.md`'s Fridge & freezer; CLAUDE.md's "Pick the atomic write that fits", "Know which of the two kinds of time value a field is" and the Firestore rules section on indexes and the evaluator.

### Description
Meal prep kept in the fridge or freezer is a list of containers: what each is, how many servings are in it, where it is, when to eat it by, and what has happened to it. Kitchen has a "Fridge & freezer" door (a tile) and list (the audit renamed "Prepared meals" and "container" in the app to "Fridge & freezer" and "box"; the code keeps `Container`); a recipe's and saved meal's rows and drawers say what is in stock; cooking mode asks "Putting any away?" after a bulk meal; a plan can eat from a container; the shopping sheet says what is already put away. A put-away can be several containers (portions in separate boxes thaw one at a time), a saved meal's stock includes its recipes', and a thaw or move never hides that a container is past its date.

### Possible Approach
1. One document per container (`servings`, `status`, `place`, `eatBy` as a date-only value, `history` of at most ten events), never split; finishing keeps the document, deleting erases it. A put-away writes one to twenty containers in one batch, each with its own history.
2. Every change that depends on the stored state is a `runTransaction` over a pure plan, so another device's change is never written over.
3. Keep the rules' history check lean: the evaluator's 1,000-expression limit allows about ten events checked by index.
4. One listener for what is in stock; Finished is read through TanStack Query with its composite index: when its step opens and, so the "What you finished" door shows only once something is finished, once when the list opens; a read that fails still draws the door and the step says it could not load.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** put some away (as one container or several), see what is in stock and finished, eat some or all, correct the count, move between fridge and freezer, change the eat-by date, throw it out, delete it.
- [ ] **Entry points:** Kitchen's row, a recipe's and a saved meal's drawer, cooking mode's last screen, the Fridge & freezer list's "Add", a planned meal's "Eat from your fridge or freezer".
- [ ] **Bulk (round 8):** a row above the list tosses what is past its date, and Select ticks several boxes to eat, toss or move together; those are the only two doors (a box's sheet is still the way to act on one, the eraser empties a whole place).

### Success Criteria
- [ ] Eat soon and past its date read right in the viewer's own time zone, west and east of UTC (`npm run check:pinch-math` under `America/Los_Angeles` and `Pacific/Auckland`), and an eat-by is never shown in local time.
- [ ] The rules accept a valid container for the owner and refuse a bad shape, eleven events, servings 0, a non-midnight eat-by and a changed immutable field, for everyone else too; the cases are listed in the PR as owner, another user and signed out, against the previous rules as the control.
- [ ] A failed or denied containers listener degrades only its own UI; checked by loading the previous rules into the emulator.
- [ ] Two quick taps eat one portion and save one container, and Enter then Enter on a list row eats nothing; Escape and the back gesture close one thing at a time; leaving the put-away details after a change asks first, and a save that isn't confirmed yet never holds the screen.
- [ ] A thaw or move of a container already past its date keeps that date and says so; a recipe whose only use is food in the fridge or freezer is archived, not erased.
- [ ] Every bulk act (toss what is past its date, Ate it all, Toss, move, clear out) re-reads each box in a `runTransaction` per 200, touches only boxes still in stock and still in the place the screen showed, reports what it really did ("Tossed 3 of 4 boxes · One was already finished."), takes a second tap once, and its Undo puts back only what is still as the act left it; a bulk toss and a bulk move are proven against the emulator as the owner (allowed), another user and a signed-out visitor (denied), with no change to the rules.
- [ ] Select mode on the scale kitchen at 4× CPU: entering it, a tick and "select all past their date" each under a second with no render storm; the footer and the first row both reachable at 390×844, 320×568, 375×667, 390×560 and 844×390 in light and dark; Space ticks a row and Escape, Cancel, the back button and the back gesture each end the mode one layer at a time without moving the list.
- [ ] Driven on the scale kitchen at 4× CPU: tab switches, the stock list with about 300 containers, a recipe drawer and the Recipes list with stock lines, against the base build.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 and 320×568 in light and dark and at 1280, and every sheet was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 42: Ingredient groups: "For the chicken", "For the sauce"

**Prerequisites:** Issue 6, Issue 14, Issue 33
**Target PR Size:** ~1,200 lines (the field, one ordering helper, the form's group field and heading editor, the drawer's and cooking's headings, the step matching, the readers, the seed, checks and docs)
**Files:**
- `RecipeIngredient.group` in `types.ts`, `MAX_INGREDIENT_GROUP_LENGTH` in `constants.ts`, `utils/ingredientGroups.ts` (the order every list uses, the label for a line away from its heading, and the form's moves)
- `RecipeIngredients.tsx` (the group field, the headings and their editor), `recipeFormModel.ts`, the drawer's Ingredients, `CookIngredientsView`, the in-step rows, `utils/stepIngredients.ts`, `utils/recipeChanges.ts`
- `lib/extractRecipe.ts` (schema and prompt) and `utils/normalizeRecipe.ts`
- The seed: Alex's adobo under two groups, with soy sauce and garlic in both; the nachos keep lines with no `group` key

**Context:** Read `TECHNICAL.md` §6 ("Ingredient groups"), criterion 14 and open question 23; `UX.md`'s Recipe, Recipe details and Cooking mode; CLAUDE.md's "Design for 5 and for 50" (`PickOrCreate`), "Labeled hairline dividers use `@/components/SectionDivider`" and "Removing a row from a form shows an undo".

### Description
A recipe's ingredient lines can sit under headings, the way recipes are written ("For the chicken", "For the sauce"), and one ingredient can be in more than one group with its own amount in each. The headings show wherever the lines are listed, in one order; a step names which line it means; a reading keeps the recipe's own headings; the shopping list adds the amounts together.

### Possible Approach
1. `group: string | null` on each line, no collection: a group is its name on the lines. Every list goes through one pure helper (no group first, then groups in the order they appear).
2. In the form, a `PickOrCreate` in each ingredient's editor and a tappable `SectionDivider` heading that renames the group (merging with another of the same name) or removes it with an Undo, keeping its lines.
3. Extend the readers' schema with a required, nullable `group` and say in the prompt never to invent one; a split line keeps its group.
4. Leave the rules' lines client-shaped: measure whether a per-line check fits the 1,000-expression budget at 60 lines, and prove access is unchanged.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** put a line in a group or a new one, see the headings, move a line to another group, rename or remove a group (its lines stay).
- [x] **Entry points:** an ingredient's editor in the recipe form, a heading in the form, the recipe drawer, cooking mode's Ingredients and steps, and the three readings.

### Success Criteria
- [x] A recipe with no groups looks the same in the drawer, the form and cooking mode; a recipe written before this (no `group` key) opens, cooks, shops and saves, and its save writes `group: null`; checked in the browser over a legacy-shaped document.
- [x] Two lines of one ingredient in two groups are never merged by the form, the reader or the save, sum on the shopping list and in cost and nutrition, and say their group where they show away from their heading.
- [x] Moving lines between groups records no tweak on a cooked recipe.
- [x] The rules matrix (owner, another user, signed out; with groups, null and a legacy document) gives the same outcome on the new rules as on the previous ones.
- [x] `npx tsc -b --force` and `npx eslint` pass; `check:pinch-math` and `check:pinch-ingest` cover the order, the moves, the step sharing and the reader's groups; driven in a real browser at 390×844, 320×568 and 1280 in light and dark, with 1, 5 and 30 lines and 1, 3 and 8 groups.
- [x] `UX.md`, `TECHNICAL.md` and the README match what shipped.

### Issue 43: Settings: reminders, the morning note, timer pushes and how long new boxes keep

**Prerequisites:** Issue 33, Issue 41
**Target PR Size:** ~2,000 lines (the document and its rules, the listener and helpers, the screen, the device push helpers, the Function and its checks, the timer hook, the seed and docs)
**Files:**
- `PinchSettings`, `ReminderKind` in `types.ts`; `REMINDER_KINDS`, the day ranges and choices in `constants.ts`; `utils/settings.ts`; `getEatByDefault`'s `usual` argument in `utils/containers.ts`
- `store/slices/pinchSettingsSlice.ts`, `store/actions/pinchSettingsActions.ts`, `startPinchSettingsListener`, `usePinchSettings`, `usePinchSync`
- `components/settings/` (`SettingsScreen`, `NutritionSection`, `RemindersSection`, `KeepingSection`), `src/components/SettingsGroup.tsx` and `SettingsRow.tsx`, the Settings tab in `PinchNav` and `Pinch.tsx` (it was a gear in `KitchenScreen`'s header opening a subview until round 10), `?open=fridge` in `Pinch.tsx`
- `src/lib/notifications/devicePush.ts`, `notificationsQueries.ts`, `registerDeviceToken.ts`, `enablePushNotifications.ts`
- `hooks/useTimerPush.ts` and one call in `useCookTimers`
- `functions/src/apps/pinch/` (`sendEatSoonDigest`, `eatSoonDigest`), `functions/src/notifications/sendPush.ts` and `sendScheduledReminders.ts`, `functions/README.md`, `firestore.indexes.json`
- `firestore.rules` (`apps/pinch/settings/{uid}`), `scripts/seeds/pinchScale.ts`, `scripts/checks/pinchMath.ts` and `pinchDigest.ts`, `scripts/checkFirestoreIndexes.ts`

**Context:** Read `TECHNICAL.md` decision 24, §5h, criterion 16 and open question 25; `UX.md`'s Settings; CLAUDE.md's "Ask for a permission on a tap, with the reason beside it", "A scheduled sender never flushes a backlog" and "Per-member private data".

### Description
A person can choose what Pinch reminds them about and how long a new fridge or freezer box starts with. The Settings tab, the right-most in the bar, holds a switch per kind of reminder (each asks for the browser's notifications on its tap; the device's own switch is the site's, in the profile) (a morning note naming what is due or past its date, and a push when a cooking timer ends), and the days a new box starts with. Existing boxes keep their dates.

### Possible Approach
1. One small document per person, written by their first change, owner-only, with its own rules block; readers default, later changes are dotted paths.
2. `getEatByDefault` takes the person's usual days; the three places a default is made pass them.
3. The device's push is read from the browser and turned on only from a tap; the choice to turn it off sticks across reloads.
4. A scheduled function, one push a day per person in their own hour, through the one FCM sender; a timer hook that schedules and cancels a reminder per running timer.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** the first change creates the document, every switch and pill updates it, reading shows the defaults before it exists; there is no delete in the screen (the rules allow the owner one).
- [x] **Entry points:** the Settings tab (the one place; it was the gear in Kitchen's header until round 10), the put-away form, cooking mode's Finish panel and a box's move view for the days, a notification's link for Fridge & freezer.

### Success Criteria
- [x] Nothing is written until the first change; a person with no document sees the defaults and a new box starts at 4 and 90 days as before.
- [x] The rules matrix (owner, another user, signed out; out-of-bounds days, hour and lead time, a non-bool switch, an extra key, a pre-stamped `lastDigestDay`, a legacy document) gives the intended outcome on the new rules and denies on the previous ones; every pre-existing rule on the touched collections and the reminders rules answer the same.
- [x] The note: nothing due sends nothing; past only, due only and both read right for 1, 2, 3 and 12 dishes; the hour boundary, other zones, an already-sent day and a person with the switch off are checked, and the handler was run against Taylor's boxes with a stub sender.
- [x] A timer's push is scheduled when it starts, cancelled by pause, reset, finishing in view and leaving, and left to go out when it ends while the page is hidden.
- [x] A timer's push reaches the person by one path: marked `inAppToast: false` so the in-app toast skips it, kept or cancelled (never doubled) by a picked-up cook, not scheduled for a timer already past its end, and cancelled by "Not now".
- [x] The sender deletes finished reminders after 14 days (200 a run), a device's push token leaves the person on sign-out, and tokens FCM reports as gone are dropped.
- [x] Settings' first change is a transaction that reads the server, so a device that was offline while another created the document never replaces it.
- [x] A running timer offers the same switch where the person is: a quiet "Buzz me if the screen is off" row under it, whose modal asks the browser on its own Turn on tap and switches both the device and the Timers reminder on, and says plainly when the browser is blocked or can't push; nothing is drawn once it is on (round 8 fix; `getTimerBuzzOffer` in `npm run check:pinch-math`).
- [ ] A real push reaching a real phone, locked, and the installed iPhone case: not checkable from the sandbox.
- [x] `npx tsc -b --force` and `npx eslint` pass; `check:pinch-math`, `check:pinch-ingest` and `check:indexes` pass; driven in a real browser at 390×844, 320×568, 375×667, 844×390 and 1280 in light and dark.
- [x] `UX.md`, `TECHNICAL.md`, `JOURNEYS.md`, `functions/README.md` and the README match what shipped.

### Issue 44: Recipe form editors, Sources rows that open, and recipe links

**Prerequisites:** Issue 6, Issue 40
**Target PR Size:** ~1,100 lines (two summary rows and their editors, the Sources row and sheet, the links model, helpers, field and drawer section, the rule, the checks and docs)
**Files:**
- `RecipePhotoField`, `RecipeSourceField`, `RecipeWhyField` (in `RecipeBasics`) and `RecipeLinksField` as `SummaryEditor` rows in `RecipeForm`; `PhotoPicker`'s `cover` variant; `SummaryEditor`'s `leading` and `shouldFocus`, the popover's height cap and its drawer footer's `form-footer` class; `UndoSnackbar`'s `isOverSheet`
- `SourcesSubview` (every row opens the source) and `SourceFormSheet` ("Show the N recipes from X")
- `Recipe.links` and `RecipeLink` in `types.ts`, the caps and labels in `constants.ts`, `utils/recipeLinks.ts`, `recipeFormModel.ts`, `saveRecipe`, `RecipeLinksSection` in `RecipeDrawer`, `links` in `isRecipe` in `firestore.rules`, `scripts/checks/pinchLinks.ts`, the Adobo seed

**Context:** Read `TECHNICAL.md` §5a and §5f.2; `UX.md`'s Recipe form, Recipe details and Sources; CLAUDE.md's "A phone form shows a few inputs at a time", "Never stack an overlay on an overlay" and "Parsing pasted text for a link never glues tokens together".

### Description
The recipe form's photo and source are summary rows with an editor, like its title and times, so it opens with fewer controls. The Sources screen's rows open their source (the pencil is gone), and the sheet holds the way to its recipes. A recipe can keep one how-to video and other links with default or custom labels, shown at the bottom of the recipe and opening the other site in a new tab.

### Possible Approach
1. Photo and source become `SummaryEditor` rows (a drawer on a phone, a popover from `sm`); the photo editor is `PhotoPicker variant='cover'` (choose, take on a touch screen, remove, the type and size line). The write paths do not change.
2. Every Sources row is one button that opens `SourceFormSheet`; a source with recipes starts the sheet with the roomy "Show the N recipes" row (the door's one home), one on no recipe says so.
3. `Recipe.links` read through `getRecipeLinks` (`cleanLinks`: web addresses only, one how-to, eight in all); the form row's editor keeps one open row at a time inside its one drawer and removes with the Undo countdown above the drawer; the drawer's section is last, built of `Button href target='_blank'`.
4. `links` in `hasOnly` and `get('links', []) is list && size() <= 8` in `isRecipe`; verify the owner, another user and a signed-out visitor against the emulator with the base rules as the control, and a legacy recipe read, edit and save.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** add, see, relabel and remove a how-to video and other links from the form's Links row and see them at the bottom of the recipe.
- [ ] **Entry points:** the Links, Photo and Where it's from rows; each Sources row; the how-to card and link rows in the drawer.

### Success Criteria
- [ ] A recipe written before links (no key) opens with no links section, edits and saves, and its save writes `links: []`; checked in the browser over a legacy-shaped document.
- [ ] A YouTube link pasted as `youtu.be`, `watch?v=`, `/shorts/` or `/embed/` shows its thumbnail; any other address shows the tinted tile; none of them embeds or plays.
- [ ] The Source sheet opens from every row, closes with one back press or Escape, returns focus to its row and "Show the N recipes" leaves one clean history entry.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the editors were measured at 390×844 and 320×568 in light and dark and at 1280.
- [ ] The README Build Plan lines are checked off; `UX.md` and `TECHNICAL.md` still match what shipped.

### Issue 45: Photo suggestions for a new recipe, and a web photo as a cover

**Prerequisites:** Issue 6, Issue 44
**Target PR Size:** ~1,900 lines (the function and its provider layer, its checks, the cover field, the drawer block, the grid, the setting, the rules and the docs)
**Files:**
- `functions/src/imageSearch/` (`searchImages`, `ddg`, `google`, `providers`, `optionalSecret`, `usage`, `results`, `fetchCapped`, `types`), `functions/src/apps/pinch/searchRecipeImages.ts`, the export in `functions/src/index.ts`, `functions/README.md`
- `Recipe.coverUrl` and `WebPhoto` in `types.ts`, the caps in `constants.ts`, `utils/recipeCover.ts`, `saveRecipe`, `CoverImage` and its five callers, `RecipePhotoField`, `RecipePhotoSuggestions`, `queries/photoQueries.ts`, `src/components/ImageChoiceGrid`, `FormSection`'s `action`, `PhotoPicker`'s `isCompact`
- `PinchSettings.suggestPhotos`, `PhotosSection` in Settings, `coverUrl` and `suggestPhotos` and the two server-only collections in `firestore.rules`, `scripts/checks/imageSearch.ts` and `pinchPhotos.ts`

**Context:** Read `TECHNICAL.md` §5j and open question 28; `functions/README.md`'s `searchRecipeImages` note; CLAUDE.md's "Cloud Functions", "Every AI entry point says what happens before anything is sent" and "An image from a URL that can stop working".

### Description
Opening the Photo row of a new recipe shows six pictures found by searching the web with its title, under the upload buttons. Picking one makes it the cover, kept as its web address (no copy, no Storage); an upload and a web photo replace each other and Remove goes back to none. Which search answers is one environment switch, DuckDuckGo first and Google as the fallback.

### Possible Approach
1. A callable over a provider layer with a shared cache, daily budgets and a per-person limit, built and checked against fakes; the live services were not reachable from the sandbox.
2. `coverUrl` beside `coverPath`, at most one set, drawn everywhere through `FallbackImage` with the pot tile as the fallback; the rules enforce https, the length and the exclusivity.
3. The block in the Photo editor of a new recipe only, with the line that says what is sent, a Turn off chip and a Settings row.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** pick a web photo for a new recipe, see it on the row, the list and the drawer, replace it with an upload or another photo, and remove it.
- [ ] **Entry points:** the Photo row's editor (new recipes only), the block's Turn off chip, and Settings' "Suggest photos for new recipes".

### Success Criteria
- [ ] A recipe written before web covers (no `coverUrl`) opens, edits and saves, and the save writes `coverUrl: null`; checked in the browser over a legacy-shaped document.
- [ ] Editing a recipe never searches; a title under three letters, the switch off, or no title draws nothing and sends nothing.
- [ ] A result with a non-https address is dropped, an unreachable picture is not chosen, and a failed or empty search leaves the upload working.
- [ ] The rules were proved on the emulator as the owner, another user and signed out against the base rules.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the editor was measured at 390×844, 375×667, 320×568, 844×390 and 1280×900 in light and dark.
- [ ] Nothing has to exist in production before the merge; the README says how to turn Google on.

### Issue 46: Pantry: packages with dates, and what expiring means for the rest of the app

**Prerequisites:** Issue 3, Issue 18, Issue 33, Issue 41, Issue 43 (and the Shopping tab, which has shipped)
**Target PR Size:** ~7,000 lines (the type and its rules, the date states, the screen and its sheets, five integration points, the digest source, the seeds, the checks and the docs)
**Files:**
- `Package`, `PackageEvent`, `PinchSubview` (`pantry`), `ReminderKind` (`expiring`) in `types.ts`; the package constants and `REMINDER_KINDS` row in `constants.ts`; `utils/packages.ts` (date states, sums per measure, the plans and their Undo, bulk, take-out, line stock, markers, use-it-up), `utils/containers.ts` (`getEatByState` and its labels take a window and a verb), `utils/settings.ts`
- `store/slices/packagesSlice.ts`, `store/actions/packageActions.ts`, `startPackagesListener`, `usePackageActions`, `usePantryTake`, `selectors.ts`, `usePinchSync`
- `components/pantry/` (`PantrySubview`, `PantryRow`, `PantryEntry`, `PackageRow`, `PackageSheet`, `PackageFormSheet`, `PackageFields`, `PackageDateField`, `PantryMoveSheet`, `PantryRecipeDrawer`, `PantryFromShoppingSheet`, `IngredientStock`, `LineStockMarker`), `components/cooking/CookPantryTake`, and small changes to `KitchenScreen`, `IngredientDrawer`, `ShoppingScreen`, `AddToShoppingSheet`, `RecipeDrawer`, `CookingSubview`, `RemindersSection` and `Pinch.tsx` (`?open=pantry`)
- `functions/src/apps/pinch/` (`eatSoonDigest`, `sendEatSoonDigest`), `functions/README.md`, `firestore.indexes.json`, `firestore.rules`
- `scripts/seeds/pinch.ts` and `pinchScale.ts`, `scripts/checks/pinchPantry.ts` and `pinchDigest.ts`

**Context:** Read `TECHNICAL.md` decision 25, §5i, criterion 17 and open question 27; `UX.md`'s Pantry; `JOURNEYS.md` §4.1 and §4.2; CLAUDE.md's "Date-only vs. instant", "A scheduled sender never flushes a backlog", "Design for 5 and for 50", "A door needs a moment" and "Insight budget".

### Description
A person can say what they have and when it expires, and Pinch tells them what to use first and what to toss, the way the fridge does for what they cooked. Each bag, carton or jar is a package with an amount, a place and a date; two of the same thing with different dates are two packages under one ingredient, and totals add only amounts that measure alike. The pantry is part of the rest of the app: recipes mark what is in it, the shopping add sheet leaves out what is covered, a ticked shopping line can become a package, cooking can take out what it used, and the morning note can name ingredients about to expire.

### Possible Approach
1. One document per package under the kitchen, owner-only, a history of ten events like a box's, the date a date-only UTC value; the date states and labels are the fridge's, with the person's lead days as the "soon" window.
2. Pure plans for every change, applied in a transaction that re-reads the package (so a second device's change is never written over), the same plans reused by the bulk acts and their Undo.
3. A subview from a Kitchen tile that appears with the first package: one row per ingredient, soonest first, Select and a past-its-date row as in Fridge & freezer.
4. The pantry's presence elsewhere kept to what changes a decision: a mark only for the exception on a recipe's lines, a hint on a row the pantry covers, one block on the ingredient's drawer, one chip on the shopping list, one card on cooking mode's last screen.
5. The morning note gains a source, not a function; the rules, index, seeds and checks ship with it.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** add (one or several, with "Add another"), see each ingredient's packages and totals, use some or all, move, change the date, edit, toss, delete (with a confirm that says the history goes too), and act on several at once, each with an Undo that restores only what is still as the act left it.
- [x] **Entry points:** Kitchen's Pantry tile (once a package exists), the ingredient drawer's "In your kitchen" and "Add a package", the Shopping tab's "Add to pantry", the package sheet's "Use it up", the morning note's link, and `?open=pantry`. Each is reachable from a screen a person can open; the first package starts from the shopping list's Got it step or, for an ingredient a recipe or saved meal uses, from its drawer's dashed "Add a package" chip (6 taps from a fresh kitchen with one recipe, against 11 through the list).

### Success Criteria
- [x] Dates: past its date, due soon (the person's window), later and no date read right, offer Toss, Use it up and neither, and a date-only value shows the same day west of UTC (driven in `America/Los_Angeles`).
- [x] Several packages: totals add per kind of measure only; a mix of weight and volume shows both; a recipe line against a package of another kind is compared only through the ingredient's own grams per cup or each and says "about"; "to taste" never takes anything out.
- [x] Bulk acts re-read every package inside a transaction per chunk, touch only those still in stock and as shown, report the number really changed and why they left any alone, and their Undo skips a package that changed since.
- [x] The rules matrix (owner, another signed-in user, signed out; every field's bounds, a date off UTC midnight, an extra key, ten events and the budget case, the immutable fields, a legacy reminders document) gives the intended outcome on the new rules and denies on the base ones; every pre-existing rule answers the same (72 cases each, no mismatch).
- [x] The morning note: ingredient-only, dish-only and mixed notes read right, a dish and an ingredient with one name are one thing, the pantry switch alone sends a pantry note, an already-sent day and a person with both off send nothing; the handler was run against the emulator with a stub sender.
- [x] A first run volunteers nothing: no tile, no markers, no hint, no drawer block, no chip, no card; Jamie's empty kitchen and a kitchen with no packages are unchanged (`JOURNEYS.md` §4.2).
- [x] Alex's and Taylor's seeds show every state (8 packages over 5 ingredients; 120 over 60 for the scale kitchen); the pantry at scale is checked at 390×844 with the dev build at 4× CPU.
- [x] Second review's fixes: Take out on Finish is one local-first batch (it works with the network cut and a refusal is told when it syncs), a cup of milk from a litre carton is no shortfall, "Add a package" starts from the newest package of that ingredient, a recipe's edit writes only the collections it changed, the "Add to pantry" mark is the shopping line's own `pantryAddedAt` (so a second device does not offer it again), the past-its-date row says where the boxes are, and sign-out takes the push token off the account first.
- [ ] A real push reaching a real phone, offline behaviour on a device and touch use: not checkable from the sandbox.
- [ ] The production index `packages (status, expiresAt)` building and the digest finding packages with it (the emulator never enforces indexes).
- [x] `npx tsc -b --force` and `npx eslint` pass; `check:pinch-math`, `check:pinch-ingest` and `check:indexes` pass; driven in a real browser at 390×844, 320×568, 375×667, 844×390 and 1280 in light and dark.
- [x] `README.md`, `UX.md`, `TECHNICAL.md`, `JOURNEYS.md`, `SEEDING.md` and `functions/README.md` match what shipped.

### Issue 47: Kitchen, fridge, pantry and first runs: the review's fixes, and Recipes' bulk collections and star

**Prerequisites:** Issue 26, Issue 41, Issue 46
**Target PR Size:** ~2,600 lines (the fridge's list and header, the Kitchen front, the Recipes selection mode and its sheet, two thunks, the star, the rules key, an `EmptyCard` and a `HeaderIconButton`, checks and docs)
**Files:**
- `ContainersSubview.tsx`, `utils/containers.ts` (`getLandingPlace`, `getSharedPlace`, `getPlacedTitle`, `getSelectionNote`, `BulkAction.isEitherPlace`), `src/components/SelectionBar.tsx`, `SectionHeader.tsx` (`lead`), `HeaderIconButton.tsx`
- `KitchenScreen.tsx`, `PantrySubview.tsx`, `PantryFromShoppingSheet.tsx`, `PackageFields.tsx`, `SettingsSubview.tsx`, `PillGroup.tsx`, `FilterBar.tsx`, `EmptyCard.tsx`, `CalendarScreen.tsx`, `RecipesScreen.tsx`, `ShoppingScreen.tsx`
- `RecipeRow.tsx` (star and tick), `AddToCollectionSheet.tsx`, `useAddToCollections.ts`, `useRecipeFavorite.ts`, `collectionActions.ts` (`addRecipesToCollections`, `undoAddToCollections`), `recipeActions.ts` (`setRecipeFavorite`), `utils/collections.ts`, `Recipe.isFavorite`, `firestore.rules`
- `utils/packages.ts` (`STAPLE` line stock, kitchen amounts, in-date totals), `usePantryTake.ts`, `CONTAINER_FRIDGE_DAYS`, the seeds, `scripts/checks/pinchFridge.ts`, `pinchPantry.ts`, `pinchOrganize.ts`
- Fifth design round: `src/components/BackLink.tsx`, `EntryTile.tsx`, `PillGroup.tsx`, `Pill.tsx`, `SectionHeader.tsx`, `forms/AddFieldChips.tsx`, `ImageChoiceGrid.tsx`, `plan/ItemSearch.tsx`, `utils/pickerSuggestions.ts`, `notes/NoteEntry.tsx`, `RecipeForm.tsx`, `NutritionReview.tsx`, `scripts/checks/pinchPickers.ts`
- Sixth design pass: `settings/KeepingSection.tsx`, `SettingsSubview.tsx`, `RecipeDrawer.tsx`, `ContainerSheet.tsx`, `src/components/GroupRow.tsx`, `RecipeFront.tsx`, `plan/ItemSearch.tsx`, `RecipeSteps.tsx`, `PantrySubview.tsx`, `utils/containers.ts` (`getBoxLine`, `getDueText`), `utils/packages.ts` (`getPantryDueText`), `src/ui/ThemeToggle.tsx`
- Seventh design pass: `RecipeDrawer.tsx` (`CollectionRows`), `src/components/DetailSheet.tsx`, `src/components/GroupRow.tsx`, `plan/ItemSearch.tsx`, `PackageFormSheet.tsx`, `ShoppingAddSheet.tsx`, `ProductsSubview.tsx`, `RecipeIngredients.tsx`, `PantrySubview.tsx`, `CollectionsSheet.tsx`, `src/ui/AuthAvatar.tsx`

**Context:** The round 8 product and design reviews of the stack's head. Read CLAUDE.md's "Design & UX" (the insight budget, one door per row, "A control added to a header row is checked at 320px") and `JOURNEYS.md` §4.1 and §4.2.

### Description
Fridge & freezer's past-its-date row counts both places, so it says what Kitchen's tile says, and the screen opens on the place holding more boxes that want a look; its header loses the subtitle and the 56px tile (a 🕘 icon instead). Kitchen's front is two tiles and header icons (Stores & prices, Settings, a shrinking "+ New ingredient"), and the first runs of Recipes, Shopping, Calendar and Kitchen are one tinted card. Recipes gets Select with "Add to a collection" and a star. The pantry step-through asks how much was bought, recipe lines leave the staples out of "Not in your pantry", cooking's Take out says at once that offline can't, and the fridge starts at 3 days.

### Possible Approach
1. Pure helpers with check cases (the landing place, the shared place, the add and remove plans, the in-date totals, the staple line stock), mutation-tested.
2. `isFavorite` read as false when missing, written only by the star, rules additive; the bulk add re-reads each recipe in a transaction per 200, merges under the cap and undoes only what it added.
3. Header icons with 40px tap areas from a pseudo-element, and every first run a tinted card.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** star and unstar a recipe; add many recipes to existing or new collections and undo it.
- [x] **Entry points:** the Recipes header's Select icon (from two recipes) and the row's star; Kitchen's header storefront icon; Fridge & freezer's header 🕘 icon.

### Success Criteria
- [x] A recipe written before the star (no `isFavorite`) reads, edits, stars and joins a bulk add, checked in the browser and on the emulator; the rules matrix shows only the owner's star and a create with the key as new allows.
- [x] Kitchen to cleared in three taps (the tile, "Toss them", the confirm) with the tile's count and the landing's row agreeing.
- [x] The first ingredient row is visible at 320×568 on Kitchen; first-row shares printed at 390×844, 375×667, 390×560, 320×568 and 844×390 before and after.
- [x] Third design round: Kitchen's door tiles cut their status to one line and the subtitle goes while a door exists (first ingredient 47 / 57 / 68 / 67 / 86% → 43 / 54 / 63 / 62 / 78%); View options is the shared 28px header icon on Calendar and, while Recipes has no pill row, in Recipes' header (Jamie with one recipe 22 / 28 / 33 / 32 / 48% → 17 / 22 / 26 / 25 / 37%); the toast Dismiss, thin pills, label chips, suggestion chips and 320px Month cells reach 40px (measured with `elementFromPoint`); Settings keeps its opening card at every height and draws the reminder kinds only once the device is on (390px shorter with the device off).
- [x] Fourth design round: Recipes' Select mode on a landscape phone puts "Select all shown" beside Cancel and tucks the search row away while nothing is typed (full rows above the footer at 390×844 / 320×568 / 375×667 / 390×560 / 844×390: 3 / 2 / 3 / 2 / 0 → 3 / 2 / 3 / 2 / 1); Kitchen's front is shorter on short screens (first ingredient 43 / 62 / 54 / 63 / 78% → 43 / 56 / 54 / 57 / 67%) and Pantry's actions and switch share rows with the title and the search from `sm`; the fill-in nudge is a sentence over two chips ("Add prices", "Not now") with no underlined text on the Week summary and both recipe drawers; View options is the 28px header icon wherever no filter button sits beside a search field, so the Saved meals pill row stays 24px; Pantry's four pills fit one line at 320px.
- [x] Fifth design round (the owner's note that some subviews read as bare and that the link-style button and its place were wrong): the four ingredient pickers (Pantry's add, Shopping's one thing, the recipe form's Ingredient, Stores & prices' price) open on up to three of the person's own ingredients under a caption, none on a first run or in an unresolved ingredient's drawer (Pantry's add 207 → 395px at 390×844, the Fridge add sheet being 408; two 40px rows at 844×390); one hairline `BackLink` replaces six local copies and eight inline text Backs, a note's Edit is a chip beside Apply to the recipe, and a remove ✕ has a 44×40 hit area; Fridge & freezer's and Pantry's switches fit at 320 with the scale kitchen's counts (they wrap below 390 only when their pills do not fit); the recipe form draws no Nutrition section while every metric is off and the ingredient form's serving hint points at its chip; Kitchen's door tiles are shallower (63 / 63 / 57 / 66 / 42px, first ingredient 43 / 54 / 57 / 56 / 67% → 40 / 51 / 55 / 56 / 67% at 390×844 / 375×667 / 390×560 / 320×568 / 844×390); the photo suggestions' tiles clear the footer at 844×390; Stores & prices' headings no longer log a `React.Fragment` warning; Escape takes a swapped-in view back on a plain page too.
- [x] Sixth design pass (the last fresh review: no screen reads bare, a few rough ones left): Settings' Fridge and Freezer are two summary rows whose editors hold the pills, and the "Changes save as you make them." card is gone (first switch 32 / 40 / 48 / 47 / 64% → 24 / 30 / 36 / 36 / 47% at 390×844 / 375×667 / 390×560 / 320×568 / 844×390; Photos, the last section, 887 → 573px at 390×844); a recipe's collections and a batch's "Each box" are roomy chip rows that all open (69px rows); the Kitchen and Pantry door statuses lead with the count past its date; with no Cost tile the "See what it costs" note ends the recipe drawer; the ingredient pickers' rows carry a chip and the family (53px rows; Pantry's add 395 → 407px at 390×844, the Fridge add sheet being 408); a step is removed with the same ✕ as an ingredient; the site header's theme switch has a 56×40 hit box in every app; Pantry drops its subtitle once it holds a package.
- [x] Seventh design pass (verifying the sixth): a collection holding only the open recipe is a quiet state row with no chevron; a 1024px-wide window under 600px tall keeps the detail modal with a taller body (1280×400: 144 → up to 216px, two ingredient rows above the footer); typed results in the ingredient pickers are compact and capped at four rows on a landscape phone (typing "c" at 844×390: Pantry add 694 → 390px, Stores & prices 730 → 414, Shopping add 466 → 434); the recipe form's in-place picker scrolls its field up on a short screen (175 → 64px); an emptied Pantry is the shared first-run card and its subtitle shows only while loading or on an error; the signed-out header's Home and Sign in have 40px hit areas; the Collections sheet's rows say whole names on two lines (56 → 88px); a held sheet is the same height in every view to the pixel (a 12px gap at 320×568 closed; the collections view's blank space is accepted); `GroupRow` no longer hands Dreamer UI's `Button` a Fragment, which the saved-meal More and Share views logged.
- [x] `npx tsc -b --force`, `npx eslint`, `check:pinch-math`, `check:pinch-ingest` and `check:indexes` pass.

### Issue 48: Share a recipe or a saved meal with a link, and keep what you were sent

**Prerequisites:** Issue 6, Issue 11, Issue 17, Issue 40, Issue 42, Issue 43, Issue 44, Issue 45
**Target PR Size:** ~7,500 lines (the three callables with their allowlist, the rules, the owner's Share view and Shared links list, the public page and the import, three check scripts, the seeds and the docs)
**Files:**
- `PinchShare`, `SharedRecipe`, `SharedMeal`, `SharedMealItem`, `PinchShareResult`, `ChangePinchShareRequest` and `Result`, `CopyPinchShareCover*`, `PinchSubview` (`shares`) in `types.ts`; `MAX_PINCH_SHARES`, `SHARE_ID_LENGTH`, `MAX_SHARED_MEAL_RECIPES`, `MAX_SHARED_MEAL_LINES`, `SHARE_LINK_PATH`, `SHARE_SLOT_COPY` in `constants.ts`
- `functions/src/apps/pinch/` (`getPinchShare`, `changePinchShare`, `copyPinchShareCover`, `pinchShareView`, `pinchShareStore`), `functions/src/index.ts`, `functions/README.md`, `firestore.rules`, `storage.rules`
- The owner's side: `utils/sharing.ts`, `store/slices/sharesSlice.ts`, `store/actions/shareActions.ts`, `startSharesListener`, `selectors.ts`, `usePinchSync`, `components/share/` (`ShareView`, `ShareDoorRow`, `SharedLinksSubview`), `components/settings/SharedLinksSection`, and small changes to `RecipeDrawer`, `MealDrawer`, `SettingsSubview`, `RecipeForm`, `MealBuilder`, `recipeActions`, `mealActions` (`setMealFavorite` no longer writes `updatedAt`) and `Pinch.tsx`
- The page: `SharedPinch.tsx`, `components/public/` (`ShareSlot`, `SlotCard`, `SharedBrand`, `SharedIntro`, `SharedCover`, `SharedRecipeBody`, `SharedMealBody`, `SharedStates`), `queries/shareQueries.ts`, `hooks/useShareAdd.ts`, `utils/importShare.ts`, `store/actions/importShareActions.ts`, `RecipeCareSection` and `RecipeLinksSection` (a title, a `rel`, no thumbnail), `utils/recipeCover.ts` (`getRecipeCoverPath`), `src/routes/AppRoutes.tsx`, `src/hooks/useNoIndex.ts`, `src/ui/Layout.tsx`, `cloudflare-worker.js`
- `scripts/seeds/pinch.ts` (two shares for Alex), `scripts/checks/pinchShare.ts`, `pinchShareBuild.ts`, `pinchShareImport.ts`, the `check:pinch-share` script and its CI step

**Context:** Read `TECHNICAL.md` decision 27, §5k, Data Schema 10 and 11, criteria 20 and 21 and open question 29; `UX.md`'s Share, Shared links and Shared link; `JOURNEYS.md` §4.1, §4.2 and §5.10; CLAUDE.md's "Security and privacy" (every bullet), "One shared page for everyone; only its action slot changes" and "A document fills the form"; A-List's calendar share (`functions/src/apps/a-list/getCalendarShare.ts`, `src/apps/a-list/SharedCalendar.tsx`) is the reference. This is the roadmap's Issue 38, grown to saved meals and to adding what you were sent.

### Description
A person can send a recipe, or a saved meal with the recipes it uses, to anyone with a link. The friend opens it with no account and reads it as a page, and the copy is taken once: later edits to the original change nothing until the owner updates it. The owner keeps three verbs: **Update the shared copy** (the address stays), **Get a new link** (the old one stops working at once) and **Stop sharing**. The page knows who shared it without saying: the owner sees it is theirs and gets a way back into Pinch, a signed-in visitor can add it to their own recipes (or saved meals, which bring their recipes), and a signed-out visitor is invited to sign in and keep it, on the same page with the same card in the same place. Nothing about the person, their prices, notes or history goes out, search engines are asked not to list it, and the address goes nowhere else.

### Possible Approach
1. A share is a copy a Function made: `shares/{id}` (the owner's record, read by its owner) and `shareSnapshots/{id}` (read by no client), written only by `changePinchShare`, with an id of 130 bits minted on the server. Visitors read through `getPinchShare`, which answers one "not found" for every id that isn't a live link and tells the owner, and only the owner, that it is theirs.
2. One allowlist, run when the copy is written and again when it is served, so nothing but named, capped fields is ever stored or sent; the client builds the copy by named fields too.
3. An uploaded cover is copied by the server into a Storage folder named by the id, each file under its own download token; a web-search cover is never shared; stopping a link deletes the files before the documents.
4. The owner's side is one `ShareView` in two homes (a recipe's and a saved meal's ⋯ More, and a Shared links sheet in Settings), with outcomes inside the view and no toast over a drawer.
5. The page is one layout for everyone with one action slot; adding is one `writeBatch` that maps each line to the visitor's own ingredient or makes a custom one, rebuilt from the share by an allowlist, with its cover copied after the commit and an Undo that is all or none.
6. The rules, the checks and the seeds ship with it; the share's denials are proven on the emulator against the base rules too.

### CRUD & Entry-Point Requirements
- [x] **Create / Read / Update / Delete:** make a link, open it (anyone), take the copy again, get a new address, stop sharing; add what a link shows to your own recipes or saved meals, and take that back with an Undo.
- [x] **Entry points:** "Share" in a recipe's ⋯ More and in a saved meal's ⋯ More; Settings' "Shared links" row (once a link exists) and its rows' sheet; the page `/pinch/shared/:shareId` and, on it, "Open in Pinch" (the owner), "Add to my recipes" or "Add to my saved meals", "See it in Pinch", "Undo", "Sign in with Google", a dish row with "‹ Back", and, on a link that doesn't open, "Try again" and "Open Pinch"; at 30 links the cap line's "Your shared links" chip in either Share view. Each is reachable from a screen a person can open; a planned meal has no Share (save it first) and a first run shows nothing about sharing.

### Success Criteria
*Ticked: covered by `check:pinch-share`, the typecheck and lint, the emulator runs (305 requests and assertions, none failing) or a browser pass at the sizes named. Open: the two unticked boxes, the worker's headers and what no run could prove.*

- [x] The copy holds only the allowlist: a recipe's title, description, servings, minutes, ingredient lines (name, `cat-` id, amount, unit, note, group), steps, care, https links and an uploaded cover, and a saved meal's name, recipes and items; no uid, name, email, photo, price, product, store, note, tweak, cook, favorite, collection, source, nutrition, id of the owner's or web cover is in the stored copy or in `getPinchShare`'s answer (a mutation of the allowlist that spreads, drops a cap, accepts `http`, trusts a client's `hasCover` or puts the uid in the answer fails a named case).
- [x] The id is 26 characters of the 32-character alphabet drawn with `crypto.randomInt` (130 bits), no client supplies one, and its pattern is the same in the client, the Function and the Storage rule.
- [x] A malformed, unknown and deleted id get the same `{ status: 'not_found' }` body; `update` and `renew` answer not-found alike for a missing, someone else's and a malformed share, and `delete` answers `{ shareId: null }` for those three and deletes nothing.
- [x] A recipe or meal that can't be shared whole is refused, never cut: no title, unusable servings, neither an ingredient nor a step, an item pointing at a missing recipe, more than ten recipes or 300 ingredient lines.
- [x] The client's builders copy by name (a recipe with extra fields shares none of them), the stamp of a saved meal includes its recipes', and a link reads as changed since, gone, or neither.
- [x] An import maps each line to a catalog id, a match among the person's own ingredients, or one new custom ingredient per distinct name; keeps group, note, amount and unit; rebuilds every document with every key and the form's caps; plans at most 311 writes and refuses more; and the planned documents' keys equal the rules' `hasOnly` and `hasAll` lists.
- [x] Undo is all or none: it refuses when a written recipe or the meal was edited, is on a planned day, in a box or in another saved meal, and otherwise deletes exactly what was written plus the ingredients the add made that are unchanged and unused.
- [x] The rules matrix (the owner, another signed-in user, signed out; both Firestore collections and the Storage path) gives the intended outcome on the new rules and the base rules differ only where intended (34 probes on each, three outcomes differ, all the owner reading their own share; the Storage half was not run against the base rules): the owner reads their share, nobody writes a share or a snapshot, nobody reads a snapshot, a signed-out `get` of a cover is allowed and a `list`, a write and a delete are not.
- [x] The three callables run against the emulators (in an offline suite the Functions' bucket must be set, `STORAGE_BUCKET_URL` in `SEEDING.md`; a suite started without it can't reach a cover): create, a second create returning the same id, update, renew (the old link and its folder dead, the new one live), delete (the folder gone), the cap at 30, `not-found` for another user, a cover copied under its own token that `getDownloadURL` opens, and `copyPinchShareCover` onto a visitor's own recipe; the response body of `getPinchShare` as the owner, another user and signed out holds no uid and no forbidden key.
- [x] The owner's views at 390×844, 375×667, 320×568, 390×560 and 844×390 in light and dark: not shared, shared, changed since, original deleted, busy and failed states; the primary is pinned in the sheet's footer and on screen when the view opens; the link block does not overflow and Copy link and Send share a line at 320px; the Share view's body does not scroll at 390×844 (it scrolls a little below that, the primary staying put); every control is 40px; the back gesture closes one layer over More, the Share view and a sheet.
- [x] At 844×390 the Share view is two columns (the link and its cards left, the actions right), a changed link's Copy link and Send sit beside Update the shared copy in the footer, and the first action row starts at 144px: full action rows above the footer are 3 when shared (was 1) and 2 when changed since (was 0), the same 3 and 2 at 390×560, 320×568 and 390×844, and 1 for a link whose original was deleted (its only row); from 520px wide a changed link at 568×320 and 639×390 shows 2 full rows too (it showed 0), and under 600px tall the dated line and the subtitle are left out.
- [x] At 30 links the cap line carries a "Your shared links" chip (40px, hit-tested) that closes the drawer first and opens Shared links, the view leaves out the "In the copy" and "Left out" list and its body fits with nothing cut under the footer (301 of 301 px at 320×568); one back press, the header Back or the browser's, returns to the screen it was opened from, and Settings' own door still returns to Settings.
- [x] A link that doesn't open draws the Pinch mark and name and the page's tinted card with its way on ("Open Pinch", and "Try again" beside it when the lookup failed); a malformed, an unknown and a stopped link are one screen and one DOM at two sizes in both themes; "Open Pinch" lands on `/pinch` and "Try again" recovers the page; the card is 358×154 (failed) and 358×174, and the page's action card is still 358×154 for the owner, a signed-in and a signed-out visitor.
- [x] The page at six sizes in light and dark as signed out, as Jamie and as Alex: the slot is the same 154px card in every state, its top edge inside the top 40% of the screen at 390×844 and 1280×900 and fully on screen at the other four; nothing clips at 320px; no `<body>` scroll; a saved meal's dish opens in place and the back gesture closes it; signing in on the page flips the slot in place; a stopped link and a mistyped id show the same screen.
- [x] The page's own requests are only the callable, our Storage and the same-origin logo; the id is in the document URL, the callable's body and the Storage path and nowhere else (presence is `pinch/shared`, no storage, no log); `<meta name='robots'>` and `<meta name='referrer'>` are present and gone after leaving.
- [ ] The worker's response carries `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` and a generic preview (the worker was not run).
- [x] Adding as Jamie writes the recipe or saved meal and its recipes with every key (a saved meal's recipes included), a double tap writes once, a cover arrives at the visitor's own path, offline says so, and Undo takes back exactly that; after editing what was added, Undo refuses and says why.
- [x] A recipe written before a field existed (no `care`, `links`, `collectionIds`, `isFavorite` or `coverUrl`) shares, and a cover copies onto an older-shaped recipe; a kitchen that never shares sees no change.
- [x] A shared recipe's original deleted: the link stops, or, when the stop fails, stays listed as "Original deleted" and can be stopped there; archiving leaves the link up and the confirm says so.
- [x] Alex's two seeded links open by hand (`/pinch/shared/seedsharercp23456789abcdef` and `/pinch/shared/seedsharemeal23456789abcde`), the second reading as changed since.
- [x] `SITE_VERSION` bumped (minor), `npx tsc -b --force` and `npx eslint .` pass, the Functions typecheck passes, and `check:pinch-share` and `check:indexes` pass; the feature was driven in a real browser at 390×844 in light and dark.
- [ ] What no run could prove: a real `navigator.share` sheet, a real plain-HTTP origin, the "couldn't load your shared links" message, a real Storage failure inside a cover copy, Undo refusing for a recipe that was planned or boxed (the check proves it), two creates racing the 30 cap, a real 401 from production, the Storage rules under the base rules, the real Google sign-in popup, and production's invoker grant for the new callables.
- [x] `README.md` (Build Plan, features, Under the Hood), `UX.md`, `TECHNICAL.md`, `JOURNEYS.md`, `SEEDING.md`, `functions/README.md` and the Pinch rules files match what shipped; CLAUDE.md's Security and privacy section carries the lessons.

### Decisions the owner may overrule
The owner dictated this feature, so each of these is a reading of what they said, and each is cheap to change now.
- **The three verbs.** "Refresh it, update it, or cancel it" became **Update the shared copy** (also the answer to "refresh"), **Get a new link** (for a link that went somewhere it shouldn't) and **Stop sharing**.
- **The sharer's uid is stored on the server's record and never sent to a visitor.** The page learns only `isOwner` (the server compares uids) and, to the owner alone, the id of their own recipe or saved meal.
- **Planned meals are not shared** ("Save to Saved meals", then share). A web-search cover is never shared (the visitor's browser would load a third-party site). There is no PIN and no expiry.
- **The slot is one identical card, inline on every size**, not a sticky phone bar (a bar would cover a quarter of a short screen): 154px in every state at every size, with the three signed-out lines about an account under it, only for that visitor. From `lg`, or from `sm` on a screen 599px high or less, it is sticky in a right column; on a phone an 80px cover tile sits beside the title. Its top edge is inside the top 40% only at 390×844 and 1280×900; on the other four sizes it is fully on screen and only a sticky bar would lift it.
- **A link that doesn't open** gets the page's own Pinch row and card, with "Open Pinch" (the page's full-width button, not a chip, as in every other state of the card) as its one way on, and "Try again" beside it when the lookup failed; the words of both screens are unchanged. About two thirds of the screen under them stays empty at 390×844, as under Jamie's first-run cards.
- **The cap line keeps its words** and gains a "Your shared links" chip, because a line that says where to go needs a door; it adds 48px to the cap footer, so the cap view leaves out the "In the copy" and "Left out" list (nothing there can be acted on); with it the body scrolled (49px and 101px) and a line was cut under the footer on 390×560 and 320×568. On a landscape phone, from 520px wide, the Share view is two columns, and under 600px tall the dated line and the subtitle are dropped.
- **Words:** "saved meal", not "meal", on the page (the glossary: a meal is a slot on a day); the owner's card says "Your shared recipe" (short enough never to wrap); "See it in Pinch" after an add, with a line saying where the copy is; "Keeping leftovers" on the page where the drawer says "Keeping it". The owner's "Open in Pinch" opens Recipes, not the recipe: the drawer's open state is local to `RecipesScreen`, so a deep link isn't cheap.
- **The page reuses the recipe drawer's links** (how-to card and rows) with no video thumbnail and `rel='noopener noreferrer nofollow ugc'`, so it matches the drawer and loads nothing from another site. A description is drawn in full (a clamp's "Show more" is a frameless button), and a token the server answers with a 401 is renewed and the call made once more.
- **Undo is all or none** and refuses when the person changed or used what was added; an ingredient the add made that was changed or used stays. Coming back to a link after adding offers Add again (a second copy), because no record of the add is kept: the id stays out of storage. An archived ingredient of the person's is not matched to a line, and a catalog id wins over a renamed line.
- **The page keeps its answer five minutes** and doesn't refetch on focus, so a stopped link shows until reload (it says it is a snapshot).
- **On the owner's side:** Back from Shared links returns to Settings (or to the screen under it when the cap line's chip opened it) and from the Share view to More; the Share view's footer is its own and holds its one primary, so it is on screen on a short phone (Create link, Copy link with Send, or Update the shared copy); the link is selectable text, not an input; archiving keeps the link up and a hard delete stops it (both confirms say so); "changed since" compares `updatedAt`, so a saved meal's star and a recipe's archive no longer write it, while a recipe form save that only changes collections, source or nutrition still flags falsely, and a renamed ingredient or a recipe deleted from inside a shared meal isn't detected; a stop that finds the link already gone counts as done; "Left out" names favorites and cooking history (Pinch has no ratings) and a web photo only for a recipe that has one; while one action runs all three rows are off; Copy link is the shared `CopyTextButton` (Dreamer UI's `CopyButton` hands its class to a Fragment), which uses the clipboard fallback on plain-HTTP pages and says to select the link when the browser refuses.
- **Technical calls** (the id alphabet, care days 1 to 365, a recipe with unusable servings refused, a meal all or nothing, links kept as the parsed address, the covers copied before the documents, the Functions' default bucket being the app's) are listed in `TECHNICAL.md` open question 29.

### What is left
- Planned meals as a share, and a way to share a whole week.
- A web-search cover: a "keep a copy" step that downloads the picture into Storage through a function (the cost is in open question 28 (c)), so such a recipe could carry its picture.
- A PIN, an expiry and a way to see that a link was opened; none was asked for, and the cap and one-share-per-source races could be closed with a counter document in a transaction.
- A deep link from the owner's button to the recipe's own drawer (`?open=recipe-<id>`), which needs the drawer's open state out of `RecipesScreen`.
- A record of what a visitor added, so a second Add can say so, which needs a place for the id that isn't storage.
- What the last open Success Criteria box lists, and the production check that the invoker grant for the new callables is in place (`functions/README.md`).

## Beyond

### Issue 34: Hands-free voice navigation in cooking mode

**Prerequisites:** Cooking mode (Issue 33)
**Target PR Size:** ~1,200 lines (most of it the grammar's checks)
**Files:**
- `src/hooks/useSpeechCommands.ts` (shared: support check, start and stop, restarts, errors, pausing while it speaks and while the page is hidden), `src/utils/speechUtils.ts` (shared: reading text aloud in a voice for the page's language)
- `utils/cookVoice.ts` (the pure grammar, `parseCookCommand`, and the spoken answers), `utils/cookVoiceMode.ts` (the wake phrase matcher and the listening state machine), `hooks/useCookVoice.ts` (the explainer's answer, Read steps aloud and the way of listening per person, what it heard, the step read aloud, the stop line, the window, waiting and lock timers), `components/cooking/CookVoice.tsx` (the mic, the state chip and line over the buttons, the explainer, the voice sheet)
- `CookingSubview.tsx` (the actions a command can take, the same ones a tap takes), the shared `Subview`'s `headerAction`, `scripts/checks/pinchVoice.ts`, `scripts/checks/pinchWake.ts` and `scripts/checks/speechListener.ts` (`npm run check:pinch-voice`)

**Context:** Cooking mode.

### Description
Say "next", "back", "repeat", "start the timer" or "how much garlic" with floury, wet or busy hands.

### Possible Approach
1. The browser's own speech recognition and speech synthesis (no new service, dependency or Function); where they are missing or the page isn't secure, the feature isn't on screen.
2. Ask on the first tap with what is heard and by whom, then one tap starts it each time; never on its own.
3. A small, exact grammar matched against whole final phrases, so kitchen talk does nothing, and commands that do only what a tap does: never a write, never Finish.

### CRUD & Entry-Point Requirements
- [x] **Read:** cooking mode, the mic at the end of the title row (the steps, the ingredient list and the timer view).

### Success Criteria
- [x] Works hands-free where supported and is invisible where it isn't (no constructor, an insecure page).
- [x] Nothing listens until a tap; the first tap explains first (who hears it, people nearby included, and that a reading voice may send its text); a refused microphone or a speech service turned off is said once, on one line for 8 s, never retried on its own, and a tap on the mic reopens the explainer with the cause; leaving, Finish, "stop listening", the mic, a window that runs out (tap to talk), ten quiet minutes of waiting for "Hey Pinch" and the fifteen-minute lock stop it; a hidden page pauses it and coming back resumes it without reading the step again.
- [x] "Next" on the last step, "finish" and "I'm done" never open the Finish panel; no command writes data; a command word printed on a visible button means that button ("back" on the ingredient list is Back to the steps).
- [x] Only the listed commands count: everyday words ("go on", "again", "cook the chicken") and a one-word command among the recognizer's lower-ranked guesses never act; "how many cups of rice" looks past the unit, and a question with nothing found names the words searched.
- [x] Listening pauses while it reads aloud and starts again after; a run of failed starts stops with a line; the timer's beep and the browser's voice are unlocked in the tap that turns it on; driven with a fake recognizer and speech engine (142 checks, including the timer view: "start the timer" makes the timer the screen, "next" is the footer's Next, or "Back to step 2" from a pill, and over a later step's Time's up it says to dismiss first, pause and resume act on the timer in focus, stop dismisses the Time's up in front (the one that rang first), else pauses then resets, time left tells the timer in front and the next to end, "next" and "dismiss" within 2 s of a Time's up are held back, amounts follow the dish in front), the grammar and the listening machine (restarts, back-off, guards, the idle stop) by `npm run check:pinch-voice`.
- [x] With voice listening, the step's Start, Back, Next, Ingredients, the timer view's Pause, Resume, Reset, Dismiss, Next and "Back to step 2" (and the Meanwhile line on a plate), and the background pills are each the element at their own centre at 320×568, 390×560, 375×667, 390×844, 844×390 and 1280×900, for a single recipe and a plate (84 rows), at scroll 0 or, where the screen already hides it with voice off (a plate's step-2 Start behind the pill row at 320×568, 390×560 and 844×390, the Meanwhile line at 320×568 and 390×560), after scrolling it clear; every state of the voice line (hint, heard, answer, refusal, reading, a stop, the idle pause) keeps the footer at the listening height (113px on a phone, 69px held sideways), and the explainer and "What to say" lead with what matters (two sentences; five commands) and fold the rest under one line each, fitting every size without scrolling while folded and scrolling in the modal's own overlay, buttons pinned, when opened.
- [x] Listening is short and deliberate by default: a tap opens a ten-second command window (restarted by each command, ended by a tap) and nothing stays open; **Say “Hey Pinch”** (remembered per person) keeps the mic on and waiting, says so in the first-use sheet and in the voice sheet, wakes only on the phrase at the start of what was heard (never "add a pinch of salt", "a pinch" or "hey, pinch of salt"), does a command said in the same breath, and turns itself off after ten quiet minutes (not counted while a timer runs or for two minutes after one rings, an hour at most); **Keep listening 15 min** (never remembered) counts down on the chip and the mic to a fixed deadline that commands do not extend; each limit says so for 8 s when it ends; every event from every state of the listening machine, 200 random walks, the matcher's near-misses and recipe sentences are in `npm run check:pinch-voice`, and 78 checks were driven in the browser with a fake recognizer and Playwright's clock (wake, command, stop; a window that times out and one that is extended; a session that ends by itself and restarts quietly; the lock counting down; a refused microphone; no recognizer; leaving while waiting and while locked; a Time's up with voice waiting; Read steps aloud with the phrase; a hidden tab; a plate).
- [ ] Checked on real devices with a real microphone (Chrome on Android and desktop, Safari on iOS and macOS) and in a noisy kitchen, including how a real recognizer writes "Hey Pinch", false and missed wakes, and ten minutes of continuous recognition on a phone's battery.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 35: Look up a product by barcode

**Prerequisites:** Issue 5
**Target PR Size:** ~350 lines
**Files:**
- Scan flow, lookup via `onCall`

**Context:** Product model; Functions rules.

### Description
Scan a barcode to prefill a product's label and size.

### Possible Approach
1. A server-side lookup with a cache and budget guard; the person always reviews price and store.

### CRUD & Entry-Point Requirements
- [ ] **Create:** a product from a scan.

### Success Criteria
- [ ] No key reaches the browser; a failed lookup falls back to the manual form.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 36: Price history for a product over time

**Prerequisites:** Issue 5, Issue 16
**Target PR Size:** ~350 lines
**Files:**
- `priceHistory` entries, product drawer chart

**Context:** Snapshot model.

### Description
See how a product's price has moved.

### Possible Approach
1. Append a history entry when a price changes; a small chart.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read:** history entries.

### Success Criteria
- [ ] History never changes past days' frozen costs.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 37: Daily calorie and protein goals against your plan

**Prerequisites:** Issue 13
**Target PR Size:** ~300 lines
**Files:**
- Goals in View options, progress on the Calendar's summary sheet

**Context:** Nutrition settings.

### Description
Set a goal and see the plan against it, only for metrics that are on.

### Possible Approach
1. Goals on the kitchen document; progress tiles.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** goals.

### Success Criteria
- [ ] Goals never appear for a metric that is off.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 38: Share a recipe with a link (ingredient names only; built as Issue 48, which also shares saved meals and lets a visitor add what they were sent)

**Prerequisites:** Issue 15
**Target PR Size:** ~450 lines
**Files:**
- Public share function, `pages` entry in `cloudflare-worker.js`, `useNoIndex`

**Context:** CLAUDE.md "Security and privacy" (allowlist, unguessable ids, read through a function).

### Description
A link to a recipe that shows ingredient names and steps, never stores or prices.

### Possible Approach
1. `generateToken` id, a Function with an allowlisted shape, owner revoke, preview text generic.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Delete:** share links.

### Success Criteria
- [ ] Denial verified as owner, another user and a signed-out visitor.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

### Issue 39: Share a meal plan with someone you cook with

**Prerequisites:** Issue 9
**Target PR Size:** ~600 lines
**Files:**
- Shared-kitchen data decision (see open question 7)

**Context:** TDD open question 7.

### Description
Share a plan with a person you cook with.

### Possible Approach
1. Decide between a one-time copy and a live shared kitchen before building; the `kitchens` root is the extension point.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** per the chosen model.

### Success Criteria
- [ ] Whatever is shared is allowlisted and revocable.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.
