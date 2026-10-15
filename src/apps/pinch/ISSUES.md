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
- [ ] **Create:** + New in the Recipes header opens the Recipe subview.
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
- `src/apps/pinch/store/slices/settingsSlice.ts`, `actions/settingsActions.ts` (`dismissNudge`), `listeners/kitchenListeners.ts`
- `src/apps/pinch/utils/gaps.ts` (dismissals)
- `firestore.rules` (the `kitchens/{uid}` document: settings shape validation)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Logic §4 (gaps and nudges), `KitchenSettings`, and the rules; `UX.md`'s Nudge and fill-in screen and its wording table; the README's "Filling In As You Go".

### Description
Where a gap changes a number, one quiet line says so and offers to fix it: "2 ingredients need a price · Add prices". Tapping it opens a short sheet that walks through just those ingredients. Closing the line keeps it away for that ingredient. Missing details appear only as these in-context lines. Superseded in the Pinch audit: the close is "Not now", which quiets the line until the page reloads; the stored dismissal is still read but no longer written.

### Possible Approach
1. `KitchenSettings` type, slice and listener; the kitchen document is created lazily by the first `dismissNudge` or `saveSettings` (a field-scoped dotted-path write). Rules for the document: `showNutrition` shape, `dismissedNudges` ≤ 500 keys.
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
5. `PlannedMealView` swaps in place inside the drawer with "‹ Back" and shows items, servings and cost; "Remove from this day" is last, red, with a confirm. Calendar empty state offers "Plan your first meal" and "Add a recipe".
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
2. `MealBuilder`: day and type pills with "Change", the item search (recipes, ingredients, and later saved meals) with kind labels, per-row steppers and remove controls, a cost line with the `GapNudge`, footer `Cancel` / `Add to Tuesday` (or `Save` when editing).
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
- `src/apps/pinch/components/calendar/PlannedMealView.tsx` (Save as a meal, swaps in place)
- `src/apps/pinch/store/slices/mealsSlice.ts`, `actions/mealActions.ts`, `listeners/kitchenListeners.ts`
- `firestore.rules` (`meals`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s `Meal`, copy-on-plan and edit-semantics table; `UX.md`'s Recipes tab (Meals), Plan a meal (`PickOrCreate`) and Planned meal.

### Description
A person saves the meals they eat again (adobo chicken with cilantro lime rice and beans) and plans them in a tap. Planning a saved meal copies its items onto that day; the day can then be tweaked without touching the saved meal, and editing the saved meal later leaves days already planned alone. A tweaked day can be saved as a new meal.

### Possible Approach
1. `Meal` slice and listener; `saveMeal` / `removeMeal`; `planMeal` accepts `sourceMealId` and `name` and copies items with new row ids.
2. Meals pill in Recipes: `MealRow`s, `MealDrawer` (items, servings, total cost with nudge, "Plan it" primary that closes the drawer and opens Plan a meal on a chosen day, Modify / Copy / Delete in the muted block); `MealSubview` is the same builder without a day.
3. In `MealBuilder`, recent recipes and saved meals as a captioned pill row while the plate is empty (nothing preselected) and saved meals in the one search. "Save as a meal" lives on a planned meal, which swaps the drawer in place to a name field and Save (`savePlannedAsMeal`).
4. Rules for `meals` (≤ 30 items, shape); seed a few meals and a planned meal copied from one.

### CRUD & Entry-Point Requirements
- [ ] **Create:** Save as a meal (from a planned meal) and + New in the Meals pill. **Read:** the Meals list and drawer. **Update:** Modify. **Delete:** the subview's trash icon with a destructive confirm (a meal is always deletable: nothing reads `sourceMealId` for display).

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

**Context:** Read `TECHNICAL.md`'s Derived values (month stats, average per meal) and open question 6; `UX.md`'s Calendar (stats row) and Breakdown; A-List's `CounterRow` and `StatTile` use.

### Description
Above the month, a stats row shows what the month cost and the average cost per meal. Tapping it opens a breakdown by day or by meal type. When items are left out, the row says so and offers the fill-in sheet. Superseded in the Pinch audit (tranche 1): one summary line and a summary sheet replace the stats row and breakdown.

### Possible Approach
1. `selectMonthStats(monthKey)` in one pass over the window's planned meals: `{ spendCents, mealsPriced, avgPerMealCents, leftOut }`; the average divides by planned meals that have at least one priced item.
2. `StatsRow` (two `StatTile`s, a `HelpTip` explaining the average, a "leaves out N items · Add prices" `GapNudge` that opens the fill-in sheet for the month's gaps). `BreakdownDrawer`: thin By day / By meal pills and one scrolling list under a fixed header.
3. Check the row at 320px with five-figure amounts and with the nudge present (no height jump when it first appears).

### CRUD & Entry-Point Requirements
- [ ] No entity.
- [ ] **Read:** the stats row on the Calendar; the breakdown drawer from tapping it.

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
- `src/apps/pinch/components/shared/ListViewControls.tsx` ("Nutrition, everywhere" in View options), `CalendarScreen.tsx` (the eye)
- `src/apps/pinch/components/shared/NutritionLine.tsx`
- `src/apps/pinch/utils/recipeMath.ts` (nutrition), `mealMath.ts`, `stats.ts`
- `src/apps/pinch/components/recipes/RecipeForm.tsx` ("+ My own nutrition" chip), `RecipeDrawer.tsx`, `MealDrawer.tsx`, `PlannedMealView.tsx`
- `src/apps/pinch/store/actions/settingsActions.ts` (`saveSettings`)
- `scripts/seeds/pinch.ts`

**Context:** Read `TECHNICAL.md`'s Logic §2 (nutrition) and `KitchenSettings`; `UX.md`'s View options, Calendar (summary line) and Recipe form; the README's "Cost and Nutrition".

### Description
Nutrition is always stored and shown only when switched on. View options has four `AppToggle`s under "Nutrition, everywhere" (calories, protein, carbs, fat), all off to start. A recipe's nutrition adds up from its ingredients, and the person can type their own over it. With a metric on, it shows per serving on recipes and meals and as a daily average on the calendar's stats row; with protein on, the row adds average price per gram of protein.

### Possible Approach
1. `saveSettings({ showNutrition })` with dotted-path writes; View options (`ListViewControls`) carries a "Nutrition, everywhere" section and an "About the numbers" row for licences and attributions, reached from the eye on the Calendar, Recipes, Meals and Kitchen.
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

### Issue 19: Track what you have: stock, with "not tracked" kept separate from "out"

**Prerequisites:** MVP complete
**Target PR Size:** ~450 lines
**Files:**
- `stock` collection types, slice, listener, actions, rules, seed
- Kitchen: a Stock entry row and the ingredient drawer's "On hand" section
- `utils/markdown/ingredientsMarkdown.ts` (adds amounts and low stock)

**Context:** TDD Logic §7 (reserved stock design); README Next Steps.

### Description
A person can say how much of an ingredient they have. An ingredient they haven't counted is "not tracked", which is different from "out". The ingredient copy carries what's on hand and what's running low.

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

### Issue 20: Mark a meal as made: stock comes out (batches became prepared containers, Issue 41)

**Prerequisites:** Issue 19
**Target PR Size:** ~500 lines
**Files:**
- `plannedMeals.madeAt`, prepared-servings collection, actions, Kitchen entry
- Planned meal view: "Mark as made" and "Made a batch"

**Context:** TDD Logic §7; the agreed rule: stock deducts on "mark as made", and prepared servings are consumed separately so nothing deducts twice.

### Description
Marking a meal made takes its ingredients out of stock. Prepared servings are already built, as containers (Issue 41), and eating from one never touches ingredient stock; this issue is the ingredient side that is left.

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

**Prerequisites:** Issue 19, Issue 9. The list itself has shipped as the Shopping tab: a stored `shoppingItems` collection, filled from a recipe, saved meal or a day or range of planned days (or one ingredient), merged by ingredient and unit, each line remembering what put it there, in shop sections, with To buy / Got it / All and an approximate cost (TECHNICAL.md §5b).
**Target PR Size:** ~350 lines
**Files:**
- Shopping tab: `ShoppingScreen` (`components/shopping/`), `utils/shopping.ts`, a low-stock section and a group-by-store option

**Context:** README Next Steps; UX Shopping list.

### Description
Subtract tracked stock from what the list asks for, add a section for low-stock ingredients, and offer grouping by the default product's store with totals from the person's own products.

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

### Issue 26: Tag and filter recipes

**Prerequisites:** Issue 6
**Target PR Size:** ~300 lines
**Files:**
- `tags` on recipes, filter pills in Recipes

**Context:** UX Recipes tab.

### Description
Tags such as mains, sides, sauces and desserts, with filter pills above the list.

### Possible Approach
1. Add `tags: string[]` (backfilled), `PickOrCreate` for tags, thin filter pills.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** tags on a recipe and the filter.

### Success Criteria
- [ ] Legacy recipes without tags read and edit.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 in light and dark, and any new form or drawer was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

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
- `CookingSubview` (an overlay `Subview`) with `CookStepView`, `CookIngredientsView` and `CookTimerStrip`, the `useCookTimers` hook, and a general `useWakeLock` hook

**Context:** UX Recipe details.

### Description
A big-type, one-step-at-a-time view that keeps the screen awake. As built, each step lists the ingredients it names with their amounts in kitchen measures, an Ingredients view (beside the steps from `lg`) scales and ticks them, cooking opens at the recipe's own servings, a step's times become timers named for their step, leaving while a timer is going asks first, the recipe's latest note shows above the steps, a planned dinner of several recipes opens as one session (recipe pills, one timer strip, up to four timers for all of them), and Finish records the cook, one per recipe, in one panel with one Undo, put-away and a note.

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

**Context:** Read `TECHNICAL.md` §5f and open question 20; `UX.md`'s Recipe, Recipe details and Cooking mode; CLAUDE.md's "A phone form shows a few inputs at a time" and "Text that leaves the app is safe to paste" (Pinch has no copy-out, so it only matters if one returns).

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
- The seeds: ten containers in every state for Alex, about 300 in stock and 260 finished for the scale kitchen

**Context:** Read `TECHNICAL.md` decision 23, §5g, criterion 13 and open question 22; `UX.md`'s Fridge & freezer; CLAUDE.md's "Pick the atomic write that fits", "Know which of the two kinds of time value a field is" and the Firestore rules section on indexes and the evaluator.

### Description
Meal prep kept in the fridge or freezer is a list of containers: what each is, how many servings are in it, where it is, when to eat it by, and what has happened to it. Kitchen has a "Fridge & freezer" door (a tile) and list (the audit renamed "Prepared meals" and "container" in the app to "Fridge & freezer" and "box"; the code keeps `Container`); a recipe's and saved meal's rows and drawers say what is in stock; cooking mode asks "Putting any away?" after a bulk meal; a plan can eat from a container; the shopping sheet says what is already put away. A put-away can be several containers (portions in separate boxes thaw one at a time), a saved meal's stock includes its recipes', and a thaw or move never hides that a container is past its date.

### Possible Approach
1. One document per container (`servings`, `status`, `place`, `eatBy` as a date-only value, `history` of at most ten events), never split; finishing keeps the document, deleting erases it. A put-away writes one to twenty containers in one batch, each with its own history.
2. Every change that depends on the stored state is a `runTransaction` over a pure plan, so another device's change is never written over.
3. Keep the rules' history check lean: the evaluator's 1,000-expression limit allows about ten events checked by index.
4. One listener for what is in stock; Finished is read on demand through TanStack Query with its composite index.

### CRUD & Entry-Point Requirements
- [ ] **Create / Read / Update / Delete:** put some away (as one container or several), see what is in stock and finished, eat some or all, correct the count, move between fridge and freezer, change the eat-by date, throw it out, delete it.
- [ ] **Entry points:** Kitchen's row, a recipe's and a saved meal's drawer, cooking mode's last screen, the Fridge & freezer list's "Add", a planned meal's "Eat from your fridge or freezer".

### Success Criteria
- [ ] Eat soon and past its date read right in the viewer's own time zone, west and east of UTC (`npm run check:pinch-math` under `America/Los_Angeles` and `Pacific/Auckland`), and an eat-by is never shown in local time.
- [ ] The rules accept a valid container for the owner and refuse a bad shape, eleven events, servings 0, a non-midnight eat-by and a changed immutable field, for everyone else too; the cases are listed in the PR as owner, another user and signed out, against the previous rules as the control.
- [ ] A failed or denied containers listener degrades only its own UI; checked by loading the previous rules into the emulator.
- [ ] Two quick taps eat one portion and save one container, and Enter then Enter on a list row eats nothing; Escape and the back gesture close one thing at a time; leaving the put-away details after a change asks first, and a save that isn't confirmed yet never holds the screen.
- [ ] A thaw or move of a container already past its date keeps that date and says so; a recipe whose only use is food in the fridge or freezer is archived, not erased.
- [ ] Driven on the scale kitchen at 4× CPU: tab switches, the stock list with about 300 containers, a recipe drawer and the Recipes list with stock lines, against the base build.
- [ ] `SITE_VERSION` bumped (minor); `npx tsc -b --force` and `npx eslint .` pass; the feature was driven in a real browser at 390×844 and 320×568 in light and dark and at 1280, and every sheet was measured against the container rules.
- [ ] The README Build Plan line(s) this issue delivers are checked off; `UX.md` and `TECHNICAL.md` still match what shipped; the Pinch rules files are updated if the app's design vocabulary changed.

## Beyond

### Issue 34: Hands-free voice navigation in cooking mode

**Prerequisites:** Cooking mode (Issue 33)
**Target PR Size:** ~400 lines
**Files:**
- Speech commands hook

**Context:** Cooking mode.

### Description
Say "next" and "back" with messy hands.

### Possible Approach
1. Web Speech API with an on-device fallback if available; clear on/off control.

### CRUD & Entry-Point Requirements
- [ ] **Read:** cooking mode.

### Success Criteria
- [ ] Works hands-free where supported and is invisible where it isn't.
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

### Issue 38: Share a recipe with a link (ingredient names only)

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
