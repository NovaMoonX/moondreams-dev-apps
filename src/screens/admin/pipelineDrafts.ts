import { toLineMark } from '@lib/admin/pipelineMarks';
import type { PipelineIssueRequest } from '@lib/admin/pipelineAnswers';

import {
  isListedSlot,
  splitOtherOption,
  stripLinks,
  type AnswerSlot,
} from './pipelineUtils';

export interface AnswerDraft {
  choices: string[];
  // Null until Other is picked.
  other: string | null;
  note: string;
  // Keyed by line text, not place: a rewritten list can move lines, and words must stay with their own.
  changes: Record<string, string>;
}

export const EMPTY_DRAFT: AnswerDraft = {
  choices: [],
  other: null,
  note: '',
  changes: {},
};

const KEEP_ALL = 'Sounds good, keep them all';
const KEEP_REST = 'Keep the rest';
const DO_THIS = 'Do this';
const NOT_NOW_ALL = 'Not now for all';
const NOT_NOW_REST = 'Not now for the rest';

/** A listed slot's ticked lines still in the list, with their words; a draft for a line that is gone is ignored. */
export const getTicked = (slot: AnswerSlot, draft: AnswerDraft) =>
  slot.lines.flatMap((line) =>
    draft.changes[line] === undefined
      ? []
      : [{ line, words: draft.changes[line].trim() }],
  );

/** A decision ticked to change with nothing yet said about what instead. */
export const getUnfinishedCount = (slot: AnswerSlot, draft: AnswerDraft) =>
  slot.kind === 'decision'
    ? getTicked(slot, draft).filter((row) => row.words === '').length
    : 0;

/** A decision or follow-up list with nothing ticked: it keeps every line unless the owner touches it. */
export const isKeepDefault = (slot: AnswerSlot, draft: AnswerDraft) =>
  isListedSlot(slot) && getTicked(slot, draft).length === 0;

// A listed slot is ready unless a ticked decision still needs words; the rest need any pick or text.
export const isAnswered = (slot: AnswerSlot, draft: AnswerDraft) => {
  if (isListedSlot(slot)) return getUnfinishedCount(slot, draft) === 0;
  return (
    draft.choices.length > 0 ||
    (draft.other ?? '').trim() !== '' ||
    draft.note.trim() !== ''
  );
};

const toItem = (slot: AnswerSlot, draft: AnswerDraft) => ({
  question: slot.question,
  choices: draft.choices,
  other: (draft.other ?? '').trim() === '' ? null : (draft.other ?? '').trim(),
  note: draft.note.trim() === '' ? null : draft.note.trim(),
});

export const toLine = (line: string) => stripLinks(line).slice(0, 500);

const toKeep = (slot: AnswerSlot, choice: string) => ({
  question: slot.question,
  choices: [choice],
  other: null,
  note: null,
});

// Nothing ticked keeps every call; otherwise each ticked call is one item with its words, and the rest are kept in one more.
const toDecisionItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  const ticked = getTicked(slot, draft);
  if (ticked.length === 0) return [toKeep(slot, KEEP_ALL)];
  return [
    ...ticked.map(({ line, words }) => ({
      question: toLine(line),
      choices: [],
      other: words,
      note: null,
    })),
    ...(ticked.length < slot.lines.length ? [toKeep(slot, KEEP_REST)] : []),
  ];
};

// Each ticked follow-up is one item (its note is optional); unticked ones are not now.
const toFollowUpItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  const ticked = getTicked(slot, draft);
  if (ticked.length === 0) return [toKeep(slot, NOT_NOW_ALL)];
  return [
    ...ticked.map(({ line, words }) => ({
      question: toLine(line),
      choices: [DO_THIS],
      other: null,
      note: words === '' ? null : words,
    })),
    ...(ticked.length < slot.lines.length ? [toKeep(slot, NOT_NOW_REST)] : []),
  ];
};

export const toItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  if (slot.kind === 'decision') return toDecisionItems(slot, draft);
  if (slot.kind === 'followup') return toFollowUpItems(slot, draft);
  return [toItem(slot, draft)];
};

const LINE_KINDS = { decision: 'd', followup: 'f' } as const;

/** What a slot's answer marks as answered: one mark per line of a list, one for anything else. */
export const toMarks = (slot: AnswerSlot) => {
  if (slot.kind === 'decision' || slot.kind === 'followup') {
    return slot.lines.map((line) =>
      toLineMark(
        slot.prNumber,
        LINE_KINDS[slot.kind as 'decision' | 'followup'],
        line,
      ),
    );
  }
  return slot.mark === null ? [] : [slot.mark];
};

// Only a merged pull request has no branch left to change, so only there does a changed decision or picked follow-up become an issue.
export const toIssues = (
  slot: AnswerSlot,
  draft: AnswerDraft,
): PipelineIssueRequest[] =>
  slot.isMerged && isListedSlot(slot)
    ? getTicked(slot, draft).map(({ line, words }) => ({
        kind: slot.kind === 'decision' ? 'change' : 'followUp',
        title: splitOtherOption(toLine(line)).choice,
        words,
        mark: toLineMark(
          slot.prNumber,
          LINE_KINDS[slot.kind as 'decision' | 'followup'],
          line,
        ),
      }))
    : [];

const noun = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** What the one send button says and tells the owner, for the slots on a screen. */
export function getSendState(
  scope: AnswerSlot[],
  isSent: (slot: AnswerSlot) => boolean,
  getDraft: (slot: AnswerSlot) => AnswerDraft,
) {
  const open = scope.filter((slot) => !isSent(slot));
  const ready = open.filter((slot) => isAnswered(slot, getDraft(slot)));
  const touched = ready.filter((slot) => !isKeepDefault(slot, getDraft(slot)));
  const unfinished = open.reduce(
    (sum, slot) => sum + getUnfinishedCount(slot, getDraft(slot)),
    0,
  );
  const hasUnanswered = open.some(
    (slot) =>
      (slot.kind === 'question' || slot.kind === 'reply') &&
      !isAnswered(slot, getDraft(slot)),
  );
  const kept = (kind: 'decision' | 'followup') =>
    ready
      .filter(
        (slot) => slot.kind === kind && isKeepDefault(slot, getDraft(slot)),
      )
      .reduce((sum, slot) => sum + slot.lines.length, 0);
  const decisions = kept('decision');
  const followUps = kept('followup');
  return {
    readyCount: ready.length,
    touched: touched.length,
    unfinished,
    // Sounds good only when the screen has nothing else to send; a ticked or typed answer, or an open question, is a send.
    label:
      touched.length === 0 && !hasUnanswered && unfinished === 0
        ? 'Sounds good'
        : 'Send answers',
    holdNote:
      unfinished > 0
        ? `Say what you'd rather have for ${noun(unfinished, 'decision', 'decisions')}`
        : null,
    keepNote:
      [
        decisions > 0
          ? `Keeping ${noun(decisions, 'decision', 'decisions')}`
          : null,
        followUps > 0
          ? `${decisions > 0 ? '' : 'Leaving '}${noun(followUps, 'follow-up', 'follow-ups')} for later`
          : null,
      ]
        .filter((part) => part !== null)
        .join(' · ') || null,
  };
}
