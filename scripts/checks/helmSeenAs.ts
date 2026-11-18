// How the assistant sees the person: refusing, keeping and rebuilding lines, correcting and removing them, and what the model reads: `npm run check:helm-seen-as`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  buildContext,
  type ContextSeenAs,
} from '../../functions/src/apps/helm/nomos/buildContext.ts';
import { CLOSING_PHRASES } from '../../src/lib/speech/closingPhrase.ts';
import {
  DELETING_COMMANDS as SERVER_DELETING_COMMANDS,
  type CaptureReading,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planSeenAs,
  SEEN_AS_REMOVED_LINE,
} from '../../functions/src/apps/helm/nomos/planSeenAs.ts';
import {
  buildSeenAsBasis,
  cascadeShownLine,
  checkSeenAsCandidates,
  isRefusedLine,
  isSeenAsRebuildDue,
  normaliseClaim,
  orderSeenAsForModel,
  planSeenAsRebuild,
  SEEN_AS_FROM_YOU,
  SEEN_AS_LIMITS,
  type SeenAsCandidate,
  type SeenAsExisting,
} from '../../functions/src/apps/helm/nomos/seenAs.ts';
import {
  deriveSeedDataKey,
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import { toSeenAsRecord } from '../../functions/src/apps/helm/seenAsStore.ts';
import { readSeenAsForContext } from '../../functions/src/apps/helm/seenAsStore.ts';
import {
  buildReflectMessage,
  REFLECT_SYSTEM,
} from '../../functions/src/apps/helm/reflection/buildReflectRequest.ts';
import { normalizeReflection } from '../../functions/src/apps/helm/reflection/normalizeReflection.ts';
import {
  planSeeYou,
  toSeenAsId,
  type SeeYouWorld,
} from '../../functions/src/apps/helm/reflection/seeYou.ts';
import {
  planSeeYouIn,
  readSeeYouWorld,
  buildSeeYouBlocks,
} from '../../functions/src/apps/helm/reflection/seeYou.ts';
import type { ReflectWindow } from '../../functions/src/apps/helm/reflection/readReflectWindow.ts';
import { DELETING_COMMANDS } from '../../src/apps/helm/constants.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

const NOW = Date.UTC(2026, 10, 14, 17, 0);
const DAY = 86_400_000;
const UID = 'seen-as-user';
const key = { ...deriveSeedDataKey(DEV_KEYRING, UID), keyVersion: 1 };

const candidate = (
  overrides: Partial<SeenAsCandidate> & { line?: string } = {},
): SeenAsCandidate => {
  const kind = overrides.kind ?? 'whatWorks';
  const line = overrides.line ?? 'You get piano done on mornings';
  return {
    id: toSeenAsId(kind, line),
    kind,
    line,
    sourceKeys: ['observations/a', 'observations/b'],
    subjectRefs: ['habits/piano'],
    isAboutHealth: false,
    newestSourceAt: NOW,
    ...overrides,
  };
};

const existing = (
  overrides: Partial<SeenAsExisting> & { id: string },
): SeenAsExisting => ({
  kind: 'whatWorks',
  state: 'shown',
  sourceKeys: ['observations/a', 'observations/b'],
  subjectRefs: ['habits/piano'],
  dontDrawFrom: [],
  correctedAt: null,
  removedAt: null,
  ...overrides,
});

const reasonOf = (
  candidates: SeenAsCandidate[],
  others: SeenAsExisting[] = [],
) => checkSeenAsCandidates(candidates, others).refused.map((r) => r.reason);

test('a line resting on fewer than two different sources is refused', () => {
  assert.deepEqual(reasonOf([candidate({ sourceKeys: ['observations/a'] })]), [
    'fewSources',
  ]);
  assert.deepEqual(reasonOf([candidate({ sourceKeys: [] })]), ['fewSources']);
  assert.deepEqual(
    reasonOf([candidate({ sourceKeys: ['observations/a', 'observations/a'] })]),
    ['fewSources'],
  );
  assert.equal(reasonOf([candidate()]).length, 0);
});

test('a line about the body, a diagnosis or a motive is refused', () => {
  [
    'You get dizzy after your meds',
    'You seem anxious on Mondays',
    'You avoid the gym because you fear it',
    'Deep down you want less to do',
    'You are secretly lazy about practice',
  ].forEach((line) =>
    assert.deepEqual(reasonOf([candidate({ line })]), ['health'], line),
  );
  assert.deepEqual(
    reasonOf([
      candidate({ line: 'You are steadier mid week', isAboutHealth: true }),
    ]),
    ['health'],
  );
  assert.ok(isRefusedLine('Your weight goal slips', false));
  assert.ok(!isRefusedLine('You get piano done on mornings', false));
});

test('a removed line never comes back, even stripped past the cap', () => {
  const line = candidate();
  const removed = existing({
    id: line.id,
    state: 'removed',
    dontDrawFrom: line.sourceKeys,
    removedAt: NOW - DAY,
  });
  assert.deepEqual(reasonOf([line], [removed]), ['removed']);
  const stripped = { ...removed, sourceKeys: [], dontDrawFrom: [] };
  assert.deepEqual(reasonOf([line], [stripped]), ['removed']);
  const many = Array.from({ length: SEEN_AS_LIMITS.records + 5 }, (_, index) =>
    existing({
      id: `sa_old${index}`,
      state: 'removed',
      kind: 'rhythm',
      sourceKeys: [`observations/x${index}`],
      dontDrawFrom: [`observations/x${index}`],
      removedAt: NOW - index * 1000,
    }),
  );
  const plan = planSeenAsRebuild(
    [],
    [{ ...removed, removedAt: NOW + 1000 }, ...many],
    () => true,
  );
  assert.equal(plan.strip.length, 6);
  assert.ok(!plan.strip.includes(removed.id));
});

test("a new line of the same kind drawn from a removal's sources is refused", () => {
  const removed = existing({
    id: 'sa_gone',
    state: 'removed',
    dontDrawFrom: ['observations/a', 'observations/z'],
    sourceKeys: ['observations/a', 'observations/z'],
  });
  const other = candidate({
    line: 'Mornings suit your practice',
    sourceKeys: ['observations/a', 'observations/c'],
  });
  assert.deepEqual(reasonOf([other], [removed]), ['dontDraw']);
  assert.equal(
    reasonOf(
      [{ ...other, kind: 'rhythm', id: toSeenAsId('rhythm', other.line) }],
      [removed],
    ).length,
    0,
  );
});

test('a correction survives a rebuild', () => {
  const corrected = existing({
    id: candidate().id,
    state: 'corrected',
    correctedAt: NOW - DAY,
  });
  assert.deepEqual(reasonOf([candidate()], [corrected]), ['corrected']);
  const sameSubject = candidate({
    line: 'Piano happens before breakfast',
    newestSourceAt: NOW - 2 * DAY,
  });
  assert.deepEqual(reasonOf([sameSubject], [corrected]), [
    'contradictsCorrection',
  ]);
  assert.equal(
    reasonOf([{ ...sameSubject, newestSourceAt: NOW }], [corrected]).length,
    0,
  );
  assert.equal(
    reasonOf(
      [
        {
          ...sameSubject,
          subjectRefs: ['habits/other'],
          newestSourceAt: NOW - 2 * DAY,
        },
      ],
      [corrected],
    ).length,
    0,
  );
  const plan = planSeenAsRebuild([], [corrected], () => true);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.strip, []);
});

