import { PRIORITIES } from '@apps/runway/constants';
import type { Cents, Priority } from '@apps/runway/types';

export interface CheckEnvelope {
  id: string;
  priority: Priority;
  /** What the envelope holds now; below zero when it is over. */
  leftCents: Cents;
}

export interface CheckSource {
  /** Null is Free to spend. */
  envelopeId: string | null;
  takeCents: Cents;
  leftAfterCents: Cents;
}

export type AmountCheck =
  | { kind: 'fits'; leftAfterCents: Cents }
  | {
      kind: 'over';
      overCents: Cents;
      /** Free to spend when it holds money, then other envelopes with room, lowest priority first, with what each would give. */
      sources: CheckSource[];
      /** What neither Free to spend nor another envelope could cover. */
      uncoveredCents: Cents;
    };

/** Whether `cents` fits in an envelope; if not, by how much, and what could cover it: Free to spend when it holds money, then other envelopes (lowest priority first, the list order within a priority). Nothing moves. */
export function checkAmount(
  envelopeId: string,
  cents: Cents,
  envelopes: readonly CheckEnvelope[],
  freeCents: Cents = 0,
): AmountCheck {
  const target = envelopes.find((envelope) => envelope.id === envelopeId);
  const leftAfterCents = (target?.leftCents ?? 0) - cents;
  if (leftAfterCents >= 0) return { kind: 'fits', leftAfterCents };

  const overCents = -leftAfterCents;
  const candidates = envelopes
    .filter((envelope) => envelope.id !== envelopeId && envelope.leftCents > 0)
    .map((envelope, index) => ({ envelope, index }))
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(b.envelope.priority) -
          PRIORITIES.indexOf(a.envelope.priority) || a.index - b.index,
    );
  const fromFree = Math.min(Math.max(0, freeCents), overCents);
  const first: CheckSource[] =
    fromFree > 0
      ? [
          {
            envelopeId: null,
            takeCents: fromFree,
            leftAfterCents: freeCents - fromFree,
          },
        ]
      : [];
  const filled = candidates.reduce<{ sources: CheckSource[]; needed: Cents }>(
    (acc, { envelope }) => {
      if (acc.needed === 0) return acc;
      const takeCents = Math.min(envelope.leftCents, acc.needed);
      return {
        sources: [
          ...acc.sources,
          {
            envelopeId: envelope.id,
            takeCents,
            leftAfterCents: envelope.leftCents - takeCents,
          },
        ],
        needed: acc.needed - takeCents,
      };
    },
    { sources: first, needed: overCents - fromFree },
  );
  return {
    kind: 'over',
    overCents,
    sources: filled.sources,
    uncoveredCents: filled.needed,
  };
}
