import { useMemo } from 'react';

import { readConnectorAppId } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { formatClock, getDayNoon, toDayKey } from '@apps/helm/utils/planDays';
import { getDayEvents, getLiveRecords } from '@apps/helm/utils/synced';

/** The Today tile's state: the next timed event, else how many events the day holds; null when there are none. */
export function useTodayTileLine() {
  const now = useNow(60_000);
  const { grants } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const stored = useAppSelector((state) => state.helm.synced.items);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';

  return useMemo(() => {
    const { events } = getDayEvents(
      getLiveRecords(stored, grants, true),
      getDayNoon(toDayKey(now, timeZone), timeZone),
      timeZone,
    );
    const next = events.find(
      (record) =>
        !record.isAllDay && record.startAt !== null && record.startAt > now,
    );
    const countable = events.filter(
      (record) =>
        !record.isAllDay || readConnectorAppId(record.connectorId) === null,
    );
    if (next?.startAt != null) {
      return HELM_COPY.todayTileNext(
        formatClock(next.startAt, timeZone),
        next.sealed.title,
      );
    }
    return countable.length > 0
      ? HELM_COPY.todayTileCount(countable.length)
      : null;
  }, [stored, grants, now, timeZone]);
}
