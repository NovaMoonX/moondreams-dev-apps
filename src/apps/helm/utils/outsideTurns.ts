import { HELM_COPY } from '@apps/helm/constants';
import type { EffectRef, OpenCapture, OpenExecution } from '@apps/helm/types';

export interface OutsideConversation {
  id: string;
  via: string;
  startedAt: number;
  endedAt: number;
  /** The turns in the order they were sent. */
  turns: OpenCapture[];
}

/** A turn an outside assistant sent; home's conversation never draws or counts one. */
export const isOutsideTurn = (capture: OpenCapture) => capture.medium === 'mcp';

/** The outside turns as conversations, newest first: one assistant's turns with less than `gapMs` between consecutive ones. */
export function groupOutsideConversations(
  captures: OpenCapture[],
  gapMs: number,
): OutsideConversation[] {
  const byVia = captures.filter(isOutsideTurn).reduce((groups, capture) => {
    const via = capture.via || HELM_COPY.outsideUnnamed;
    groups.set(via, [...(groups.get(via) ?? []), capture]);
    return groups;
  }, new Map<string, OpenCapture[]>());
  return [...byVia.entries()]
    .flatMap(([via, turns]) =>
      [...turns]
        .sort((a, b) => a.createdAt - b.createdAt || a.turnIndex - b.turnIndex)
        .reduce<OpenCapture[][]>((runs, capture) => {
          const run = runs.at(-1);
          return run && capture.createdAt - (run.at(-1)?.createdAt ?? 0) < gapMs
            ? [...runs.slice(0, -1), [...run, capture]]
            : [...runs, [capture]];
        }, [])
        .map((run) => ({
          id: run[0].id,
          via,
          startedAt: run[0].createdAt,
          endedAt: run[run.length - 1].createdAt,
          turns: run,
        })),
    )
    .sort((a, b) => b.endedAt - a.endedAt);
}

const isUndoneExecution = (execution: OpenExecution | undefined) =>
  execution !== undefined && execution.undoneByExecutionId !== null;

export interface OutsideAdditions {
  /** Executions of turns that arrived since the person last looked and were not taken back. */
  count: number;
  /** The assistants that made them, in the order they first appear. */
  vias: string[];
  /** The one thing's title when there is exactly one and it is already loaded; null otherwise. */
  title: string | null;
}

/** What outside assistants made since `since`: sorted turns with an execution that is not known to be undone and not dismissed. */
export function readOutsideAdditions(
  captures: OpenCapture[],
  since: number,
  executionsById: Map<string, OpenExecution>,
  titleOf: (ref: EffectRef) => string | null,
): OutsideAdditions {
  const made = captures
    .filter(
      (capture) =>
        isOutsideTurn(capture) &&
        capture.status === 'sorted' &&
        capture.dismissedAt === null &&
        capture.createdAt > since,
    )
    .flatMap((capture) =>
      capture.executionIds
        .filter((id) => !isUndoneExecution(executionsById.get(id)))
        .map((id) => ({
          via: capture.via || HELM_COPY.outsideUnnamed,
          execution: executionsById.get(id),
        })),
    );
  const only = made.length === 1 ? made[0].execution : undefined;
  return {
    count: made.length,
    vias: [...new Set(made.map((entry) => entry.via))],
    title:
      only?.effectRefs
        .filter((ref) => ref.op === 'create')
        .map(titleOf)
        .find((title) => title !== null) ?? null,
  };
}
