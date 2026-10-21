# Pinch — Technical Design Document

Built against this app's `README.md` and `UX.md`, and against the conventions in `.github/copilot-instructions.md` and `CLAUDE.md`. A-List's `TECHNICAL.md` is the format reference. Like A-List, **every byte of Pinch data is private to one signed-in person**, so there is no invite flow, no roles and no cross-user concurrency. The design weight sits on four things instead: a static ingredient catalog merged with the person's own records, the quantity and cost math, the calendar read model, and an AI reader that fills recipe forms.

## Decisions made in this document

These shape everything below. Each is also listed under [Open questions](#open-questions-for-the-roadmap) where it needs the owner's confirmation.

1. **The catalog is a bundled constant, not a Firestore collection.** About 200 everyday ingredients, their families, nutrition per 100 g, serving sizes and unit conversions ship in the app's own lazy chunk. A person's data refers to them by id (`cat-chicken-breast`). Nothing is copied into a person's account until they change or attach something to a catalog ingredient.
2. **A person's `ingredients` documents are records of what they did, not a copy of the catalog.** A document exists for a custom ingredient, or for a catalog ingredient the person adjusted (nutrition, serving) or attached a product to (the default-product pointer). The client merges catalog and record into one resolved `Ingredient` at read time.
3. **Three layers, one level of grouping.** `family → ingredient → product`. Families don't nest. Recipes and meals refer to an ingredient id only; products carry store, price and size.
4. **Money is integer cents.** Quantities are numbers in a typed unit. Nutrition is stored per 100 g on ingredients and as optional per-serving overrides on recipes.
5. **Planned meals are copies.** Planning a meal copies its items into a `plannedMeals` document that keeps `sourceMealId`. Editing a saved meal never touches planned days. Items point at recipes and ingredients by id, so a recipe edit reaches every upcoming day.
6. **Past days are frozen once.** A planned meal whose day has passed gets a write-once `snapshot` of its cost and nutrition. Edits to prices, recipes or nutrition first freeze any unfrozen past meals, so history doesn't drift.
7. **Anything in use is archived, never removed.** A recipe, ingredient, product or store that anything still points at gets `isArchived: true`. Whether a recipe or ingredient is used on a planned day is answered by one `array-contains` query on `plannedMeals.refIds`, so planned days outside the loaded month window are covered.
8. **Cost and nutrition are computed, never stored**, except the frozen snapshot of a past meal. Every derived number returns what it left out, so the UI can say so.
9. **Cost exists only for comparable amounts.** A recipe amount and a product size must share a dimension (mass, volume, count) or be bridged by a conversion the catalog or the person has supplied. Anything else is left out of totals and surfaced as a gap.
10. **Gaps are derived, not stored.** A "nudge" is a pure function of the data (a missing price, size, nutrition value or conversion on an ingredient that something uses). Only the person's dismissals are stored.
11. **Dates are date-only.** A planned meal's `date` is UTC midnight of the day picked (`fromDateInputValue`), shown with `formatDateUTC`, and keyed on the calendar by `toDateInputValue`. Weeks run Monday to Sunday.
12. **No Cloud Functions in the MVP.** The AI reader is the repo's shared client-side Firebase AI setup, store logos use a publishable browser token, and nothing needs a server secret. `functions/` and `functions/README.md` are untouched.
13. **Per-person data nests under `apps/pinch/kitchens/{uid}/…`.** A `kitchens` root (not `users/{uid}`) leaves room for a future shared kitchen to be a read grant on this document, not a data move.

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
apps/pinch/kitchens/{uid}/meals/{id}              → Meal
apps/pinch/kitchens/{uid}/plannedMeals/{id}       → PlannedMeal

Storage:
apps/pinch/kitchens/{uid}/recipes/{recipeId}/cover.webp
apps/pinch/kitchens/{uid}/stores/{storeId}/logo.webp
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
export type RecipeSource = 'MANUAL' | 'AI_TEXT' | 'AI_FILE';
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
export const WEEK_STARTS_ON = 1;                  // Monday
export const MAX_RECIPE_INGREDIENTS = 60;
export const MAX_RECIPE_STEPS = 60;
export const MAX_MEAL_ITEMS = 30;
export const MAX_PASTE_CHARS = 20_000;            // text the AI reader accepts
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // photo, screenshot or PDF
export const MAX_COPIED_INGREDIENTS = 500;
export const LIST_SEARCH_THRESHOLD = 8;           // a list gets a search from this many rows
export const MAX_DISMISSED_NUDGES = 500;
export const MONTH_WINDOW_PADDING = 1;            // months loaded on each side of the one shown
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
  iconKey: string | null;                       // null = matched from the name, falling back to the jar
  nutritionPer100g: NutritionValues | null;     // null = the catalog's values (or none, for custom)
  servingAmount: number | null;                 // what "1 serving" of this ingredient is (null = catalog / 100 g)
  servingUnit: Unit | null;
  gramsPerMl: number | null;                    // density, bridges mass <-> volume (user-supplied; editing UI is Next Steps)
  gramsEach: number | null;                     // weight of one, bridges mass <-> count (same)
  defaultProductId: string | null;
  isArchived: boolean;
  createdAt: number;                            // immutable
  updatedAt: number;
}
```

For a catalog ingredient the document id *is* the catalog id, so there is exactly one record per catalog ingredient and "upsert" is a plain `setDoc` with merge-free full shape on first write. For a custom ingredient the id is `generateUuid()`.

**Resolved ingredient (client-only, never stored).** `resolveIngredient(id)` = catalog entry (if `cat-`) overlaid by the record: `name`, `familyId`, `nutritionPer100g`, serving and conversions each fall back to the catalog when the record's field is `null`. An id with neither a catalog entry nor a record resolves to a placeholder `"Removed ingredient"` so a dangling reference can never crash a screen.

### 3. `Family` — `…/families/{id}`

```typescript
interface Family { id: string; name: string; isArchived: boolean; createdAt: number; updatedAt: number }
```

Only the person's own families live here. Catalog families (`cat-fam-chicken`) are constants. A family is a grouping label with no data of its own and no parent.

### 4. `Store` — `…/stores/{id}`

```typescript
interface Store {
  id: string;
  name: string;
  catalogStoreId: string | null;               // set when picked from the well-known list; immutable
  imagePath: string | null;                    // Storage path of the person's own image
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

A well-known store becomes a `Store` document the first time a product uses it, so every product points at a store the person owns. Its logo is derived from the catalog entry's domain; a person's own store shows `imagePath` (its download URL is a TanStack query keyed by path and `updatedAt`, `storeImageQueryOptions`; `useStoragePhoto` only uploads and deletes), else a letter tile.

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
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

The default product is the ingredient's `defaultProductId`, not a flag on the product, so changing the default is one field write on one document. The first non-archived product added to an ingredient becomes its default in the same batch.

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
  source: RecipeSource;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

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
  items: MealItem[];                           // 1 … MAX_MEAL_ITEMS
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 8. `PlannedMeal` — `…/plannedMeals/{id}`

```typescript
interface PlannedSnapshot {
  frozenAt: number;
  costCents: number | null;                    // null when nothing could be priced
  leftOutCount: number;                        // distinct ingredients left out of the cost
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
  iconKey: string | null;
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
| Ingredient unit cost | default (else first non-archived) product: `priceCents ÷ sizeInBase`, per base unit of the product's dimension | `utils/unitCost.ts` |
| Line cost | recipe line amount bridged into the product's dimension × unit cost; otherwise a `NOT_COMPARABLE` gap; no product → `NO_PRODUCT` | `utils/recipeMath.ts` |
| Recipe cost | sum of the priced lines; `{ totalCents, perServingCents, leftOut: Gap[] }` | `utils/recipeMath.ts` |
| Recipe nutrition per serving | per metric: override if non-null, else sum of line grams × `per100g ÷ 100` ÷ servings; a line with no per-100 g value or no gram bridge adds a `NO_NUTRITION` gap for that metric | `utils/recipeMath.ts` |
| Ingredient item per serving | serving size (record, else catalog, else 100 g) through the same bridge: cost and nutrition of one serving | `utils/mealMath.ts` |
| Item cost | `servings ×` (recipe per-serving cost or ingredient per-serving cost) | `utils/mealMath.ts` |
| Planned meal totals | sum of items; for a frozen meal, the snapshot instead | `utils/mealMath.ts` |
| Day totals | planned meals for a day key | `selectDayTotals` |
| Month stats | `{ spendCents, mealsPriced, avgPerMealCents, nutritionTotals, proteinPriceCentsPerGram, leftOut }` over the shown month | `selectMonthStats(monthKey)` |
| Gaps | the union of left-out ingredients for a scope, minus dismissed ones | `utils/gaps.ts` |
| Day key | `toDateInputValue(date)` for a stored date; `toLocalDateInputValue(cell.getTime())` for a Dreamer UI cell | `utils/dayKeys.ts` |

*Average per meal* divides month spend by the number of planned meals that have at least one priced item, so an unpriced meal doesn't pull the average toward zero. *Price per gram of protein* divides spend by protein grams over only the meals where both are known. Both say how many items they left out.

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

Per metric, independently. Ingredient values are per 100 g, so a line's grams (bridged as above) give `grams ÷ 100 × per100g[metric]`. A recipe's per-serving value is the sum over lines ÷ `servings`, unless `nutritionOverride[metric]` is non-null. An ingredient with `null` for a metric, or a line that can't be bridged to grams, adds a `NO_NUTRITION` gap for that metric only. Nutrition is computed for all four metrics whether or not they're switched on; the switches only choose what is rendered and which gaps are surfaced (`gaps.ts` takes the `showNutrition` switches).

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

`freezePastMeals` runs in two places: once after the planned-meals window first loads, and as the first step of every action that changes a value the math reads (product price or size, recipe, ingredient record). It finds loaded planned meals with `snapshot === null` and `date < startOfTodayUTC`, computes each snapshot from the current data, and writes `snapshot` with a field-scoped `updateDoc` in one `writeBatch` (independent writes, no reads). The rule allows `snapshot` to change only from `null`, so a stale device can't overwrite history.

A frozen meal still lists its items from the live recipes and ingredients (so a deleted-then-archived recipe still shows its title), but its totals come from the snapshot. A meal planned on a day that has already passed is frozen at once.

*Honest limit:* a meal is frozen from the data on the first load after its day, not the data on the day itself. A price changed during a gap in use, in a month the window never loaded, can leak into history for meals that were never frozen. The freeze-before-edit step keeps this to meals older than the loaded window.

### 3a. Archive on delete

```
removeRecipe(id):
  usedInMeals    = meals.some(m => m.items.some(i => i.kind === 'RECIPE' && i.refId === id))
  usedInPlanned  = (await getDocs(query(plannedMeals, where('refIds', 'array-contains', id), limit(1)))).size > 0
  usedInPlanned || usedInMeals  → updateDoc({ isArchived: true, updatedAt })   // hidden from lists and pickers
  otherwise                     → deleteDoc  (+ delete the cover from Storage)
```

The same shape serves ingredients (also checked against `recipes.ingredients[].ingredientId` and `products`), products (against nothing but a default pointer: the ingredient's `defaultProductId` is re-pointed to another non-archived product, or `null`), stores (against products) and families (an archived family's ingredients keep showing under its name). The confirm names what will happen ("Used on 3 planned days, so it will be hidden, not erased").

Archived items never appear in pickers, search or lists and never count as a default product. Selectors that resolve a reference (`resolveIngredient`, recipe titles for planned items) still find them.

### 4. Gaps and nudges

`getGaps(scope)` walks the lines in a scope (one recipe, one meal, a day, the month) and returns `{ kind, ingredientId, detail }[]`:

- `NO_PRODUCT` — a priced ingredient with no non-archived product, or a recipe/ingredient item with no price at all
- `NOT_COMPARABLE` — a product exists but the amount and the package size can't be bridged
- `NO_NUTRITION` — only for a metric in `showNutrition`

A gap is **hidden** when `dismissedNudges["{kind}:{ingredientId}"]` exists. Dismissing writes that key; filling the gap makes the gap disappear on its own, and a later regression (a product removed) brings it back only if the key was cleared, so dismissal clearing happens in the same write as the action that fills the gap (`saveProduct` removes the `NO_PRODUCT`/`NOT_COMPARABLE` keys for that ingredient). A nudge renders only when the filtered gap list is non-empty. A total that excludes lines always says so, whether or not its nudge is dismissed.

The fill-in sheet takes the gap list and renders one row per ingredient with only the fields that gap needs: a product's store, price and size for `NO_PRODUCT`; the size for `NOT_COMPARABLE`; the metric for `NO_NUTRITION`. Saving writes through the same actions as the full forms.

### 5. Recipe ingestion (AI)

```
idle → reading(source) → draft(recipe, unread[]) → (person edits) → saved
             │                                           
             └→ failed(message)    (always ends on idle for the next try; nothing was written)
```

- Entry points: `RecipeAutofill` inside the recipe form. **Paste:** text up to `MAX_PASTE_CHARS`. **File:** a photo, screenshot or PDF up to `MAX_UPLOAD_BYTES` (JPG, PNG, WebP, HEIC, PDF through `getUploadMimeType`; images through `compressIngestionImage`).
- `lib/extractRecipe.ts` exports `extractRecipeFromText(text)` and `extractRecipeFromFile(file)`. Both call the shared `generativeModel` from `src/lib/firebase/ai.ts` with a response schema: `{ title, servings, prepMinutes, cookMinutes, description, ingredients: [{ name, amount, unit, note }], steps: [string], unread: [string] }`, where `unit` is an enum of the app's unit labels. Files go as `inlineData` base64. Extraction calls are not cached and not Query-backed (non-idempotent), like the other extraction calls in the repo.
- The model output is **only a draft for the form.** `matchIngredient(name)` (`utils/ingredientMatch.ts`) resolves each ingredient name to an ingredient id against the person's custom ingredients first, then catalog names and aliases (normalized: lowercase, singular, punctuation stripped). No match → the row is marked "Add as new ingredient" and, if kept, creates a custom ingredient with that name in the same save as the recipe (one `writeBatch`).
- The prompt tells the model the pasted text is data, not instructions, and asks it to list anything it could not read in `unread`; the draft never writes anything itself, so injected text can at most fill form fields the person reviews.
- A reading that finds no ingredients at all is a failure ("We couldn't find a recipe in that"). Errors map to one warm sentence each (busy, offline, unavailable, unreadable) and the detail is logged, never shown.
- `source` is saved as `AI_TEXT` / `AI_FILE` when the draft came from the reader, `MANUAL` otherwise (even if the person edited it).

### 6. Markdown copy

`utils/markdown/` has four builders — `recipeMarkdown`, `dayMarkdown`, `weekMarkdown`, `ingredientsMarkdown` — each a pure function of already-loaded data, built at the tap and copied through `copyToClipboard`. Rules, each decided field by field:

| Copy | Included | Never included |
|---|---|---|
| Recipe | title, servings, times, ingredients with amounts, steps | prices, stores, products, nutrition overrides, cover |
| Day | the date, each meal type heading, items with servings, the recipes' ingredient lists as nested bullets | prices, stores |
| Week | seven day blocks, Monday to Sunday, in the same shape as a day | prices, stores |
| Ingredients | names grouped by family, for "your ingredients" (custom + with a product + used in a recipe), capped at `MAX_COPIED_INGREDIENTS` ("and N more") | prices, stores, products, nutrition |

User text (titles, notes, store-less names) is escaped for Markdown, and a name that contains `@` is treated as a plain string and not linkified. The recipe format is also the one the AI reader reads back, so a copy-then-paste round trip fills the form.

### 7. Stock tracking (reserved for Next Steps)

The MVP data model leaves two things open on purpose: a future `stock` collection (`ingredientId`, `amount`, `unit`, `lastCountedAt`, `isTracked`) where a missing document means "not tracked", and `plannedMeals.madeAt` for mark-as-made. Neither is written in the MVP. Both arrive as new optional-by-default fields (`null`) with the legacy-document defaults the repo already requires.

---

## Security Rules Design Criteria

1. **Everything is owner-only.** Every path under `apps/pinch/kitchens/{uid}` (the kitchen document and all seven subcollections) allows read and write only when `request.auth.uid == uid`. There is no member-of, admin or role branch.
2. **`isAdmin()` and `isDevUser()` get no access to kitchen data.** They gate only the app *catalog* document `apps/pinch`, as for every other app. A dev fixture signs in as its own `uid` like anyone else.
3. **The app document** `apps/pinch` follows the existing four-read-predicate shape (admin/dev, unrestricted-public, uid-allowed, email-allowed) with admin-only writes, in alphabetical position among the app blocks.
4. **Shape validation covers every field on every type**, with the `T | null` convention (the key must exist; `null` is legal only where the type says so). Enums use `in [...]` against the same strings as `constants.ts`. Bounds: `priceCents` is an int `0 … 100_000_000`; `sizeAmount`, `amount` and `servings` are numbers `> 0` and `≤ 1_000_000`; nutrition values are null or numbers `0 … 100_000`; `gramsPerMl` and `gramsEach` are null or `> 0`; `date` is an int and a multiple of `86_400_000`; strings have length caps (names 120, titles 200, steps 2,000, notes 200); arrays are capped at `MAX_RECIPE_INGREDIENTS`, `MAX_RECIPE_STEPS`, `MAX_MEAL_ITEMS` and 200 `refIds`; `url` is null or an `https://` string; `dismissedNudges` has at most 500 keys.
5. **Immutable fields only:** `id`, `uid`, `createdAt`, an ingredient record's `catalogId`, a store's `catalogStoreId`, a product's `ingredientId`. Everything the UI edits stays editable, including a planned meal's `date`, `mealType` and `items`.
6. **Write-once snapshot.** A planned meal's `snapshot` may be written only while the stored value is `null`, and is then immutable. Its `frozenAt` must be `≤ request.time.toMillis()`. (Rule check: `resource.data.get('snapshot', null) == null || request.resource.data.snapshot == resource.data.snapshot`.)
7. **Cross-field integrity the client could get wrong:** a planned meal's `refIds` equal the distinct `refId`s of its `items` is **not** enforced in rules (it's a derived index the client writes; a wrong value only affects the "in use" check, and the owner is the only writer), and the rules say so. A recipe has at least one ingredient; a meal and a planned meal have at least one item; `defaultProductId` shape is a string or null.
8. **Deletes:** the owner may delete any document in their kitchen, including the kitchen document. The client archives anything in use (Logic §3a), and the rules deliberately don't, since the data is the owner's own and a stale client must not be locked out of cleaning up.
9. **No cross-document rules.** No `get()`/`exists()`: a product doesn't have to point at an existing ingredient or store at the rules level; the client resolves a dangling reference to "Removed …".
10. **Rules tolerate older documents.** A field added later is validated on the incoming document with `request.resource.data.get('field', default)` and compared against the stored value with `resource.data.get('field', default)`; every edit action backfills the new key with its empty value in the same write. (Reserved, not yet written: `plannedMeals.madeAt`, the `stock` collection.)
11. **No server-only collections and no new indexes.** The only queries are a single-field range on `plannedMeals.date` and an `array-contains` on `plannedMeals.refIds`, neither of which needs a composite index. `firestore.indexes.json` is unchanged, and the PR says so.
12. **Storage rules.** `apps/pinch/kitchens/{uid}/recipes/{recipeId}/{file}` and `…/stores/{storeId}/{file}` are readable and writable only by `request.auth.uid == uid`, only `image/*` content types, at most 5 MB, and the file name is `cover.webp` or `logo.webp`. Storage paths mirror the Firestore document paths.

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
interface MealsState          { items: Meal[];                    isLoaded: boolean }
interface PlannedMealsState   { items: PlannedMeal[]; windowKey: string | null; isLoaded: boolean }
export interface PinchState { settings: SettingsState; ingredients: IngredientsState; families: FamiliesState;
  stores: StoresState; products: ProductsState; recipes: RecipesState; meals: MealsState; plannedMeals: PlannedMealsState }
