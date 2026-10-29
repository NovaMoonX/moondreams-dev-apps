import assert from 'node:assert/strict';

import {
  INBOX_MARKER,
  buildInbox,
  findSessionLink,
  groupSessions,
  parseStatus,
  summarizeCi,
  type InboxPr,
} from '../ownerInbox/inbox.ts';

const status = (session: string, extra: string) => `<!-- pr-status -->
<!-- session: https://claude.ai/code/${session} -->
## 📋 Status · ready when you are · abc1234
**Session:** Runway cards

**Must do before merge**
- [ ] Merge #1 first. (who: owner)
- [x] Fix the red check. (who: you)

**Should do**
- [ ] Decide where Back sits. (who: owner)
- [ ] A flaky speed budget. (who: me, later)
${extra}
**Last verified:** abc1234 · CI green`;

const parsed = parseStatus(
  status(
    's1',
    `**Good to know**
- Nothing that writes was driven.

**New screenshots**
- https://github.com/o/r/blob/x/pr-2/a.png?raw=true https://github.com/o/r/blob/x/pr-2/b.png?raw=true
`,
  ),
  '2026-10-29T16:20:00Z',
);
assert.equal(parsed.sessionUrl, 'https://claude.ai/code/s1');
assert.equal(parsed.sessionTitle, 'Runway cards');
assert.equal(parsed.state, 'ready when you are');
assert.deepEqual(
  parsed.ownerItems,
  ['Merge #1 first.', 'Decide where Back sits.'],
  'only unchecked owner items, without their (who:) tag',
);
assert.deepEqual(parsed.goodToKnow, ['Nothing that writes was driven.']);
assert.equal(parsed.screenshots.length, 2, 'every screenshot URL on the line');

const legacy = parseStatus(
  '<!-- pr-status -->\n## 📋 Status · blocked · 1\n',
  '',
);
assert.equal(legacy.sessionUrl, null, 'a status with no session marker');
assert.deepEqual(legacy.ownerItems, []);

const pr = (
  number: number,
  head: string,
  base: string,
  body: string | null,
  ci: InboxPr['ci'] = 'green',
): InboxPr => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  head,
  base,
  isDraft: true,
  labels: [],
  ci,
  bodySessionUrl: null,
  status:
    body === null ? null : parseStatus(body, `2026-10-29T1${number}:00:00Z`),
});

const quiet = `<!-- pr-status -->
<!-- session: https://claude.ai/code/s2 -->
## 📋 Status · in progress · def5678
**Session:** Pinch voice
`;
const prs = [
  pr(1, 'spend', 'main', status('s1', '')),
  pr(2, 'cards', 'spend', status('s1', '')),
  pr(3, 'voice', 'main', quiet, 'running'),
  pr(4, 'manual', 'main', null),
];
const sessions = groupSessions(prs);
assert.deepEqual(
  sessions.map((session) => session.title),
  ['Runway cards', 'Pinch voice', 'Without a status comment'],
  'the session that needs the owner first, then work in progress, then the rest',
);
assert.deepEqual(
  sessions[0].prs.map((item) => item.number),
  [1, 2],
  'a session holds every PR it drives',
);

const inbox = buildInbox(prs, '2026-10-29T17:00:00Z');
assert.ok(
  inbox.startsWith(INBOX_MARKER),
  'the marker that finds the issue again',
);
assert.match(inbox, /🚩 4 things need you, across 1 session/);
assert.match(
  inbox,
  /- \[#1\][^\n]*\n {2}- \[#2\]/,
  'a stacked PR is nested under the PR whose branch it targets',
);
assert.match(
  inbox,
  /<details open><summary><b><a href="https:\/\/claude.ai\/code\/s1">Runway cards/,
);
assert.match(
  inbox,
  /<details><summary><b><a href="https:\/\/claude.ai\/code\/s2">Pinch voice<\/a><\/b> · ⏳ in progress/,
  'a session that needs nothing stays folded',
);
assert.match(inbox, /Without a status comment<\/b> · nobody is driving these/);
assert.match(
  buildInbox([pr(3, 'voice', 'main', quiet)], '2026-10-29T17:00:00Z'),
  /✅ Nothing is waiting on you/,
);

assert.equal(
  findSessionLink(
    'Body\n\nhttps://claude.ai/code/session_01Old\n…\nhttps://claude.ai/code/session_02New',
  ),
  'https://claude.ai/code/session_02New',
  'the attribution link, the last one in the body',
);
const unmarked = '<!-- pr-status -->\n## 📋 Status · in progress · 1\n';
const fromBody = groupSessions([
  {
    ...pr(5, 'a', 'main', unmarked),
    bodySessionUrl: 'https://claude.ai/code/session_x',
  },
  {
    ...pr(6, 'b', 'a', unmarked),
    bodySessionUrl: 'https://claude.ai/code/session_x',
  },
  {
    ...pr(7, 'c', 'main', null),
    bodySessionUrl: 'https://claude.ai/code/session_y',
  },
]);
assert.deepEqual(
  fromBody.map((session) => session.prs.map((item) => item.number)),
  [[5, 6], [7]],
  'PRs group by their body link; one with no status comment folds into the last group',
);
assert.equal(
  fromBody[0].title,
  'PR 5',
  'named after its first PR until a status names it',
);

const run = (id: number, name: string, conclusion: string | null) => ({
  id,
  name,
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion,
});
assert.equal(
  summarizeCi([
    run(1, 'version-label', 'failure'),
    run(2, 'version-label', 'success'),
  ]),
  'green',
  'a re-run that passed replaces the failure',
);
assert.equal(
  summarizeCi([run(1, 'check', 'success'), run(2, 'owner-inbox', null)]),
  'green',
  "the inbox's own job never reads as CI running",
);
assert.equal(
  summarizeCi([run(1, 'check', 'success'), run(2, 'lint', 'failure')]),
  'red',
);
assert.equal(summarizeCi([]), 'none');

console.log('owner inbox: ok');
