import { useRef, useState } from 'react';

import { generateToken } from '@/utils';

import {
  MAX_ANSWER_ITEMS,
  sendPipelineAnswers,
  type PipelineAnswersForPr,
  type PipelineIssueResult,
} from '@lib/admin/pipelineAnswers';

import {
  getAnswerSlots,
  isListedSlot,
  splitOtherOption,
  stripLinks,
  type AnswerSlot,
  type PipelineEntry,
} from './pipelineUtils';

export interface AnswerDraft {
  choices: string[];
  // Null until Other is picked.
  other: string | null;
  note: string;
  // A decision or follow-up slot's ticked lines, keyed by the line's text so a rewritten status can't attach words to another line: what it should be instead (decisions) or what to add (follow-ups).
  changes: Record<string, string>;
}

export interface SentPr {
  prNumber: number;
  url: string | null;
}

const EMPTY: AnswerDraft = { choices: [], other: null, note: '', changes: {} };

const KEEP_ALL = 'Sounds good, keep them all';
const KEEP_REST = 'Keep the rest';
const DO_THIS = 'Do this';
const NOT_NOW_ALL = 'Not now for all';
const NOT_NOW_REST = 'Not now for the rest';

export const getChoiceText = (label: string) => stripLinks(label).slice(0, 300);

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

/** A decision or follow-up list with nothing ticked: it sends Sounds good or Not now unless the owner touches it. */
export const isKeepDefault = (slot: AnswerSlot, draft: AnswerDraft) =>
  isListedSlot(slot) && getTicked(slot, draft).length === 0;

// A listed slot is ready unless a ticked decision still needs words; the rest need any pick or text.
const isAnswered = (slot: AnswerSlot, draft: AnswerDraft) => {
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

const toLine = (line: string) => stripLinks(line).slice(0, 500);

// Nothing ticked keeps every call; otherwise each ticked call is one item with its words, and the rest are kept in one more.
const toDecisionItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  const ticked = getTicked(slot, draft);
  const keep = (choice: string) => ({
    question: slot.question,
    choices: [choice],
    other: null,
    note: null,
  });
  if (ticked.length === 0) return [keep(KEEP_ALL)];
  return [
    ...ticked.map(({ line, words }) => ({
      question: toLine(line),
      choices: [],
      other: words,
      note: null,
    })),
    ...(ticked.length < slot.lines.length ? [keep(KEEP_REST)] : []),
  ];
};

// Each ticked follow-up is one item (its note is optional); unticked ones are not now.
const toFollowUpItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  const ticked = getTicked(slot, draft);
  const notNow = (choice: string) => ({
    question: slot.question,
    choices: [choice],
    other: null,
    note: null,
  });
  if (ticked.length === 0) return [notNow(NOT_NOW_ALL)];
  return [
    ...ticked.map(({ line, words }) => ({
      question: toLine(line),
      choices: [DO_THIS],
      other: null,
      note: words === '' ? null : words,
    })),
    ...(ticked.length < slot.lines.length ? [notNow(NOT_NOW_REST)] : []),
  ];
};

const toItems = (slot: AnswerSlot, draft: AnswerDraft) => {
  if (slot.kind === 'decision') return toDecisionItems(slot, draft);
  if (slot.kind === 'followup') return toFollowUpItems(slot, draft);
  return [toItem(slot, draft)];
};

// On a merged pull request these become issues: a changed decision and a ticked follow-up.
const toIssues = (slot: AnswerSlot, draft: AnswerDraft) =>
  slot.kind === 'decision' || slot.kind === 'followup'
    ? getTicked(slot, draft).map(({ line, words }) => ({
        kind: slot.kind === 'decision' ? ('change' as const) : ('followUp' as const),
        title: splitOtherOption(toLine(line)).choice,
        words,
      }))
    : [];

const toIssueNote = (
  issues: PipelineIssueResult[],
  isSample: boolean,
) => {
  if (issues.length === 0) return null;
  const made = issues.filter((issue) => issue.isMade).length;
  const noun = (count: number) => `${count} ${count === 1 ? 'issue' : 'issues'}`;
  if (isSample) return `Would open ${noun(issues.length)} (merged).`;
  if (made === issues.length) return `Opened ${noun(made)}.`;
  return `Opened ${noun(made)}; ${issues.length - made} couldn't be opened. Open them from the PR's comment.`;
};

