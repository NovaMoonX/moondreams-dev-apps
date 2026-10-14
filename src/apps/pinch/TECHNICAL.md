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
14. **How a list looks is a per-device choice, not data.** Each list's View options (show prices, show calories and macros, the nutrition basis of ingredient rows) live in the browser's `localStorage` per person and list, so no field, rule or listener is involved and nothing syncs between devices. Hiding a line only skips drawing it; no total reads these options.
15. **Where a recipe came from is its own small collection, named by `sourceId`.** A `Source` is just an id and a label the person typed ("Serious Eats", "Mom's recipe cards"); a recipe points at one with `sourceId`, which is not `Recipe.source` (that field says how the draft was made: by hand, or read from text, a file or a link). Deleting a source clears the pointer on the recipes that name it and leaves the recipes alone; a recipe that names a source that is gone, or has no `sourceId` key at all, simply reads as having none.

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
export type RecipeSource = 'MANUAL' | 'AI_TEXT' | 'AI_FILE' | 'AI_LINK';   // how a recipe draft was made; where it came from is a `Source`, named by `Recipe.sourceId`
export type RecipeStartMethod = 'text' | 'file' | 'link' | 'manual';   // UI only: how a new recipe begins, never stored
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
- A reading that finds no ingredients at all is a failure ("We couldn't find a recipe in that"). Errors map to one warm sentence each (busy, offline, unavailable, unreadable) and the detail is logged, never shown.
- `source` is saved as `AI_TEXT` / `AI_FILE` / `AI_LINK` when the draft came from the reader, `MANUAL` otherwise (even if the person edited it).

### 5a. Recipe sources

- **Choosing one.** The recipe form's "Where it's from" section is a `PickOrCreate` over the person's sources (existing labels as pills, a dashed "New source" first, nothing preselected for a new recipe), with a text field in its place while there are no sources yet. The form keeps the answer as `{ choice, newText }`: a source id, `NEW_CHOICE` with the label typed, or empty. Saving resolves it in `RecipeForm`: a typed label goes through `createSource` first (which returns the id of an existing source with the same label, ignoring case and spaces, instead of adding a second), a picked id that no longer exists becomes `null`, and the result is `draft.sourceId`. If the recipe write then fails, the new source simply stays.
- **Reading from a link.** A recipe read from a link (`source === 'AI_LINK'`) starts on its site: `getReadSourceChoice` takes the reading's label (the page's host), drops a leading `www.`, and picks the existing source whose label matches the host the same way (so "seriouseats.com" matches "www.seriouseats.com"), otherwise starts "New source" with the host as the text (cut to 80 characters). Only the form's starting value is set, so what the person picks or types afterwards is never replaced; the text field takes no focus on its own (`isFocusedOnOpen={false}`) so the keyboard doesn't open over the form. A recipe read from text or a file starts with none.
- **Writing.** `saveRecipe` writes `sourceId` on every save (new or edit), so an edit backfills the key on a recipe that lacked it and the field-scoped `updateDoc` never touches it elsewhere. `renameSource` is a field-scoped `updateDoc` of `label` and `updatedAt` after checking the loaded list for another source with that label. `removeSource` is one `writeBatch` per 400 writes holding the source's delete (in the first batch) and `sourceId: null` on every loaded recipe that names it, archived ones included; a recipe's `updatedAt` is left alone because it versions the cover image. A recipe created on another device at the same moment, or one that wasn't loaded yet, keeps a pointer to a source that no longer exists, which reads as none (above); if a later batch fails the source is already gone and the rest read the same way, and the error is shown.
- **Failure.** The sources listener is an optional enhancement: its error never reaches the fatal load-error screen (`selectPinchLoadError` leaves it out), but its first answer or error does end the loading gate. While it has failed the form leaves the section out and keeps a recipe's own `sourceId` as it was, so editing never drops a label it couldn't read; the Sources entry, filter and drawer line simply don't appear.
- **Reading and counting.** `selectSources` (alphabetical), `selectSourcesById` and `selectSourceCounts` (`{ bySource: Map<id, count>, withoutSource }` over the listed, non-archived recipes, one pass) feed the Recipes screen. The Source filter is a `FilterBar` with one `FilterSection` holding a pick-one `PillGroup`: "Any", each source used by at least one listed recipe as "Label · count", and "No source · n" only when some recipe has none; a picked source or "No source" stays in the list while picked even if its count falls to zero. The filter exists only while at least one listed recipe has a source (otherwise the screen keeps its plain search-from-8 layout), the picked value falls back to "Any" when its source is gone or the filter disappears, and Meals are never filtered.

