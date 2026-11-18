import type { BatchProvider, BatchResult } from '../batch.js';
import { EMPTY_USAGE, type ModelUsage } from '../models.js';

export type FakeBatchFixture =
  | { type: 'answer'; json: unknown; usage?: ModelUsage }
  | { type: 'unusable'; usage?: ModelUsage }
  | { type: 'errored' | 'expired' | 'canceled' };

export interface FakeBatchProvider extends BatchProvider {
  created: { id: string; customIds: string[] }[];
  deleted: string[];
}

const toResult = (customId: string, fixture: FakeBatchFixture): BatchResult => {
  if (fixture.type === 'answer' || fixture.type === 'unusable')
    return {
      customId,
      outcome: 'succeeded',
      output: fixture.type === 'answer' ? fixture.json : null,
      usage: fixture.usage ?? EMPTY_USAGE,
    };
  return {
    customId,
    outcome: fixture.type,
    output: null,
    usage: EMPTY_USAGE,
  };
};

/** An in-process batch provider for checks and the emulator: the batch has ended as soon as it is read, and each request is answered by its fixture, in order. */
export function createFakeBatchProvider(
  fixtures: FakeBatchFixture[],
  { isEnded = true }: { isEnded?: boolean } = {},
): FakeBatchProvider {
  const created: FakeBatchProvider['created'] = [];
  const deleted: string[] = [];
  return {
    created,
    deleted,
    submit: async (requests) => {
      const id = `fake_batch_${created.length + 1}`;
      created.push({ id, customIds: requests.map((r) => r.customId) });
      return id;
    },
    collect: async (batchId) => {
      if (!isEnded) return null;
      const batch = created.find((entry) => entry.id === batchId);
      if (!batch) throw new Error(`Unknown fake batch: ${batchId}`);
      return batch.customIds.map((customId, index) =>
        toResult(customId, fixtures[index] ?? { type: 'errored' }),
      );
    },
    remove: async (batchId) => {
      deleted.push(batchId);
    },
  };
}
