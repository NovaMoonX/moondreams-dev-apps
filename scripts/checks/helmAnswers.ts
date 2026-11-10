import assert from 'node:assert/strict';

import {
  createAliasBook,
  createSyncedBook,
} from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  buildAnswer,
  GENERAL_LABEL,
  HEALTH_CAUTION_SPOKEN,
  summarizeAnswer,
} from '../../functions/src/apps/helm/nomos/answerGuards.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type {
  AnswerCommand,
  CaptureReading,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { SPOKEN_MAX_CHARS } from '../../functions/src/apps/helm/nomos/spoken.ts';
import type { SyncedCopy } from '../../functions/src/apps/helm/syncedCopies.ts';

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const TASK = { kind: 'task', id: 'task-1' } as const;
const COPY: SyncedCopy = {
  id: 'synced-1',
  connectorId: 'app:pinch',
  kind: 'event',
  title: 'Cake tasting',
  subtitle: null,
  startAt: Date.UTC(2026, 10, 13, 19),
  endAt: null,
  dueAt: null,
  isAllDay: false,
  isEnded: false,
};

const answer = (fields: Partial<AnswerCommand> = {}): AnswerCommand => ({
  scope: 'yourThings',
  question: 'When is the cake tasting?',
  isHealth: false,
  fromRecordsText: 'Friday at 2.',
  sources: [TASK],
  generalText: null,
  generalSpoken: null,
  ...fields,
});