### 6. Stock tracking (reserved for Next Steps)

The MVP data model leaves two things open on purpose: a future `stock` collection (`ingredientId`, `amount`, `unit`, `lastCountedAt`, `isTracked`) where a missing document means "not tracked", and `plannedMeals.madeAt` for mark-as-made. Neither is written in the MVP. Both arrive as new optional-by-default fields (`null`) with the legacy-document defaults the repo already requires.

---

## Security Rules Design Criteria

1. **Everything is owner-only.** Every path under `apps/pinch/kitchens/{uid}` (the kitchen document and all eight subcollections) allows read and write only when `request.auth.uid == uid`. There is no member-of, admin or role branch.
2. **`isAdmin()` and `isDevUser()` get no access to kitchen data.** They gate only the app *catalog* document `apps/pinch`, as for every other app. A dev fixture signs in as its own `uid` like anyone else.
3. **The app document** `apps/pinch` follows the existing four-read-predicate shape (admin/dev, unrestricted-public, uid-allowed, email-allowed) with admin-only writes, in alphabetical position among the app blocks.
4. **Shape validation covers every field on every type**, with the `T | null` convention (the key must exist; `null` is legal only where the type says so). Enums use `in [...]` against the same strings as `constants.ts`. Bounds: `priceCents` is an int `0 … 100_000_000`; `sizeAmount`, `amount` and `servings` are numbers `> 0` and `≤ 1_000_000`; nutrition values are null or numbers `0 … 100_000`; `gramsPerMl` and `gramsEach` are null or `> 0`; `date` is an int and a multiple of `86_400_000`; strings have length caps (names 120, titles 200, steps 2,000, notes 200, a source's label and a recipe's `sourceId` 80); arrays are capped at `MAX_RECIPE_INGREDIENTS`, `MAX_RECIPE_STEPS`, `MAX_MEAL_ITEMS` and `refIds` (rules can't loop, so a recipe's ingredient lines and steps are the client's to enforce, while a meal's at most 10 items are each checked by index: keys, kind, string ids and `servings > 0`; adding length caps on those ids or checking the elements of `refIds` exceeds the evaluator's budget, so those stay the client's); `url` is null or an `https://` string; `dismissedNudges` has at most 500 keys.
5. **Immutable fields only:** `id`, `uid`, `createdAt` (a source's too), an ingredient record's `catalogId`, a store's `catalogStoreId`, a product's `ingredientId`. Everything the UI edits stays editable, including a planned meal's `date`, `mealType` and `items`.
6. **Write-once snapshot.** A planned meal's `snapshot` may be written only while the stored value is `null`, and is then immutable. Its `frozenAt` must be `≤ request.time.toMillis()` plus five minutes of clock skew, so a phone whose clock runs a little fast can still freeze. Its shape is checked (five keys, bounded totals, at most 10 lines); the elements of `leftOut` and `lines` are the client's, since rules can't loop. (Rule check: `resource.data.get('snapshot', null) == null || request.resource.data.snapshot == resource.data.snapshot`.)
7. **Cross-field integrity the client could get wrong:** a planned meal's `refIds` equal the distinct `refId`s of its `items` is **not** enforced in rules (it's a derived index the client writes; a wrong value only affects the "in use" check, and the owner is the only writer), and the rules say so. A recipe has at least one ingredient; a meal and a planned meal have at least one item; `defaultProductId` shape is a string or null.
8. **Deletes:** the owner may delete any document in their kitchen, including the kitchen document. The client archives anything in use (Logic §3a), and the rules deliberately don't, since the data is the owner's own and a stale client must not be locked out of cleaning up.
9. **No cross-document rules.** No `get()`/`exists()`: a product doesn't have to point at an existing ingredient or store at the rules level, and a recipe's `sourceId` doesn't have to name an existing source; the client resolves a dangling reference to "Removed …" (a source to none).
10. **Rules tolerate older documents.** A field added later is validated on the incoming document with `request.resource.data.get('field', default)` and compared against the stored value with `resource.data.get('field', default)`; every edit action backfills the new key with its empty value in the same write. A recipe's `sourceId` is the example in use: `isRecipe` lists it in `hasOnly` but not `hasAll`, reads it with `data.get('sourceId', null)` and accepts it missing, `null` or a string of 1 to 80 characters. (Reserved, not yet written: `plannedMeals.madeAt`, the `stock` collection.)
11. **No server-only collections and no new indexes.** The only queries are a single-field range on `plannedMeals.date` and an `array-contains` on `plannedMeals.refIds`, neither of which needs a composite index. The sources are listened to as a plain collection and filtered in the client, so they add no query and no index; `firestore.indexes.json` is unchanged, and the PR says so. Storage rules are unchanged too: a source has no file.
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
  match /sources/{id}      { /* same shape; id, label 1…80, createdAt, updatedAt */ }
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
interface MealsState          { items: Meal[];                    isLoaded: boolean }
interface PlannedMealsState   { items: PlannedMeal[]; windowKey: string | null; isLoaded: boolean }
export interface PinchState { settings: SettingsState; ingredients: IngredientsState; families: FamiliesState;
  stores: StoresState; products: ProductsState; recipes: RecipesState; sources: SourcesState; meals: MealsState; plannedMeals: PlannedMealsState }
