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
| Numbers explain themselves | a cost with gaps says what it leaves out ("$14.20 · leaves out 2 ingredients"); a stat that isn't self-evident carries a `HelpTip`; past days are labelled as frozen |
| Nothing leaves without saying what | every copy-to-Markdown opens a small sheet that previews the text and states what is and isn't included |
| Dreamer UI first | `Calendar` (with `renderCell`), `Form`, `Drawer`, `Popover`, `Tabs`, `Badge`, `CopyButton` — custom only where the catalog has nothing: the meal-bar cell and the store logo tile |
| Honest AI | an AI reads a pasted recipe, photo or PDF and fills the real form; it names what it couldn't read; nothing is saved until the person confirms |


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
*Honest caveats: (1) Dreamer UI's `Calendar` hands `renderCell` only the date (a local-midnight `Date`) and no month-change callback, so each cell's meal bars come from a day-keyed lookup built up front, not a per-cell query. (2) A cell that holds up to three bars plus a "+N" is taller than Dreamer UI's default square; like A-List's poster cells it needs `cellClassName` and `monthGridClassName` overrides, which the TDD flags as a first spike. (3) Store logos come from a third-party logo service and can be missing, so every logo tile has a letter fallback.*

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
    D2 -->|tap the stats row| BRK["Breakdown drawer · by day / by meal"]
    D2 -->|tap a day| DD["Day drawer"]
    D2 -.->|hover a day, desktop| PK["Day peek popover"]
    DD -->|+ Add| PM["Plan a meal subview · day, meal type, items with servings"]
    DD -->|tap a meal| PMD["Planned meal · swaps in place"]
    PMD -->|Change items or servings| PM
    PMD --> SAV["Save as a meal · swaps in place"]
    PMD --> CP1["Copy sheet"]
    PMD --> RM["Remove confirm"]
    DD --> CP2["Copy day sheet"]
    R --> RL["Recipes list · pills: Recipes / Meals"]
    RL -->|+ New| RF["Recipe subview · upload or paste fills it in"]
    RL -->|tap a recipe| RD["Recipe drawer · cost, nutrition, ingredients, steps"]
    RD -->|Modify| RF
    RD -->|Add to calendar| PM
    RD --> CP3["Copy sheet"]
    RL -->|Meals pill| ML["Saved meals list"]
    ML -->|+ New or tap Modify| MF["Meal subview · same builder, no day"]
    ML -->|tap a meal| MD["Meal drawer"]
    MD -->|Plan it| PM
    K --> KL["Ingredients list · Yours / All · search"]
    KL -->|+ New| IF["Ingredient form sheet"]
    KL -->|tap an ingredient| ID["Ingredient drawer · nutrition, products, used in"]
    ID -->|Add a product| PF["Product form sheet · store picker"]
    KL --> ST["Stores subview"]
    ST -->|+ Add| SF["Store form sheet · pick from the list or add your own"]
    KL --> PR["Products subview · by store"]
    KL --> CP4["Copy my ingredients sheet"]
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
*Navigation is a floating pill at the bottom of a phone, as wide as its three tabs (never stretched edge to edge), and a rail on the left from `lg` up. The app opens to Calendar, the left tab; the active tab gets a soft fill and a drizzle of orange on its icon, the only orange in the bar. Later Kitchen entries (stock, prepared servings, shopping list) join the Kitchen tab and do not add a fourth tab.*

