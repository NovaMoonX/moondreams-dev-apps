import Anthropic from '@anthropic-ai/sdk';

import {
  EMPTY_USAGE,
  getModelSpec,
  type ModelRole,
  type ModelUsage,
} from './models.js';

export interface BatchRequest {
  /** 1 to 64 characters of letters, digits, `_` and `-`; unique within a batch. */
  customId: string;
  role: ModelRole;
  system: string;
  message: string;
  /** JSON Schema of the answer, with `additionalProperties: false` and `required`. */
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Sent as one cached block (kept an hour) so requests that share it read it from the cache. */
  isSystemCached?: boolean;
}

export interface BatchResult {
  customId: string;
  outcome: 'succeeded' | 'errored' | 'expired' | 'canceled';
  /** The parsed answer; null when the request did not succeed, was refused or did not parse. */
  output: unknown;
  usage: ModelUsage;
}

export interface BatchProvider {
  /** Sends the requests as one batch and returns its id. */
  submit(requests: BatchRequest[]): Promise<string>;
  /** Every result of an ended batch, in any order; null while it is still running. */
  collect(batchId: string): Promise<BatchResult[] | null>;
  /** Deletes an ended batch at the provider, where it is otherwise kept for up to 29 days. */
  remove(batchId: string): Promise<void>;
}

const readAll = async <T>(items: AsyncIterable<T>) => {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
};

const toOutput = (message: Anthropic.Message): unknown => {
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens')
    return null;
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toResult = (
  item: Anthropic.Messages.MessageBatchIndividualResponse,
): BatchResult => {
  const { result } = item;
  if (result.type !== 'succeeded') {
    return {
      customId: item.custom_id,
      outcome: result.type,
      output: null,
      usage: EMPTY_USAGE,
    };
  }
  const { usage } = result.message;
  return {
    customId: item.custom_id,
    outcome: 'succeeded',
    output: toOutput(result.message),
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
};

/** Anthropic's Message Batches API: half the price, results within 24 hours. A batch request may not stream or carry a fallback list, so neither is sent. */
export function createAnthropicBatchProvider(
  apiKey: string,
  client: Pick<Anthropic, 'messages'> = new Anthropic({
    apiKey,
    maxRetries: 0,
  }),
): BatchProvider {
  const submit = async (requests: BatchRequest[]) => {
    const batch = await client.messages.batches.create({
      requests: requests.map((request) => {
        const spec = getModelSpec(request.role);
        return {
          custom_id: request.customId,
          params: {
            model: spec.id,
            max_tokens: request.maxTokens,
            system: request.isSystemCached
              ? [
                  {
                    type: 'text' as const,
                    text: request.system,
                    cache_control: {
                      type: 'ephemeral' as const,
                      ttl: '1h' as const,
                    },
                  },
                ]
              : request.system,
            messages: [{ role: 'user' as const, content: request.message }],
            output_config: {
              effort: spec.effort,
              format: { type: 'json_schema' as const, schema: request.schema },
            },
          },
        };
      }),
    });
    return batch.id;
  };

  const collect = async (batchId: string) => {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') return null;
    const items = await readAll(await client.messages.batches.results(batchId));
    return items.map(toResult);
  };

  const remove = async (batchId: string) => {
    await client.messages.batches.delete(batchId);
  };

  return { submit, collect, remove };
}