```

Every slice resets on the shared `resetAllState`, so a user switch never shows the previous person's data.

**Two listener tiers**, both under `store/listeners/` and started from `usePinchSync(uid, shownMonth)` called once from `Pinch.tsx` (the only orchestrator); no tab, panel or drawer has an `onSnapshot` of its own:

1. **Signed-in user:** `startSettingsListener`, `startIngredientsListener`, `startFamiliesListener`, `startStoresListener`, `startProductsListener`, `startRecipesListener`, `startMealsListener` — `onSnapshot` of the kitchen document and each collection under `kitchens/{uid}`. One effect keyed on `uid`.
2. **Visible window:** `startPlannedMealsListener(uid, windowKey, onChange)` — `onSnapshot` of `plannedMeals` where `date >= windowStart` and `date < windowEnd`, a single-field range covering the shown month plus `MONTH_WINDOW_PADDING` months on each side. The effect is keyed on the window key (`"2026-10"`), so paging months restarts it only when the window actually changes. The slice keeps the previous window's documents until the new snapshot lands, so the grid never blanks while paging.

**Loading gate.** `Pinch.tsx` shows a skeleton until every user-tier slice `isLoaded` and the first window has landed. An empty kitchen (no settings document, no records) is a valid state that renders the empty Calendar; there is no first-run blocking modal.

**Actions (thunks)** in `store/actions/`, writing only to the person's own paths:

| Action | Write |
|---|---|
| `saveSettings(fields)` / `dismissNudge(key)` | field-scoped `setDoc`/`updateDoc` with dotted paths (`showNutrition.protein`, `dismissedNudges.<key>`); creates the kitchen document on first write |
| `saveIngredient(draft)` | `setDoc` of the record (custom: new id; catalog: id = catalog id) with the full shape; edits are field-scoped `updateDoc` |
| `removeIngredient(id)` | the archive-or-delete check (Logic §3a) |
| `saveFamily` / `removeFamily` | `setDoc` / archive-or-delete |
| `saveStore(draft)` | `setDoc` to create, field-scoped `updateDoc` to edit; a catalog store is created lazily by `ensureCatalogStore(catalogStoreId)` (create-if-absent inside a `runTransaction`, so a double tap makes one); an uploaded image goes to Storage first, then `imagePath` is written |
| `removeStore(id)` | archive when any product points at it, else delete + delete the image |
| `saveProduct(draft)` | one `writeBatch`: the product document and, when it's the ingredient's first live product or "Make this the default" was chosen, the record's `defaultProductId` (an upsert for a catalog ingredient with no record); also clears the matching `dismissedNudges` keys; preceded by `freezePastMeals` |
| `removeProduct(id)` | archive-or-delete; re-points `defaultProductId` to another live product or `null` in the same batch |
| `setDefaultProduct(ingredientId, productId)` | field-scoped `updateDoc` of the record's `defaultProductId` (a transaction confirms the product still exists and isn't archived, so a stale device can't leave it dangling) |
| `saveRecipe(draft)` | `setDoc`/field-scoped `updateDoc` of what the form owns (never the whole cached object); new custom ingredients from an AI draft are created in the same `writeBatch`; a cover goes to Storage first; preceded by `freezePastMeals` on an edit |
| `removeRecipe(id)` | the archive-or-delete check |
| `saveMeal(draft)` / `removeMeal(id)` | `setDoc`/`updateDoc`; meals are referenced only by `sourceMealId` (never read for display), so a meal is always deletable |
| `planMeal({ date, mealType, items, name, sourceMealId })` | `setDoc` of a new planned meal with `refIds` derived; a past date is frozen in the same write |
| `updatePlannedMeal(id, fields)` | field-scoped `updateDoc` of what the builder owns (`date`, `mealType`, `items`, `refIds`, `name`) |
| `removePlannedMeal(id)` | `deleteDoc` after `useActionModal().confirm({ destructive: true })` |
| `savePlannedAsMeal(plannedId, name)` | `setDoc` of a new meal from the planned meal's items; reads the planned meal from the store at tap time |
| `freezePastMeals()` | one `writeBatch` of field-scoped `snapshot` writes for loaded, unfrozen past meals |

No cached document is ever written back whole. There is no cross-person concurrency, and the few create-if-absent cases above are the only transactions.

**Selectors** (`store/selectors.ts`): `createSelector` for everything that builds a new array or object, so no `useAppSelector` returns a fresh reference without `shallowEqual`.

- `selectIngredientsById` — catalog merged with records (a `Map`), memoized on the records
- `selectIngredientFamilies` — grouped list for Kitchen (Yours / All), archived hidden
- `selectDefaultProducts` — `Map<ingredientId, Product>`
- `selectRecipeCosts` — `Map<recipeId, RecipeCost>` computed once per change of recipes, products or ingredients
- `selectPlannedByDay` — `Map<dayKey, PlannedMeal[]>` read by the Calendar's `renderCell` and the day drawer, so a cell never filters the list
- `selectDayTotals`, `selectMonthStats(monthKey)` — one pass over the window's planned meals
- `selectGaps(scope)` — scope-parameterized via a small factory; takes `showNutrition` and `dismissedNudges`
- Time-dependent selectors take `todayKey` as an argument (`useNow()` supplies it in the component)

**Overlay coordination.** The orchestrator owns one discriminated-union state: `overlay: null | { kind: 'day'; dayKey } | { kind: 'plannedMeal'; id } | { kind: 'recipe'; id } | { kind: 'meal'; id } | { kind: 'ingredient'; id } | { kind: 'breakdown' } | { kind: 'settings' } | { kind: 'fillIn'; scope } | { kind: 'copy'; what }`, plus a `subview: null | { kind: 'planMeal'; ... } | { kind: 'recipeForm'; ... } | { kind: 'mealForm'; ... } | { kind: 'stores' } | { kind: 'products' }`, exposed through a small context (`usePinchOverlay`). A drawer's action that opens a form closes the drawer first; the in-place "swap" screens (planned meal, save-as-meal) are components inside the drawer, not new overlays.

---

## Component Encapsulation

- **Screens read the store; presentation components take props.** `CalendarScreen`, `RecipesScreen` and `KitchenScreen` use `useAppSelector`; rows, cells and badges are pure.
- **App-aware pieces stay in the app** (`MealBarCell`, `StatsRow`, `StoreLogo`, `GapNudge`, `NutritionLine`); anything whose props mention no kitchen entity (`SearchInput`, `PillGroup`, `PickOrCreate`, `SectionDivider`, `MoneyInput`, `FormSheet`, `Subview`, `CopyButton`) comes from `src/components` or Dreamer UI.
- **`parseMoneyToCents`, `formatCents` and `centsToInputValue` move to `src/utils/moneyUtils.ts`** in the first Pinch PR that needs them (A-List keeps them in `apps/a-list/utils/money.ts` today); A-List's imports are updated in the same PR, per the "a second mini-app needs it" rule.
- **A quantity/unit select is built once** as `UnitSelect` from `UNIT_LABELS`; the ingredient row, the product form and the fill-in sheet all use it.
- **Closed means unmounted:** drawers' heavy bodies (the recipe drawer's step list, the breakdown rows, the store list) render only while open.

## UI Component Conventions Applied

- Forms: `FormSheet` for the ingredient, product, store and settings forms; `Subview` for the recipe and meal builders and the stores and products lists; `DetailSheet` for day, planned meal, recipe, meal and ingredient details; `ModalFooterActions` with Cancel left, a `DeleteIconButton` beside it on edit, the primary alone on the right.
- Titles are plain nouns ("Recipe", "Product", "Store", "Meal", "Settings"); the verb is on the primary button and the destructive confirm.
- `PickOrCreate` for family, store and saved meal; `PillGroup` for meal type and the Recipes / Meals and Yours / All switches (`isThin`); `AppToggle` for the four nutrition switches; `SuggestionChips` is not used.
- Lists search from `LIST_SEARCH_THRESHOLD` rows; Kitchen groups by family with `SectionDivider` and mounts a family group only near the viewport (`LazyMount`).
- Images from URLs (a recipe cover, a store logo) are `FallbackImage` with a themed fallback (a tinted emoji tile, a letter tile).
- Delete confirmations go through `useActionModal().confirm` with `destructive: true` and say what archiving means when something is in use.
- Copy goes through `copyToClipboard`, inside the `CopySheet` that states what is and isn't included.

## Theming

- `src/apps/pinch/pinch.css` overrides Dreamer UI's semantic tokens on `html.pinch-theme`: a warm orange `--color-primary` on a slate base for background, card, muted and border, in light and dark; `--radius-md` and up raised for a rounded counter feel; field text inset; a soft-tint selected pill; tertiary buttons use the normal text colour. `usePinchTheme()` adds the class to `<html>` only while the app is mounted.
- Meal-type colours are tokens, not raw palette classes (`--pinch-meal-breakfast … --pinch-meal-drink`), checked on a thin bar in light and dark.
- The Pinch rules file is written in the same PR as the shell: `.github/instructions/pinch.instructions.md` with an identical `.claude/rules/pinch.md` (metaphor: a home cook's counter; palette roles; shape language; what the emoji mean; calendar bar anatomy; nudge wording; missing details appear only as in-context nudge lines).

---

## Security & Privacy Requirements

- **Private by construction.** A person's kitchen is readable and writable only by them. There is no admin read; Security Rules Design Criteria #1–2 are the whole access model. Nothing in the MVP is shared or public.
- **What leaves the app, and where it goes.** (1) Pasted text or a chosen photo or PDF goes to Firebase AI (Gemini) to be read into a recipe draft; the provider sees the content, not the person's identity beyond Firebase's own request metadata, and the screen says an AI reads it and that it isn't saved. (2) Store logos are requested by the person's browser from the logo service by domain only (well-known stores only); a person's own stores never leave Storage. (3) Copy-to-Markdown puts text on the clipboard, never prices, stores or products.
- **The logo service's key is a publishable browser token**, domain-restricted at the provider, kept in an env var (`VITE_STORE_LOGO_TOKEN`) and sent only in the logo request's URL. It is not a secret and is not a Functions secret; if the chosen provider needs a secret, the logo route moves behind an `onCall` instead.
- **Stored data minimization.** No location, no payment details, no card data, no receipt images are stored. A product stores store, price, size and an optional link; a recipe stores what the person typed or reviewed.
- **Persistence on the device.** Nothing from the person's own documents is persisted beyond Firestore's own cache. No TanStack query in the MVP carries `meta: { persist: true }`; the catalog is code, not a query.
- **Links are https-only** and shown with `ExternalLinkText`.
- **Rules are verified against the emulator, not by the UI hiding a control:** the owner allowed and a second signed-in user denied on every path (kitchen document and all seven collections, plus Storage), signed-out denied; and one denied write per integrity rule (snapshot overwrite, `priceCents` negative, `sizeAmount` 0, an unknown `unit`, a `date` that isn't UTC midnight, a 61st recipe ingredient, an `http://` link).
- **Terms and licences are a gate, not a footnote:** the USDA FoodData Central licence (catalog nutrition), the emoji icon set's licence notices, and the logo service's terms and attribution are each confirmed in the PR that ships the thing that uses them, with the notices in an About row in Settings.

