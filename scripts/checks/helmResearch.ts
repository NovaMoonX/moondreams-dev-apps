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
  readResearchStartedSince,
} from '../../src/apps/helm/engine/research.ts';
import {
  planUndo,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import {
  LEARN_WORDS,
  nextNight,
  planLearnLater,
  planResolveLearn,
  type LearnPlanInput,
} from '../../functions/src/apps/helm/nomos/planLearnLater.ts';
import type { LearnItem } from '../../functions/src/apps/helm/research/learnStore.ts';
import { wrapDataKey } from '../../functions/src/appKeys/wrap.ts';
import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import {
  deriveSeedDataKey,
  openForHelm,
  sealForHelm,
  wrappedKeyPath,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  refreshOldVideos,
  startDueLearnLater,
} from '../../functions/src/apps/helm/research/learnLaterPass.ts';
import {
  SUBMIT_LEARN_TOOL,
  buildResearchMessage,
  buildResearchPrompt,
  settleResearch,
  type ResearchSettlement,
} from '../../functions/src/apps/helm/research/runResearch.ts';
import {
  createVideoSearchDeps,
  searchVideos,
  toFixtureVideos,
  type VideoSearchDeps,
} from '../../functions/src/videoSearch/searchVideos.ts';
import { createDailyReserve } from '../../functions/src/videoSearch/dailyCap.ts';
import { parseIsoDuration } from '../../functions/src/videoSearch/youtube.ts';
import {
  findLearnSlot,
  readLearnOffer,
  readLearnOffers,
} from '../../src/apps/helm/engine/learnLater.ts';
import type { OpenExecution } from '../../src/apps/helm/types.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  AHEAD_BACKOFF_WEEKS,
  RESEARCH_OFFERS_PER_PROJECT,
  applyAheadNotNow,
  buildAheadBrief,
  computeOfferOn,
  isAheadOfferDue,
  pickAheadOffer,
  rewriteOfferDays,
  type AheadOfferMeta,
  type LeadQuestion,
} from '../../src/apps/helm/engine/researchAhead.ts';
import {
  planAheadStart,
  planOfferResearch,
  readAheadAsk,
  readAheadStart,
  type OfferTarget,
} from '../../functions/src/apps/helm/nomos/planResearchAhead.ts';
import { readOfferResearch } from '../../functions/src/apps/helm/nomos/readOfferResearch.ts';
import { planProjectRoles } from '../../functions/src/apps/helm/nomos/planProjects.ts';
import { buildResultTopic } from '../../functions/src/apps/helm/research/buildResultTopic.ts';
import { planNightStart } from '../../functions/src/apps/helm/research/learnLaterPass.ts';

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
    isRerunBooked: false,
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
  assert.equal(plan.lines[0], 'Give me about 2 minutes.');
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
  assert.equal(
    downgraded.lines[0],
    "A thorough look won't fit this month, so this is a quick one; thorough looks come back Dec 1. Give me about 2 minutes.",
  );
  assert.match(plan.lines[0] ?? '', /^This month's web searches are used up/);
  assert.match(plan.lines[0] ?? '', /Dec 1\?$/);
  assert.doesNotMatch(plan.lines[0] ?? '', /minutes|Looking into/);
  const booked = ask({ usage: usage(195), isRerunBooked: true });
  assert.match(
    booked.lines[0] ?? '',
    /already set to look on the web on Dec 1/,
  );
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
    captureId: 'capture-1',
    executionId: 'exec-1',
    seal: (fields: Record<string, unknown>) => fields as never,
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
  assert.equal(quick.execution, null);
  const always = planResolveResearch({ ...base, optionId: 'alwaysThorough' });
  assert.ok(always.refused === null);
  if (always.refused !== null) return;
  assert.equal(always.profile?.researchDepth, 'thorough');
  assert.deepEqual(always.capture.executionIds, ['exec-1']);
  assert.match(
    JSON.stringify(always.execution),
    /always take a thorough look\. You can change this in Settings/,
  );
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
    captureId: 'capture-1',
    executionId: 'exec-1',
    seal: (fields: Record<string, unknown>) => fields as never,
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

const madeBy = (id: string) =>
  ({
    id: 'exec-1',
    privacy: 'ordinary',
    said: null,
    captureId: 'capture-1',
    actor: 'nomos',
    category: 'organize',
    autonomyLevel: 2,
    state: 'succeeded',
    effectRefs: [{ op: 'create', collection: 'research', docId: id }],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: NOW - 60_000,
    decidedAt: NOW - 60_000,
    finishedAt: NOW - 60_000,
    summary: 'x',
    effects: [
      { written: { 'sealed.title': 'standing desks' }, previous: null },
    ],
    commands: [],
    notDone: [],
    abilityOffer: null,
    awayZoneOffer: null,
    undoReport: null,
    goneIds: [],
    lines: null,
    spoken: null,
    isUnreadable: false,
  }) as unknown as OpenExecution;

const undoResearch = (data: Record<string, unknown> | null) => {
  const target: UndoTarget = { docId: 'r1', data, opened: null };
  return planUndo({
    original: madeBy('r1'),
    targets: new Map([['r1', target]]),
    undoExecutionId: 'undo-1',
    now: NOW,
    usedIds: new Set(),
  });
};

test('undoing a research create stops it with a field-scoped dismiss, never a delete', () => {
  const plan = undoResearch({
    status: 'preparing',
    lastEditedAt: NOW - 60_000,
  });
  assert.equal(plan.kind, 'write');
  if (plan.kind !== 'write') return;
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.updates[0]?.fields, {
    status: 'dismissed',
    cancelledAt: null,
    lastEditedAt: NOW,
  });
  assert.equal(plan.updates[0]?.reseal, null);
  const asking = undoResearch({ status: 'asking', lastEditedAt: null });
  assert.ok(asking.kind === 'write' && asking.deletes.length === 0);
  const ready = undoResearch({ status: 'ready', lastEditedAt: NOW - 1_000 });
  assert.ok(ready.kind === 'write' ? ready.updates.length === 0 : true);
});

test('a rerun started today is not swept as stuck, whatever its creation date', () => {
  const createdLongAgo = NOW - 30 * 86_400_000;
  assert.equal(
    readResearchStartedSince(null, NOW - 1_000, createdLongAgo),
    NOW - 1_000,
  );
  assert.equal(
    readResearchStartedSince(NOW - 5_000, NOW - 1_000, createdLongAgo),
    NOW - 5_000,
  );
  assert.equal(
    readResearchStartedSince(null, null, createdLongAgo),
    createdLongAgo,
  );
  assert.equal(readResearchStartedSince(null, null, undefined), null);
});

// ---- Learn later: the planner, the night pass, the video search ----

const DAY_MS = 86_400_000;
const localTime = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);

const learnItem = (over: Partial<LearnItem> = {}): LearnItem => ({
  id: 'r1',
  status: 'ready',
  question: 'How does sourdough work',
  subject: 'Sourdough',
  moreAsked: [],
  contextLine: null,
  notNowStreak: 0,
  declineReason: null,
  offers: [],
  relatedOfferedAt: {},
  mergedInto: null,
  removedAt: null,
  needsLiveFacts: false,
  createdAt: NOW - 10 * DAY_MS,
  sealed: {
    question: 'How does sourdough work',
    subject: 'Sourdough',
    moreAsked: [],
    overview: null,
    sources: [],
    videos: [],
    searchQuery: null,
    contextLine: null,
  },
  ...over,
});

const learnPlan = (
  items: LearnItem[],
  commands: LearnPlanInput['commands'],
  over: Partial<LearnPlanInput> = {},
) => {
  let count = 0;
  return planLearnLater({
    commands,
    asks: [],
    items,
    isSpoken: false,
    isMidTask: false,
    timeZone: NY,
    now: NOW,
    captureId: 'capture-1',
    newId: () => `new-${(count += 1)}`,
    seal: (fields) => fields as never,
    room: 5,
    ...over,
  });
};

const save = (
  over: Partial<
    Extract<LearnPlanInput['commands'][number], { kind: 'saveForLater' }>
  > = {},
): LearnPlanInput['commands'][number] => ({
  kind: 'saveForLater',
  question: 'How do heat pumps work',
  subject: 'Heat pumps',
  contextLine: 'while planning the move',
  needsLiveFacts: false,
  practise: 'read',
  quote: null,
  ...over,
});

test('nextNight is the next 02:00 in the person’s zone, across DST and zones', () => {
  const cases: [string, number][] = [
    [NY, Date.UTC(2026, 10, 16, 12, 0)],
    [LA, Date.UTC(2026, 10, 16, 12, 0)],
    ['Asia/Tokyo', Date.UTC(2026, 10, 16, 12, 0)],
    [NY, Date.UTC(2026, 2, 7, 12, 0)],
    [NY, Date.UTC(2026, 10, 1, 3, 0)],
    [LA, Date.UTC(2026, 2, 8, 6, 0)],
  ];
  cases.forEach(([zone, now]) => {
    const at = nextNight(now, zone);
    assert.ok(at > now && at - now <= 25 * 3_600_000, `${zone} ${now}`);
    assert.match(localTime(at, zone), /^0[23]:00$/);
  });
  assert.equal(localTime(nextNight(NOW, NY), NY), '02:00');
  const afterTwo = Date.UTC(2026, 10, 16, 8, 0);
  assert.equal(nextNight(afterTwo, NY), Date.UTC(2026, 10, 17, 7, 0));
  assert.equal(
    nextNight(Date.UTC(2026, 10, 16, 5, 0), NY),
    Date.UTC(2026, 10, 16, 7, 0),
  );
});

