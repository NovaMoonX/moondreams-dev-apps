---
name: automerge
description: The owner's standing go to merge the PRs of this session's work once they are finished, but only when nothing on them needs the owner (no open decision, no risk, nothing they should know first). Use when the owner runs /automerge or writes "automerge" in a request, at the start or at any point in a session.
---

# Automerge

"automerge" (or `/automerge`) is the owner saying, once: "if there's nothing that needs my attention, input or knowing, merge this when you're done." It covers every PR this session opens or drives from the moment it is given until the session ends, and nothing it didn't touch. It is a go to join the merge line, not to merge at once: another session's merge or deploy always finishes first.

Finish the PR the usual way first (`pr-wrap-up`, the review its size gets, fixes, status comment). Then merge it by `orchestrate` "Merging a run's PRs" (every gate there holds on the current head, the merge lock and the line, ready for review, squash, wait for the deploy), only if, in addition:

- **No heavy decision is open on it.** A heavy decision is one a follow-up PR can't cheaply undo or that could hurt the person if wrong: a figure about money the code computes wrong (not a model's answer the sandbox can't run, below), a data shape, a rule or who can see what, removing a behaviour people rely on, a secret or console step, a cost. It holds the PR as a `(who: owner)` line and a 🚩. A **light decision** (copy, a default, a threshold, how an AI is told to classify, which of two reasonable layouts) never holds it: make the call, merge, and list it under "Decisions I made for you" in the PR body and in the round's card, each with what you chose and the other option, so the owner can ask for the change after the fact (owner, Runway budget reading: "these are light decisions … you could have just merged"). A reviewer finding you chose not to fix is light when it is one of these, and a question about later work goes to an issue first.
- **Nothing the owner should know is new with it.** A risk it brings (a rule widened, data rewritten, a behaviour people rely on removed, a secret or console step, a break only a device would show) holds it. **What an AI model answers is not one of these:** a prompt change that the sandbox can't run against the real model ships, and its check ("re-read the CSVs after the deploy") is a **Should** in the status comment and a ⚠️ in the card, never a 🚩 or a hold, since a wrong answer is fixed by the next PR in minutes and the code around it (normalising, forms, checks) is still verified. A known limit that was already true before the PR, written in the PR body, does not hold it either.
- **Its reviews came back clean, or every confirmed finding is fixed** and the fixes were looked at on the head that ships.

When any of these holds a PR, leave it as a draft, say which one in a 🚩 line, and carry on with the rest. While it waits its turn, say what it waits behind (the PR, its session, since when) in its status comment and in your reply. After a merge, say in one line what shipped and link the merged PR; the owner reads it after the fact.