test('the cascade: a corrected line keeps its words, a shown one goes under two', () => {
  assert.equal(
    cascadeShownLine(['observations/a', 'observations/b'], 'observations/a'),
    null,
  );
  assert.deepEqual(
    cascadeShownLine(
      ['observations/a', 'observations/b', 'habits/h'],
      'habits/h',
    ),
    ['observations/a', 'observations/b'],
  );
  const corrected = existing({
    id: 'sa_c',
    state: 'corrected',
    correctedAt: NOW,
    sourceKeys: ['observations/a', 'observations/b', 'observations/c'],
  });
  const plan = planSeenAsRebuild(
    [],
    [corrected],
    (source) => source === 'observations/a',
  );
  assert.deepEqual(plan.recite, [
    { id: 'sa_c', sourceKeys: ['observations/a'], basis: SEEN_AS_FROM_YOU },
  ]);
  const some = planSeenAsRebuild(
    [],
    [corrected],
    (source) => source !== 'observations/c',
  );
  assert.equal(
    some.recite[0].basis,
    buildSeenAsBasis(['observations/a', 'observations/b']),
  );
});

test('a rebuild removes shown lines it no longer derives and keeps the rest', () => {
  const keep = candidate();
  const shownGone = existing({ id: 'sa_old', state: 'shown' });
  const shownKept = existing({ id: keep.id, state: 'shown' });
  const plan = planSeenAsRebuild([keep], [shownGone, shownKept], () => true);
  assert.deepEqual(plan.remove, ['sa_old']);
  assert.deepEqual(
    plan.write.map((line) => line.id),
    [keep.id],
  );
});

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const normalize = (
  commands: unknown[],
  text: string,
  line = 'You get piano done on mornings',
  other: string | null = null,
) => {
  const seenAs = createAliasBook('sy');
  const alias = seenAs.add('sa_line');
  if (other !== null) seenAs.add('sa_other');
  const reply = normalizeNomosReply(
    {
      commands: commands.map((command) => ({
        ...(command as Record<string, unknown>),
        seenAsAlias: (command as { seenAsAlias?: string }).seenAsAlias ?? alias,
      })),
    },
    {
      reading: READING,
      aliases: createAliasBook('t'),
      seenAs,
      seenAsWords: new Map([
        ['sa_line', line],
        ...(other === null ? [] : [['sa_other', other] as [string, string]]),
      ]),
      captureText: text,
    },
  );
  return reply;
};