```

Every slice resets on the shared `resetAllState`, so a user switch never shows the previous person's data.

**Two listener tiers**, both under `store/listeners/` and started from `usePinchSync(uid, shownMonth)` called once from `Pinch.tsx` (the only orchestrator); no tab, panel or drawer has an `onSnapshot` of its own:

1. **Signed-in user:** `startSettingsListener`, `startIngredientsListener`, `startFamiliesListener`, `startStoresListener`, `startProductsListener`, `startRecipesListener`, `startSourcesListener`, `startMealsListener` — `onSnapshot` of the kitchen document and each collection under `kitchens/{uid}`. One effect keyed on `uid`.
2. **Visible window:** `startPlannedMealsListener(uid, windowKey, onChange)` — `onSnapshot` of `plannedMeals` where `date >= windowStart` and `date < windowEnd`, a single-field range covering the window's centre month (`shownMonth`) plus `MONTH_WINDOW_PADDING` (2) months on each side. The effect is keyed on that month (`"2026-10"`). `CalendarScreen` moves the centre only when the view being shown reaches past the window (`isRangeInWindow`), so month paging restarts the listener about every second page and week or day paging seldom does. The slice keeps the previous window's documents until the new snapshot lands, so the grid never blanks while paging.

**Loading gate.** `Pinch.tsx` shows a skeleton until every user-tier slice `isLoaded` and the first window has landed. An empty kitchen (no settings document, no records) is a valid state that renders the empty Calendar; there is no first-run blocking modal. The settings listener is waited for but its failure never shows the error screen (the nudges simply stay open), since it only carries an enhancement, and the sources listener is the same: its first snapshot or error ends the gate (so the filter doesn't pop in after the list), and its error is left out of `selectPinchLoadError`.

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
| `createSource({ label })` | `setDoc` of a new source, or the id of the loaded source with the same label (ignoring case) without a write; returns the id |
| `renameSource({ id, label })` | field-scoped `updateDoc` of `label` and `updatedAt`; refuses a label another loaded source has ("You already have a source called …") |
| `removeSource(id)` | `writeBatch` (400 writes each) of the source's delete and `sourceId: null` on every loaded recipe that names it |
| `saveMeal(draft)` / `removeMeal(id)` | `setDoc`/`updateDoc`; meals are referenced only by `sourceMealId` (never read for display), so a meal is always deletable |
| `planMeal({ date, mealType, items, name, sourceMealId })` | `setDoc` of a new planned meal with `refIds` derived; a past date is frozen in the same write |
| `updatePlannedMeal(id, fields)` | a `runTransaction` that re-reads the meal, refuses a frozen one, then updates what the builder owns (`date`, `mealType`, `items`, `refIds`, `updatedAt`) |
| `removePlannedMeal(id)` | `deleteDoc` after `useActionModal().confirm({ destructive: true })` |
| `savePlannedAsMeal(plannedId, name)` | `setDoc` of a new meal from the planned meal's items; reads the planned meal from the store at tap time |
| `freezePastMeals()` | field-scoped `snapshot` writes for the loaded, unfrozen past meals: one `writeBatch` per 100, falling back to one `updateDoc` per meal when a batch is refused |

No cached document is ever written back whole. There is no cross-person concurrency, and the few create-if-absent cases above are the only transactions.

**Selectors** (`store/selectors.ts`): `createSelector` for everything that builds a new array or object, so no `useAppSelector` returns a fresh reference without `shallowEqual`.

- `selectIngredientsById` — catalog merged with records (a `Map`), memoized on the records
- `selectIngredientFamilies` — grouped list for Kitchen (Yours / All), archived hidden
- `selectDefaultProducts` — `Map<ingredientId, Product>`
- `selectRecipeCosts` — `Map<recipeId, RecipeCost>` computed once per change of recipes, products or ingredients
- `selectPlannedByDay` — `Map<dayKey, PlannedMeal[]>` read by the Calendar's `renderCell` and the day drawer, so a cell never filters the list
- `selectPeriodStats(state, startKey, endKey)` — one pass over the planned meals of the shown month, week or day (`getPeriodStats(range)`): spend, average per meal, what it leaves out, and the totals by day and by meal type that the breakdown reads (there is no separate day-totals selector)
- `selectSources`, `selectSourcesById`, `selectSourceCounts` — the sources A to Z, a `Map` of them, and the listed recipes counted per source (and without one) in one pass; the Recipes filter, the Sources list and a source's delete confirm read the counts
- `selectUsedIngredientIds` — the ingredients a recipe, a saved meal or an unfrozen planned day uses; Kitchen's "Yours", "Needs a price" and the "No price yet" notes read it
- `selectGaps(scope)` — scope-parameterized via a small factory; takes `showNutrition` and `dismissedNudges`
- Time-dependent selectors take `todayKey` as an argument (`useNow()` supplies it in the component)

**Overlay coordination.** The orchestrator owns one discriminated-union state: `subview: null | PinchSubview` (`{ kind: 'stores' } | { kind: 'products' } | { kind: 'sources' } | { kind: 'recipe'; id; method?; fromDrawer? } | { kind: 'plan'; ... } | { kind: 'meal'; id }`, where `method` is the way a new recipe already chose on a phone and `fromDrawer` says it was picked in the phone's start drawer), exposed through a small context (`usePinchOverlay`) so a full-page screen can never open on top of another. The context also carries `isStartOpen` / `setIsStartOpen` for the phone's recipe start drawer, which `Pinch.tsx` renders once so that Recipes, Calendar and a way's back button can all raise it. The other drawers and sheets (day, planned meal, recipe, meal, ingredient, breakdown, settings, fill-in) are opened from the screen that owns them. The recipe form's own row editors on a phone (the ingredient, step and nutrition drawers, one level deep) are the drawers allowed over a subview, and so is a `HelpTip`'s small modal, which is how the meal builder's cost warning opens on a phone or any touch screen. A drawer's action that opens a form closes the drawer first; the in-place "swap" screens (planned meal, save-as-meal) are components inside the drawer, not new overlays.

---

## Component Encapsulation

- **Screens read the store; presentation components take props.** `CalendarScreen`, `RecipesScreen` and `KitchenScreen` use `useAppSelector`; rows, cells and badges are pure.
- **App-aware pieces stay in the app** (`DayCell`, `MonthView`, `WeekView`, `DayView`, `MealChip`, `StatsRow`, `StoreLogo`, `GapNudge`, `CostLine`, `RecipeStart` (and its phone drawer), `RecipeReader`, `RecipeIngredients`, `RecipeSteps`, `NutritionReview`, `MealBuilder`, `ListViewControls` with `useListViewOptions`); anything whose props mention no kitchen entity comes from `src/components`, `src/hooks` or Dreamer UI: `SearchInput`, `PillGroup`, `PickOrCreate`, `SectionDivider`, `MoneyInput`, `FormSheet`, `Subview`, `CopyButton`, and the ones added with the redesign: `MacroStats` (with `src/utils/macroUtils.ts`), `HelpTip` (`variant='warning'`), `MethodPicker`, `FormSection`, `forms/Field`, `Stepper`, `FilterBar`, `PeriodSwitcher`, `ViewOptions` and `useLocalStorageState`.
- **Shared pieces and their rules.** `MethodPicker` is rows only: every `Method` carries its own `onPick`, and what happens next (a screen, a drawer closing) is the caller's. `Field` wraps its control in a native `<label>`, so a `Select` is not put inside one; `isCompact` gives it small captions for a grid of short fields, and `COMPACT_INPUT_CLASS` makes the input 40 px with a smaller placeholder while typed text stays 16 px so iOS doesn't zoom on focus. `ViewOptions` is the eye button (a drawer on a phone with Done in its footer, and Reset beside it once an option differs from its default; a popover from `sm`), tinted while customized, over `ViewOptionSwitch` rows (Pinch's `ListViewControls` shows its macros switch off and disabled, with a line saying how to turn them on, while no metric is switched on); `useLocalStorageState(key, default, parse)` is a `useSyncExternalStore` read of one `localStorage` key shared by every component using it, with a memory copy that is read first (so a write shows at once even when storage refuses it) and dropped when another tab changes the key (the `storage` event), and `parse` rejecting a stored value of the wrong shape. `PillGroup` never reorders what is visible: a chosen option that was hidden behind "Show all" takes the last visible slot, and the fully open list is in its original order; a pick-one group shows no "1 selected" count, a pick-several group still does. `FilterBar`'s apply button on a phone reads `doneLabel` ("Show 12 ingredients") and, at 360px and under, the optional `compactDoneLabel` ("Show 12"). `AddFieldChips` are at least 36px tall (`min-h-9`) and a long label wraps instead of clipping.
- **`Subview` and the back gesture.** `Subview`'s optional `onBack` is what the header's back button, an overlay subview's Escape and the browser's or phone's back gesture all call (`onBack ?? onClose`), so stepping back inside the subview, or asking before leaving, is one function (`useSubviewHistory(onClose, onBack)` keeps the subview's own history entry for the gesture; the header's back button is labelled "Back"). Escape is captured and ignored while a drawer or modal other than the subview's own layer is open (`hasDialogOnTop`, `src/utils/dialogUtils.ts`), and the gesture while one is open puts the history entry back and sends that dialog an Escape, so the drawer closes first and the subview stays.
- **`parseMoneyToCents`, `formatCents` and `centsToInputValue` move to `src/utils/moneyUtils.ts`** in the first Pinch PR that needs them (A-List keeps them in `apps/a-list/utils/money.ts` today); A-List's imports are updated in the same PR, per the "a second mini-app needs it" rule.
- **A quantity/unit select is built once** as `UnitSelect` from `UNIT_LABELS`; the ingredient row, the product form and the fill-in sheet all use it (`triggerClassName` sizes its button where it sits beside a compact input).
- **Closed means unmounted:** drawers' heavy bodies (the recipe drawer's step list, the breakdown rows, the store list) render only while open.

## UI Component Conventions Applied

- Forms: `FormSheet` for the ingredient, product, store and settings forms; `Subview` for the recipe form (behind the start list and the reading screens) and meal builder (`MealBuilder` renders its own `Subview`; `MealSubview` and `PlanMealSubview` are thin wrappers) and the stores, products and sources lists; the source form is a `FormSheet` (a drawer on a phone, a modal from `sm`); `DetailSheet` for day, planned meal, recipe, meal and ingredient details; `ModalFooterActions` with Cancel left, a `DeleteIconButton` beside it on edit, the primary alone on the right.
- Titles are plain nouns ("Recipe", "Product", "Store", "Meal", "Settings"); the verb is on the primary button and the destructive confirm.
- `PickOrCreate` for family, store and a recipe's source (its optional `maxLength` caps the typed label at 80, and `isFocusedOnOpen={false}` keeps the field from taking focus when the form opens with it filled in); `PillGroup` for meal type, "Start from a saved meal", the Month / Week / Day switch and the Recipes / Meals and Yours / All switches (`isThin`); `FilterBar` for the Kitchen ingredient and Products filters (its `trailing` slot carries the View options button; Kitchen always has it, and Recipes uses `FilterBar` only while some recipe has a source, with the same button in `trailing`, and otherwise puts the button beside its Recipes / Meals pills while the shown list has something in it); `FormSection` and `Field` lay out the recipe form, whose sections are all visible (no "+ Add X" chips) and whose row editors are drawers on a phone and in place from `sm`; `AppToggle` for the four nutrition switches and the View options switches; `SuggestionChips` is not used.
- Help and warning icons are `HelpTip`, and the `noModal` prop no longer exists: on a phone (below `sm`) or on any touch screen, whatever its width (`(hover: hover) and (pointer: fine)` doesn't match), the icon always opens a small modal ("Got it", with a hairline border); with a mouse from `sm` up it is a tooltip rendered in a portal on `document.body`, which `HelpTip` places itself (its `placement` side, flipped when that side has no room, clamped to the viewport, the arrow aligned with the icon) and measures again for about 24 animation frames after it opens, so a drawer still sliding in doesn't leave it misplaced. The tooltip opens on mouse hover (pointer events, mouse only) and on keyboard focus (`:focus-visible`, so not for a dialog's initial focus) and closes on leave and blur; a click opens it and keeps it open instead of toggling. Escape closes a tooltip without stopping the event, so a drawer under it still gets it; a modal's Escape is captured so only the modal closes. A `linkLabel` opens the modal at every size.
- Recipes' Source filter is one pick-one `PillGroup` in a `FilterBar` (a drawer on a phone, a popover from `sm`): the pills are the sources some listed recipe has, with their counts, plus "Any" and, when needed, "No source · n"; the chip reads "From {label}" (or "No source"); an empty result offers "Clear filter". The Sources entry is Kitchen's `EntryRow`, moved to `components/shared/EntryRow.tsx` for both screens, and shows only while at least one source exists.
- Kitchen's price filters read `defaultProducts` and `usedIds` (`applyIngredientFilters`): "Needs a price" is used by something and has no default product, "Has a price" has one, so both only ever match Yours even with All picked. The filter panel says so, the count beside "Ingredients" is "N of M" with M counting Yours while a price filter is on, and the empty state offers "Look through everything" only when All would find something.
- Rows are top-aligned (`items-start`): `RecipeRow`, `MealRow`, the calendar's `MealRow` and the Stores rows put the image or tile's top edge level with the title's and keep the chevron on the first line; `IngredientRow` and the Products rows do the same with the chevron and, on Products, the price.
- A `StatTile` with a help icon keeps `pr-6` clear of it on a phone (the icon sits in the tile's corner), and the stats row's `FittedValue` steps a number of 7 or more characters down a size below `sm` and one of 6 or more to `text-xs` at 360px and under, so a long total stays clear of the icon.
- The recipe step drawer focuses its text box about 350 ms after it opens, once the drawer has finished sliding in, rather than with `autoFocus`.
- Lists search from `LIST_SEARCH_THRESHOLD` rows; Kitchen groups by family with `SectionDivider` and mounts a family group only near the viewport (`LazyMount`).
- Images from URLs (a recipe cover, a store logo) are `FallbackImage` with a themed fallback (a tinted emoji tile, a letter tile).
- Delete confirmations go through `useActionModal().confirm` with `destructive: true` and say what archiving means when something is in use.

## Theming

- `src/apps/pinch/pinch.css` overrides Dreamer UI's semantic tokens on `html.pinch-theme`: paper-cream (warm black in dark) surfaces with hairline borders, an espresso-ink `--color-primary` for the one filled action, see-through secondary buttons, peach tints (`--color-accent`, `--pinch-drizzle-soft`) for chips, groups and the selected pill, and warm orange (`--pinch-drizzle`) as the accent (today dot, selected outline, active tab, the default product's star); `--radius-md` and up raised for a rounded counter feel; field text inset; hairline option pills that take a peach tint and a drizzle outline when selected; tertiary buttons use the normal text colour. `usePinchTheme()` adds the class to `<html>` only while the app is mounted.
- Meal-type colours are tokens, not raw palette classes (`--pinch-meal-breakfast … --pinch-meal-drink`, each with a `-soft` tint for the calendar's chips and pills), checked on a chip and a pill in light and dark.
- The Pinch rules file is written in the same PR as the shell: `.github/instructions/pinch.instructions.md` with an identical `.claude/rules/pinch.md` (metaphor: a warm kitchen; palette roles; shape language; what the emoji mean; calendar chip and pill anatomy; nudge wording; missing details appear only as in-context nudge lines).

---

## Security & Privacy Requirements

- **Private by construction.** A person's kitchen is readable and writable only by them. There is no admin read; Security Rules Design Criteria #1–2 are the whole access model. Nothing in the MVP is shared or public.
- **What leaves the app, and where it goes.** (1) Pasted text or a chosen file (a photo, screenshot or PDF) goes to Firebase AI (Gemini) to be read into a recipe draft; the provider sees the content, not the person's identity beyond Firebase's own request metadata, and the screen says an AI reads it and that it isn't saved. (2) A recipe link goes to our `fetchPageContent` function, which fetches the page from Google's servers (signed-in only, http/https only, private networks refused) and returns only what Pinch asks for (the page's text, its title and meta description, and any Recipe data) without storing anything; the client then sends that content, not the link, to the AI reader. (3) Store logos are requested by the person's browser from the logo service by domain only (well-known stores only); a person's own stores never leave Storage. Nothing else leaves: there is no copy-out of recipes, plans or ingredient lists.
- **The logo service's key is a publishable browser token**, domain-restricted at the provider, kept in an env var (`VITE_STORE_LOGO_TOKEN`) and sent only in the logo request's URL. It is not a secret and is not a Functions secret; if the chosen provider needs a secret, the logo route moves behind an `onCall` instead.
- **Stored data minimization.** No location, no payment details, no card data, no receipt images are stored. A product stores store, price, size and an optional link; a recipe stores what the person typed or reviewed, and a source is only a label they typed.
- **Persistence on the device.** Nothing from the person's own documents is persisted beyond Firestore's own cache. No TanStack query in the MVP carries `meta: { persist: true }`; the catalog is code, not a query. The one thing Pinch writes to the browser itself is each list's View options, as small JSON in `localStorage` under `pinch:{uid}:view:{recipes|ingredients}` (Recipes and Meals share the first): three display choices and no kitchen data; the key carries the uid, so someone else signing in on the same browser doesn't read it, and nothing clears it on sign-out.
- **Links are https-only** and shown with `ExternalLinkText`.
- **Rules are verified against the emulator, not by the UI hiding a control:** the owner allowed and a second signed-in user denied on every path (kitchen document and all eight collections, plus Storage), signed-out denied; and one denied write per integrity rule (snapshot overwrite, `priceCents` negative, `sizeAmount` 0, an unknown `unit`, a `date` that isn't UTC midnight, a 61st recipe ingredient, an `http://` link).
- **Terms and licences are a gate, not a footnote:** the USDA FoodData Central licence (catalog nutrition) and the logo service's terms and attribution are each confirmed in the PR that ships the thing that uses them, with the logo credit in an About row in Settings. Pinch vendors no other third-party asset since the ingredient icons were removed.

