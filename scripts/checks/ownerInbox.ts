import assert from 'node:assert/strict';

import {
  INBOX_MARKER,
  buildInbox,
  findSessionLink,
  parseGallery,
  groupSessions,
  parseStatus,
  summarizeCi,
  type InboxPr,
} from '../ownerInbox/inbox.ts';

const status = (session: string, extra: string) => `<!-- pr-status -->
<!-- session: https://claude.ai/code/session_${session} -->
## 📋 Status · ready when you are · abc1234
**Session:** Runway cards

**Must do before merge**
- [ ] Merge #1 first. (who: owner)
- [x] Fix the red check. (who: you)

**Should do**
- [ ] Decide where Back sits (who: owner), see the screenshots
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
assert.equal(parsed.sessionUrl, 'https://claude.ai/code/session_s1');
assert.equal(parsed.sessionTitle, 'Runway cards');
assert.equal(parsed.state, 'ready when you are');
assert.deepEqual(
  parsed.ownerItems.map((item) => item.text),
  ['Merge #1 first.', 'Decide where Back sits, see the screenshots'],
  'only unchecked owner items, without their (who:) tag, text after it kept',
);
assert.deepEqual(parsed.goodToKnow, ['Nothing that writes was driven.']);
assert.equal(parsed.screenshots.length, 2, 'every screenshot URL on the line');

const legacy = parseStatus(
  '<!-- pr-status -->\n## 📋 Status · blocked · 1\n',
  '',
);
assert.equal(legacy.sessionUrl, null, 'a status with no session marker');
assert.deepEqual(legacy.ownerItems, []);
const asked = parseStatus(
  `**Should do**
- [ ] Keep the quiet card line, or make it a box? (who: owner)
  - Now: https://x.test/a.png
  - Box: https://x.test/b.png
