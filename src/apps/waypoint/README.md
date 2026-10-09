# Waypoint 🗺️

## The short

Waypoint is an adaptive, itinerary-first travel planner that turns static trip docs into interactive journeys. It provides a real-time grouped timeline, 1-tap native map navigation (Apple Maps / Google Maps), granular expense splitting with payment tracking, departure checklists, and role-based permissions.

## The story

Planning trips in Google Docs starts out well but quickly turns into a chaotic wall of text, buried links, unorganized comments, and hidden costs. Once the trip begins, finding today's schedule or launching navigation on the go is frustrating. Waypoint acts as a live collaborative planner during preparation and transforms into a focused, low-friction navigation HUD during the trip itself.

## How it Works

1. **Create & Invite** — A trip organizer (automatically the trip's Admin) creates a new Waypoint space (e.g., "Tokyo Summer 2026"), sets the dates, and shares an invite link or code. Anyone who follows the link or enters the code (My Trips → Join with code) joins as pending until an Admin approves them and assigns their role — editor, commenter, or viewer — unless an Admin already added their email: those people join straight away, as the role they were given. Once in, any trip's URL (`/waypoint?trip={tripId}`) opens straight to it for members, so a trip can be shared or bookmarked directly.
2. **Pre-Trip Checklist & Expense Allocation** — The group populates the "Before the Road" checklist (flight confirmations, driving routes, passport checks) and enters expected expenses. Expenses can be assigned to everyone, specific members, or individual users (or priced per person, so a $15 meal for four totals $60), with status tracking to mark items as paid and a running "who owes who" summary so debts are easy to settle. Anyone who already sent someone their part of an expected expense can record it as paid early, so it cancels out when the expense is paid (or shows as owed back if plans change), and the totals can be viewed per person, for the group, or just for you.
3. **Build the Adaptive Itinerary** — Add activities, transit steps (flights, drives, ferries) — including flight numbers and confirmation details so anyone can check on a delayed flight — and locations, whether the trip stays in one place or moves across multiple cities day to day — with each place you're sleeping tracked as its own stay, check-in to check-out. Commenters can propose edits or drop notes that Editors can review and approve with one click, and any change to a time or location is flagged clearly rather than buried in an edit history.
4. **Live Trip Mode** — When the trip starts, Waypoint shifts into active mode — elevating today's schedule, a small pill that floats over the main screens with what is happening right now and, one tap away, what comes next, and what has been completed. On a check-in day, that night's stay sits up top with directions, the confirmation code, and any notes. Members can post a quick status (checking bags, landed, driving through Denver) so the group knows where everyone is, and near the end of each day and the end of the trip, Waypoint reminds everyone to add today's photos to the trip's shared album link.

## How it Feels

- **A look of its own** — business casual: utility with a little style. A quiet steel blue, soft sky neutrals and a warm orange, with corners between formal and playful (themed in `waypoint.css`).
- **Itinerary-First** — No endless scrolling; every item is time-bound, location-aware, and actionable.
- **Adaptive Context** — Seamless transition from high-level pre-trip planning to high-stakes active execution on the go.
- **Zero-Friction Navigation** — One tap launches native Apple Maps or Google Maps directions for any destination on the itinerary.
- **Granular Transparency** — Complete clarity on task assignments, expense allocations, payment statuses, and any changes to the plan.
- **Together, Even When Apart** — Lightweight status updates and a shared album keep the group connected even when a day splits people up.

## The Build Plan

**Core MVP**
- [ ] Trip Space Setup & Roles: Start a trip with a title and dates (given as an estimate, editable anytime — plans move with them, or stay put on their original dates if you'd rather) and a default time zone — destination, cover photo, and default currency are editable afterward, not required upfront. Roles are admin, editor, commenter, viewer. New members request access via an invite link and join once an admin approves them and sets their role.
- [ ] Before the Road Checklist: Departure task list with completion states and member assignments. Any member can also keep a private task that only they see (never on Overview).
- [ ] Expense Allocation & Splitter: Itemized expenses assigned to everyone, specific members, or individuals, tracking who's paid and rolling it up into a clear "who owes who" summary.
- [ ] Day-by-Day Timeline & Directions: Structured timeline grouped by day with event times, transit types, locations, and 1-tap native map navigation.
- [ ] Multi-Destination Itineraries: A trip isn't locked to one home base — a given day can be its own city, state, or leg of the journey, and the timeline reflects wherever that day actually is.
- [ ] Multiple Stays: A trip can include more than one place to sleep, each with its own check-in/check-out dates, address, and 1-tap directions — so a lodging change partway through a multi-leg trip is tracked just as clearly as everything else.
- [ ] Car Rentals: Track a rental car's company, vehicle, pickup and return spots, and times alongside your stays — and on pickup and return day, it shows up on the trip's live Overview so nobody has to hunt for the confirmation code.
- [ ] Visible Itinerary Changes: Edits to an event's time, date, or location are clearly flagged (e.g. "Departure moved: 8:00 AM → 2:00 PM") so a change never slips by unnoticed.
- [ ] Realtime Sync: Changes show up instantly for everyone in the trip — no refreshing needed.

**Next Steps**
- [ ] Comment & Proposal Approval Workflow: Commenters submit event changes/proposals; Editors accept or decline.
- [x] Arrive By: A dining or activity event can say when to be there, before it starts, with an optional note on why ("the lot fills up by 9"). The card reads "Arrive by 9:00 AM · starts 10:00 AM" under the title, and the Now pill and today's agenda lead with the arrival.
- [x] Active Trip HUD: Automatic detection of the current trip day, with a floating "Now / Up next" pill over the main screens (Overview, Timeline, Expenses).
- [x] Transit Detail Cards: Specialized fields for flights (airline, flight number, confirmation code), driving routes, and train schedules — plus an estimated travel time for the leg — visible to the group so anyone can check a flight's status. Group the legs of one trip into a collapsible card, and stack several travelers' trips into one named itinerary.
- [ ] Live Travel Status: Members can post a quick status update — checking bags, landed, passing through a city — visible to the group during active trip mode.
- [ ] Shared Trip Album Link: A default, semi-prominent spot for one person to drop a link to wherever the group's photos already live (a Google Photos or Drive folder), with reminders near the end of each day and the end of the trip to add today's photos there.
- [ ] Restaurant, Activity & Stay Idea Board: A pre-trip space, front and center on Overview before the trip starts (new ideas close once it does) and still browsable and votable after, where anyone can drop restaurant, activity, or stay suggestions — hotels, Airbnbs, anywhere someone might book — and upvote favorites, with stay ideas grouped by which part of the trip they're for. The group sets a shared list of must-haves and nice-to-haves for where to stay, and each stay idea can be checked against it, plus its own extra perks. A one-tap action turns a restaurant or activity idea straight into a timeline event, or a stay idea into a booked stay, pre-filled and needing only the remaining details (day and time, or check-in and check-out).
- [ ] Offline Support: Trip data is cached locally so it's viewable without signal while traveling.
- [ ] My Trips Search, Filter & Sort: Find a trip quickly as the list grows — search by name, filter by date range, status (live/upcoming/past), or destination, and sort.
- [ ] Trip Tags: Freeform tags like "Guys Trip" or "Couples Vacation" — separate from destination — shown on My Trips and within the trip itself.
- [x] Add by Email: An Admin adds someone's email and role from Members before they ever ask (nothing is sent); when they sign in, My Trips opens an invitation with a one-tap Join, no approval needed, and the person shows in Members as "yet to join" until then.
- [x] Travel That's Yours: Each member is asked for their own arrival and trip home (skippable), Overview shows only the events you're part of, and a start and an end can sit in different time zones (a flight that lands elsewhere), with zones searchable by city or name and daylight saving handled for you.
- [x] Fill From a Confirmation: When adding a flight, a stay or a car rental, upload a photo, screenshot or PDF and the form fills in; you check and edit the fields like any other entry before saving.
- [x] Days Around the Trip: Events, stays, rentals and expenses can sit up to three days before or after the trip's dates; checklist items can be due any distance ahead and stay that far from the trip if its dates move.
- [x] Copy as Markdown: "Copy trip as Markdown" in the trip menu copies the whole itinerary (dates, city, people, timeline, stays, car rentals, checklist, ideas), and "Copy" beside the Timeline's View options copies just the timeline, one heading per day with the trip's time zone stated once. Confirmation codes and notes go with it; expenses and member emails never do.
- [x] Trip City: A trip can be based in a city (searched when creating the trip, which also sets its time zone, or changed from the trip menu). It shows under the trip's title. A day's weather follows the day's own located plans (a day entirely in another place shows that place; a day split between places shows the main one plus "also" chips); the trip city covers days with no located plan, and a day with neither shows no weather.
- [x] Slim Logistics: Stays, rentals and travel legs ride the timeline as one-line rows placed by time; tapping one opens its details (read-only for a stay or rental).
- [x] No expense needed: An event, stay or rental with no cost can be marked so its "No expense yet" reminder goes away for everyone, with an Undo in its details.
- [x] Event To-dos: An activity or dining event can have checklist items linked to it ("Reserve the parking pass"). Its card says what is left first ("2 to do · 1 of 3 done") and "All done" once they are; an activity with none says "No booking yet". After saving an activity one question ("Does anything need booking ahead?") adds them, the event's tab and form chip link ones already on the checklist, and deleting an event asks whether to delete its to-dos and expenses too.
- [x] Personal Expenses: A private "Just for me" list on the Expenses screen for what someone is covering themselves. Only its owner sees it; the totals show everyone's figure with the owner's personal amount added in a different color and the combined total beneath, so nobody does the math.
- [ ] Auto-Suggested Transit Between Events: Adding an event proposes a default driving leg to and from it, editable, convertible to downtime, or removable, so commutes between plans aren't forgotten by default.

**Stretch Goals**
- [ ] Calendar Export: Add the itinerary to your phone's calendar app.
- [ ] Google Maps Link Parser & Metadata: Paste a Google Maps link to auto-extract the place name, photo, and address.
- [ ] General Booking Link Metadata: Parse hotel and activity booking links for rich preview cards.
- [ ] Printable Trip Summary: Generate a clean, printable version of the itinerary.
- [ ] Covered-By Toggle & Multi-Currency: Toggle "Expense covered by [Blank]" per item and live currency conversion rates.
- [x] Weather Forecast Integration: Each Timeline day shows its forecast (from two weeks out, and through a live trip), with an hour-by-hour view for today on Overview and a small forecast beside events that have a saved location.
- [ ] Daily Travel Effort Summary: A collapsible total at the top of each day — travel time now, potentially broader effort factors like walking or standing later — with an icon reflecting whatever travel method dominates that day.

## Under the Hood

- **Frontend:** React + TypeScript + Tailwind CSS.
- **Backend & Realtime:** Firebase (Firestore, Realtime Database, Auth).
- **State Management:** Redux Toolkit, consistent with the platform's other mini apps.
- **Deployment:** Ships as a mini-app within the existing platform, under `src/apps/waypoint`.