test('a saved wish becomes a planned item with a night to run, and says nothing about when it returns', () => {
  const plan = learnPlan([], [save()]);
  assert.equal(plan.creates.length, 1);
  const doc = plan.creates[0].doc;
  assert.equal(doc.mode, 'learnLater');
  assert.equal(doc.status, 'planned');
  assert.equal(doc.prepareAt, nextNight(NOW, NY));
  assert.equal(doc.needsLiveFacts, false);
  assert.equal(doc.isWithoutWeb, true);
  assert.equal(doc.reservedCents, 0);
  assert.equal(doc.captureId, 'capture-1');
  assert.deepEqual(plan.lines, [LEARN_WORDS.saved('Heat pumps')]);
  assert.equal(plan.effectRefs[0]?.op, 'create');
  const live = learnPlan([], [save({ needsLiveFacts: true })]);
  assert.equal(live.creates[0].doc.needsLiveFacts, true);
  assert.equal(live.creates[0].doc.isWithoutWeb, false);
});

test('saving a subject again merges into the open item and sends a ready one back to planned', () => {
  const plan = learnPlan(
    [learnItem()],
    [save({ subject: 'Sourdough', question: 'Can I use whole wheat flour' })],
  );
  assert.equal(plan.creates.length, 0);
  const update = plan.updates.find((entry) => entry.id === 'r1');
  assert.equal(update?.data.status, 'planned');
  assert.equal(update?.data.prepareAt, nextNight(NOW, NY));
  assert.deepEqual(plan.lines, [LEARN_WORDS.merged('Sourdough')]);
  const effect = plan.effects[0];
  assert.ok(effect);
  assert.equal(effect.previous?.status, 'ready');
  assert.equal(effect.written.status, 'planned');
  assert.ok(!('prepareAt' in effect.written));
});

test('Not now keeps the item, counts the streak, and the third asks whether they still want it', () => {
  const decline = (streak: number) =>
    learnPlan(
      [learnItem({ notNowStreak: streak })],
      [
        {
          kind: 'declineLearn',
          itemId: 'r1',
          reason: 'timing',
          question: null,
          subject: null,
        },
      ],
    );
  const first = decline(0);
  assert.equal(first.updates[0]?.data.notNowStreak, 1);
  assert.equal(first.updates[0]?.data.declineReason, 'timing');
  assert.equal(first.questions.length, 0);
  assert.deepEqual(first.lines, [LEARN_WORDS.notNow]);
  const third = decline(2);
  assert.equal(third.questions.length, 1);
  assert.equal(third.questions[0]?.state.kind, 'learnStill');
  assert.deepEqual(
    (third.questions[0]?.sealed.options as { id: string }[]).map(
      (option) => option.id,
    ),
    ['keep', 'remove'],
  );
});

test('lost interest takes the item off, and it is never in the model’s list or related again', () => {
  const plan = learnPlan(
    [learnItem()],
    [
      {
        kind: 'declineLearn',
        itemId: 'r1',
        reason: 'lostInterest',
        question: null,
        subject: null,
      },
    ],
  );
  const update = plan.updates[0];
  assert.equal(update?.data.status, 'dismissed');
  assert.equal(update?.data.declineReason, 'lostInterest');
  assert.equal(update?.data.removedAt, NOW);
  const letGo = learnItem({
    status: 'dismissed',
    declineReason: 'lostInterest',
    removedAt: NOW - DAY_MS,
  });
  const other = learnItem({ id: 'r2', subject: 'Heat pumps' });
  const related = learnPlan(
    [letGo, other],
    [{ kind: 'relatedLearn', firstId: 'r1', secondId: 'r2', together: 'Both' }],
  );
  assert.equal(related.questions.length, 0);
  assert.equal(related.updates.length, 0);
  const revived = learnPlan([letGo], [save({ subject: 'Sourdough' })]);
  assert.equal(revived.updates[0]?.data.status, 'planned');
  assert.deepEqual(revived.lines, [LEARN_WORDS.revived('Sourdough')]);
});

test('a changed mind rewrites the item and runs it again; a preparing item is refused', () => {
  const change = (item: LearnItem) =>
    learnPlan(
      [item],
      [
        {
          kind: 'declineLearn',
          itemId: 'r1',
          reason: 'changedMind',
          question: 'How do I feed a starter',
          subject: 'Sourdough starter',
        },
      ],
    );
  const plan = change(learnItem());
  assert.equal(plan.updates[0]?.data.status, 'planned');
  assert.equal(plan.updates[0]?.data.prepareAt, nextNight(NOW, NY));
  assert.deepEqual(plan.lines, [LEARN_WORDS.reworded('Sourdough starter')]);
  const busy = change(learnItem({ status: 'preparing' }));
  assert.equal(busy.updates.length, 0);
  assert.deepEqual(busy.notKept, [LEARN_WORDS.busy]);
});

test('related items ask once in four weeks, never mid-task by voice', () => {
  const first = learnItem({ id: 'r1', createdAt: NOW - 9 * DAY_MS });
  const second = learnItem({
    id: 'r2',
    subject: 'Baking bread',
    createdAt: NOW - 3 * DAY_MS,
  });
  const command = {
    kind: 'relatedLearn' as const,
    firstId: 'r1',
    secondId: 'r2',
    together: 'Bread baking',
  };
  const plan = learnPlan([first, second], [command]);
  assert.equal(plan.questions[0]?.state.kind, 'learnTogether');
  assert.equal(plan.updates.length, 2);
  assert.ok(
    plan.updates.every(
      (entry) =>
        typeof (entry.data.relatedOfferedAt as Record<string, number>)[
          entry.id === 'r1' ? 'r2' : 'r1'
        ] === 'number',
    ),
  );
  const recent = learnPlan(
    [{ ...first, relatedOfferedAt: { r2: NOW - 5 * DAY_MS } }, second],
    [command],
  );
  assert.equal(recent.questions.length, 0);
  const old = learnPlan(
    [{ ...first, relatedOfferedAt: { r2: NOW - 30 * DAY_MS } }, second],
    [command],
  );
  assert.equal(old.questions.length, 1);
  const spoken = learnPlan([first, second], [command], {
    isSpoken: true,
    isMidTask: true,
  });
  assert.equal(spoken.questions.length, 0);
});

test('Together folds the newer item into the older and Undo effects stay on writable fields', () => {
  const first = learnItem({ id: 'r1', createdAt: NOW - 9 * DAY_MS });
  const second = learnItem({
    id: 'r2',
    subject: 'Baking bread',
    createdAt: NOW - 3 * DAY_MS,
  });
  const asked = learnPlan(
    [first, second],
    [
      {
        kind: 'relatedLearn',
        firstId: 'r1',
        secondId: 'r2',
        together: 'Bread baking',
      },
    ],
  );
  const question = asked.questions[0];
  assert.ok(question);
  const capture = {
    status: 'needsYou',
    executionIds: [],
    questionState: {
      [question.id]: {
        kind: question.state.kind,
        shape: question.state.shape,
        askedAt: NOW,
        answeredAt: null,
        skippedAt: null,
        dismissedAt: null,
      },
    },
  };
  const resolve = (optionId: string) =>
    planResolveLearn({
      captureId: 'capture-1',
      executionId: 'exec-2',
      seal: (fields) => fields as never,
      questionId: question.id,
      optionId,
      by: 'tap',
      now: NOW + 60_000,
      timeZone: NY,
      items: [first, second],
      newId: () => 'new-9',
      capture,
      opened: { questions: { [question.id]: question.sealed } },
    });
  const together = resolve('together');
  assert.equal(together.refused, null);
  if (together.refused !== null) return;
  const older = together.plan.updates.find((entry) => entry.id === 'r1');
  const newer = together.plan.updates.find((entry) => entry.id === 'r2');
  assert.equal(older?.data.status, 'planned');
  assert.equal(newer?.data.status, 'dismissed');
  assert.equal(newer?.data.mergedInto, 'r1');
  const allowed =
    /^(status|notNowStreak|declineReason|offers|relatedOfferedAt|mergedInto|removedAt|sealed\..+)$/;
  together.plan.effects.forEach((effect) => {
    Object.keys(effect.written).forEach((path) => assert.match(path, allowed));
    Object.keys(effect.written).forEach((path) =>
      assert.notEqual(effect.previous?.[path], undefined, path),
    );
  });
  const apart = resolve('apart');
  assert.equal(apart.refused, null);
  if (apart.refused !== null) return;
  assert.ok(
    apart.plan.updates.every((entry) => entry.data.mergedInto !== 'r1'),
  );
  const again = planResolveLearn({
    captureId: 'capture-1',
    executionId: 'exec-3',
    seal: (fields) => fields as never,
    questionId: question.id,
    optionId: 'together',
    by: 'tap',
    now: NOW,
    timeZone: NY,
    items: [first, second],
    newId: () => 'new-10',
    capture: {
      ...capture,
      questionState: {
        [question.id]: {
          ...capture.questionState[question.id],
          answeredAt: NOW,
        },
      },
    },
    opened: { questions: { [question.id]: question.sealed } },
  });
  assert.deepEqual(again, { refused: 'answered' });
});

