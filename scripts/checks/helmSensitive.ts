import assert from 'node:assert/strict';

import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import {
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import type { NoteFactCommand } from '../../functions/src/apps/helm/nomos/commands.ts';
import { planWrites } from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { shouldKeepSensitive } from '../../functions/src/apps/helm/nomos/sensitive.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);
const NOW = Date.UTC(2026, 10, 10, 18, 0);
const SELF = 'who-self';

const dana = {
  id: 'who-dana',
  kind: 'person' as const,
  name: 'Dana',
  aliases: [],
  lastMentionedAt: null,
  tier: 'regular' as const,
  tierSetBy: 'person' as const,
  mentionDayKeys: [],
  taskLinkCount: 0,
  hasRole: false,
};
const mention = {
  ref: '$w1',
  name: 'Dana',
  kind: 'person' as const,
  relation: null,
  species: null,
  organizationKind: null,
};

const fact = (extra: Partial<NoteFactCommand>): NoteFactCommand => ({
  statement: 'Has diabetes',
  quote: 'I have diabetes',
  isStated: true,
  whoRefs: [],
  placeRefs: [],
  kind: 'identity',
  topic: null,
  value: null,
  isSensitive: false,
  isAboutMe: true,
  ...extra,
});

const plan = (
  noteFacts: NoteFactCommand[],
  options: {
    text?: string;
    selfWhoId?: string | null;
    existing?: { topic: string; kind: 'preference' }[];
  } = {},
) =>
  planWrites({
    commands: [],
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: NOW + 1000,
    seal,
    newId: () => 'new-1',
    people: {
      mentions: [mention],
      places: [],
      known: [dana],
      knownPlaces: [],
      assistantName: 'Nomos',
      dayKey: '2026-11-10',
      capturedAt: NOW,
    },
    noteFacts,
    captureText: options.text ?? 'I have diabetes',
    existingFacts: (options.existing ?? []).map((entry, index) => ({
      id: `fact-${index}`,
      status: 'confirmed' as const,
      statement: `Existing ${index}`,
      subjectIds: [SELF],
      kind: entry.kind,
      topic: entry.topic,
    })),
    selfWhoId: options.selfWhoId === undefined ? SELF : options.selfWhoId,
  });

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

test('a sensitive fact the person states about themself is kept, under their own who', () => {
  const made = plan([fact({ isSensitive: true })]);
  assert.equal(made.factCreates.length, 1);
  assert.deepEqual(made.factCreates[0].data.subjectIds, [SELF]);
  assert.equal(made.factCreates[0].data.status, 'confirmed');
  assert.equal(made.factCreates[0].data.kind, 'identity');
  assert.equal(made.notKept.length, 0);
  assert.equal(
    made.effects[0].written['sealed.title'],
    'Fact · You · You said',
  );
});

test('a sensitive fact about someone else is dropped with its line, and nothing is written', () => {
  const made = plan(
    [
      fact({
        statement: 'Dana has diabetes',
        quote: 'Dana has diabetes',
        isSensitive: true,
        isAboutMe: false,
        whoRefs: ['$w1'],
      }),
    ],
    { text: 'Dana has diabetes' },
  );
  assert.equal(made.factCreates.length, 0);
  assert.equal(made.effects.length, 0);
  assert.deepEqual(made.notKept, [
    'Not kept · a private detail about someone else',
  ]);
});

test('a sensitive fact only inferred about the person is dropped with its line', () => {
  const made = plan([fact({ isSensitive: true, isStated: false })]);
  assert.equal(made.factCreates.length, 0);
  assert.deepEqual(made.notKept, [
    'Not kept · Nomos keeps private details only when you say them',
  ]);
});

test('a fact about someone else that is not sensitive is kept', () => {
  const made = plan(
    [
      fact({
        statement: 'Dana is the florist',
        quote: 'Dana is the florist',
        kind: 'world',
        isAboutMe: false,
        whoRefs: ['$w1'],
      }),
    ],
    { text: 'Dana is the florist' },
  );
  assert.equal(made.factCreates.length, 1);
  assert.equal(made.notKept.length, 0);
});

test('a fact about the person with no self who is dropped without a line', () => {
  const made = plan([fact({ isSensitive: false })], { selfWhoId: null });
  assert.equal(made.factCreates.length, 0);
  assert.equal(made.notKept.length, 0);
});

test('a preference the person states about themself, and its topic files under the one already used', () => {
  const made = plan(
    [
      fact({
        statement: 'Goes to Shell for gas',
        quote: 'I always go to Shell for gas',
        kind: 'preference',
        topic: 'gas stations',
        value: 'Shell',
        isAboutMe: true,
      }),
    ],
    {
      text: 'I always go to Shell for gas',
      existing: [{ topic: 'gas station', kind: 'preference' }],
    },
  );
  assert.equal(made.factCreates.length, 1);
  const data = made.factCreates[0].data;
  assert.deepEqual(data.subjectIds, [SELF]);
  const words = openForHelm(KEY, data.sealed as SealedPayload);
  assert.equal(words.topic, 'gas station');
  assert.equal(words.value, 'Shell');
});

test('an identity fact with no one named and not about the person is dropped without a line', () => {
  const made = plan([fact({ isAboutMe: false })]);
  assert.equal(made.factCreates.length, 0);
  assert.equal(made.notKept.length, 0);
});

test('an identity fact with sensitivity missing reads as sensitive; other kinds and an explicit false do not', () => {
  const read = (extra: Record<string, unknown>) =>
    normalizeNomosReply(
      {
        commands: [
          {
            kind: 'noteFact',
            statement: 'Is vegan',
            quote: 'I am vegan',
            isStated: true,
            whoRefs: [],
            placeRefs: [],
            isAboutMe: true,
            ...extra,
          },
        ],
      },
      {
        reading: {
          people: [],
          places: [],
          documents: [],
          commands: [],
          isUrgent: false,
          dates: [],
          addressedAs: null,
        },
        aliases: createAliasBook('t'),
      },
    ).noteFacts[0].isSensitive;
  assert.equal(read({ factKind: 'identity' }), true);
  assert.equal(read({ factKind: 'identity', isSensitive: null }), true);
  assert.equal(read({ factKind: 'identity', isSensitive: false }), false);
  assert.equal(read({ factKind: 'preference' }), false);
});

test('a new topic is written in lowercase', () => {
  const made = plan(
    [
      fact({
        statement: 'Likes oat milk',
        quote: 'I like oat milk',
        kind: 'preference',
        topic: 'Coffee Order',
        value: 'Oat milk',
      }),
    ],
    { text: 'I like oat milk' },
  );
  const words = openForHelm(
    KEY,
    made.factCreates[0].data.sealed as SealedPayload,
  );
  assert.equal(words.topic, 'coffee order');
});

test('shouldKeepSensitive keeps every fact that is not sensitive', () => {
  assert.equal(
    shouldKeepSensitive({
      isSensitive: false,
      provenance: 'nomosInferred',
      subjectWhoIds: ['who-dana'],
      selfWhoId: SELF,
    }),
    true,
  );
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    run();
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
