import Anthropic from '@anthropic-ai/sdk';

import {
  addUsage,
  EMPTY_USAGE,
  getModelSpec,
  getUsageCost,
  type ModelRole,
  type ModelUsage,
} from '../ai/models.js';

type Message = Anthropic.Beta.Messages.BetaMessageParam;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** A tool the person's device carries out (a tap the assistant makes for them); the model is told it was done and goes on. */
export interface DeviceTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TurnLine {
  role: 'user' | 'assistant';
  text: string;
}

export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'searching' }
  | { type: 'action'; id: string; name: string; input: unknown }
  | {
      type: 'done';
      /** The exact words this turn sent and answered, for the device to keep as history so the next turn's prefix stays cached. */
      user: string;
      assistant: string;
      endedBy: TurnEnd;
      searches: number;
      usage: ModelUsage;
      ms: number;
    }
  | { type: 'error'; code: string };

export type TurnEnd = 'answered' | 'refused' | 'limit' | 'aborted';

export interface StreamTurnRequest {
  client: Pick<Anthropic, 'beta'>;
  role: ModelRole;
  /** Never changes between turns, so it stays cached with the tools. */
  system: string;
  tools: DeviceTool[];
  /** What the whole conversation is about (a recipe), sent once at the top and cached for every turn after. */
  standing: string;
  history: TurnLine[];
  /** This turn's words: what changed on screen since the last turn, then what the person said. */
  turn: string;
  searchesLeft: number;
  emit: (event: TurnEvent) => void;
  signal: AbortSignal;
}

const MAX_ROUNDS = 4;
const MAX_OUTPUT_TOKENS = 4_000;
const SEARCHES_PER_TURN = 3;
/** Anthropic's price for web search: $10 per 1,000 searches, in hundredths of a cent each. */
export const SEARCH_COST_HUNDREDTHS = 100;
const DONE_RESULT = 'Done on the screen.';

const toUsage = (usage: Anthropic.Beta.Messages.BetaUsage): ModelUsage => ({
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
});

export const getTurnErrorCode = (error: unknown) => {
  if (error instanceof Anthropic.APIUserAbortError) return 'aborted';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIConnectionError) return 'network';
  if (error instanceof Anthropic.RateLimitError) return 'busy';
  if (error instanceof Anthropic.APIError) return `http${error.status ?? 0}`;
  return 'failed';
};

/** What a turn cost in hundredths of a cent: its tokens and its web searches. */
export const getTurnCost = (
  role: ModelRole,
  usage: ModelUsage,
  searches: number,
) => getUsageCost(role, usage) + searches * SEARCH_COST_HUNDREDTHS;

/**
 * Runs one spoken turn against Claude and streams it as it is written: text as it comes, a `searching` event when the web is
 * looked up, an `action` per device tool (answered "done" so the model can say so in the same breath), then `done`. Tools, the
 * system prompt and the standing context are cached across the conversation; each turn adds only its own words.
 */
export async function streamTurn({
  client,
  role,
  system,
  tools,
  standing,
  history,
  turn,
  searchesLeft,
  emit,
  signal,
}: StreamTurnRequest): Promise<Extract<TurnEvent, { type: 'done' }>> {
  const startedAt = Date.now();
  const spec = getModelSpec(role);
  const deviceNames = new Set(tools.map((tool) => tool.name));
  const maxSearches = Math.min(SEARCHES_PER_TURN, searchesLeft);
  const toolList: Anthropic.Beta.Messages.BetaToolUnion[] = [
    ...tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema:
        tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
    })),
    ...(maxSearches > 0
      ? [
          {
            type: 'web_search_20250305' as const,
            name: 'web_search' as const,
            max_uses: maxSearches,
          },
        ]
      : []),
  ];
  const messages: Message[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: standing,
          cache_control: { type: 'ephemeral' },
        },
      ],
    },
    ...history.map((line): Message => ({
      role: line.role,
      content: line.text,
    })),
    { role: 'user', content: turn },
  ];
  const state = {
    usage: EMPTY_USAGE,
    searches: 0,
    spoken: [] as string[],
    did: [] as string[],
    rounds: 0,
  };
  const done = (endedBy: TurnEnd) => {
    const words = state.spoken.join(' ').replace(/\s+/g, ' ').trim();
    const event = {
      type: 'done' as const,
      user: turn,
      assistant:
        state.did.length === 0
          ? words
          : `${words} [Did on screen: ${state.did.join('; ')}]`.trim(),
      endedBy,
      searches: state.searches,
      usage: state.usage,
      ms: Date.now() - startedAt,
    };
    emit(event);
    return event;
  };

  while (state.rounds < MAX_ROUNDS) {
    if (signal.aborted) return done('aborted');
    state.rounds += 1;
    const roundText = { value: '' };
    const stream = client.beta.messages.stream(
      {
        model: spec.id,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          {
            type: 'text',
            text: system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: toolList,
        tool_choice: { type: 'auto' },
        messages,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: spec.effort },
      },
      { signal },
    );
    for await (const event of stream) {
      if (
        event.type === 'content_block_start' &&
        event.content_block.type === 'server_tool_use'
      ) {
        emit({ type: 'searching' });
      }
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        // Words from an earlier round end a sentence; a new round starts after a space so the two never run together.
        const text =
          roundText.value === '' && state.spoken.length > 0
            ? ` ${event.delta.text}`
            : event.delta.text;
        roundText.value += event.delta.text;
        emit({ type: 'text', text });
      }
    }
    const message = await stream.finalMessage();
    state.usage = addUsage(state.usage, toUsage(message.usage));
    state.searches += message.usage.server_tool_use?.web_search_requests ?? 0;
    if (roundText.value.trim() !== '') state.spoken.push(roundText.value);
    if (message.stop_reason === 'refusal') return done('refused');
    messages.push({ role: 'assistant', content: message.content as Block[] });
    if (message.stop_reason === 'pause_turn') continue;
    const uses = message.content.filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlock =>
        block.type === 'tool_use',
    );
    if (message.stop_reason !== 'tool_use' || uses.length === 0) {
      return done('answered');
    }
    uses.forEach((use) => {
      if (!deviceNames.has(use.name)) return;
      state.did.push(`${use.name} ${JSON.stringify(use.input)}`);
      emit({ type: 'action', id: use.id, name: use.name, input: use.input });
    });
    messages.push({
      role: 'user',
      content: uses.map((use) => ({
        type: 'tool_result' as const,
        tool_use_id: use.id,
        content: deviceNames.has(use.name) ? DONE_RESULT : 'Unknown tool.',
        ...(deviceNames.has(use.name) ? {} : { is_error: true }),
      })),
    });
  }
  return done('limit');
}