**First launch — Calendar, empty** (no setup steps: Pinch is usable the moment it opens)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  F1["Spent this month<br/>$0.00"]:1
  F2["Average per meal<br/>—"]:1
  F3["‹   October 2026   ›   ⚙️"]:2
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
  C1["Spent<br/>$412.60<br/>leaves out 2 items · Add prices"]:3
  C2["Avg / meal<br/>$5.80"]:2
  C3["$ / g protein<br/>$0.04"]:2
  C4["‹   October 2026   ›   ⚙️"]:7
  C5["M"]:1
  C6["T"]:1
  C7["W"]:1
  C8["T"]:1
  C9["F"]:1
  C10["S"]:1
  C11["S"]:1
  C12["12"]:1
  C13["13 ● today<br/>🍳 ▬<br/>🍝 ▬<br/>🍰 ▬"]:1
  C14["14<br/>🥪 ▬"]:1
  C15["15"]:1
  C16["16<br/>🍝 ▬<br/>🍿 ▬"]:1
  C17["17"]:1
  C18["18"]:1
  C19["19"]:1
  C20["20"]:1
  C21["21"]:1
  C22["22"]:1
  C23["23"]:1
  C24["24"]:1
  C25["25"]:1
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
```
*Month view. The grid starts on Sunday because Dreamer UI's `Calendar` can't start a week on Monday; Monday–Sunday applies to week copies. The month title and arrows are Pinch's own row above the grid (the Calendar's own header is hidden), so the shown month can drive which planned meals are loaded. Each planned meal is one thin bar in its meal-type colour with its emoji (🍳 breakfast, 🥪 lunch, 🍝 dinner, 🍿 snack, 🍰 dessert, 🥤 drink); a cell shows up to three and a "+N" for the rest. Today takes the accent on its number and the selected day a ring. Past days read exactly as they were that day. The stats row sits above the month and covers the month shown: spend and average cost per meal always, price per gram of protein when protein is on, and a single compact line of daily averages for each nutrition metric that is on. Tapping the row opens the breakdown, and tapping a day opens its drawer (below). On a computer, hovering a day opens a peek popover with the same content as its drawer; on a phone, tapping opens the drawer.*

| Cell contents | What `renderCell` draws |
|---|---|
| no meals | the date number only |
| 1–3 meals | one bar per meal in time-of-day order (meal type order), emoji at the start of each bar |
| 4+ meals | the first three bars and a small "+N" |
| past day with a meal that was never marked made | shown the same; marking made arrives with stock tracking |

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
  D12["Copy day as Markdown"]:2
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
  style D12 fill:transparent,stroke:#888888,stroke-width:1px;
```
*Meals are grouped by meal type, each group under its emoji; a meal with several items lists them as flat rows beneath one heading, so a meal never looks like several separate meals. A day with no meals says so in one muted line with "+ Add to this day" in the header. A past day shows a muted "Prices as they were that day" line under the title. A past meal opened from it has no "Change items or servings": a muted line says the day has passed and to remove the meal and add it again.*

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
  P9["Calories 640 · Protein 48 g (per serving, when on)"]:2
  P10["✏️ Change items or servings"]:2
  P11["💾 Save as a meal · 📋 Copy"]:2
  P12["Remove from this day"]:2
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
*Totals for the meal and, when nutrition is on, per-serving values sit under the items. "Change items or servings" closes the drawer and opens the Plan a meal subview; "Remove from this day" is last, in red, with a confirm. Saving as a meal swaps the drawer in place to a single name field and a Save button.*

**Plan a meal** (subview; also the editor for an already planned meal)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  M1["‹ Meal"]:2
  M2["Tue, Oct 13 · 🍝 Dinner      Change"]:2
  M3["Start from a saved meal"]:2
  M4["+ New"]:1
  M5["Taco night"]:1
  M6["Chicken + rice"]:1
  M7["Breakfast bowl"]:1
  M8["What's on the plate?"]:2
  M9["🔍 Search recipes, ingredients"]:2
  M10["🍲 Adobo chicken"]:1
  M11["− 2 +"]:1
  M12["🍲 Cilantro lime rice"]:1
  M13["− 2 +"]:1
  M14["🥣 Doritos (nacho cheese)"]:1
  M15["− 1 +"]:1
  M16["Cost $11.20 · leaves out 1 ingredient"]:2
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
*Opens on the day and meal type it came from (pills under "Change"). "Start from a saved meal" is a captioned row of pills shown while the plate is empty (nothing preselected); picking one copies its items onto the day. The search finds recipes and ingredients in one list with a small kind label on each result; a picked one joins the plate with one serving. Each row has its name on its own line (it wraps, never truncates), what one serving is ("1 serving = 28 g", "Recipe serves 4"), its serving stepper labelled "servings" (halves allowed) and a remove control. The footer says "Add to today" when the day is today. When the meal has two or more items a "Save as a meal" switch appears above the footer and reveals a name field. Adding a one-item meal is the same screen with one row.*

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
  R7["4 servings · 45 min · 520 cal (when on)"]:2
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
*Two thin pills switch between Recipes and Meals (saved meals). A recipe row shows its cover (or a tinted emoji tile), title, cost per serving, and a muted line of servings and time, with nutrition per serving when it is on. A recipe with an unpriced ingredient shows the cost it can stand behind and a muted "leaves out 1" beside it. A meal row shows its items as a comma line and the total.*

