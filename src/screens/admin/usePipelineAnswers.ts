import { useRef, useState } from 'react';

import { generateToken } from '@/utils';

import {
  MAX_ANSWER_ITEMS,
  sendPipelineAnswers,
  type PipelineAnswersForPr,
  type PipelineIssueResult,
} from '@lib/admin/pipelineAnswers';

import {
  EMPTY_DRAFT as EMPTY,
  getSendState,
  isAnswered,
  isKeepDefault,
  toIssues,
  toItems,
  toMarks,
  type AnswerDraft,
} from './pipelineDrafts';
import {
  getAnswerSlots,
  stripLinks,
  type AnswerSlot,
  type PipelineEntry,
} from './pipelineUtils';

export type { AnswerDraft };

export interface SentPr {
  prNumber: number;
  url: string | null;
}

export const getChoiceText = (label: string) => stripLinks(label).slice(0, 300);

const toIssueNote = (issues: PipelineIssueResult[], isSample: boolean) => {
  if (issues.length === 0) return null;
  const made = issues.filter((issue) => issue.isMade).length;
  const noun = (count: number) => `${count} ${count === 1 ? 'issue' : 'issues'}`;
  if (isSample) return `Would open ${noun(issues.length)}.`;
  if (made === issues.length) return `Opened ${noun(made)}.`;
  return `Opened ${noun(made)}; ${issues.length - made} couldn't be opened. Send again to retry them.`;
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
      const marks = toMarks(slot);
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
      // A line whose issue could not be opened stays unsent, so it can be sent again.
      const failedPrs = new Set(
        done
          .filter(
            (result) =>
              !isSample && (result.issues ?? []).some((issue) => !issue.isMade),
          )
          .map((result) => result.prNumber),
      );
      const doneSlots = ready.filter(
        (slot) => doneNumbers.has(slot.prNumber) && !failedPrs.has(slot.prNumber),
      );
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
    getSendState: (scope: AnswerSlot[]) =>
      getSendState(scope, isSent, (slot) => getDraft(slot.id)),
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
