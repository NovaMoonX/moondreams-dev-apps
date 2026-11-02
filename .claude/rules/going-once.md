---
paths:
  - "src/apps/going-once/**"
  - "functions/src/apps/going-once/**"
---

# Going Once rules

Applies on top of `CLAUDE.md` and `docs/conventions/` to everything under `src/apps/going-once/` and its functions. This file is the one copy of these rules; `.github/instructions/going-once.instructions.md` only points here.

- **Built for its three people.** `PRODUCT.md` "Who It Is For" names them: the seller (Maya) adds things once and checks in; the co-seller (Theo) talks to buyers, records what sold and relists on Marketplace; the buyer (Priya) opens a link with no account. Every change names who it serves and is walked as that person, and never breaks another's journey. The app is about selling things in general; its name and copy never say moving or apartment.
- **Two audiences on every thing.** Private values (floor price, original price unless shown, where bought and the store's link, notes, buyers' details) sit in one kraft band captioned "🔒 Only you and your co-sellers", and anything private shown elsewhere carries the 🔒. The public page is served by a function that copies allowed fields by name; a new field is private until `TECHNICAL.md`'s allowlist says otherwise, and it never reaches the copied listing text.
- **The public page never says who is selling.** No name, email, avatar or contact of the seller or co-sellers, no third-party loads, `noindex`, and a link preview that says only "Things for sale".
- **Photos stay at listing quality.** Every photo is shrunk on the device to the shared `listing` size (`usePhotoSetUploads`), up to 12 per thing, the first is the cover; the public page shows only the function's smaller copies.
- **The look is the tag sale (owner kept it, round 4).** Paper background, kraft price tags, ink-green primary, everything round; a price is a kraft tag chip and a status is an 8px dot plus its word. The owner may compare it later with a plain white-space version, so every colour is a token in `going-once.css` (values in `canvas.md` "Look"), never a hex in a component.
- **A person waiting on you is bundled, never dropped.** The interest push is on by default, at most one per person per 15 minutes, quiet 10 PM to 8 AM in the sale's time zone with one morning push, and it names only the thing ("New interest in Gray sofa").
- **The scale fixture.** "Big garage sale (scale test)" (`seed-going-once-scale`, `npm run seed:going-once-scale`, `scripts/seeds/goingOnceScale.ts`) is Maya's second sale for checking that screens scale and stay fast: 50 things with photos, about one in nine not listed yet and some long names. Whenever a feature adds a list, section or per-thing field, extend this seed with an oversized version in the same PR (and its document count), then open the feature on this sale at phone width, check it still reads well, and check that switching tabs stays snappy (the Things tab mounts a row only near the viewport via `LazyMount`; a new long list does the same).
