import { useState } from 'react';

import { mergePipelinePr } from '@lib/admin/pipelineAnswers';

import type { MergeTarget } from './pipelineUtils';

type MergeDone = 'asked' | 'merged' | 'sample-asked' | 'sample-merged';
// `unknown`: the reply was lost, so GitHub may have merged it.
type MergeTry = MergeDone | 'refused' | 'unknown' | 'skipped' | 'held';

const without = <T>(record: Record<number, T>, key: number) =>
  Object.fromEntries(Object.entries(record).filter(([other]) => Number(other) !== key));

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Merging one pull request at a time from its sheet: what each click did, or why it didn't. */
export function usePipelineMerge() {
  const [busy, setBusy] = useState<Record<number, true>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Record<number, MergeDone>>({});
  const [allNote, setAllNote] = useState<string | null>(null);
  const [isMergingAll, setIsMergingAll] = useState(false);

  const merge = async (prNumber: number): Promise<MergeTry> => {
    if (busy[prNumber] || done[prNumber]) return 'skipped';
    setBusy((current) => ({ ...current, [prNumber]: true }));
    setErrors((current) => without(current, prNumber));
    try {
      const result = await mergePipelinePr(prNumber);
      if (result.ok && result.outcome !== null) {
        const outcome: MergeDone = result.isSample ? `sample-${result.outcome}` : result.outcome;
        setDone((current) => ({ ...current, [prNumber]: outcome }));
        const note = result.error;
        if (note !== null) setErrors((current) => ({ ...current, [prNumber]: note }));
        return outcome;
      }
      setErrors((current) => ({ ...current, [prNumber]: result.error ?? "Couldn't merge it." }));
      return 'refused';
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      // A dropped connection or a timeout can come after GitHub merged it, so only a refusal before the call says nothing happened.
      const isRefused =
        code === 'functions/failed-precondition' ||
        code === 'functions/permission-denied' ||
        code === 'functions/invalid-argument';
      setErrors((current) => ({
        ...current,
        [prNumber]:
          code === 'functions/failed-precondition'
            ? "Merging isn't set up yet."
            : isRefused
              ? "The server refused it. Nothing was merged."
              : "Couldn't hear back from the server. Open the pull request to check before trying again.",
      }));
      return isRefused ? 'refused' : 'unknown';
    } finally {
      setBusy((current) => without(current, prNumber));
    }
  };

  // Sessions line up on their own; the server merges one pull request per deploy, and nothing more after a reply it couldn't read.
  const mergeAll = async (targets: MergeTarget[]) => {
    setIsMergingAll(true);
    setAllNote(null);
    const ordered = [
      ...targets.filter((target) => target.isDriven),
      ...targets
        .filter((target) => !target.isDriven)
        .sort((a, b) => Number(b.base === 'main') - Number(a.base === 'main')),
    ];
    const tries = await ordered.reduce<Promise<{ prNumber: number; outcome: MergeTry }[]>>(
      async (earlier, target) => {
        const all = await earlier;
        const isStopped = all.some(({ outcome }) => outcome.endsWith('merged') || outcome === 'unknown');
        if (isStopped && !target.isDriven) return [...all, { prNumber: target.prNumber, outcome: 'held' }];
        return [...all, { prNumber: target.prNumber, outcome: await merge(target.prNumber) }];
      },
      Promise.resolve([]),
    );
    const count = (match: (outcome: MergeTry) => boolean) => tries.filter(({ outcome }) => match(outcome)).length;
    const mergedAll = tries.filter(({ outcome }) => outcome.endsWith('merged')).map(({ prNumber }) => `#${prNumber}`);
    const merged = tries.find(({ outcome }) => outcome.endsWith('merged'))?.prNumber ?? null;
    const unsure = tries.find(({ outcome }) => outcome === 'unknown')?.prNumber ?? null;
    const held = tries.filter(({ outcome }) => outcome === 'held').map(({ prNumber }) => prNumber);
    const waitLine =
      unsure !== null
        ? `Check #${unsure} on GitHub before merging this one.`
        : `Waits for the deploy of #${merged}. Merge it once that finishes.`;
    setErrors((current) => ({ ...current, ...Object.fromEntries(held.map((prNumber) => [prNumber, waitLine])) }));
    const asked = count((outcome) => outcome.endsWith('asked'));
    const failed = count((outcome) => outcome === 'refused' || outcome === 'unknown');
    const parts = [
      asked > 0 ? `asked ${plural(asked, 'session', 'sessions')} to merge` : null,
      mergedAll.length > 0 ? `merged ${mergedAll.join(', ')}` : null,
      held.length > 0 ? `${plural(held.length, 'waits', 'wait')} for ${unsure !== null ? 'you to check' : 'its deploy'}` : null,
      failed > 0 ? `${plural(failed, "didn't go", "didn't go")}: open each to see why` : null,
    ].filter((part): part is string => part !== null);
    const isSample = tries.some(({ outcome }) => outcome.startsWith('sample'));
    const line = parts.join(' · ');
    const note = isSample ? `Sample, nothing was changed: ${line}` : line.replace(/^./, (first) => first.toUpperCase());
    setAllNote(line === '' ? null : note);
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
