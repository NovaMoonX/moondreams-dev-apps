import type { OpenCapture, OpenExecution } from '@apps/helm/types';
import { QUIET_SPOKEN_LINE } from '@apps/helm/utils/privacy';

/** The real line a turn kept off the speaker, from its captures or its executions; null when it held none. */
export const findHeldLine = (
  captures: readonly Pick<OpenCapture, 'heldLine'>[],
  executions: readonly Pick<OpenExecution, 'heldSpoken'>[],
) =>
  captures.find((capture) => (capture.heldLine ?? null) !== null)?.heldLine ??
  executions.find((execution) => (execution.heldSpoken ?? null) !== null)
    ?.heldSpoken ??
  null;

/** What a tap on a line's speaker says: the screen line when the turn held its words, never the answer's text. */
export const readReplayLine = (text: string, heldLine: string | null) =>
  heldLine === null ? text : QUIET_SPOKEN_LINE;
