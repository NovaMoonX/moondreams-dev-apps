import { useState } from 'react';

import { mergePipelinePr } from '@lib/admin/pipelineAnswers';

type MergeDone = 'asked' | 'merged';

const without = <T>(record: Record<number, T>, key: number) =>
  Object.fromEntries(Object.entries(record).filter(([other]) => Number(other) !== key));

/** Merging one pull request at a time from its sheet: what each click did, or why it didn't. */
export function usePipelineMerge() {
  const [busy, setBusy] = useState<Record<number, true>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<Record<number, MergeDone>>({});

  const merge = async (prNumber: number) => {
    if (busy[prNumber] || done[prNumber]) return;
    setBusy((current) => ({ ...current, [prNumber]: true }));
    setErrors((current) => without(current, prNumber));
    try {
      const result = await mergePipelinePr(prNumber);
      if (result.ok && result.outcome !== null) {
        const outcome = result.outcome;
        setDone((current) => ({ ...current, [prNumber]: outcome }));
      } else {
        setErrors((current) => ({ ...current, [prNumber]: result.error ?? "Couldn't merge it." }));
      }
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      setErrors((current) => ({
        ...current,
        [prNumber]:
          code === 'functions/failed-precondition'
            ? "Merging isn't set up yet."
            : "Couldn't reach the server. Nothing was merged.",
      }));
    } finally {
      setBusy((current) => without(current, prNumber));
    }
  };

  return {
    merge,
    isBusy: (prNumber: number) => busy[prNumber] === true,
    getError: (prNumber: number) => errors[prNumber] ?? null,
    getDone: (prNumber: number) => done[prNumber] ?? null,
  };
}

export type PipelineMerge = ReturnType<typeof usePipelineMerge>;
