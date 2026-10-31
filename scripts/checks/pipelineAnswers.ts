import assert from 'node:assert/strict';

import type {
  PipelineInbox,
  PipelineInboxPr,
  PipelineSession,
} from '../../src/lib/admin/pipelineTypes.ts';
import { hashLine, toLineMark } from '../../src/lib/admin/pipelineMarks.ts';
import {
  EMPTY_DRAFT,
  getSendState,
  toIssues,
  toItems,
  toMarks,
  type AnswerDraft,
} from '../../src/screens/admin/pipelineDrafts.ts';
import {
  buildPipeline,
  getAnswerSlots,
  type AnswerSlot,
} from '../../src/screens/admin/pipelineUtils.ts';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const SESSION_URL = 'https://claude.ai/code/session_check';

assert.match(hashLine('Round down'), /^[0-9a-f]{8}$/, 'eight hex digits');
assert.equal(
  hashLine('Round  down '),
  hashLine('Round down'),
  'spacing is not part of a line',
);
assert.notEqual(hashLine('Round down'), hashLine('Round up'));
assert.equal(toLineMark(7, 'd', 'Round down'), `7:d:${hashLine('Round down')}`);

const session: PipelineSession = {
  sessionId: 'session_check',
  url: SESSION_URL,
  branch: 'claude/check',
  state: 'idle',
  raisedHands: [],
  phase: null,
  helpers: [],
  startedAt: NOW - 3_600_000,
  turnStartedAt: null,
  updatedAt: NOW - 600_000,
};

const pr = (
  overrides: Partial<NonNullable<PipelineInboxPr['status']>>,
): PipelineInboxPr => ({
  number: 7,
  title: 'A PR',
  url: 'https://github.com/o/r/pull/7',
  head: 'h',
  base: 'main',
  isDraft: true,
  labels: [],
  ci: 'green',
  bodySessionUrl: SESSION_URL,
  gallery: null,
  status: {
    sessionUrl: SESSION_URL,
    sessionTitle: 'Check',
    state: 'ready when you are',
    ownerItems: [],
    mustDo: [],
    goodToKnow: [],
    decisions: [
      'Round down (other option: round up)',
      'Round down (other option: round up)',
      'Start at zero',
    ],
    followUps: ['Add a chart'],
    screenshots: [],
    updatedAt: NOW - 700_000,
    ...overrides,
  },
});

const toInbox = (
  prs: PipelineInboxPr[],
  merged: PipelineInbox['merged'] = [],
): PipelineInbox => ({
  prs,
  merged,
  updatedAt: NOW,
});

const entryFor = (
  inbox: PipelineInbox,
  answered: Record<string, number> = {},
) => buildPipeline([session], inbox, answered, [], NOW).waiting[0];

const open = entryFor(toInbox([pr({})]));
assert.ok(
  open,
  'lines the owner has not answered keep an idle session in Waiting',
);
assert.deepEqual(
  open.decisions.map((line) => line.text),
  ['Round down (other option: round up)', 'Start at zero'],
  'an identical line is listed once',
);

const lineOne = toLineMark(7, 'd', 'Round down (other option: round up)');
const afterOne = entryFor(toInbox([pr({})]), { [lineOne]: NOW });
assert.deepEqual(
  afterOne.decisions.map((line) => line.text),
  ['Start at zero'],
  'a line is hidden by its own mark',
);
const rewritten = entryFor(toInbox([pr({ updatedAt: NOW - 1000 })]), {
  [lineOne]: NOW - 5000,
});
assert.deepEqual(
  rewritten.decisions.map((line) => line.text),
  ['Start at zero'],
  'a rewritten status does not bring an answered line back',
);

const legacy = { '7:decisions': NOW - 600_000 };
assert.equal(
  entryFor(toInbox([pr({})]), legacy).decisions.length,
  0,
  'the old whole-list mark hides the list it answered',
);
assert.equal(
  entryFor(toInbox([pr({ updatedAt: NOW - 100_000 })]), legacy).decisions
    .length,
  2,
  'and shows it again once the status is newer',
);
assert.equal(
  entryFor(toInbox([pr({})]), {
    [lineOne]: NOW,
    [toLineMark(7, 'd', 'Start at zero')]: NOW,
    [toLineMark(7, 'f', 'Add a chart')]: NOW,
  })?.decisions.length ?? 0,
  0,
  'an entry with every line answered has none left',
);

const mergedOnly = buildPipeline(
  [],
  toInbox(
    [],
    [
      {
        number: 9,
        sessionUrl: null,
        mergedAt: NOW - 1000,
        title: 'Merged one',
        statusAt: NOW - 5000,
        decisions: ['Keep it'],
        followUps: null,
      },
    ],
  ),
  {},
  [],
  NOW,
).waiting[0];
assert.equal(
  mergedOnly.decisions[0].isMerged,
  true,
  'a merged PR keeps its lines on the view',
);

const slots = getAnswerSlots(
  entryFor(
    toInbox([
      pr({
        ownerItems: [
          {
            text: 'Which header?',
            options: [],
            isMulti: false,
            isTask: false,
            settled: null,
          },
        ],
      }),
    ]),
  ),
);
assert.deepEqual(
  slots.map((slot) => slot.kind),
  ['question', 'decision', 'followup', 'feedback'],
  'questions, decisions, follow-ups, then the optional feedback box',
);
assert.equal(
  slots[1].mark,
  null,
  'a list is marked line by line, not by one mark',
);

const [question, decision, followup] = slots;
const sent = () => false;
const draftOf = (drafts: Record<string, AnswerDraft>) => (slot: AnswerSlot) =>
  drafts[slot.id] ?? EMPTY_DRAFT;

const untouched = getSendState([decision, followup], sent, draftOf({}));
assert.equal(untouched.label, 'Sounds good');
assert.equal(untouched.keepNote, 'Keeping 2 decisions · 1 follow-up for later');
assert.equal(
  getSendState([question, decision], sent, draftOf({})).label,
  'Send answers',
  'an unanswered question makes it a send',
);
const ticked = {
  [decision.id]: { ...EMPTY_DRAFT, changes: { [decision.lines[0]]: '' } },
};
const unfinished = getSendState([decision], sent, draftOf(ticked));
assert.equal(unfinished.unfinished, 1);
assert.equal(unfinished.label, 'Send answers', 'never Not now');
assert.ok(unfinished.holdNote?.startsWith("Say what you'd rather have"));
assert.notEqual(
  getSendState([followup], sent, draftOf({})).label,
  'Not now',
  'a follow-up list left alone still says Sounds good',
);

const words = {
  [decision.id]: {
    ...EMPTY_DRAFT,
    changes: { [decision.lines[0]]: 'Round up' },
  },
};
assert.deepEqual(
  toItems(decision, words[decision.id]).map((item) => item.choices),
  [[], ['Keep the rest']],
);
assert.equal(
  toMarks(decision).length,
  decision.lines.length,
  'one mark per line',
);
assert.deepEqual(
  toIssues(decision, words[decision.id]),
  [],
  'an open PR opens no issue',
);
const mergedDecision = { ...decision, isMerged: true };
const issues = toIssues(mergedDecision, words[decision.id]);
assert.equal(issues.length, 1);
assert.equal(
  issues[0].title,
  'Round down',
  'the other-option part is left out of the title',
);
assert.equal(issues[0].mark, toLineMark(7, 'd', decision.lines[0]));

console.log('pipeline answers: ok');