const tests: [string, () => void | Promise<void>][] = [
  [
    'records without a resolved source are dropped and logged',
    () => {
      const drops: string[] = [];
      const built = buildAnswer(answer({ sources: [] }), (code) =>
        drops.push(code),
      );
      assert.equal(built.answer.fromRecords, null);
      assert.deepEqual(built.answer.sources, []);
      assert.deepEqual(drops, ['answer-unsourced']);
      assert.equal(built.spoken, 'Nothing in your records answers that.');
    },
  ],
  [
    'a question about the person never keeps a general part',
    () => {
      const built = buildAnswer(
        answer({
          fromRecordsText: null,
          sources: [],
          generalText: 'Cake keeps a few days.',
        }),
      );
      assert.equal(built.answer.general, null);
      assert.equal(built.answer.fromRecords, null);
    },
  ],
  [
    'a world question with records drops the general part',
    () => {
      const built = buildAnswer(
        answer({ scope: 'theWorld', generalText: 'Cake keeps a few days.' }),
      );
      assert.equal(built.answer.general, null);
      assert.equal(built.answer.fromRecords, 'Friday at 2.');
      assert.ok(!built.spoken.includes(GENERAL_LABEL));
    },
  ],
  [
    'a world question with no records keeps the general part after the nothing line',
    () => {
      const built = buildAnswer(
        answer({
          scope: 'theWorld',
          question: 'How long does cake keep?',
          fromRecordsText: null,
          sources: [],
          generalText: 'Cake keeps a few days.',
          generalSpoken: 'Cake keeps a few days.',
        }),
      );
      assert.equal(built.answer.general, 'Cake keeps a few days.');
      assert.equal(
        built.spoken,
        `Nothing in your records answers that. ${GENERAL_LABEL} Cake keeps a few days.`,
      );
    },
  ],
  [
    'both keeps two parts, records first',
    () => {
      const built = buildAnswer(
        answer({
          scope: 'both',
          fromRecordsText: 'Maya said her parents offered.',
          generalText: 'Often the couple or their families share it.',
          generalSpoken: 'Often families share it.',
        }),
      );
      assert.equal(built.answer.fromRecords, 'Maya said her parents offered.');
      assert.equal(
        built.answer.general,
        'Often the couple or their families share it.',
      );
      assert.equal(
        built.spoken,
        `Maya said her parents offered. ${GENERAL_LABEL} Often families share it.`,
      );
      assert.equal(
        summarizeAnswer(built.answer),
        `Answered: ${answer().question}`,
      );
    },
  ],
  [
    'a general-only answer is summarised as general knowledge',
    () => {
      const built = buildAnswer(
        answer({
          scope: 'theWorld',
          fromRecordsText: null,
          sources: [],
          generalText: 'Cake keeps a few days.',
        }),
      );
      assert.equal(
        summarizeAnswer(built.answer),
        'Answered from general knowledge: When is the cake tasting?',
      );
    },
  ],
  [
    'health is carried and adds the fixed caution, never cut',
    () => {
      const built = buildAnswer(
        answer({
          scope: 'theWorld',
          question: 'Can I take ibuprofen with my medicine?',
          isHealth: true,
          fromRecordsText: null,
          sources: [],
          generalText: 'x'.repeat(300),
          generalSpoken: 'word '.repeat(60),
        }),
      );
      assert.equal(built.answer.isHealth, true);
      assert.ok(built.spoken.endsWith(HEALTH_CAUTION_SPOKEN));
      assert.ok(built.spoken.includes(GENERAL_LABEL));
      assert.ok(built.spoken.length <= SPOKEN_MAX_CHARS);
    },
  ],
  [
    'an answer with nothing in the records and no general part says so in its summary',
    () => {
      const built = buildAnswer(
        answer({ scope: 'yourThings', fromRecordsText: null, sources: [] }),
      );
      assert.equal(
        summarizeAnswer(built.answer),
        `No answer in your records: ${answer().question}`,
      );
    },
  ],
  [
    'the records part is spoken from the stored records text, never a separate model line',
    () => {
      const built = buildAnswer(answer({ fromRecordsText: 'Friday at 2.' }));
      assert.ok(built.spoken.startsWith('Friday at 2.'));
    },
  ],
  [
    'a connection is a source an answer can rest on',
    () => {
      const built = buildAnswer(
        answer({
          fromRecordsText: 'Google Calendar last updated at 9:30.',
          sources: [
            {
              kind: 'connection',
              connectorId: 'google:calendar',
              accountId: 'a1',
              name: 'Google Calendar',
              label: 'Work',
            },
            {
              kind: 'connection',
              connectorId: 'google:calendar',
              accountId: 'a1',
              name: 'Google Calendar',
              label: 'Work',
            },
          ],
        }),
      );
      assert.equal(
        built.answer.fromRecords,
        'Google Calendar last updated at 9:30.',
      );
      assert.equal(built.answer.sources.length, 1);
    },
  ],
  [
    'the spoken line stays within its cap and keeps the label',
    () => {
      const built = buildAnswer(
        answer({
          scope: 'both',
          fromRecordsText: 'a '.repeat(100),
          generalText: 'b',
          generalSpoken: 'general '.repeat(30),
        }),
      );
      assert.ok(built.spoken.length <= SPOKEN_MAX_CHARS);
      assert.ok(built.spoken.includes(GENERAL_LABEL));
    },
  ],
  [
    'the nothing line is the same whatever the question says',
    () => {
      ['Am I free Friday?', "I'm free Friday?", 'Dana?'].forEach((question) =>
        assert.equal(
          buildAnswer(answer({ question, fromRecordsText: null, sources: [] }))
            .spoken,
          'Nothing in your records answers that.',
        ),
      );
    },
  ],
  [
    "the stored shape has the later issues' fields empty",
    () => {
      const stored = buildAnswer(answer()).answer;
      assert.deepEqual(stored, {
        question: 'When is the cake tasting?',
        scope: 'yourThings',
        fromRecords: 'Friday at 2.',
        sources: [TASK],
        general: null,
        isHealth: false,
        generalDiffersFrom: null,
        suggestedTopicId: null,
        quotes: [],
        searched: [],
      });
    },
  ],
  [
    'aliases resolve to tasks, synced copies and connections, unknown ones are dropped, texts are cut',
    () => {
      const aliases = createAliasBook('t');
      const synced = createSyncedBook();
      const taskAlias = aliases.add('task-1');
      const copyAlias = synced.add(COPY);
      const connection = {
        connectorId: 'google:calendar',
        accountId: 'a1',
        name: 'Google Calendar',
        label: 'Work',
      };
      const connectionAlias = synced.addConnection(connection);
      const { answer: read, commands } = normalizeNomosReply(
        {
          commands: [
            {
              kind: 'answer',
              scope: 'both',
              question: 'q'.repeat(400),
              isHealth: null,
              fromRecordsText: 'w '.repeat(900),
              sourceAliases: [
                taskAlias,
                copyAlias,
                connectionAlias,
                'e99',
                'c9',
                'zz',
              ],
              generalText: null,
              generalSpoken: null,
            },
            { kind: 'answer', scope: 'theWorld', question: 'second?' },
          ],
        },
        { reading: READING, aliases, synced },
      );
      assert.deepEqual(commands, []);
      assert.ok(read);
      assert.ok(read.question.length <= 200);
      assert.ok((read.fromRecordsText ?? '').length <= 1200);
      assert.deepEqual(read.sources, [
        TASK,
        {
          kind: 'synced',
          id: 'synced-1',
          connectorId: 'app:pinch',
          title: 'Cake tasting',
          startAt: COPY.startAt,
        },
        { kind: 'connection', ...connection },
      ]);
    },
  ],
  [
    'an answer with a bad scope or no question is not kept',
    () => {
      const context = { reading: READING, aliases: createAliasBook('t') };
      assert.equal(
        normalizeNomosReply(
          { commands: [{ kind: 'answer', scope: 'nope', question: 'x?' }] },
          context,
        ).answer,
        null,
      );
      assert.equal(
        normalizeNomosReply(
          { commands: [{ kind: 'answer', scope: 'both', question: ' ' }] },
          context,
        ).answer,
        null,
      );
    },
  ],
  [
    'the context lists synced copies by alias with the source name and no id',
    () => {
      const { message, synced } = buildContext({
        text: 'When is the cake tasting?',
        reading: READING,
        createdAt: Date.UTC(2026, 10, 10, 12),
        timeZone: 'America/New_York',
        tasks: [],
        synced: [COPY],
      });
      assert.ok(message.includes('<synced_records>'));
      assert.ok(message.includes('"source":"Pinch"'));
      assert.ok(!message.includes('synced-1'));
      assert.equal(synced.get('e1')?.id, 'synced-1');
    },
  ],
  [
    'the emulator answers each kind of question through the guards',
    async () => {
      const ask = async (text: string, isCake = true) => {
        const context = buildContext({
          text,
          reading: READING,
          createdAt: Date.UTC(2026, 10, 10, 12),
          timeZone: 'UTC',
          tasks: isCake
            ? [
                {
                  id: 'task-1',
                  title: 'Cake tasting',
                  due: { kind: 'day', date: Date.UTC(2026, 10, 13) },
                },
              ]
            : [],
        });
        const loop = await createFixtureProvider(text, READING).runToolLoop({
          role: 'interpret',
          system: '',
          messages: [{ role: 'user', content: context.message }],
          terminalTool: {
            name: 'file_results',
            description: '',
            inputSchema: {},
          },
          limits: { maxTurns: 1, maxToolCalls: 1, maxMillis: 5_000 },
        } as never);
        const reply = normalizeNomosReply(loop.terminalInput, {
          reading: READING,
          aliases: context.aliases,
          synced: context.synced,
        });
        return { reply };
      };
      const found = await ask('When is the cake tasting?');
      assert.equal(found.reply.answer?.scope, 'yourThings');
      assert.equal(found.reply.answer?.generalText, null);
      assert.ok(found.reply.answer?.fromRecordsText?.includes('Cake tasting'));
      assert.equal(found.reply.answer?.sources.length, 1);
      const both = await ask('Who pays for the cake tasting?');
      assert.equal(both.reply.answer?.scope, 'both');
      assert.ok(both.reply.answer?.generalText);
      const none = await ask('When is the dentist?', false);
      assert.equal(none.reply.answer?.scope, 'yourThings');
      assert.equal(none.reply.answer?.fromRecordsText, null);
      const world = await ask('How long does cake keep?', false);
      assert.equal(world.reply.answer?.scope, 'theWorld');
      assert.ok(world.reply.answer?.generalText);
      const health = await ask('Can I take ibuprofen on an empty stomach?');
      assert.equal(health.reply.answer?.isHealth, true);
      assert.equal(health.reply.commands.length, 0);
    },
  ],
];

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
