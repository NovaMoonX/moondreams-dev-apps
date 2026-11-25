# Decisions

Why things are the way they are, for anyone who has to change them later. A convention in `docs/conventions/` says what to do; a record here says how we got there: what was on the table, what we weighed, what we chose and when to look again. When a rule's bullet links a record, read the record before changing the rule.

## When to write one

Write a record in the PR that makes the decision, without being asked (owner, assistant tools: "we may have to edit this in the future… include what we considered, our reasonings"), whenever a decision is:

- **key**: it shapes how many apps or files work (a contract, a data shape, how tools are offered, a platform choice), or would be costly to undo;
- **not straightforward**: there were real alternatives, the owner and the session went back and forth, or the obvious approach was turned down for a reason someone would otherwise rediscover the hard way;
- **resting on outside facts**: a provider's docs, limits or behaviour, which change and need re-checking.

A one-PR choice that the code and its convention already explain needs none. A light call made for the owner (`automerge` "Decisions I made for you") is listed in its PR, not here, unless it is also one of the above.

## How to write one

One file per decision, `YYYY-MM-DD-short-name.md`, kept short enough to read in five minutes:

1. **The question** in a line or two, and the situation that forced it (numbers where they exist).
2. **What we considered**: each option in a short paragraph, with what it gets right and why it lost (or won).
3. **What we chose** and how it works, in a few bullets.
4. **Why**: the reasoning, with each outside fact quoted and linked to the provider's own page, and the owner's words where they settled it.
5. **How it is held**: the convention bullet and the check that enforce it, by name.
6. **When to revisit**: what would change the answer (a fact still unconfirmed, a client feature arriving, a limit reached), so a later session knows when the reasoning has expired.

The convention or rule the decision produced links the record (`Why, what else was weighed and when to revisit: docs/decisions/…`), and the record names the convention, so either leads to the other. A later change to the decision edits the record, adding a dated line under **Changes** with what changed and why, rather than writing a second record that contradicts the first.

## Records

- [2026-11-25 How apps offer tools to assistants](2026-11-25-assistant-tools.md): a handful of grouped tools per app, switched-off reads listed and marked, change tools hidden when the assistant can't change.
