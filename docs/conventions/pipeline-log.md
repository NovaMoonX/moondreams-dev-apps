# Pipeline log

One row per change to the pipeline or proposal about it, newest first (`pipeline.md` "The pipeline improves itself"). Keep each row to one line; the PR holds the detail.

| Date | Scope | Signal | Change or proposal | Owner file | Outcome |
|---|---|---|---|---|---|
| 2026-10-28 | shared | Re-review of #523: the gate's UI pattern misses user-facing strings in other `.ts` files | Proposal: widen `ui_re` to `src/**/*.ts` that holds copy | `.claude/hooks/pr-gate.sh` | proposed |
| 2026-10-28 | shared | Re-review of the #523 fixes: flags before the app id broke parsing, a bare title could adopt another app's issue, and relinking rewrote other roadmaps' mentions | Flag values are skipped, a bare title is adopted only when unique, and relinking skips app-prefixed mentions and code blocks; the script stops past 2,000 issues | `scripts/createGithubIssues.ts` | changed |
| 2026-10-28 | shared | #523 sized L by the gate though ~4,000 of its 4,978 lines were text moved verbatim | Proposal: count verbatim moves as less than new text when sizing | `.claude/hooks/pr-gate.sh` | proposed |
| 2026-10-28 | shared | CLAUDE.md still imports copilot-instructions.md (59 KB), much of it repeated in the conventions | Proposal: trim copilot-instructions.md to what Copilot needs and point at the conventions | `.github/copilot-instructions.md` | proposed |
| 2026-10-28 | shared | Agent files added mid-session weren't spawnable until a reload | Fallback written into orchestrate: `general-purpose` with the agent file as its instructions and the frontmatter's model | `orchestrate/SKILL.md` | changed |
| 2026-10-28 | shared | Review of #523: pr-gate counted main's files after a merge, wrote its marker before resolving the base, and missed `.json`/`.sh` as code | Delta intersected with the PR's files, marker written after the base resolves, wider patterns, lockfile left out of the size | `.claude/hooks/pr-gate.sh` | changed |
| 2026-10-28 | shared | Review of #523: a re-run of the issue script reset Status on every issue, and a new app couldn't create issues before it was registered | Status set only on new issues, `--app-name`, bare-title match for existing issues | `scripts/createGithubIssues.ts` | changed |
| 2026-10-28 | shared | Stop hook ran finish-feature-pr and a full wrap-up on every push | Replaced with pr-gate, which names only what the push needs; finish-feature-pr made manual-only | `.claude/hooks/pr-gate.sh` | changed |
