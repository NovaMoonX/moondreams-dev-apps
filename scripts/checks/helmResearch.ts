// Research depth and live web search: the arrival lines, the monthly allowance, the depth pick, the planner's three cases, the answers to its questions and the overview reader.
import assert from 'node:assert/strict';

import {
  planResearch,
  planResolveResearch,
  readUsageDoc,
  withReleased,
  withReserved,
  withSettled,
  type ResearchUsageDoc,
} from '../../functions/src/apps/helm/nomos/planResearch.ts';
import { readResearchCommands } from '../../functions/src/apps/helm/nomos/readResearchCommands.ts';
import { readResearchOverview } from '../../functions/src/apps/helm/nomos/readResearchOverview.ts';
import {
  RESEARCH_DEPTHS,
  RESEARCH_MONTHLY_CAP_CENTS,
  isResearchRerunDue,
  isResearchStillWanted,
  pickResearchDepth,
  readResearchAllowance,
  readResearchArrival,
  readResearchResetOn,
} from '../../src/apps/helm/engine/research.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';

const NOW = Date.UTC(2026, 10, 16, 12, 0);
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const usage = (cents: number, over: Partial<ResearchUsageDoc> = {}) => ({
  month: '2026-11',
  cents,
  searches: 0,
  reserved: {},
  ...over,
});

const ask = (over: Partial<Parameters<typeof planResearch>[0]> = {}) => {
  let count = 0;
  return planResearch({
    commands: [
      {
        kind: 'research',
        question: 'AWD vs 4WD for snow',
        subject: 'AWD vs 4WD',
        depth: null,
        isDecision: false,
      },
    ],
    profileDepth: null,
    usage: usage(0),
    timeZone: NY,
    now: NOW,
    captureId: 'capture-1',
    newId: () => `id-${(count += 1)}`,
    seal: (fields) => fields as never,
    room: 5,
    ...over,
  });
};

test('arrival lines: light a few minutes, thorough five to ten, later by morning', () => {
  assert.equal(readResearchArrival('light', 'now'), 'fewMinutes');
  assert.equal(readResearchArrival('thorough', 'now'), 'fiveToTen');
  assert.equal(readResearchArrival('light', 'later'), 'byMorning');
  assert.equal(readResearchArrival('thorough', 'later'), 'byMorning');
  assert.equal(
    HELM_COPY.researchArrival.fewMinutes,
    'Give me about 2 minutes.',
  );
});

test('the allowance: capped is not live, thorough needs its estimate, reset is the 1st', () => {
  const fresh = readResearchAllowance(null, 'thorough', NOW, NY);
  assert.equal(fresh.leftCents, RESEARCH_MONTHLY_CAP_CENTS);
  assert.ok(fresh.isLive && fresh.canThorough);
  assert.equal(fresh.thoroughLeft, 5);
  const low = readResearchAllowance(usage(170), 'thorough', NOW, NY);
  assert.ok(!low.isLive && !low.canThorough);
  assert.ok(readResearchAllowance(usage(170), 'light', NOW, NY).isLive);
  const capped = readResearchAllowance(usage(195), 'light', NOW, NY);
  assert.ok(!capped.isLive && !capped.canThorough);
  assert.equal(capped.resetOn, Date.UTC(2026, 11, 1));
  const stale = readResearchAllowance(
    usage(200, { month: '2026-10' }),
    'light',
    NOW,
    NY,
  );
  assert.ok(stale.isLive);
  assert.equal(stale.leftCents, RESEARCH_MONTHLY_CAP_CENTS);
});

test("the reset date rolls December to January and follows the person's zone", () => {
  assert.equal(
    readResearchResetOn(Date.UTC(2026, 11, 15), NY),
    Date.UTC(2027, 0, 1),
  );
  const lateLosAngeles = Date.UTC(2026, 11, 1, 7, 30);
  assert.equal(readResearchResetOn(lateLosAngeles, LA), Date.UTC(2026, 11, 1));
  assert.equal(
    readResearchResetOn(lateLosAngeles, 'UTC'),
    Date.UTC(2027, 0, 1),
  );
  assert.equal(
    readResearchAllowance(
      usage(0, { month: '2026-11' }),
      'light',
      lateLosAngeles,
      LA,
    ).month,
    '2026-11',
  );
});

test('pickResearchDepth: said wins, then the default, then ask only for a decision', () => {
  const pick = pickResearchDepth;
  assert.equal(
    pick({ said: 'thorough', profileDefault: 'light', isDecision: true }),
    'thorough',
  );
  assert.equal(
    pick({ said: null, profileDefault: 'thorough', isDecision: true }),
    'thorough',
  );
  assert.equal(
    pick({ said: null, profileDefault: null, isDecision: true }),
    'ask',
  );
  assert.equal(
    pick({ said: null, profileDefault: null, isDecision: false }),
    'light',
  );
});

