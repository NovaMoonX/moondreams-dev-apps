---
paths:
  - "src/apps/nine-lives/**"
  - "functions/src/apps/nine-lives/**"
---

# Nine Lives rules

Applies on top of `CLAUDE.md` and `docs/conventions/` to everything under `src/apps/nine-lives/` and `functions/src/apps/nine-lives/`.

- **Nine Lives shares with other apps through `share/manifest.ts` and its adapter (`functions/src/apps/nine-lives/share/adapter.ts`), and only what the manifest lists.** Cats (name, then birth date, breed and food as one line), upcoming vet visits plus completed ones from the past year (at most 50 per household, with the doctor's name), vaccinations and preventives that have a next due date (with when the last dose was given), vet clinics (name, phone, address and doctors) and, offered off, conditions are the whole of it; each household the person is a member of is read with only those fields selected, so an expense or vet cost, a weight, a litter log, an uploaded record, a note, a clinic's email or a microchip, tag or insurance detail never leaves, and a new private field stays out of the adapter. A birth date is date-only (UTC midnight) and is written with UTC fields; a dose's given day is date-only from the form but an instant from a tap's "log dose", in a zone the household doesn't store, so an instant reads as "around" its UTC day. It opens `/nine-lives`, which takes no parameter. `npm run connections:vendor` writes the server copy of the manifest.
