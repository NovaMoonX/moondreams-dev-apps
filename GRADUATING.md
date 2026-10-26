# Graduating an app

How a mini-app that lives inside this site becomes an app of its own, with its own address, and what has to be true before it does. This is a plan to refine, not a record of something done: no app has graduated yet, and the open decisions at the end are the owner's.

## The three stages

| Stage | Where it lives | Rules | Who can open it |
|---|---|---|---|
| **Draft** | This repo, `status: 'draft'` in the app catalog | Beta tier | The people on its allowed list |
| **Beta** | This repo, `status: 'public'` | Beta tier | Anyone with an account (or the allowed list, if `isRestricted`) |
| **Graduated** | Its own repo, hosting site and domain | Full rules | Whoever its own sign-in allows |

The site's catalog already has `status` (`draft`, `public`, `removed`), `isRestricted` and `allowedUsers` (`src/lib/types/appCatalog.ts`); "beta" is the stage this plan gives to a public app that still lives in the site. Nothing in the code is named beta yet.

**Beta tier rules (in `firestore.rules` now).** While an app is in the site, the rules keep what protects people from each other and leave out what only protects the data from our own client's mistakes. The file shrank from about 243,000 to about 54,000 estimated bytes (limit 256,000, `npm run check:rules-size`), so there is room for every app to grow without touching the limit.

