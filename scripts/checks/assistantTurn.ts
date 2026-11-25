import assert from 'node:assert/strict';

import { createSentenceFeed } from '../../src/lib/speech/assistant/sentenceFeed.ts';
import {
  streamAssistantTurn,
  type AssistantTurnEvent,
} from '../../src/lib/speech/assistant/streamAssistantTurn.ts';
import {
  streamTurn,
  type TurnEvent,
} from '../../functions/src/assistant/streamTurn.ts';
import { readPepperBody } from '../../functions/src/apps/pinch/pepper/pepperTurn.ts';
import { PEPPER_TOOLS } from '../../functions/src/apps/pinch/pepper/pepperPrompt.ts';

const feedLines = (chunks: string[]) => {
  const lines: string[] = [];
  const feed = createSentenceFeed((line) => lines.push(line));
  chunks.forEach((chunk) => feed.push(chunk));
  feed.flush();
  return lines;
};

// The first sentence goes as soon as it ends, however short; a decimal never ends one; later short ones are joined.
assert.deepEqual(
  feedLines([
    'Let me ',
    'check. The safe',
    ' temperature is 165°F. ',
    'Rest it 3.5 min. Then slice. Enjoy',
  ]),
  [
    'Let me check.',
    'The safe temperature is 165°F. Rest it 3.5 min. Then slice.',
    'Enjoy',
  ],
);
assert.deepEqual(feedLines(['Yes.']), ['Yes.']);
assert.deepEqual(feedLines(['']), []);

type FakeRound = { events: unknown[]; message: Record<string, unknown> };

const usage = (overrides: Record<string, unknown> = {}) => ({
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 100,
  cache_creation_input_tokens: 0,
  ...overrides,
});

const fakeClient = (rounds: FakeRound[], seen: unknown[]) =>
  ({
    beta: {
      messages: {
        stream: (params: unknown) => {
          seen.push(structuredClone(params));
          const round = rounds.shift();
          if (!round) throw new Error('no more rounds');
          return {
            async *[Symbol.asyncIterator]() {
              yield* round.events;
            },
            finalMessage: async () => round.message,
          };
        },
      },
    },
  }) as never;

const textDelta = (text: string) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});

