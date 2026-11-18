# Overview comment (posted on the polish PR)

This is the owner's single "before merging" document, and it must be as easy to act on as possible (owner: "I just want the setup for our MVPs and everything to be as easy as possible"). The owner always works from the polish PR, which holds every change, so the comment speaks only of that PR. Be explicit:
- **one command does the whole setup** wherever a script can: the build adds an `<app>:setup` script that runs every setup step in order, skips what is already done (checked without printing a secret), asks before optional steps, prints the few browser clicks no command can do and waits, and is safe to re-run (Helm's `scripts/helm/setup.sh` is the reference). The comment then shows that one command, plus only the clicks and the after-deploy command if any; never the per-PR breakdown;
- any other command is pasted exactly, one code block per command, run from the repo root unless stated otherwise;
- **nothing about how the stack merges**: the owner never decides or reads about merge strategy (owner: "I don't want to see anything about how we merge"). The session merges once the owner says the setup is done (Phase 3 step 10 of the skill);
- check each fact against the stack's actual diff;
- update the comment in place (`gh api -X PATCH repos/{o}/{r}/issues/comments/<id>`) whenever something changes, rather than posting a new one.

## Sections, in this order

### 0. Packages, installs and config
Diff the whole stack against `origin/main`:
```bash
git diff --stat origin/main...HEAD -- package.json package-lock.json functions/package.json functions/package-lock.json
git diff --stat origin/main...HEAD -- firebase.json firestore.indexes.json storage.rules database.rules.json .github vite.config.ts
```

State plainly:
- new or changed npm packages, in the app and in `functions/` (or "none");
- whether `npm i` / `npm --prefix functions i` is needed;
- new `package.json` scripts;
- new `VITE_*` env vars or GitHub Actions secrets;
- changed Firebase config files.

Include the local post-pull commands. `npm run emulators` rebuilds the functions through the `preemulators*` hooks.

### 1. Setup before the merge
Everything that must exist before the merge (Functions secrets: CI deploys every function on merge and a missing secret fails the whole deploy; APIs to turn on; console settings), as the one `<app>:setup` command above, then:
- the clicks no command can do, each spelled out, only if the script doesn't already print them;
- a last line: "Then tell me it's done and I'll merge it."
- the IAM fix in case CI's service account can't attach a secret, in a collapsed `<details>`.

### 2. Try it locally, real or fixtures
Every outside service the app calls works locally both ways, with the seeded data: real when its key can be read (signed in to `gcloud`, or `functions/.secret.local`), fixtures otherwise. Give, each in its own block:
- `npm run local:services` to see which way each service goes (the app's services must be rows in it, `cloud-functions.md`);
- `npm run local:services -- fixtures <service|all>` and `-- real <service|all>`, then the emulator restart;
- anything a real connection needs locally (an OAuth redirect URI, a sandbox account);
- what to try in the UI, as which seeded person.

### 3. After the first deploy
Nothing to run for a new callable: the deploy opens it to the browser (README's "New Cloud Functions & Cloud Run invoker access"). Only if the browser still shows a CORS error, `npm run fb:invoker -- <function>`.

### 4. Project board
Nothing to run: the `create-issues` label put the issues on board 3. Only if that workflow failed, say why and what fixes it.

### 5. Brand assets
Include the light and dark icon SVG sources inline in fenced `svg` blocks. Say that the logo and banner in the repo are placeholders built from them, and that the user creates the final assets.

### 6. Not verified here
For example, the live third-party API and paraphrased brand copy, each with exactly what to check.

### Key decisions worth knowing
- API budget and caching numbers, and how to override them;
- data licences and attribution;
- known simplifications, with the issue that tracks each;
- the privacy and rules model;
- money and date representations;
- what the polish review found and fixed, and what it deferred;
- the convention rules added or changed (`docs/conventions/`, agents in `.claude/agents/`), one line each;
- each PR's review size and who reviewed it;
- tiers that aren't built yet.

**Questions in the comment** follow `CLAUDE.md` "Every work round ends with the same card": each one says what each answer would mean for the person and why the recommendation; a choice that is cheap to change later (a cap, a line of copy) is made by the session and listed under "Decisions I made for you", never asked. A privacy or terms claim is checked by the session against the vendor's own pages before it ships, never handed to the owner to verify.

End with `---` and `_Generated by [Claude Code](https://claude.ai/code)_`.
