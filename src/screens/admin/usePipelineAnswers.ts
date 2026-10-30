import { useRef, useState } from 'react';

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
  choice: string | null;
  note: string;
}

export interface SentPr {
  prNumber: number;
  url: string | null;
}

const EMPTY: AnswerDraft = { choice: null, note: '' };

export const getChoiceText = (label: string) => stripLinks(label).slice(0, 300);

const isAnswered = (draft: AnswerDraft | undefined) =>
  draft !== undefined && (draft.choice !== null || draft.note.trim() !== '');

const toItem = (slot: AnswerSlot, draft: AnswerDraft) => ({
  question: slot.question,
  choice: draft.choice,
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
    try {
      const results = await sendPipelineAnswers(answers);
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
      return results.every((result) => result.ok);
    } catch (error) {
      const code = (error as { code?: unknown }).code;
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
    setChoice: (id: string, choice: string | null) => setDraft(id, { choice }),
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
