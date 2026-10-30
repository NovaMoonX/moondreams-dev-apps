import { useRef, useState } from 'react';

import { generateToken } from '@/utils';

import {
  sendPipelineAnswers,
  type PipelineAnswersForPr,
} from '@lib/admin/pipelineAnswers';

import {
  getAnswerSlots,
  stripLinks,
  type AnswerSlot,
  type PipelineEntry,
} from './pipelineUtils';

export interface AnswerDraft {
  choices: string[];
  /** Null until Other is picked; then what the owner typed for it. */
  other: string | null;
  note: string;
}

export interface SentPr {
  prNumber: number;
  url: string | null;
}

const EMPTY: AnswerDraft = { choices: [], other: null, note: '' };

export const getChoiceText = (label: string) => stripLinks(label).slice(0, 300);

const isAnswered = (draft: AnswerDraft | undefined) =>
  draft !== undefined &&
  (draft.choices.length > 0 ||
    (draft.other ?? '').trim() !== '' ||
    draft.note.trim() !== '');

const toItem = (slot: AnswerSlot, draft: AnswerDraft) => ({
  question: slot.question,
  choices: draft.choices,
  other: (draft.other ?? '').trim() === '' ? null : (draft.other ?? '').trim(),
  note: draft.note.trim() === '' ? null : draft.note.trim(),
});

/** The owner's unsent answers across every waiting entry, and the one send that turns them into a comment per pull request. */
export function usePipelineAnswers(entries: PipelineEntry[]) {
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  // Server time of each posted comment, so a sent mark outlasts only the status comment written before it.
  const [sentAt, setSentAt] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [lastSent, setLastSent] = useState<SentPr[]>([]);
  const [unsure, setUnsure] = useState<SentPr[]>([]);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [isNotSetUp, setIsNotSetUp] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  // Kept after a send whose outcome is unknown, so retrying it can't post a second comment.
  const attemptRef = useRef<string | null>(null);

  const slots = entries.flatMap(getAnswerSlots);
  // A sent answer shows as sent until its pull request's status comment is newer than the send.
  const isSent = (slot: AnswerSlot) =>
    sentAt[slot.id] !== undefined && slot.statusAt <= sentAt[slot.id];
  const getDraft = (id: string) => drafts[id] ?? EMPTY;
  const getReady = (scope: AnswerSlot[]) =>
    scope.filter((slot) => !isSent(slot) && isAnswered(drafts[slot.id]));

  const setDraft = (id: string, patch: Partial<AnswerDraft>) =>
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? EMPTY), ...patch },
    }));

  const send = async (scope: AnswerSlot[]) => {
    const ready = getReady(scope);
    if (ready.length === 0 || sendingRef.current) return false;
    const answers = ready.reduce<PipelineAnswersForPr[]>((all, slot) => {
      const item = toItem(slot, getDraft(slot.id));
      const existing = all.find((entry) => entry.prNumber === slot.prNumber);
      return existing
        ? all.map((entry) =>
            entry === existing
              ? { ...entry, items: [...entry.items, item] }
              : entry,
          )
        : [...all, { prNumber: slot.prNumber, items: [item] }];
    }, []);
    sendingRef.current = true;
    setIsSending(true);
    setSendNote(null);
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
    unsure,
    isNotSetUp,
    isSent,
    getDraft,
    setChoices: (id: string, choices: string[], other: string | null) =>
      setDraft(id, { choices, other }),
    setOther: (id: string, other: string) => setDraft(id, { other }),
    setNote: (id: string, note: string) => setDraft(id, { note }),
    getReadyCount: (scope: AnswerSlot[] = slots) => getReady(scope).length,
    clear: () => {
      setDrafts({});
      setErrors({});
      setSendNote(null);
      setUnsure([]);
    },
    send,
  };
}

export type PipelineAnswers = ReturnType<typeof usePipelineAnswers>;
