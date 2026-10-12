---
applyTo: "src/apps/pinch/**"
---

# Pinch rules

Applies on top of CLAUDE.md to everything under `src/apps/pinch/`. Keep the other copy of this file identical in body.

- **Theme: a home cook's counter.** Warm, hands-on and a little playful, like measuring by the pinch. Demmi's orange primary on a cream surface (stone-dark in dark mode) with a honey accent, rounded and soft. The palette, radii and field inset live in `pinch.css` as tokens on `html.pinch-theme`, switched on by `usePinchTheme()` while the app is mounted so portaled modals and drawers match. Change the look there, not per component, and use semantic tokens (`bg-primary`, `bg-secondary`, `bg-accent`) rather than raw colors. Orange is for the one action and for real links; body and row text stays the normal color (the tertiary-button rule in `pinch.css`).
- **Shape language.** Corners are set by the raised `--radius-*` tokens, so don't hand-roll radii. Options a person picks among are `Pill`s, never radios or a tab strip; a selected pill is a soft tint with an orange outline so its emoji stays readable. The bottom bar is three tabs, Calendar, Recipes (centred, raised, bigger) and Kitchen; later Kitchen entries join the Kitchen tab and never add a fourth.
- **Emoji carry meaning.** Meals are 🍳 breakfast, 🥪 lunch, 🍝 dinner, 🍿 snack, 🍰 dessert, 🥤 drink, in that order; the same six colors are the `--pinch-meal-*` tokens, used on the calendar's thin bars. Ingredients get their vendored Twemoji icon, or the jar glyph when none fits; never a sparkle for "other".
- **Missing details appear only as in-context nudge lines.** A missing price, package size or nutrition value is one quiet line where it changes a number ("2 ingredients need a price · Add prices"), with a close button and a short fill-in sheet. Never a to-do list, a badge, a required field or a setup step, and a total always says what it leaves out ("$14.20 · leaves out 2 ingredients").
- **Three layers, recipes name only the ingredient.** Family, ingredient, product. A recipe or meal refers to an ingredient id, never a store or product; prices live on products. Copies that leave the app (Markdown) never carry prices, stores or products.
- **Vendored assets keep their licence.** The icons under `public/vendor/ingredient-icons` are Twemoji (CC-BY 4.0); the notice sits beside them and surfaces in Settings' About row once it exists. Add any new vendored set the same way.
- **Check lists at scale.** Pinch needs an oversized seed fixture like Waypoint's (`scripts/seeds/pinchScale.ts`, "Big Kitchen (scale test)"). Open new lists on it at phone width with the dev build throttled, and keep per-row work cheap (CLAUDE.md "Performance is a design check"): catalog groups mount only near the viewport (`LazyMount` plus `defer-offscreen`).