test('the server’s learn words equal the device’s', () => {
  assert.equal(LEARN_WORDS.saved('X'), HELM_COPY.learnSaved('X'));
  assert.equal(LEARN_WORDS.merged('X'), HELM_COPY.learnMerged('X'));
  assert.equal(LEARN_WORDS.revived('X'), HELM_COPY.learnRevived('X'));
  assert.equal(LEARN_WORDS.removed('X'), HELM_COPY.learnRemoved('X'));
  assert.equal(LEARN_WORDS.notNow, HELM_COPY.learnNotNowLine);
  assert.equal(LEARN_WORDS.still('X'), HELM_COPY.learnStill('X'));
  assert.equal(LEARN_WORDS.keepIt, HELM_COPY.learnKeepIt);
  assert.equal(LEARN_WORDS.removeIt, HELM_COPY.learnRemoveIt);
  assert.equal(LEARN_WORDS.together('X'), HELM_COPY.learnTogether('X'));
  assert.equal(LEARN_WORDS.togetherYes, HELM_COPY.learnTogetherYes);
  assert.equal(LEARN_WORDS.apart, HELM_COPY.learnApart);
  assert.equal(
    LEARN_WORDS.mergedTogether('X'),
    HELM_COPY.learnMergedTogether('X'),
  );
  assert.equal(LEARN_WORDS.kindQuestion('X'), HELM_COPY.learnKindQuestion('X'));
  assert.equal(LEARN_WORDS.read, HELM_COPY.learnRead);
  assert.equal(LEARN_WORDS.goal, HELM_COPY.learnGoal);
  assert.equal(LEARN_WORDS.goalOffer('X'), HELM_COPY.learnGoalOffer('X'));
  assert.equal(LEARN_WORDS.goalMade('X'), HELM_COPY.learnGoalMade('X'));
});

// A small in-memory Firestore: only what the night pass and the settle touch.
type Docs = Map<string, Record<string, unknown>>;
const makeStore = (docs: Docs) => {
  const snap = (path: string) => ({
    id: path.split('/').pop() as string,
    exists: docs.has(path),
    ref: ref(path),
    data: () => docs.get(path),
    get: (field: string) => docs.get(path)?.[field],
  });
  const ref = (path: string): Record<string, unknown> => ({
    path,
    id: path.split('/').pop(),
    get: async () => snap(path),
    update: async (fields: Record<string, unknown>) => {
      docs.set(path, { ...docs.get(path), ...fields });
    },
    set: async (fields: Record<string, unknown>) => {
      docs.set(path, fields);
    },
  });
  const group = (
    name: string,
    filters: [string, string, number][] = [],
    order = '',
    max = 1_000,
  ) => ({
    where: (field: string, op: string, value: number) =>
      group(name, [...filters, [field, op, value]], order, max),
    orderBy: (field: string) => group(name, filters, field, max),
    limit: (count: number) => group(name, filters, order, count),
    get: async () => ({
      docs: [...docs.keys()]
        .filter((path) => path.split('/').at(-2) === name)
        .filter((path) =>
          filters.every(([field, , value]) => {
            const found = docs.get(path)?.[field];
            return typeof found === 'number' && found <= value;
          }),
        )
        .sort(
          (a, b) => Number(docs.get(a)?.[order]) - Number(docs.get(b)?.[order]),
        )
        .slice(0, max)
        .map(snap),
    }),
  });
  const firestore = {
    doc: (path: string) => ref(path),
    collectionGroup: (name: string) => group(name),
    collection: (path: string) => ({ doc: () => ref(`${path}/auto`) }),
    runTransaction: async <T>(run: (transaction: unknown) => Promise<T>) =>
      run({
        get: async (target: { path: string }) => snap(target.path),
        update: (target: { path: string }, fields: Record<string, unknown>) => {
          docs.set(target.path, { ...docs.get(target.path), ...fields });
        },
        set: (
          target: { path: string },
          fields: Record<string, unknown>,
          options?: { merge?: boolean },
        ) => {
          docs.set(
            target.path,
            options?.merge ? { ...docs.get(target.path), ...fields } : fields,
          );
        },
      }),
  };
  return firestore as never;
};

const UID = 'u1';
const BASE = `apps/helm/users/${UID}`;
const dataKey = { ...deriveSeedDataKey(DEV_KEYRING, UID), keyVersion: 1 };
const sealed = (fields: Record<string, unknown>) =>
  sealForHelm(dataKey, fields);
const researchDoc = (over: Record<string, unknown> = {}) => ({
  mode: 'learnLater',
  status: 'planned',
  prepareAt: NOW - 1_000,
  needsLiveFacts: false,
  depth: null,
  isWithoutWeb: true,
  reservedCents: 0,
  startedAt: null,
  preparedAt: null,
  cancelledAt: null,
  prepareFailedAt: null,
  videosFetchedAt: null,
  captureId: 'capture-1',
  createdAt: NOW - DAY_MS,
  lastEditedAt: null,
  sealed: sealed({
    question: 'How does sourdough work',
    subject: 'Sourdough',
    moreAsked: [],
    overview: null,
    sources: [],
    videos: [],
    searchQuery: null,
    contextLine: null,
  }),
  ...over,
});
const baseDocs = (extra: Record<string, Record<string, unknown>>): Docs =>
  new Map<string, Record<string, unknown>>([
    [BASE, { timeZone: NY, researchAllowance: null }],
    [wrappedKeyPath(UID), wrapDataKey(DEV_KEYRING, UID, dataKey, NOW) as never],
    ...Object.entries(extra),
  ]);

test('the night pass starts a due item: with live facts it reserves, without it holds nothing', async () => {
  const docs = baseDocs({
    [`${BASE}/research/plain`]: researchDoc(),
    [`${BASE}/research/live`]: researchDoc({ needsLiveFacts: true }),
    [`${BASE}/research/later`]: researchDoc({ prepareAt: NOW + 3_600_000 }),
    [`${BASE}/research/readyAlready`]: researchDoc({ status: 'ready' }),
  });
  const started = await startDueLearnLater(makeStore(docs), NOW);
  assert.equal(started, 2);
  const plain = docs.get(`${BASE}/research/plain`);
  assert.equal(plain?.status, 'preparing');
  assert.equal(plain?.isWithoutWeb, true);
  assert.equal(plain?.reservedCents, 0);
  assert.equal(plain?.prepareAt, null);
  assert.equal(plain?.startedAt, null);
  const live = docs.get(`${BASE}/research/live`);
  assert.equal(live?.status, 'preparing');
  assert.equal(live?.isWithoutWeb, false);
  assert.equal(live?.depth, 'light');
  assert.equal(live?.reservedCents, RESEARCH_DEPTHS.light.estimateCents);
  assert.equal(docs.get(`${BASE}/research/later`)?.status, 'planned');
  assert.equal(docs.get(`${BASE}/research/readyAlready`)?.prepareAt, null);
});

test('past the month’s cap a wish that needs live facts is prepared from what the model knows', async () => {
  const docs = baseDocs({
    [`${BASE}/research/live`]: researchDoc({ needsLiveFacts: true }),
    [`apps/helm/server/${UID}/research/usage`]: {
      month: '2026-11',
      cents: RESEARCH_MONTHLY_CAP_CENTS,
      searches: 40,
      reserved: {},
    },
  });
  assert.equal(await startDueLearnLater(makeStore(docs), NOW), 1);
  const live = docs.get(`${BASE}/research/live`);
  assert.equal(live?.status, 'preparing');
  assert.equal(live?.isWithoutWeb, true);
  assert.equal(live?.reservedCents, 0);
});

const read: ResearchSettlement['result'] = {
  overview: {
    summary: 'Short.',
    sections: [],
    comparison: null,
    form: 'steps',
  },
  sources: [],
};
const settlement = (
  over: Partial<ResearchSettlement> = {},
): ResearchSettlement => ({
  result: read,
  spentCents: 3,
  searches: 0,
  hundredths: 0,
  learn: {
    videos: [
      {
        videoId: 'fixture0001',
        title: 'A video',
        channel: 'C',
        durationSec: 400,
      },
    ],
    searchQuery: 'sourdough for beginners',
    skipped: null,
    moreAskedAtClaim: [],
  },
  ...over,
});

