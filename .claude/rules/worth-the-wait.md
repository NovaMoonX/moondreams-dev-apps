---
paths:
  - "src/apps/worth-the-wait/**"
  - "functions/src/apps/worth-the-wait/**"
---

# Worth the Wait rules

Applies on top of `CLAUDE.md` and `docs/conventions/` to everything under `src/apps/worth-the-wait/` and `functions/src/apps/worth-the-wait/`.

- **Worth the Wait shares with other apps through `share/manifest.ts` and its adapter (`functions/src/apps/worth-the-wait/share/adapter.ts`), and only as counts.** Each box's name and emoji, opened on the server with the space's key, and how many items it holds and how many are revealed, from two aggregation counts that read no item document, are the whole of it; no item's content, author, dates or method is read, the invite code is never selected, and a new item field stays out of the adapter. A space the person leaves is no longer read. It opens `/worth-the-wait`, which takes no space or box parameter. `npm run connections:vendor` writes the server copy of the manifest.