**Recipe** (subview — create and edit)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  E1["‹ Recipe"]:2
  E2["📷 Have a recipe on paper or a screenshot?"]:1
  E3["Upload"]:1
  E4["📝 Copied one from a chat?"]:1
  E5["Paste"]:1
  E6["Title<br/>Adobo chicken"]:2
  E7["Servings<br/>[ − 4 + ]"]:2
  E8["Ingredients"]:2
  E9["🍗 Chicken thighs"]:1
  E10["2 lb"]:1
  E11["🥫 Soy sauce"]:1
  E12["¼ cup"]:1
  E13["+ Add ingredient"]:2
  E14["+ Steps   + Description   + Times   + Cover photo   + My own nutrition"]:2
  E15["Cancel"]:1
  E16["Save"]:1
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
```
*A recipe needs a title and at least one ingredient. Servings is a visible question because cost and nutrition per serving depend on it. Upload and Paste sit at the top: either one fills the real fields, shows what it couldn't read ("We couldn't read: cook time."), and leaves everything editable before Save; an unknown ingredient arrives as "Add as new ingredient" on its row. The ingredient search is the same picker the meal builder uses, with a "New ingredient" entry at the end. Everything past ingredients is a "+ Add X" chip with a remove, and "My own nutrition" appears whether or not nutrition is on, since the numbers still count when it's switched on later. This is a page-sized form, so it is a Subview, not a modal.*

| Upload / Paste state | What you see |
|---|---|
| idle | the two quiet rows above the title |
| reading | "Reading {file}…" with the row disabled |
| done | "Filled in from {file}. Take a look before you save." plus a "We couldn't read: …" line when something was missed |
| failed | one warm sentence ("We couldn't read that right now. Try a clearer photo or a PDF, or fill it in below."), details logged, never the service's message |
| too big | "That file is too big to read. Try a photo or a PDF under 10 MB." |

**Recipe details** (drawer — tap a recipe in the list)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  T1["🖼️ Adobo chicken"]:2
  T2["4 servings · 45 min"]:1
  T3["$12.80 total · $3.20 / serving"]:1
  T4["2 ingredients need a price · Add prices   ✕"]:2
  T5["Nutrition per serving (when on): 520 cal · 42 g protein"]:2
  T6["Ingredients"]:2
  T7["Chicken thighs"]:1
  T8["2 lb"]:1
  T9["Soy sauce"]:1
  T10["¼ cup"]:1
  T11["Steps"]:2
  T12["1. Marinate the chicken…"]:2
  T13["🗓️ Add to calendar"]:2
  T14["✏️ Modify · 📋 Copy · Delete"]:2
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
  style T14 fill:transparent,stroke:#888888,stroke-width:1px;
```
*"Add to calendar" is the one primary button; it closes the drawer and opens Plan a meal with this recipe on the plate. Modify and Copy sit in one muted block; Delete is the trash in the recipe form's footer, and removing a recipe that planned days use takes it off the lists, not out of those days, and says so in the confirm. The nudge line is where a gap meets a number; ✕ closes it for these ingredients.*

**Saved meals** (the Meals pill) and **Meal details** (drawer) share the recipe patterns: a list of meal rows, and a drawer with the items and servings, total cost, per-serving nutrition when on, and one primary "Plan it" that closes the drawer and opens Plan a meal on a chosen day. Modify opens the same Meal subview used for planning, without a day. Copy and Delete sit in the muted block.

