import { OPTION_CAP, type UndoOffer, type UndoReason } from './commands.js';

import type { PlannedQuestion } from './executeCommands.js';
import {
  buildUndoOfferPrompt,
  listUndoLines,
  buildSpokenQuestion,
} from './summaries.js';
import {
  buildUndoUnits,
  getRemainingUnits,
  type UndoUnit,
  type UnitEffect,
  type UnitEffectRef,
} from '../undoUnits.js';

export const UNDO_OFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_UNDOABLE_UNITS = 12;
const DETAIL_CAP = OPTION_CAP;

export type UndoOfferDropCode =
  | 'missing'
  | 'notSucceeded'
  | 'notUndoable'
  | 'fullyUndone'
  | 'tooOld'
  | 'allUndone'
  | 'outOfRange'
  | 'repeated';

export interface OfferedExecution {
  state: string;
  category: string;
  createdAt: number;
  undoneByExecutionId: string | null;
  undoneDocIds: string[] | null;
  effectRefs: UnitEffectRef[];
  effects: UnitEffect[];
  /** The words the assistant said about that turn, shown under a choice. */
  said?: string | null;
}

interface Candidate {
  executionId: string;
  offer: UndoOffer;
  going: UndoUnit[];
  staying: UndoUnit[];
  said: string | null;
}

const toSentence = (line: string) => (/[.!?]$/.test(line) ? line : `${line}.`);

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const toChoice = (optionId: string, candidate: Candidate) => ({
  optionId,
  executionId: candidate.executionId,
  docIds: [...new Set(candidate.going.flatMap((unit) => unit.docIds))],
  isAll: candidate.offer.lineNumbers === 'all',
  reason: candidate.offer.reason as UndoReason,
  quote: candidate.offer.quote,
});

/** Turns the reply's offers to take something back into one question for the person, checked against the executions as they are now. One that is gone, failed, an undo or an import, fully taken back, older than a day, or names only lines already taken back or not there is dropped and named. The server never undoes: the answer is held for the device. */
export function planUndoOffer(input: {
  offers: UndoOffer[];
  executions: Map<string, OfferedExecution>;
  now: number;
  lead: string | null;
  newId: () => string;
}): { question: PlannedQuestion | null; dropped: UndoOfferDropCode[] } {
  const seen = new Set<string>();
  const read = input.offers.map(
    (offer): { candidate: Candidate } | { drop: UndoOfferDropCode } => {
      const execution = input.executions.get(offer.executionId);
      if (seen.has(offer.executionId)) return { drop: 'repeated' };
      seen.add(offer.executionId);
      if (!execution) return { drop: 'missing' };
      if (execution.state !== 'succeeded') return { drop: 'notSucceeded' };
      if (execution.category === 'undo' || execution.category === 'import') {
        return { drop: 'notUndoable' };
      }
      if (execution.undoneByExecutionId) return { drop: 'fullyUndone' };
      if (input.now - execution.createdAt > UNDO_OFFER_MAX_AGE_MS) {
        return { drop: 'tooOld' };
      }
      const { units } = buildUndoUnits({
        category: execution.category,
        effectRefs: execution.effectRefs,
        effects: execution.effects,
      });
      const left = getRemainingUnits(
        units,
        new Set(execution.undoneDocIds ?? []),
      );
      const shown = units.slice(0, MAX_UNDOABLE_UNITS);
      if (
        offer.lineNumbers !== 'all' &&
        offer.lineNumbers.some((n) => n < 1 || n > shown.length)
      ) {
        return { drop: 'outOfRange' };
      }
      const chosen =
        offer.lineNumbers === 'all'
          ? left
          : offer.lineNumbers.flatMap((n) => shown[n - 1] ?? []);
      const going = chosen.filter((unit) => left.includes(unit));
      if (going.length === 0) return { drop: 'allUndone' };
      return {
        candidate: {
          executionId: offer.executionId,
          offer,
          going,
          staying: left.filter((unit) => !going.includes(unit)),
          said: execution.said ?? null,
        },
      };
    },
  );
  const candidates = read.flatMap((entry) =>
    'candidate' in entry ? [entry.candidate] : [],
  );
  const dropped = read.flatMap((entry) =>
    'drop' in entry ? [entry.drop] : [],
  );
  const base = {
    kind: 'undoOffer' as const,
    builtBy: 'code' as const,
    lead: input.lead,
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [],
    dateMode: null,
    number: null,
    aboutRef: null,
    answer: null,
  };
  const toQuestion = (
    sealed: Record<string, unknown> & {
      shape: string;
      prompt: string;
      options: {
        id: string;
        label: string;
        detail: string | null;
        ref: null;
      }[];
    },
  ): PlannedQuestion => ({
    id: input.newId(),
    state: {
      kind: 'undoOffer',
      shape: sealed.shape,
      askedAt: input.now,
      answeredAt: null,
      skippedAt: null,
      dismissedAt: null,
      reaskedAt: null,
    },
    sealed,
    spoken: [
      input.lead ? toSentence(input.lead) : null,
      buildSpokenQuestion(sealed),
    ]
      .filter(Boolean)
      .join(' '),
  });
  if (candidates.length === 0) return { question: null, dropped };
  if (candidates.length === 1) {
    const [only] = candidates;
    return {
      dropped,
      question: toQuestion({
        ...base,
        shape: 'yesNo',
        prompt: buildUndoOfferPrompt(only.going, only.staying),
        options: [
          { id: 'yes', label: 'Undo it', detail: null, ref: null },
          { id: 'no', label: 'Keep it', detail: null, ref: null },
        ],
        heldCommands: [{ kind: 'undoOffer', choices: [toChoice('yes', only)] }],
      }),
    };
  }
  return {
    dropped,
    question: toQuestion({
      ...base,
      shape: 'pickOne',
      prompt: 'Which of these should be undone?',
      options: [
        ...candidates.map((candidate, index) => ({
          id: `c${index + 1}`,
          label: capital(listUndoLines(candidate.going, OPTION_CAP)),
          detail: candidate.said ? candidate.said.slice(0, DETAIL_CAP) : null,
          ref: null,
        })),
        { id: 'keep', label: 'Keep everything', detail: null, ref: null },
      ],
      heldCommands: [
        {
          kind: 'undoOffer',
          choices: candidates.map((candidate, index) =>
            toChoice(`c${index + 1}`, candidate),
          ),
        },
      ],
    }),
  };
}