test('isResearchStillWanted drops a cancelled, settled or already prepared item', () => {
  assert.ok(isResearchStillWanted('preparing', null));
  assert.ok(!isResearchStillWanted('dismissed', null));
  assert.ok(!isResearchStillWanted('ready', 5));
  assert.ok(!isResearchStillWanted('preparing', 5));
});

test("isResearchRerunDue follows the person's own day", () => {
  const dec1 = Date.UTC(2026, 11, 1);
  assert.ok(!isResearchRerunDue(null, NOW, NY));
  assert.ok(!isResearchRerunDue(dec1, Date.UTC(2026, 11, 1, 3), NY));
  assert.ok(isResearchRerunDue(dec1, Date.UTC(2026, 11, 1, 6), NY));
  assert.ok(!isResearchRerunDue(dec1, Date.UTC(2026, 11, 1, 6), LA));
  assert.ok(isResearchRerunDue(dec1, Date.UTC(2026, 11, 1, 9), LA));
});

test('planResearch, depth known and live: preparing, reserved, with the arrival line', () => {
  const plan = ask({ profileDepth: 'light' });
  assert.equal(plan.questions.length, 0);
  const doc = plan.creates[0]?.doc;
  assert.equal(doc?.status, 'preparing');
  assert.equal(doc?.mode, 'asked');
  assert.equal(doc?.depth, 'light');
  assert.equal(doc?.isWithoutWeb, false);
  assert.equal(doc?.reservedCents, RESEARCH_DEPTHS.light.estimateCents);
  assert.equal(doc?.rerunOn, null);
  assert.deepEqual(plan.effectRefs[0], {
    op: 'create',
    collection: 'research',
    docId: 'id-1',
  });
  assert.match(plan.lines[0] ?? '', /Give me about 2 minutes\.$/);
  assert.equal(plan.usage?.cents, 11);
  assert.equal(plan.usage?.reserved['id-1'], 11);
  const thorough = ask({
    commands: [
      {
        kind: 'research',
        question: 'q',
        subject: 's',
        depth: 'thorough',
        isDecision: false,
      },
    ],
  });
  assert.match(thorough.lines[0] ?? '', /5 to 10 minutes/);
  assert.equal(thorough.usage?.cents, 35);
});

test('planResearch, no depth on a decision: asking, nothing reserved, Thorough locked when it cannot be paid', () => {
  const command = {
    kind: 'research' as const,
    question: 'q',
    subject: 'standing desks',
    depth: null,
    isDecision: true,
  };
  const open = ask({ commands: [command] });
  assert.equal(open.creates[0]?.doc.status, 'asking');
  assert.equal(open.creates[0]?.doc.reservedCents, 0);
  assert.equal(open.usage, null);
  const sealed = open.questions[0]?.sealed as {
    kind: string;
    options: { id: string; detail: string | null }[];
  };
  assert.equal(sealed.kind, 'researchDepth');
  assert.deepEqual(
    sealed.options.map((option) => option.id),
    ['quick', 'thorough', 'alwaysQuick', 'alwaysThorough'],
  );
  const locked = ask({ commands: [command], usage: usage(170) });
  const lockedSealed = locked.questions[0]?.sealed as typeof sealed;
  assert.deepEqual(
    lockedSealed.options.map((option) => option.id),
    ['quick', 'thoroughLocked', 'alwaysQuick'],
  );
  assert.match(lockedSealed.options[1]?.detail ?? '', /Dec 1/);
});

test('planResearch, capped: preparing from general knowledge, nothing reserved', () => {
  const plan = ask({ usage: usage(195), profileDepth: 'thorough' });
  const doc = plan.creates[0]?.doc;
  assert.equal(doc?.status, 'preparing');
  assert.equal(doc?.isWithoutWeb, true);
  assert.equal(doc?.reservedCents, 0);
  assert.equal(doc?.rerunOn, null);
  assert.equal(plan.usage, null);
  const asked = ask({
    usage: usage(195),
    commands: [
      {
        kind: 'research',
        question: 'q',
        subject: 's',
        depth: null,
        isDecision: true,
      },
    ],
  });
  assert.equal(asked.questions.length, 0);
  assert.equal(asked.creates[0]?.doc.isWithoutWeb, true);
  const downgraded = ask({
    usage: usage(170),
    commands: [
      {
        kind: 'research',
        question: 'q',
        subject: 's',
        depth: 'thorough',
        isDecision: false,
      },
    ],
  });
  assert.equal(downgraded.creates[0]?.doc.depth, 'light');
  assert.equal(downgraded.creates[0]?.doc.isWithoutWeb, false);
});

test('the usage reserves, settles at the real cost and releases', () => {
  const held = withReserved(usage(0), 'a', 35);
  assert.equal(held.cents, 35);
  const settled = withSettled(held, 'a', 22, 6);
  assert.deepEqual(settled, usage(22, { searches: 6 }));
  assert.deepEqual(withReleased(held, 'a'), usage(0));
  assert.equal(withSettled(usage(10), 'gone', 4, 1).cents, 14);
  assert.deepEqual(
    readUsageDoc({ month: '2026-10', cents: 99 }, NOW, NY),
    usage(0),
  );
});