const removal = (
  text: string,
  line?: string,
  quote = text,
  other: string | null = null,
) =>
  normalize([{ kind: 'removeSeenAs', requestQuote: quote }], text, line, other)
    .seenAsCommands;

test('removeSeenAs is kept only when the words still name the line', () => {
  assert.equal(removal('ugh, forget it').length, 0);
  assert.equal(removal('forget it').length, 0);
  assert.equal(removal('never mind, doesn’t matter').length, 0);
  assert.equal(removal('remove that').length, 0);
  assert.equal(removal('forget about the dentist').length, 0);
  assert.equal(
    removal('forget it, stop saying I do piano on mornings').length,
    1,
  );
  assert.equal(removal('remove the one about piano').length, 1);
  assert.equal(
    removal(
      'remove the one about piano',
      undefined,
      undefined,
      'Piano has felt hard on weeknights',
    ).length,
    0,
  );
  assert.equal(
    removal('so I was thinking you could maybe take out the piano thing for me')
      .length,
    0,
  );
  assert.equal(
    removal(
      "stop saying I'm a morning person",
      'You do your best work in the mornings',
    ).length,
    1,
  );
  assert.equal(removal('remove the one about piano mornings').length, 1);
  [...CLOSING_PHRASES.dismiss, ...CLOSING_PHRASES.finish].forEach((phrase) =>
    assert.equal(removal(phrase).length, 0, phrase),
  );
  assert.equal(
    normalize([{ kind: 'removeSeenAs', seenAsAlias: 'sy99' }], 'remove piano')
      .seenAsDropped[0],
    'seenAs-unknown',
  );
  assert.ok(SERVER_DELETING_COMMANDS.includes('removeSeenAs'));
  assert.deepEqual([...DELETING_COMMANDS], [...SERVER_DELETING_COMMANDS]);
});

test('a removal needs its own quoted words to name the line, not the whole capture', () => {
  const line = "You get piano done on mornings you've slept well";
  assert.equal(removal('that went well, thanks', line).length, 0);
  assert.equal(removal('forget it', line).length, 0);
  assert.equal(removal('remove the line about piano mornings', line).length, 1);
  assert.equal(
    removal('piano mornings are fine, thanks', line, 'thanks').length,
    0,
  );
  assert.equal(removal('remove it', line, 'something not said').length, 0);
  assert.equal(removal('stop the one about gardening', 'You garden').length, 1);
  assert.equal(removal('stop the one about cooking', 'You garden').length, 0);
  assert.equal(removal('stop saying gardening', 'Gardening').length, 1);
});

