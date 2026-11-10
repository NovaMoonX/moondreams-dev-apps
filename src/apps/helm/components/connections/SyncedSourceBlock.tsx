import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import AppLogo from '@/components/AppLogo';
import ExternalLinkText from '@/components/ExternalLinkText';
import {
  isOutsideAccount,
  readConnectorAppId,
} from '@/lib/connections/contract';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { useAuth } from '@/hooks/useAuth';
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

/** "From Google Calendar · work": the account a copy came from, by its label when it has one and its email otherwise. */
function OutsideSourceLine({
  appName,
  accountId,
}: {
  appName: string;
  accountId: string;
}) {
  const { user } = useAuth();
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const account = accounts.find((entry) => entry.id === accountId);
  return (
    <>
      {account
        ? HELM_COPY.syncedFromAccount(appName, account.label || account.email)
        : HELM_COPY.syncedFrom(appName)}
    </>
  );
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
  const isOutside = isOutsideAccount(record.accountId);
  const line =
    record.connectionEndedAt !== null
      ? HELM_COPY.syncedKept(
          formatDateShort(record.deleteAfter ?? record.connectionEndedAt),
        )
      : HELM_COPY.syncedUpdated(formatUpdatedAt(record.syncedAt, now), name);

  return (
    <div className='bg-muted/50 flex flex-col gap-3 rounded-[10px] p-3'>
      <div className='flex items-center gap-3'>
        {isOutside ? (
          <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
            <CalendarDays className='size-5' aria-hidden='true' />
          </span>
        ) : (
          <AppLogo appId={appId} className='size-9 rounded-lg' />
        )}
        <div className='min-w-0'>
          <p className='text-foreground text-[15px] leading-[21px] break-words'>
            {isOutside ? (
              <OutsideSourceLine
                appName={appName}
                accountId={record.accountId}
              />
            ) : (
              HELM_COPY.syncedFrom(appName)
            )}
          </p>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {line}
          </p>
        </div>
      </div>
      {link && isOutside && link.startsWith('https://') && (
        <ExternalLinkText
          href={link}
          label={HELM_COPY.syncedOpenIn(appName)}
          className='self-start'
        />
      )}
      {link && !isOutside && isInternalRoute(link) && (
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