/** The owner's unsent answers across every waiting entry, and the one send that turns them into a comment per pull request. */
export function usePipelineAnswers(entries: PipelineEntry[]) {
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  // Server time of each posted comment, so a sent mark outlasts only the status comment written before it.
  const [sentAt, setSentAt] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [lastSent, setLastSent] = useState<SentPr[]>([]);
  const [unsure, setUnsure] = useState<SentPr[]>([]);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [issueNote, setIssueNote] = useState<string | null>(null);
  const [isNotSetUp, setIsNotSetUp] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  // Kept after a send whose outcome is unknown, so retrying it can't post a second comment.
  const attemptRef = useRef<string | null>(null);

  const slots = entries.flatMap(getAnswerSlots);
  // A sent answer shows as sent until its pull request's status comment is newer than the send.
  // Feedback can be sent again at once, so it never waits on the next status.
  const isSent = (slot: AnswerSlot) =>
    slot.kind !== 'feedback' &&
    sentAt[slot.id] !== undefined &&
    slot.statusAt <= sentAt[slot.id];
  const getDraft = (id: string) => drafts[id] ?? EMPTY;
  const getReady = (scope: AnswerSlot[]) =>
    scope.filter((slot) => !isSent(slot) && isAnswered(slot, getDraft(slot.id)));
  // One comment holds the most items; a pull request's ticks stop at it.
  const getItemCount = (prNumber: number) =>
    getReady(slots.filter((slot) => slot.prNumber === prNumber)).reduce(
      (sum, slot) => sum + toItems(slot, getDraft(slot.id)).length,
      0,
    );

  const setDraft = (id: string, patch: Partial<AnswerDraft>) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? EMPTY), ...patch },
    }));

  const send = async (scope: AnswerSlot[]) => {
    const ready = getReady(scope);
    if (ready.length === 0 || sendingRef.current) return false;
    const answers = ready.reduce<PipelineAnswersForPr[]>((all, slot) => {
      const draft = getDraft(slot.id);
      const items = toItems(slot, draft);
      const issues = toIssues(slot, draft);
      const marks = slot.mark === null ? [] : [slot.mark];
      const existing = all.find((entry) => entry.prNumber === slot.prNumber);
      return existing
        ? all.map((entry) =>
            entry === existing
              ? {
                  ...entry,
                  items: [...entry.items, ...items],
                  issues: [...entry.issues, ...issues],
                  marks: [...entry.marks, ...marks],
                }
              : entry,
          )
        : [...all, { prNumber: slot.prNumber, items, issues, marks }];
    }, []);
    sendingRef.current = true;
    setIsSending(true);
    setSendNote(null);
    setIssueNote(null);
    setUnsure([]);
    const attempt = attemptRef.current ?? generateToken(24);
    attemptRef.current = attempt;
    try {
      const { results, isSample } = await sendPipelineAnswers(
        answers,
        attempt,
      );
      attemptRef.current = null;
      const done = results.filter((result) => result.ok);
      const doneNumbers = new Set(done.map((result) => result.prNumber));
      const doneSlots = ready.filter((slot) => doneNumbers.has(slot.prNumber));
      setSentAt((current) => ({
        ...current,
        ...Object.fromEntries(
          doneSlots.map((slot) => [
            slot.id,
            results.find((result) => result.prNumber === slot.prNumber)
              ?.postedAt ?? Date.now(),
          ]),
        ),
      }));
      setDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([id]) => !doneSlots.some((slot) => slot.id === id),
          ),
        ),
      );
      setErrors((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(
            ([prNumber]) => !doneNumbers.has(Number(prNumber)),
          ),
        ),
        ...Object.fromEntries(
          results
            .filter((result) => !result.ok)
            .map((result) => [
              result.prNumber,
              result.error ?? "Couldn't send these.",
            ]),
        ),
      }));
      setLastSent(done.map(({ prNumber, url }) => ({ prNumber, url })));
      setIssueNote(
        toIssueNote(
          results.flatMap((result) => result.issues ?? []),
          isSample,
        ),
      );
      if (isSample) setSendNote('Local test: nothing was posted to GitHub.');
      return results.every((result) => result.ok);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (
        code === 'functions/failed-precondition' ||
        code === 'functions/invalid-argument' ||
        code === 'functions/permission-denied'
      ) {
        attemptRef.current = null;
      }
      if (code === 'functions/failed-precondition') {
        setIsNotSetUp(true);
        return false;
      }
      if (
        code === 'functions/invalid-argument' ||
        code === 'functions/permission-denied'
      ) {
        setSendNote("Couldn't send your answers. They're still here.");
        return false;
      }
      // A timeout or a dropped connection says nothing about whether GitHub got the comment.
      setUnsure(
        answers.map(({ prNumber }) => ({
          prNumber,
          url:
            entries
              .flatMap((entry) => entry.prs)
              .find((pr) => pr.number === prNumber)?.url ?? null,
        })),
      );
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  return {
    slots,
    isSending,
    errors,
    lastSent,
    sendNote,
    issueNote,
    unsure,
    isNotSetUp,
    isSent,
    getDraft,
    setChoices: (id: string, choices: string[], other: string | null) =>
      setDraft(id, { choices, other }),
    setOther: (id: string, other: string) => setDraft(id, { other }),
    setNote: (id: string, note: string) => setDraft(id, { note }),
    // Null unticks the line.
    setChange: (id: string, line: string, words: string | null) =>
      setDrafts((current) => {
        const kept = Object.fromEntries(
          Object.entries(current[id]?.changes ?? {}).filter(
            ([text]) => text !== line,
          ),
        );
        return {
          ...current,
          [id]: {
            ...(current[id] ?? EMPTY),
            changes: words === null ? kept : { ...kept, [line]: words },
          },
        };
      }),
    isAtLimit: (prNumber: number) => getItemCount(prNumber) >= MAX_ANSWER_ITEMS,
    /** Slots the owner has answered, leaving out a decision or follow-up list still on its default. */
    getTouchedCount: (scope: AnswerSlot[] = slots) =>
      getReady(scope).filter((slot) => !isKeepDefault(slot, getDraft(slot.id)))
        .length,
    /** What the screen's one send button says and what it tells the owner about the lists it will send untouched. */
    getSendState: (scope: AnswerSlot[]) => {
      const touched = getReady(scope).filter(
        (slot) => !isKeepDefault(slot, getDraft(slot.id)),
      ).length;
      const unfinished = scope
        .filter((slot) => !isSent(slot))
        .reduce((sum, slot) => sum + getUnfinishedCount(slot, getDraft(slot.id)), 0);
      const kept = (kind: 'decision' | 'followup') =>
        scope
          .filter(
            (slot) =>
              slot.kind === kind &&
              !isSent(slot) &&
              isKeepDefault(slot, getDraft(slot.id)),
          )
          .reduce((sum, slot) => sum + slot.lines.length, 0);
      const decisions = kept('decision');
      const followUps = kept('followup');
      const getLabel = () => {
        if (touched > 0) return 'Send answers';
        if (decisions > 0) return 'Sounds good';
        return followUps > 0 ? 'Not now' : 'Send answers';
      };
      return {
        readyCount: getReady(scope).length,
        touched,
        unfinished,
        label: getLabel(),
        holdNote:
          unfinished > 0
            ? `Say what you'd rather have for ${unfinished} ${unfinished === 1 ? 'decision' : 'decisions'}`
            : null,
        keepNote:
          [
            decisions > 0
              ? `Keeping ${decisions} ${decisions === 1 ? 'decision' : 'decisions'} as they are`
              : null,
            followUps > 0
              ? `Leaving ${followUps} ${followUps === 1 ? 'follow-up' : 'follow-ups'} for later`
              : null,
          ]
            .filter((line) => line !== null)
            .join('; ') || null,
      };
    },
    getReadyCount: (scope: AnswerSlot[] = slots) => getReady(scope).length,
    clear: () => {
      setDrafts({});
      setErrors({});
      setSendNote(null);
      setIssueNote(null);
      setUnsure([]);
    },
    send,
  };
}

export type PipelineAnswers = ReturnType<typeof usePipelineAnswers>;