test('correctSeenAs keeps only the words the person said', () => {
  const said = 'that is not right, I practise in the evenings now';
  const kept = normalize(
    [{ kind: 'correctSeenAs', seenAsWords: 'I practise in the evenings now' }],
    said,
  ).seenAsCommands;
  assert.deepEqual(kept, [
    {
      kind: 'correctSeenAs',
      lineId: 'sa_line',
      words: 'I practise in the evenings now',
    },
  ]);
  assert.equal(
    normalize(
      [{ kind: 'correctSeenAs', seenAsWords: 'Practises at night' }],
      said,
    ).seenAsCommands.length,
    0,
  );
});

const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);

const shownRecord = (overrides: Record<string, unknown> = {}) => {
  const data = {
    kind: 'whatWorks',
    state: 'shown',
    sourceKeys: ['observations/a', 'observations/b'],
    subjectRefs: ['habits/piano'],
    writtenBy: 'reflection',
    dontDrawFrom: [],
    derivedAt: NOW - 3 * DAY,
    correctedAt: null,
    removedAt: null,
    privacy: 'ordinary',
    createdAt: NOW - 3 * DAY,
    sealed: seal({
      line: 'You get piano done on mornings',
      basis: 'From 2 things you said',
      corrected: null,
    }),
    ...overrides,
  };
  const id = 'sa_line';
  const record = toSeenAsRecord(key, id, data);
  assert.ok(record);
  return { id, data, record };
};

const apply = (
  data: Record<string, unknown>,
  fields: Record<string, unknown>,
) => {
  const opened = openForHelm(key, data.sealed as never);
  const plain = Object.fromEntries(
    Object.entries(fields).filter(([name]) => !name.startsWith('sealed.')),
  );
  const sealedChanges = Object.fromEntries(
    Object.entries(fields)
      .filter(([name]) => name.startsWith('sealed.'))
      .map(([name, value]) => [name.slice('sealed.'.length), value]),
  );
  return {
    plain: { ...data, ...plain, sealed: undefined } as Record<string, unknown>,
    opened: { ...opened, ...sealedChanges },
  };
};

test('correct and remove write what the contract says, and Undo restores the record', () => {
  const { id, data, record } = shownRecord();
  const correct = planSeenAs({
    commands: [
      {
        kind: 'correctSeenAs',
        lineId: id,
        words: 'I practise in the evenings',
      },
    ],
    records: new Map([[id, record]]),
    now: NOW,
    seal,
    room: 10,
  });
  const fix = correct.updates[0].data;
  assert.equal(fix.state, 'corrected');
  assert.equal(fix.correctedAt, NOW);
  assert.equal(fix.writtenBy, 'person');
  assert.equal(fix.privacy, 'ordinary');
  assert.equal(
    openForHelm(key, fix.sealed as never).corrected,
    'I practise in the evenings',
  );
  assert.deepEqual(correct.lines, ['Changed it: I practise in the evenings']);
  const undoneCorrect = apply(
    { ...data, ...fix, sealed: fix.sealed },
    correct.effects[0].previous ?? {},
  );
  assert.equal(undoneCorrect.plain.state, 'shown');
  assert.equal(undoneCorrect.plain.correctedAt, null);
  assert.equal(undoneCorrect.plain.writtenBy, 'reflection');
  assert.equal(undoneCorrect.plain.privacy, 'ordinary');
  assert.equal(undoneCorrect.opened.corrected, null);
  assert.equal(undoneCorrect.opened.line, 'You get piano done on mornings');

  const removeOne = planSeenAs({
    commands: [{ kind: 'removeSeenAs', lineId: id }],
    records: new Map([[id, record]]),
    now: NOW,
    seal,
    room: 10,
  });
  const gone = removeOne.updates[0].data;
  assert.equal(gone.state, 'removed');
  assert.equal(gone.removedAt, NOW);
  assert.deepEqual(gone.dontDrawFrom, ['observations/a', 'observations/b']);
  assert.equal(
    openForHelm(key, gone.sealed as never).line,
    normaliseClaim('You get piano done on mornings'),
  );
  assert.deepEqual(removeOne.lines, [SEEN_AS_REMOVED_LINE]);
  const undoneRemove = apply(
    { ...data, ...gone, sealed: gone.sealed },
    removeOne.effects[0].previous ?? {},
  );
  assert.equal(undoneRemove.plain.state, 'shown');
  assert.equal(undoneRemove.plain.removedAt, null);
  assert.deepEqual(undoneRemove.plain.dontDrawFrom, []);
  assert.equal(undoneRemove.opened.line, 'You get piano done on mornings');
  assert.equal(removeOne.effectRefs[0].collection, 'seenAs');
});

