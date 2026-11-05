import { PRIORITIES } from '@apps/runway/constants';
import { resolveSpill } from '@apps/runway/engine/spill';
import type { Cents, Priority } from '@apps/runway/types';

export interface CheckEnvelope {
  id: string;
  priority: Priority;
  /** What the envelope holds now; below zero when it is over. */
  leftCents: Cents;
}

export interface CheckSource {
  /** Null is Free to Spend. */
  envelopeId: string | null;
  takeCents: Cents;
  leftAfterCents: Cents;
}

export type AmountCheck =
  | { kind: 'fits'; leftAfterCents: Cents }
  | {
      kind: 'over';
      overCents: Cents;
      /** What would cover it, in the order it is taken: the chain then Free to Spend, or Free to Spend then other envelopes. */
      sources: CheckSource[];
      /** Whether the sources follow the envelope's own chain. */
      isChain?: boolean;
      /** What neither Free to Spend nor another envelope could cover. */
      uncoveredCents: Cents;
    };

/** Whether `cents` fits in an envelope and, if not, what could cover the rest. Nothing moves. */
export function checkAmount(
  envelopeId: string,
  cents: Cents,
  envelopes: readonly CheckEnvelope[],
  freeCents: Cents = 0,
  chain: readonly string[] = [],
): AmountCheck {
  const target = envelopes.find((envelope) => envelope.id === envelopeId);
  const leftAfterCents = (target?.leftCents ?? 0) - cents;
  if (leftAfterCents >= 0) return { kind: 'fits', leftAfterCents };

  if (chain.length > 0) {
    const overCents = cents - Math.max(0, target?.leftCents ?? 0);
    const spilled = resolveSpill(
      [{ envelopeId, cents, via: 'chosen' }],
      Object.fromEntries(
        envelopes.map((envelope) => [envelope.id, envelope.leftCents]),
      ),
      { [envelopeId]: chain },
    ).filter((line) => line.via === 'spill');
    const rest = spilled
      .filter((line) => line.envelopeId === null)
      .reduce((sum, line) => sum + line.cents, 0);
    const fromFree = Math.min(rest, Math.max(0, freeCents));
    const sources = [
      ...spilled.flatMap((line): CheckSource[] => {
        const left =
          envelopes.find((envelope) => envelope.id === line.envelopeId)
            ?.leftCents ?? 0;
        return line.envelopeId === null
          ? []
          : [
              {
                envelopeId: line.envelopeId,
                takeCents: line.cents,
                leftAfterCents: left - line.cents,
              },
            ];
      }),
      ...(fromFree > 0
        ? [
            {
              envelopeId: null,
              takeCents: fromFree,
              leftAfterCents: freeCents - fromFree,
            },
          ]
        : []),
    ];
    return {
      kind: 'over',
      overCents,
      sources,
      uncoveredCents: rest - fromFree,
      isChain: true,
    };
  }
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
