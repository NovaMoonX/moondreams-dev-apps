# A-List and Nomos

**In one line:** ask Nomos what you're seeing this week, what's on your watchlist or how much the membership has saved you, with each movie's poster beside it.

## What Nomos can read

| Category | Kind | At connect | Why |
|---|---|---|---|
| Planned showings | event | On | The movie, showtime, theater, whether you have a ticket, and the poster. |
| Saved theaters | place | On | Each theater's name, address and time zone. |
| Your watchlist | artifact | On | Each movie, its priority, release date and poster. |
| Movies you have seen | knowledge | Off | Titles, your rating, the day and theater, and the poster. |
| Membership savings | live | Off | Sums only, read only when asked. |

## Posters

A poster is a link to where it is hosted, never a copy: Nomos shows it from that host with no referrer, so the host sees the person's address but not the page. Nothing is stored for it.

## Not shared

What you paid for each ticket, your monthly bill and tax, and share links.

## Keeping it current

A new category or field is added to `share/manifest.ts` (and its vendored copy under `functions/`) with its `sinceVersion`, so a connection shows it as New.
