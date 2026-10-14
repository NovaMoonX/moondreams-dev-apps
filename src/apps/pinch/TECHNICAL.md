# Pinch — Technical Design Document

Built against this app's `README.md` and `UX.md`, and against the conventions in `.github/copilot-instructions.md` and `CLAUDE.md`. A-List's `TECHNICAL.md` is the format reference. Like A-List, **every byte of Pinch data is private to one signed-in person**, so there is no invite flow, no roles and no cross-user concurrency. The design weight sits on four things instead: a static ingredient catalog merged with the person's own records, the quantity and cost math, the calendar read model, and an AI reader that fills recipe forms from text, a file or a web page.

## Decisions made in this document

These shape everything below. Each is also listed under [Open questions](#open-questions-for-the-roadmap) where it needs the owner's confirmation.

1. **The catalog is a bundled constant, not a Firestore collection.** About 200 everyday ingredients, their families, nutrition per 100 g, serving sizes and unit conversions ship in the app's own lazy chunk. A person's data refers to them by id (`cat-chicken-breast`). Nothing is copied into a person's account until they change or attach something to a catalog ingredient.
2. **A person's `ingredients` documents are records of what they did, not a copy of the catalog.** A document exists for a custom ingredient, or for a catalog ingredient the person adjusted (nutrition, serving) or attached a product to (the default-product pointer). The client merges catalog and record into one resolved `Ingredient` at read time.
3. **Three layers, one level of grouping.** `family → ingredient → product`. Families don't nest. Recipes and meals refer to an ingredient id only; products carry store, price and size.
4. **Money is integer cents.** Quantities are numbers in a typed unit. Nutrition is stored per 100 g on ingredients and as optional per-serving overrides on recipes. The ingredient form takes it on the label's basis (per an amount of g, oz or servings) and converts before the write, so per 100 g stays the only stored shape; per serving is a display.
5. **Planned meals are copies.** Planning a meal copies its items into a `plannedMeals` document that keeps `sourceMealId`. Editing a saved meal never touches planned days. Items point at recipes and ingredients by id, so a recipe edit reaches every upcoming day.
6. **Past days are frozen once.** A planned meal whose day has passed gets a write-once `snapshot` of its cost and nutrition. Edits to prices, recipes or nutrition first freeze any unfrozen past meals, so history doesn't drift.
7. **Anything in use is archived, never removed.** A recipe, custom ingredient or store that anything still points at gets `isArchived: true`. Whether a recipe or ingredient is used on a planned day is answered by one `array-contains` read on `plannedMeals.refIds`, so planned days outside the loaded month window are covered. Products are deleted outright (their ingredient's default pointer is re-pointed or cleared in the same transaction), a saved meal is always deletable, a catalog ingredient is only ever reset to its built-in values, and the MVP has no way to delete a family.
8. **Cost and nutrition are computed, never stored**, except the frozen snapshot of a past meal. Every derived number returns what it left out, so the UI can say so.
9. **Cost exists only for comparable amounts.** A recipe amount and a product size must share a dimension (mass, volume, count) or be bridged by a conversion the catalog or the person has supplied. Anything else is left out of totals and surfaced as a gap.
10. **Gaps are derived, not stored.** A "nudge" is a pure function of the data (a missing price, size, nutrition value or conversion on an ingredient that something uses). Only the person's dismissals are stored.
11. **Dates are date-only.** A planned meal's `date` is UTC midnight of the day picked (`fromDateInputValue`), shown with `formatDateUTC`, and keyed on the calendar by `toDateInputValue`. Weeks run Sunday to Saturday, in the month grid and the week view alike (open question 4).
12. **One shared Cloud Function, no Pinch-specific ones.** The AI reader is the repo's shared client-side Firebase AI setup and store logos use a publishable browser token, so nothing needs a server secret. Reading a recipe from a link needs a server to fetch the page, so it calls the shared, app-neutral `fetchPageContent` callable (`functions/src/linkMetadata/fetchPageContent.ts`, listed in `functions/README.md`), which returns only the kinds of content the caller asks for; nothing under `functions/` is Pinch's own.
13. **Per-person data nests under `apps/pinch/kitchens/{uid}/…`.** A `kitchens` root (not `users/{uid}`) leaves room for a future shared kitchen to be a read grant on this document, not a data move.
14. **How a list looks is a per-device choice, not data.** Each list's View options (show prices, show calories and macros, the nutrition basis of ingredient rows) live in the browser's `localStorage` per person and list, so no field, rule or listener is involved and nothing syncs between devices. Prices start on and calories and macros start off (`DEFAULT_LIST_VIEW_OPTIONS`); a stored choice always wins over the default, and a stored object missing a key reads that key's default. Hiding a line only skips drawing it; no total reads these options.
15. **Where a recipe came from is its own small collection, named by `sourceId`.** A `Source` is just an id and a label the person typed ("Serious Eats", "Mom's recipe cards"); a recipe points at one with `sourceId`, which is not `Recipe.source` (that field says how the draft was made: by hand, or read from text, a file or a link). Deleting a source clears the pointer on the recipes that name it and leaves the recipes alone; a recipe that names a source that is gone, or has no `sourceId` key at all, simply reads as having none.
16. **The shopping list is one document per ingredient and unit, merged on add.** A `shoppingItems` document is `{ ingredientId, amount, unit, isChecked }` with the id `{ingredientId}__{unit}`, so adding the same thing again lands on the same document and the list never holds two lines for it. Units are never converted (a cup and a tablespoon of one ingredient are two lines). Lines come from a pure function over recipes, meals, planned meals and days (`utils/shopping.ts`), and nothing is derived from the calendar afterwards: the list is plain data the person edits, and changing a meal later leaves it as it was.

17. **A recipe idea is its own small collection, and becoming a recipe is a link, not a move.** An `Idea` is `{ kind, title, note, url, siteName, imageUrl, photoPath, recipeId, … }`: a link, a photo or a few words. It points at the recipe it became with `recipeId`, set by its own write right after the recipe has committed (a failure there is logged and never loses the recipe); nothing is copied back, and deleting the recipe leaves a dangling `recipeId` that every reader treats as "not made yet". A link idea keeps only what a page gives away in its `meta` (title, site name, picture address), fetched through the shared `fetchPageContent` and never read by the AI model.

---

## Data Schema

Namespace root: `apps/pinch/`

**Per-person private tree.** Everything lives under the person's own kitchen, keyed by their `uid`:

```
apps/pinch/kitchens/{uid}                         → KitchenSettings
apps/pinch/kitchens/{uid}/ingredients/{id}        → IngredientRecord
apps/pinch/kitchens/{uid}/families/{id}           → Family
apps/pinch/kitchens/{uid}/stores/{id}             → Store
apps/pinch/kitchens/{uid}/products/{id}           → Product
apps/pinch/kitchens/{uid}/recipes/{id}            → Recipe
apps/pinch/kitchens/{uid}/sources/{id}            → Source
apps/pinch/kitchens/{uid}/shoppingItems/{id}      → ShoppingItem
apps/pinch/kitchens/{uid}/ideas/{id}              → Idea
apps/pinch/kitchens/{uid}/meals/{id}              → Meal
apps/pinch/kitchens/{uid}/plannedMeals/{id}       → PlannedMeal

Storage:
apps/pinch/kitchens/{uid}/recipes/{recipeId}/cover.webp
apps/pinch/kitchens/{uid}/stores/{storeId}/logo.webp
apps/pinch/kitchens/{uid}/ideas/{ideaId}/photo.webp
```

Why nested under the `uid`: every rule is the same one-line path check, every listener is a plain collection listener, and a mis-scoped query can't leak across people. Products are a top-level collection, not nested under an ingredient, so the Products subview and the cost math read them with one listener.

**Every field is a required key typed `T | null`, never optional.** Absent values are written as explicit `null`; arrays default to `[]`. Timestamps are millisecond numbers. Ids come from `generateUuid` (`@/utils`); catalog ids are the fixed strings `cat-…` and are never generated.

**Enums and constants** (fixed lists only the developer extends; option arrays are derived from `constants.ts` at render time, never redeclared):

```typescript
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'DESSERT' | 'DRINK';
export type ItemKind = 'RECIPE' | 'INGREDIENT';
export type Unit =
  | 'G' | 'KG' | 'OZ' | 'LB'                        // mass
  | 'ML' | 'L' | 'TSP' | 'TBSP' | 'CUP' | 'FL_OZ' | 'PINCH' // volume
  | 'EACH';                                          // count
export type Dimension = 'MASS' | 'VOLUME' | 'COUNT';
export type NutritionMetric = 'calories' | 'protein' | 'carbs' | 'fat';
export type RecipeSource = 'MANUAL' | 'AI_TEXT' | 'AI_FILE' | 'AI_LINK';   // how a recipe draft was made; where it came from is a `Source`, named by `Recipe.sourceId`
export type RecipeStartMethod = 'text' | 'file' | 'link' | 'manual';   // UI only: how a new recipe begins, never stored
export type IdeaKind = 'LINK' | 'PHOTO' | 'TEXT';
export type IdeaStartMethod = 'link' | 'photo' | 'text';              // UI only: how a new idea begins, never stored
export type GapKind = 'NO_PRODUCT' | 'NOT_COMPARABLE' | 'NO_NUTRITION';
```

```typescript
// constants.ts (runtime values live here, never in types.ts)
export const MEAL_TYPE_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'DRINK'];
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack', DESSERT: 'Dessert', DRINK: 'Drink',
};
export const MEAL_TYPE_EMOJIS: Record<MealType, string> = {
  BREAKFAST: '🍳', LUNCH: '🥪', DINNER: '🍝', SNACK: '🍿', DESSERT: '🍰', DRINK: '🥤',
};
export const UNIT_DIMENSION: Record<Unit, Dimension> = {
  G: 'MASS', KG: 'MASS', OZ: 'MASS', LB: 'MASS',
  ML: 'VOLUME', L: 'VOLUME', TSP: 'VOLUME', TBSP: 'VOLUME', CUP: 'VOLUME', FL_OZ: 'VOLUME', PINCH: 'VOLUME',
  EACH: 'COUNT',
};
export const UNIT_TO_BASE: Record<Unit, number> = {   // grams for MASS, millilitres for VOLUME, 1 for COUNT
  G: 1, KG: 1000, OZ: 28.3495, LB: 453.592,
  ML: 1, L: 1000, TSP: 4.92892, TBSP: 14.7868, CUP: 236.588, FL_OZ: 29.5735, PINCH: 0.308,
  EACH: 1,
};
export const UNIT_LABELS: Record<Unit, string> = { /* 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'pinch', 'each' */ };
export const NUTRITION_METRICS: NutritionMetric[] = ['calories', 'protein', 'carbs', 'fat'];
export const CALENDAR_VIEWS = ['month', 'week', 'day'] as const;
export const MAX_RECIPE_INGREDIENTS = 60;
export const MAX_RECIPE_STEPS = 60;
export const MAX_MEAL_ITEMS = 10;                // the most items a rule can check by index (a 12-item check exceeds the rules evaluator's limit)
export const MAX_PASTE_CHARS = 20_000;            // text the AI reader accepts
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // photo, screenshot or PDF
export const LIST_SEARCH_THRESHOLD = 8;           // a list gets a search from this many rows
export const MAX_NUTRITION_VALUE = 100_000;       // per 100 g, the cap the rules enforce
export const NUTRITION_ENTRY_UNITS = [...];       // what a typed label is "per": g, oz, serving
export const NUTRITION_BASIS_OPTIONS = [...];     // what a shown number is per: SERVING, PER_100G
export const RECIPE_START_METHODS = [...];        // text, file, link, manual: id, emoji, title, description (the one list the drawer, the page and each reader's title read)
export const MAX_DISMISSED_NUDGES = 500;
export const MAX_SOURCE_LABEL_LENGTH = 80;       // a source's label, the cap the rules enforce
export const SOURCE_BATCH_SIZE = 400;             // writes per batch when removing a source reaches many recipes
export const SOURCE_FILTER_ANY = 'any';           // the Recipes filter's two answers that aren't a source id
export const SOURCE_FILTER_NONE = 'none';
export const MONTH_WINDOW_PADDING = 2;            // months loaded on each side of the window's centre
export const MAX_SHOPPING_LINES_PER_ADD = 200;    // distinct lines one add takes: the action and the UI, not a rule
export const SOFT_MAX_SHOPPING_ITEMS = 300;       // items before adding asks to clear what is checked off: the UI, not a rule
export const SHOPPING_GROUP_PAGE_SIZE = 100;      // rows a shopping group draws before "Show N more"
export const SHOPPING_BATCH_SIZE = 250;           // items per transaction when clearing what is checked off (a read and a delete each, under 500)
export const MAX_IDEA_TITLE_LENGTH = 120;         // an idea's title, note, link and site name: the caps the rules enforce
export const MAX_IDEA_NOTE_LENGTH = 1000;
export const MAX_IDEA_URL_LENGTH = 2000;
export const MAX_IDEA_SITE_NAME_LENGTH = 120;
export const SOFT_MAX_IDEAS = 200;                // ideas before adding asks to delete one: the action and the screens, not a rule
export const IDEA_LOOKUP_TIMEOUT_MS = 6000;       // how long a link's page may take to look up
export const IDEA_PHOTO_MAX_DIMENSION = 1280;     // the longest edge of an idea's photo
export const IDEA_KIND_EMOJIS = { LINK: '🔗', PHOTO: '📷', TEXT: '📝' };
export const IDEA_START_METHODS = [...];          // link, photo, text: id, emoji, title, description (the one list the picker reads)
export const MAX_SHOPPING_AMOUNT = 1_000_000;     // an item's amount, the cap the rules enforce
```

### 1. `KitchenSettings` — `apps/pinch/kitchens/{uid}`

```typescript
interface NutritionSwitches { calories: boolean; protein: boolean; carbs: boolean; fat: boolean }

interface KitchenSettings {
  uid: string;                                  // immutable
  showNutrition: NutritionSwitches;             // all false until switched on
  dismissedNudges: Record<string, number>;      // "NO_PRODUCT:cat-soy-sauce" → dismissedAt (ms)
  createdAt: number;                            // immutable
  updatedAt: number;
}
```

The document is created the first time the person changes a setting or dismisses a nudge; until then the client uses defaults (`isLoaded` with `settings === null` means defaults). There is no setup step. `dismissedNudges` is capped at `MAX_DISMISSED_NUDGES` keys.

### 2. `IngredientRecord` — `…/ingredients/{id}`

```typescript
interface NutritionValues { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }

interface IngredientRecord {
  id: string;                                   // a generated id (custom) or the catalog id (an adjusted catalog ingredient)
  catalogId: string | null;                     // immutable; null for a custom ingredient
  name: string | null;                          // required for custom; null means "use the catalog name"
  familyId: string | null;                      // a catalog family id (cat-fam-…) or a Family id; null = its own family
  iconKey: string | null;                       // @deprecated: icons were removed; old documents may carry one, new writes null
  nutritionPer100g: NutritionValues | null;     // null = the catalog's values (or none, for custom); always per 100 g, whatever basis the form was typed in
  servingAmount: number | null;                 // what "1 serving" of this ingredient is (null = catalog / 100 g)
  servingUnit: Unit | null;
  gramsPerMl: number | null;                    // density, bridges mass <-> volume (user-supplied; editing UI is Next Steps)
  gramsEach: number | null;                     // weight of one, bridges mass <-> count (same)
  defaultProductId: string | null;
  isArchived: boolean;                          // custom ingredients only; a document written before archiving lacks the key (reads as false, backfilled on edit)
  createdAt: number;                            // immutable
  updatedAt: number;
}
```

For a catalog ingredient the document id *is* the catalog id, so there is exactly one record per catalog ingredient and "upsert" is a plain `setDoc` with merge-free full shape on first write. For a custom ingredient the id is `generateUuid()`.

**Resolved ingredient (client-only, never stored).** `resolveIngredient(id)` = catalog entry (if `cat-`) overlaid by the record: `name`, `familyId`, `nutritionPer100g`, serving and conversions each fall back to the catalog when the record's field is `null`. An id with neither a catalog entry nor a record resolves to a placeholder `"Removed ingredient"` so a dangling reference can never crash a screen.

### 3. `Family` — `…/families/{id}`

```typescript
interface Family { id: string; name: string; createdAt: number; updatedAt: number }
```

Only the person's own families live here. Catalog families (`cat-fam-chicken`) are constants. A family is a grouping label with no data of its own and no parent.

### 4. `Store` — `…/stores/{id}`

```typescript
interface Store {
  id: string;
  name: string;
  catalogStoreId: string | null;               // set when picked from the well-known list; immutable
  imagePath: string | null;                    // Storage path of the person's own image
  isArchived: boolean;                         // hidden once products point at it; adding the same catalog store back un-archives it; legacy documents lack the key
  createdAt: number;
  updatedAt: number;
}
```

A well-known store becomes a `Store` document the first time a product uses it, so every product points at a store the person owns. Its logo is derived from the catalog entry's domain; a person's own store shows `imagePath` (its download URL is a TanStack query keyed by path and `updatedAt`, `storageImageQueryOptions`; `useStoragePhoto` only uploads and deletes), else a letter tile.

### 5. `Product` — `…/products/{id}`

```typescript
interface Product {
  id: string;
  ingredientId: string;                        // immutable
  storeId: string;
  label: string | null;                        // "Great Value"
  priceCents: number;
  sizeAmount: number;                          // > 0
  sizeUnit: Unit;
  url: string | null;                          // https only
  createdAt: number;
  updatedAt: number;
}
```

The default product is the ingredient's `defaultProductId`, not a flag on the product, so changing the default is one field write on one document. The first product added to an ingredient becomes its default in the same batch.

### 6. `Recipe` — `…/recipes/{id}`

```typescript
interface RecipeIngredient {
  id: string;                                  // row id, so reorder/edit keys are stable
  ingredientId: string;
  amount: number;                              // > 0
  unit: Unit;
  note: string | null;                         // "diced"
}

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  servings: number;                            // > 0, halves allowed
  prepMinutes: number | null;
  cookMinutes: number | null;
  coverPath: string | null;
  ingredients: RecipeIngredient[];             // 1 … MAX_RECIPE_INGREDIENTS
  steps: string[];                             // 0 … MAX_RECIPE_STEPS
  nutritionOverride: NutritionValues | null;   // per serving; a null metric falls back to the derived value
  source: RecipeSource;                        // how the draft was made, never where it came from
  sourceId: string | null;                     // a Source id; a missing key (recipes written before sources) or an id no source has reads as none
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 6a. `Source` — `…/sources/{id}`

```typescript
interface Source {
  id: string;                                  // generateUuid
  label: string;                               // trimmed, 1 … 80 characters, unique ignoring case
  createdAt: number;
  updatedAt: number;
}
```

Nothing else: a source has no image, URL, notes or archive state. `Recipe.source` and `Recipe.sourceId` are two different things on purpose: `source` is the existing `'MANUAL' | 'AI_TEXT' | 'AI_FILE' | 'AI_LINK'` (how a draft was made, set once and kept on edits), and `sourceId` is the person's own answer to "where did you get it from?". Every reader goes through `getRecipeSource(recipe, sourcesById)` (`utils/sources.ts`), which treats a missing key, `null` and an id with no matching source alike as "no source", so a recipe written before this field, one whose source was deleted on another device, and one created while the delete ran are all read the same way. Uniqueness of the label is checked against the loaded list only (in `createSource`, `renameSource` and the form sheet's live note), so two devices adding the same label at the same moment can leave two sources with one label; nothing breaks, and the person can rename or delete one.

### 6b. `ShoppingItem` — `…/shoppingItems/{id}`

```typescript
interface ShoppingItem {
  id: string;                                  // `${ingredientId}__${unit}`; immutable
  ingredientId: string;                        // a catalog id or a custom ingredient's id; immutable; 1 … 80 characters
  amount: number;                              // > 0, at most 1,000,000, two decimals
  unit: Unit;                                  // immutable: a different unit is a different item
  isChecked: boolean;                          // got it: shown under "Got it" until cleared
  createdAt: number;
  updatedAt: number;
}
```

The id carries the identity, so no query is needed to find "the line for chicken thigh in pounds": a transaction reads that one document. A unit's name never holds `__` (`FL_OZ` has one underscore), so the last `__` always splits the id. The list stores no name, family or price: those are read through the ingredient at render time, so renaming an ingredient or moving it to another family reaches the list, and an ingredient that is gone reads as "Removed ingredient" in the "Other" group. Items are plain documents with no archive state; the person deletes them.

### 6c. `Idea` — `…/ideas/{id}`

```typescript
interface Idea {
  id: string;                                  // generateUuid; immutable
  kind: IdeaKind;                              // 'LINK' | 'PHOTO' | 'TEXT'
  title: string;                               // trimmed, 1 … 120 characters
  note: string | null;                         // 1 … 1,000 characters, or null
  url: string | null;                          // http(s), at most 2,000 characters; a LINK idea's page
  siteName: string | null;                     // the page's own name (og:site_name), else the link's host; at most 120 characters
  imageUrl: string | null;                     // https only, at most 2,000 characters; the page's picture, a third party's address
  photoPath: string | null;                    // Storage path of a PHOTO idea's picture: apps/pinch/kitchens/{uid}/ideas/{id}/photo.webp
  recipeId: string | null;                     // the recipe it became; a missing key, an id no recipe has, or an archived recipe reads as not made
  createdAt: number;                           // immutable
  updatedAt: number;
}
```

`kind` decides which of `url`, `siteName`, `imageUrl` and `photoPath` carry a value (a LINK has the first three, a PHOTO the last, a TEXT none), but the rules don't check that pairing: the client writes it and every reader tolerates any mix. The collection is new, so the rules require all eleven keys (no older shape exists) and `kind` can't change after the idea is created. Readers still default a key with `?? null`, and `updateIdea` and the recipe link write back any key a document lacks (`getMissingIdeaFields`), which only matters for a document written outside the app. The list's "made" test is `selectIdeaGroups`: `recipeId` is set and a listed (non-archived) recipe has that id, so a deleted recipe, an archived one and an id that never existed all read as "still to try".

### 7. `Meal` (saved) — `…/meals/{id}`

```typescript
interface MealItem {
  id: string;                                  // row id
  kind: ItemKind;
  refId: string;                               // a recipe id or an ingredient id
  servings: number;                            // > 0, halves allowed
}

interface Meal {
  id: string;
  name: string;
  items: MealItem[];                           // 1 … MAX_MEAL_ITEMS (no isArchived: a saved meal is always deletable)
  createdAt: number;
  updatedAt: number;
}
```

### 8. `PlannedMeal` — `…/plannedMeals/{id}`

```typescript
interface PlannedSnapshot {
  frozenAt: number;
  costCents: number | null;                    // null when nothing could be priced
  leftOut: { kind: GapKind; ingredientId: string }[];  // the ingredients the cost left out, so a day or month can still name (and de-duplicate) them
  nutrition: NutritionValues;                  // totals; a null metric = unknown
  lines: { itemId: string; costCents: number | null }[];
}

interface PlannedMeal {
  id: string;
  date: number;                                // UTC midnight of the planned day (date-only)
  mealType: MealType;
  name: string | null;                         // the saved meal's name when it came from one
  sourceMealId: string | null;                 // set when copied from a saved meal; never read for display
  items: MealItem[];                           // this day's own copy
  refIds: string[];                            // every recipe and ingredient id in items, for the "in use" query
  snapshot: PlannedSnapshot | null;            // write-once, set after the day has passed
  createdAt: number;
  updatedAt: number;
}
```

`refIds` is derived from `items` on every write (`Array.from(new Set(items.map(i => i.refId)))`). Several planned meals can share a day and a type (two snacks); the calendar orders them by `createdAt`.

### Catalog (constants, not documents)

```typescript
interface CatalogIngredient {
  id: string;                                  // 'cat-chicken-breast'
  name: string;
  familyId: string | null;                     // 'cat-fam-chicken'
  aliases: string[];                           // search + AI matching ("capsicum" for bell pepper)
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  serving: { amount: number; unit: Unit };     // a sensible "1 serving"
  gramsPerMl: number | null;
  gramsEach: number | null;
}
interface CatalogFamily { id: string; name: string }
interface CatalogStore { id: string; name: string; domain: string }   // 'walmart.com'
```

Files: `catalog/catalogIngredients.ts`, `catalog/catalogFamilies.ts`, `catalog/catalogStores.ts`, `catalog/index.ts` (lookup maps built once at module load). Values are generated by an author-time script (`scripts/catalog/buildCatalog.ts`) from USDA FoodData Central and checked in; the app never calls USDA at runtime. A search index (lowercased name + aliases) is built once per module. The catalog is a separate lazy chunk loaded with the Pinch route, so it never reaches other mini-apps.

### Derived values (never stored, except a past meal's snapshot)

| Value | Computed from | Where |
|---|---|---|
| Resolved ingredient | catalog entry + `IngredientRecord` | `selectIngredientsById` |
| Quantity in base units | `amount × UNIT_TO_BASE[unit]`, in the unit's dimension | `utils/quantity.ts` |
| Bridged quantity | base units converted to another dimension via `gramsPerMl` (mass ↔ volume) or `gramsEach` (mass ↔ count); `null` when no bridge | `utils/quantity.ts` |
| Ingredient unit cost | default (else first) product: `priceCents ÷ sizeInBase`, per base unit of the product's dimension | `utils/unitCost.ts` |
| Line cost | recipe line amount bridged into the product's dimension × unit cost; otherwise a `NOT_COMPARABLE` gap; no product → `NO_PRODUCT` | `utils/recipeMath.ts` |
| Recipe cost | sum of the priced lines; `{ totalCents, perServingCents, leftOut: Gap[], lines }` (`lines`: each recipe line's own cost or gap, for the drawer); `null` totals when nothing could be priced | `utils/recipeMath.ts` |
| Recipe nutrition per serving | per metric: override if non-null, else sum of line grams × `per100g ÷ 100` ÷ servings; a line with no per-100 g value or no gram bridge is left out of that metric (never counted as 0) and adds a `NO_NUTRITION` gap for it | `utils/nutritionMath.ts` |
| Ingredient item per serving | serving size (record, else catalog, else 100 g) through the same bridge: cost and nutrition of one serving | `utils/mealMath.ts`, `utils/nutritionMath.ts` |
| Grams in one serving | the serving bridged to mass (density or weight each); `null` when it can't be weighed or isn't positive | `getServingGrams` in `utils/nutritionBasis.ts` |
| Nutrition typed for an amount | `toPer100g(typed, grams)` = typed × 100 ÷ grams, two decimals, unchanged at exactly 100 g; grams from `getEntryGrams(amount, g \| oz \| serving, servingGrams)`; the result is what `nutritionPer100g` stores | `utils/nutritionBasis.ts` |
| Ingredient nutrition per serving (display only) | `scaleNutrition(per100g, servingGrams ÷ 100)`; a metric that is unknown stays unknown | `utils/nutritionBasis.ts` |
| Meal nutrition | sum of the items' nutrition (`getMealNutrition`); a metric is known when some item knows it, and the ingredients left out are reported | `utils/nutritionMath.ts` |
| Item cost | `servings ×` (recipe per-serving cost or ingredient per-serving cost) | `utils/mealMath.ts` |
| Planned meal totals | sum of items; for a frozen meal, the snapshot instead | `utils/mealMath.ts` |
| Day totals | planned meals for a day key, inside the period pass | `selectPeriodStats(...).byDay` |
| Period stats | `{ spendCents, mealsPriced, avgPerMealCents, dailyNutrition, proteinCentsPerGram, nutritionMissing, leftOut }` over the shown month, week or day (`getPeriodStats(range)`); `byDay` and `byType` each carry their `nutrition` | `selectPeriodStats(startKey, endKey)` |
| Gaps | the union of left-out ingredients for a scope, minus dismissed ones | `utils/gaps.ts` |
| Day key | `toDateInputValue(date)` for a stored date; `toLocalDateInputValue(cell.getTime())` for a Dreamer UI cell | `utils/dayKeys.ts` |

*Daily nutrition* is the period's total of a metric divided by the number of days that know it (for a single day, that day's own total), so a day with nothing known doesn't pull it toward zero. *Average per meal* divides the period's spend by the number of planned meals that have at least one priced item, so an unpriced meal doesn't pull the average toward zero. *Price per gram of protein* divides spend by protein grams over only the meals where both are known. Both say how many items they left out.

---

## State Machines & Logic

### 1. Quantity and cost

```
toBase(amount, unit) = { dimension: UNIT_DIMENSION[unit], value: amount × UNIT_TO_BASE[unit] }

bridge(q, targetDimension, ingredient):
  same dimension                → q
  MASS   → VOLUME (needs gramsPerMl)  value ÷ gramsPerMl
  VOLUME → MASS   (needs gramsPerMl)  value × gramsPerMl
  MASS   → COUNT  (needs gramsEach)   value ÷ gramsEach
  COUNT  → MASS   (needs gramsEach)   value × gramsEach
  VOLUME ↔ COUNT                      via MASS (needs both)
  otherwise                     → null   (a NOT_COMPARABLE gap)

lineCost(line, ingredient, product):
  no product                    → gap NO_PRODUCT
  q = bridge(toBase(line.amount, line.unit), productDimension, ingredient)
  q is null                     → gap NOT_COMPARABLE
  cost = q.value × (product.priceCents ÷ toBase(product.sizeAmount, product.sizeUnit).value)
```

Cents are rounded once, at the display edge, never per line, so a recipe's total doesn't drift from the sum of its rounded lines. A product's size of `EACH` ("12 count") compares directly with a recipe line in `EACH`, and with mass or volume only through `gramsEach`.

Worked example: chicken breast, Walmart, $9.48 (948¢) for 3 lb → 3 × 453.592 = 1360.776 g → 0.6967¢/g. A recipe line of 2 lb = 907.18 g → 632¢ ($6.32). A line of `1 cup` chicken breast has no `gramsPerMl` → `NOT_COMPARABLE`, left out and named.

### 2. Nutrition

Per metric, independently. Ingredient values are per 100 g, so a line's grams (bridged as above) give `grams ÷ 100 × per100g[metric]`. A recipe's per-serving value is the sum over lines ÷ `servings`, unless `nutritionOverride[metric]` is non-null. An ingredient with `null` for a metric, or a line that can't be bridged to grams, adds a `NO_NUTRITION` gap for that metric only. Nutrition is computed for all four metrics whether or not they're switched on; the switches only choose what is rendered and which gaps are surfaced (`gaps.ts` takes the `showNutrition` switches). In the recipe form `NutritionReview` shows the calculated per-serving values as `MacroStats` tiles (with a warning tip when some ingredients have no nutrition). Edit turns the four numbers into inputs: in place with Done from `sm` up, and on a phone in a `DetailSheet` drawer ("Nutrition per serving", four compact `Field`s, Done). A changed number is saved as that metric's `nutritionOverride` while a number equal to the calculated one stays derived (`null`), and "Reset to what we calculated" clears the overrides (in the drawer it refills the fields and leaves the drawer open). `MacroStats` and `src/utils/macroUtils.ts` are where calories (whole numbers) and macros (grams) are formatted.

**Typing an ingredient's nutrition on the label's basis.** `IngredientFormSheet` asks "Per [amount] [g | oz | serving]" above the four numbers (starting at 100 g), so what is typed is what the label prints, and `getPer100g` turns it into the stored per-100 g values (`toPer100g` over `getEntryGrams`, see Derived values; a blank metric stays `null`). The serving option needs the form's own serving size to convert to grams through `getServingGrams` (the ingredient's density or weight each): until it does the pill is disabled and a hint says so, with an "Add serving size" link when the size is off. A blank or non-positive amount, or a converted value outside 0 … `MAX_NUTRITION_VALUE`, shows one line and keeps Save disabled; any basis other than exactly 100 g shows "Saved as per 100 g: …" with the converted figures. An existing ingredient reopens in per 100 g, since that is what is stored. `NutritionEntry.isTyped` stays false until a number field is edited: while it is, picking g, oz or serving converts the numbers on screen to the new unit from the per-100 g value (`switchBasis`, per 100 g × grams ÷ 100, two decimals), so what is stored doesn't move; once a number has been typed, picking another unit only relabels the typed numbers and "Saved as per 100 g" shows what that makes. Display never changes a number elsewhere: the ingredient drawer and an ingredient row both read the Kitchen list's View options basis (`useListViewOptions(uid, 'ingredients').basis`, default per 100 g), and the drawer's thin Per serving / Per 100 g `PillGroup` writes that same setting rather than keeping its own. The pills are left out and the drawer shows per 100 g when one serving is exactly 100 g or can't be weighed, and a row falls back to per 100 g when the serving can't be weighed; `scaleNutrition` does the per-serving numbers. Recipes, meals, gaps and stats always compute from per 100 g. `npm run check:pinch-math` covers the conversions.

### 3. Copy-on-plan, edit semantics and the past

| Action | Result |
|---|---|
| Plan a saved meal on a day | one `plannedMeals` document: items copied with new row ids, `sourceMealId` set, `name` set |
| Plan a single recipe or ingredient | the same document with one item, `sourceMealId: null` |
| Edit a saved meal | the `meals` document only; planned days unchanged |
| Edit a planned meal | the planned document only (items, servings, date, type) |
| "Save as a meal" on a planned meal | a new `meals` document from its items; the planned meal's `sourceMealId` is left as it was |
| Edit a recipe | `recipes` document only; every non-frozen planned meal that points at it reads the new values |
| Edit a price, serving size, nutrition or conversion | first `freezePastMeals`, then the write |
| Day passes | its planned meals are frozen the next time the app loads that month (below) |

`freezePastMeals` runs in two places: `useFreezePastDays` (from `Pinch.tsx`) once the kitchen has loaded and again for any unfrozen past meals a newly loaded month brings (each meal is submitted once per visit, so the list shrinking as writes land never starts another freeze of the same ones; a failed attempt isn't retried until the next visit or the next edit's freeze), and as the first step of every action that changes a value the math reads (`saveProduct`, `setDefaultProduct`, `removeProduct`, `saveRecipe`, `removeRecipe`, `saveIngredient`, `removeIngredient`, through `freezeLoadedPastMeals`). It never runs while a listener has failed, since the numbers it would freeze come from incomplete data. "Past" is the viewer's local day (`getLocalTodayDate`), the same clock the calendar shows as today, so an evening in a time zone behind UTC doesn't freeze the day still being planned. It finds loaded planned meals with `snapshot === null` and `date` before that, computes each snapshot from the current data, and writes `snapshot` field-scoped (no reads), in one `writeBatch` per 100 meals so each batch is one snapshot event for the listeners. A batch is all-or-nothing, so a refused one (a meal another device froze first, or deleted) falls back to one `updateDoc` per meal, settled independently: the refused meal is denied alone and doesn't stop the rest. The rule allows `snapshot` to change only from `null`, so a stale device can't overwrite history. A freeze that fails never blocks the edit that triggered it (`freezeBeforeEdit` swallows it): a person's own price or recipe change isn't held up by bookkeeping, and the cost is only that those meals stay open until the next freeze.

A frozen meal still lists its items from the live recipes and ingredients (so a deleted-then-archived recipe still shows its title), but its totals come from the snapshot. A meal planned on a day that has already passed is frozen at once (`planMeal` writes the snapshot with the meal, unless a listener has failed, in which case it is left open and the load-time freeze takes it). A frozen meal can't be edited: `updatePlannedMeal` is a transaction that refuses it (a snapshot would no longer match its items), the planned meal view hides "Change items or servings", and the way to change it is to remove it and add it again. Frozen gaps still count in what a total says it leaves out but are not offered as nudges, since a new price can't change history (`PeriodStats.openLeftOut`). The copy for a frozen day says the same thing: its warning says a price added now counts from today on, its cost tile carries the line "Fixed when the day passed", and a cost or row with no price reads "Wasn't priced" (an open day says "No prices yet" / "No price yet", which invite a fix).

*Honest limit:* a meal is frozen from the data on the first load after its day, not the data on the day itself. A price changed during a gap in use, in a month the window never loaded, can leak into history for meals that were never frozen. The freeze-before-edit step keeps this to meals older than the loaded window.

### 3a. Archive on delete

```
removeRecipe(id):
  usedInMeals    = meals.some(m => m.items.some(i => i.kind === 'RECIPE' && i.refId === id))
  usedInPlanned  = (await getCountFromServer(query(plannedMeals, where('refIds', 'array-contains', id)))).data().count > 0
  usedInPlanned || usedInMeals  → updateDoc({ isArchived: true, updatedAt })   // hidden from lists and pickers
  otherwise                     → deleteDoc  (+ delete the cover from Storage)
```

The same shape serves custom ingredients (also checked against `recipes.ingredients[].ingredientId`, saved meals and `products`) and stores (against products). Products are deleted outright (the ingredient's `defaultProductId` is re-pointed to another product, or `null`, in the same transaction), and the MVP has no way to delete a family. The confirm names what will happen ("…is used in 3 planned meals and 1 saved meal, so it will be hidden, not erased"), from `getUsage` (the loaded collections plus one server-side count of the planned meals that list the id, so offline it says it can't check instead of undercounting); the remove action asks again itself, so the confirm text can never disagree with what is done to a record that changed in between. The read is a query, so it can't sit inside the delete's transaction: a planned meal added in the instant between the read and the delete is the one race left, and it would show the removed record as "Removed recipe" until the person re-adds it.

Archived items never appear in pickers, search or lists (`selectRecipes`, `selectIngredients`, `selectStores` are the visible lists; the `selectAll…` ones and every `…ById` map still hold them, so `Retired chili` keeps its title and cost on the day that used it). A catalog store the person archived shows as addable again in the store pickers. Selectors that resolve a reference (`resolveIngredient`, recipe titles for planned items) still find them.

### 4. Gaps and nudges

`getGaps(scope)` walks the lines in a scope (one recipe, one meal, a day, the month) and returns `{ kind, ingredientId, detail }[]`:

- `NO_PRODUCT` — a priced ingredient with no product, or a recipe/ingredient item with no price at all
- `NOT_COMPARABLE` — a product exists but the amount and the package size can't be bridged
- `NO_NUTRITION` — only for a metric in `showNutrition`

A gap is **hidden** when `dismissedNudges["{kind}:{ingredientId}"]` exists. Dismissing writes that key; filling the gap makes the gap disappear on its own, and a later regression (a product removed) brings it back only if the key was cleared, so dismissal clearing happens in the same write as the action that fills the gap (`saveProduct` removes the `NO_PRODUCT`/`NOT_COMPARABLE` keys for that ingredient). A nudge renders only when the filtered gap list is non-empty. A total that excludes lines always says so, whether or not its nudge is dismissed.

The fill-in sheet takes the gap list and renders one row per ingredient with only the fields that gap needs: a product's store, price and size for `NO_PRODUCT`; the size for `NOT_COMPARABLE`; the metric for `NO_NUTRITION`. Saving writes through the same actions as the full forms. A row left blank stays unchanged; a row that is part-filled is not saved and says what it still needs, so Save never writes half a product. A saved row asks to become the ingredient's default product, and a `NOT_COMPARABLE` row rewrites the size of the default product it is about.

### 5. Recipe ingestion (AI)

```
idle → reading(source) → draft(recipe, unread[]) → (person edits) → saved
             │                                           
             └→ failed(message)    (always ends on idle for the next try; nothing was written)
```

- Entry point: a new recipe lists its ways to start through `RecipeStart`, rows only from the shared `MethodPicker` (required `onPick`, one `Method` per `RECIPE_START_METHODS` entry): **From text** (up to `MAX_PASTE_CHARS`), **From a file** (a photo, screenshot or PDF up to `MAX_UPLOAD_BYTES`; JPG, PNG, WebP, HEIC, PDF through `getUploadMimeType`; images through `compressIngestionImage`), **From a link**, and **Write it yourself**, last and quieter. On a phone "New" in Recipes and Calendar's "Add a recipe" raise `RecipeStartDrawer` (a `DetailSheet`), which `Pinch.tsx` renders once at its root from `isStartOpen` in `PinchOverlayContext` (`setIsStartOpen`), so any screen can raise it; picking a way closes the drawer and opens `RecipeSubview` already on that way (`{ kind: 'recipe', id: null, method, fromDrawer: true }`). From `sm` up they open the subview with no `method`, whose first stage is the same list. Editing an existing recipe goes straight to the form.
- `RecipeSubview` stages are `start | text | link | file | form`. Picking text, link or file shows `RecipeReader` for that way (`components/recipes/RecipeReader.tsx` holds the three views), titled with the way's name; "Write it yourself" and each reader's "Write it yourself instead" go to the form, and a finished reading goes to the form with its result. `RecipeSubview` passes `Subview` an `onBack` (`goBack`), which the header's back button, Escape and the browser's or phone's back gesture all call. On a reading screen it raises the phone's start drawer again (`closeSubview()`, then `setIsStartOpen(true)`) when the way came from it (`fromDrawer`) and returns to the start stage otherwise; on the start page and the form it calls `leave`. `leave` closes the subview, first asking `useActionModal().confirm` "Discard this recipe?" (Keep editing / Discard, destructive) while `isDirtyRef` is set. `RecipeForm` sets that ref when its data differs from the initial data, when a cover is chosen or removed, and when it started from a reading; `RecipeSubview` also sets it as a reading lands. Cancel goes through the same `leave` (`onLeave`); saving and deleting close directly.
- Each reader carries its own disclosure line above its input, on screen before anything is sent (text, link and file alike): text and file say an AI reads it and fills in the form and that it isn't saved; link says the page is opened and an AI reads the recipe from it. The text and link buttons read "Fill in the recipe". A file is also accepted dropped on the screen; one that isn't an image or PDF, or is over `MAX_UPLOAD_BYTES`, is refused with its own sentence. A link without a scheme gets `https://`, and anything that isn't an http(s) address with a dotted host is refused before any call.
- `lib/extractRecipe.ts` exports `extractRecipeFromText(text)`, `extractRecipeFromFile(file)` and `extractRecipeFromPage(page)`. All call the shared `generativeModel` from `src/lib/firebase/ai.ts` with a response schema: `{ title, servings, prepMinutes, cookMinutes, description, ingredients: [{ name, amount, unit, note }], steps: [string], unread: [string] }`, where `unit` is an enum of the app's unit labels. Files go as `inlineData` base64. Extraction calls are not cached and not Query-backed (non-idempotent), like the other extraction calls in the repo.
- **From a link** fetches the page first through `fetchPageContent` (shared and app-neutral: `src/lib/pageContent/*`; Pinch's `queries/recipePageQueries.ts` asks it for `text`, `meta` and `structuredData` filtered to `schemaTypes: ['Recipe']`, kept ten minutes and never persisted, so a retry of a failed reading doesn't refetch). The callable (`functions/src/linkMetadata/fetchPageContent.ts`) is signed-in only, takes http/https links only, uses the same private-network guard as `fetchLinkMetadata` (`safeFetch.ts`), returns only the kinds asked for and stores nothing. `extractRecipeFromPage` hands the page title and description, the Recipe data (when the page has any, marked as possibly incomplete) and the page text to the model, with a line telling it to ignore ads, comments and related links; the model writes the draft, so a page with partial, missing or odd data reads where a hand-written parser would drop it. The client maps a bad link, an unreadable page and a failed fetch to one warm sentence each.
- The model output is **only a draft for the form.** `matchIngredient(name)` (`utils/ingredientMatch.ts`) resolves each ingredient name to an ingredient id against the person's custom ingredients first, then catalog names and aliases (normalized: lowercase, singular, punctuation stripped). No match → the row is marked "Add as new ingredient" and, if kept, creates a custom ingredient with that name in the same save as the recipe (one `writeBatch`).
- The prompt tells the model the pasted text is data, not instructions, and asks it to list anything it could not read in `unread`; the draft never writes anything itself, so injected text can at most fill form fields the person reviews.
- **The reading becomes the form's starting values.** Because the start list and the reading screens come before the form, `RecipeSubview` holds a finished reading (`{ recipe, source, label }`, the label being "your text", the file's name or the page's host) and hands it to `RecipeForm` as `initialRead`; `getDataFromExtracted` builds the form's initial data from it (a line whose ingredient is already a row is skipped; unmatched names become "Add as new ingredient" rows). The form then says what it was filled from and lists `unread`, and nothing is saved until the person saves. `normalizeExtractedRecipe` also cuts every value to the limits the form and `firestore.rules` enforce (title, description, note, step lengths, servings, minutes, counts), so a long answer can't leave Add disabled or fail the write.
- **The form's basics are summary rows.** `RecipeBasics.tsx` holds `RecipeTitleField`, `RecipeTimesField` and `RecipeDescriptionField`, each a `SummaryEditor` over the same form values as before (`title`, `basics.prep` / `basics.cook` as text, `description`), so dirty tracking, `onTitleChange` and the header's live name work through the editors unchanged; only Servings is still an inline `Stepper`. The title editor opens by itself once (`defaultOpen`) when `recipeId` is null and there is no `initialRead`. Validation is the same predicates as before (`title` required and at most 200 characters, `description` at most 2,000, `isValidMinutes` for prep and cook) and each shows on its row as well as in its editor; the pinned footer's note names the first thing to fix ("Give it a title to save.", "Shorten the title to save.", "Check the prep and cook time to save."). The two minutes fields are `type='number'` with a visible "min" suffix and an `aria-label` of "Prep time in minutes" / "Cook time in minutes"; no label carries "(minutes)".
- **Removals in the form are undoable.** `RecipeForm` owns one `useUndoRemoval` and passes `showUndo` to `RecipeIngredients` and `RecipeSteps` (`onRemoved`), so an ingredient and a step removed in a row can't show two bars at once; `MealBuilder` owns its own for the plate (and puts the saved meal's name back when Undo returns the last item). The `UndoSnackbar` is the form's first child, not its last, because `Subview overlay` stretches its last child to fill the screen. Dreamer UI's toast was not used: its action label is fixed when the toast is added, so it can't show the seconds left without removing and re-adding the toast every second.
- A reading that finds no ingredients at all is a failure ("We couldn't find a recipe in that"). Errors map to one warm sentence each (busy, offline, unavailable, unreadable) and the detail is logged, never shown.
- `source` is saved as `AI_TEXT` / `AI_FILE` / `AI_LINK` when the draft came from the reader, `MANUAL` otherwise (even if the person edited it).

### 5a. Recipe sources

- **Choosing one.** The recipe form's "Where it's from" section is a `PickOrCreate` over the person's sources (existing labels as pills, a dashed "New source" first, nothing preselected for a new recipe), with a text field in its place while there are no sources yet. The form keeps the answer as `{ choice, newText }`: a source id, `NEW_CHOICE` with the label typed, or empty. Saving resolves it in `RecipeForm`: a typed label that matches a loaded source (ignoring case and spaces) reuses its id, otherwise it becomes `draft.newSource` (a new id and the label) that `saveRecipe` writes in the same `writeBatch` as the recipe, like `newIngredients`, so a failed save leaves no orphan source and an offline save is queued whole; a picked id that no longer exists becomes `null`; the result is `draft.sourceId`. While a source is chosen the picker shows a visible "Remove source" link (`PickOrCreate`'s optional `clearLabel`), besides tapping the chosen pill again.
- **Reading from a link.** A recipe read from a link (`source === 'AI_LINK'`) starts on its site: `getReadSourceChoice` takes the reading's label (the page's host), drops a leading `www.`, and picks the existing source whose label matches the host the same way (so "seriouseats.com" matches "www.seriouseats.com"), otherwise starts "New source" with the host as the text (cut to 80 characters). Only the form's starting value is set, so what the person picks or types afterwards is never replaced; the text field takes no focus on its own (`isFocusedOnOpen={false}`) so the keyboard doesn't open over the form. A recipe read from text or a file starts with none.
- **Writing.** `saveRecipe` writes `sourceId` on every save (new or edit), so an edit backfills the key on a recipe that lacked it and the field-scoped `updateDoc` never touches it elsewhere. `renameSource` is a field-scoped `updateDoc` of `label` and `updatedAt` after checking the loaded list for another source with that label. `removeSource` is one `writeBatch` per 400 writes holding the source's delete (in the first batch) and `sourceId: null` on every loaded recipe that names it, archived ones included; a recipe's `updatedAt` is left alone because it versions the cover image. A recipe created on another device at the same moment, or one that wasn't loaded yet, keeps a pointer to a source that no longer exists, which reads as none (above); if a later batch fails the source is already gone and the rest read the same way, and the error is shown.
- **Failure.** The sources listener is an optional enhancement: its error is logged (`console.error`), clears the loaded sources, never reaches the fatal load-error screen (`selectPinchLoadError` leaves it out), and its first answer or error ends the loading gate. While it has failed the form leaves the section out and keeps a recipe's own `sourceId` as it was, so editing never drops a label it couldn't read; the Sources entry, filter and drawer line simply don't appear.
- **Reading and counting.** `selectSources` (alphabetical), `selectSourcesById` and `selectSourceCounts` (`{ bySource: Map<id, count>, withoutSource }` over the listed, non-archived recipes, one pass) feed the Recipes screen. The Source filter is a `FilterBar` with one `FilterSection` holding a pick-one `PillGroup`: "Any", each source used by at least one listed recipe as "Label · count", and "No source · n" only when some recipe has none; a picked source or "No source" stays in the list while picked even if its count falls to zero. The filter exists only while at least one listed recipe has a source (otherwise the screen keeps its plain search-from-8 layout), the picked value falls back to "Any" when its source is gone or the filter disappears, and Meals are never filtered.

