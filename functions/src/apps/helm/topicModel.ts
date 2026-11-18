import { logger } from 'firebase-functions';
import type { Firestore } from 'firebase-admin/firestore';

import type { ModelProvider, TerminalTool } from '../../ai/modelProvider.js';
import { getUsageCost, type ModelRole } from '../../ai/models.js';
import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import { isRunningInEmulator } from '../../emulator.js';
import { recordAiSpend } from './aiLimits.js';
import { createTopicFixtureProvider } from './topicWrite.js';

export const TOPIC_LOOP_LIMITS = {
  maxTurns: 2,
  maxToolCalls: 0,
  maxMillis: 45_000,
};

const NO_TOOLS = {
  listTools: () => Promise.resolve({ tools: [] }),
  callTool: () => Promise.reject(new Error('No tools here.')),
} as unknown as Parameters<ModelProvider['runToolLoop']>[0]['mcpClient'];

/** The writer for a topic's document: the live model when a key is set, the emulator's stand-in otherwise, and none anywhere else. */
export const pickTopicProvider = (apiKey: string): ModelProvider | null => {
  if (apiKey) return createAnthropicProvider(apiKey);
  return isRunningInEmulator() ? createTopicFixtureProvider() : null;
};

/** One model call with no tools that must end in the terminal tool; its cost is recorded. Null when it ended any other way. */
export async function askTopicModel(
  firestore: Firestore,
  provider: ModelProvider,
  role: ModelRole,
  request: {
    system: string;
    message: string;
    terminalTool: TerminalTool;
    limits?: typeof TOPIC_LOOP_LIMITS;
  },
) {
  const loop = await provider.runToolLoop({
    role,
    system: request.system,
    messages: [{ role: 'user', content: request.message }],
    mcpClient: NO_TOOLS,
    terminalTool: request.terminalTool,
    limits: request.limits ?? TOPIC_LOOP_LIMITS,
    onUsage: async (usage) => {
      const cost = getUsageCost(role, usage);
      if (cost <= 0) return;
      await recordAiSpend(firestore, Date.now(), cost).catch(() =>
        logger.error('helm.ai.spendNotRecorded'),
      );
    },
  });
  return loop.endedBy === 'terminal' ? loop.terminalInput : null;
}