test('a removed or missing line is not changed again', () => {
  const removed = shownRecord({ state: 'removed', removedAt: NOW });
  const plan = planSeenAs({
    commands: [
      { kind: 'removeSeenAs', lineId: removed.id },
      { kind: 'correctSeenAs', lineId: 'sa_missing', words: 'x' },
    ],
    records: new Map([[removed.id, removed.record]]),
    now: NOW,
    seal,
    room: 10,
  });
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.notKept.length, 2);
});

test('<how_you_seem> orders corrected first, never shows removed and stops at 20', async () => {
  const docs = [
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `sa_s${index}`,
      data: {
        ...shownRecord().data,
        derivedAt: NOW - index * 1000,
        createdAt: NOW - index * 1000,
        sealed: seal({ line: `Shown ${index}`, basis: 'b', corrected: null }),
      },
    })),
    {
      id: 'sa_c',
      data: {
        ...shownRecord().data,
        state: 'corrected',
        correctedAt: NOW - DAY,
        sealed: seal({ line: 'Old words', basis: 'b', corrected: 'Mine' }),
      },
    },
    {
      id: 'sa_p',
      data: {
        ...shownRecord().data,
        privacy: 'private',
        derivedAt: NOW + 1000,
        createdAt: NOW + 1000,
        sealed: seal({ line: 'Private one', basis: 'b', corrected: null }),
      },
    },
    {
      id: 'sa_r',
      data: {
        ...shownRecord().data,
        state: 'removed',
        sealed: seal({ line: 'removed one', basis: 'b', corrected: null }),
      },
    },
  ];
  const firestore = {
    collection: () => ({
      where: (_field: string, _op: string, states: string[]) => ({
        limit: () => ({
          get: async () => ({
            docs: docs
              .filter((doc) => states.includes(String(doc.data.state)))
              .map((doc) => ({ id: doc.id, data: () => doc.data })),
          }),
        }),
      }),
    }),
  };
  const read = (isMasked: boolean) =>
    readSeenAsForContext(firestore as never, 'apps/helm/users/u', key, {
      forgottenAt: null,
      isMasked,
    });
  const lines = await read(false);
  assert.equal(lines.length, SEEN_AS_LIMITS.toModel);
  assert.equal(lines[0].text, 'Mine');
  assert.ok(lines[0].isCorrected);
  assert.equal(lines[1].text, 'Private one');
  assert.ok(lines.every((line) => line.text !== 'removed one'));
  const unattended = await read(true);
  assert.ok(unattended.every((line) => line.text !== 'Private one'));
  assert.equal(unattended[0].text, 'Mine');
  assert.deepEqual(
    orderSeenAsForModel([
      { state: 'shown' as const, at: 5 },
      { state: 'removed' as const, at: 9 },
      { state: 'corrected' as const, at: 1 },
    ]).map((line) => line.state),
    ['corrected', 'shown'],
  );

  const context = buildContext({
    text: 'hello',
    reading: READING,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    synced: [],
    seenAs: lines as ContextSeenAs[],
  } as never);
  const block = /<how_you_seem>(.*)<\/how_you_seem>/.exec(context.message);
  assert.ok(block);
  const shown = JSON.parse(block[1]) as {
    alias: string;
    text: string;
    from?: string;
  }[];
  assert.equal(shown[0].from, 'the person says');
  assert.equal(shown[0].text, 'Mine');
  assert.equal(shown[1].from, undefined);
  assert.equal(context.seenAs.idOf(shown[0].alias), 'sa_c');
  assert.ok(!context.message.includes('sa_c'));
});

const window = (): ReflectWindow => ({
  from: '2026-11-01',
  observations: ['a', 'b', 'c'].map((id, index) => ({
    id,
    subject: { collection: 'projects', id: 'goal1' },
    dayKey: `2026-11-0${index + 1}`,
    at: NOW - (3 - index) * DAY,
    sourceKeys: [],
    isCare: false,
    privacy: 'ordinary' as const,
    kind: 'feeling',
    tags: [],
    quote: null,
  })),
  habits: new Map(),
  goals: new Map([
    [
      'goal1',
      { id: 'goal1', name: 'Piano', kind: 'goal', isPrivate: false, why: null },
    ],
  ]),
  notes: [],
  whoNames: ['Dana'],
});

