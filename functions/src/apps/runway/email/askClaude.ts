import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import type { ModelProvider, TerminalTool } from '../../../ai/modelProvider.js';
import { getUsageCost } from '../../../ai/models.js';
import { createAnthropicProvider } from '../../../ai/providers/anthropic.js';
import {
  recordAssistantTurn,
  reserveAssistantTurn,
} from '../../../assistant/assistantUsage.js';
import { isForcedFixture, isRunningInEmulator } from '../../../emulator.js';

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

/** The person's day of reads, or the site's AI budget for the day, is spent: trying again today can't help. */
export const AI_HELD = 'held' as const;

const APP_ID = 'runway';
const LIMITS = { maxTurns: 2, maxToolCalls: 0, maxMillis: 20_000 };
// Every forwarded email may be read once on arrival, so the day's count is generous; the site's budget still caps spend.
const READS = { turnsPerDay: 300, searchesPerDay: 0, searchesPerTurn: 0 };

const NO_TOOLS = {
  listTools: () => Promise.resolve({ tools: [] }),
  callTool: () => Promise.reject(new Error('No tools here.')),
} as unknown as Parameters<ModelProvider['runToolLoop']>[0]['mcpClient'];

const readKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * One JSON answer from Claude Haiku through `tool`, counted against the person's day and the site's AI budget.
 * `AI_HELD` when the day's reads or budget are spent, `null` when the model can't be reached or the answer never came; never throws. In the
 * emulator without a key, `fixture` stands in for the model.
 */
export async function askClaude({
  firestore,
  uid,
  instruction,
  input,
  tool,
  fixture,
}: {
  firestore: Firestore;
  uid: string;
  instruction: string;
  input: string;
  tool: TerminalTool;
  fixture: (input: string) => Record<string, unknown> | null;
}): Promise<Record<string, unknown> | typeof AI_HELD | null> {
  const apiKey = readKey();
  if (!apiKey) return isRunningInEmulator() ? fixture(input) : null;
  const now = Date.now();
  try {
    const reserved = await reserveAssistantTurn(firestore, {
      appId: APP_ID,
      uid,
      now,
      limits: READS,
    });
    if (reserved.held !== null) {
      logger.warn('runway.email.aiHeld', { held: reserved.held });
      return AI_HELD;
    }
  } catch (error) {
    logger.error('runway.email.reserveFailed', { message: describe(error) });
    return null;
  }
  const loop = await createAnthropicProvider(apiKey)
    .runToolLoop({
      role: 'readEmail',
      system: instruction,
      messages: [{ role: 'user', content: input }],
      mcpClient: NO_TOOLS,
      terminalTool: tool,
      limits: LIMITS,
    })
    .catch((error: unknown) => {
      logger.warn('runway.email.aiFailed', { message: describe(error) });
      return null;
    });
  await recordAssistantTurn(firestore, {
    appId: APP_ID,
    uid,
    now,
    searchesReserved: 0,
    searches: 0,
    hundredthsOfCent: loop === null ? 0 : getUsageCost('readEmail', loop.usage),
  }).catch((error: unknown) =>
    logger.error('runway.email.recordFailed', { message: describe(error) }),
  );
  if (loop === null) return null;
  if (loop.endedBy !== 'terminal') {
    logger.warn('runway.email.aiFailed', {
      endedBy: loop.endedBy,
      errorCode: loop.errorCode,
    });
    return null;
  }
  const answer = loop.terminalInput;
  return answer !== null && typeof answer === 'object'
    ? (answer as Record<string, unknown>)
    : null;
}
