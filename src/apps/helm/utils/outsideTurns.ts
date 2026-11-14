import { HELM_COPY } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';

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