- Kept: sign-in, ownership, membership and role gates, trip phase rules, invite, pending-request and approval flows, immutable ownership fields (`createdBy`, `tripId`, `householdId`, `ownerUid`), own-key-only writes to shared maps (`seenBy`, paid status), the unguessable share-id format, the reminder link check, and the admin and app-catalog rules.
- Dropped: per-field type, length and enum checks, the `hasOnly` and `hasAll` key lists, list caps and timestamp bounds. A person who can write a document can write any shape into it, so the client's types and caps are the only guard.
- Also kept because they protect members from each other: the early-payment rules on Waypoint expenses (the writer is part of the split, at most the expense, and once it is paid only the returned flag changes), the shared album (any member sets it once, an editor changes it, the setter is always the caller), web-address links on Waypoint events, stays, rentals, ideas and the album, no script links in Nine Lives' URL fields, Waypoint membership writes that touch only `members` (an Admin adds only someone who asked or was invited), invite codes listed only by someone waiting on that trip, Worth the Wait's encryption key and reveal lock fixed after creation and each partner's own reveal request, no client deletion of a Worth the Wait space, reminders that reach only yourself or people sharing the trip (sent by its Admins and Editors) or household, and admin by email only with a verified email.
- Loosened as a side effect: an A-List calendar share's owner can rewrite their own share (only `ownerUid` is fixed); a Waypoint editor can write any non-membership, non-archive field of a trip's content, and a voter can write their own uid more than once; any Nine Lives household member can delete a cat, as the app offers; owners can write any value into their own `usage`, `siteVisits` and Pinch `settings` records.
- Cost: a document written under loose rules may not pass the strict rules later, so graduation includes a check over the existing data (phase 2). The strict file is in git history at `c784e89` (the version #480 merged).

## When an app is ready

None of these is a number to hit; they are the questions to answer before starting.

- Is the data model settled? A field still being renamed is a migration waiting to happen.
- Has someone other than the owner used it for a few weeks without a data fix by hand?
- Does it have enough use to justify its own address, install and upkeep (hosting, a domain, CI, secrets, store logins)?
- Can it stand without the rest of the site? Count what it imports from outside `src/apps/<id>/` (phase 1); a large count is work, not a blocker.
- Does the owner want it separate? Graduating is a product decision first.

## What an app shares with the site today

This is the list to walk for any app. "Moves" means it has to exist on the other side after graduation.

| Shared thing | Where it lives now | On graduation |
|---|---|---|
| **Accounts** | One Firebase Auth project (`moondreams-dev-apps`); one sign-in works in every app; `users/{uid}`, `siteVisits/{uid}`, the `admin` claim | Stays if the app stays in this project (option A below). Moves if it gets its own project (option B), and uids must be kept |
| **Data** | Firestore under `apps/<id>/…`, Realtime Database `status/{uid}` presence, Storage paths that mirror Firestore | Stays (A) or is copied (B) |
| **Rules and indexes** | One `firestore.rules`, `storage.rules`, `database.rules.json`, `firestore.indexes.json` | The app's blocks move to the new repo's own files at full strictness; the site's file shrinks further |
| **Functions** | `functions/src/apps/<id>/`, plus site-wide ones: `fetchLinkMetadata`, `fetchPageContent`, `registerAppUsage`, the push sender and reminder pruner, `getFirebaseUsage`. Callables are opened with `npm run fb:invoker` | The app's own move. A site-wide function it uses is copied, or called across projects only if there is a reason |
| **Secrets** | Functions secrets and env (TMDB, OMDB, AMC, image-search keys), reCAPTCHA and Places keys restricted to `apps.moondreams.dev` | Recreated for the new project and domain |
| **Hosting and domain** | One Hosting site, `apps.moondreams.dev` (also the auth domain), a Cloudflare worker for link previews, `manifest-main.json` (the site installs as one app) | A new site and domain, its own manifest, icons and service worker |
| **Push** | `reminders` collection, FCM tokens per origin, `firebase-messaging-sw` | A new origin means new tokens: people turn push on again |
| **Code** | `src/components`, `src/ui`, `src/hooks`, `src/utils`, `src/lib` (including `lib/speech`, `lib/firebase`, `lib/places`), the Redux store, Dreamer UI | Copied or published as a package (phase 3) |
| **Chrome** | The header, the hamburger menu of apps, `useTrackAppUsage`, the app catalog and admin dashboard, the single `SITE_VERSION` | The app brings its own shell; the site stops listing it |
| **Process** | `check:*` scripts, the merge workflow, `PR version label`, the seed scripts, the root README's "Current apps" | Each has a counterpart in the new repo |

To size the code dependency of one app, run this from the repo root (swap `pinch` for the app):

```bash
grep -rhoE "from '(@/|@components|@hooks|@lib|@ui|@utils|@contexts|@store)[^']*'" src/apps/pinch | sort | uniq -c | sort -rn
```

Today Pinch leans hardest on `@/store`, `@/utils`, `@/components/forms`, `@/lib/firebase` and a dozen shared components; Worth the Wait imports the least.

## One decision first: same Firebase project or a new one

| | **A. Same project, new Hosting site and repo** | **B. New Firebase project** |
|---|---|---|
| Accounts and uids | Unchanged. One sign-in still works across the site and the new app | Separate sign-in unless users are imported (Auth export keeps uids; passwords and providers need checking) |
| Data | Stays where it is, paths unchanged | Exported and imported, Storage copied, links and ids unchanged |
| Rules | Still one shared ruleset, so the size limit still applies to the sum | Its own ruleset, no size pressure from other apps |
| Functions, secrets | Same project; new functions added there | Recreated |
| Risk | Low. Reversible by pointing the domain back | High. A cut-over with a freeze and a copy |
| When | First step for any app | Only when isolation is worth the cost (separate billing, separate admins, a different audience) |

Recommendation: do A first. It gives the app its own address, repo and install while keeping accounts, data and functions in place, and B can follow later as a separate project with its own checklist.

## The process

Each phase ends in something that can ship and be rolled back.

### Phase 0: decide

- Name, domain and brand (logo, icons, banner, colors); whether the Moondreams name stays.
- Option A or B, above.
- What "full rules" means for this app: the strictness it had before the beta tier (`git show c784e89:firestore.rules`, the app's blocks), or new.
- Who is told, and how existing links (invite codes, share links, calendar shares) keep working.

### Phase 1: make it stand alone inside this repo

- Run the dependency grep above. For each shared file the app uses, decide: stays shared (it is general), is copied into the app, or is dropped. A file under `src/components` that carries the app's words moves into `src/apps/<id>/`.
- Remove the app's reach into the site: `useTrackAppUsage`, `AppEntryFallback`, the catalog gate, presence, anything that assumes the header or the app menu.
- Give the app its own entry point (`main.tsx`, router, providers, theme class applied at the root rather than by `useXTheme`).
- Keep `npm run check:apps` and the app's checks green throughout; nothing about this phase changes what a person sees.

### Phase 2: tighten and verify the data

- Restore the app's full rules in a branch. Write a script that reads every document of the app and runs it through the strict shape (the client types are the contract); the output is the list of documents the strict rules would refuse.
- Fix or backfill those documents with the app's own actions, not by hand in the console.
- Run the same writes against beta-tier and full rules in the emulator and diff the results (the method in README Troubleshooting, "The merge deploy fails with `Release … already exists`"), so the tightening is reviewed, not assumed.
- Check indexes (`npm run check:indexes`) and that every callable checks `request.auth` or says why not.

### Phase 3: extract the code

- New repo with history: `git filter-repo --subdirectory-filter src/apps/<id>` (or a subtree split), then add the shell, config and the shared files chosen in phase 1.
- Shared UI: copy what the app uses, or publish a small package from this repo. Copy first; a package is a second product to maintain, so only when two graduated apps need the same fix.
- Move the app's Functions, rules, indexes, seed, docs (`README`, `UX`, `TECHNICAL`, `ISSUES`) and rules files (`.github/instructions/<id>.instructions.md`, `.claude/rules/<id>.md`).
- Carry over the process that protects it: CI checks, the merge workflow, versioning, review agents. Its own version and tags replace `SITE_VERSION`.

### Phase 4: stand up the new home

- Firebase Hosting site (A) or project (B), the domain and DNS, the Cloudflare worker's link-preview entry for the new address.
- Add the domain to Auth authorized domains, OAuth redirect URIs, the reCAPTCHA Enterprise key, App Check and the Places key referrers (README "Troubleshooting" lists what broke the last time a domain was wrong).
- A manifest, icons and service worker for the app; FCM sender and VAPID key if it sends push.
- Secrets created in production before the first deploy (a missing one fails the whole deploy).
- Deploy it dark on a preview address and run the app's journeys against production data in a test account.

### Phase 5: move (option B only)

- Announce a window. Freeze writes (read-only rule or maintenance page).
- Export Auth users, Firestore `apps/<id>` and the shared documents the app reads, Storage and Realtime Database presence; import into the new project.
- Verify counts per collection, a sample of documents, and sign-in for a real account. Keep the old data untouched until the new app has run for a few weeks.

### Phase 6: cut over

- Point the domain at the new app. In this site, keep a route at `/<id>` that redirects to the new address and keeps working deep links: invite codes, `…/shared/<id>` links, calendar shares and cooking or trip links.
- Set the app's catalog `status` to `removed`, or to a "moved" state if one is added, so the menu stops listing it.
- Watch the first days: auth errors, App Check failures, push delivery, Storage access, function logs.

### Phase 7: remove it from the site

- Delete `src/apps/<id>/`, its slice and listeners, route, registry entry, logos and banners, seed scope, `check:*` entries and the usage finder (`functions/src/apps/<id>/findFirstActivityAt.ts`).
- Delete its Functions from production (removing the source does not delete what is deployed, and CI cannot answer the CLI's prompt to delete them; list them with `firebase functions:list` and delete), its rules blocks, indexes and Storage rules.
- Update the root README's "Current apps" and `functions/README.md`.
- Run `npm run check:rules-size`: the site's rules get smaller by the app's share, which is room for the apps that stay.

## Rolling back

- Before phase 6: nothing public changed; delete the new site.
- After phase 6 with option A: point the domain back and restore the route; data never moved.
- After phase 6 with option B: the old project still has the data from the freeze; export what changed since in the new project and import it, or accept losing that window. This is why the old data stays untouched for weeks.

## Checklist to copy into the graduation issue

- [ ] Name, domain, option A or B decided; people told
- [ ] Dependency grep run; each shared file decided
- [ ] App stands alone in this repo; `check:apps` and the app's checks green
- [ ] Full rules restored; every document validated; failures fixed
- [ ] Beta-tier and full rules diffed in the emulator
- [ ] New repo with history; CI, versioning and review process in place
- [ ] Hosting, domain, Auth domains, App Check, reCAPTCHA, Places, FCM set up
- [ ] Secrets created in production
- [ ] Manifest, icons, service worker
- [ ] Preview run against production data with a test account
- [ ] (B) Freeze, export, import, counts verified
- [ ] Redirect and deep links from the site working
- [ ] Catalog status changed; first days watched
- [ ] App code, functions, rules, indexes, seed and docs removed from the site
- [ ] Root README and `functions/README.md` updated; rules size re-checked

## Decisions so far

Answered by the owner; the rest stay open.

- **Beta tier:** every app here is a beta app, so the beta-tier rules apply to all five, Waypoint's shared-trip data included. A later change will spell out what beta means.
- **Same project or new:** undecided. Option A stays the recommendation.
- **Shared UI:** copy it into the graduated app for now; a package only when two graduated apps need the same fix.
- **Brand:** each graduated app has its own name and brand.
- **This site's menu:** a graduated app stays in the menu as a link out.

## Still open

- Option A or B for the first app to graduate.
- What "beta" promises people, written down once (the later change above).
