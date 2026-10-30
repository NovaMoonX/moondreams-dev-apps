---
name: automerge
description: The owner's standing go to merge the PRs of this session's work once they are finished, but only when nothing on them needs the owner (no open decision, no risk, nothing they should know first). Use when the owner runs /automerge or writes "automerge" in a request, at the start or at any point in a session.
---

# Automerge

"automerge" (or `/automerge`) is the owner saying, once: "if there's nothing that needs my attention, input or knowing, merge this when you're done." It covers every PR this session opens or drives from the moment it is given until the session ends, and nothing it didn't touch.

Finish the PR the usual way first (`pr-wrap-up`, the review its size gets, fixes, status comment). Then merge it by `orchestrate` "Merging a run's PRs" (every gate there holds on the current head, ready for review, squash, wait for the deploy), only if, in addition:

- **No decision is open on it.** A `(who: owner)` line in its status comment, a 🚩 in its body or in your reply, a reviewer finding you chose not to fix, or copy you flagged for a second look all hold it. A question about later work (a follow-up the PR doesn't need) doesn't hold it: move it to an issue first, and link the issue from the status comment.
- **Nothing the owner should know is new with it.** A risk it brings (a rule widened, data rewritten, a behaviour people rely on removed, a secret or console step, something that could only be checked on a device and could break), or a check it skipped, holds it. A known limit that was already true before the PR, written in the PR body, does not.
- **Its reviews came back clean, or every confirmed finding is fixed** and the fixes were looked at on the head that ships.

When any of these holds a PR, leave it as a draft, say which one in a 🚩 line, and carry on with the rest. After a merge, say in one line what shipped and link the merged PR; the owner reads it after the fact.
