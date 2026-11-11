import type { TerminalTool } from '../../../ai/modelProvider.js';
import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { HeldReason } from '../aiLimits.js';

export type Route = 'quick' | 'full';

const MAX_QUICK_CHARS = 280;
const QUESTION_OPENERS = new Set(
  (
    'what when where who whom whose why how which is are am was were do does ' +
    'did can could should would will shall may might have has had'
  ).split(' '),
);

export const isQuestion = (text: string) =>
  text.includes('?') ||
  QUESTION_OPENERS.has(
    text
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^\p{L}']/gu, ''),
  );

const REVISE_CUES = new Set([
  'shorter',
  'shorten',
  'rewrite',
  'reword',
  'tidy',
  'simplify',
  'remove',
  'cut',
  'trim',
  'intro',
  'introduction',
]);

/** Whether the words ask to change a document: one of the cue words, as a word of its own. */
export const hasReviseCue = (text: string) =>
  toComparable(text)
    .split(' ')
    .some((word) => REVISE_CUES.has(word));

const PROCEDURE_CUES = new Set([
  'routine',
  'routines',
  'procedure',
  'procedures',
  'checklist',
]);

const PROCEDURE_REVISE_CUES = new Set([
  ...REVISE_CUES,
  'add',
  'delete',
  'drop',
  'split',
  'group',
  'move',
  'rename',
  'reorder',
  'put',
  'merge',
  'shorter',
]);

const hasWordIn = (cues: Set<string>, text: string) =>
  toComparable(text)
    .split(' ')
    .some((word) => cues.has(word));

/** Whether the words name a routine, procedure or checklist, as a word of its own. */
export const hasProcedureCue = (text: string) =>
  hasWordIn(PROCEDURE_CUES, text);

/** Whether the words ask to change a procedure's steps. */
export const hasProcedureReviseCue = (text: string) =>
  hasWordIn(PROCEDURE_REVISE_CUES, text);

const RUN_START_CUES = new Set([
  'start',
  'starting',
  'begin',
  'run',
  'running',
  'use',
  'kick',
]);

/** Whether the words ask to begin something: one of the cue words, as a word of its own. */
export const hasRunStartCue = (text: string) => hasWordIn(RUN_START_CUES, text);

const TICK_CUES = new Set([
  'done',
  'did',
  'finished',
  'packed',
  'tick',
  'ticked',
  'checked',
  'got',
  'grabbed',
  'bought',
  'sorted',
  'handled',
  'complete',
  'completed',
]);

const TICK_REFUSALS = [
  'not',
  'havent',
  'hasnt',
  'didnt',
  'dont',
  'never',
  'forgot',
  'still need',
  'yet to',
  'need to',
  'needs to',
];

/** Whether the words say something is done and do not negate it: a done-word and none of the refusals, as whole words. */
export const hasTickCue = (text: string) => {
  const padded = ` ${toComparable(text.replace(/['\u2019]/g, ''))} `;
  return (
    hasWordIn(TICK_CUES, text) &&
    !TICK_REFUSALS.some((phrase) => padded.includes(` ${phrase} `))
  );
};

/** Short plain turns go to the quick model; a turn with photos or files, a question, a long turn and "sort the rest" go to the full one. The answer to a question the assistant asked is always quick: the question already says what is wanted. */
export const pickRoute = ({
  text,
  mode,
  isAnswer = false,
  hasTopicFocus = false,
  hasProcedureFocus = false,
  hasMedia = false,
}: {
  text: string;
  mode: 'full' | 'rest';
  isAnswer?: boolean;
  hasTopicFocus?: boolean;
  hasProcedureFocus?: boolean;
  hasMedia?: boolean;
}): Route => {
  const trimmed = text.trim();
  if (hasMedia) return 'full';
  if (isAnswer && mode === 'full') return 'quick';
  if (hasTopicFocus && mode === 'full' && hasReviseCue(trimmed)) return 'full';
  if (mode === 'full' && hasProcedureCue(trimmed)) return 'full';
  if (hasProcedureFocus && mode === 'full' && hasProcedureReviseCue(trimmed))
    return 'full';
  return mode === 'full' &&
    trimmed.length <= MAX_QUICK_CHARS &&
    !isQuestion(trimmed)
    ? 'quick'
    : 'full';
};

export const HAND_OVER_TOOL: TerminalTool = {
  name: 'hand_over',
  description:
    'Hands the turn to the fuller model when it needs planning, an answer, or more than a few simple changes. Call it instead of file_results. Give the reason in at most 120 characters.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
};

type RunRole = 'quick' | 'interpret';

/** Runs a turn on its route; a quick run may hand the turn over once, and the full run it starts is never offered the hand-over. Each run reserves its own allowance first; a hand-over cut short by an abort reserves nothing more and comes back marked aborted, so the caller restarts the turn. */
export async function runRouted<T>(input: {
  route: Route;
  runOn: (
    role: RunRole,
    canHandOver: boolean,
  ) => Promise<{ handedOver: boolean; value: T }>;
  reserve: (route: Route) => Promise<HeldReason | null>;
  isAborted: () => boolean;
}): Promise<
  { value: T; route: Route; aborted: boolean } | { held: HeldReason }
> {
  const { route, runOn, reserve, isAborted } = input;
  const heldFirst = await reserve(route);
  if (heldFirst) return { held: heldFirst };
  if (route === 'full') {
    const full = await runOn('interpret', false);
    return { value: full.value, route: 'full', aborted: false };
  }
  const quick = await runOn('quick', true);
  if (!quick.handedOver) {
    return { value: quick.value, route: 'quick', aborted: false };
  }
  if (isAborted()) return { value: quick.value, route: 'quick', aborted: true };
  const heldFull = await reserve('full');
  if (heldFull) return { held: heldFull };
  const full = await runOn('interpret', false);
  return { value: full.value, route: 'full', aborted: false };
}
