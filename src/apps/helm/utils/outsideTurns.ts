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

export interface OutsideAdditions {
  /** Records the outside turns since the person last looked made or changed, not counting what was taken back. */
  count: number;
  /** True when every one of them was made rather than changed. */
  isAllNew: boolean;
  /** The assistants that made them, in the order they first appear. */
  vias: string[];
  /** The one record's title when exactly one was made; null otherwise. */
  title: string | null;
}

/** A filed note also marks its topic behind; the topic is not a second thing the assistant changed. */
const changedRefs = (execution: OpenExecution) =>
  execution.effectRefs.filter(
    (ref) =>
      ref.op === 'create' ||
      (ref.op === 'update' &&
        !(
          ref.collection === 'topics' &&
          execution.effectRefs.some(
            (other) => other.op === 'create' && other.collection === 'notes',
          )
        )),
  );

/** What outside assistants made or changed since `since`; an answer, a failed or undone turn, and an execution not loaded yet count for nothing. */
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
        .map((id) => executionsById.get(id))
        .filter(
          (execution): execution is OpenExecution =>
            execution !== undefined &&
            execution.state === 'succeeded' &&
            execution.undoneByExecutionId === null,
        )
        .flatMap((execution) =>
          changedRefs(execution).map((ref) => ({
            via: capture.via || HELM_COPY.outsideUnnamed,
            ref,
          })),
        ),
    );
  const only =
    made.length === 1 && made[0].ref.op === 'create' ? made[0].ref : null;
  return {
    count: made.length,
    isAllNew: made.every((entry) => entry.ref.op === 'create'),
    vias: [...new Set(made.map((entry) => entry.via))],
    title: only === null ? null : titleOf(only),
  };
}
