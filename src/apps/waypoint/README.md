# Waypoint 🗺️

## The short

Waypoint is an adaptive, itinerary-first travel planner that turns static trip docs into interactive journeys. It provides a real-time grouped timeline, 1-tap native map navigation (Apple Maps / Google Maps), granular expense splitting with payment tracking, departure checklists, and role-based permissions.

## The story

Planning trips in Google Docs starts out well but quickly turns into a chaotic wall of text, buried links, unorganized comments, and hidden costs. Once the trip begins, finding today's schedule or launching navigation on the go is frustrating. Waypoint acts as a live collaborative planner during preparation and transforms into a focused, low-friction navigation HUD during the trip itself.

## How it Works

1. **Create & Invite** — A trip organizer (automatically the trip's Admin) creates a new Waypoint space (e.g., "Tokyo Summer 2026"), sets the dates, and shares an invite link. Anyone who follows it joins as pending until an Admin approves them and assigns their role — editor, commenter, or viewer.
2. **Pre-Trip Checklist & Expense Allocation** — The group populates the "Before the Road" checklist (flight confirmations, driving routes, passport checks) and enters expected expenses. Expenses can be assigned to everyone, specific members, or individual users, with status tracking to mark items as paid and a running "who owes who" summary so debts are easy to settle.
3. **Build the Adaptive Itinerary** — Add activities, transit steps (flights, drives, ferries) — including flight numbers and confirmation details so anyone can check on a delayed flight — and locations, whether the trip stays in one place or moves across multiple cities day to day — with each place you're sleeping tracked as its own stay, check-in to check-out. Commenters can propose edits or drop notes that Editors can review and approve with one click, and any change to a time or location is flagged clearly rather than buried in an edit history.
4. **Live Trip Mode** — When the trip starts, Waypoint shifts into active mode — elevating today's schedule, highlighting what is currently active, what is coming up next, and what has been completed. Members can post a quick status (checking bags, landed, driving through Denver) so the group knows where everyone is, and near the end of each day and the end of the trip, Waypoint reminds everyone to add today's photos to the trip's shared album link.

## How it Feels

- **Itinerary-First** — No endless scrolling; every item is time-bound, location-aware, and actionable.
- **Adaptive Context** — Seamless transition from high-level pre-trip planning to high-stakes active execution on the go.
- **Zero-Friction Navigation** — One tap launches native Apple Maps or Google Maps directions for any destination on the itinerary.
- **Granular Transparency** — Complete clarity on task assignments, expense allocations, payment statuses, and any changes to the plan.
- **Together, Even When Apart** — Lightweight status updates and a shared album keep the group connected even when a day splits people up.

## The Build Plan

**Core MVP**
- [ ] Trip Space Setup & Roles: Start a trip with a title and dates (given as an estimate, editable anytime) — destination, cover photo, and default currency are editable afterward, not required upfront. Roles are admin, editor, commenter, viewer. New members request access via an invite link and join once an admin approves them and sets their role.
- [ ] Before the Road Checklist: Departure task list with completion states and member assignments.
- [ ] Expense Allocation & Splitter: Itemized expenses assigned to everyone, specific members, or individuals, tracking who's paid and rolling it up into a clear "who owes who" summary.
- [ ] Day-by-Day Timeline & Directions: Structured timeline grouped by day with event times, transit types, locations, and 1-tap native map navigation.
- [ ] Multi-Destination Itineraries: A trip isn't locked to one home base — a given day can be its own city, state, or leg of the journey, and the timeline reflects wherever that day actually is.
- [ ] Multiple Stays: A trip can include more than one place to sleep, each with its own check-in/check-out dates, address, and 1-tap directions — so a lodging change partway through a multi-leg trip is tracked just as clearly as everything else.
- [ ] Visible Itinerary Changes: Edits to an event's time, date, or location are clearly flagged (e.g. "Departure moved: 8:00 AM → 2:00 PM") so a change never slips by unnoticed.
- [ ] Realtime Sync: Changes show up instantly for everyone in the trip — no refreshing needed.

**Next Steps**
- [ ] Comment & Proposal Approval Workflow: Commenters submit event changes/proposals; Editors accept or decline.
- [ ] Active Trip HUD: Automatic detection of current trip day featuring an "Active Now / Up Next" hero banner.
- [ ] Transit Detail Cards: Specialized fields for flights (airline, flight number, confirmation code), driving routes, and train schedules — plus an estimated travel time for the leg — visible to the group so anyone can check a flight's status.
- [ ] Live Travel Status: Members can post a quick status update — checking bags, landed, passing through a city — visible to the group during active trip mode.
- [ ] Shared Trip Album Link: A default, semi-prominent spot for one person to drop a link to wherever the group's photos already live (a Google Photos or Drive folder), with reminders near the end of each day and the end of the trip to add today's photos there.
- [ ] Restaurant, Activity & Stay Idea Board: A pre-trip space, front and center before the trip starts and still browsable after, where anyone can drop restaurant, activity, or stay suggestions — hotels, Airbnbs, anywhere someone might book — and upvote favorites, with stay ideas grouped by which part of the trip they're for. The group sets a shared list of must-haves and nice-to-haves for where to stay, and each stay idea can be checked against it, plus its own extra perks. A one-tap action turns a restaurant or activity idea straight into a timeline event, or a stay idea into a booked stay, pre-filled and needing only the remaining details (day and time, or check-in and check-out).
- [ ] Offline Support: Trip data is cached locally so it's viewable without signal while traveling.
- [ ] My Trips Search, Filter & Sort: Find a trip quickly as the list grows — search by name, filter by date range, status (live/upcoming/past), or destination, and sort.
- [ ] Trip Tags: Freeform tags like "Guys Trip" or "Couples Vacation" — separate from destination — shown on My Trips and within the trip itself.
- [ ] Auto-Suggested Transit Between Events: Adding an event proposes a default driving leg to and from it, editable, convertible to downtime, or removable, so commutes between plans aren't forgotten by default.

**Stretch Goals**
- [ ] Calendar Export: Add the itinerary to your phone's calendar app.
- [ ] Google Maps Link Parser & Metadata: Paste a Google Maps link to auto-extract the place name, photo, and address.
- [ ] General Booking Link Metadata: Parse hotel and activity booking links for rich preview cards.
- [ ] Printable Trip Summary: Generate a clean, printable version of the itinerary.
- [ ] Covered-By Toggle & Multi-Currency: Toggle "Expense covered by [Blank]" per item and live currency conversion rates.
- [ ] Weather Forecast Integration: Pull in a weather forecast for each day or leg of the trip from a weather API.
- [ ] Daily Travel Effort Summary: A collapsible total at the top of each day — travel time now, potentially broader effort factors like walking or standing later — with an icon reflecting whatever travel method dominates that day.

## Under the Hood

- **Frontend:** React + TypeScript + Tailwind CSS.
- **Backend & Realtime:** Firebase (Firestore, Realtime Database, Auth).
- **State Management:** Redux Toolkit, consistent with the platform's other mini apps.
- **Deployment:** Ships as a mini-app within the existing platform, under `src/apps/waypoint`.