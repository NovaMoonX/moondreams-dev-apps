import { useMemo } from 'react';

import { useHiddenDeferredKeys } from '@/lib/undo/deferredUndo';
import { useAppSelector } from '@/store';
import { getAlertFigure } from '@apps/runway/engine/alerts';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import { selectEnvelopes } from '@apps/runway/store/selectors/runwaySelectors';
import type { AlertTarget, Cents } from '@apps/runway/types';
import {
  toAlertEntries,
  toAlertRemovalKey,
} from '@apps/runway/utils/alertText';

/** One set of alerts (Free to Spend's, or one envelope's) with their lines worked out, highest first, and the figure they watch. An alert whose removal is waiting out its Undo is left out. */
export function useAlerts(target: AlertTarget, eachTimeCents: Cents | null) {
  const alerts = useAppSelector((state) => state.runway.alerts);
  const hiddenKeys = useHiddenDeferredKeys();
  const targetItemId = target.kind === 'envelope' ? target.itemId : null;
  const figureCents = useAppSelector((state) =>
    getAlertFigure(
      targetItemId === null
        ? { kind: 'freeToSpend' }
        : { kind: 'envelope', itemId: targetItemId },
      selectBalances(state),
      new Set(
        selectEnvelopes(state, todayAsUtcDate()).map(({ item }) => item.id),
      ),
    ),
  );
  const entries = useMemo(
    () =>
      toAlertEntries(
        alerts.filter(
          (alert) =>
            !hiddenKeys.has(toAlertRemovalKey(alert.id)) &&
            (alert.target.kind === 'envelope'
              ? alert.target.itemId === targetItemId
              : targetItemId === null),
        ),
        eachTimeCents,
      ),
    [alerts, hiddenKeys, targetItemId, eachTimeCents],
  );
  return { entries, figureCents };
}
