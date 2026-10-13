# Pinch — UX & Interaction Design

*All names, dates and dollar amounts in the diagrams are illustrative.*

## Design Principles

| Principle | Means |
|---|---|
| One border, not nested ones | a card gets a single bordered shell with a flat interior — never border-in-a-border; groups inside a screen are separated with `SectionDivider` or spacing |
| Phone first | one narrow column with a floating pill at the bottom — Calendar · **Recipes** · Kitchen, as wide as its three tabs; from `lg` up the same tabs stand in a rail on the left edge, and the rest reflows with no parallel desktop layout |
| The counter, not a form | Pinch asks for a name and little else. A price, a package size or a nutrition value is invited by a quiet line exactly where it changes a number, and always optional |
| Drawers for looking and quick edits, subviews for building | an ingredient, a day, a planned meal and a recipe's detail open in `DetailSheet` drawers; a recipe, a meal and the stores and products lists are page-sized and open as `Subview`s; short forms (ingredient, product, store, settings) are `FormSheet`s |
| Never overlay on overlay | whatever continues inside an open drawer swaps its content in place with a "‹ Back" link; a drawer whose action opens a form or another container closes first. Only a destructive confirm may sit on top |
| Numbers explain themselves | a cost with gaps carries a warning icon (`HelpTip variant='warning'`) that says what the total leaves out; a stat that isn't self-evident carries a `HelpTip`; past days are labelled as frozen |
| Nothing leaves without saying what | an AI reads what the person hands it (pasted text, a photo or PDF, or a recipe page's data and text) and says so, and that nothing is saved; a link goes to our server, which fetches the page, and nothing else leaves the app |
| Dreamer UI first | `Calendar` (with `renderCell`), `Form`, `Drawer`, `Popover`, `Tabs`, `Badge` — custom only where the catalog has nothing: the day cell and the store logo tile |
| Honest AI | an AI reads a pasted recipe, photo, PDF or web link and fills the real form; it names what it couldn't read; nothing is saved until the person confirms |


```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  N1["❌ Nested borders"]:1
  N2["✅ One shell"]:1
  N3["Content"]:1
  N4["Content flows freely"]:1
  style N1 fill:transparent,stroke:#888888,stroke-width:1px;
  style N2 fill:transparent,stroke:#888888,stroke-width:1px;
  style N3 fill:transparent,stroke:#888888,stroke-width:1px;
  style N4 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Honest caveats: (1) Dreamer UI's `Calendar` hands `renderCell` only the date (a local-midnight `Date`) and no month-change callback, so each cell's meal chips come from a day-keyed lookup built up front, not a per-cell query. (2) A cell that holds up to three chips or pills plus a "+N" is taller than Dreamer UI's default square; like A-List's poster cells it needs `cellClassName` and `monthGridClassName` overrides. (3) Store logos come from a third-party logo service and can be missing, so every logo tile has a letter fallback.*

## Sitemap

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart TD
    A[First launch] --> D["Calendar, empty: zeros and two nudges 'Plan your first meal' · 'Add a recipe'"]
    subgraph Bar["Bottom bar"]
        D2["Calendar"]
        R["Recipes · centre"]
        K["Kitchen"]
    end
    D --> D2
    D2 ~~~ R ~~~ K
    D2 -->|gear| SET["Settings sheet · nutrition switches"]
    D2 -->|switch view| VW["Month · Week · Day · Today button"]
    D2 -->|tap the stats row| BRK["Breakdown drawer · by day / by meal"]
    D2 -->|tap a day| DD["Day drawer"]
    D2 -.->|hover a day, desktop| PK["Day peek popover"]
    DD -->|+ Add| PM["Plan a meal subview · day, meal type, items with servings"]
    DD -->|tap a meal| PMD["Planned meal · swaps in place"]
    PMD -->|Change items or servings| PM
    PMD --> SAV["Save as a meal · swaps in place"]
    PMD --> RM["Remove confirm"]
    R --> RL["Recipes list · pills: Recipes / Meals"]
    RL -->|+ New| RS["Start picker · text, photo, link or write it yourself"]
    RS --> RF["Recipe subview · the reading fills the form"]
    RL -->|tap a recipe| RD["Recipe drawer · cost, nutrition, ingredients, steps"]
    RD -->|Modify| RF
    RD -->|Add to calendar| PM
    RL -->|Meals pill| ML["Saved meals list"]
    ML -->|+ New or tap Modify| MF["Meal subview · same builder, no day"]
    ML -->|tap a meal| MD["Meal drawer"]
    MD -->|Plan it| PM
    K --> KL["Ingredients list · Yours / All · search and filters"]
    KL -->|+ New| IF["Ingredient form sheet"]
    KL -->|tap an ingredient| ID["Ingredient drawer · nutrition, products, used in"]
    ID -->|Add a product| PF["Product form sheet · store picker"]
    KL --> ST["Stores subview"]
    ST -->|+ Add| SF["Store form sheet · pick from the list or add your own"]
    KL --> PR["Products subview · by store"]
    PR -->|+ New product| PF
    RD -.->|nudge| FI["Fill-in sheet · prices and sizes"]
    KL -.->|nudge| FI
    D2 -.->|nudge| FI
    style Bar fill:transparent,stroke:#888888,stroke-width:1px;
```
*A nudge is a line, not a destination: wherever a number leaves something out, the line offers the same short fill-in sheet, and closing the line keeps it away for that ingredient. Every gap lives only in the screen where it changes a number.*

## Screens

*The persistent shell, shown once and left out of the screens below:*

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 4
  B1["🗓️ Calendar"]:1
  B2["[ 🍲 RECIPES ]"]:2
  B3["🧺 Kitchen"]:1
  style B1 fill:transparent,stroke:#888888,stroke-width:1px;
  style B2 fill:transparent,stroke:#888888,stroke-width:3px;
  style B3 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Navigation is a floating pill at the bottom of a phone, as wide as its three tabs (never stretched edge to edge), and a rail on the left from `lg` up. The app opens to Calendar, the left tab; the active tab gets a soft peach fill and orange on its icon, the only orange in the bar. Later Kitchen entries (stock, prepared servings, shopping list) join the Kitchen tab and do not add a fourth tab.*

*From `lg` up the screens use the width: the month's cells become Google-Calendar-style pills that name each meal (its first item, `+N` for more) where a phone shows emoji chips, Week is seven columns where a phone has a vertical agenda, and Recipes and Kitchen run in two columns. The phone layout is unchanged.*

**First launch — Calendar, empty** (no setup steps: Pinch is usable the moment it opens)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  F3["Calendar   ⚙️   + Add"]:2
  F1["Spent this month<br/>$0.00"]:1
  F2["Average per meal<br/>—"]:1
  F4["An empty month is fine. Plan your first meal, or add a recipe to plan from."]:2
  F5["Plan your first meal"]:1
  F6["Add a recipe"]:1
  style F1 fill:transparent,stroke:#888888,stroke-width:1px;
  style F2 fill:transparent,stroke:#888888,stroke-width:1px;
  style F3 fill:transparent,stroke:#888888,stroke-width:1px;
  style F4 fill:transparent,stroke:#888888,stroke-width:1px;
  style F5 fill:transparent,stroke:#888888,stroke-width:1px;
  style F6 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Two nudges and nothing else: no setup modal, no required choices. Nutrition stays off until the person turns it on in settings; the stats row's help link ("Want calories or protein here?") opens the same settings sheet.*

**Calendar** (home tab)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 7
  C1["Calendar   ⚙️   + Add"]:7
  C2["‹   October 2026   ›   [ Month ] Week Day"]:7
  C3["Spent this month<br/>$412.60 ⚠"]:3
  C4["Avg per meal<br/>$5.80"]:2
  C5["Per g protein<br/>$0.04"]:2
  C6["Daily average this month<br/>🔥 1,840 · 💪 96g (the ones switched on)"]:7
  C7["2 ingredients need a price · Add prices   ✕"]:7
  C8["S"]:1
  C9["M"]:1
  C10["T"]:1
  C11["W"]:1
  C12["T"]:1
  C13["F"]:1
  C14["S"]:1
  C15["11"]:1
  C16["12"]:1
  C17["13 ● today<br/>🍳 🍝 🍰"]:1
  C18["14<br/>🥪"]:1
  C19["15"]:1
  C20["16<br/>🍝 🍿"]:1
  C21["17"]:1
  C22["18"]:1
  C23["19"]:1
  C24["20"]:1
  C25["21"]:1
  C26["22"]:1
  C27["23"]:1
  C28["24"]:1
  style C1 fill:transparent,stroke:#888888,stroke-width:1px;
  style C2 fill:transparent,stroke:#888888,stroke-width:1px;
  style C3 fill:transparent,stroke:#888888,stroke-width:1px;
  style C4 fill:transparent,stroke:#888888,stroke-width:1px;
  style C5 fill:transparent,stroke:#888888,stroke-width:1px;
  style C6 fill:transparent,stroke:#888888,stroke-width:1px;
  style C7 fill:transparent,stroke:#888888,stroke-width:1px;
  style C8 fill:transparent,stroke:#888888,stroke-width:1px;
  style C9 fill:transparent,stroke:#888888,stroke-width:1px;
  style C10 fill:transparent,stroke:#888888,stroke-width:1px;
  style C11 fill:transparent,stroke:#888888,stroke-width:1px;
  style C12 fill:transparent,stroke:#888888,stroke-width:1px;
  style C13 fill:transparent,stroke:#888888,stroke-width:1px;
  style C14 fill:transparent,stroke:#888888,stroke-width:1px;
  style C15 fill:transparent,stroke:#888888,stroke-width:1px;
  style C16 fill:transparent,stroke:#888888,stroke-width:1px;
  style C17 fill:transparent,stroke:#888888,stroke-width:1px;
  style C18 fill:transparent,stroke:#888888,stroke-width:1px;
  style C19 fill:transparent,stroke:#888888,stroke-width:1px;
  style C20 fill:transparent,stroke:#888888,stroke-width:1px;
  style C21 fill:transparent,stroke:#888888,stroke-width:1px;
  style C22 fill:transparent,stroke:#888888,stroke-width:1px;
  style C23 fill:transparent,stroke:#888888,stroke-width:1px;
  style C24 fill:transparent,stroke:#888888,stroke-width:1px;
  style C25 fill:transparent,stroke:#888888,stroke-width:1px;
  style C26 fill:transparent,stroke:#888888,stroke-width:1px;
  style C27 fill:transparent,stroke:#888888,stroke-width:1px;
  style C28 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Month view, the default (`?view=week|day` switches). The grid starts on Sunday because Dreamer UI's `Calendar` can't start a week on Monday, and the week view starts on Sunday to match. Under the header's gear and Add, the period row above the grid is Pinch's own (the Calendar's own header is hidden): arrows that step by the view's unit, the period's title, a thin Month / Week / Day switch, and a **Today** button that appears only while today is outside the period shown. Each planned meal is a chip on a soft tint of its meal-type colour (🍳 breakfast, 🥪 lunch, 🍝 dinner, 🍿 snack, 🍰 dessert, 🥤 drink); a phone's cell shows meal emoji chips, with a fourth meal becoming "+N", and from `lg` the chips become Google-Calendar-style pills with the meal's truncated title (its first item, "+N" for more). Today takes the orange dot on its number and the selected day a ring. Past days read exactly as they were that day. The stats row sits above the grid and describes the period shown ("Spent this week" in Week): Spent (with a warning icon in place of a "leaves out" line), Avg per meal and, when protein is on, Per g protein, then the calories and macros switched on as small emoji tiles labelled "Daily average this month" ("this week"; "Nutrition that day" in Day), at most one quiet nudge line ("2 ingredients need a price · Add prices"), and a "See the breakdown" link that opens the drawer. Tapping a day opens its drawer; on a computer, hovering a day opens a peek popover with the same content.*

| View | Phone (below `lg`) | From `lg` |
|---|---|---|
| Month | emoji chips on a soft tint, 3 at most, a fourth becomes "+N" | pills with the meal's truncated title (first item, "+N"), 3 at most then "+N more" |
| Week | a vertical agenda of 7 days, 6 meal rows a day then "Show N more" | 7 columns, 5 meals a day then "+N more" |
| Day | the day's meals grouped in meal order, each as a row | the same |

| Month cell contents | What `renderCell` draws |
|---|---|
| no meals | the date number only |
| 1–3 meals | one chip (or pill) per meal in meal-type order |
| 4+ meals | the first chips and a small "+N" |
| past day with a meal that was never marked made | shown the same; marking made arrives with stock tracking |

**Week** (phone agenda)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  C1["‹   Oct 11 – 17   ›   Month [ Week ] Day   Today"]:2
  C2["Spent this week<br/>$96.20 ⚠"]:1
  C3["Avg per meal<br/>$5.10"]:1
  C4["Sun 11"]:1
  C5["—"]:1
  C6["Tue 13 ●"]:1
  C7["🍳 Oats · 🍝 Adobo chicken +1"]:1
  C8["Wed 14"]:1
  C9["🥪 Burrito bowl"]:1
  style C1 fill:transparent,stroke:#888888,stroke-width:1px;
  style C2 fill:transparent,stroke:#888888,stroke-width:1px;
  style C3 fill:transparent,stroke:#888888,stroke-width:1px;
  style C4 fill:transparent,stroke:#888888,stroke-width:1px;
  style C5 fill:transparent,stroke:#888888,stroke-width:1px;
  style C6 fill:transparent,stroke:#888888,stroke-width:1px;
  style C7 fill:transparent,stroke:#888888,stroke-width:1px;
  style C8 fill:transparent,stroke:#888888,stroke-width:1px;
  style C9 fill:transparent,stroke:#888888,stroke-width:1px;
```
*A day with meals lists them as rows (the meal's emoji and title); a day with none is a quiet dash that still opens its drawer. Switching views keeps you on the selected day (or today), and Day shows that one day's meals with its own totals.*

**Day drawer** (tap a day; swaps in place to a planned meal)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  D1["Tue, Oct 13"]:1
  D2["$18.40"]:1
  D3["🍳 Breakfast"]:2
  D4["Oats with berries · 1 serving"]:1
  D5["$1.20"]:1
  D6["🍝 Dinner"]:2
  D7["Adobo chicken · 2 servings"]:1
  D8["$6.40"]:1
  D9["Cilantro lime rice · 2 servings"]:1
  D10["$2.70"]:1
  D11["+ Add to this day"]:2
  style D1 fill:transparent,stroke:#888888,stroke-width:1px;
  style D2 fill:transparent,stroke:#888888,stroke-width:1px;
  style D3 fill:transparent,stroke:#888888,stroke-width:1px;
  style D4 fill:transparent,stroke:#888888,stroke-width:1px;
  style D5 fill:transparent,stroke:#888888,stroke-width:1px;
  style D6 fill:transparent,stroke:#888888,stroke-width:1px;
  style D7 fill:transparent,stroke:#888888,stroke-width:1px;
  style D8 fill:transparent,stroke:#888888,stroke-width:1px;
  style D9 fill:transparent,stroke:#888888,stroke-width:1px;
  style D10 fill:transparent,stroke:#888888,stroke-width:1px;
  style D11 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Meals are grouped by meal type, each group under its emoji; a meal with several items lists them as flat rows beneath one heading, so a meal never looks like several separate meals. A day with no meals says so in one muted line with "+ Add to this day" in the header. A past day shows a muted "Prices as they were that day" line under the title. A past meal opened from it has no Modify: a muted line says the day has passed and to remove the meal and add it again.*

**Planned meal** (tap a meal in the day drawer; swaps in place with "‹ Back")

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  P1["‹ Back"]:1
  P2["🍝 Dinner · Tue, Oct 13"]:1
  P3["Adobo chicken"]:1
  P4["2 servings · $6.40"]:1
  P5["Cilantro lime rice"]:1
  P6["2 servings · $2.70"]:1
  P7["Salsa"]:1
  P8["1 serving · $0.80"]:1
  P9["Cost $9.90 ⚠ · 🔥 640 · 💪 48g (for the plate, when on)"]:2
  P10["Remove from this day"]:2
  P11["Modify"]:1
  P12["Save as a meal"]:1
  style P1 fill:transparent,stroke:#888888,stroke-width:1px;
  style P2 fill:transparent,stroke:#888888,stroke-width:1px;
  style P3 fill:transparent,stroke:#888888,stroke-width:1px;
  style P4 fill:transparent,stroke:#888888,stroke-width:1px;
  style P5 fill:transparent,stroke:#888888,stroke-width:1px;
  style P6 fill:transparent,stroke:#888888,stroke-width:1px;
  style P7 fill:transparent,stroke:#888888,stroke-width:1px;
  style P8 fill:transparent,stroke:#888888,stroke-width:1px;
  style P9 fill:transparent,stroke:#888888,stroke-width:1px;
  style P10 fill:transparent,stroke:#888888,stroke-width:1px;
  style P11 fill:transparent,stroke:#888888,stroke-width:1px;
  style P12 fill:transparent,stroke:#888888,stroke-width:1px;
```
*A Cost tile (its warning icon says what the total leaves out) and, when nutrition is on, the plate's calories and macros as emoji tiles sit above the items. The footer holds Modify (secondary, left) beside the one primary, "Save as a meal"; Modify closes the drawer and opens the Plan a meal subview, and is absent on a past day. "Remove from this day" is the red row at the end of the body, with a confirm. Saving as a meal swaps the drawer in place to a single name field and a Save button.*

**Plan a meal** (subview; also the editor for an already planned meal)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  M1["‹ Adobo chicken +2"]:2
  M2["Tue, Oct 13 · 🍝 Dinner      Change"]:2
  M3["Start from a saved meal"]:2
  M4["+ New"]:1
  M5["Taco night"]:1
  M6["Chicken + rice"]:1
  M7["Breakfast bowl"]:1
  M8["What's on the plate?"]:2
  M9["🔍 Search recipes, ingredients"]:2
  M10["Adobo chicken"]:1
  M11["− 2 +"]:1
  M12["Cilantro lime rice"]:1
  M13["− 2 +"]:1
  M14["Doritos (nacho cheese)"]:1
  M15["− 1 +"]:1
  M16["Cost $11.20 ⚠ · 🔥 1,150 · 💪 64g"]:2
  M17["Cancel"]:1
  M18["Add to today"]:1
  style M1 fill:transparent,stroke:#888888,stroke-width:1px;
  style M2 fill:transparent,stroke:#888888,stroke-width:1px;
  style M3 fill:transparent,stroke:#888888,stroke-width:1px;
  style M4 fill:transparent,stroke:#888888,stroke-width:1px;
  style M5 fill:transparent,stroke:#888888,stroke-width:1px;
  style M6 fill:transparent,stroke:#888888,stroke-width:1px;
  style M7 fill:transparent,stroke:#888888,stroke-width:1px;
  style M8 fill:transparent,stroke:#888888,stroke-width:1px;
  style M9 fill:transparent,stroke:#888888,stroke-width:1px;
  style M10 fill:transparent,stroke:#888888,stroke-width:1px;
  style M11 fill:transparent,stroke:#888888,stroke-width:1px;
  style M12 fill:transparent,stroke:#888888,stroke-width:1px;
  style M13 fill:transparent,stroke:#888888,stroke-width:1px;
  style M14 fill:transparent,stroke:#888888,stroke-width:1px;
  style M15 fill:transparent,stroke:#888888,stroke-width:1px;
  style M16 fill:transparent,stroke:#888888,stroke-width:1px;
  style M17 fill:transparent,stroke:#888888,stroke-width:1px;
  style M18 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Opens on the day and meal type it came from (pills under "Change"). "Start from a saved meal" is a captioned row of pills shown while the plate is empty (nothing preselected); picking one copies its items onto the day. The search finds recipes and ingredients in one list with a small kind label on each result; a picked one joins the plate with one serving. Each row has its name on its own line (it wraps, never truncates) and, beneath it, a compact `Stepper` for servings (halves allowed) with what one serving is ("servings · 1 serving = 28 g", "Recipe serves 4") and a remove control. The header carries the meal's name, or the first item and "+N" while a plate is being planned, and a tinted summary at the end shows the cost, a warning icon that says what it leaves out (a tooltip, never a sheet) and the plate's emoji macros when nutrition is on. The footer says "Add to today" when the day is today. When the meal has two or more items a "Save as a meal" switch appears above the footer and reveals a name field. Adding a one-item meal is the same screen with one row.*

**Recipes tab**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  R1["Recipes"]:1
  R2["+ New"]:1
  R3["[ Recipes ]   Meals"]:2
  R4["🔍 Search (from 8 recipes)"]:2
  R5["🖼️ Adobo chicken"]:1
  R6["$3.20 / serving"]:1
  R7["4 servings · 45 min · 🔥 520 (when on)"]:2
  R8["🖼️ Cilantro lime rice"]:1
  R9["$1.35 / serving"]:1
  R10["4 servings · 25 min"]:2
  style R1 fill:transparent,stroke:#888888,stroke-width:1px;
  style R2 fill:transparent,stroke:#888888,stroke-width:1px;
  style R3 fill:transparent,stroke:#888888,stroke-width:1px;
  style R4 fill:transparent,stroke:#888888,stroke-width:1px;
  style R5 fill:transparent,stroke:#888888,stroke-width:1px;
  style R6 fill:transparent,stroke:#888888,stroke-width:1px;
  style R7 fill:transparent,stroke:#888888,stroke-width:1px;
  style R8 fill:transparent,stroke:#888888,stroke-width:1px;
  style R9 fill:transparent,stroke:#888888,stroke-width:1px;
  style R10 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Two thin pills switch between Recipes and Meals (saved meals). A recipe row shows its cover (or a tinted emoji tile), title, cost per serving, and a muted line of servings and time, with calories and macros per serving, as emoji figures, when they are on. A recipe with an unpriced ingredient shows the cost it can stand behind with a small warning icon beside it that says what it leaves out. A meal row shows its items as a comma line and the total.*

**New recipe — how to start** (subview; a new recipe opens here, editing one skips it)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 1
  S1["‹ New recipe"]
  S2["📝 From text · Paste a recipe, say from a chat"]
  S3["📷 From a photo · A picture, screenshot or PDF"]
  S4["🔗 From a link · A recipe page on the web"]
  S5["✍️ Write it yourself · Start with a blank recipe"]
  style S1 fill:transparent,stroke:#888888,stroke-width:1px;
  style S2 fill:transparent,stroke:#888888,stroke-width:1px;
  style S3 fill:transparent,stroke:#888888,stroke-width:1px;
  style S4 fill:transparent,stroke:#888888,stroke-width:1px;
  style S5 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Four ways in, in this order, with writing it yourself last and quieter (dashed). Text and link open their input in place under the row, one at a time; a photo opens the file picker straight away. Each AI reading fills the real form and says so ("Filled in from {source}. Take a look before you save." plus "We couldn't read: …"); nothing is saved until the form is. Link reading opens the page on our server (never the person's device) and sends its recipe data and text to the reader. The header names the recipe as it is typed ("New recipe" until then).*

| Reading state | What you see |
|---|---|
| reading | "Reading {source}…" with the rows disabled |
| failed | one warm sentence under the rows ("We couldn't open that link. Try again, or paste the recipe's text instead."), details logged, never the service's message |
| too big | "That file is too big to read. Try a photo or a PDF under 10 MB." |
| no recipe found | "We couldn't find a recipe in that. Try a clearer photo or paste the text." |

**Recipe** (subview — create and edit)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  E1["‹ Adobo chicken"]:2
  E2["Title"]:2
  E3["Servings"]:1
  E4["[ − 4 + ]"]:1
  E5["Prep (min)"]:1
  E6["Cook (min)"]:1
  E7["Photo"]:2
  E8["Description"]:2
  E9["INGREDIENTS 6"]:2
  E10["Chicken thighs"]:1
  E11["2 lb"]:1
  E12["+ Add ingredient"]:2
  E13["STEPS"]:2
  E14["+ Add a step"]:2
  E15["NUTRITION · calculated, per serving   Edit"]:2
  E16["🔥 495 · 💪 61g · 🌾 3g · 🥑 25g"]:2
  E17["Cancel"]:1
  E18["Save"]:1
  style E1 fill:transparent,stroke:#888888,stroke-width:1px;
  style E2 fill:transparent,stroke:#888888,stroke-width:1px;
  style E3 fill:transparent,stroke:#888888,stroke-width:1px;
  style E4 fill:transparent,stroke:#888888,stroke-width:1px;
  style E5 fill:transparent,stroke:#888888,stroke-width:1px;
  style E6 fill:transparent,stroke:#888888,stroke-width:1px;
  style E7 fill:transparent,stroke:#888888,stroke-width:1px;
  style E8 fill:transparent,stroke:#888888,stroke-width:1px;
  style E9 fill:transparent,stroke:#888888,stroke-width:1px;
  style E10 fill:transparent,stroke:#888888,stroke-width:1px;
  style E11 fill:transparent,stroke:#888888,stroke-width:1px;
  style E12 fill:transparent,stroke:#888888,stroke-width:1px;
  style E13 fill:transparent,stroke:#888888,stroke-width:1px;
  style E14 fill:transparent,stroke:#888888,stroke-width:1px;
  style E15 fill:transparent,stroke:#888888,stroke-width:1px;
  style E16 fill:transparent,stroke:#888888,stroke-width:1px;
  style E17 fill:transparent,stroke:#888888,stroke-width:1px;
  style E18 fill:transparent,stroke:#888888,stroke-width:1px;
```
*A recipe needs a title and at least one ingredient. Everything a recipe normally has is part of the flow, not a button at the bottom: servings and times, a photo, a description, the ingredients, the steps and the nutrition. Ingredients and steps are one-line summaries; the one being edited is the only one open. On a phone adding an ingredient and editing its details happen in a drawer that never leaves the form (search, then amount, unit and a note, then "Add another" or Done, and "Remove from this recipe" for an existing one); from `sm` up a row opens its fields in place. A name the reader found that no ingredient matches arrives as "Add as new ingredient" / "Choose another". Nutrition shows what we added up from the ingredients as small emoji tiles, per serving, with a warning icon when some ingredients have no nutrition info; Edit turns the four tiles into inputs holding those numbers, any number changed becomes the person's own and "Reset to what we calculated" brings back the calculated ones. This is a page-sized form, so it is a Subview; the drawer on top of it is the one allowed exception to "no overlay on a subview" because it is the form's own row editor, one level deep.*

**Recipe details** (drawer — tap a recipe in the list)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  T1["Adobo chicken"]:2
  T2["🍽️ 4 servings"]:1
  T3["🔪 Prep 10 min · ⏲️ Cook 35 min"]:1
  T4["Cost $12.80 ⚠ · $3.20 per serving"]:2
  T5["🔥 495 · 💪 61g · 🌾 3g · 🥑 25g (when on)"]:2
  T6["2 ingredients need a price · Add prices   ✕"]:2
  T7["INGREDIENTS 6"]:2
  T8["Chicken thighs"]:1
  T9["2 lb"]:1
  T10["STEPS"]:2
  T11["1. Marinate the chicken…"]:2
  T12["Modify"]:1
  T13["Add to calendar"]:1
  style T1 fill:transparent,stroke:#888888,stroke-width:1px;
  style T2 fill:transparent,stroke:#888888,stroke-width:1px;
  style T3 fill:transparent,stroke:#888888,stroke-width:1px;
  style T4 fill:transparent,stroke:#888888,stroke-width:1px;
  style T5 fill:transparent,stroke:#888888,stroke-width:1px;
  style T6 fill:transparent,stroke:#888888,stroke-width:1px;
  style T7 fill:transparent,stroke:#888888,stroke-width:1px;
  style T8 fill:transparent,stroke:#888888,stroke-width:1px;
  style T9 fill:transparent,stroke:#888888,stroke-width:1px;
  style T10 fill:transparent,stroke:#888888,stroke-width:1px;
  style T11 fill:transparent,stroke:#888888,stroke-width:1px;
  style T12 fill:transparent,stroke:#888888,stroke-width:1px;
  style T13 fill:transparent,stroke:#888888,stroke-width:1px;
```
*The front matter is built to be seen: soft peach chips for servings and times, a Cost tile whose warning icon says what the total leaves out (it opens like the help icon), calories and macros as emoji tiles per serving when they are switched on, and the nudge line where a gap meets a number (✕ closes it for these ingredients). The footer holds both actions together: Modify beside the one primary, "Add to calendar", which is the widest control and closes the drawer to open Plan a meal with this recipe on the plate. Delete is the trash in the recipe form's footer, and removing a recipe that planned days use takes it off the lists, not out of those days, and says so in the confirm.*

**Saved meals** (the Meals pill) and **Meal details** (drawer) share the recipe patterns: a list of meal rows, and a drawer with a Cost tile (warning icon when it leaves something out), the plate's calories and macros as emoji tiles when on, the items with servings and cost, and in the footer Modify beside the one primary "Plan it", which closes the drawer and opens Plan a meal on a chosen day. Modify opens the same Meal subview used for planning, without a day. The builder's header carries the meal's name (or the plate's first item while planning), its rows are a title with a compact servings stepper beneath (40px hit areas from a pseudo-element), and a tinted summary shows the cost, its warning icon and the plate's emoji macros. Adding stays the search field in the form.

**Kitchen tab**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  K1["Kitchen"]:2
  K2["🏪 Stores  ·  6"]:1
  K3["🛒 Products  ·  14"]:1
  K4["INGREDIENTS  42"]:1
  K5["+ New"]:1
  K6["[ Yours ]   All   🔍 Search   ⧩ 2"]:2
  K7["Price: Needs a price  ✕   Clear"]:2
  K8["— Chicken —"]:2
  K9["Chicken breast"]:1
  K10["Walmart · $9.48 / 3 lb"]:1
  K11["Chicken thighs"]:1
  K12["No product yet"]:1
  K13["— Rice —"]:2
  K14["Jasmine rice"]:1
  K15["Costco · $14.99 / 20 lb"]:1
  style K1 fill:transparent,stroke:#888888,stroke-width:1px;
  style K2 fill:transparent,stroke:#888888,stroke-width:1px;
  style K3 fill:transparent,stroke:#888888,stroke-width:1px;
  style K4 fill:transparent,stroke:#888888,stroke-width:1px;
  style K5 fill:transparent,stroke:#888888,stroke-width:1px;
  style K6 fill:transparent,stroke:#888888,stroke-width:1px;
  style K7 fill:transparent,stroke:#888888,stroke-width:1px;
  style K8 fill:transparent,stroke:#888888,stroke-width:1px;
  style K9 fill:transparent,stroke:#888888,stroke-width:1px;
  style K10 fill:transparent,stroke:#888888,stroke-width:1px;
  style K11 fill:transparent,stroke:#888888,stroke-width:1px;
  style K12 fill:transparent,stroke:#888888,stroke-width:1px;
  style K13 fill:transparent,stroke:#888888,stroke-width:1px;
  style K14 fill:transparent,stroke:#888888,stroke-width:1px;
  style K15 fill:transparent,stroke:#888888,stroke-width:1px;
```
*The screen is titled Kitchen; Stores and Products are entry rows that open subviews (later Kitchen entries, Stock, Prepared servings and Shopping list, join them), then an "Ingredients" eyebrow with its count and **+ New** beside it. The Yours / All pills stay visible beside the search and a filter icon (a count badge when filters are on); on a phone the filters open in a drawer and from `sm` in a popover, and each active filter also shows as a dismissible chip with "Clear". The filters are Price (Any / Needs a price / Has a price), Show only (Missing nutrition, Custom only) and Family. Yours is the default and holds the ingredients you added, the ones with a product, and the ones your recipes, saved meals and planned days that aren't frozen yet use; All is the full catalog. Families are `SectionDivider` groups. A row shows the name, its calories and macros as emoji figures per 100 g when nutrition is on, and the default product's store, price and size, or a muted "No product yet". Rows carry no icon. When the filters hide everything the empty state names the filters that are hiding things and offers "Clear filters" and "Look through everything".*

**Ingredient details** (drawer)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  I1["Chicken breast"]:1
  I2["Chicken"]:1
  I3["Per 100 g · 🔥 165 · 💪 31g · 🌾 0g · 🥑 3.6g"]:2
  I4["Products"]:2
  I5["⭐ Walmart · Great Value 3 lb"]:1
  I6["$9.48"]:1
  I7["Costco · 6.5 lb"]:1
  I8["$19.99"]:1
  I9["+ Add a product"]:2
  I11["✏️ Modify"]:2
  style I1 fill:transparent,stroke:#888888,stroke-width:1px;
  style I2 fill:transparent,stroke:#888888,stroke-width:1px;
  style I3 fill:transparent,stroke:#888888,stroke-width:1px;
  style I4 fill:transparent,stroke:#888888,stroke-width:1px;
  style I5 fill:transparent,stroke:#888888,stroke-width:1px;
  style I6 fill:transparent,stroke:#888888,stroke-width:1px;
  style I7 fill:transparent,stroke:#888888,stroke-width:1px;
  style I8 fill:transparent,stroke:#888888,stroke-width:1px;
  style I9 fill:transparent,stroke:#888888,stroke-width:1px;
  style I11 fill:transparent,stroke:#888888,stroke-width:1px;
```
*"Add a product" closes the drawer and opens the product form sheet already tied to this ingredient. Tapping the star changes the default product (a quiet icon action; there is no hidden gesture). Nutrition is shown per 100 g as emoji `MacroStats` and can be adjusted in Modify. There is no "Used in" line in the drawer yet. Removing a custom ingredient that is in use takes it off the lists and the confirm says what still uses it; a catalog ingredient can only be reset to its built-in values. The default-product star has no label of its own yet.*

**Product** (form sheet)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  PR1["Chicken breast · Walmart"]:2
  PR3["Where do you buy it?"]:2
  PR4["+ New store"]:1
  PR5["Walmart"]:1
  PR6["Costco"]:1
  PR7["Show all"]:1
  PR8["Price<br/>$9.48"]:1
  PR9["Package size<br/>3 lb"]:1
  PR10["+ Label   + Link"]:2
  PR11["Make this the default"]:2
  PR12["🗑"]:1
  PR13["Cancel  ·  Save"]:1
  style PR1 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR3 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR4 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR5 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR6 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR7 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR8 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR9 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR10 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR11 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR12 fill:transparent,stroke:#888888,stroke-width:1px;
  style PR13 fill:transparent,stroke:#888888,stroke-width:1px;
```
*The sheet's title names what it is about ("{Ingredient} · {store or label}", "{Ingredient} · new product"), so there is no separate "For" block. The store question comes first because the price and size are about that shop. The store row is a `PickOrCreate`: a dashed "New store" pill first, then your stores as logo pills, with "Show all" opening the well-known list inside the same row (capped height, a search past 12). A well-known store joins "your stores" the first time a product uses it. Price and size are two short fields side by side; the size field takes an amount and a unit. Label ("Great Value") and a link are "+ Add X" chips. The first product on an ingredient is made the default without asking, and "Make this the default" appears from the second.*

**Stores** (subview) and **Store** (form sheet)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  S1["‹ Stores"]:2
  S2["6 stores"]:1
  S3["+ Add"]:1
  S4["[W] Walmart"]:1
  S5["9 products"]:1
  S6["[C] Costco"]:1
  S7["5 products"]:1
  S8["[G] Green Market (your own)"]:1
  S9["2 products"]:1
  style S1 fill:transparent,stroke:#888888,stroke-width:1px;
  style S2 fill:transparent,stroke:#888888,stroke-width:1px;
  style S3 fill:transparent,stroke:#888888,stroke-width:1px;
  style S4 fill:transparent,stroke:#888888,stroke-width:1px;
  style S5 fill:transparent,stroke:#888888,stroke-width:1px;
  style S6 fill:transparent,stroke:#888888,stroke-width:1px;
  style S7 fill:transparent,stroke:#888888,stroke-width:1px;
  style S8 fill:transparent,stroke:#888888,stroke-width:1px;
  style S9 fill:transparent,stroke:#888888,stroke-width:1px;
```
```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  SF1["Store"]:2
  SF2["🔍 Search well-known stores"]:2
  SF3["[W] Walmart"]:1
  SF4["[T] Trader Joe's"]:1
  SF5["[K] Kroger"]:1
  SF6["[A] Aldi"]:1
  SF7["Can't find it? Add your own"]:2
  SF8["Name<br/>Green Market"]:2
  SF9["Image: Upload or take a photo"]:2
  SF10["🗑"]:1
  SF11["Cancel  ·  Save"]:1
  style SF1 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF2 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF3 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF4 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF5 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF6 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF7 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF8 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF9 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF10 fill:transparent,stroke:#888888,stroke-width:1px;
  style SF11 fill:transparent,stroke:#888888,stroke-width:1px;
```
*The list shows each store's logo in a round tile with a letter tile as the fallback. A well-known store is picked from the list; "Can't find it? Add your own" reveals a name and an image field (`PhotoPicker`), and a store with no image gets a letter tile in a soft tint. Removing a store that has products asks first and keeps those products, with their store shown as "Removed store". The Products subview lists every product with its ingredient, price and size and has **+ New product** beside its title (pick the ingredient first, then the product sheet). From 8 products it shows a search and the filter and sort controls: filters are Store, Family and Default only / Not the default; sort is by store (grouped, the default), ingredient, price or date added. Rows are capped at 60 with "Show 60 more", and an ingredient's default star shows only when it has several products.*

**Nudge and fill-in** (the quiet line, and the sheet it opens)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  G1["$12.80 total · $3.20 / serving"]:2
  G2["2 ingredients need a price · Add prices   ✕"]:2
  G3["Add prices"]:2
  G4["Soy sauce · where do you buy it?"]:2
  G5["Price<br/>$3.49"]:1
  G6["Size<br/>15 fl oz"]:1
  G7["Rice vinegar · where do you buy it?"]:2
  G8["Price<br/>—"]:1
  G9["Size<br/>—"]:1
  G10["Skip for now  ·  Save"]:2
  style G1 fill:transparent,stroke:#888888,stroke-width:1px;
  style G2 fill:transparent,stroke:#888888,stroke-width:1px;
  style G3 fill:transparent,stroke:#888888,stroke-width:1px;
  style G4 fill:transparent,stroke:#888888,stroke-width:1px;
  style G5 fill:transparent,stroke:#888888,stroke-width:1px;
  style G6 fill:transparent,stroke:#888888,stroke-width:1px;
  style G7 fill:transparent,stroke:#888888,stroke-width:1px;
  style G8 fill:transparent,stroke:#888888,stroke-width:1px;
  style G9 fill:transparent,stroke:#888888,stroke-width:1px;
  style G10 fill:transparent,stroke:#888888,stroke-width:1px;
```
*One sheet handles every kind of gap: a price, a package size, a nutrition value, or a missing conversion, one row per ingredient, with just the fields that gap needs. Rows left blank stay as they were, "Skip" moves on without saving, "Save" turns on once the row is filled in, and ✕ on the nudge hides that line for those ingredients. The same line appears in the recipe, saved meal, day and planned-meal views and the calendar stats row. The meal builder is a full-screen subview, so it states the cost and what it leaves out in text and opens nothing over itself; a frozen day has no line, since a new price can't change it.*

| Where the gap shows | Nudge wording | What the fill-in sheet asks |
|---|---|---|
| a recipe, meal or day cost | "2 ingredients need a price · Add prices" | price and package size for each |
| a cost that can't be compared | "Rice vinegar can't be compared with its package size · Add a size" | the package size in a comparable unit, for the ingredient's default product |
| a nutrition metric that is on | "3 ingredients have no protein · Add values" | the missing metric for each |
| the stats row | a warning icon on Spent that names what it leaves out, and the nudge line under the tiles | the same sheet, covering the period shown |

**Settings** (form sheet from the Calendar gear)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  ST1["Settings"]:2
  ST2["Show nutrition"]:2
  ST3["Calories"]:1
  ST4["◯ off"]:1
  ST5["Protein"]:1
  ST6["◯ off"]:1
  ST7["Carbs"]:1
  ST8["◯ off"]:1
  ST9["Fat"]:1
  ST10["◯ off"]:1
  ST11["Each switch applies at once. Turning on protein also shows your price per gram of protein."]:2
  style ST1 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST2 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST3 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST4 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST5 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST6 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST7 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST8 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST9 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST10 fill:transparent,stroke:#888888,stroke-width:1px;
  style ST11 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Switches take effect immediately, so they are `AppToggle`s, not checkboxes. Nutrition is always stored; the switches only choose what is shown.*

**Breakdown** (drawer from the calendar stats row)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  BK1["October · $412.60"]:2
  BK2["[ By day ]   By meal"]:2
  BK3["Tue 13"]:1
  BK4["$18.40"]:1
  BK5["Wed 14"]:1
  BK6["$7.20"]:1
  BK7["Thu 15"]:1
  BK8["—"]:1
  style BK1 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK2 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK3 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK4 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK5 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK6 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK7 fill:transparent,stroke:#888888,stroke-width:1px;
  style BK8 fill:transparent,stroke:#888888,stroke-width:1px;
```
*The title names the period shown (a month, a week or a day). The two thin pills switch between days and meal types; rows show spend and, for each nutrition metric that is on, its total. It is a single scrolling list under a fixed header.*

## Reusable Components

| Component | Used in | Purpose |
|---|---|---|
| MealBarCell | Calendar `renderCell` | up to three thin meal-type bars with emoji and a "+N"; date number, today accent, selected ring |
| StatsRow | Calendar | spend, average per meal, price per gram of protein when protein is on, and a compact line of nutrition averages; tap opens the breakdown; carries the nudge |
| GapNudge | recipe, meal, day and planned-meal drawers, stats row | the one quiet line (muted text + link + ✕) that offers the fill-in sheet; renders only when there is a gap |
| FillInSheet | behind every nudge | a `FormSheet` with one row per ingredient and only the fields that gap needs |
| DayDrawer / DayPeek | Calendar | the same content as a `DetailSheet` on phones and a hover `Popover` from `sm` up (`max-sm:hidden`) |
| PlannedMealView | Day drawer | items with servings, totals, grouped actions, swapped in place |
| MealBuilder | Plan a meal, Meal subview | day and type pills, a pill row of saved meals while the plate is empty, one item search, per-item serving steppers, a cost line that states what it leaves out (no nudge: the fill-in sheet never opens over this subview), Save-as-meal switch |
| ItemSearch | MealBuilder, Recipe form | one search over recipes, meals and ingredients with kind labels; also offers "New ingredient" |
| ServingStepper | MealBuilder, Recipe form | half-step stepper, 40px targets |
| RecipeForm | Recipe subview | title, servings, ingredient rows, chips; hosts `RecipeAutofill` |
| RecipeAutofill | Recipe form | the "Have a recipe?" and "Copied one?" rows, built on the repo's `UploadAutofill` pattern for the states and the 10 MB cap |
| RecipeRow, MealRow | Recipes tab | cover or emoji tile, title, cost per serving, muted details |
| IngredientRow, FamilyGroup | Kitchen | icon, name, default product line; `SectionDivider` groups |
| IngredientIcon | rows, drawers, pickers | the vendored emoji SVG matched by ingredient, with a generic jar fallback |
| NutritionLine | rows, drawers | the metrics that are switched on, per serving; renders nothing when all are off |
| ProductForm, ProductRow | Ingredient drawer, Products subview | store question first, price and size side by side, chips for label and link |
| StorePicker | Product form | `PickOrCreate` of your stores plus "Show all" for the well-known list |
| StoreLogo | pickers, rows, subview | the logo tile with a letter fallback; app-aware, so it stays in the app |
| StoreForm | Stores subview | search of well-known stores, or name plus `PhotoPicker` image |
| CopySheet | every copy action | preview, what's included, `CopyButton` |
| CoverImage | recipe rows and drawer | `FallbackImage` with a tinted emoji tile as its `fallback` |
| `SectionHeader`, `Subview`, `FormSheet`, `DetailSheet`, `ModalFooterActions`, `DeleteIconButton`, `PillGroup`, `PickOrCreate`, `SearchInput`, `SectionDivider`, `MoneyInput`, `AppToggle`, `StatTile` | everywhere | the shared pieces in `src/components` and `src/ui`; Pinch builds only what is app-specific |
| Empty state | every list and the empty Calendar | an icon, one muted line, and the call to action in the header |

## User Journeys

**First launch: plan something**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A[Open Pinch] --> B["Calendar, empty"] --> C{"What now?"}
    C -->|Plan your first meal| D["Plan a meal subview"] --> E["Search 'chicken breast'"] --> F["Pick an ingredient from the catalog"] --> G["Add to today"] --> H["Calendar shows a bar for it; cost line says 'No price yet'"]
    C -->|Add a recipe| I["Recipe subview"]
```

**Add a recipe from a photo**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A[Recipes] --> B[+ New] --> C["Upload a photo or PDF"] --> D["Reading…"] --> E["Form filled in; 'We couldn't read: cook time'"]
    E --> F{"Unknown ingredient?"}
    F -->|Yes| G["'Add as new ingredient' on its row"] --> H[Review and edit]
    F -->|No| H
    H --> I[Save] --> J["Recipe drawer with its cost and a price nudge"]
```

**Plan a meal, tweak a day, keep it**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A[Tap a day] --> B[+ Add] --> C["Pick 'Taco night' from Start from a saved meal"] --> D["Items copied onto this day"]
    D --> E["Skip the peppers, double the rice"] --> F[Add to today]
    F --> G["Calendar bar appears"] --> H["Open it: Save as a meal"] --> I["Saved with a new name; Taco night is unchanged"]
```

**Add a product with a store**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A[Kitchen] --> B[Tap Chicken breast] --> C[Add a product] --> D{"Where do you buy it?"}
    D -->|Pick a logo pill| G[Price and size]
    D -->|Show all| E["Search well-known stores"] --> G
    D -->|New store| F["Name and optional image"] --> G
    G --> H[Save] --> I["Ingredient shows the product; recipe costs update"]
```

**Fill in what's missing, in context**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A["Recipe drawer: '2 ingredients need a price'"] --> B[Add prices] --> C["Fill-in sheet: one row each"] --> D{"Fill them all?"}
    D -->|Some| E[Save] --> F["Cost updates; line now says 'leaves out 1'"]
    D -->|None| G[Skip for now] --> H["Line stays; ✕ hides it for these ingredients"]
```

**Take it to a chat and bring a recipe back**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'clusterBkg': 'transparent', 'primaryBorderColor': '#888888', 'clusterBorder': '#888888', 'lineColor': '#888888', 'primaryTextColor': '#333333'}}}%%
flowchart LR
    A[Kitchen 📋] --> B["Copy sheet: names only"] --> C[Copy] --> D[Paste into any AI chat]
    D --> E[Copy the recipe it suggests] --> F[Recipes + New → Paste] --> G["Form filled in for review"] --> H[Save]
```

## Form Field Organization

*"Grouping: none" means one flat form — still Dreamer UI's `Form`, just without a `Disclosure` or steps wrapper.*

| Entity | Initial (create) | Later (edit only) | Later-set entry point | Grouping | "Other" option? |
|---|---|---|---|---|---|
| Recipe | title, servings, ingredients (ingredient + amount + unit) | description, times, cover photo, steps, own nutrition | "+ Add X" chips on the form; the recipe drawer's Modify | none; chips for extras | none |
| Ingredient | name, family (`PickOrCreate`: existing family, new family, or none) | icon, nutrition per 100 g, unit conversions (Next Steps) | the ingredient drawer's Modify; the fill-in sheet for a missing nutrition value | none; chips for icon and nutrition | family: "New family" is the dashed first pill |
| Product | store (`PickOrCreate`), price, package size | label, link, default flag | the ingredient drawer's product rows; the fill-in sheet for a missing price or size | none | store: "New store" is the dashed first pill |
| Store | pick from the well-known list, or name | image | the Stores subview row | none | "Can't find it? Add your own" reveals the name and image fields |
| Meal (saved) | name, items (recipe or ingredient + servings) | — | Meal subview's Modify; "Save as a meal" on a planned meal | none | none |
| Planned meal | day and meal type (prefilled from where it started), items with servings | — | the planned meal's "Change items or servings" | none | none |
| Settings | four nutrition switches (all off) | — | the Calendar gear; the stats row's help link | none | none |

**Flagged for the TDD** (none of these change the screens above, but each shapes the data):
- **Copy-on-plan** — a planned meal stores its own item list and a `sourceMealId`; editing the saved meal later leaves planned days alone, and the id leaves room for a future "update N upcoming days?" prompt.
- **Live recipes, frozen past** — planned items point at recipes, so edits reach upcoming days; once a day has passed its cost and nutrition are snapshotted so history never moves.
- **Archive, don't delete, what is in use** — a recipe, custom ingredient or store that planned days, saved meals, recipes or products depend on is archived and hidden from pickers, never removed.
- **Comparable amounts** — a recipe's amount and a product's package size must share a dimension (mass, volume, count) or have a catalog-known conversion; anything else is excluded from the total and named in a nudge.
- **Nudge dismissals** — "✕ hides it for those ingredients" needs a small per-gap dismissal record on the user's settings document.
- **Unknown stock vs zero stock** — when stock tracking arrives, "not tracked" is its own state, separate from 0.
- **Store logos** — the well-known list is a constant of names and domains, logos load in the browser from a logo service, and a letter tile covers every failure; the service and its terms are to be settled.
- **Week** — Monday to Sunday; a week copy covers those seven days.
- **Money** — integer cents everywhere; nutrition per 100 g with servings computed from the recipe's own amounts.
- **A well-known store joins "your stores" on first use** — so a product always points at a store document of the person's own.