const questionCapture = (question: Record<string, unknown>) => ({
  capture: {
    status: 'needsYou',
    executionIds: [],
    questionState: {
      q1: {
        kind: String(question.kind),
        shape: String(question.shape),
        askedAt: NOW,
        answeredAt: null,
        skippedAt: null,
        dismissedAt: null,
      },
    },
  },
  opened: { questions: { q1: question } },
});

test('answering the depth question starts the item; always writes the default', () => {
  const plan = ask({
    commands: [
      {
        kind: 'research',
        question: 'q',
        subject: 's',
        depth: null,
        isDecision: true,
      },
    ],
  });
  const sealed = plan.questions[0]?.sealed as Record<string, unknown>;
  const base = {
    questionId: 'q1',
    by: 'tap' as const,
    now: NOW,
    research: { id: 'id-1', status: 'asking' },
    usage: usage(0),
    timeZone: NY,
    ...questionCapture(sealed),
  };
  const quick = planResolveResearch({ ...base, optionId: 'quick' });
  assert.ok(quick.refused === null);
  if (quick.refused !== null) return;
  assert.equal(quick.research?.data.status, 'preparing');
  assert.equal(quick.research?.data.depth, 'light');
  assert.equal(quick.usage?.cents, 11);
  assert.equal(quick.profile?.researchDepth, undefined);
  const always = planResolveResearch({ ...base, optionId: 'alwaysThorough' });
  assert.ok(always.refused === null);
  if (always.refused !== null) return;
  assert.equal(always.profile?.researchDepth, 'thorough');
  assert.equal(always.research?.data.reservedCents, 35);
  const wasCancelled = planResolveResearch({
    ...base,
    optionId: 'quick',
    research: { id: 'id-1', status: 'dismissed' },
  });
  assert.deepEqual(wasCancelled, { refused: 'gone' });
  const locked = planResolveResearch({ ...base, optionId: 'nope' });
  assert.deepEqual(locked, { refused: 'unknown' });
});

test('answering the rerun question writes rerunOn only on a yes', () => {
  const resetOn = Date.UTC(2026, 11, 1);
  const question = {
    kind: 'researchRerun',
    shape: 'yesNo',
    options: [{ id: 'yes' }, { id: 'no' }],
    heldCommands: [{ kind: 'researchRerun', researchId: 'r1', resetOn }],
  };
  const base = {
    questionId: 'q1',
    by: 'tap' as const,
    now: NOW,
    research: { id: 'r1', status: 'ready' },
    usage: usage(195),
    timeZone: NY,
    ...questionCapture(question),
  };
  const yes = planResolveResearch({ ...base, optionId: 'yes' });
  assert.ok(yes.refused === null);
  if (yes.refused !== null) return;
  assert.equal(yes.research?.data.rerunOn, resetOn);
  const no = planResolveResearch({ ...base, optionId: 'no' });
  assert.ok(no.refused === null);
  if (no.refused !== null) return;
  assert.equal(no.research, null);
  assert.equal(no.capture.status, 'sorted');
});

test("the reply is read into one capped command; the overview into the depth's caps and https sources", () => {
  const read = readResearchCommands([
    {
      kind: 'research',
      researchQuestion: ' AWD  vs 4WD ',
      researchSubject: null,
      researchDepth: 'thorough',
      researchIsDecision: true,
    },
    {
      kind: 'research',
      researchQuestion: 'second',
      researchSubject: 'x',
      researchDepth: 'bogus',
      researchIsDecision: null,
    },
    { kind: 'research', researchQuestion: null },
  ]);
  assert.equal(read.length, 1);
  assert.deepEqual(read[0], {
    kind: 'research',
    question: 'AWD vs 4WD',
    subject: 'AWD vs 4WD',
    depth: 'thorough',
    isDecision: true,
  });
  const raw = {
    summary: 'Short.',
    sections: Array.from({ length: 6 }, (_, index) => ({
      heading: `H${index}`,
      points: ['a'],
    })),
    comparison: { columns: ['A', 'B'], rows: [['1', '2'], ['3']] },
    sources: [
      { title: 'One', url: 'https://example.com/a', site: '' },
      { title: 'Bad', url: 'javascript:alert(1)', site: 'x' },
      { title: 'Dupe', url: 'https://example.com/a', site: 'x' },
    ],
  };
  const light = readResearchOverview(raw, 'light');
  assert.equal(light?.overview.sections.length, 3);
  assert.equal(light?.overview.comparison, null);
  assert.deepEqual(light?.sources, [
    { title: 'One', url: 'https://example.com/a', site: 'example.com' },
  ]);
  const thorough = readResearchOverview(raw, 'thorough');
  assert.equal(thorough?.overview.sections.length, 5);
  assert.deepEqual(thorough?.overview.comparison, {
    columns: ['A', 'B'],
    rows: [['1', '2']],
  });
  assert.equal(readResearchOverview({ summary: '' }, 'light'), null);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