// A device tool is sent to the device, answered as done, and the model confirms it in the same turn.
{
  const seen: unknown[] = [];
  const events: TurnEvent[] = [];
  const done = await streamTurn({
    client: fakeClient(
      [
        {
          events: [textDelta('Sure.')],
          message: {
            stop_reason: 'tool_use',
            usage: usage(),
            content: [
              { type: 'text', text: 'Sure.' },
              {
                type: 'tool_use',
                id: 't1',
                name: 'timer',
                input: { action: 'start', seconds: 600, name: null },
              },
            ],
          },
        },
        {
          events: [textDelta('Timer set for 10 minutes.')],
          message: {
            stop_reason: 'end_turn',
            usage: usage({ server_tool_use: { web_search_requests: 0 } }),
            content: [{ type: 'text', text: 'Timer set for 10 minutes.' }],
          },
        },
      ],
      seen,
    ),
    role: 'converse',
    system: 'system',
    tools: PEPPER_TOOLS,
    standing: '<recipe>Pasta</recipe>',
    history: [
      { role: 'user', text: 'first' },
      { role: 'assistant', text: 'answer' },
    ],
    turn: 'set a timer for ten minutes',
    searchesLeft: 0,
    emit: (event) => events.push(event),
    signal: new AbortController().signal,
  });
  assert.equal(done.endedBy, 'answered');
  assert.deepEqual(
    events.filter((event) => event.type === 'text').map((event) => event.text),
    ['Sure.', ' Timer set for 10 minutes.'],
  );
  assert.deepEqual(
    events.find((event) => event.type === 'action'),
    {
      type: 'action',
      id: 't1',
      name: 'timer',
      input: { action: 'start', seconds: 600, name: null },
    },
  );
  assert.match(
    done.assistant,
    /^Sure\. Timer set for 10 minutes\. \[Did on screen: timer /,
  );
  assert.equal(done.user, 'set a timer for ten minutes');
  assert.equal(done.usage.cacheReadTokens, 200);
  const [first, second] = seen as {
    messages: { role: string; content: unknown }[];
    tools: { name: string; type?: string }[];
    cache_control: unknown;
  }[];
  // The standing context is cached at the top, then history, then the turn; with no searches left the web tool is left out.
  assert.equal(first.messages.length, 4);
  assert.deepEqual(
    (first.messages[0].content as { cache_control: unknown }[])[0]
      .cache_control,
    { type: 'ephemeral' },
  );
  assert.deepEqual(first.cache_control, { type: 'ephemeral' });
  assert.ok(first.tools.every((tool) => tool.type === undefined));
  const toolResult = second.messages.at(-1)?.content as {
    type: string;
    tool_use_id: string;
    content: string;
  }[];
  assert.equal(toolResult[0].type, 'tool_result');
  assert.equal(toolResult[0].tool_use_id, 't1');
}

// A web lookup emits `searching`, is counted, and the tool is offered only up to what is left today.
{
  const seen: unknown[] = [];
  const events: TurnEvent[] = [];
  const done = await streamTurn({
    client: fakeClient(
      [
        {
          events: [
            textDelta('Let me check.'),
            {
              type: 'content_block_start',
              index: 1,
              content_block: {
                type: 'server_tool_use',
                id: 's1',
                name: 'web_search',
                input: {},
              },
            },
            textDelta(' Chicken is safe at 165°F.'),
          ],
          message: {
            stop_reason: 'end_turn',
            usage: usage({ server_tool_use: { web_search_requests: 1 } }),
            content: [
              { type: 'text', text: 'Let me check. Chicken is safe at 165°F.' },
            ],
          },
        },
      ],
      seen,
    ),
    role: 'converse',
    system: 'system',
    tools: PEPPER_TOOLS,
    standing: 'recipe',
    history: [],
    turn: 'what temperature is chicken done',
    searchesLeft: 2,
    emit: (event) => events.push(event),
    signal: new AbortController().signal,
  });
  assert.equal(done.searches, 1);
  assert.ok(events.some((event) => event.type === 'searching'));
  const [params] = seen as { tools: { name: string; max_uses?: number }[] }[];
  assert.equal(
    params.tools.find((tool) => tool.name === 'web_search')?.max_uses,
    2,
  );
}

// A turn's body: history must alternate and be whole pairs; the recognizer's other guesses ride along, deduped.
{
  const base = {
    standing: 'Pasta',
    screen: 'Step 2',
    heard: 'how much salt',
    timeZone: 'America/New_York',
  };
  assert.ok(readPepperBody(base));
  assert.equal(readPepperBody({ ...base, heard: '  ' }), null);
  assert.equal(
    readPepperBody({
      ...base,
      history: [
        { role: 'assistant', text: 'x' },
        { role: 'user', text: 'y' },
      ],
    }),
    null,
  );
  assert.equal(
    readPepperBody({ ...base, history: [{ role: 'user', text: 'x' }] }),
    null,
  );
  const read = readPepperBody({
    ...base,
    alternatives: ['how much salt', 'how much malt'],
  });
  assert.match(read?.turn ?? '', /<also_maybe>how much malt<\/also_maybe>/);
  assert.equal(readPepperBody({ ...base, timeZone: 5 })?.timeZone, 'UTC');
}

// The device reads the stream as it arrives, even when an event is split across chunks, and a 429 reads as held.
{
  const encoder = new TextEncoder();
  const sse = [
    'data: {"type":"text","text":"Hi."}\n\n',
    'data: {"type":"act',
    'ion","id":"a","name":"show","input":{"what":"steps"}}\n\ndata: {"type":"done","user":"u","assistant":"Hi.","endedBy":"answered","searches":0,"usage":{"inputTokens":1,"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0},"ms":5}\n\n',
  ];
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          sse.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const events: AssistantTurnEvent[] = [];
  const result = await streamAssistantTurn({
    url: 'http://test',
    headers: {},
    body: {},
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(
    events.map((event) => event.type),
    ['text', 'action', 'done'],
  );

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'held', reason: 'turnLimit' }), {
      status: 429,
    })) as typeof fetch;
  assert.deepEqual(
    await streamAssistantTurn({
      url: 'http://test',
      headers: {},
      body: {},
      signal: new AbortController().signal,
      onEvent: () => undefined,
    }),
    { status: 'held', reason: 'turnLimit' },
  );
}

console.log(
  'assistant turn: sentence feed, tool round trip, search cap, body and stream reading passed',
);
