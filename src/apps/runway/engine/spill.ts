import { MAX_PURCHASE_LINES } from '@apps/runway/constants';
import type { Cents, PurchaseLine } from '@apps/runway/types';

/** Each envelope's ordered chain of envelopes that pay when it runs out. */
export type SpillChains = Readonly<Record<string, readonly string[]>>;

const isSpilling = (line: PurchaseLine, chains: SpillChains) =>
  line.via === 'chosen' &&
  line.cents > 0 &&
  line.envelopeId !== null &&
  (chains[line.envelopeId]?.length ?? 0) > 0;

/** The chain steps worth taking: each once, never the envelope itself, only envelopes `left` knows. */
const getSteps = (
  id: string,
  chain: readonly string[],
  left: Readonly<Record<string, Cents>>,
) =>
  chain.filter(
    (step, index) =>
      step !== id && step in left && chain.indexOf(step) === index,
  );

/** Splits each chosen line its envelope cannot cover into the envelope's chain, then Free to Spend; the lines still add up and the line cap holds. */
export function resolveSpill(
  lines: readonly PurchaseLine[],
  leftByEnvelope: Readonly<Record<string, Cents>>,
  chains: SpillChains,
): PurchaseLine[] {
  const avail = { ...leftByEnvelope };
  const owns = lines.map((line) => {
    const id = line.envelopeId;
    if (id === null || line.cents <= 0) return line.cents;
    const covered = isSpilling(line, chains)
      ? Math.min(line.cents, Math.max(0, avail[id] ?? 0))
      : line.cents;
    avail[id] = (avail[id] ?? 0) - covered;
    return covered;
  });
  const result = lines.reduce<{ out: PurchaseLine[]; spare: number }>(
    (acc, line, index) => {
      if (
        !isSpilling(line, chains) ||
        line.envelopeId === null ||
        acc.spare <= 0
      )
        return { ...acc, out: [...acc.out, line] };
      const over = line.cents - owns[index];
      const takes = getSteps(
        line.envelopeId,
        chains[line.envelopeId] ?? [],
        leftByEnvelope,
      ).reduce<{ id: string; cents: Cents }[]>((taken, step) => {
        const took = taken.reduce((sum, entry) => sum + entry.cents, 0);
        const cents = Math.min(over - took, Math.max(0, avail[step] ?? 0));
        if (cents <= 0) return taken;
        avail[step] -= cents;
        return [...taken, { id: step, cents }];
      }, []);
      const takenAll = takes.reduce((sum, entry) => sum + entry.cents, 0);
      const fits = takes.length + (takenAll < over ? 1 : 0) <= acc.spare;
      const kept = fits ? takes : takes.slice(0, acc.spare - 1);
      const rest = over - kept.reduce((sum, entry) => sum + entry.cents, 0);
      const spill: PurchaseLine[] = [
        ...kept.map((entry): PurchaseLine => ({
          envelopeId: entry.id,
          cents: entry.cents,
          via: 'spill',
        })),
        ...(rest > 0
          ? [{ envelopeId: null, cents: rest, via: 'spill' } as PurchaseLine]
          : []),
      ];
      return {
        out: [...acc.out, { ...line, cents: owns[index] }, ...spill],
        spare: acc.spare - spill.length,
      };
    },
    { out: [], spare: MAX_PURCHASE_LINES - lines.length },
  );
  return result.out;
}

/** The shares the person chose: each spill line folded back into the chosen line before it. */
export function unspill(lines: readonly PurchaseLine[]): PurchaseLine[] {
  return lines.reduce<PurchaseLine[]>((out, line) => {
    if (line.via !== 'spill') return [...out, line];
    const at = out.map((entry) => entry.via).lastIndexOf('chosen');
    if (at === -1) return [...out, line];
    return out.map((entry, index) =>
      index === at ? { ...entry, cents: entry.cents + line.cents } : entry,
    );
  }, []);
}