- [ ] A plain step. (who: owner)
- https://x.test/not-mine.png
`,
  '',
);
assert.deepEqual(
  asked.ownerItems.map((item) => item.options),
  [
    [
      { label: 'Now', images: ['https://x.test/a.png'] },
      { label: 'Box', images: ['https://x.test/b.png'] },
    ],
    [],
  ],
  'a question carries the screenshots indented under it, and only those',
);
assert.match(
  buildInbox(
    [
      {
        number: 9,
        title: 'T',
        url: 'https://github.com/o/r/pull/9',
        head: 'h',
        base: 'main',
        isDraft: true,
        labels: [],
        ci: 'green',
        bodySessionUrl: null,
        gallery: [],
        status: { ...asked, sessionUrl: 'https://claude.ai/code/session_q' },
      },
    ],
    '2026-10-29T17:00:00Z',
  ),
  /make it a box\?\n {2}- Now<br><a href="https:\/\/x.test\/a.png"><img src="https:\/\/x.test\/a.png" width="160"><\/a>\n {2}- Box<br>/,
  'the screenshots sit right under the question in the inbox',
);

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
  gallery: [],
  status:
    body === null ? null : parseStatus(body, `2026-10-29T1${number}:00:00Z`),
});

const quiet = `<!-- pr-status -->
<!-- session: https://claude.ai/code/session_s2 -->
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
  /<details open><summary><b><a href="https:\/\/claude.ai\/code\/session_s1">Runway cards/,
);
assert.match(
  inbox,
  /<details><summary><b><a href="https:\/\/claude.ai\/code\/session_s2">Pinch voice<\/a><\/b> · ⏳ in progress/,
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
    gallery: [],
  },
  {
    ...pr(6, 'b', 'a', unmarked),
    bodySessionUrl: 'https://claude.ai/code/session_x',
    gallery: [],
  },
  {
    ...pr(7, 'c', 'main', null),
    bodySessionUrl: 'https://claude.ai/code/session_y',
    gallery: [],
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

const unsafe = parseStatus(
  `<!-- pr-status -->
<!-- session: https://evil.example/" onclick="x -->
- [ ] Ask @someone about <details> (who: owner)
`,
  '',
);
assert.equal(
  unsafe.sessionUrl,
  null,
  'only a Claude session link is a session',
);
assert.equal(
  unsafe.ownerItems[0].text,
  'Ask @\u200bsomeone about &lt;details&gt;',
  'no HTML and no mention that pings on every rebuild',
);

assert.deepEqual(
  parseStatus(
    `- [ ] Mine (who: you, owner)
- [ ] Not mine (who: you; the owner decides later)
`,
    '',
  ).ownerItems.map((item) => item.text),
  ['Mine'],
  'owner must be one of the names after who:',
);
assert.equal(
  summarizeCi([run(1, 'check', 'cancelled')]),
  'red',
  'a cancelled check is not green',
);

const tricky = parseStatus(
  `- [ ] Pick one (who: owner)
  - [Now](https://x.test/a.png), see https://github.com/o/r/pull/3.
  - <script> for @x: https://x.test/b.png.
  - [ ] A nested ask (who: owner)
    - deeper https://x.test/n.png

  - after a blank line https://x.test/c.png
`,
  '',
);
assert.deepEqual(
  tricky.ownerItems.map((item) => item.text),
  ['Pick one', 'A nested ask'],
  'a nested ask is its own item, never an option of the one above',
);
assert.deepEqual(
  tricky.ownerItems[0].options,
  [
    {
      label: 'Now see ([link](https://github.com/o/r/pull/3))',
      images: ['https://x.test/a.png'],
    },
    { label: '&lt;script&gt; for @\u200bx', images: ['https://x.test/b.png'] },
  ],
  'a markdown link keeps its words, a page link stays a link, trailing punctuation is not part of a URL, labels are escaped, and a blank line or a nested ask ends the options',
);

const gallery = parseGallery(`## Overview
- a thing

## Screenshots
| | Before | After |
|---|---|---|
| 1 · Open the tab | ![](https://x.test/b1.png) | ![](https://x.test/a1.png) |
| 2 · Answer a question | | ![](https://x.test/a2.png) |
| Text only | nothing | here |

A caption line
![](https://x.test/c.png)
![Named](https://x.test/d.png)

<details><summary>Regression check</summary>

## Not part of it
![](https://x.test/z.png)
`);
assert.deepEqual(
  gallery,
  [
    {
      label: '1 · Open the tab',
      images: [
        { src: 'https://x.test/b1.png', role: 'before' },
        { src: 'https://x.test/a1.png', role: 'after' },
      ],
    },
    {
      label: '2 · Answer a question',
      images: [{ src: 'https://x.test/a2.png', role: 'after' }],
    },
    {
      label: 'A caption line',
      images: [{ src: 'https://x.test/c.png', role: null }],
    },
    { label: 'Named', images: [{ src: 'https://x.test/d.png', role: null }] },
  ],
  'every screenshot of the body section in order: table rows by column title, image lines by their alt or the line above, and nothing from after the next heading',
);
assert.deepEqual(parseGallery(null), [], 'no body, no gallery');
const nameless = parseGallery(`## Screenshots
| Answer all | Sheet (320) | Sent |
|---|---|---|
| ![](https://x.test/1.png) | ![](https://x.test/2.png) | ![](https://x.test/3.png) |

### Phone
<img src='https://x.test/(4).png'>
| Phone \\| dark | Before | After |
|---|---|---|
| Phone \\| dark | ![](https://x.test/(5).png) | ![](https://x.test/6.png) |
`);
assert.deepEqual(
  nameless.map((step) => [step.label, step.images.map((image) => image.src.split('/').pop())]),
  [
    ['Answer all', ['1.png']],
    ['Sheet (320)', ['2.png']],
    ['Sent', ['3.png']],
    ['Phone', ['(4).png']],
    ['Phone | dark', ['(5).png', '6.png']],
  ],
  'a row of only pictures keeps every picture, named by its column; a heading is not part of a label; an escaped pipe, parentheses in a URL and a single-quoted img all hold',
);
assert.deepEqual(
  nameless[4].images.map((image) => image.role),
  ['before', 'after'],
  'an escaped pipe does not shift the columns',
);
assert.deepEqual(parseGallery('## Overview\n![](https://x.test/y.png)'), [], 'only the Screenshots section counts');

console.log('owner inbox: ok');
