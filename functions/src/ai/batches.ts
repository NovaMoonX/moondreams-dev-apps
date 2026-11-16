import { randomBytes } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';

import { BATCH_JOBS, isBatchJobId, type BatchJobId } from './batchJobs.js';
import { getModelSpec, type ModelUsage } from './models.js';

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;
type Individual = Anthropic.Messages.Batches.MessageBatchIndividualResponse;

/** The part of the SDK's `messages.batches` this layer calls; the real client satisfies it. */
export interface BatchClient {
  create(params: {
    requests: { custom_id: string; params: Params }[];
  }): Promise<{ id: string }>;
  retrieve(id: string): Promise<{ processing_status: string }>;
  results(id: string): Promise<AsyncIterable<Individual>>;
  delete(id: string): Promise<unknown>;
}

export type BatchOutcome =
  | { kind: 'answer'; json: unknown; usage: ModelUsage }
  | { kind: 'paused' }
  | { kind: 'refused' | 'errored' | 'expired' | 'canceled' };

export interface BatchRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

const newCustomId = () => `b_${randomBytes(16).toString('hex')}`;

const toRequestParams = (jobId: BatchJobId, request: BatchRequest): Params => ({
  model: getModelSpec(BATCH_JOBS[jobId].role).id,
  max_tokens: request.maxTokens,
  system: [
    {
      type: 'text',
      text: request.system,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ],
  messages: [{ role: 'user', content: request.prompt }],
  output_config: { format: { type: 'json_schema', schema: request.schema } },
});

/** Sends one batch for a registered job; the ids come back in request order and carry no uid or document id. */
export async function submitBatch(
  client: BatchClient,
  {
    jobId,
    requests,
    makeId = newCustomId,
  }: { jobId: string; requests: BatchRequest[]; makeId?: () => string },
): Promise<{ batchId: string; customIds: string[] }> {
  if (!isBatchJobId(jobId)) throw new Error(`Unregistered batch job: ${jobId}`);
  if (requests.length === 0) throw new Error('A batch needs a request');
  const customIds = requests.map(() => makeId());
  const batch = await client.create({
    requests: requests.map((request, index) => ({
      custom_id: customIds[index],
      params: toRequestParams(jobId, request),
    })),
  });
  return { batchId: batch.id, customIds };
}

const toUsage = (usage: Anthropic.Messages.Usage): ModelUsage => ({
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
});

const parseJson = (text: string): { json: unknown } | null => {
  try {
    return { json: JSON.parse(text) };
  } catch {
    return null;
  }
};

function toOutcome({ result }: Individual): BatchOutcome {
  if (result.type !== 'succeeded') {
    return { kind: result.type };
  }
  const { message } = result;
  if (message.stop_reason === 'pause_turn') return { kind: 'paused' };
  if (message.stop_reason === 'refusal') return { kind: 'refused' };
  if (message.stop_reason !== 'end_turn') return { kind: 'errored' };
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  const parsed = parseJson(text);
  return parsed
    ? { kind: 'answer', json: parsed.json, usage: toUsage(message.usage) }
    : { kind: 'errored' };
}

/** Reads a batch once it has ended, hands each result to `handle` in turn, then deletes the batch when the job says so; a throwing handler leaves the batch in place to read again. */
export async function collectBatch(
  client: BatchClient,
  { jobId, batchId }: { jobId: BatchJobId; batchId: string },
  handle: (customId: string, outcome: BatchOutcome) => Promise<void>,
): Promise<'pending' | 'collected'> {
  const batch = await client.retrieve(batchId);
  if (batch.processing_status !== 'ended') return 'pending';
  for await (const entry of await client.results(batchId)) {
    await handle(entry.custom_id, toOutcome(entry));
  }
  if (BATCH_JOBS[jobId].deleteAfterCollect) await client.delete(batchId);
  return 'collected';
}
