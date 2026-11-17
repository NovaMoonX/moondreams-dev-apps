import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import {
  selectFeeChips,
  selectTaxRateChips,
  selectViewingItems,
} from '@apps/a-list/store/selectors';
import type { AmcFormat } from '@apps/a-list/types';
import {
  getTicketSuggestion,
  type TicketSuggestion,
} from '@apps/a-list/utils/chips';

/** The fee and tax a new ticket at this theater and format starts with, learned from the member's past tickets. */
export function useTicketSuggestion(
  theatreId: string | null,
  format: AmcFormat,
): TicketSuggestion {
  const viewings = useAppSelector(selectViewingItems);
  const fallbackFeeCents = useAppSelector(selectFeeChips)[1] ?? 0;
  const { defaultRate } = useAppSelector(selectTaxRateChips);

  const suggestion = useMemo(
    () =>
      getTicketSuggestion(
        viewings,
        theatreId,
        format,
        fallbackFeeCents,
        defaultRate,
      ),
    [viewings, theatreId, format, fallbackFeeCents, defaultRate],
  );
  return suggestion;
}
