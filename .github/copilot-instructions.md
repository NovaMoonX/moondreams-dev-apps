# Repository instructions

This repo's conventions are written once, for every coding agent, and this file only points at them, so it never needs updating when a rule changes.

1. Read [`CLAUDE.md`](../CLAUDE.md) first: the core code style, the pattern index, how every PR ends, and the **"Read before you touch"** table.
2. Read every file in [`docs/conventions/`](../docs/conventions/) that the table names for the work, before you start and again before you finish. The ones nearly every change needs are `code.md` (imports, structure, coding styles), `data-contracts.md` (Firestore shapes, listeners, queries, atomic writes, the invite pattern) and, for anything visible, `design-ux.md` and `forms-crud.md`. A new app follows `new-app.md`.
3. For a change under `src/apps/<app>/`, read that app's rules in [`.claude/rules/<app>.md`](../.claude/rules/).

Those files are the source of truth. Where this file and they disagree, they win.
