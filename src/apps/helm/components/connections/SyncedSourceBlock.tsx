import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AppLogo from '@/components/AppLogo';
import { readConnectorAppId } from '@/lib/connections/contract';
import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import type { SyncedRecord } from '@apps/helm/types';
import { formatUpdatedAt } from '@apps/helm/utils/synced';

interface SyncedSourceBlockProps {
  record: SyncedRecord;
  appName: string;
  now: number;
  /** Called before the app opens, so a sheet can close behind the person. */
  onOpened?: () => void;
}

const isInternalRoute = (link: string) =>
  link.startsWith('/') && !link.startsWith('//');

/** The muted block under a copied record: whose it is, how fresh the copy is, and the way to the source. */
function SyncedSourceBlock({
  record,
  appName,
  now,
  onOpened,
}: SyncedSourceBlockProps) {
  const name = useAssistantName();
  const navigate = useNavigate();
  const appId = readConnectorAppId(record.connectorId) ?? '';
  const link = record.sealed.deepLink;
  const line =
    record.connectionEndedAt !== null
      ? HELM_COPY.syncedKept(
          formatDateShort(record.deleteAfter ?? record.connectionEndedAt),
        )
      : HELM_COPY.syncedUpdated(formatUpdatedAt(record.syncedAt, now), name);

  return (
    <div className='bg-muted/50 flex flex-col gap-3 rounded-[10px] p-3'>
      <div className='flex items-center gap-3'>
        <AppLogo appId={appId} className='size-9 rounded-lg' />
        <div className='min-w-0'>
          <p className='text-foreground text-[15px] leading-[21px] break-words'>
            {HELM_COPY.syncedFrom(appName)}
          </p>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {line}
          </p>
        </div>
      </div>
      {link && isInternalRoute(link) && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='self-start'
          onClick={() => {
            onOpened?.();
            navigate(link);
          }}
        >
          {HELM_COPY.syncedOpenIn(appName)}
          <ExternalLink className='ml-1 size-3.5' aria-hidden='true' />
        </Button>
      )}
    </div>
  );
}

export default SyncedSourceBlock;