---

## Performance

- **Scale fixture.** `scripts/seeds/pinchScale.ts` seeds "Big Kitchen (scale test)": 300 custom ingredients across 40 families, 150 products across 12 stores, 200 recipes of up to 25 ingredients, 60 saved meals, and about 1,100 planned meals over three months with 4 meals on most days and 8 on a few. Every list or per-row feature is opened on it at phone width with the dev build throttled 4×, switching Calendar ↔ Recipes ↔ Kitchen.
- **One pass, then lookups.** `selectRecipeCosts` and `selectMonthStats` compute in one walk and are memoized; no cell, row or drawer recomputes a recipe's cost. The Calendar's `renderCell` reads `selectPlannedByDay` only.
- **Build once.** The currency `Intl.NumberFormat` and the catalog lookup maps are module-level; the search index is built on first use.
- **Cap what's drawn.** Kitchen mounts a family group near the viewport; recipe and ingredient pickers show the top matches; the breakdown caps at one month of rows.
- **Keep the tap instant.** Each tab renders in a transition and is wrapped in `memo`; the day and recipe drawers read from the store at open, not from their parents.

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
│   ├── usePinchSync.ts  usePinchTheme.ts  usePinchOverlay.tsx
├── lib/
│   └── extractRecipe.ts            # text + file readers, response schema, error mapping
├── store/
│   ├── index.ts  selectors.ts
│   ├── slices/     settingsSlice.ts  ingredientsSlice.ts  familiesSlice.ts  storesSlice.ts
│   │               productsSlice.ts  recipesSlice.ts  mealsSlice.ts  plannedMealsSlice.ts
│   ├── actions/    settingsActions.ts  ingredientActions.ts  storeActions.ts  productActions.ts
│   │               recipeActions.ts  mealActions.ts  plannedMealActions.ts  freezeActions.ts
│   └── listeners/  kitchenListeners.ts  plannedMealsListener.ts
├── utils/
│   ├── quantity.ts  unitCost.ts  recipeMath.ts  mealMath.ts  dayKeys.ts  stats.ts  gaps.ts
│   ├── ingredientMatch.ts  catalogSearch.ts  weeks.ts
│   └── markdown/   recipeMarkdown.ts  dayMarkdown.ts  weekMarkdown.ts  ingredientsMarkdown.ts
└── components/
    ├── shell/       BottomNav.tsx  LoadingSkeleton.tsx
    ├── calendar/    CalendarScreen.tsx  MealBarCell.tsx  StatsRow.tsx  DayDrawer.tsx  DayPeek.tsx
    │                PlannedMealView.tsx  BreakdownDrawer.tsx
    ├── plan/        PlanMealSubview.tsx  MealBuilder.tsx  ItemSearch.tsx  ServingStepper.tsx
    ├── recipes/     RecipesScreen.tsx  RecipeRow.tsx  RecipeSubview.tsx  RecipeForm.tsx
    │                RecipeAutofill.tsx  RecipeDrawer.tsx  MealRow.tsx  MealDrawer.tsx  MealSubview.tsx
    ├── kitchen/     KitchenScreen.tsx  IngredientRow.tsx  FamilyGroup.tsx  IngredientDrawer.tsx
    │                IngredientFormSheet.tsx  ProductFormSheet.tsx  StoresSubview.tsx  StoreFormSheet.tsx
    │                StorePicker.tsx  ProductsSubview.tsx
    ├── settings/    SettingsSheet.tsx
    └── shared/      CopySheet.tsx  GapNudge.tsx  FillInSheet.tsx  IngredientIcon.tsx  StoreLogo.tsx
                     NutritionLine.tsx  CoverImage.tsx  UnitSelect.tsx

