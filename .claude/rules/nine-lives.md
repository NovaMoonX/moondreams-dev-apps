---
paths:
  - "src/apps/nine-lives/**"
  - "functions/src/apps/nine-lives/**"
---

# Nine Lives rules

Applies on top of `CLAUDE.md` and `docs/conventions/` to everything under `src/apps/nine-lives/` and `functions/src/apps/nine-lives/`.

- **Nine Lives shares with other apps through `share/manifest.ts` and its adapter (`functions/src/apps/nine-lives/share/adapter.ts`), and only what the manifest lists.** Cats (names), upcoming vet visits, vaccinations and preventives that have a next due date, vet clinics (name, phone, address) and, offered off, conditions are the whole of it; each household the person is a member of is read with only those fields selected, so an expense, a weight, a litter log, an uploaded record, a note or a microchip number never leaves, and a new private field stays out of the adapter. It opens `/nine-lives`, which takes no parameter. `npm run connections:vendor` writes the server copy of the manifest.
