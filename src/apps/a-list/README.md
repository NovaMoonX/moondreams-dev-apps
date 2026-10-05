# A-List Tracker 🎟️

## The short

A-List Tracker is a phone-first companion for an AMC Stubs A-List membership. It turns a calendar of movie nights into an answer to the one question every member eventually asks: *is this membership actually paying for itself?* Log what you watched (and what you plan to watch), keep a running watchlist, and see your ticket savings, premium-format savings, and break-even status at a glance — each movie night shown as a poster on the calendar.

## The story

A friend just joined A-List. The membership is a flat monthly fee, so its value only shows up over time — and only if you remember what each ticket would have cost, including the upcharge for IMAX or Dolby. A notes app or spreadsheet can hold that, but it can't make a month of movies feel like a month of movies. This app keeps the math honest and the calendar fun.

## How it Works

1. **Set up your membership** — A short welcome, the perks your membership covers, then one question per step: your monthly cost before tax, the total on your bill with tax (skippable), and the day your membership started (it tells you how long you've been a member). The app gauges your tax rate from the first two and tracks the total as your monthly cost. Then set your weekly and monthly watch goals, and add the AMC theaters you go to (skippable). Closing the setup lands on the app's entry page, where you can re-enter or go home.
2. **Add what you've already seen** — A short first-time flow to backfill movies since you joined, so your savings start accurate instead of from zero. Each movie you add nudges you to add another, until you say you're done.
3. **Build a watchlist** — Search for a movie on a full-page screen, pick it, and set a priority and preferred format. Nothing to browse, nothing recommended: just your list. Rounded filter pills (Opening, Must See, Want to See, If I Have Time, Seen) narrow the list; anything opening in the next week is one tap away.
4. **Put movies on the calendar** — Add a movie you saw or plan to see, from your watchlist or a fresh search (new ones join your watchlist automatically), and tag it with the theater (your favorite is picked for you). Each day shows the posters of what you watched; tap a day to see its movies in a drawer (on a computer, hover a day for a peek). Seeing a movie twice is just two entries.
5. **Record what it would have cost** — Mark a movie paid with its format and the three amounts AMC itemizes on every ticket: the ticket price, the convenience fee and the tax, all in dollars. For a premium format, add what a standard ticket would have cost so the upcharge you skipped is counted. Members pay no convenience fee, so the fee you enter is one you skipped; it varies by showing, and the fees you've entered before show up as chips so repeating one is a single tap. The tax field hints at an estimate from your usual rate.
6. **Buy tickets (prototype)** — On an upcoming showing at a saved theater, pick a showtime from AMC (format and list price included), tap through to AMC to buy, and come back to add the fee and tax. The premium format's standard price is filled in too, from the same day's standard showings.
7. **Mark it seen** — When a planned movie's showtime ends, a prompt asks if you saw it. One tap updates your watchlist, and you can leave a star rating, in half stars: tap either half of a star or slide across the row.
8. **Watch the numbers** — The top of the calendar tracks movies watched, movies since Friday (AMC's week turns over on Friday, so that's when the weekly count starts over), and whether your goals are met. The dashboard shows your savings, the convenience fees you've skipped, and whether you've broken even, with breakdowns by format, activity over time, and ratings to follow.

### Savings & Break-Even, In Detail

- **Total ticket savings** is the sum of what each watched ticket would have cost you without the membership: the ticket price, the convenience fee you skipped, and tax.
- **Convenience fees avoided** is the fee part of that total on its own, so you can see what the membership spares you in fees alone.
- **Net savings** is total ticket savings minus the membership cost you've incurred (tax included), counted in monthly bills from the day you started. Negative means you haven't broken even yet; **break-even** flips once net savings reaches zero.
- **Premium format savings** is the extra you would have paid for IMAX, Dolby Cinema and the like versus a standard ticket for the same showing (premium price minus standard price, before tax and fees), which is why the standard price is requested whenever the format isn't standard. A help icon on the dashboard tile and a link under the standard price field explain it.
- Goals are *your* targets, not rules the app enforces: the "Since Friday" counter reads "watched / goal" (e.g. 1/4) and starts over each Friday, like AMC's week, and the monthly goal shows met or not yet.

## How it Feels

- **App-like, thumb-first** — A phone-shaped app: a bottom bar with Dashboard, Calendar and Watchlist — Calendar in the middle, where the app opens — and details in drawers, no page-hopping. Home is in the avatar menu, not on the page.
- **Playful, a little theatrical** — AMC red and marquee gold, round inputs and pills, and an emoji wherever it says something.
- **Posters first** — The calendar is the star, and each poster fills its whole day like a photo calendar. Two movies on a day split corner to corner, three are cut like a pizza in thirds, four make quadrants — a month of movies reads like a collage.
- **Low effort to log** — Quick prompts, sensible defaults, and as little typing as possible. Anything optional waits behind a "+ Add" link.
- **Honest math, friendly tone** — A negative net-savings number is shown plainly but kindly ("not yet" beats a red alarm).

## Why this isn't just another movie tracker

Generic trackers log what you watched; this one logs what it *cost* and what the membership *saved*. That changes what gets built: format and price are first-class fields on every viewing, premium formats come with a "what would a standard ticket have been" step, fees and tax come from your own history, and watch goals and break-even sit at the top of the calendar. And because the membership is the point, there's no browsing catalog or recommendations — your watchlist is a personal queue, not a storefront.

## The Build Plan

**Core MVP**
- [x] Membership Setup: Confirm perks, enter the monthly cost before tax, the bill total with tax and the start date; see the tax rate gauged from them; set weekly and monthly watch goals.
- [x] Backfill Past Movies: A first-time flow to add movies already watched since joining, one after another with "Add + another" as the main button.
- [x] Poster Calendar: Month calendar where each day is filled by the poster(s) of what was watched or is planned — one, a corner-to-corner split, pizza-style thirds, or quadrants.
- [x] Day Details: Tap a day to see its movies with format, rating, and price.
- [x] Top-of-Calendar Counters: Total movies watched, movies since Friday (watched/goal), and weekly and monthly goal status.
- [x] Add to Calendar: Add a watched or planned movie from your watchlist or a search; new movies join the watchlist automatically.
- [x] Rewatches: Every viewing is its own entry, so the same movie can appear many times.
- [x] Watchlist: Search and add movies with release date, preferred format, priority (Must See / Want to See / If I Have Time), seen status, and date watched or planned.
- [x] Opening Tab: The watchlist opens on a tab of movies releasing in the next seven days, with a count so they can't be missed.
- [x] Mark as Paid: Format, ticket price, standard-format price for premium showings, the convenience fee you skipped (past fees as one-tap chips) and the tax amount, all in dollars as on the AMC receipt.
- [x] Edit & Remove Viewings: Fix a price, format, date or fee, or delete a viewing; the calendar, watchlist and savings update to match.
- [x] Mark as Seen: A prompt after a planned movie ends that updates the watchlist and takes an optional star rating.
- [x] Trailer Picks: In the half hour before a planned showing and the first ten minutes after it starts, a small bubble above the Calendar icon offers "Add from trailers": search, tap a title, and it is saved quietly as Want to See, ready for the next trailer. What you've added so far is listed right there, each with an Undo. Nothing pops up on its own; fold the bubble away and a small chip above the icon brings it back.
- [x] Theaters: Find AMC theaters by zip code, city or your current location (only when you tap for it), save up to ten, pick a favorite, and tag each showing with one. Entry points: the last Setup step, the Dashboard's theaters row and a quiet nudge on the Calendar.
- [x] Buy Tickets (prototype): Pick an upcoming showing from AMC's showtimes at your theater, with its format and list price, then head to amctheatres.com to buy it. Before you go, you're told the two numbers to look for (the convenience fee and the tax); when you come back, the price is already filled in and you add those two. Built to test whether members want it.
- [x] Savings Summary: Monthly cost with tax, total ticket savings, net savings, break-even status, premium format savings, and convenience fees avoided.

**Next Steps**
- [ ] Dashboard — Formats: Movies watched by format, as a count and a percent.
- [ ] Dashboard — Activity: Movies watched over time.
- [ ] Dashboard — Ratings & Spend: Movies grouped by your star rating, with what was spent per rating.
- [ ] Dashboard — Premium Insights: Average premium difference and savings for each premium format.

**Stretch Goals**
- [ ] Showtime Reminders: A nudge before a planned showing (time to head out) and after it ends (mark it seen, log what you paid).
- [ ] Convenience Fee Estimates: Suggest a likely fee for a new payment based on factors like format and past entries, shown alongside the one-tap chips.
- [ ] Monthly Recap: A shareable summary card of your month in movies.
- [ ] Membership Price History: Record when your monthly cost changes, so cost incurred and break-even stay right across a price change instead of applying today's price to every month.
- [ ] Offline Support: Calendar and watchlist viewable without signal at the theater.

## Under the Hood

- **Frontend:** React + TypeScript + Tailwind CSS, built on Dreamer UI — the calendar is Dreamer UI's `Calendar` with a custom `renderCell` for the poster split.
- **Movie Data:** TMDB (including upcoming films) for search, posters, US release dates and content ratings, with OMDb as the alternative when no TMDB key is set. OMDb's free tier allows about 1,000 lookups a day for everyone combined, so lookups go through a thin server-side proxy that remembers results, search waits for a pause in typing, and a manual "add by title" path covers an empty quota or a film neither source has. AMC theaters and showtimes come from the AMC Theatres API through Cloud Functions that hold the key, with their own cache and daily budget. A showing's format and list price can be filled in from AMC's showtimes (upcoming days only); the convenience fee and the tax are never exposed, so you enter them.
- **Backend & Realtime:** Firebase (Firestore, Auth, Cloud Functions), private to each member — no sharing or invites.
- **State Management:** Redux Toolkit, consistent with the platform's other mini apps.
- **Deployment:** Ships as a mini-app within the existing platform, under `src/apps/a-list`.
