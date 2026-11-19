import type { ComponentType } from 'react';

import AppLogo from '@/components/AppLogo';
import {
  GmailMark,
  GoogleCalendarMark,
  GoogleContactsMark,
  GoogleDriveMark,
  GoogleMark,
} from '@/components/BrandMarks';
import { readConnectorAppId } from '@/lib/connections/contract';
import { join } from '@moondreamsdev/dreamer-ui/utils';

const GOOGLE_MARKS: Record<string, ComponentType<{ className?: string }>> = {
  'google:calendar': GoogleCalendarMark,
  'google:gmail': GmailMark,
  'google:drive': GoogleDriveMark,
  'google:contacts': GoogleContactsMark,
};

/** A connector's mark on its tile: an outside service's own brand mark, or the site app's logo. `connectorId` null is the Google account itself. */
function ConnectorMark({
  connectorId,
  className,
}: {
  connectorId: string | null;
  className: string;
}) {
  const Mark =
    connectorId === null ? GoogleMark : (GOOGLE_MARKS[connectorId] ?? null);
  if (Mark === null)
    return (
      <AppLogo
        appId={readConnectorAppId(connectorId ?? '') ?? ''}
        className={className}
      />
    );
  return (
    <span
      className={join(
        'bg-muted flex shrink-0 items-center justify-center',
        className,
      )}
    >
      <Mark className={connectorId === null ? 'size-[70%]' : 'size-[80%]'} />
    </span>
  );
}

export default ConnectorMark;
