import { Button } from '@moondreamsdev/dreamer-ui/components';

import LockedButton from '@/components/LockedButton';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useNow } from '@/hooks/useNow';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { HELM_COPY } from '@apps/helm/constants';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import type { SearchedSource } from '@apps/helm/types';
import { formatUpdatedAt } from '@apps/helm/utils/synced';

const JUST_NOW_MS = 2 * 60_000;

interface SearchedLineProps {
  searched: SearchedSource;
  /** Only a card on the page can start the trip to Google; one inside a sheet just says what happened. */
  canReconnect: boolean;
}

/** Where an answer looked, in one line, or the account it couldn't look in with the way back. */
function SearchedLine({ searched, canReconnect }: SearchedLineProps) {
  const now = useNow(60_000);
  const { user } = useAuth();
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  const { begin } = useGoogleConnect();
  const isOffline = useNetworkStatus() === 'offline';

  if (searched.failed === null) {
    return (
      <p className='text-muted-foreground py-2.5 text-[13px] text-pretty'>
        {HELM_COPY.searchedLine(
          searched.label,
          now - searched.at < JUST_NOW_MS
            ? HELM_COPY.searchedJustNow
            : formatUpdatedAt(searched.at, now),
        )}
      </p>
    );
  }
  const email =
    accounts.find((entry) => entry.id === searched.accountId)?.email ??
    searched.label;
  const canAsk = canReconnect && searched.failed === HELM_COPY.searchedStopped;
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5'>
      <p className='text-muted-foreground min-w-0 flex-1 text-[13px] text-pretty'>
        {HELM_COPY.searchedFailed(email, searched.failed)}
      </p>
      {canAsk &&
        (isOffline ? (
          <LockedButton
            label={HELM_COPY.googleReconnect}
            title={HELM_COPY.connectionsNeedConnection}
            size='sm'
          >
            <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
          </LockedButton>
        ) : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='relative after:absolute after:inset-x-0 after:-inset-y-1.5'
            onClick={() =>
              begin({
                accountId: searched.accountId,
                connectorId:
                  searched.connectorId === 'google:drive'
                    ? 'google:drive'
                    : 'google:gmail',
              })
            }
          >
            {HELM_COPY.googleReconnect}
          </Button>
        ))}
    </div>
  );
}

export default SearchedLine;
