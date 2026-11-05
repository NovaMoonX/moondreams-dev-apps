import type { RootState } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { resolveSpill, type SpillChains } from '@apps/runway/engine/spill';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectEnvelopes } from '@apps/runway/store/selectors/runwaySelectors';
import type { PurchaseLine } from '@apps/runway/types';

/** A purchase's chosen lines with the overage each envelope's chain takes, worked out against the balances now. `previousLines` are the lines this purchase already holds (an edit), added back so it resolves without itself. The one path every purchase takes. */
export function getSpilledLines(
  state: RootState,
  lines: readonly PurchaseLine[],
  previousLines: readonly PurchaseLine[] | null,
): PurchaseLine[] {
  const envelopes = selectEnvelopes(state, todayAsUtcDate());
  const { assignedByItem } = selectBalances(state);
  const left = Object.fromEntries(
    envelopes.map(({ item }) => [
      item.id,
      (assignedByItem[item.id] ?? 0) +
        (previousLines ?? []).reduce(
          (sum, line) => (line.envelopeId === item.id ? sum + line.cents : sum),
          0,
        ),
    ]),
  );
  const chains: SpillChains = Object.fromEntries(
    envelopes.map(({ item, version }) => [item.id, version.payload.spillTo]),
  );
  return resolveSpill(lines, left, chains);
}
