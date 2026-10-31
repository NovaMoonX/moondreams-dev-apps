import { useState } from 'react';

import { settlePipelineAsk } from '@lib/admin/pipelineAnswers';
import type {
  PipelineSettledAsk,
  PipelineSettleOutcome,
} from '@lib/admin/pipelineTypes';

import { toSettleId, type SettleTarget } from './pipelineUtils';

type Choice = PipelineSettleOutcome | 'open';

const isSame = (target: SettleTarget) => (ask: PipelineSettledAsk) =>
  toSettleId(ask) === toSettleId(target);

const without = <T>(record: Record<string, T>, id: string) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== id));

/** Ticking off or setting aside one ask at a time, shown at once and undone on its own line; only that ask's controls wait on the write. */
export function usePipelineSettle(stored: PipelineSettledAsk[]) {
  // Kept for the page's life, so a tick shows before the listener catches up and an undo before the stored one goes.
  const [local, setLocal] = useState<Record<string, PipelineSettledAsk | null>>(
    {},
  );
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const asks = [
    ...stored.filter((ask) => !(toSettleId(ask) in local)),
    ...Object.values(local).flatMap((ask) => (ask === null ? [] : [ask])),
  ];

  const settle = async (target: SettleTarget, choice: Choice) => {
    const id = toSettleId(target);
    if (busy[id]) return;
    const previous =
      id in local ? local[id] : (stored.find(isSame(target)) ?? null);
    const next: PipelineSettledAsk | null =
      choice === 'open' ? null : { ...target, outcome: choice, at: Date.now() };
    setLocal((current) => ({ ...current, [id]: next }));
    setBusy((current) => ({ ...current, [id]: true }));
    setErrors((current) => without(current, id));
    const fail = (message: string) => {
      setLocal((current) => ({ ...current, [id]: previous }));
      setErrors((current) => ({ ...current, [id]: message }));
    };
    try {
      const result = await settlePipelineAsk({ ...target, outcome: choice });
      if (!result.ok) fail(result.error ?? "Couldn't update it.");
      else if (next !== null && result.at !== null) {
        const at = result.at;
        setLocal((current) => ({ ...current, [id]: { ...next, at } }));
      }
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      fail(
        code === 'functions/failed-precondition'
          ? "Answering isn't set up yet."
          : "Couldn't reach the server. It's as it was.",
      );
    } finally {
      setBusy((current) => without(current, id));
    }
  };

  return {
    asks,
    settle,
    isBusy: (target: SettleTarget) => busy[toSettleId(target)] === true,
    getError: (target: SettleTarget) => errors[toSettleId(target)] ?? null,
  };
}

export type PipelineSettle = ReturnType<typeof usePipelineSettle>;
