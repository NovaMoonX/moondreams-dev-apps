import { HOME_WORDS } from '@apps/runway/constants';
import type { FreeToSpendFigure } from '@apps/runway/engine/balances';
import { formatCents } from '@/utils/moneyUtils';

/** The Free to Spend figure in the words Home's card and its detail both use. */
export function describeFreeToSpend(figure: FreeToSpendFigure) {
  if (figure.kind === 'unknown') {
    return { label: HOME_WORDS.freeToSpend, value: HOME_WORDS.notSet };
  }
  if (figure.kind === 'over') {
    return {
      label: HOME_WORDS.freeToSpend,
      value: `${HOME_WORDS.overAssigned} ${formatCents(figure.cents)}`,
    };
  }
  return { label: HOME_WORDS.freeToSpend, value: formatCents(figure.cents) };
}
