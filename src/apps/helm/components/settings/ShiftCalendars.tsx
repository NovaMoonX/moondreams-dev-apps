import { CalendarClock } from 'lucide-react';

import SettingsRow from '@/components/SettingsRow';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';

interface ShiftCalendarsProps {
  /** Where the person picks shifts when more than one account has a calendar. */
  onOpenConnectedApps: () => void;
}

/** Settings' row for which calendars are shifts. It opens the calendar picker of the one connected account, or Connected apps when there are several; it only shows once a Calendar connection exists. */
function ShiftCalendars({ onOpenConnectedApps }: ShiftCalendarsProps) {
  const { grants } = useConnections({ readerAppId: 'helm' });
  const { openCalendarPicker } = useGoogleConnect();
  const shiftCount = useAppSelector(
    (state) => state.helm.profile?.shiftCalendarIds.length ?? 0,
  );
  const calendars = grants.filter(
    (grant) => grant.connectorId === 'google:calendar',
  );

  if (calendars.length === 0) return null;

  return (
    <SettingsRow
      icon={<CalendarClock className='size-5' aria-hidden='true' />}
      title={HELM_COPY.shiftCalendarsRow}
      description={
        shiftCount === 0
          ? HELM_COPY.shiftCalendarsNone
          : HELM_COPY.shiftCalendarsCount(shiftCount)
      }
      onClick={() =>
        calendars.length === 1
          ? openCalendarPicker(calendars[0].accountId)
          : onOpenConnectedApps()
      }
      hasChevron
    />
  );
}

export default ShiftCalendars;