**Kitchen tab**

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  K1["Ingredients"]:1
  K2["+ New  ·  📋"]:1
  K3["🏪 Stores  ·  6"]:1
  K4["🛒 Products  ·  14"]:1
  K5["[ Yours ]   All"]:2
  K6["🔍 Search"]:2
  K7["— Chicken —"]:2
  K8["🍗 Chicken breast"]:1
  K9["Walmart · $9.48 / 3 lb"]:1
  K10["🍗 Chicken thighs"]:1
  K11["No product yet"]:1
  K12["— Rice —"]:2
  K13["🍚 Jasmine rice"]:1
  K14["Costco · $14.99 / 20 lb"]:1
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
```
*Yours is the default and holds the ingredients you added, the ones with a product, and the ones your recipes use; All is the full catalog. Families are `SectionDivider` groups. A row shows the icon, name and the default product's store, price and size, or a muted "No product yet". The 📋 icon opens the copy sheet for your ingredient list. Stores and Products are entry rows that open subviews; later Kitchen entries (Stock, Prepared servings, Shopping list) join them.*

**Ingredient details** (drawer)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  I1["🍗 Chicken breast"]:1
  I2["Chicken"]:1
  I3["Per 100 g · 165 cal · 31 g protein · 0 g carbs · 3.6 g fat"]:2
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
*"Add a product" closes the drawer and opens the product form sheet already tied to this ingredient. Tapping the star changes the default product (a quiet icon action; there is no hidden gesture). Nutrition is shown per 100 g and can be adjusted in Modify. There is no "Used in" line in the drawer yet. Removing a custom ingredient that is in use takes it off the lists and the confirm says what still uses it; a catalog ingredient can only be reset to its built-in values. The default-product star has no label of its own yet.*

**Product** (form sheet)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  PR1["Product"]:2
  PR2["For<br/>Chicken breast"]:2
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
  style PR2 fill:transparent,stroke:#888888,stroke-width:1px;
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
*The store question comes first because the price and size are about that shop. The store row is a `PickOrCreate`: a dashed "New store" pill first, then your stores as logo pills, with "Show all" opening the well-known list inside the same row (capped height, a search past 12). A well-known store joins "your stores" the first time a product uses it. Price and size are two short fields side by side; the size field takes an amount and a unit. Label ("Great Value") and a link are "+ Add X" chips. The first product on an ingredient is made the default without asking, and "Make this the default" appears from the second.*

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
*The list shows each store's logo in a round tile with a letter tile as the fallback. A well-known store is picked from the list; "Can't find it? Add your own" reveals a name and an image field (`PhotoPicker`), and a store with no image gets a letter tile in a soft tint. Removing a store that has products asks first and keeps those products, with their store shown as "Removed store". The Products subview lists every product grouped by store with its ingredient, price and size, searchable from 8.*

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
*One sheet handles every kind of gap: a price, a package size, a nutrition value, or a missing conversion, one row per ingredient, with just the fields that gap needs. Rows left blank stay as they were, "Skip" moves on without saving, "Save" turns on once the row is filled in, and ✕ on the nudge hides that line for those ingredients. The same line appears in the recipe, saved meal, day and planned-meal views, the calendar stats row. The meal builder is a full-screen subview, so it states the cost and what it leaves out in text and opens nothing over itself; a frozen day has no line, since a new price can't change it.*

| Where the gap shows | Nudge wording | What the fill-in sheet asks |
|---|---|---|
| a recipe, meal or day cost | "2 ingredients need a price · Add prices" | price and package size for each |
| a cost that can't be compared | "Rice vinegar can't be compared with its package size · Add a size" | the package size in a comparable unit, for the ingredient's default product |
| a nutrition metric that is on | "3 ingredients have no protein · Add values" | the missing metric for each |
| the stats row | "leaves out 2 items · Add prices" | the same sheet, covering the month |

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

**Copy** (sheet used by every copy action)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': 'transparent', 'primaryBorderColor': '#888888', 'primaryTextColor': '#333333', 'lineColor': '#888888'}}}%%
block-beta
  columns 2
  CP1["Copy my ingredients"]:2
  CP2["Chicken: breast, thighs · Rice: jasmine · Salt · Doritos (nacho cheese) …"]:2
  CP3["Includes ingredient names grouped by family. Prices, stores and products are not included."]:2
  CP4["Copy"]:2
  style CP1 fill:transparent,stroke:#888888,stroke-width:1px;
  style CP2 fill:transparent,stroke:#888888,stroke-width:1px;
  style CP3 fill:transparent,stroke:#888888,stroke-width:1px;
  style CP4 fill:transparent,stroke:#888888,stroke-width:1px;
```
*A scrollable preview, one sentence on what is and isn't in the copy, and Dreamer UI's `CopyButton` (the shared `CopyPanel`). Inside a recipe, meal, day or planned-meal drawer it swaps in place with a Back link (never a second overlay); the Kitchen's 📋 icon opens it in its own sheet (`CopySheet`). The day drawer offers "Copy this day" and "Copy this week" (the Monday-to-Sunday week that holds the day). A copy never carries money, stores or products.*

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
*The two thin pills switch between days and meal types; rows show spend and, for each nutrition metric that is on, its total. It is a single scrolling list under a fixed header.*

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
    D --> E["Skip the peppers, double the rice"] --> F[Add to Tuesday]
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
