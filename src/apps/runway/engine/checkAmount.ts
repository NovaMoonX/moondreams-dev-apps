import { PRIORITIES } from '@apps/runway/constants';
import type { Cents, Priority } from '@apps/runway/types';

export interface CheckEnvelope {
  id: string;
  priority: Priority;
  /** What the envelope holds now; below zero when it is over. */
  leftCents: Cents;
}

export interface CheckSource {
  envelopeId: string;
  takeCents: Cents;
  leftAfterCents: Cents;
}

export type AmountCheck =
  | { kind: 'fits'; leftAfterCents: Cents }
  | {
      kind: 'over';
      overCents: Cents;
      /** Other envelopes with room, lowest priority first, with what each would give. */
      sources: CheckSource[];
      /** What no envelope could cover; it comes out of Free to spend. */
      uncoveredCents: Cents;
    };

/** Whether `cents` fits in an envelope; if not, by how much, and which other envelopes could cover it (lowest priority first, the list order within a priority). Nothing moves. */
export function checkAmount(
  envelopeId: string,
  cents: Cents,
  envelopes: readonly CheckEnvelope[],
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
    { sources: [], needed: overCents },
  );
  return {
    kind: 'over',
    overCents,
    sources: filled.sources,
    uncoveredCents: filled.needed,
  };
}