public/vendor/ingredient-icons/     # vendored emoji SVGs with their licence notices
scripts/seeds/pinch.ts  pinchScale.ts
scripts/catalog/buildCatalog.ts
```

No `functions/src/apps/pinch/` in the MVP.

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

1. **Store logo source: Logo.dev is wired, its terms are still to be confirmed.** Logos load by domain in the person's browser behind `storeLogoUrl` (enabled only when `VITE_STORE_LOGO_TOKEN` is set, with a letter-tile fallback and `no-referrer`). Logo.dev's Community plan needs attribution for commercial projects and says logos remain their owners' trademarks; the plan's terms and the attribution wording were not verified from the sandbox. Gate before launch: read them, then add the attribution row (Settings' About, Issue 13) or leave the token unset. Fallback if it doesn't fit: letter tiles plus person-uploaded images only.
2. **USDA FoodData Central licence** is to be confirmed before the catalog ships (the page could not be read while planning). Defaults to FDC's public-domain/CC0 position; the generated catalog keeps a `source` note per row.
3. **Ingredient icon set.** Fluent Emoji (MIT), Noto Emoji (Apache-2.0) or Twemoji (CC-BY-4.0). The design assumes one set vendored with its notice; the choice affects the About row's wording only.
4. **The calendar grid's first weekday.** The UX shows Monday first. If Dreamer UI's `Calendar` can't start a week on Monday, the grid starts on Sunday and Monday-to-Sunday applies to week copies only. First spike of the Calendar issue.
5. **Freezing from first-load data.** A past meal is frozen from the data at the first load after its day, with a freeze-before-edit step. Prices changed while the app wasn't opened for a month or more can leak into meals that were never frozen. Alternative: a daily scheduled Function that freezes by UTC day (adds a Function, a secret-free deploy, and a time-zone approximation).
6. **"Average per meal" excludes meals with no priced item**, and "price per gram of protein" uses only meals where both are known. Both are my choices; the screens say what was left out.
7. **Pinch uses `kitchens/{uid}` private data only.** If "cook with someone" means a live shared kitchen (not a one-time copy of a plan), the shared data needs its own tree; the `kitchens` root makes that a read grant on this document for the first version but not a co-edited kitchen.
8. **`refIds` is a client-written index** the rules don't verify. A wrong value can only make a delete hard-delete something still in use; the single writer is the owner. The defence is the client derive-on-write and the emulator checks.
9. **No test runner exists in the repo.** The quantity bridge, cost and stats math are pure and the most valuable thing to test. Default: a throwaway `tsx` check of the worked examples above, plus the timezone-pinned browser pass the repo already requires.
10. **Unit conversions beyond the catalog are Next Steps.** A custom ingredient has no density or per-piece weight in the MVP, so a recipe line in cups of a custom ingredient priced by the pound is left out and named. The `gramsPerMl` and `gramsEach` fields are in the schema already so adding the UI later needs no migration.
11. **Ingredient serving sizes.** An ingredient item in a meal ("1 serving of Doritos") needs a serving size; the catalog supplies one and a custom ingredient defaults to 100 g until the person sets one. Doritos-style items need that field in the ingredient form's extras.
12. **The AI text cap** (20,000 characters) and the 10 MB upload cap are reasonable limits set here, not provider limits.