test('settling a learn-later item: ready with videos sealed, failure goes back to planned, more questions send it round again', async () => {
  const path = `${BASE}/research/r1`;
  const docs = baseDocs({
    [path]: researchDoc({ status: 'preparing', startedAt: NOW - 5_000 }),
  });
  const store = makeStore(docs);
  await settleResearch(store, dataKey, UID, 'r1', settlement(), NOW);
  const ready = docs.get(path);
  assert.equal(ready?.status, 'ready');
  assert.equal(ready?.preparedAt, NOW);
  assert.equal(ready?.videosFetchedAt, NOW);
  assert.equal(ready?.prepareFailedAt, null);
  const opened = openForHelm(dataKey, ready?.sealed as never);
  assert.equal((opened.overview as { form: string }).form, 'steps');
  assert.equal((opened.videos as unknown[]).length, 1);
  assert.equal(opened.searchQuery, 'sourdough for beginners');
  assert.equal(opened.subject, 'Sourdough');

  docs.set(
    path,
    researchDoc({
      status: 'preparing',
      startedAt: NOW - 5_000,
      reservedCents: 4,
    }),
  );
  await settleResearch(
    store,
    dataKey,
    UID,
    'r1',
    { result: null, spentCents: 0, searches: 0, hundredths: 0, learn: null },
    NOW,
  );
  const failed = docs.get(path);
  assert.equal(failed?.status, 'planned');
  assert.equal(failed?.prepareFailedAt, NOW);
  assert.equal(failed?.prepareAt, nextNight(NOW, NY));
  assert.equal(failed?.reservedCents, 0);
  assert.equal(failed?.startedAt, null);

  docs.set(
    path,
    researchDoc({
      status: 'preparing',
      startedAt: NOW - 5_000,
      sealed: sealed({
        question: 'q',
        subject: 'Sourdough',
        moreAsked: ['What about rye'],
        overview: null,
        sources: [],
        videos: [],
        searchQuery: null,
        contextLine: null,
      }),
    }),
  );
  await settleResearch(store, dataKey, UID, 'r1', settlement(), NOW);
  const again = docs.get(path);
  assert.equal(again?.status, 'planned');
  assert.equal(again?.prepareAt, nextNight(NOW, NY));
});

test('a search that could not run is retried the next day, and three failed preparations stop the nights', async () => {
  const path = `${BASE}/research/r1`;
  const docs = baseDocs({
    [path]: researchDoc({ status: 'preparing', startedAt: NOW - 5_000 }),
  });
  const store = makeStore(docs);
  const skipped = settlement();
  await settleResearch(
    store,
    dataKey,
    UID,
    'r1',
    { ...skipped, learn: { ...skipped.learn!, videos: [], skipped: 'capped' } },
    NOW,
  );
  assert.equal(docs.get(path)?.status, 'ready');
  assert.equal(docs.get(path)?.videosFetchedAt, NOW - 29 * DAY_MS);

  const failure = {
    result: null,
    spentCents: 0,
    searches: 0,
    hundredths: 0,
    learn: null,
  };
  const failOnce = async (failures: number | undefined) => {
    docs.set(
      path,
      researchDoc({
        status: 'preparing',
        startedAt: NOW - 5_000,
        ...(failures === undefined ? {} : { prepareFailures: failures }),
      }),
    );
    await settleResearch(store, dataKey, UID, 'r1', failure, NOW);
    return docs.get(path);
  };
  const first = await failOnce(undefined);
  assert.equal(first?.prepareFailures, 1);
  assert.equal(first?.prepareAt, nextNight(NOW, NY));
  const second = await failOnce(1);
  assert.equal(second?.prepareFailures, 2);
  assert.equal(second?.prepareAt, nextNight(NOW, NY));
  const third = await failOnce(2);
  assert.equal(third?.status, 'planned');
  assert.equal(third?.prepareFailures, 3);
  assert.equal(third?.prepareAt, null);
  assert.equal(third?.prepareFailedAt, NOW);

  docs.set(
    path,
    researchDoc({
      status: 'preparing',
      startedAt: NOW - 5_000,
      prepareFailures: 2,
    }),
  );
  await settleResearch(store, dataKey, UID, 'r1', settlement(), NOW);
  assert.equal(docs.get(path)?.prepareFailures, 0);
});

test('a failed learn-later look never asks for a rerun and an asked look still dismisses', async () => {
  const docs = baseDocs({
    [`${BASE}/research/ask`]: {
      ...researchDoc({
        mode: 'asked',
        status: 'preparing',
        isWithoutWeb: true,
        prepareAt: null,
      }),
      sealed: sealed({
        question: 'q',
        subject: 's',
        overview: null,
        sources: [],
      }),
    },
    [`${BASE}/captures/capture-1`]: {
      status: 'sorted',
      sealed: sealed({}),
      questionState: {},
    },
  });
  await settleResearch(
    makeStore(docs),
    dataKey,
    UID,
    'ask',
    { result: null, spentCents: 0, searches: 0, hundredths: 0, learn: null },
    NOW,
  );
  assert.equal(docs.get(`${BASE}/research/ask`)?.status, 'dismissed');
  const learnDocs = baseDocs({
    [`${BASE}/research/l`]: researchDoc({
      status: 'preparing',
      isWithoutWeb: true,
    }),
    [`${BASE}/captures/capture-1`]: {
      status: 'sorted',
      sealed: sealed({}),
      questionState: {},
    },
  });
  await settleResearch(
    makeStore(learnDocs),
    dataKey,
    UID,
    'l',
    settlement(),
    NOW,
  );
  assert.deepEqual(
    learnDocs.get(`${BASE}/captures/capture-1`)?.questionState,
    {},
  );
});

test('the learn prompt and message: more questions are data, the tool adds form and videoQuery, nothing is strict', () => {
  const prompt = buildResearchPrompt('light', false, 'learnLater');
  assert.match(prompt, /more_asked/);
  assert.match(prompt, /videoQuery/);
  assert.doesNotMatch(buildResearchPrompt('light', false), /videoQuery/);
  const message = buildResearchMessage('q', 's', ['a <b>']);
  assert.match(message, /<more_asked>\["a \\u003cb>"\]<\/more_asked>/);
  assert.doesNotMatch(buildResearchMessage('q', 's'), /more_asked/);
  const schema = SUBMIT_LEARN_TOOL.inputSchema as {
    required: string[];
    properties: Record<string, unknown>;
  };
  assert.ok(
    schema.required.includes('form') && schema.required.includes('videoQuery'),
  );
  assert.ok('form' in schema.properties && 'videoQuery' in schema.properties);
  assert.ok(!JSON.stringify(SUBMIT_LEARN_TOOL).includes('"strict":true'));
});

test('the overview reader keeps a learn form and a comparison at light depth, and no other look has a form', () => {
  const raw = {
    summary: 'Short.',
    sections: [],
    comparison: { columns: ['A', 'B'], rows: [['1', '2']] },
    form: 'comparison',
    sources: [],
  };
  const learn = readResearchOverview(raw, 'light', 'learnLater');
  assert.equal(learn?.overview.form, 'comparison');
  assert.deepEqual(learn?.overview.comparison, {
    columns: ['A', 'B'],
    rows: [['1', '2']],
  });
  assert.equal(
    readResearchOverview({ ...raw, comparison: null }, 'light', 'learnLater')
      ?.overview.form,
    'points',
  );
  assert.equal(
    readResearchOverview({ ...raw, form: 'steps' }, 'light', 'learnLater')
      ?.overview.form,
    'steps',
  );
  assert.equal(
    readResearchOverview({ ...raw, form: 'sparkles' }, 'light', 'learnLater')
      ?.overview.form,
    'points',
  );
  assert.equal(readResearchOverview(raw, 'thorough')?.overview.form, null);
  assert.equal(readResearchOverview(raw, 'light')?.overview.form, null);
  assert.equal(readResearchOverview(raw, 'light')?.overview.comparison, null);
});

const noNetwork: VideoSearchDeps['fetch'] = () => {
  throw new Error('the network must not be called');
};

