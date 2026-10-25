import { formatCents } from '@/utils/moneyUtils';
import type { AmountCheck } from '@apps/runway/engine/checkAmount';

/** The answer to "does this fit": one headline, then where the money could come from when it does not. Nothing here moves money. */
export function describeAmountCheck(
  check: AmountCheck,
  envelopeName: string,
  nameOf: (envelopeId: string) => string,
) {
  if (check.kind === 'fits') {
    return {
      headline: `It fits. ${envelopeName} would have ${formatCents(check.leftAfterCents)} left.`,
      lead: null,
      sources: [] as string[],
      rest: null,
    };
  }
  const sources = check.sources.map(
    (source) =>
      `${nameOf(source.envelopeId)} could give ${formatCents(source.takeCents)}, leaving ${formatCents(source.leftAfterCents)}.`,
  );
  const rest =
    check.uncoveredCents > 0
      ? `${formatCents(check.uncoveredCents)} is more than the other envelopes hold. It would come out of Free to spend.`
      : null;
  return {
    headline: `${envelopeName} would be ${formatCents(check.overCents)} over.`,
    lead:
      sources.length > 0 ? 'It could come from, lowest priority first:' : null,
    sources,
    rest,
  };
}
