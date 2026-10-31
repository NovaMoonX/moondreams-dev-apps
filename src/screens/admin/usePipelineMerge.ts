import { useState } from 'react';

import { mergePipelinePr } from '@lib/admin/pipelineAnswers';

import type { MergeTarget } from './pipelineUtils';

type MergeDone = 'asked' | 'merged' | 'sample-asked' | 'sample-merged';

const without = <T>(record: Record<number, T>, key: number) =>
  Object.fromEntries(
    Object.entries(record).filter(([other]) => Number(other) !== key),
  );

/** Merging one pull request at a time from its sheet: what each click did, or why it didn't. */
export function usePipelineMerge() {
  const [busy, setBusy] = useState<Record<number, true>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Record<number, MergeDone>>({});

  const [allNote, setAllNote] = useState<string | null>(null);
  const [isMergingAll, setIsMergingAll] = useState(false);

  const merge = async (prNumber: number): Promise<MergeDone | null> => {
    if (busy[prNumber] || done[prNumber]) return null;
    setBusy((current) => ({ ...current, [prNumber]: true }));
    setErrors((current) => without(current, prNumber));
    try {
      const result = await mergePipelinePr(prNumber);
      if (result.ok && result.outcome !== null) {
        const outcome: MergeDone = result.isSample
          ? `sample-${result.outcome}`
          : result.outcome;
        setDone((current) => ({ ...current, [prNumber]: outcome }));
        const note = result.error;
        if (note !== null)
          setErrors((current) => ({ ...current, [prNumber]: note }));
        return outcome;
      } else {
        setErrors((current) => ({
          ...current,
          [prNumber]: result.error ?? "Couldn't merge it.",
        }));
      }
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      // A dropped connection or a timeout can come after GitHub merged it, so only a refusal before the call says nothing happened.
      setErrors((current) => ({
        ...current,
        [prNumber]:
          code === 'functions/failed-precondition'
            ? "Merging isn't set up yet."
            : code === 'functions/permission-denied' ||
                code === 'functions/invalid-argument'
              ? 'The server refused it. Nothing was merged.'
              : "Couldn't hear back from the server. Open the pull request to check before trying again.",
      }));
    } finally {
      setBusy((current) => without(current, prNumber));
    }
    return null;
  };

  // Sessions line up on their own; the server merges one pull request per deploy, so the rest wait and say so.
  const mergeAll = async (targets: MergeTarget[]) => {
    setIsMergingAll(true);
    setAllNote(null);
    const driven = targets.filter((target) => target.isDriven);
    const direct = [...targets.filter((target) => !target.isDriven)].sort(
      (a, b) => Number(b.base === 'main') - Number(a.base === 'main'),
    );
    const askedOutcomes = await driven.reduce<Promise<MergeDone[]>>(
      async (all, target) => {
        const outcome = await merge(target.prNumber);
        return outcome === null ? all : [...(await all), outcome];
      },
      Promise.resolve([]),
    );
    const firstMerge = await direct.reduce<
      Promise<{ prNumber: number; outcome: MergeDone } | null>
    >(async (found, target) => {
      const earlier = await found;
      if (earlier !== null) return earlier;
      const outcome = await merge(target.prNumber);
      return outcome === null ? null : { prNumber: target.prNumber, outcome };
    }, Promise.resolve(null));
    const asked = askedOutcomes.length;
    const merged = firstMerge?.prNumber ?? null;
    const isSample = [...askedOutcomes, firstMerge?.outcome].some((outcome) =>
      outcome?.startsWith('sample'),
    );
    const waiting = direct.filter(
      (target) => merged !== null && target.prNumber !== merged,
    );
    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(
        waiting.map((target) => [
          target.prNumber,
          `Waits for the deploy of #${merged}. Merge it once that finishes.`,
        ]),
      ),
    }));
    const parts = [
      asked > 0
        ? `asked ${asked} ${asked === 1 ? 'session' : 'sessions'} to merge`
        : null,
      merged !== null ? `merged #${merged}` : null,
      waiting.length > 0
        ? `${waiting.length} ${waiting.length === 1 ? 'waits' : 'wait'} for its deploy`
        : null,
      driven.length - asked + (merged === null ? direct.length : 0) > 0
        ? "some didn't go: open each to see why"
        : null,
    ].filter((part): part is string => part !== null);
    const line = parts
      .join(' · ')
      .replace(/^./, (first) => first.toUpperCase());
    setAllNote(
      isSample ? `Sample, nothing was changed: ${parts.join(' · ')}` : line,
    );
    setIsMergingAll(false);
  };

  return {
    merge,
    mergeAll,
    isMergingAll,
    allNote,
    isBusy: (prNumber: number) => busy[prNumber] === true,
    getError: (prNumber: number) => errors[prNumber] ?? null,
    getDone: (prNumber: number) => done[prNumber] ?? null,
  };
}

export type PipelineMerge = ReturnType<typeof usePipelineMerge>;