const withEnv = async (
  env: Record<string, string | undefined>,
  run: () => Promise<void>,
) => {
  const before = Object.fromEntries(
    Object.keys(env).map((name) => [name, process.env[name]]),
  );
  Object.entries(env).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
  try {
    await run();
  } finally {
    Object.entries(before).forEach(([name, value]) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  }
};

const youtubeFetch =
  (calls: string[]): VideoSearchDeps['fetch'] =>
  async (url) => {
    calls.push(String(url));
    const isSearch = String(url).includes('/search?');
    const body = isSearch
      ? {
          items: [
            'aaaaaaaaaa1',
            'bbbbbbbbbb2',
            'cccccccccc3',
            'dddddddddd4',
            'bad id',
          ].map((videoId) => ({ id: { videoId } })),
        }
      : {
          items: [
            {
              id: 'aaaaaaaaaa1',
              snippet: { title: 'Too short', channelTitle: 'A' },
              contentDetails: { duration: 'PT2M59S' },
            },
            {
              id: 'bbbbbbbbbb2',
              snippet: { title: 'Good one', channelTitle: 'B' },
              contentDetails: { duration: 'PT8M' },
            },
            {
              id: 'cccccccccc3',
              snippet: { title: 'Also good', channelTitle: 'C' },
              contentDetails: { duration: 'PT1H' },
            },
            {
              id: 'dddddddddd4',
              snippet: { title: 'Third good', channelTitle: 'D' },
              contentDetails: { duration: 'PT20M' },
            },
          ],
        };
    return new Response(JSON.stringify(body), { status: 200 });
  };

test('parseIsoDuration reads hours, minutes and seconds and nothing else', () => {
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(parseIsoDuration('PT45S'), 45);
  assert.equal(parseIsoDuration('PT8M'), 480);
  assert.equal(parseIsoDuration('P0D'), 0);
  assert.equal(parseIsoDuration(undefined), 0);
});

test('searchVideos: no key skips, the length filter and limit apply, the cap and failures skip', async () => {
  const input = {
    query: ' sourdough  for beginners ',
    limit: 2,
    minSeconds: 180,
    maxSeconds: 1200,
  };
  await withEnv(
    {
      FUNCTIONS_EMULATOR: undefined,
      FIREBASE_EMULATOR_HUB: undefined,
      LOCAL_FIXTURES: undefined,
    },
    async () => {
      const none = await searchVideos(input, {
        fetch: noNetwork,
        readSecret: async () => null,
        reserve: async () => true,
      });
      assert.deepEqual(none, { videos: [], skipped: 'noKey' });
      const calls: string[] = [];
      const found = await searchVideos(input, {
        fetch: youtubeFetch(calls),
        readSecret: async () => 'key',
        reserve: async () => true,
      });
      assert.equal(found.skipped, null);
      assert.deepEqual(
        found.videos.map((video) => video.videoId),
        ['bbbbbbbbbb2', 'dddddddddd4'],
      );
      assert.equal(calls.length, 2);
      assert.ok(
        calls.every(
          (url) => url.startsWith('https://') && !url.includes('key='),
        ),
      );
      assert.match(calls[0], /safeSearch=strict/);
      assert.match(calls[0], /videoEmbeddable=true/);
      assert.match(calls[0], /q=sourdough\+for\+beginners/);
      const capped = await searchVideos(input, {
        fetch: noNetwork,
        readSecret: async () => 'key',
        reserve: async () => false,
      });
      assert.deepEqual(capped, { videos: [], skipped: 'capped' });
      const failed = await searchVideos(input, {
        fetch: async () => new Response('nope', { status: 500 }),
        readSecret: async () => 'key',
        reserve: async () => true,
      });
      assert.deepEqual(failed, { videos: [], skipped: 'failed' });
      const empty = await searchVideos(
        { ...input, query: '  ' },
        {
          fetch: noNetwork,
          readSecret: async () => 'key',
          reserve: async () => true,
        },
      );
      assert.deepEqual(empty, { videos: [], skipped: null });
    },
  );
});

test('on the emulator searchVideos answers two fixture videos with no key, and when forced even with one', async () => {
  const input = {
    query: 'sourdough',
    limit: 2,
    minSeconds: 180,
    maxSeconds: 1200,
  };
  const emulator = {
    FUNCTIONS_EMULATOR: 'true',
    FIREBASE_EMULATOR_HUB: 'localhost:4400',
  };
  await withEnv({ ...emulator, LOCAL_FIXTURES: undefined }, async () => {
    const result = await searchVideos(input, {
      fetch: noNetwork,
      readSecret: async () => null,
      reserve: async () => true,
    });
    assert.deepEqual(result.videos, toFixtureVideos('sourdough', 2));
    assert.equal(result.skipped, null);
    assert.equal(result.videos.length, 2);
    assert.ok(
      result.videos.every(
        (video) =>
          /^[A-Za-z0-9_-]{11}$/.test(video.videoId) &&
          video.durationSec >= 180 &&
          video.durationSec <= 1200,
      ),
    );
    assert.equal(
      (
        await searchVideos(
          { ...input, limit: 1 },
          {
            fetch: noNetwork,
            readSecret: async () => null,
            reserve: async () => true,
          },
        )
      ).videos.length,
      1,
    );
  });
  await withEnv({ ...emulator, LOCAL_FIXTURES: 'youtube' }, async () => {
    const result = await searchVideos(input, {
      fetch: noNetwork,
      readSecret: async () => 'key',
      reserve: async () => true,
    });
    assert.equal(result.videos.length, 2);
  });
  const deps = createVideoSearchDeps(async () => true);
  assert.equal(typeof deps.readSecret, 'function');
});

test('the daily video search budget counts by Pacific day and stops at the cap', async () => {
  const docs: Docs = new Map();
  const reserve = createDailyReserve(
    makeStore(docs),
    'apps/helm/server/videoSearch/days',
    () => Date.UTC(2026, 10, 16, 5, 0),
  );
  await withEnv({ VIDEO_SEARCH_DAILY_CAP: '2' }, async () => {
    assert.deepEqual(
      [await reserve(), await reserve(), await reserve()],
      [true, true, false],
    );
  });
  assert.equal(
    docs.get('apps/helm/server/videoSearch/days/2026-11-15')?.count,
    2,
  );
  await withEnv({ VIDEO_SEARCH_DAILY_CAP: undefined }, async () => {
    const other = createDailyReserve(
      makeStore(docs),
      'apps/helm/server/videoSearch/days',
      () => Date.UTC(2026, 10, 16, 20, 0),
    );
    assert.equal(await other(), true);
  });
  assert.equal(
    docs.get('apps/helm/server/videoSearch/days/2026-11-16')?.count,
    1,
  );
});

test('old videos are searched again after 30 days, dropped with no search to repeat, and fresh ones are left', async () => {
  const old = NOW - 31 * DAY_MS;
  const readyDoc = (searchQuery: string | null, fetchedAt: number | null) =>
    researchDoc({
      status: 'ready',
      prepareAt: null,
      videosFetchedAt: fetchedAt,
      sealed: sealed({
        question: 'q',
        subject: 'Sourdough',
        moreAsked: [],
        overview: null,
        sources: [],
        videos: [
          {
            videoId: 'oldoldold01',
            title: 'Old',
            channel: 'C',
            durationSec: 300,
          },
        ],
        searchQuery,
        contextLine: null,
      }),
    });
  const docs = baseDocs({
    [`${BASE}/research/withQuery`]: readyDoc('sourdough for beginners', old),
    [`${BASE}/research/noQuery`]: readyDoc(null, old),
    [`${BASE}/research/fresh`]: readyDoc('x', NOW - 5 * DAY_MS),
    [`${BASE}/research/planned`]: { ...readyDoc('x', old), status: 'planned' },
  });
  await withEnv(
    {
      FUNCTIONS_EMULATOR: 'true',
      FIREBASE_EMULATOR_HUB: 'localhost:4400',
      LOCAL_FIXTURES: 'youtube',
    },
    async () => {
      const count = await refreshOldVideos(makeStore(docs), DEV_KEYRING, NOW);
      assert.equal(count, 2);
    },
  );
  const videosOf = (id: string) =>
    openForHelm(dataKey, docs.get(`${BASE}/research/${id}`)?.sealed as never)
      .videos as { videoId: string }[];
  assert.deepEqual(
    videosOf('withQuery').map((video) => video.videoId),
    ['fixture0001', 'fixture0002'],
  );
  assert.equal(docs.get(`${BASE}/research/withQuery`)?.videosFetchedAt, NOW);
  assert.deepEqual(videosOf('noQuery'), []);
  assert.equal(docs.get(`${BASE}/research/noQuery`)?.videosFetchedAt, null);
  assert.equal(videosOf('fresh')[0]?.videoId, 'oldoldold01');
  assert.deepEqual(videosOf('planned'), []);
  assert.equal(docs.get(`${BASE}/research/planned`)?.videosFetchedAt, null);
});

test('a refresh clears an item that is no longer wanted so it never jams the oldest-first batch', async () => {
  const old = NOW - 31 * DAY_MS;
  const doc = (status: string) => ({
    ...researchDoc({
      status,
      prepareAt: null,
      videosFetchedAt: old,
      sealed: sealed({
        question: 'q',
        subject: 'Sourdough',
        moreAsked: [],
        overview: null,
        sources: [],
        videos: [
          {
            videoId: 'oldoldold01',
            title: 'Old',
            channel: 'C',
            durationSec: 300,
          },
        ],
        searchQuery: 'sourdough',
        contextLine: null,
      }),
    }),
  });
  const docs = baseDocs({
    [`${BASE}/research/done`]: doc('done'),
    [`${BASE}/research/gone`]: doc('dismissed'),
  });
  await withEnv(
    {
      FUNCTIONS_EMULATOR: 'true',
      FIREBASE_EMULATOR_HUB: 'localhost:4400',
      LOCAL_FIXTURES: 'youtube',
    },
    async () => {
      assert.equal(
        await refreshOldVideos(makeStore(docs), DEV_KEYRING, NOW),
        0,
      );
    },
  );
  ['done', 'gone'].forEach((id) => {
    const after = docs.get(`${BASE}/research/${id}`);
    assert.equal(after?.videosFetchedAt, null);
    assert.deepEqual(openForHelm(dataKey, after?.sealed as never).videos, []);
  });
});

test('findLearnSlot wants 45 free minutes inside the day, never a rest or busy day; readLearnOffer picks one ready item', () => {
  const plan = {
    dayKey: '2026-11-16',
    timeZone: NY,
    now: Date.UTC(2026, 10, 16, 13, 0),
    dayStartTime: '08:00',
    dayEndTime: '22:00',
    fillPercent: 100,
    hasCalendar: false,
    restDay: null,
    currentPlaceId: null,
    busy: [],
    slots: {},
    tasks: [],
  };
  const slot = findLearnSlot({
    plan,
    busyShare: 0.2,
    offers: [],
    isToday: true,
  });
  assert.ok(slot);
  assert.equal(slot.endAt - slot.startAt, 30 * 60_000);
  assert.equal(slot.dayKind, 'weekday');
  assert.equal(
    findLearnSlot({
      plan,
      busyShare: 0.8,
      offers: [],
      isToday: true,
    }),
    null,
  );
  assert.equal(
    findLearnSlot({
      plan,
      busyShare: 0.2,
      offers: [],
      isToday: false,
    }),
    null,
  );
  const declined = Array.from({ length: 3 }, (_, index) => ({
    at: NOW - index * DAY_MS,
    dayKind: 'weekday' as const,
    gapMinutes: 60,
    afterBusyDay: false,
    outcome: 'notNow' as const,
  }));
  assert.equal(
    findLearnSlot({
      plan,
      busyShare: 0.2,
      offers: declined,
      isToday: true,
    }),
    null,
  );
  const item = (id: string, over: Record<string, unknown>) =>
    ({
      id,
      mode: 'learnLater',
      status: 'ready',
      isUnreadable: false,
      offeredOn: null,
      prepareFailedAt: null,
      notNowStreak: 0,
      offers: [],
      createdAt: NOW,
      ...over,
    }) as never;
  const offer = readLearnOffer({
    items: [
      item('new', { createdAt: NOW }),
      item('old', { createdAt: NOW - DAY_MS }),
      item('planned', { status: 'planned', createdAt: NOW - 9 * DAY_MS }),
    ],
    todayKey: '2026-11-16',
    timeZone: NY,
  });
  assert.equal((offer?.item as unknown as { id: string }).id, 'old');
  assert.equal(offer?.ask, 'offer');
  const failedToday = readLearnOffer({
    items: [item('a', { prepareFailedAt: NOW })],
    todayKey: '2026-11-16',
    timeZone: NY,
  });
  assert.equal(failedToday, null);
  assert.equal(
    readLearnOffer({
      items: [item('a', { notNowStreak: 3 })],
      todayKey: '2026-11-16',
      timeZone: NY,
    })?.ask,
    'still',
  );
});

test('learn offers: shown today first, never offered before offered, longest ago first; old Not nows are forgotten and a blocked item falls back to one that fits', async () => {
  const todayKey = '2026-11-16';
  const item = (id: string, over: Record<string, unknown>) =>
    ({
      id,
      mode: 'learnLater',
      status: 'ready',
      isUnreadable: false,
      offeredOn: null,
      prepareFailedAt: null,
      notNowStreak: 0,
      offers: [],
      createdAt: NOW,
      ...over,
    }) as never;
  const offered = (at: number) => [
    {
      at,
      dayKind: 'weekday',
      gapMinutes: 60,
      afterBusyDay: null,
      outcome: 'notNow',
    },
  ];
  const ids = (items: never[]) =>
    readLearnOffers({ items, todayKey, timeZone: NY }).map(
      (reading) => (reading.item as unknown as { id: string }).id,
    );
  assert.deepEqual(
    ids([
      item('recent', { offers: offered(NOW - DAY_MS), status: 'offered' }),
      item('older', { offers: offered(NOW - 5 * DAY_MS), status: 'offered' }),
      item('never', { createdAt: NOW - DAY_MS }),
      item('neverNewer', { createdAt: NOW }),
      item('today', {
        offeredOn: todayKey,
        offers: offered(NOW),
        status: 'offered',
      }),
      item('tieA', {
        offers: offered(NOW - 9 * DAY_MS),
        createdAt: NOW - 3 * DAY_MS,
      }),
      item('tieB', {
        offers: offered(NOW - 9 * DAY_MS),
        createdAt: NOW - 4 * DAY_MS,
      }),
    ]),
    ['today', 'never', 'neverNewer', 'tieB', 'tieA', 'older', 'recent'],
  );

  const plan = {
    dayKey: todayKey,
    timeZone: NY,
    now: Date.UTC(2026, 10, 16, 13, 0),
    dayStartTime: '08:00',
    dayEndTime: '22:00',
    fillPercent: 100,
    hasCalendar: false,
    restDay: null,
    currentPlaceId: null,
    busy: [],
    slots: {},
    tasks: [],
  };
  const dayStart = Date.UTC(2026, 10, 16, 13, 0);
  const notNows = (agesInDays: number[]) =>
    agesInDays.map((age) => ({
      at: dayStart - age * DAY_MS,
      dayKind: 'weekday' as const,
      gapMinutes: 60,
      afterBusyDay: null,
      outcome: 'notNow' as const,
    }));
  const slotWith = (offers: ReturnType<typeof notNows>) =>
    findLearnSlot({ plan, busyShare: 0.2, offers, isToday: true });
  assert.ok(slotWith(notNows([40, 45])));
  assert.equal(slotWith(notNows([2, 3])), null);

  const blocked = item('A', { offers: notNows([2, 3]), status: 'offered' });
  const fits = item('B', { createdAt: NOW });
  const first = readLearnOffers({
    items: [blocked, fits],
    todayKey,
    timeZone: NY,
  })
    .map(
      (reading) =>
        reading.item as unknown as {
          id: string;
          offers: ReturnType<typeof notNows>;
        },
    )
    .find(
      (one) =>
        findLearnSlot({
          plan,
          busyShare: 0.2,
          offers: one.offers,
          isToday: true,
        }) !== null,
    );
  assert.equal(first?.id, 'B');

  const { pickLearnOffers } =
    await import('../../src/apps/helm/store/selectors/researchSelectors.ts');
  assert.deepEqual(
    pickLearnOffers(
      [item('x', { offers: offered(NOW), status: 'offered' }), item('y', {})],
      todayKey,
      NY,
    ),
    [],
  );
});

const DAY = 86_400_000;
const MOVE = Date.UTC(2027, 2, 1);
const TODAY = Date.UTC(2026, 10, 16);
const meta = (over: Partial<AheadOfferMeta> = {}): AheadOfferMeta => ({
  id: 'o1',
  leadDays: 56,
  offerOn: MOVE - 56 * DAY,
  state: 'waiting',
  declineCount: 0,
  nextEligibleOn: null,
  shownOn: null,
  researchId: null,
  toldAt: null,
  createdAt: NOW,
  ...over,
});

test('computeOfferOn is the date minus the lead, null with no date, and the lead is clamped', () => {
  assert.equal(computeOfferOn(MOVE, 56), MOVE - 56 * DAY);
  assert.equal(computeOfferOn(null, 56), null);
  assert.equal(computeOfferOn(MOVE, 2), MOVE - 7 * DAY);
  assert.equal(computeOfferOn(MOVE, 900), MOVE - 180 * DAY);
});

test('a date move rewrites a waiting offer only; a cleared date clears it', () => {
  const moved = Date.UTC(2027, 3, 1);
  const offers = [
    meta(),
    meta({ id: 'o2', state: 'taken', offerOn: 5 }),
    meta({ id: 'o3', state: 'off', offerOn: 6 }),
  ];
  const after = rewriteOfferDays(offers, moved);
  assert.equal(after[0].offerOn, moved - 56 * DAY);
  assert.equal(after[1].offerOn, 5);
  assert.equal(after[2].offerOn, 6);
  assert.equal(rewriteOfferDays(offers, null)[0].offerOn, null);
});

test('an offer is due from its day until the date, past a back-off; the earliest due is picked', () => {
  const offer = meta();
  assert.ok(!isAheadOfferDue(offer, MOVE, offer.offerOn! - DAY));
  assert.ok(isAheadOfferDue(offer, MOVE, offer.offerOn!));
  assert.ok(!isAheadOfferDue(offer, MOVE, MOVE));
  assert.ok(!isAheadOfferDue(meta({ offerOn: null }), MOVE, TODAY));
  assert.ok(!isAheadOfferDue(meta({ state: 'taken' }), MOVE, TODAY));
  assert.ok(
    !isAheadOfferDue(meta({ nextEligibleOn: TODAY + DAY }), MOVE, TODAY),
  );
  const later = meta({ id: 'b', offerOn: TODAY - DAY });
  const earlier = meta({ id: 'a', offerOn: TODAY - 5 * DAY });
  assert.equal(pickAheadOffer([later, earlier], MOVE, TODAY)?.id, 'a');
  assert.equal(pickAheadOffer([meta({ state: 'off' })], MOVE, TODAY), null);
});

test('Not now waits 2 weeks, then 4, and the third or a wait reaching the date turns it off', () => {
  assert.deepEqual([...AHEAD_BACKOFF_WEEKS], [2, 4]);
  const first = applyAheadNotNow(meta(), MOVE, TODAY);
  assert.equal(first.state, 'waiting');
  assert.equal(first.nextEligibleOn, TODAY + 14 * DAY);
  const second = applyAheadNotNow(first, MOVE, TODAY);
  assert.equal(second.nextEligibleOn, TODAY + 28 * DAY);
  const third = applyAheadNotNow(second, MOVE, TODAY);
  assert.equal(third.state, 'off');
  assert.equal(third.nextEligibleOn, null);
  const near = applyAheadNotNow(meta(), TODAY + 10 * DAY, TODAY);
  assert.equal(near.state, 'off');
  assert.equal(near.declineCount, 1);
});

const questions: LeadQuestion[] = [
  {
    id: 'q1',
    label: 'Where',
    shape: 'pickMany',
    options: ['Ballard', 'Fremont', 'Capitol Hill'],
    prefill: ['Ballard', 'Fremont'],
    from: null,
    isInferred: false,
  },
  {
    id: 'q2',
    label: 'Rent a month',
    shape: 'amountRange',
    options: [],
    prefill: [],
    from: null,
    isInferred: false,
  },
  {
    id: 'q3',
    label: 'Pets',
    shape: 'text',
    options: [],
    prefill: [],
    from: null,
    isInferred: false,
  },
];

test('buildAheadBrief writes the answered questions, skips the rest and says how deep', () => {
  assert.equal(
    buildAheadBrief({
      subject: 'apartments',
      questions,
      answers: {
        q1: { kind: 'picks', picks: ['Ballard', 'Fremont'] },
        q2: { kind: 'range', minCents: 220000, maxCents: 280000 },
        q3: { kind: 'skipped' },
      },
      depth: 'thorough',
    }),
    'Apartments: Where: Ballard or Fremont; Rent a month: $2,200 to $2,800; thorough.',
  );
  assert.equal(
    buildAheadBrief({
      subject: 'gifts',
      questions,
      answers: {},
      depth: 'light',
    }),
    'Gifts; quick look.',
  );
});

const offerCommand = (over: Record<string, unknown> = {}) => ({
  kind: 'offerResearch' as const,
  projectRef: 'Move',
  subject: 'apartments',
  question: 'Which neighborhoods fit a 2 bedroom under $2,800?',
  whyNow: 'Nothing in Move yet says what you are looking for.',
  leadDays: 70,
  isDecision: true,
  questions: [
    {
      label: 'Where',
      shape: 'pickMany' as const,
      options: ['Ballard', 'Fremont'],
      prefill: ['Ballard'],
      from: 'What you said today',
      isInferred: false,
    },
  ],
  ...over,
});
const target = (over: Partial<OfferTarget> = {}): OfferTarget => ({
  id: 'p1',
  name: 'Move',
  targetDate: MOVE,
  offers: [],
  subjects: [],
  ...over,
});
const planOffers = (
  commands: ReturnType<typeof offerCommand>[],
  targets: OfferTarget[],
) => {
  let count = 0;
  return planOfferResearch({
    commands,
    targets,
    resolve: (ref) => (ref === 'Move' ? 'p1' : null),
    newId: () => `id-${(count += 1)}`,
    now: NOW,
  });
};

test('offerResearch is accepted with a date and room: a waiting offer and its sealed words', () => {
  const plan = planOffers([offerCommand()], [target()]);
  assert.equal(plan.notKept.length, 0);
  assert.equal(plan.accepted.length, 1);
  const [one] = plan.accepted;
  assert.deepEqual(one.meta, {
    id: 'id-1',
    leadDays: 70,
    offerOn: MOVE - 70 * DAY,
    state: 'waiting',
    declineCount: 0,
    nextEligibleOn: null,
    shownOn: null,
    researchId: null,
    toldAt: null,
    createdAt: NOW,
  });
  assert.equal(one.ask.answers, null);
  assert.equal(one.ask.brief, null);
  assert.equal(one.ask.questions[0].id, 'id-2');
  assert.equal(
    one.line,
    "I'll offer to look into apartments 10 weeks before Move",
  );
});

test('offerResearch is refused, in code words, with no date, at the cap or for the same subject', () => {
  const noDate = planOffers([offerCommand()], [target({ targetDate: null })]);
  assert.equal(noDate.accepted.length, 0);
  assert.equal(
    noDate.notKept[0],
    'I can offer research ahead once Move has a date',
  );
  const full = planOffers(
    [offerCommand()],
    [
      target({
        offers: [
          meta({ id: 'a', state: 'off' }),
          meta({ id: 'b', state: 'taken' }),
          meta({ id: 'c' }),
        ],
      }),
    ],
  );
  assert.equal(RESEARCH_OFFERS_PER_PROJECT, 3);
  assert.equal(full.accepted.length, 0);
  assert.equal(full.notKept[0], 'Move already has 3 research offers');
  const duplicate = planOffers(
    [offerCommand({ subject: 'Apartments' })],
    [target({ subjects: ['apartments'] })],
  );
  assert.equal(duplicate.accepted.length, 0);
  assert.match(duplicate.notKept[0], /already have an offer to look into/);
  const twice = planOffers(
    [offerCommand(), offerCommand({ question: 'Again' })],
    [target()],
  );
  assert.equal(twice.accepted.length, 1);
  assert.equal(twice.notKept.length, 1);
  assert.equal(
    planOffers([offerCommand({ projectRef: 'Nowhere' })], [target()]).accepted
      .length,
    0,
  );
});

test('the offer reader caps its words, settles the lead, drops a pick with one option and a range prefill that is not cents', () => {
  const [read] = readOfferResearch([
    {
      kind: 'offerResearch',
      projectRef: 'Move',
      offerSubject: 'x'.repeat(100),
      offerQuestion: 'What fits?',
      offerWhyNow: null,
      offerLeadDays: 3,
      offerIsDecision: true,
      offerQuestions: [
        {
          label: 'Where',
          shape: 'pickOne',
          options: ['Ballard'],
          prefill: [],
          from: null,
          isInferred: false,
        },
        {
          label: 'Budget',
          shape: 'amountRange',
          options: ['ignored'],
          prefill: ['100000-200000'],
          from: 'What you said',
          isInferred: true,
        },
        {
          label: 'Rent',
          shape: 'amountRange',
          options: [],
          prefill: ['$1,800-$2,400'],
          from: 'What you said',
          isInferred: false,
        },
      ],
    },
  ]);
  assert.equal(read.subject.length, 60);
  assert.equal(read.leadDays, 7);
  assert.equal(read.questions.length, 2);
  assert.deepEqual(read.questions[0].options, []);
  assert.equal(read.questions[0].isInferred, true);
  assert.deepEqual(read.questions[1].prefill, []);
  assert.equal(read.questions[1].from, null);
  assert.equal(readOfferResearch([{ kind: 'offerResearch' }]).length, 0);
});

const makeIds = (prefix: string) => {
  const made = { count: 0 };
  return () => {
    made.count += 1;
    return `${prefix}-${made.count}`;
  };
};

test('an offer on an existing project reseals its words and appends the offer; one on a new project carries it from the start', () => {
  const base = {
    pool: [{ id: 'p1', name: 'Move' }],
    commands: [],
    milestones: [],
    newId: makeIds('n'),
    taskWho: [],
    namedWhoIds: [],
    whoIdOf: new Map<string, string>(),
    nameOf: new Map<string, string>(),
    executionId: 'e1',
    captureId: 'c1',
    now: NOW,
    seal: (fields: Record<string, unknown>) => fields as never,
  };
  const existing = [
    {
      id: 'p1',
      name: 'Move',
      emoji: null,
      whoRoles: {},
      roleNotes: {},
      milestoneState: {},
      milestoneTitles: {},
      kind: 'project' as const,
      targetDate: MOVE,
      researchOffers: [meta({ id: 'old' })],
      sealed: {
        name: 'Move',
        aheadAsks: { old: { subject: 'movers' } },
      },
    },
  ];
  const plan = planProjectRoles({
    ...base,
    created: null,
    existing,
    offers: [offerCommand()],
  });
  assert.equal(plan.updates.length, 1);
  const data = plan.updates[0].data as {
    researchOffers: AheadOfferMeta[];
    sealed: { aheadAsks: Record<string, unknown>; name: string };
  };
  assert.deepEqual(
    data.researchOffers.map((offer) => offer.id),
    ['old', 'n-1'],
  );
  assert.deepEqual(Object.keys(data.sealed.aheadAsks), ['old', 'n-1']);
  assert.equal(plan.offerLines.length, 1);
  const refused = planProjectRoles({
    ...base,
    created: null,
    existing,
    offers: [offerCommand({ subject: 'Movers' })],
  });
  assert.equal(refused.updates.length, 0);
  assert.equal(refused.offerLines.length, 0);
  const made = planProjectRoles({
    ...base,
    created: {
      id: 'new',
      command: {
        kind: 'createProject',
        ref: null,
        name: 'Move',
        emoji: null,
        objective: null,
        targetDate: MOVE,
        projectKind: 'project',
        why: null,
      },
    },
    existing: [],
    pool: [{ id: 'new', name: 'Move' }],
    offers: [offerCommand()],
  });
  const created = made.creates[0].data as {
    researchOffers: AheadOfferMeta[];
    sealed: { aheadAsks: Record<string, unknown> | null };
  };
  assert.equal(created.researchOffers.length, 1);
  assert.equal(Object.keys(created.sealed.aheadAsks ?? {}).length, 1);
});

const aheadProject = (over: Partial<AheadOfferMeta> = {}) => ({
  offers: [meta({ id: 'o1', state: 'taken', ...over })],
  ask: readAheadAsk(
    {
      aheadAsks: {
        o1: {
          subject: 'apartments',
          questions,
          answers: { q1: { kind: 'picks', picks: ['Ballard'] } },
          brief: null,
        },
      },
    },
    'o1',
    'light',
  ),
});
const aheadStart = (
  when: 'now' | 'later',
  project: ReturnType<typeof aheadProject> | null,
  depth: 'light' | 'thorough' = 'light',
  used = 0,
) => {
  let count = 0;
  return planAheadStart({
    start: { projectId: 'p1', offerId: 'o1', depth, when },
    project,
    usage: usage(used),
    timeZone: NY,
    now: NOW,
    nextNight: nextNight(NOW, NY),
    captureId: 'cap-1',
    newId: () => `r-${(count += 1)}`,
    seal: (fields) => fields as never,
  });
};

test('a capture from the device is read as a start only with every readable field', () => {
  assert.deepEqual(
    readAheadStart({
      arrivedVia: 'researchAhead',
      aheadOffer: {
        projectId: 'p1',
        offerId: 'o1',
        depth: 'light',
        when: 'now',
      },
    }),
    { projectId: 'p1', offerId: 'o1', depth: 'light', when: 'now' },
  );
  assert.equal(
    readAheadStart({
      arrivedVia: 'direct',
      aheadOffer: {
        projectId: 'p1',
        offerId: 'o1',
        depth: 'light',
        when: 'now',
      },
    }),
    null,
  );
  assert.equal(
    readAheadStart({
      arrivedVia: 'researchAhead',
      aheadOffer: {
        projectId: 'p1',
        offerId: 'o1',
        depth: 'deep',
        when: 'now',
      },
    }),
    null,
  );
});

test('a taken offer starts a leadTime item at once from the project’s own brief', () => {
  const plan = aheadStart('now', aheadProject(), 'thorough');
  assert.ok(plan.create);
  const doc = plan.create.doc as Record<string, unknown> & {
    sealed: Record<string, unknown>;
  };
  assert.equal(doc.mode, 'leadTime');
  assert.equal(doc.projectId, 'p1');
  assert.equal(doc.aheadOfferId, 'o1');
  assert.equal(doc.captureId, 'cap-1');
  assert.equal(doc.resultTopicId, null);
  assert.equal(doc.status, 'preparing');
  assert.equal(doc.depth, 'thorough');
  assert.equal(doc.reservedCents, RESEARCH_DEPTHS.thorough.estimateCents);
  assert.equal(doc.sealed.subject, 'apartments');
  assert.equal(doc.sealed.question, 'Apartments: Where: Ballard; quick look.');
  assert.equal(plan.offers?.[0].researchId, 'r-1');
  assert.equal(plan.offers?.[0].state, 'taken');
  assert.ok(plan.usage);
  assert.equal(
    plan.line,
    "Looking into apartments. About 5 to 10 minutes; I'll tell you when it's in.",
  );
});

test('a thorough start that the month cannot fit falls back to a quick look', () => {
  const plan = aheadStart('now', aheadProject(), 'thorough', 170);
  const doc = plan.create?.doc as Record<string, unknown>;
  assert.equal(doc.depth, 'light');
  assert.equal(doc.status, 'preparing');
  assert.match(plan.line, /thorough look won't fit/i);
});

test('a later start is planned for the coming night with nothing held', () => {
  const plan = aheadStart('later', aheadProject(), 'thorough');
  const doc = plan.create?.doc as Record<string, unknown>;
  assert.equal(doc.status, 'planned');
  assert.equal(doc.depth, 'thorough');
  assert.equal(doc.reservedCents, 0);
  assert.equal(doc.prepareAt, nextNight(NOW, NY));
  assert.equal(plan.usage, null);
  assert.equal(
    plan.line,
    'Looking into apartments. It will be ready by morning.',
  );
});

test('an offer already started, not taken or gone starts nothing', () => {
  [
    aheadProject({ researchId: 'r-9' }),
    aheadProject({ state: 'waiting' }),
    aheadProject({ state: 'off' }),
    { offers: [], ask: null },
  ].forEach((project) => {
    const plan = aheadStart('now', project);
    assert.equal(plan.create, null);
    assert.equal(plan.offers, null);
    assert.equal(plan.usage, null);
    assert.equal(plan.line, 'That look is already under way.');
  });
  assert.equal(aheadStart('now', null).create, null);
});

test('a taken offer whose words are missing goes back to waiting and says so', () => {
  const plan = aheadStart('now', { ...aheadProject(), ask: null });
  assert.equal(plan.create, null);
  assert.equal(plan.usage, null);
  assert.deepEqual(
    plan.offers?.map((entry) => [entry.id, entry.state, entry.researchId]),
    [['o1', 'waiting', null]],
  );
  assert.equal(plan.line, "I couldn't start that look. I'll offer it again.");
});

test('the night starts a leadTime item at its depth, always live, and a learn-later wish as before', () => {
  const planned = {
    mode: 'leadTime',
    status: 'planned',
    depth: 'thorough',
    prepareAt: NOW - 1,
  };
  const ahead = planNightStart({
    id: 'r1',
    data: planned,
    usage: usage(0),
    now: NOW,
    timeZone: NY,
  });
  assert.equal(ahead.fields.status, 'preparing');
  assert.equal(ahead.fields.depth, 'thorough');
  assert.equal(ahead.fields.isWithoutWeb, false);
  assert.equal(ahead.fields.prepareAt, null);
  assert.equal(
    ahead.fields.reservedCents,
    RESEARCH_DEPTHS.thorough.estimateCents,
  );
  assert.ok(ahead.usage);
  const spent = planNightStart({
    id: 'r1',
    data: planned,
    usage: usage(195),
    now: NOW,
    timeZone: NY,
  });
  assert.equal(spent.fields.isWithoutWeb, true);
  assert.equal(spent.fields.depth, 'light');
  const wish = planNightStart({
    id: 'r2',
    data: { mode: 'learnLater', needsLiveFacts: false, depth: null },
    usage: null,
    now: NOW,
    timeZone: NY,
  });
  assert.equal(wish.fields.isWithoutWeb, true);
  assert.equal(wish.usage, null);
});

test('a finished look is filed as a top-level topic under the project, sections, table and sources sealed', () => {
  let count = 0;
  const filed = buildResultTopic({
    subject: 'apartments',
    overview: {
      summary: 'Ballard and Fremont fit best.',
      sections: [
        {
          heading: 'Areas',
          points: ['Ballard is walkable', 'Fremont is close'],
        },
      ],
      comparison: {
        columns: ['Area', 'Rent'],
        rows: [['Ballard', '$2,500 | avg']],
      },
      form: null,
    },
    sources: [
      {
        title: 'Rents [2026]',
        url: 'https://example.com/rents',
        site: 'example.com',
      },
    ],
    projectId: 'p1',
    captureId: 'cap-1',
    newId: () => `s-${(count += 1)}`,
    now: NOW,
    seal: (fields) => fields as never,
  });
  const topic = filed.topic as Record<string, unknown>;
  assert.equal(topic.parentId, null);
  assert.equal(topic.depth, 1);
  assert.deepEqual(topic.projectIds, ['p1']);
  assert.equal(topic.version, 1);
  assert.equal(topic.docState, 'current');
  assert.equal(topic.createdBy, 'nomos');
  assert.equal(topic.privacy, null);
  const sealed = topic.sealed as unknown as {
    name: string;
    overview: string;
    sections: {
      heading: string;
      level: number;
      markdown: string;
      writtenBy: string;
    }[];
    privateMark: null;
  };
  assert.equal(sealed.name, 'Apartments');
  assert.equal(sealed.overview, 'Ballard and Fremont fit best.');
  assert.deepEqual(
    sealed.sections.map((section) => section.heading),
    ['Areas', 'Comparison', 'Sources'],
  );
  assert.ok(
    sealed.sections.every(
      (section) => section.level === 2 && section.writtenBy === 'nomos',
    ),
  );
  assert.equal(
    sealed.sections[0].markdown,
    '- Ballard is walkable\n- Fremont is close',
  );
  assert.match(
    sealed.sections[1].markdown,
    /\| Ballard \| \$2,500 \\\| avg \|/,
  );
  assert.equal(
    sealed.sections[2].markdown,
    '- [Rents 2026](https://example.com/rents) · example.com',
  );
  assert.equal((filed.version as { reason: string }).reason, 'firstWritten');
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