const alias = (prefix: string, id: string) =>
  `${prefix}${createHash('sha256').update(`${UID}|${prefix}|${id}`).digest('hex').slice(0, 8)}`;

const world = (overrides: Partial<SeeYouWorld> = {}): SeeYouWorld => ({
  patterns: [],
  style: [],
  styleRefs: new Set(),
  existing: [],
  ...overrides,
});

test('the nightly derivation drops unresolved sources, health lines and names', () => {
  const result = planSeeYou({
    uid: UID,
    now: NOW,
    key,
    window: window(),
    world: world(),
    lines: [
      {
        kind: 'whatWorks',
        line: 'You keep going when Dana joins',
        sources: [alias('o', 'a'), alias('o', 'b'), 'oNOTREAL'],
        about: [alias('g', 'goal1')],
        isAboutHealth: false,
      },
      {
        kind: 'rhythm',
        line: 'You like mornings',
        sources: [alias('o', 'a'), 'oNOTREAL'],
        about: [],
        isAboutHealth: false,
      },
      {
        kind: 'tendency',
        line: 'You tire out midweek',
        sources: [alias('o', 'a'), alias('o', 'b')],
        about: [],
        isAboutHealth: true,
      },
    ],
    isSourceLive: () => true,
  });
  assert.equal(result.creates.length, 1);
  const [made] = result.creates;
  const words = openForHelm(key, made.data.sealed as never);
  assert.equal(words.line, 'You keep going when someone joins');
  assert.equal(words.basis, 'From 2 things you said');
  assert.equal(words.corrected, null);
  assert.deepEqual(made.data.sourceKeys, ['observations/a', 'observations/b']);
  assert.deepEqual(made.data.subjectRefs, ['projects/goal1']);
  assert.equal(made.data.writtenBy, 'reflection');
  assert.equal(made.data.state, 'shown');
  assert.match(made.id, /^sa_[0-9a-f]{24}$/);
  assert.equal(result.counts.refused, 2);
});

test('the nightly derivation never rewrites a correction or brings back a removal', () => {
  const line = 'You keep going when it is shared';
  const id = toSeenAsId('whatWorks', line);
  const sources = [alias('o', 'a'), alias('o', 'b')];
  const base = {
    uid: UID,
    now: NOW,
    key,
    window: window(),
    lines: [
      {
        kind: 'whatWorks' as const,
        line,
        sources,
        about: [alias('g', 'goal1')],
        isAboutHealth: false,
      },
    ],
    isSourceLive: () => true,
  };
  const corrected = shownRecord({
    state: 'corrected',
    correctedAt: NOW - DAY,
    sealed: seal({ line, basis: 'b', corrected: 'Mine' }),
  }).record;
  const keptCorrection = planSeeYou({
    ...base,
    world: world({ existing: [{ ...corrected, id }] }),
  });
  assert.equal(keptCorrection.creates.length, 0);
  assert.deepEqual(keptCorrection.deletes, []);
  const removed = shownRecord({
    state: 'removed',
    removedAt: NOW - DAY,
  }).record;
  const keptRemoval = planSeeYou({
    ...base,
    world: world({ existing: [{ ...removed, id }] }),
  });
  assert.equal(keptRemoval.creates.length, 0);
  const stale = planSeeYou({
    ...base,
    lines: [],
    world: world({ existing: [{ ...shownRecord().record, id: 'sa_stale' }] }),
  });
  assert.deepEqual(stale.deletes, ['sa_stale']);
});

test('a source that is gone cuts a corrected line back and reseals its basis', () => {
  const { record } = shownRecord({
    state: 'corrected',
    correctedAt: NOW - DAY,
    sealed: seal({
      line: 'Old',
      basis: 'From 2 things you said',
      corrected: 'Mine',
    }),
  });
  const plan = planSeeYou({
    uid: UID,
    now: NOW,
    key,
    window: window(),
    world: world({ existing: [record] }),
    lines: [],
    isSourceLive: (source) => source === 'observations/a',
  });
  assert.equal(plan.updates.length, 1);
  const words = openForHelm(key, plan.updates[0].data.sealed as never);
  assert.equal(words.basis, SEEN_AS_FROM_YOU);
  assert.equal(words.corrected, 'Mine');
  assert.equal(words.line, 'Old');
});