---

## Performance

- **Scale fixture.** `npm run seed:pinch-scale` (`scripts/seeds/pinchScale.ts`, opt-in) fills Taylor's kitchen: 300 custom ingredients across 40 families, 150 products across 12 stores, 200 recipes of 3–8 ingredients (about two in three with one of 12 sources, one of them with a 73-character label, the first holding the most), 60 saved meals, and about 1,100 planned meals from 45 days back to 45 days ahead (12 a day). Every list or per-row feature is opened on it at phone width (390×844) with the dev build throttled 4× (CDP `Emulation.setCPUThrottlingRate`), switching Calendar ↔ Recipes ↔ Kitchen. The numbers from the last pass are in the PR that added it.
- **Never freeze the same meal twice, and freeze in batches.** The load-time freeze of ~540 past meals took the page down twice over: a write per meal raised one snapshot event each, and the list of unfrozen meals shrinking after each event started another freeze of the rest (quadratic writes, most of them refused by the write-once rule). It is now one batch per 100 meals (one event each), each meal is submitted once per visit (`useFreezePastDays`), and a refused batch falls back to a write per meal.
- **One pass, then lookups.** `selectRecipeCosts`, `selectPeriodStats` and `selectSourceCounts` compute in one walk and are memoized; no cell, row or drawer recomputes a recipe's cost. The Calendar's `renderCell` reads `selectPlannedByDay` only.
- **Build once.** The currency `Intl.NumberFormat` and the catalog lookup maps are module-level; the search index is built on first use.
- **Cap what's drawn.** Kitchen mounts a family group near the viewport and the recipe list mounts twenty rows at a time (`LazyMount`); recipe and ingredient pickers show the top matches; the breakdown caps at one month of rows. A calendar cell builds a hover popover only on a computer, and the card's content only while it is open; a phone's cell is just its chips. A week's agenda shows six rows a day then "Show N more", and Products caps its rows at 60 with "Show 60 more". The `LazyMount` height estimates follow the View options (a row with its price or macro line hidden is shorter).
- **What is not ours.** A cold first load of the fixture (about 1,900 documents) spends most of its time inside the Firestore SDK ingesting them into its local cache, and so does paging far enough to move the planned-meals window (the listener restarts). Both are measured in the PR and left alone; later visits read the persistent cache.
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
│   ├── usePinchSync.ts  usePinchTheme.ts  usePinchOverlay.ts  useFreezePastDays.ts  useStorageImageUrl.ts
│   └── useListViewOptions.ts       # a list's View options, per person, over useLocalStorageState
├── lib/
│   └── extractRecipe.ts            # text, file and page readers, response schema, error mapping
├── queries/
│   └── storageImageQueries.ts  recipePageQueries.ts   # recipePageQueries: text, meta and Recipe data of a page
├── store/
│   ├── index.ts  selectors.ts
│   ├── slices/     settingsSlice.ts  ingredientsSlice.ts  familiesSlice.ts  storesSlice.ts
│   │               productsSlice.ts  recipesSlice.ts  sourcesSlice.ts  mealsSlice.ts  plannedMealsSlice.ts
│   ├── actions/    settingsActions.ts  ingredientActions.ts  storeActions.ts  productActions.ts
│   │               recipeActions.ts  sourceActions.ts  mealActions.ts  plannedMealActions.ts
│   │               freezeActions.ts  usageActions.ts
│   └── listeners/  kitchenListeners.ts
├── utils/
│   ├── quantity.ts  unitCost.ts  recipeMath.ts  mealMath.ts  nutritionMath.ts  nutrition.ts
│   ├── dayKeys.ts  stats.ts  gaps.ts  references.ts  resolveIngredient.ts  ingredientRecord.ts
│   ├── ingredientMatch.ts  catalogSearch.ts  normalizeRecipe.ts  storeLogo.ts  nutritionBasis.ts
│   └── mealFormat.ts  recipeFormat.ts  productFormat.ts  sources.ts
└── components/
    ├── shell/       PinchNav.tsx  LoadingSkeleton.tsx
    ├── calendar/    CalendarScreen.tsx  MonthView.tsx  WeekView.tsx  DayView.tsx  DayCell.tsx
    │                MealRow.tsx  MealChip.tsx  StatsRow.tsx  DayDrawer.tsx  DayPeek.tsx
    │                PlannedMealView.tsx  BreakdownDrawer.tsx
    ├── plan/        PlanMealSubview.tsx  MealBuilder.tsx  ItemSearch.tsx
    ├── recipes/     RecipesScreen.tsx  RecipeRow.tsx  RecipeSubview.tsx  RecipeStart.tsx  RecipeReader.tsx
    │                RecipeForm.tsx  recipeFormModel.ts  RecipeIngredients.tsx  RecipeSteps.tsx  NutritionReview.tsx
    │                RecipeDrawer.tsx  MealRow.tsx  MealDrawer.tsx  MealSubview.tsx
    │                SourcesSubview.tsx  SourceFormSheet.tsx
    ├── kitchen/     KitchenScreen.tsx  ingredientFilters.ts  IngredientRow.tsx  FamilyGroup.tsx
    │                IngredientDrawer.tsx  IngredientFormSheet.tsx  ProductFormSheet.tsx
    │                StoresSubview.tsx  StoreFormSheet.tsx  StorePicker.tsx  ProductsSubview.tsx
    ├── settings/    SettingsSheet.tsx
    └── shared/      GapNudge.tsx  CostLine.tsx  FillInSheet.tsx  StoreLogo.tsx  CoverImage.tsx  UnitSelect.tsx
                     ListViewControls.tsx  EntryRow.tsx

src/components/     MacroStats  MethodPicker  FormSection  forms/Field  Stepper  FilterBar  PeriodSwitcher  HelpTip  ViewOptions
src/hooks/useLocalStorageState.ts  useSubviewHistory.ts   src/utils/macroUtils.ts  dialogUtils.ts   src/lib/pageContent/ (fetchPageContent.ts  pageContentQueries.ts)
functions/src/linkMetadata/fetchPageContent.ts  safeFetch.ts
scripts/seeds/pinch.ts  pinchScale.ts
scripts/catalog/buildCatalog.ts
scripts/checks/pinchMath.ts          # npm run check:pinch-math
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
