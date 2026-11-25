# What's new notes

Each app shows people what changed for them after an update. A PR that changes something a person would notice adds **one file**, `whats-new/<slug>.json`, with a lowercase slug (a-z, 0-9, hyphens) that no other file uses.

```json
{
  "notes": [
    {
      "app": "runway",
      "kind": "improved",
      "text": "An envelope's History now shows running totals.",
      "path": "/runway",
      "gate": null,
      "audience": "everyone",
      "isTold": false,
      "emoji": "📈",
      "replaces": []
    }
  ]
}
```

- **Who it's for:** the person using the app, not the team. One plain sentence in their words, never commit-speak ("refactor", "fix race in listener"). A fix says what now works ("Restart now loads the newest version on the first tap"), not what was broken inside.
- `app`: an app id from `APP_REGISTRY`, or `"site"` for Home, the menu and the top strip.
- `kind`: `new`, `improved` or `fixed` (fixes are rolled up when shown).
- `text`: at most 160 characters, no trailing spaces.
- `path`: an in-site route starting with `/` that opens the thing, only to a screen everyone with access can open; otherwise `null`.
- `gate`: a feature switch id from `FEATURE_GATES` that belongs to the same app, so the note is hidden from anyone the feature is closed for; otherwise `null` (always `null` for `"site"`).
- `audience`: `everyone`, or `debug` for admin and debug-only tools.
- `isTold`: `true` when the person would want to hear it on opening the app: something new they can do, or a change to something they already do (it moved, was renamed, works differently). `false` for a line that is only listed. Always `false` for `fixed`; a release with nothing told doesn't open the sheet by itself.
- `emoji`: one emoji for what the change is about (⏰ for envelope alarms), at most two characters, no letters or digits. Required when `isTold` is `true`; otherwise `null` is fine.
- `replaces`: ids of earlier notes of the same app this one supersedes, as `<file slug>-<index>` (the first note of `runway-alarms.json` is `runway-alarms-0`); `[]` for none, at most 5, never its own id. Since ids count positions, a released file's notes are never reordered or removed from the middle: correct one in place, or replace it from a new file.
- Every key is required; write `null` (or `[]`) rather than leaving one out.

A PR with nothing a person would notice puts a line in its body: `What's new: none (reason)`.

The feed is public, so the text of a `debug` or gated note must be safe for anyone to read: gating only hides it from people's screens. A PR that removes an app or a feature switch edits any older note naming it, or `check:whats-new` fails.

## Notes that build on or undo each other

Before writing a note, read the app's notes not yet in a release (`git tag --contains` finds none for their file) and fold into them.

- **Before a release:** a later PR edits or deletes the earlier note's file, so one feature ends as one line (stacked PRs, follow-ups in the same release).
- **After a release:** a new note names the old one in `replaces`, and people then see only the newer line; debug viewers keep both in their log.
- **Undoing a feature:** replace its note with one saying what changed, or delete the note when it's unreleased or nobody would notice.
- Versions only group what shipped together; they don't link notes.
- A listed line on its own opens nothing: it waits in the app's history and joins the next pop-up that has something to tell, under **See all**.

To correct a note, edit its file; to pull one back, delete it. The next deploy republishes the feed from the files. A note's version and date come from the merge that added its file, and notes older than 6 months drop out on their own.

`npm run check:whats-new` validates the files; CI also requires a file (or the `none` line) on a PR that touches what people see.
