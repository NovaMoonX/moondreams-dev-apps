import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

export interface SendToClaudeResult {
  text: string;
  sessionUrl: string | null;
  reason?: 'not-connected';
}

const startFeedbackClaudeSessionCallable = httpsCallable<
  { feedbackIds: string[] } | { groupId: string },
  SendToClaudeResult
>(functions, 'startFeedbackClaudeSession', { timeout: 60_000 });

/** Admin only: hands one or several pieces of feedback, or a whole group, to a new Claude Code session. */
export async function sendFeedbackToClaude(
  target: { feedbackIds: string[] } | { groupId: string },
): Promise<SendToClaudeResult> {
  const result = await startFeedbackClaudeSessionCallable(target);
  return result.data;
}