test('a night asks for the lines only when a rebuild is due, and says what the person says', () => {
  assert.ok(isSeenAsRebuildDue(null, 0, NOW));
  assert.ok(!isSeenAsRebuildDue(NOW - DAY, 2, NOW));
  assert.ok(isSeenAsRebuildDue(NOW - DAY, 3, NOW));
  assert.ok(isSeenAsRebuildDue(NOW - 7 * DAY, 0, NOW));
  assert.equal(normalizeReflection({ candidates: [] }).seeYou, null);
  assert.deepEqual(normalizeReflection({ seeYou: [] }).seeYou, []);
  assert.equal(
    normalizeReflection({
      seeYou: Array.from({ length: 12 }, () => ({
        kind: 'rhythm',
        line: 'A line',
        sources: ['o1'],
        about: [],
        isAboutHealth: false,
      })),
    }).seeYou?.length,
    SEEN_AS_LIMITS.returned,
  );
  const corrected = shownRecord({
    state: 'corrected',
    subjectRefs: ['projects/goal1'],
    sealed: seal({ line: 'Old', basis: 'b', corrected: 'I practise evenings' }),
  }).record;
  const message = buildReflectMessage({
    uid: UID,
    dayKey: '2026-11-14',
    window: window(),
    patterns: [],
    seeYou: world({
      existing: [corrected],
      patterns: [
        {
          id: 'pt_private',
          kind: 'saidWorking',
          subject: { collection: 'projects', id: 'goal1' },
          state: 'accepted',
          statement: null,
          isPrivate: true,
          at: NOW,
        },
        {
          id: 'pt_open',
          kind: 'saidLink',
          subject: { collection: 'projects', id: 'goal1' },
          state: 'suggested',
          statement: 'Piano slips when Dana visits',
          isPrivate: false,
          at: NOW,
        },
      ],
    }),
  });
  assert.ok(message);
  assert.match(message, /<the_person_says>.*I practise evenings/);
  assert.match(message, /Piano slips when someone visits/);
  assert.ok(!message.includes('Dana'));
  assert.ok(!message.includes('pt_open') && !message.includes('goal1'));
  const without = buildReflectMessage({
    uid: UID,
    dayKey: '2026-11-14',
    window: window(),
    patterns: [],
  });
  assert.ok(without && !without.includes('<the_person_says>'));
  assert.ok(!REFLECT_SYSTEM.includes('seeYou'));
});

test('a correction in refused words is stored private and never reaches the model on its own', async () => {
  const { id, data, record } = shownRecord();
  const plan = planSeenAs({
    commands: [
      {
        kind: 'correctSeenAs',
        lineId: id,
        words: 'my meds make me groggy in the morning',
      },
    ],
    records: new Map([[id, record]]),
    now: NOW,
    seal,
    room: 10,
  });
  const fix = plan.updates[0].data;
  assert.equal(fix.privacy, 'private');
  assert.ok(plan.isPrivate);
  assert.equal(plan.effects[0].written.privacy, 'private');
  assert.equal(plan.effects[0].previous?.privacy, 'ordinary');
  const stored = { ...data, ...fix };
  const privateRecord = toSeenAsRecord(key, id, stored);
  assert.ok(privateRecord);
  const blocks = buildSeeYouBlocks(
    UID,
    window(),
    world({ existing: [privateRecord] }),
  ).join('');
  assert.match(blocks, /<the_person_says>\[\]<\/the_person_says>/);
  assert.ok(!blocks.includes('groggy'));
  const firestore = {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({
            docs: [{ id, data: () => stored }],
          }),
        }),
      }),
    }),
  };
  const read = (isMasked: boolean) =>
    readSeenAsForContext(firestore as never, 'apps/helm/users/u', key, {
      forgottenAt: null,
      isMasked,
    });
  assert.equal((await read(false)).length, 1);
  const masked = await read(true);
  assert.equal(masked.length, 0);
  const context = buildContext({
    text: 'hello',
    reading: READING,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
    synced: [],
    seenAs: masked as ContextSeenAs[],
  } as never);
  assert.ok(!context.message.includes('groggy'));
});

