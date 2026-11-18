import type { ToolLoopResult } from '../../../ai/modelProvider.js';
import { SCHEDULED_OWN_KINDS } from '../nomos/commands.js';
import { readAheadStart } from '../nomos/planResearchAhead.js';

export interface ScheduledCaptureFields {
  arrivedVia?: string | null;
  heldCommands?: unknown;
  allowedKinds?: unknown;
}

export const isScheduledCapture = (capture: ScheduledCaptureFields) =>
  capture.arrivedVia === 'scheduled';

const allowedOf = (capture: ScheduledCaptureFields) =>
  (Array.isArray(capture.allowedKinds) ? capture.allowedKinds : []).filter(
    (kind): kind is string =>
      typeof kind === 'string' &&
      (SCHEDULED_OWN_KINDS as readonly string[]).includes(kind),
  );

/** The commands a held run files without a model: only a titled task needs no words to read. */
export const buildHeldCommands = (capture: ScheduledCaptureFields) => {
  if (!isScheduledCapture(capture) || !Array.isArray(capture.heldCommands))
    return null;
  const allowed = allowedOf(capture);
  return (capture.heldCommands as Record<string, unknown>[]).flatMap(
    (held, index) =>
      held.kind === 'createTask' &&
      allowed.includes('createTask') &&
      typeof held.title === 'string'
        ? [
            {
              kind: 'createTask',
              ref: `$new${index + 1}`,
              title: held.title,
              dueSpanId: null,
              isUrgent: false,
              whoRefs: [],
              placeRefs: [],
              projectRef: null,
            },
          ]
        : [],
  );
};

const toFiledLoop = (commands: unknown[]): ToolLoopResult => {
  return {
    terminalInput: { commands },
    terminalName: 'file_results',
    endedBy: 'terminal',
    errorCode: null,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    toolCalls: [],
  };
};

/** The reply a held-commands run files without asking a model: each held task is made as the person set it. */
export const readHeldLoop = (
  capture: ScheduledCaptureFields,
): ToolLoopResult | null => {
  const commands = buildHeldCommands(capture);
  return commands ? toFiledLoop(commands) : null;
};

/** The reply a yes on a research offer files without asking a model: it carries no command, since the start is read from the project by code. A capture whose offer can't be read takes the usual path. */
export const readAheadLoop = (capture: ScheduledCaptureFields) =>
  readAheadStart(capture) ? toFiledLoop([]) : null;

/** Keeps only what the action was allowed to write: its command kinds, and nothing else the model read from the words. */
export const narrowReply = <
  T extends { commands: { kind: string }[]; planDay: unknown },
>(
  reply: T,
  capture: ScheduledCaptureFields,
): T => {
  if (!isScheduledCapture(capture)) return reply;
  const allowed = allowedOf(capture);
  const empty = Object.fromEntries(
    Object.entries(reply).flatMap(([key, value]): [string, unknown][] =>
      Array.isArray(value) ? [[key, []]] : [],
    ),
  );
  return {
    ...reply,
    ...empty,
    commands: reply.commands.filter((command) =>
      allowed.includes(command.kind),
    ),
    planDay: allowed.includes('planDay') ? reply.planDay : null,
    answer: null,
    replyLine: null,
    setCurrentPlace: null,
  } as T;
};
