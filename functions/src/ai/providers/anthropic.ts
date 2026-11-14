import Anthropic from '@anthropic-ai/sdk';
import { logger } from 'firebase-functions/v2';

import type {
  ModelProvider,
  ToolLoopRequest,
  ToolLoopResult,
} from '../modelProvider.js';
import {
  addUsage,
  EMPTY_USAGE,
  getModelSpec,
  type ModelUsage,
} from '../models.js';

type Message = Anthropic.Beta.Messages.BetaMessageParam;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

const TURN_TIMEOUT_MS = 15_000;
// A turn sent with less time than this would almost surely time out, wasting what it is billed.
const MIN_TURN_MS = 5_000;
const MAX_OUTPUT_TOKENS = 8_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const toUsage = (usage: Anthropic.Beta.Messages.BetaUsage): ModelUsage => ({
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
});

const getErrorCode = (error: unknown) => {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  // Connection and abort errors are status-less subclasses of the API error.
  if (
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.APIUserAbortError
  ) {
    return 'network';
  }
  if (error instanceof Anthropic.APIError) return `http${error.status ?? 0}`;
  return 'loopError';
};

const toText = (content: unknown): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map((part: { type?: string; text?: string }) =>
      part.type === 'text' ? (part.text ?? '') : '',
    )
    .join('\n');
};

/** The Anthropic API with `tool_choice` auto: the models used here refuse a forced tool, so the loop asks for the terminal tool in words when a turn ends without it. */
export function createAnthropicProvider(
  apiKey: string,
  client: Pick<Anthropic, 'beta'> = new Anthropic({ apiKey, maxRetries: 0 }),
): ModelProvider {
  async function runToolLoop({
    role,
    system,
    messages: input,
    mcpClient,
    terminalTool,
    extraTerminalTools = [],
    limits,
    onUsage,
    signal,
  }: ToolLoopRequest): Promise<ToolLoopResult> {
    const spec = getModelSpec(role);
    const startedAt = Date.now();
    const toolCalls: string[] = [];
    const messages: Message[] = input.map((message) => ({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part): Block => {
              if (part.type === 'text')
                return { type: 'text', text: part.text };
              return part.type === 'image'
                ? {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: part.mediaType,
                      data: part.data,
                    },
                  }
                : {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: part.mediaType,
                      data: part.data,
                    },
                  };
            }),
    }));
    const terminals = [terminalTool, ...extraTerminalTools];
    const terminalNames = new Set(terminals.map((tool) => tool.name));
    const ask = `Call ${terminalTool.name} now with what you have.`;
    const state = { usage: EMPTY_USAGE, turns: 0, asked: false };
    const timeLeft = () => limits.maxMillis - (Date.now() - startedAt);
    const isOver = () =>
      state.turns >= limits.maxTurns ||
      toolCalls.length >= limits.maxToolCalls ||
      timeLeft() < 2 * MIN_TURN_MS;
    const end = (
      endedBy: ToolLoopResult['endedBy'],
      terminalInput: unknown = null,
      errorCode: string | null = null,
      terminalName: string | null = null,
    ): ToolLoopResult => ({
      terminalInput,
      terminalName,
      endedBy,
      errorCode,
      usage: state.usage,
      toolCalls,
    });

    try {
      const listed = (await mcpClient.listTools()).tools
        .filter((tool) => !terminalNames.has(tool.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      const tools: Anthropic.Beta.Messages.BetaTool[] = [
        ...listed.map((tool) => ({
          name: tool.name,
          description: tool.description ?? '',
          input_schema:
            tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
        })),
        // Not strict: the API refuses a strict schema with more than 16 nullable
        // fields, so each caller checks the answer's shape in code.
        ...terminals.map((tool, index) => ({
          name: tool.name,
          description: tool.description,
          input_schema:
            tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
          ...(index === terminals.length - 1
            ? { cache_control: { type: 'ephemeral' as const } }
            : {}),
        })),
      ];
      const systemBlocks = [
        {
          type: 'text' as const,
          text: `${system}\n\nAlways finish by calling ${terminalTool.name}.`,
          cache_control: { type: 'ephemeral' as const },
        },
      ];

      for (;;) {
        if (signal?.aborted) return end('aborted');
        if (state.turns >= limits.maxTurns || timeLeft() < MIN_TURN_MS) {
          return end('limit');
        }
        const response = await client.beta.messages.create(
          {
            model: spec.id,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: systemBlocks,
            tools,
            tool_choice: { type: 'auto' },
            messages,
            output_config: { effort: spec.effort },
            ...(spec.hasServerFallback
              ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
              : {}),
          },
          { timeout: Math.min(TURN_TIMEOUT_MS, timeLeft()), signal },
        );
        state.turns += 1;
        const turnUsage = toUsage(response.usage);
        state.usage = addUsage(state.usage, turnUsage);
        await Promise.resolve(onUsage?.(turnUsage)).catch(() => undefined);

        if (response.stop_reason === 'refusal') return end('refused');
        if (response.stop_reason === 'max_tokens') {
          return end('error', null, 'maxTokens');
        }
        messages.push({
          role: 'assistant',
          content: response.content as Block[],
        });

        const uses = response.content.filter(
          (block): block is Anthropic.Beta.Messages.BetaToolUseBlock =>
            block.type === 'tool_use',
        );
        const terminalUse =
          uses.find((use) => use.name === terminalTool.name) ??
          uses.find((use) => terminalNames.has(use.name));
        if (terminalUse) {
          return end('terminal', terminalUse.input, null, terminalUse.name);
        }

        if (state.asked) return end(isOver() ? 'limit' : 'noTerminal');

        if (state.turns >= limits.maxTurns || timeLeft() < MIN_TURN_MS) {
          return end('limit');
        }

        const results: Block[] = [];
        for (const use of uses) {
          if (signal?.aborted) return end('aborted');
          const isRefused = toolCalls.length >= limits.maxToolCalls;
          if (!isRefused) toolCalls.push(use.name);
          const result = isRefused
            ? { text: 'Tool call limit reached.', isError: true }
            : await mcpClient
                .callTool({
                  name: use.name,
                  arguments: use.input as Record<string, unknown>,
                })
                .then((value) => ({
                  text: toText(value.content),
                  isError: value.isError === true,
                }))
                .catch(() => ({ text: 'The tool failed.', isError: true }));
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: result.text,
            is_error: result.isError,
          });
        }

        if (
          uses.length === 0 ||
          isOver() ||
          state.turns + 1 >= limits.maxTurns
        ) {
          state.asked = true;
          results.push({ type: 'text', text: ask });
        }
        messages.push({ role: 'user', content: results });
      }
    } catch (error) {
      if (signal?.aborted || error instanceof Anthropic.APIUserAbortError) {
        return end('aborted');
      }
      if (
        error instanceof Anthropic.BadRequestError ||
        error instanceof Anthropic.UnprocessableEntityError
      ) {
        const body = (
          error.error as { error?: { type?: string; message?: string } }
        )?.error;
        const message = body?.message ?? '';
        // Only a complaint about the request's shape is kept in words; another could quote the person's text.
        logger.warn('ai.requestRejected', {
          role,
          status: error.status,
          type: body?.type ?? null,
          reason: /^tools\.|schema/i.test(message)
            ? message.slice(0, 300)
            : null,
          reasonLength: message.length,
        });
      }
      return end('error', null, getErrorCode(error));
    }
  }

  return { runToolLoop };
}
