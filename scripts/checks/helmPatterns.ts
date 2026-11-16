// What Helm notices: stable ids, each detector at its threshold and no lower, days counting only when in use, the back-off steps, the evidence bar for coming back, and today's one offer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { sha256Hex } from '@/utils/sha256';

import {
  applyNo,
  applyReopen,
  applyRetire,
  applyStop,
  buildPatternLines,
  detectDoneOutsideWindow,
  detectPlannedSlotMissed,
  detectWindowMissed,
  isEvidenceAsStrong,
  isPatternEligible,
  patternId,
  patternSignature,
  pickTodayOffer,
  readSaidLinkCandidates,
  type DetectHabit,
  type PlannedSlot,
} from '../../src/apps/helm/engine/patterns.ts';
import {
  CUT_EVIDENCE,
  isPatternCut,
  readPatternMove,
} from '../../src/apps/helm/engine/patternCheck.ts';
import type { LifeDay } from '../../src/apps/helm/engine/habitLife.ts';
import type { Pattern } from '../../src/apps/helm/types.ts';

let failures = 0;
const test = (name: string, run: () => void | Promise<void>) =>
  Promise.resolve()
    .then(run)
    .catch((error) => {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    });

const DAY = 86_400_000;
const TODAY = '2026-11-16';
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`);
const back = (days: number) =>
  new Date(ms(TODAY) - days * DAY).toISOString().slice(0, 10);

const habit: DetectHabit = {
  id: 'h1',
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {
    w1: {
      start: '18:00',
      end: '21:00',
      order: 0,
      editedAt: null,
      part: 'evening',
    },
  },
  timesPerDay: null,
  startsOn: ms('2026-01-01'),
  endsOn: null,
  history: [],
  isCare: false,
  forWhoId: null,
  stage: null,
  stageAt: 0,
  stageWeek: null,
  rejudgeFrom: null,
  formedAt: null,
};

const keys = Array.from({ length: 70 }, (_, at) => back(at + 1));
const makeDays = (
  status: (key: string) => 'done' | 'skipped' | null,
  isInUse: (key: string) => boolean = () => true,
  at: (key: string) => number = (key) => ms(key) + 19 * 3_600_000,
): Record<string, LifeDay> =>
  Object.fromEntries(
    keys.map((key): [string, LifeDay] => [
      key,
      {
        isInUse: isInUse(key),
        entries: {
          h1: {
            checks: Object.fromEntries(
              [status(key)].flatMap((one) =>
                one ? [['w1', { status: one, at: at(key) }]] : [],
              ),
            ),
            count: 0,
            lastCountAt: null,
            reminded: null,
          },
        },
      },
    ]),
  );
const isTuesday = (key: string) => new Date(ms(key)).getUTCDay() === 2;
const input = (days: Record<string, LifeDay>, extra = {}) => ({
  habit,
  days,
  today: TODAY,
  timeZone: 'UTC',
  ...extra,
});

const pattern = (extra: Partial<Pattern>): Pattern =>
  ({
    state: 'candidate',
    declineCount: 0,
    nextEligibleOn: null,
    offReason: null,
    offAt: null,
    isLive: true,
    evidenceSince: 0,
    history: [],
    stateAt: 0,
    acceptedBy: null,
    handling: 'suggest',
    kind: 'windowMissed',
    ...extra,
  }) as Pattern;

const run = async () => {
  await test('an id is stable, prefixed and 24 hex', async () => {
    const signature = patternSignature({
      kind: 'windowMissed',
      subject: {
        collection: 'habits',
        id: 'h1',
        windowId: 'w1',
        otherId: null,
      },
      bucket: { kind: 'weekdayPart', weekday: 2, part: 'evening' },
    });
    const id = patternId(signature);
    assert.match(id, /^pt_[0-9a-f]{24}$/);
    assert.equal(patternId(signature), id);
    assert.notEqual(patternId(`${signature}x`), id);
  });

  await test('the hash matches SHA-256 for short, block-edge and non-ASCII text', () => {
    [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      'café 💍 '.repeat(20),
    ].forEach((text) =>
      assert.equal(
        sha256Hex(text),
        createHash('sha256').update(text, 'utf8').digest('hex'),
      ),
    );
  });

  await test('4 of the last 5 Tuesdays missed is a pattern, 3 of 5 is not', () => {
    const missed = new Set([back(6), back(13), back(20), back(27)]);
    const days = makeDays((key) =>
      isTuesday(key) && missed.has(key) ? null : 'done',
    );
    const found = detectWindowMissed(input(days));
    assert.equal(found.length, 1);
    assert.equal(found[0].handling, 'suggest');
    assert.equal(
      found[0].evidence.kind === 'occurrences' && found[0].evidence.matched,
      4,
    );
    missed.delete(back(27));
    assert.equal(
      detectWindowMissed(
        input(
          makeDays((key) =>
            isTuesday(key) && missed.has(key) ? null : 'done',
          ),
        ),
      ).length,
      0,
    );
  });

  await test('a skipped time counts as not done, and a day Helm was not in use does not count', () => {
    const days = makeDays((key) => (isTuesday(key) ? 'skipped' : 'done'));
    assert.equal(detectWindowMissed(input(days)).length, 1);
    const away = makeDays(
      (key) => (isTuesday(key) ? null : 'done'),
      (key) => !isTuesday(key),
    );
    assert.equal(detectWindowMissed(input(away)).length, 0);
  });

  await test('evidence before the since instant does not count; a care habit is ask-only', () => {
    const days = makeDays((key) => (isTuesday(key) ? null : 'done'));
    assert.equal(
      detectWindowMissed(input(days, { since: ms(back(1)) })).length,
      0,
    );
    const care = detectWindowMissed({
      ...input(days),
      habit: { ...habit, isCare: true },
    });
    assert.equal(care[0].handling, 'askOnly');
    assert.deepEqual(care[0].effect, { kind: 'none' });
  });

  await test('5 of 6 done checks after the window suggest its median time', () => {
    const days = makeDays(
      () => 'done',
      () => true,
      (key) => ms(key) + (key === back(2) ? 19 : 22.5) * 3_600_000,
    );
    const [found] = detectDoneOutsideWindow(input(days));
    assert.deepEqual(found.effect, {
      kind: 'moveWindow',
      habitId: 'h1',
      windowId: 'w1',
      start: '22:30',
      end: '01:30',
    });
    assert.equal(
      found.evidence.kind === 'occurrences' && found.evidence.matched,
      5,
    );
    const twoIn = makeDays(
      () => 'done',
      () => true,
      (key) =>
        ms(key) + ([back(2), back(3)].includes(key) ? 19 : 22.5) * 3_600_000,
    );
    assert.equal(detectDoneOutsideWindow(input(twoIn)).length, 0);
  });

  const slot = (
    dayKey: string,
    extra: Partial<PlannedSlot> = {},
  ): PlannedSlot => ({
    dayKey,
    taskId: `t-${dayKey}`,
    startAt: ms(dayKey) + 19 * 3_600_000,
    status: 'kept',
    source: 'nomos',
    isDone: false,
    isCare: false,
    ...extra,
  });
  const wednesdays = [back(5), back(12), back(19), back(26), back(33)];
  const plannedInput = (slots: PlannedSlot[]) => ({
    slots,
    today: TODAY,
    timeZone: 'UTC',
    isInUse: () => true,
  });

  await test('5 planned slots over 4 weeks at 80% not done is a pattern that Helm acts on', () => {
    const slots = wednesdays.map((key, at) => slot(key, { isDone: at === 0 }));
    const [found] = detectPlannedSlotMissed(plannedInput(slots));
    assert.equal(found.handling, 'actAndTell');
    assert.equal(found.effect.kind, 'plannerAvoid');
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput(
          wednesdays.map((key, at) => slot(key, { isDone: at < 2 })),
        ),
      ).length,
      0,
    );
  });

  await test('care tasks, a person-made slot and a day not in use are left out', () => {
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput(wednesdays.map((key) => slot(key, { isCare: true }))),
      ).length,
      0,
    );
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput(wednesdays.map((key) => slot(key, { source: 'person' }))),
      ).length,
      0,
    );
    assert.equal(
      detectPlannedSlotMissed({
        ...plannedInput(wednesdays.map((key) => slot(key))),
        isInUse: () => false,
      }).length,
      0,
    );
  });

  await test("today's slots count only once Not today'd or moved", () => {
    const mondays = [back(7), back(14), back(21), back(28)].map((key) =>
      slot(key),
    );
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput([...mondays, slot(TODAY, { status: 'kept' })]),
      ).length,
      0,
    );
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput([...mondays, slot(TODAY, { status: 'notToday' })]),
      ).length,
      1,
    );
    assert.equal(
      detectPlannedSlotMissed(
        plannedInput([...mondays, slot(TODAY, { status: 'moved' })]),
      ).length,
      1,
    );
  });

  await test('the back-off waits 4 then 8 weeks and the third no is final', () => {
    const today = ms(TODAY);
    const first = applyNo(pattern({}), {
      to: 'declined',
      now: today,
      today,
      by: 'person',
    });
    assert.equal(first.nextEligibleOn, today + 28 * DAY);
    assert.equal(first.isLive, true);
    const second = applyNo(pattern(first as Partial<Pattern>), {
      to: 'undone',
      now: today,
      today,
      by: 'person',
    });
    assert.equal(second.nextEligibleOn, today + 56 * DAY);
    const third = applyNo(pattern(second as Partial<Pattern>), {
      to: 'declined',
      now: today,
      today,
      by: 'person',
    });
    assert.equal(third.offReason, 'thirdNo');
    assert.equal(third.isLive, false);
    assert.equal(
      isPatternEligible(pattern(third as Partial<Pattern>), today + 999 * DAY),
      false,
    );
    const reopened = applyReopen(pattern(third as Partial<Pattern>), {
      now: today,
    });
    assert.equal(reopened.declineCount, 0);
    assert.equal(
      isPatternEligible(pattern(reopened as Partial<Pattern>), today),
      true,
    );
  });

  await test('eligibility waits for the date; stop is final until reopened; retire starts evidence over', () => {
    const today = ms(TODAY);
    const waiting = pattern({ state: 'declined', nextEligibleOn: today + DAY });
    assert.equal(isPatternEligible(waiting, today), false);
    assert.equal(isPatternEligible(waiting, today + DAY), true);
    assert.equal(isPatternEligible(null, today), true);
    const stopped = applyStop(pattern({ state: 'suggested' }), { now: today });
    assert.equal(stopped.offReason, 'askedToStop');
    assert.equal(stopped.isLive, false);
    const retired = applyRetire(
      pattern({ state: 'accepted', declineCount: 2 }),
      { now: today },
    );
    assert.equal(retired.declineCount, 0);
    assert.equal(retired.evidenceSince, today);
    assert.equal(retired.isLive, false);
  });

  await test('coming back needs evidence as strong, and only after since', () => {
    const shown = {
      kind: 'occurrences' as const,
      from: 0,
      to: 0,
      matched: 4,
      total: 5,
      dayKeys: [],
    };
    const fresh = (matched: number, total: number, dayKey: string) => ({
      ...shown,
      matched,
      total,
      dayKeys: [dayKey],
    });
    assert.equal(isEvidenceAsStrong(shown, fresh(3, 4, back(2)), 0), false);
    assert.equal(isEvidenceAsStrong(shown, fresh(4, 5, back(2)), 0), true);
    assert.equal(
      isEvidenceAsStrong(shown, fresh(4, 5, back(30)), ms(back(2))),
      false,
    );
    const said = {
      kind: 'said' as const,
      from: 0,
      to: 0,
      matched: 3,
      dayKeys: [back(2), back(3)],
      observationIds: [],
    };
    assert.equal(isEvidenceAsStrong(said, said, 0), false);
    assert.equal(
      isEvidenceAsStrong(
        said,
        { ...said, dayKeys: [back(2), back(3), back(4)] },
        0,
      ),
      true,
    );
  });

  await test("today's offer is one, care first, never past the limits", () => {
    const today = ms(TODAY);
    const candidates = [
      { id: 'a', pattern: pattern({ kind: 'saidWorking', stateAt: 1 }) },
      {
        id: 'b',
        pattern: pattern({
          kind: 'saidStruggling',
          handling: 'askOnly',
          stateAt: 2,
        }),
      },
      { id: 'c', pattern: pattern({ kind: 'tooManyGoals', stateAt: 3 }) },
      {
        id: 'd',
        pattern: pattern({
          kind: 'windowMissed',
          state: 'declined',
          nextEligibleOn: today + DAY,
        }),
      },
    ];
    const base = {
      patterns: candidates,
      suggestedCount: 0,
      isNewShownToday: false,
      today,
      isLearningOn: true,
    };
    assert.equal(pickTodayOffer(base), 'b');
    assert.equal(
      pickTodayOffer({ ...base, patterns: candidates.slice(2) }),
      'c',
    );
    assert.equal(pickTodayOffer({ ...base, suggestedCount: 3 }), null);
    assert.equal(pickTodayOffer({ ...base, isNewShownToday: true }), null);
    assert.equal(pickTodayOffer({ ...base, isLearningOn: false }), null);
  });

  await test('a nightly candidate needs 3 different days among real observations; care is ask-only', () => {
    const observation = (id: string, dayKey: string) => ({
      id,
      subject: { collection: 'habits', id: 'h1' },
      dayKey,
      at: ms(dayKey),
      tags: ['tired'],
      isCare: false,
    });
    const candidates = [
      {
        subject: { collection: 'habits' as const, id: 'h1' },
        observationIds: ['a', 'b', 'c'],
        tags: ['tired' as const],
        linkedTo: 'lateDay' as const,
        suggestion: 'smaller' as const,
      },
    ];
    const three = ['a', 'b', 'c'].map((id, at) =>
      observation(id, back(at + 1)),
    );
    const found = readSaidLinkCandidates({
      candidates,
      observations: three,
      isCareOf: () => false,
    });
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].effect, {
      kind: 'talkItThrough',
      start: 'smaller',
    });
    assert.equal(
      readSaidLinkCandidates({
        candidates,
        observations: three.slice(0, 2),
        isCareOf: () => false,
      }).length,
      0,
    );
    const sameDay = ['a', 'b', 'c'].map((id) => observation(id, back(1)));
    assert.equal(
      readSaidLinkCandidates({
        candidates,
        observations: sameDay,
        isCareOf: () => false,
      }).length,
      0,
    );
    const care = readSaidLinkCandidates({
      candidates,
      observations: three,
      isCareOf: () => true,
    });
    assert.equal(care[0].handling, 'askOnly');
    assert.deepEqual(care[0].effect, { kind: 'none' });
  });

  await test('the lines are templates with the name passed in', () => {
    const days = makeDays((key) => (isTuesday(key) ? null : 'done'));
    const [found] = detectWindowMissed(input(days));
    const lines = buildPatternLines({ finding: found, name: 'Evening pills' });
    assert.match(lines.statement, /Evening pills/);
    assert.match(lines.statement, /Tuesday evenings/);
    assert.doesNotMatch(
      `${lines.statement}${lines.evidenceLine}`,
      /Helm|Nomos/,
    );
  });

  await test('the daily check creates, refreshes, brings back or leaves a finding', () => {
    const evidence = (matched: number) => ({
      kind: 'occurrences' as const,
      from: 0,
      to: 1,
      matched,
      total: 10,
      dayKeys: [],
    });
    const finding = (matched: number) =>
      ({ signature: 'sig', evidence: evidence(matched) }) as never;
    const stored = (extra: Record<string, unknown>) =>
      ({
        state: 'candidate',
        offReason: null,
        nextEligibleOn: null,
        evidenceSince: 0,
        evidence: evidence(6),
        ...extra,
      }) as never;
    const move = (current: never, found: never, recheck = () => null) =>
      readPatternMove({ current, finding: found, recheck, today: ms(TODAY) })
        .kind;
    assert.equal(move(null as never, finding(6)), 'create');
    assert.equal(move(stored({}), finding(7)), 'refresh');
    assert.equal(move(stored({}), finding(6)), 'skip');
    assert.equal(move(stored({ state: 'accepted' }), finding(9)), 'skip');
    assert.equal(
      move(
        stored({ state: 'declined', nextEligibleOn: ms(TODAY) + DAY }),
        finding(9),
        () => finding(9) as never,
      ),
      'skip',
      'a declined pattern waits out its back-off',
    );
    assert.equal(
      move(
        stored({ state: 'declined', nextEligibleOn: ms(TODAY) - DAY }),
        finding(9),
        () => null as never,
      ),
      'skip',
      'no fresh evidence, no comeback',
    );
  });

  await test('a pattern cut to its signature is told from a live one', () => {
    const cut = { sourceKeys: [], reasons: [], evidence: CUT_EVIDENCE };
    assert.equal(isPatternCut(cut), true);
    assert.equal(isPatternCut({ ...cut, sourceKeys: ['a'] }), false);
    assert.equal(isPatternCut({ ...cut, reasons: ['r'] as never }), false);
  });
};

await run();
if (failures > 0) {
  console.error(`check:helm-patterns: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-patterns: ok');
