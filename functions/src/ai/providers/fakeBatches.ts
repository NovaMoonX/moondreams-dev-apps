import type { BatchClient } from '../batches.js';
import type { ModelUsage } from '../models.js';

export type FakeBatchFixture =
  | { type: 'answer'; json: unknown; usage?: ModelUsage }
  | {
      type: 'stopped';
      stopReason: 'pause_turn' | 'refusal' | 'max_tokens';
    }
  | { type: 'errored' | 'expired' | 'canceled' };

export interface FakeBatchClient extends BatchClient {
  created: { id: string; customIds: string[] }[];
  deleted: string[];
}

const NO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const toResult = (fixture: FakeBatchFixture) => {
  if (fixture.type === 'answer') {
    const usage = fixture.usage ?? NO_USAGE;
    return {
      type: 'succeeded',
      message: {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(fixture.json) }],
        usage: {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
          cache_creation_input_tokens: usage.cacheWriteTokens,
        },
      },
    };
  }
  if (fixture.type === 'stopped') {
    return {
      type: 'succeeded',
      message: {
        stop_reason: fixture.stopReason,
        content: [],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    };
  }
  return fixture.type === 'errored'
    ? { type: 'errored', error: { type: 'error', error: {} } }
    : { type: fixture.type };
};

/** An in-process batch client for checks and the emulator: the batch has ended as soon as it is read, and each request is answered by its fixture. */
export function createFakeBatchClient(
  fixtures: FakeBatchFixture[],
  { isEnded = true }: { isEnded?: boolean } = {},
): FakeBatchClient {
  const created: FakeBatchClient['created'] = [];
  const deleted: string[] = [];
  return {
    created,
    deleted,
    create: async ({ requests }) => {
      const id = `fake_batch_${created.length + 1}`;
      created.push({ id, customIds: requests.map((r) => r.custom_id) });
      return { id };
    },
    retrieve: async () => ({
      processing_status: isEnded ? 'ended' : 'in_progress',
    }),
    results: async (id) => {
      const batch = created.find((entry) => entry.id === id);
      if (!batch) throw new Error(`Unknown fake batch: ${id}`);
      const entries = batch.customIds.map((customId, index) => ({
        custom_id: customId,
        result: toResult(fixtures[index] ?? { type: 'errored' }),
      }));
      return (async function* () {
        yield* entries;
      })() as ReturnType<BatchClient['results']> extends Promise<infer R>
        ? R
        : never;
    },
    delete: async (id) => {
      deleted.push(id);
      return { id, type: 'message_batch_deleted' };
    },
  };
}