test('a correction guard also holds for lines about no one in particular', () => {
  const corrected = existing({
    id: 'sa_c',
    state: 'corrected',
    subjectRefs: [],
    correctedAt: NOW,
  });
  assert.deepEqual(
    reasonOf(
      [candidate({ subjectRefs: [], newestSourceAt: NOW - DAY })],
      [corrected],
    ),
    ['contradictsCorrection'],
  );
  assert.deepEqual(
    reasonOf(
      [candidate({ subjectRefs: [], newestSourceAt: NOW + DAY })],
      [corrected],
    ),
    [],
  );
  assert.deepEqual(
    reasonOf(
      [candidate({ subjectRefs: ['habits/piano'], newestSourceAt: NOW - DAY })],
      [corrected],
    ),
    [],
  );
});

const queryOf = (docs: Record<string, unknown>[]) => ({
  where: () => queryOf(docs),
  limit: () => queryOf(docs),
  docs,
});

test('Forget leaves out the lines made before it, so a re-derived line is new', async () => {
  const stamp = (id: string, createdAt: number) => ({
    id,
    ...shownRecord({ createdAt }).data,
  });
  const docs: Record<string, Record<string, unknown>[]> = {
    patterns: [],
    style: [],
    seenAs: [stamp('sa_old', NOW - 5 * DAY), stamp('sa_new', NOW - DAY)],
  };
  const firestore = {
    collection: (path: string) =>
      queryOf(docs[path.split('/').pop() ?? ''] ?? []),
  };
  const result = await readSeeYouWorld(
    async (query) => {
      const { docs: found } = query as unknown as {
        docs: Record<string, unknown>[];
      };
      return {
        docs: found.map(({ id, ...data }) => ({
          id,
          data: () => data,
          get: (field: string) => data[field],
        })),
      } as never;
    },
    firestore as never,
    UID,
    key,
    NOW - 2 * DAY,
  );
  assert.deepEqual(
    result.existing.map((line) => line.id),
    ['sa_new'],
  );
});

test('a rebuild whose lines all fail the checks never clears the lines already shown', () => {
  const stale = world({
    existing: [{ ...shownRecord().record, id: 'sa_stale' }],
  });
  const base = {
    uid: UID,
    now: NOW,
    key,
    window: window(),
    world: stale,
    isSourceLive: () => true,
  };
  assert.deepEqual(planSeeYou({ ...base, lines: [] }).deletes, ['sa_stale']);
  assert.deepEqual(
    planSeeYou({
      ...base,
      lines: [
        {
          kind: 'rhythm',
          line: 'You like mornings',
          sources: [alias('o', 'a')],
          about: [],
          isAboutHealth: false,
        },
      ],
    }).deletes,
    [],
  );
});

test('a line removed or corrected since the read is never created again', async () => {
  const line = 'You keep going when it is shared';
  const id = toSeenAsId('whatWorks', line);
  const stored = {
    exists: true,
    id,
    get: (field: string) => (field === 'state' ? 'removed' : undefined),
  };
  const seen: string[] = [];
  const transaction = {
    get: async () => ({ docs: [] }),
    getAll: async (...refs: { path: string }[]) => {
      seen.push(...refs.map((ref) => ref.path));
      return refs.map((ref) =>
        ref.path.endsWith(`/seenAs/${id}`)
          ? stored
          : { exists: false, id: ref.path, get: () => undefined },
      );
    },
  };
  const firestore = {
    collection: () => queryOf([]),
    doc: (path: string) => ({ path }),
  };
  const plan = await planSeeYouIn(transaction as never, firestore as never, {
    uid: UID,
    now: NOW,
    key,
    window: window(),
    forgottenAt: null,
    lines: [
      {
        kind: 'whatWorks',
        line,
        sources: [alias('o', 'a'), alias('o', 'b')],
        about: [alias('g', 'goal1')],
        isAboutHealth: false,
      },
    ],
  });
  assert.ok(seen.some((path) => path.endsWith(`/seenAs/${id}`)));
  assert.equal(plan.creates.length, 0);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}\n`, error);
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