### 5b. Shopping list

- **Lines are pure functions** in `utils/shopping.ts`, checked by `npm run check:pinch-math`. `getRecipeLines(recipe, ingredientsById, servings)` scales each recipe line by `servings / recipe.servings`. `getItemsLines(items, recipesById, ingredientsById)` serves a saved meal, a planned meal and a whole day: a recipe item scales its recipe by the item's `servings` over the recipe's own, an ingredient item is its `servings` times the ingredient's serving size. A line whose recipe or ingredient is gone is left out. `mergeLines` adds lines with the same ingredient and unit, rounds once at the end to two decimals (thirds add up to one before rounding), caps an amount at 1,000,000 and drops a line that rounds to nothing. Units are never converted.
- **Adding** is `addToShoppingList({ uid, lines })`: the lines are merged and checked (not empty, at most 200 distinct, an id of 80 characters or fewer, a known unit, an amount above zero), then one `runTransaction` reads every target document first and writes each: a missing item is created (`isChecked: false`), an unchecked one gains the amount (rounded to two decimals, capped), and a checked one restarts with the new amount and `isChecked: false`. That decision is the pure `getMergedFields(existing, line, now, isChecked)` in `utils/shopping.ts`, so `npm run check:pinch-math` covers it (a new line, an open item gaining an amount, a checked item restarting, the 1,000,000 cap, a unit move carrying its flag, an amount that rounds to zero, a recipe with no servings); the transaction code only reads and writes around it. `mergeLines` also drops a non-finite amount, so a recipe whose servings are 0 gives no lines instead of an endless one. Two devices adding at the same time retry on conflict, so neither amount is lost (checked in the browser with two pages adding one recipe at once). The manual "+ Add" uses the same action with one line at the ingredient's serving size. A transaction does not queue offline, so adding needs a connection and says so by failing; ticking, changing and removing are ordinary writes and queue.
- **The other writes are field-scoped.** A tick is `updateDoc({ isChecked, updatedAt })` and touches only its own row (no surface-wide busy state). Changing an amount is `updateDoc({ amount, updatedAt })`. Changing the unit moves the item in one transaction: the old document is deleted and the amount lands on the new unit's document by the same rules as an add, except that a new document takes the moved line's `isChecked`, so a ticked line stays ticked. Moving into an existing document follows the add rules: an open one gains the amount, a ticked one restarts open with only the moved amount, and the row sheet's note says which before saving. Remove is `deleteDoc` after a destructive confirm. "Clear" takes the ids of the checked items from the store when it is dispatched, then deletes them in chunks of 250, one `runTransaction` per chunk: each re-reads its documents and deletes only the ones that are still checked, so an item another device un-ticked or removed in the meantime survives (a stale cache can't delete it), and the thunk resolves to how many were really deleted, which the toast says ("Cleared 15 items", with "The rest changed in the meantime" when fewer than the confirm dialog's count). The confirm dialog's count is the count at tap time. Chunks are independent transactions, so several chunks are not atomic together: one that fails leaves the others cleared and the list shows what is left. A Firebase error is logged and replaced by one plain sentence, "Check your connection and try again." for `unavailable` or when the browser is offline; the app's own sentences ("This is already off your list.") are shown as written.
- **The caps are limits of the app, not of the database.** 200 distinct lines per add and about 300 items on the list are enforced in the action and the screens only: the rules can't count a collection, so another client could pass either. Nothing breaks if it does (the list is longer, and a group still draws 100 rows then "Show N more").
- **Reading.** `selectShoppingRows` groups once per change (`groupShoppingItems`): what is left by ingredient family in Kitchen's family order, "Other" last for an ingredient with no family or one that is gone, rows A to Z by name and unit; what is checked off goes to one "Got it" list. `selectShoppingOpenCount` feeds the Shopping tab's badge. `selectShoppingCost` prices the unchecked lines through `getLineCost` with each ingredient's default product, the same way a recipe's lines are priced, so it prices the amount on the list and not whole packages; what it can't price comes back as `Gap`s (`NO_PRODUCT`, `NOT_COMPARABLE`), which the help icon beside the cost line lists by ingredient. The line reads "Amounts on your list: about $3.16" and always has that icon (`HelpTip`, a modal on a phone or touch screen and a tooltip with a mouse): a plain help icon when nothing is left out and a warning when something is. It says that it prices just the amounts from default products, that stores sell whole packages so the till total is usually more, and, for each ingredient it can't price, its name and where to fix it ("Add a price from the ingredient in Kitchen": a fill-in sheet never opens over this screen's own sheets, so the text points the way).
- **Searching.** From `LIST_SEARCH_THRESHOLD` (8) items the screen shows a `SearchInput` above the list that filters the groups and "Got it" by ingredient name (`searchByName`, accent-insensitive, every word must match) from the typed text, not a debounced value. Nothing matching says so in one muted line ("Nothing on your list matches “milk”."). "Got it" then reads "Got it · 1 of 3"; "Clear" still clears every ticked item and its confirm counts them all. If the list drops under 8 items the field disappears and the filter with it.
- **Drawing.** Groups after the first three mount when they near the viewport (`LazyMount` with `defer-offscreen`, a row estimated at 57 px), from `lg` they flow in two columns like Kitchen's, a group draws 100 rows then "Show N more" (and nothing is hidden for 103 or fewer), and the "Got it" rows mount only while that group is open. The drawers' "Add to shopping list" sheets live in the screen that owns the drawer (`RecipesScreen`, `CalendarScreen`) and open after the drawer closes, as `FillInSheet` does.
- **Failure.** The shopping listener is an optional extra: its error is logged (`console.error`), clears the loaded items and sets `loadError`, never reaches the load-error screen (`selectPinchLoadError` leaves it out) and is not part of the loading gate (`selectIsPinchLoaded`). The screen then says it couldn't load the list and offers no Add, and the tab's badge shows nothing. While the first snapshot hasn't landed the screen says "Loading your list…". Both add sheets wait for `state.pinch.shopping.isLoaded` (and a null `loadError`) before they let anything through: `AddToShoppingSheet` disables Add, "Tick all" and its checkboxes with "Loading your list…" or "Your list couldn't load, so adding is paused." in the pinned footer, because its defaults (what is already on the list starts unticked) come from the listener's data, and `ShoppingAddSheet` locks its results with the same lines and also checks the 300-item cap when a result is picked, not only when it opens. The gate deliberately leaves the shopping slice out of `selectIsPinchLoaded`, so a shopping failure never reaches the fatal screen.

### 5c. Recipe ideas

- **Adding.** "New idea" opens one `FormSheet` (`IdeaAddSheet`: a drawer on a phone, a modal from `sm`), whose first view is the `MethodPicker` of the three ways (`IDEA_START_METHODS`; *Jot it down* is last and quieter). A way's own view swaps in place with a "Back" link to the list, so there is never a second overlay, and Escape or the back gesture closes the one sheet. Each way is a Dreamer UI `Form` of custom fields with the footer pinned (`Cancel`, "Save idea" disabled until valid); the title of the sheet is "New idea" on the list and "Idea" on a way.
- **From a link.** The field is `type='url'` (the submit button carries `formNoValidate`, since a link with no scheme is fine), `toWebLink` (`@/utils/urlUtils`) trims the ends, picks the one `http(s)://` token out of pasted text that has words around it (two such tokens give no link, and the field says "That looks like more than one link. Paste one at a time."), joins a scheme-less link that wrapped over lines, adds `https://` when no scheme is typed and refuses anything that isn't an http(s) address with a dotted host and no user name or password, and `toIdeaUrl` also caps it at 2,000 characters. A paste into the field that holds more than one word is run through it first (the browser would otherwise glue or drop the line breaks of a pasted line). After `DEBOUNCE_MS.linkDetection` the page is looked up with `fetchPageContent` through a TanStack Query factory (`queries/ideaPageQueries.ts`): `include: ['meta']` only, a callable timeout of `IDEA_LOOKUP_TIMEOUT_MS`, the shared 10-minute stale time for a success, no retry and no `persist`; a failure is a query error, never data, so it is never kept as an empty answer and a repeat of the same link asks again. `meta` carries the page's `<title>` (as `title`), `og:site_name` and `og:image` or `twitter:image` (resolved to an absolute address); the `images` kind is not asked for, because its other entries are the page's own `<img>` tags (logos, ads) and a wrong picture is worse than the tile. The line before anything is sent says what happens ("We fetch the page to find its title and picture. Nothing is saved from it except those."). While the lookup runs the sheet says so; when it returns, the preview shows the picture, a "Looks like" title field the person can change, and the site name; when it fails or times out, a title field with the host as its placeholder and "Couldn't read that page. You can type your own title." Saving never waits for the lookup: the title is what was typed, else the page's title if the lookup has landed for this very link, else (in `createIdea`) the host, and `siteName` is the page's or the host. A typed title belongs to the link it was typed for (`{ link, title }`), so pasting another link starts again. A link already on the list (`findIdeaByUrl`, comparing `getComparableUrl`: no scheme, `www.`, fragment, trailing slash or tracking parameters, the other parameters in order) shows "That one's already in your ideas" with an "Open it" button, which closes the sheet and opens that idea's drawer, and disables saving; the lookup isn't made for it.
- **From a photo.** `PhotoPicker` (the shared file picker; its new `uploadLabel` and `changeLabel` props and optional `onRemove` are general) and `useImageUpload` (images only, up to 5 MB) feed `createIdea`, which resizes the file with `resizeImageToWebp` to `IDEA_PHOTO_MAX_DIMENSION` (a result that isn't `image/webp` counts as unreadable, and the resize happens before anything is uploaded, so a refused file touches no Storage object), uploads it to `getIdeaPhotoPath(uid, id)` before the document is written, and deletes it again if the write fails. A photo idea needs a title (the field starts empty with "What is it?") and a picture; a failed upload keeps the form and says why through `getStorageErrorMessage` (a neutral "We couldn't save that picture." when the code has no message of its own). A save failure shows as one red line in the footer's `note` slot (the pinned footer, beside the buttons, never below the form where the footer would cover it) and clears when the form changes or a picture is picked.
- **Jot it down.** A title and, shown from the start, a note.
- **The note** is a visible optional second field: "+ Add a note" with a "Remove note" link on the link and photo ways, open from the start on the text way and in the edit sheet.
- **The drawer.** `IdeaDrawer` (a `DetailSheet`, titled "Idea") shows the picture (only if there is one; a failed one leaves nothing), the title, the note (pre-wrapped), a made idea's tinted "Made into <recipe>" row, and for a link a quiet "Open <site name>" row (`Button href`, `target='_blank'`, `rel='noopener noreferrer'`, only for an http(s) address). Its footer is Modify (secondary) beside one primary: "Turn it into a recipe", or "Open the recipe" once made. Modify closes the drawer and opens `IdeaFormSheet`; "Open the recipe" closes it and opens the recipe's own drawer (`RecipesScreen`'s `openId`).
- **Editing.** `IdeaFormSheet` (title, link for a LINK, a photo with "Replace photo" and no remove for a PHOTO, note) saves through `updateIdea`, a field-scoped `updateDoc` of `title`, `note`, `updatedAt`, plus `url` (and `siteName`, `imageUrl: null` when the link names another page; the same page spelled differently keeps its site and picture) and `photoPath` when a replacement was picked, plus the keys an older document lacks. A replaced photo overwrites the same Storage object, and the picture's download URL is keyed on `updatedAt`, so it is fetched again. Delete is a destructive `useActionModal().confirm` ("Delete this idea?" naming it; for a made idea it says the recipe stays), then `removeIdea` (`deleteDoc`, then the photo object, best effort).
- **Turning an idea into a recipe.** The primary opens the recipe subview on its form (`{ kind: 'recipe', id: null, method: 'manual', fromIdeaId }`) and `RecipeSubview` reads the idea once, when it mounts. `getDataFromIdea` starts the form with the title, the note as the description and, for a LINK, `getSiteSourceChoice(getWebLinkHost(url), sources)`: the existing source named for the link's host (the `getHostSource` matching, as PR A's link reading does), else "New source" with the host, created with the recipe. It deliberately uses the host and not the page's own site name, so a person with a source called "seriouseats.com" doesn't get a second "Serious Eats". Nothing else is read from the idea: a photo is not copied and stays with the idea. The form says "From your idea: <title>" and its title editor doesn't open by itself. Leaving an untouched prefilled form asks nothing, and discarding changes nothing. `saveRecipe` takes `fromIdeaId`. The recipe's batch (the recipe, its new source and its new ingredients) is committed on its own, exactly as for any recipe, so an idea that has gone from the server can never take a recipe down with it (a batch queued offline is refused whole if one of its documents is missing). Only after that commit, and only if the idea is still in the loaded store, one field-scoped `updateDoc` writes `{ …missing keys, recipeId, updatedAt }` on the idea; a failure there is caught, logged with `console.error` and not thrown, and `saveRecipe` returns `{ recipeId, linkedIdea }`. The form's toast says "“X” moved to Made into recipes." only when `linkedIdea` is true, and is the plain "Recipe added" otherwise. The recipe's `source` is `MANUAL`.
- **Reading.** `selectIdeas` (newest first), `selectIdeasById` and `selectIdeaGroups` (`{ toTry, made }`: a set of the listed recipes' ids, then two filters over the ideas) feed `IdeasView`, which shows "Still to try" and "Made into recipes" with `SectionDivider` once both have rows, a search (`SearchInput`) from `LIST_SEARCH_THRESHOLD` ideas that looks through title, site name and note, and rows in chunks of twenty (`LazyMount` with `defer-offscreen`, the first chunk eager) that are as tall as their lines: a `IdeaThumbnail` (the link's own picture through `FallbackImage` with the emoji tile as its fallback, a photo's download URL, or the tile), a title of up to three lines, one muted line (`getIdeaDetail`: a link's site, else the first line of the note) and a chevron pinned to the first line. Two columns from `lg`.
- **The cap.** `SOFT_MAX_IDEAS` (200) is enforced by `createIdea` against the loaded list and by the screens (the "New idea" button is replaced by "Your list holds up to 200 ideas. Delete one to add another."), not by the rules, which can't count a collection.
- **Failure.** The ideas listener is an optional extra: its error is logged (`console.error`), clears the loaded ideas and sets `loadError`, never reaches the load-error screen (`selectPinchLoadError` leaves it out) and is not part of the loading gate. "New idea" is disabled until the first snapshot has landed (the list says "Loading your ideas…") and stays disabled after a failure (the list says it couldn't load them and shows no search), and `createIdea` refuses in both states with a plain sentence, so the guard holds even if the button is reached some other way; Recipes, Meals and Kitchen are unaffected.
- **Not cascaded.** Deleting a recipe never touches the ideas that name it (they read as not made), deleting an idea never touches its recipe, and a recipe made from an idea keeps no pointer back.

### 6. Stock tracking (reserved for Next Steps)

The MVP data model leaves two things open on purpose: a future `stock` collection (`ingredientId`, `amount`, `unit`, `lastCountedAt`, `isTracked`) where a missing document means "not tracked", and `plannedMeals.madeAt` for mark-as-made. Neither is written in the MVP. Both arrive as new optional-by-default fields (`null`) with the legacy-document defaults the repo already requires.

---

## Security Rules Design Criteria

1. **Everything is owner-only.** Every path under `apps/pinch/kitchens/{uid}` (the kitchen document and all ten subcollections) allows read and write only when `request.auth.uid == uid`. There is no member-of, admin or role branch.
2. **`isAdmin()` and `isDevUser()` get no access to kitchen data.** They gate only the app *catalog* document `apps/pinch`, as for every other app. A dev fixture signs in as its own `uid` like anyone else.
3. **The app document** `apps/pinch` follows the existing four-read-predicate shape (admin/dev, unrestricted-public, uid-allowed, email-allowed) with admin-only writes, in alphabetical position among the app blocks.
4. **Shape validation covers every field on every type**, with the `T | null` convention (the key must exist; `null` is legal only where the type says so). Enums use `in [...]` against the same strings as `constants.ts`. Bounds: `priceCents` is an int `0 … 100_000_000`; `sizeAmount`, `amount` and `servings` are numbers `> 0` and `≤ 1_000_000`; nutrition values are null or numbers `0 … 100_000`; `gramsPerMl` and `gramsEach` are null or `> 0`; `date` is an int and a multiple of `86_400_000`; strings have length caps (names 120, titles 200, steps 2,000, notes 200, a source's label and a recipe's `sourceId` 80); arrays are capped at `MAX_RECIPE_INGREDIENTS`, `MAX_RECIPE_STEPS`, `MAX_MEAL_ITEMS` and `refIds` (rules can't loop, so a recipe's ingredient lines and steps are the client's to enforce, while a meal's at most 10 items are each checked by index: keys, kind, string ids and `servings > 0`; adding length caps on those ids or checking the elements of `refIds` exceeds the evaluator's budget, so those stay the client's); `url` is null or an `https://` string; `dismissedNudges` has at most 500 keys. A shopping item (`isShoppingItem`) has exactly its seven keys, `ingredientId` of 1 to 80 characters, an `amount` that is a number above zero and at most 1,000,000, a known `unit`, a boolean `isChecked`, integer timestamps, and its document id equal to both `data.id` and `ingredientId + '__' + unit`. An idea (`isIdea`) has exactly the eleven keys of the type, every one required (there is no older shape), `kind` one of `LINK`, `PHOTO`, `TEXT`, a `title` of 1 to 120 characters, a `note` of 1 to 1,000 or null, a `url` of at most 2,000 characters that starts `http://` or `https://` (lower case, so `JavaScript:` and `//x` fail) and has no user name or password before the host, or is null, a `siteName` of 1 to 120 or null, an `imageUrl` of at most 2,000 characters that starts `https://` with no user name or password, or is null, a `photoPath` that is null or exactly `apps/pinch/kitchens/{uid}/ideas/{id}/photo.webp`, a `recipeId` of 1 to 80 characters or null, integer timestamps, and its document id equal to `data.id`; that `kind` fits the other fields (a link has a `url`) is the client's.
5. **Immutable fields only:** `id`, `uid`, `createdAt` (a source's and an idea's too), an idea's `kind`, an ingredient record's `catalogId`, a store's `catalogStoreId`, a product's `ingredientId`, a shopping item's `ingredientId` and `unit` (its id is built from them). Everything the UI edits stays editable, including a planned meal's `date`, `mealType` and `items`.
6. **Write-once snapshot.** A planned meal's `snapshot` may be written only while the stored value is `null`, and is then immutable. Its `frozenAt` must be `≤ request.time.toMillis()` plus five minutes of clock skew, so a phone whose clock runs a little fast can still freeze. Its shape is checked (five keys, bounded totals, at most 10 lines); the elements of `leftOut` and `lines` are the client's, since rules can't loop. (Rule check: `resource.data.get('snapshot', null) == null || request.resource.data.snapshot == resource.data.snapshot`.)
7. **Cross-field integrity the client could get wrong:** a planned meal's `refIds` equal the distinct `refId`s of its `items` is **not** enforced in rules (it's a derived index the client writes; a wrong value only affects the "in use" check, and the owner is the only writer), and the rules say so. A recipe has at least one ingredient; a meal and a planned meal have at least one item; `defaultProductId` shape is a string or null.
8. **Deletes:** the owner may delete any document in their kitchen, including the kitchen document. The client archives anything in use (Logic §3a), and the rules deliberately don't, since the data is the owner's own and a stale client must not be locked out of cleaning up.
9. **No cross-document rules.** No `get()`/`exists()`: a product doesn't have to point at an existing ingredient or store at the rules level, and a recipe's `sourceId` doesn't have to name an existing source and an idea's `recipeId` doesn't have to name an existing recipe; the client resolves a dangling reference to "Removed …" (a source to none, an idea's recipe to "not made yet").
10. **Rules tolerate older documents.** A field added later is validated on the incoming document with `request.resource.data.get('field', default)` and compared against the stored value with `resource.data.get('field', default)`; every edit action backfills the new key with its empty value in the same write. A recipe's `sourceId` is the example in use: `isRecipe` lists it in `hasOnly` but not `hasAll`, reads it with `data.get('sourceId', null)` and accepts it missing, `null` or a string of 1 to 80 characters. An idea has no older shape: the collection is new, `isIdea` requires all eleven keys, and `createIdea`, `updateIdea` and the recipe link still write back any key a document lacks (so a document made outside the app can be edited through the client). (Reserved, not yet written: `plannedMeals.madeAt`, the `stock` collection.)
11. **No server-only collections and no new indexes.** The only queries are a single-field range on `plannedMeals.date` and an `array-contains` on `plannedMeals.refIds`, neither of which needs a composite index. The sources, the shopping items and the ideas are listened to as plain collections (the lists are grouped and sorted in the client), so they add no query and no index; `firestore.indexes.json` is unchanged, and the PR says so. A source and a shopping item have no file, so only an idea adds to the Storage rules (criterion 12).
12. **Storage rules.** `apps/pinch/kitchens/{uid}/recipes/{recipeId}/{file}` and `…/stores/{storeId}/{file}` are readable and writable only by `request.auth.uid == uid`, only `image/*` content types, at most 5 MB, and the file name is `cover.webp` or `logo.webp`. Storage paths mirror the Firestore document paths. A recipe idea's photo is `apps/pinch/kitchens/{uid}/ideas/{ideaId}/photo.webp`, the cover's rule over again: owner only, `image/*`, under 5 MB, and the file name must be `photo.webp`; a PHOTO idea's `photoPath` is checked against that path in `firestore.rules`.

The shape of the block (helpers declared in the `kitchens/{uid}` match so the nested matches reuse them):

```
// --- App: pinch ---
match /apps/pinch {
  allow read: if isAdmin() || isDevUser();
  allow read: if isUnrestrictedPublicApp(resource.data);
  allow read: if isUidAllowedApp(resource.data);
  allow read: if isEmailAllowedApp(resource.data);
  allow create, update, delete: if isAdmin();
}

match /apps/pinch/kitchens/{uid} {
  function isOwner() { return request.auth != null && request.auth.uid == uid; }
  function isCents(v) { return v is int && v >= 0 && v <= 100000000; }
  function isPositive(v) { return v is number && v > 0 && v <= 1000000; }
  function isNullOrNutrition(v) { return v == null || (v is number && v >= 0 && v <= 100000); }
  function isUnit(v) { return v in ['G','KG','OZ','LB','ML','L','TSP','TBSP','CUP','FL_OZ','PINCH','EACH']; }
  function isMealType(v) { return v in ['BREAKFAST','LUNCH','DINNER','SNACK','DESSERT','DRINK']; }

  allow read: if isOwner();
  allow create, update: if isOwner() && validSettings(request.resource.data);
  allow delete: if isOwner();

  match /ingredients/{id}  { allow read: if isOwner(); allow create, update: if isOwner() && validIngredient(request.resource.data, id); allow delete: if isOwner(); }
  match /families/{id}     { /* same shape */ }
  match /stores/{id}       { /* same shape */ }
  match /products/{id}     { /* same shape */ }
  match /recipes/{id}      { /* same shape */ }
  match /sources/{id}      { /* same shape; id, label 1…80, createdAt, updatedAt */ }
  match /shoppingItems/{id} { allow read, delete: if isOwner(); allow create: if isOwner() && isShoppingItem(request.resource.data, id);
                              allow update: if isOwner() && isShoppingItem(request.resource.data, id) && ingredientId, unit and createdAt unchanged; }
  match /ideas/{id}        { allow read, delete: if isOwner(); allow create: if isOwner() && isIdea(request.resource.data, id);
                             allow update: if isOwner() && isIdea(request.resource.data, id) && createdAt unchanged; }
  match /meals/{id}        { /* same shape */ }
  match /plannedMeals/{id} { /* same shape, plus the snapshot rule */ }
}
```

---

## Client State Management (Redux Toolkit)

Per-app store under `src/apps/pinch/store/`, exposing `PinchState` and `pinchReducer`, mounted in the central `src/store/index.ts` as `pinch` (next to `aList`, `nineLives` and `waypoint`).

```typescript
interface SettingsState       { settings: KitchenSettings | null; isLoaded: boolean }
interface IngredientsState    { records: IngredientRecord[];      isLoaded: boolean }
interface FamiliesState       { items: Family[];                  isLoaded: boolean }
interface StoresState         { items: Store[];                   isLoaded: boolean }
interface ProductsState       { items: Product[];                 isLoaded: boolean }
interface RecipesState        { items: Recipe[];                  isLoaded: boolean }
interface SourcesState        { items: Source[];                  isLoaded: boolean; loadError: string | null }
interface ShoppingState       { items: ShoppingItem[];            isLoaded: boolean; loadError: string | null }
interface IdeasState          { items: Idea[];                    isLoaded: boolean; loadError: string | null }
interface MealsState          { items: Meal[];                    isLoaded: boolean }
interface PlannedMealsState   { items: PlannedMeal[]; windowKey: string | null; isLoaded: boolean }
export interface PinchState { settings: SettingsState; ingredients: IngredientsState; families: FamiliesState;
  stores: StoresState; products: ProductsState; recipes: RecipesState; sources: SourcesState; shopping: ShoppingState; ideas: IdeasState; meals: MealsState; plannedMeals: PlannedMealsState }
```

Every slice resets on the shared `resetAllState`, so a user switch never shows the previous person's data.

**Two listener tiers**, both under `store/listeners/` and started from `usePinchSync(uid, shownMonth)` called once from `Pinch.tsx` (the only orchestrator); no tab, panel or drawer has an `onSnapshot` of its own:

1. **Signed-in user:** `startSettingsListener`, `startIngredientsListener`, `startFamiliesListener`, `startStoresListener`, `startProductsListener`, `startRecipesListener`, `startSourcesListener`, `startShoppingListener`, `startIdeasListener`, `startMealsListener` — `onSnapshot` of the kitchen document and each collection under `kitchens/{uid}`. One effect keyed on `uid`.
2. **Visible window:** `startPlannedMealsListener(uid, windowKey, onChange)` — `onSnapshot` of `plannedMeals` where `date >= windowStart` and `date < windowEnd`, a single-field range covering the window's centre month (`shownMonth`) plus `MONTH_WINDOW_PADDING` (2) months on each side. The effect is keyed on that month (`"2026-10"`). `CalendarScreen` moves the centre only when the view being shown reaches past the window (`isRangeInWindow`), so month paging restarts the listener about every second page and week or day paging seldom does. The slice keeps the previous window's documents until the new snapshot lands, so the grid never blanks while paging.

**Loading gate.** `Pinch.tsx` shows a skeleton until every user-tier slice `isLoaded` and the first window has landed. An empty kitchen (no settings document, no records) is a valid state that renders the empty Calendar; there is no first-run blocking modal. The settings listener is waited for but its failure never shows the error screen (the nudges simply stay open), since it only carries an enhancement, and the sources listener is the same: its first snapshot or error ends the gate (so the filter doesn't pop in after the list), and its error is left out of `selectPinchLoadError`. The shopping listener is left out of the gate as well as of the error (a screen that needs it shows nothing until it lands), and its error is logged and clears its items. The ideas listener is the same: it is left out of the gate and of the error, the Ideas list shows nothing until it lands, and its error is logged and clears its items.

**Actions (thunks)** in `store/actions/`, writing only to the person's own paths:

| Action | Write |
|---|---|
| `saveSettings(fields)` / `dismissNudge({ keys })` | field-scoped writes with dotted paths (`showNutrition.protein`, `dismissedNudges.<key>`, built with `FieldPath` because keys hold `:` and `-`); `dismissNudge` is one `runTransaction` that re-reads the document, refuses a 501st key and creates the document on first write |
| `saveIngredient(draft)` | `setDoc` of the record (custom: new id; catalog: id = catalog id) with the full shape; edits are field-scoped `updateDoc` |
| `removeIngredient(id)` | the archive-or-delete check (Logic §3a) |
| `saveFamily` | `setDoc` (no delete in the MVP, so no family is ever archived) |
| `saveStore(draft)` | `setDoc` to create, field-scoped `updateDoc` to edit; a catalog store is created lazily by `ensureCatalogStore(catalogStoreId)` (create-if-absent inside a `runTransaction`, so a double tap makes one); an uploaded image goes to Storage first, then `imagePath` is written |
| `removeStore(id)` | archive when any product points at it, else delete + delete the image |
| `saveProduct(draft)` | one `writeBatch`: the product document and, when it's the ingredient's first live product or "Make this the default" was chosen, the record's `defaultProductId` (an upsert for a catalog ingredient with no record); also clears the matching `dismissedNudges` keys; preceded by `freezePastMeals` |
| `removeProduct(id)` | delete; re-points `defaultProductId` to another live product or `null` in the same batch |
| `setDefaultProduct(ingredientId, productId)` | field-scoped `updateDoc` of the record's `defaultProductId` (a transaction confirms the product still exists, so a stale device can't leave it dangling) |
| `saveRecipe(draft)` | `setDoc`/field-scoped `updateDoc` of what the form owns (never the whole cached object); new custom ingredients from an AI draft are created in the same `writeBatch`; a cover goes to Storage first; preceded by `freezePastMeals` |
| `removeRecipe(id)` | the archive-or-delete check, preceded by `freezePastMeals` |
| `createSource({ label })` | `setDoc` of a new source (the Sources screen's "+ New source"), or the id of the loaded source with the same label (ignoring case) without a write; returns the id. The recipe form doesn't use it: a typed source is part of the recipe's own batch |
| `renameSource({ id, label })` | field-scoped `updateDoc` of `label` and `updatedAt`; refuses a label another loaded source has ("You already have a source called …") |
| `removeSource(id)` | `writeBatch` (400 writes each) of the source's delete and `sourceId: null` on every loaded recipe that names it |
| `addToShoppingList({ lines })` | one `runTransaction` that reads every target item first, then creates, adds to or restarts each (§5b); at most 200 distinct lines; returns how many it wrote |
| `setShoppingItemChecked` / `updateShoppingItem` / `removeShoppingItem` | field-scoped `updateDoc` of `isChecked` or `amount`, a transaction that moves the item when its unit changes, and `deleteDoc` |
| `clearCheckedShoppingItems()` | takes the checked ids from the store, then one `runTransaction` per chunk of 250 that re-reads each item and deletes only those still checked; returns the count really deleted (chunks are independent, so not atomic together) |
| `createIdea({ draft })` | refuses while the ideas listener hasn't landed or has failed, then checks the title, note, link (http(s), at most 2,000 characters, not already saved), the 200-idea cap and that a photo idea has a picture, then uploads a photo first (resized to webp; a file the browser couldn't decode is refused with "That picture couldn't be read. Try a JPG, PNG or WebP photo.") and `setDoc`s the idea with every key (a photo is deleted again if the write fails); an empty title on a link becomes the host; `siteName` is the page's or the host; `imageUrl` is kept only if it is https; returns the id |
| `updateIdea({ id, title, note, url, photoFile })` | field-scoped `updateDoc` of `title`, `note`, `updatedAt`, a changed link's `url`, `siteName` and `imageUrl: null`, a replaced photo's `photoPath`, and the keys an older document lacks |
| `removeIdea(id)` | `deleteDoc`, then the photo object (best effort); the recipe an idea became is not touched |
| `saveRecipe(draft)` with `fromIdeaId` | the recipe's own batch commits first and unchanged; then, if the idea is still in the loaded store, a separate field-scoped `updateDoc` of `{ …missing keys, recipeId, updatedAt }` on the idea, whose failure is logged and never thrown; returns `{ recipeId, linkedIdea }` |
| `saveMeal(draft)` / `removeMeal(id)` | `setDoc`/`updateDoc`; meals are referenced only by `sourceMealId` (never read for display), so a meal is always deletable |
| `planMeal({ date, mealType, items, name, sourceMealId })` | `setDoc` of a new planned meal with `refIds` derived; a past date is frozen in the same write |
| `updatePlannedMeal(id, fields)` | a `runTransaction` that re-reads the meal, refuses a frozen one, then updates what the builder owns (`date`, `mealType`, `items`, `refIds`, `updatedAt`) |
| `removePlannedMeal(id)` | `deleteDoc` after `useActionModal().confirm({ destructive: true })` |
| `savePlannedAsMeal(plannedId, name)` | `setDoc` of a new meal from the planned meal's items; reads the planned meal from the store at tap time |
| `freezePastMeals()` | field-scoped `snapshot` writes for the loaded, unfrozen past meals: one `writeBatch` per 100, falling back to one `updateDoc` per meal when a batch is refused |

No cached document is ever written back whole. There is no cross-person concurrency; the create-if-absent cases above and the shopping list's add and unit change (two devices of one person can add at once) are the only transactions.

**Selectors** (`store/selectors.ts`): `createSelector` for everything that builds a new array or object, so no `useAppSelector` returns a fresh reference without `shallowEqual`.

- `selectIngredientsById` — catalog merged with records (a `Map`), memoized on the records
- `selectIngredientFamilies` — grouped list for Kitchen (Yours / All), archived hidden
- `selectDefaultProducts` — `Map<ingredientId, Product>`
- `selectRecipeCosts` — `Map<recipeId, RecipeCost>` computed once per change of recipes, products or ingredients
- `selectPlannedByDay` — `Map<dayKey, PlannedMeal[]>` read by the Calendar's `renderCell` and the day drawer, so a cell never filters the list
- `selectPeriodStats(state, startKey, endKey)` — one pass over the planned meals of the shown month, week or day (`getPeriodStats(range)`): spend, average per meal, what it leaves out, and the totals by day and by meal type that the breakdown reads (there is no separate day-totals selector)
- `selectSources`, `selectSourcesById`, `selectSourceCounts` — the sources A to Z, a `Map` of them, and the listed recipes counted per source (and without one) in one pass; the Recipes filter, the Sources list and a source's delete confirm read the counts
- `selectShoppingItems`, `selectShoppingById`, `selectShoppingOpenCount`, `selectShoppingRows`, `selectShoppingCost` — the items, a `Map` of them, how many are left (the Shopping tab's badge), the groups and "Got it" rows in one pass, and the approximate cost of what is left with what it leaves out
- `selectIdeas`, `selectIdeasById`, `selectIdeaGroups` — the ideas newest first, a `Map` of them, and `{ toTry, made }` (made = its `recipeId` names a listed recipe; built with two filters over the ideas)
- `selectUsedIngredientIds` — the ingredients a recipe, a saved meal or an unfrozen planned day uses; Kitchen's "Yours", "Needs a price" and the "No price yet" notes read it
- `selectGaps(scope)` — scope-parameterized via a small factory; takes `showNutrition` and `dismissedNudges`
- Time-dependent selectors take `todayKey` as an argument (`useNow()` supplies it in the component)

**Tabs.** `PINCH_TABS` is `calendar`, `recipes`, `kitchen`, `shopping`, chosen by `?tab=` (Calendar, the default, has no parameter, so a reload or a deep link keeps the tab) and switched through a transition in `Pinch.tsx`, which mounts only the active tab's screen. `PinchNav` is a floating pill at the bottom of a phone, as wide as its four tabs (never stretched; below `sm` each tab is `min-w-16` with 10px of side padding so it fits 320px), and a rail on the left from `lg` up. The Shopping tab carries the count left to buy as a small `bg-primary` badge on its icon, capped at "99+", read by `ShoppingTabBadge` through its own selector so the nav, Kitchen and Calendar never re-render for a tick.

**Overlay coordination.** The orchestrator owns one discriminated-union state: `subview: null | PinchSubview` (`{ kind: 'stores' } | { kind: 'products' } | { kind: 'sources' } | { kind: 'recipe'; id; method?; fromDrawer?; fromIdeaId? } | { kind: 'plan'; ... } | { kind: 'meal'; id }`, where `method` is the way a new recipe already chose on a phone, `fromDrawer` says it was picked in the phone's start drawer, and `fromIdeaId` is the idea a new recipe is being made from), exposed through a small context (`usePinchOverlay`) so a full-page screen can never open on top of another. The context also carries `showShoppingTab`, which the add toast's "View" calls (it switches to the Shopping tab only while no subview is open, so it never replaces a form holding typed work), and `isStartOpen` / `setIsStartOpen` for the phone's recipe start drawer, which `Pinch.tsx` renders once so that Recipes, Calendar and a way's back button can all raise it. The other drawers and sheets (day, planned meal, recipe, meal, ingredient, breakdown, settings, fill-in) are opened from the screen that owns them. The recipe form's own editors (the title, prep and cook and description drawers of `SummaryEditor`, and on a phone the ingredient, step and nutrition drawers, one level deep) are the drawers allowed over a subview, and so is a `HelpTip`'s small modal, which is how the meal builder's cost warning opens on a phone or any touch screen. A drawer's action that opens a form closes the drawer first; the in-place "swap" screens (planned meal, save-as-meal) are components inside the drawer, not new overlays.

---

## Component Encapsulation

- **Screens read the store; presentation components take props.** `CalendarScreen`, `RecipesScreen` and `KitchenScreen` use `useAppSelector`; rows, cells and badges are pure.
- **App-aware pieces stay in the app** (`DayCell`, `MonthView`, `WeekView`, `DayView`, `MealChip`, `StatsRow`, `StoreLogo`, `GapNudge`, `CostLine`, `RecipeStart` (and its phone drawer), `RecipeReader`, `RecipeBasics`, `RecipeIngredients`, `RecipeSteps`, `NutritionReview`, `MealBuilder`, `ListViewControls` with `useListViewOptions`, and the idea pieces `IdeasView`, `IdeaRow`, `IdeaThumbnail`, `IdeaDrawer`, `IdeaFormSheet`, `IdeaAddSheet`, `IdeaWays` and `IdeaNoteField`); anything whose props mention no kitchen entity comes from `src/components`, `src/hooks` or Dreamer UI: `SearchInput`, `PillGroup`, `PickOrCreate`, `SectionDivider`, `MoneyInput`, `FormSheet`, `Subview`, `CopyButton`, and the ones added with the redesign: `MacroStats` (with `src/utils/macroUtils.ts`), `HelpTip` (`variant='warning'`), `MethodPicker`, `FormSection`, `forms/Field`, `Stepper`, `FilterBar`, `PeriodSwitcher`, `ViewOptions`, `useLocalStorageState`, `SummaryEditor`, `UndoSnackbar` and `useUndoRemoval`.
- **Shared pieces and their rules.** `MethodPicker` is rows only: every `Method` carries its own `onPick`, and what happens next (a screen, a drawer closing) is the caller's. `Field` wraps its control in a native `<label>`, so a `Select` is not put inside one; `isCompact` gives it small captions for a grid of short fields, and `COMPACT_INPUT_CLASS` makes the input 40 px with a smaller placeholder while typed text stays 16 px so iOS doesn't zoom on focus. `ViewOptions` is the eye button (a drawer on a phone with Done in its footer, and Reset beside it once an option differs from its default; a popover from `sm`), tinted while customized, over `ViewOptionSwitch` rows (Pinch's `ListViewControls` shows its macros switch off and disabled, with a line saying how to turn them on, while no metric is switched on); `useLocalStorageState(key, default, parse)` is a `useSyncExternalStore` read of one `localStorage` key shared by every component using it, with a memory copy that is read first (so a write shows at once even when storage refuses it) and dropped when another tab changes the key (the `storage` event), and `parse` rejecting a stored value of the wrong shape. `SummaryEditor` is one form field as a summary row (caption, one or two lines of value, a chevron, a red problem line) that opens its editor: a `Drawer` over the form below `sm` or on a screen under 600px tall (so a phone held sideways never gets a popover that runs off the bottom), a `Popover` under the row from `sm` up (the row is stretched over the popover's inline-block wrapper, the popover is open-state-only content), each with a full-width Done; the editor's first field is focused after a short timer (350 ms for a drawer, which takes focus while it slides in, 30 ms for the popover, which focuses its own container first), and Enter in a one-line field closes the editor and is swallowed so it never submits the surrounding form. An open `Popover` is a `[role=dialog]`, so `Subview`'s Escape handler and `useSubviewHistory`'s back-gesture handler both leave the form alone while one is open, and the gesture is re-sent to the popover as an Escape. `useUndoRemoval` + `UndoSnackbar` are the removal's undo: `showUndo(message, restore)` keeps one pending removal (a newer call replaces it), counts down from 6 by a deadline (so a throttled tab doesn't stretch it), and `restore` reads the latest rows through a ref because the form's value can change before Undo is pressed; `UndoSnackbar` is always mounted (a persistent `role=status` region says the message once, without the countdown) and draws a fixed bar that measures the nearest visible `.form-footer` and sits 12px above it, or 1rem from the bottom when there is none (it re-measures when the footer resizes). `PillGroup` never reorders what is visible: a chosen option that was hidden behind "Show all" takes the last visible slot, and the fully open list is in its original order; a pick-one group shows no "1 selected" count, a pick-several group still does. `FilterBar`'s apply button on a phone reads `doneLabel` ("Show 12 ingredients") and, at 360px and under, the optional `compactDoneLabel` ("Show 12"). `AddFieldChips` are at least 36px tall (`min-h-9`) and a long label wraps instead of clipping.
- **`Subview` and the back gesture.** `Subview`'s optional `onBack` is what the header's back button, an overlay subview's Escape and the browser's or phone's back gesture all call (`onBack ?? onClose`), so stepping back inside the subview, or asking before leaving, is one function (`useSubviewHistory(onClose, onBack)` keeps the subview's own history entry for the gesture; the header's back button is labelled "Back"). Escape is captured and ignored while a drawer or modal other than the subview's own layer is open (`hasDialogOnTop`, `src/utils/dialogUtils.ts`), and the gesture while one is open puts the history entry back and sends that dialog an Escape, so the drawer closes first and the subview stays.
- **`parseMoneyToCents`, `formatCents` and `centsToInputValue` move to `src/utils/moneyUtils.ts`** in the first Pinch PR that needs them (A-List keeps them in `apps/a-list/utils/money.ts` today); A-List's imports are updated in the same PR, per the "a second mini-app needs it" rule.
- **A quantity/unit select is built once** as `UnitSelect` from `UNIT_LABELS`; the ingredient row, the product form and the fill-in sheet all use it (`triggerClassName` sizes its button where it sits beside a compact input).
- **The shopping sheets stay with their screen.** `AddToShoppingSheet` (a `FormSheet`) takes a `ShoppingRequest` (`{ kind: 'recipe', recipeId }` or `{ kind: 'items', items, label }`) and is mounted by `RecipesScreen` and `CalendarScreen`, which close the drawer before opening it; `AddToShoppingRow` is the drawers' tinted row. Its toast's "View" calls `showShoppingTab` from the overlay context, and `AppToast` renders an action button for any toast that gives one (and dismisses the toast when it is tapped). `showShoppingTab` switches to `?tab=shopping` through the same search-param transition the nav uses, but only when no subview is open at tap time (read through a ref the orchestrator keeps current, with the search taken from `window.location`, since the toast holds a function from an older render): a recipe form holding typed work is never replaced, and the tap then only dismisses the toast. A form sheet open over a tab is not checked. The list's row sheet and add sheet are `FormSheet`s opened from `ShoppingScreen` over the tab, and `ItemSearch` takes a `resultsClassName` so the add sheet caps its results and only the list scrolls, and `isDisabled` so a caller can lock the results while a write is in flight.
- **Ideas' shared pieces.** `PhotoPicker` gained `uploadLabel`, `changeLabel` and an optional `onRemove` (no `onRemove`, no Remove button) so a photo that is required can say "Replace photo"; `src/lib/pageContent`'s `fetchPageContent` and `pageContentQueryOptions` take an optional `{ timeoutMs }` that sets the callable's timeout and isn't part of the query key; and the link helpers `toWebLink`, `getWebLinkHost` and `getComparableUrl` are in `src/utils/urlUtils.ts`, none of them knowing about ideas (`utils/ideas.ts` in the app holds the idea-shaped ones: `findIdeaByUrl`, `toIdeaUrl`, `toIdeaImageUrl`, `getIdeaDetail`). All are covered by `npm run check:pinch-math`.
- **Closed means unmounted:** drawers' heavy bodies (the recipe drawer's step list, the breakdown rows, the store list) render only while open.

## UI Component Conventions Applied

- Forms: `FormSheet` for the ingredient, product, store and settings forms and for the recipe ideas' add sheet (the list of ways, then a way's own view in its place) and edit sheet; `Subview` for the recipe form (behind the start list and the reading screens) and meal builder (`MealBuilder` renders its own `Subview`; `MealSubview` and `PlanMealSubview` are thin wrappers) and the stores, products and sources lists (the shopping list is a tab, not a subview); the source form and the shopping list's row and add sheets are `FormSheet`s (a drawer on a phone, a modal from `sm`); `DetailSheet` for day, planned meal, recipe, meal and ingredient details; `ModalFooterActions` with Cancel left, a `DeleteIconButton` beside it on edit, the primary alone on the right.
- Titles are plain nouns ("Recipe", "Product", "Store", "Meal", "Settings"); the verb is on the primary button and the destructive confirm.
- `PickOrCreate` for family, store and a recipe's source (its optional `maxLength` caps the typed label at 80, and `isFocusedOnOpen={false}` keeps the field from taking focus when the form opens with it filled in); `PillGroup` for meal type, "Start from a saved meal", the Month / Week / Day switch and the Recipes / Meals / Ideas and Yours / All switches (`isThin`); `FilterBar` for the Kitchen ingredient and Products filters (its `trailing` slot carries the View options button; Kitchen always has it, and Recipes uses `FilterBar` only while some recipe has a source, with the same button in `trailing`, and otherwise puts the button beside its Recipes / Meals pills while the shown list has something in it); `FormSection` and `Field` lay out the recipe form, whose sections are all visible (no "+ Add X" chips) and whose row editors are drawers on a phone and in place from `sm`; `AppToggle` for the four nutrition switches and the View options switches; `SuggestionChips` is not used.
- Help and warning icons are `HelpTip`, and the `noModal` prop no longer exists: on a phone (below `sm`) or on any touch screen, whatever its width (`(hover: hover) and (pointer: fine)` doesn't match), the icon always opens a small modal ("Got it", with a hairline border); with a mouse from `sm` up it is a tooltip rendered in a portal on `document.body`, which `HelpTip` places itself (its `placement` side, flipped when that side has no room, clamped to the viewport, the arrow aligned with the icon) and measures again for about 24 animation frames after it opens, so a drawer still sliding in doesn't leave it misplaced. The tooltip opens on mouse hover (pointer events, mouse only) and on keyboard focus (`:focus-visible`, so not for a dialog's initial focus) and closes on leave and blur; a click opens it and keeps it open instead of toggling. Escape closes a tooltip without stopping the event, so a drawer under it still gets it; a modal's Escape is captured so only the modal closes. A `linkLabel` opens the modal at every size.
- Recipes' Source filter is one pick-one `PillGroup` in a `FilterBar` (a drawer on a phone, a popover from `sm`): the pills are the sources some listed recipe has, with their counts, plus "Any" and, when needed, "No source · n"; the chip reads "From {label}" (or "No source"); an empty result offers "Clear filter". The Sources entry is Kitchen's `EntryRow`, moved to `components/shared/EntryRow.tsx` for both screens, and shows only while at least one source exists.
- Kitchen's price filters read `defaultProducts` and `usedIds` (`applyIngredientFilters`): "Needs a price" is used by something and has no default product, "Has a price" has one, so both only ever match Yours even with All picked. The filter panel says so, the count beside "Ingredients" is "N of M" with M counting Yours while a price filter is on, and the empty state offers "Look through everything" only when All would find something.
- Rows are top-aligned (`items-start`): `RecipeRow`, `MealRow`, the calendar's `MealRow` and the Stores rows put the image or tile's top edge level with the title's and keep the chevron on the first line; `IngredientRow` and the Products rows do the same with the chevron and, on Products, the price.
- A `StatTile` with a help icon keeps `pr-6` clear of it on a phone (the icon sits in the tile's corner), and the stats row's `FittedValue` steps a number of 7 or more characters down a size below `sm` and one of 6 or more to `text-xs` at 360px and under, so a long total stays clear of the icon.
- The recipe step drawer focuses its text box about 350 ms after it opens, once the drawer has finished sliding in, rather than with `autoFocus`.
- Lists search from `LIST_SEARCH_THRESHOLD` rows; Kitchen groups by family with `SectionDivider` and mounts a family group only near the viewport (`LazyMount`); the shopping tab does the same with its groups after the first three.
- Images from URLs (a recipe cover, a store logo) are `FallbackImage` with a themed fallback (a tinted emoji tile, a letter tile).
- Delete confirmations go through `useActionModal().confirm` with `destructive: true` and say what archiving means when something is in use.

## Theming

- `src/apps/pinch/pinch.css` overrides Dreamer UI's semantic tokens on `html.pinch-theme`: paper-cream (warm black in dark) surfaces with hairline borders, an espresso-ink `--color-primary` for the one filled action, see-through secondary buttons, peach tints (`--color-accent`, `--pinch-drizzle-soft`) for chips, groups and the selected pill, and warm orange (`--pinch-drizzle`) as the accent (today dot, selected outline, active tab, the default product's star); `--radius-md` and up raised for a rounded counter feel; field text inset; hairline option pills that take a peach tint and a drizzle outline when selected; tertiary buttons use the normal text colour. `usePinchTheme()` adds the class to `<html>` only while the app is mounted.
- Meal-type colours are tokens, not raw palette classes (`--pinch-meal-breakfast … --pinch-meal-drink`, each with a `-soft` tint for the calendar's chips and pills), checked on a chip and a pill in light and dark.
- The Pinch rules file is written in the same PR as the shell: `.github/instructions/pinch.instructions.md` with an identical `.claude/rules/pinch.md` (metaphor: a warm kitchen; palette roles; shape language; what the emoji mean; calendar chip and pill anatomy; nudge wording; missing details appear only as in-context nudge lines).

---

## Security & Privacy Requirements

- **Private by construction.** A person's kitchen is readable and writable only by them. There is no admin read; Security Rules Design Criteria #1–2 are the whole access model. Nothing in the MVP is shared or public.
- **What leaves the app, and where it goes.** (1) Pasted text or a chosen file (a photo, screenshot or PDF) goes to Firebase AI (Gemini) to be read into a recipe draft; the provider sees the content, not the person's identity beyond Firebase's own request metadata, and the screen says an AI reads it and that it isn't saved. (2) A recipe link goes to our `fetchPageContent` function, which fetches the page from Google's servers (signed-in only, http/https only, private networks refused) and returns only what Pinch asks for (the page's text, its title and meta description, and any Recipe data) without storing anything; the client then sends that content, not the link, to the AI reader. (3) Store logos are requested by the person's browser from the logo service by domain only (well-known stores only); a person's own stores never leave Storage. (4) A recipe idea's link goes to the same `fetchPageContent`, asking for the page's `meta` only (its title, site name and picture address); nothing is read by an AI model, and what is stored from the answer is those three. When the idea is shown, the person's browser requests its picture address from that website (through `FallbackImage`, with no referrer). Nothing else leaves: there is no copy-out of recipes, plans, ingredient lists, ideas or the shopping list.
- **The logo service's key is a publishable browser token**, domain-restricted at the provider, kept in an env var (`VITE_STORE_LOGO_TOKEN`) and sent only in the logo request's URL. It is not a secret and is not a Functions secret; if the chosen provider needs a secret, the logo route moves behind an `onCall` instead.
- **Stored data minimization.** No location, no payment details, no card data, no receipt images are stored. A product stores store, price, size and an optional link; a recipe stores what the person typed or reviewed, and a source is only a label they typed.
- **Persistence on the device.** Nothing from the person's own documents is persisted beyond Firestore's own cache. No TanStack query in the MVP carries `meta: { persist: true }`; the catalog is code, not a query. The one thing Pinch writes to the browser itself is each list's View options, as small JSON in `localStorage` under `pinch:{uid}:view:{recipes|ingredients}` (Recipes and Meals share the first): three display choices and no kitchen data; the key carries the uid, so someone else signing in on the same browser doesn't read it, and nothing clears it on sign-out.
- **Links are https-only** and shown with `ExternalLinkText`. An idea's link may be http (a page that has no https version still opens) but only http(s), never `javascript:` or `data:` (the field, `createIdea` and the rules all check), and it opens in a new tab with `rel='noopener noreferrer'`; its picture address must be https, in the client and in the rules, and only `FallbackImage` ever loads it.
- **What a recipe idea stores, field by field.** `title`, `note` (the person's own words, shown only to them), `kind`, `url` (the link they pasted, without sign-in details), `siteName`, `imageUrl` and the page's title when the person kept it, `photoPath` (their own picture in their own Storage folder), `recipeId` and the two times. No location, no author, no page text or description. Nothing about an idea is shared, public or copied out.
- **Rules are verified against the emulator, not by the UI hiding a control:** the owner allowed and a second signed-in user denied on every path (kitchen document and all ten collections, plus Storage), signed-out denied; and one denied write per integrity rule (snapshot overwrite, `priceCents` negative, `sizeAmount` 0, an unknown `unit`, a `date` that isn't UTC midnight, a 61st recipe ingredient, an `http://` link).
- **Terms and licences are a gate, not a footnote:** the USDA FoodData Central licence (catalog nutrition) and the logo service's terms and attribution are each confirmed in the PR that ships the thing that uses them, with the logo credit in an About row in Settings. Pinch vendors no other third-party asset since the ingredient icons were removed.

---

## Performance

- **Scale fixture.** `npm run seed:pinch-scale` (`scripts/seeds/pinchScale.ts`, opt-in) fills Taylor's kitchen: 300 custom ingredients across 40 families, 150 products across 12 stores, 200 recipes of 3–8 ingredients (about seven in eight with one of 12 sources, one of them with a 73-character label, the first holding the most), 60 saved meals, about 1,100 planned meals from 45 days back to 45 days ahead (12 a day), a shopping list of 80 items across 25 families (every fifth one checked off) and 80 recipe ideas (two links in three, a third of the links with a picture address that can't load offline, every seventh title over 100 characters, every ninth with a long note, every tenth already made into a recipe). Every list or per-row feature is opened on it at phone width (390×844) with the dev build throttled 4× (CDP `Emulation.setCPUThrottlingRate`), switching Calendar ↔ Recipes ↔ Kitchen. The numbers from the last pass are in the PR that added it.
- **Never freeze the same meal twice, and freeze in batches.** The load-time freeze of ~540 past meals took the page down twice over: a write per meal raised one snapshot event each, and the list of unfrozen meals shrinking after each event started another freeze of the rest (quadratic writes, most of them refused by the write-once rule). It is now one batch per 100 meals (one event each), each meal is submitted once per visit (`useFreezePastDays`), and a refused batch falls back to a write per meal.
- **One pass, then lookups.** `selectRecipeCosts`, `selectPeriodStats` and `selectSourceCounts` compute in one walk and are memoized; no cell, row or drawer recomputes a recipe's cost. The Calendar's `renderCell` reads `selectPlannedByDay` only.
- **Build once.** The currency `Intl.NumberFormat` and the catalog lookup maps are module-level; the search index is built on first use.
- **Cap what's drawn.** A row is as tall as its lines (no `min-h` under a lone title), so the height estimates follow the lines: `FamilyGroup` adds up 20px for the divider plus 45px per ingredient (44 plus its rule) and 16px for each of the price and nutrition lines that will show, and the recipe list adds a price and a macro line to its cover-sized rows; both are within about 1% of what is measured at 390px. Kitchen mounts a family group near the viewport and the recipe list mounts twenty rows at a time (`LazyMount`); recipe and ingredient pickers show the top matches; the breakdown caps at one month of rows. A calendar cell builds a hover popover only on a computer, and the card's content only while it is open; a phone's cell is just its chips. A week's agenda shows six rows a day then "Show N more", and Products caps its rows at 60 with "Show 60 more". The `LazyMount` height estimates follow the View options (a row with its price or macro line hidden is shorter).
- **What is not ours.** A cold first load of the fixture (about 1,900 documents) spends most of its time inside the Firestore SDK ingesting them into its local cache, and so does paging far enough to move the planned-meals window (the listener restarts). Both are measured in the PR and left alone; later visits read the persistent cache.
- **Keep the tap instant.** Each tab renders in a transition and is wrapped in `memo`; the day and recipe drawers read from the store at open, not from their parents.
- **The shopping list at scale.** Groups are built in one pass by a selector, a row is a `memo` component with plain-value props and a group is a `memo` component with a comparison over its rows' ids, names, amounts, units and checked flags, so a tick re-renders the group the row left and its own row and not the other groups, groups after the first three mount near the viewport, and a group draws 100 rows. The count left to buy is read by the tab's badge and by the Shopping screen only, through their own selectors, so Calendar, Recipes and Kitchen never subscribe to a tick (a tab mounts only while it is the active one). The sheets that add a recipe's or a day's lines are measured with the fixture's busiest day (77 lines): one scrolling list, the header and footer fixed. Checked on the fixture at 390×844 with the dev build at 4× CPU: opening the list, a tick, opening the add sheet from a recipe and from a busy day, and the three tab switches; the numbers are in the PR.
- **A tick was slow, and why.** Measured on a kitchen with 300 ingredients, 150 products and an 80-item list (16 ticked) at 390×844 with the dev build at 4× CPU, click event to the next painted frame: a tick took a median of about 595 ms over 24 ticks (435 to 785 ms) while the list was a subview. A count of component renders per tick (a stub React DevTools hook that tallies the fibers that rendered) found 294 to 319: Kitchen re-rendered with its 40 family groups because it read the open count and stays mounted under a subview, and every shopping group re-rendered because the selector builds new group objects on each snapshot, so `memo` on the group never held. The fixes: the count lives in the tab's badge and the list screen only, the list is a tab (so nothing else is mounted while it is open), and a group compares its rows. Now a tick renders 24 to 51 components and takes a median of about 150 ms (87 to 240 ms, 8 ticks). Switching into the Shopping tab takes 360 to 700 ms at 4× and back to Kitchen 660 to 900 ms, which is mounting the 300-ingredient Kitchen and was not changed here.
- **Recipe ideas at scale.** The list draws rows in chunks of twenty that mount near the viewport (`LazyMount` with `defer-offscreen`; the first chunk is eager), a row is as tall as its lines, and each row's picture is a lazy `FallbackImage` (a photo idea adds one cached download-URL query), so 80 ideas mount 20 rows at first and the rest as they are scrolled to (checked on the fixture: 20 at first, all 80 reachable, 8 under "Made into recipes"). Measured on the fixture at 390×844 with the dev build at 4× CPU, loaded unthrottled and throttled only after the page had rendered, median of 5 rounds: the Ideas pill 317 ms until its first rows are drawn, "New idea" 267 ms until the list of ways shows, tapping an idea 204 ms until its drawer shows, back to the Recipes pill 482 ms. The three tab switches, median of 7 rounds each against the same data: Recipes to Kitchen 866 ms (base 922), Kitchen to Calendar 568 ms (base 588), Calendar to Recipes 607 ms (base 661), so they are unchanged within the noise of the throttled run (single rounds reach 1.0 to 1.5 s on the base too). No "Maximum update depth" or render storm in the console.

---

## Component & File Architecture

```
src/apps/pinch/
├── Pinch.tsx                       # sole orchestrator
├── README.md  UX.md  TECHNICAL.md  ISSUES.md
├── constants.ts  types.ts  pinch.css
├── catalog/
│   ├── index.ts  catalogIngredients.ts  catalogFamilies.ts  catalogStores.ts
├── hooks/
│   ├── usePinchSync.ts  usePinchTheme.ts  usePinchOverlay.ts  useFreezePastDays.ts  useStorageImageUrl.ts  useIdeaImageUrl.ts
│   └── useListViewOptions.ts       # a list's View options, per person, over useLocalStorageState
├── lib/
│   └── extractRecipe.ts            # text, file and page readers, response schema, error mapping
├── queries/
│   └── storageImageQueries.ts  recipePageQueries.ts  ideaPageQueries.ts   # recipePageQueries: text, meta and Recipe data of a page; ideaPageQueries: a page's meta only
├── store/
│   ├── index.ts  selectors.ts
│   ├── slices/     settingsSlice.ts  ingredientsSlice.ts  familiesSlice.ts  storesSlice.ts
│   │               productsSlice.ts  recipesSlice.ts  sourcesSlice.ts  shoppingSlice.ts  ideasSlice.ts  mealsSlice.ts  plannedMealsSlice.ts
│   ├── actions/    settingsActions.ts  ingredientActions.ts  storeActions.ts  productActions.ts
│   │               recipeActions.ts  sourceActions.ts  shoppingActions.ts  ideaActions.ts  mealActions.ts  plannedMealActions.ts
│   │               freezeActions.ts  usageActions.ts
│   └── listeners/  kitchenListeners.ts
├── utils/
│   ├── quantity.ts  unitCost.ts  recipeMath.ts  mealMath.ts  nutritionMath.ts  nutrition.ts
│   ├── dayKeys.ts  stats.ts  gaps.ts  references.ts  resolveIngredient.ts  ingredientRecord.ts
│   ├── ingredientMatch.ts  catalogSearch.ts  normalizeRecipe.ts  storeLogo.ts  nutritionBasis.ts
│   └── mealFormat.ts  recipeFormat.ts  productFormat.ts  sources.ts  shopping.ts  ideas.ts
└── components/
    ├── shell/       PinchNav.tsx  ShoppingTabBadge.tsx  LoadingSkeleton.tsx
    ├── calendar/    CalendarScreen.tsx  MonthView.tsx  WeekView.tsx  DayView.tsx  DayCell.tsx
    │                MealRow.tsx  MealChip.tsx  StatsRow.tsx  DayDrawer.tsx  DayPeek.tsx
    │                PlannedMealView.tsx  BreakdownDrawer.tsx
    ├── plan/        PlanMealSubview.tsx  MealBuilder.tsx  ItemSearch.tsx
    ├── recipes/     RecipesScreen.tsx  RecipeRow.tsx  RecipeSubview.tsx  RecipeStart.tsx  RecipeReader.tsx
    │                RecipeForm.tsx  RecipeBasics.tsx  recipeFormModel.ts  RecipeIngredients.tsx  RecipeSteps.tsx  NutritionReview.tsx
    │                RecipeDrawer.tsx  MealRow.tsx  MealDrawer.tsx  MealSubview.tsx
    │                SourcesSubview.tsx  SourceFormSheet.tsx
    ├── kitchen/     KitchenScreen.tsx  ingredientFilters.ts  IngredientRow.tsx  FamilyGroup.tsx
    │                IngredientDrawer.tsx  IngredientFormSheet.tsx  ProductFormSheet.tsx
    │                StoresSubview.tsx  StoreFormSheet.tsx  StorePicker.tsx  ProductsSubview.tsx
    ├── shopping/    ShoppingScreen.tsx  ShoppingRow.tsx  ShoppingItemSheet.tsx  ShoppingAddSheet.tsx
    ├── ideas/       IdeasView.tsx  IdeaRow.tsx  IdeaThumbnail.tsx  IdeaDrawer.tsx  IdeaFormSheet.tsx
    │                IdeaAddSheet.tsx  IdeaWays.tsx  IdeaNoteField.tsx
    ├── settings/    SettingsSheet.tsx
    └── shared/      GapNudge.tsx  CostLine.tsx  FillInSheet.tsx  StoreLogo.tsx  CoverImage.tsx  UnitSelect.tsx
                     ListViewControls.tsx  EntryRow.tsx  AddToShoppingSheet.tsx  AddToShoppingRow.tsx

src/components/     MacroStats  MethodPicker  FormSection  forms/Field  Stepper  FilterBar  PeriodSwitcher  HelpTip  ViewOptions
src/hooks/useLocalStorageState.ts  useSubviewHistory.ts   src/utils/macroUtils.ts  dialogUtils.ts  urlUtils.ts (toWebLink, getWebLinkHost, getComparableUrl)   src/lib/pageContent/ (fetchPageContent.ts  pageContentQueries.ts)
functions/src/linkMetadata/fetchPageContent.ts  safeFetch.ts
scripts/seeds/pinch.ts  pinchScale.ts
scripts/catalog/buildCatalog.ts
scripts/checks/pinchMath.ts          # npm run check:pinch-math (cost, nutrition basis, shopping lines, grouping and cost, link reading and comparing, idea helpers)
```

No `functions/src/apps/pinch/`: the only function Pinch calls is the shared `fetchPageContent`.

**Wiring checklist** (everything a new mini-app has to touch; each item is in the roadmap):

- `src/lib/types/appCatalog.ts`: `'pinch'` in `AppId`. `src/lib/app/app.registry.ts`: a registry entry (`path: '/pinch'`).
- `src/routes/AppRoutes.tsx`: lazy route to `@apps/pinch/Pinch`.
- A logo and a banner under `public/logos` and `public/banners/by-app`, the entry in `cloudflare-worker.js`, and the root `README.md` "Current apps" list (the registry's own comment lists exactly these).
- `src/store/index.ts`: `pinch` reducer and `RootState`.
- `firestore.rules` and `storage.rules`: the blocks above in alphabetical position, with emulator verification noted in the PR; `firestore.indexes.json` unchanged (state this in the PR).
- `.github/instructions/pinch.instructions.md` and the identical `.claude/rules/pinch.md`.
- `scripts/seeds/pinch.ts` and `pinchScale.ts`, the `'pinch'` value in `SeedScope`, an `npm run seed:pinch` script, and the app's `firestoreDocuments` count.
- `SITE_VERSION` bumped (minor) in `src/lib/app/app.constants.ts` in each PR; `README.md`, `UX.md`, `TECHNICAL.md` current.

---

## Open questions for the roadmap

Each has a default the design already assumes; the owner can change any of them cheaply now and expensively later.

1. **Store logo source: Logo.dev is wired, its terms are still to be confirmed.** Logos load by domain in the person's browser behind `storeLogoUrl` (enabled only when `VITE_STORE_LOGO_TOKEN` is set, with a letter-tile fallback and `no-referrer`). Logo.dev's Community plan needs attribution for commercial projects and says logos remain their owners' trademarks; the plan's terms and the attribution wording were not verified from the sandbox. Gate before launch: read them, then keep or reword the attribution line already in Settings' About row, or leave the token unset. Fallback if it doesn't fit: letter tiles plus person-uploaded images only.
2. **USDA FoodData Central licence** is to be confirmed before the catalog ships (the page could not be read while planning). Defaults to FDC's public-domain/CC0 position; the generated catalog keeps a `source` note per row.
3. **Ingredient icons: removed, approach to be decided.** The vendored Twemoji set, `IngredientIcon` and the icon picker are gone, and `IngredientRecord.iconKey` stays in the type as `@deprecated` (existing documents may carry one; new writes null). Whatever returns (a licensed set, emoji per family, or nothing) will need its own notice if vendored.
4. **The calendar grid's first weekday: decided.** Dreamer UI's `Calendar` has no week-start option (its weekday header and `daysInView` are Sunday-first), so the month grid starts on Sunday, and the week view and `getWeekStartKey` start on Sunday to match it. Building a Monday-first grid by hand would give up the shared `Calendar`; it is cheap to revisit if the owner wants it.
5. **Freezing from first-load data.** A past meal is frozen from the data at the first load after its day, with a freeze-before-edit step. Prices changed while the app wasn't opened for a month or more can leak into meals that were never frozen. Alternative: a daily scheduled Function that freezes by UTC day (adds a Function, a secret-free deploy, and a time-zone approximation).
6. **"Average per meal" excludes meals with no priced item**, and "price per gram of protein" uses only meals where both are known. Both are my choices; the screens say what was left out.
7. **Pinch uses `kitchens/{uid}` private data only.** If "cook with someone" means a live shared kitchen (not a one-time copy of a plan), the shared data needs its own tree; the `kitchens` root makes that a read grant on this document for the first version but not a co-edited kitchen.
8. **`refIds` is a client-written index** the rules don't verify. A wrong value can only make a delete hard-delete something still in use; the single writer is the owner. The defence is the client derive-on-write and the emulator checks.
9. **No test runner exists in the repo.** The quantity bridge, cost and stats math are pure and the most valuable thing to test. Default: `npm run check:pinch-math` (`scripts/checks/pinchMath.ts`, plain `node:assert`) runs the cost worked examples above and the nutrition-basis conversions (per 28 g, per ounce, per serving, an unweighable serving), plus the timezone-pinned browser pass the repo already requires.
10. **Unit conversions beyond the catalog are Next Steps.** A custom ingredient has no density or per-piece weight in the MVP, so a recipe line in cups of a custom ingredient priced by the pound is left out and named, and its nutrition can be typed per gram or ounce but not per a serving that can't be weighed (a cup, "each"). The `gramsPerMl` and `gramsEach` fields are in the schema already so adding the UI later needs no migration.
11. **Ingredient serving sizes.** An ingredient item in a meal ("1 serving of Doritos") needs a serving size; the catalog supplies one and a custom ingredient defaults to 100 g until the person sets one. Doritos-style items need that field in the ingredient form's extras, where it also lets the label's nutrition be typed per serving.
12. **The AI text cap** (20,000 characters) and the 10 MB upload cap are reasonable limits set here, not provider limits.
13. **Reading a recipe from a link is unverified from the sandbox.** A real page fetch through `fetchPageContent` and the AI step over a page's recipe data had no outside network to run against; the contract (schema.org nodes in `structuredData`, capped `text`, the page's `meta`) is from the code and docs, so check a few real recipe sites before relying on it, including how well the model reads a page that publishes no Recipe data and only has text. The page reader itself was exercised on sample and hostile HTML, and the callable's validation and private-address refusals against the emulator.
14. **Recipe sources: a few things are unverified or accepted.** (a) A recipe read from a link starting on its site's source was checked in the browser with an injected reading and against the host-matching helper, but a real link reading (the page fetch and the AI step) had no outside network to run against. (b) A source's label is unique only as far as the loaded list: two devices adding the same label at once can leave two, which the person can rename or delete; making it strict would need the normalized label as the document id. (c) Deleting a source with more than 400 recipes commits several batches that are not atomic with one another; the source goes with the first, and any recipe left pointing at it reads as having none. (d) The rules and the client ship together: a client that writes `sourceId` against rules that haven't deployed is refused (`hasOnly`), so the rules go out first, as for every field added to a recipe.
15. **The shopping list: a few things are unverified or accepted.** (a) The cost line prices the amount on the list from each ingredient's default product, not whole packages, so it is lower than a till total; the line says "Amounts on your list", its help icon says that stores sell whole packages and the till total is usually more, and what it can't price is named with where to fix it. (b) 200 lines per add and 300 items on the list are limits of the action and the screens, not of the rules (§5b). (c) A change of unit is one transaction, but a unit that the same ingredient already has adds to it when it is open and restarts it when it is ticked, and the sheet says which before saving. (d) The rules and the client ship together: a client that writes a shopping item against rules that haven't deployed is refused, and the list then says it couldn't load; the preview build talks to the production backend, so it can't exercise the list until the rules are deployed (CI deploys them on merge). (e) Adding needs a connection because a transaction does not queue offline; this was reasoned from how Firestore transactions work and not tried on a device with the network off.
16. **Recipe ideas: a few things are unverified or accepted.** (a) A real page lookup had no outside network to run against. The success path was driven in the browser with the callable's answer stubbed (including a picture on an http address, 300-character titles and a response slower than the timeout), the failure path against the Functions emulator (which cannot reach a site), and the contract (`title` from the page's `<title>`, `meta.siteName` from `og:site_name`, `meta.image` from `og:image` or `twitter:image`) from reading `fetchPageContent`; check a few real recipe sites. A page's `<title>` often ends in the site's name ("Lemon bars | Serious Eats"); it is kept as it is and the person can change it. (b) A picture that only has an http address is not kept (the rules and the client want https). (c) Offline, a lookup fails and the idea saves with the host as its title, and the final `setDoc` queues. A Storage upload doesn't queue: it retries up to the SDK's limit and then fails with the "timed out, check your connection" sentence, and any other Storage error (permission, quota, an unknown code) gets its own plain sentence from `getStorageErrorMessage` and never says to check the connection. How long the upload retries offline is reasoned from the SDK, not verified. (d) The 200-idea cap is the action's and the screens', not the rules'. (e) A photo idea's picture is not copied to a recipe made from it, so that recipe has no cover; the idea keeps its photo. (f) Changing an idea's link doesn't look the new page up: the old picture is dropped and the site becomes the host. (g) The rules and the client ship together: a client that writes an idea against rules that haven't deployed is refused and the Ideas list says it couldn't load them; the preview build talks to the production backend, so it can't exercise ideas until the rules are deployed (CI deploys them on merge, and `storage.rules` carries the photo path). (h) The idea's link to its recipe is its own write after the recipe commits, so an idea deleted on another device a moment earlier costs only the link: the recipe saves, the toast is the plain "Recipe added", and the failed write is logged (§5c). The batch queued offline therefore never holds an idea document. If the idea was already gone from the loaded store the link is not even tried. (i) Photo objects can be left behind, and are accepted: when an idea is deleted offline its Storage delete is best effort and may not run, and when replacing a photo the object is overwritten before the document write, so a failed write leaves the new picture under the old document. Both are private to the person, at most 5 MB, one object per idea path, and nothing points at a stray one. (j) `toWebLink` picks the one link out of pasted text that has words around it, but a link with no scheme and spaces among other words ("Lemon bars example.com/x") is joined into one host, because a link wrapped over lines has the same shape; a link that starts with a scheme and wrapped over lines is cut at the first break. (k) One Escape closes a destructive confirm and the edit sheet under it together, as it does for every existing form sheet, and the browser's back gesture leaves Pinch while a drawer or sheet is open, as it does for every existing drawer.
