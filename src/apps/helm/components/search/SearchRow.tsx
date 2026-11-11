import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, ChevronRight } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import TickMark from '@/components/TickMark';
import { readConnectorAppId } from '@/lib/connections/contract';
import { formatDateShort } from '@/utils/formatUtils';
import WhoPhoto from '@apps/helm/components/who/WhoPhoto';
import { HELM_COPY } from '@apps/helm/constants';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { SearchEntry } from '@apps/helm/utils/searchRecords';

interface SearchRowProps {
  entry: SearchEntry;
  onOpen: (entry: SearchEntry) => void;
}

function SyncedMark({ connectorId }: { connectorId: string }) {
  return connectorId === 'google:calendar' ? (
    <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
      <CalendarDays className='size-5' aria-hidden='true' />
    </span>
  ) : (
    <AppLogo
      appId={readConnectorAppId(connectorId) ?? ''}
      className='size-9 rounded-lg'
    />
  );
}

/** One result: its mark where it has one, its words and a quiet line under them. Opens the record. */
function SearchRow({ entry, onOpen }: SearchRowProps) {
  const { sourceNameOf } = useSourceAppName();
  const { title, line } = entry.describe();
  const { mark } = entry;
  const detail =
    mark?.kind === 'done' && mark.completedAt !== null
      ? HELM_COPY.rowDoneOn(formatDateShort(mark.completedAt))
      : mark?.kind === 'synced'
        ? sourceNameOf(mark.record)
        : line;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      aria-label={HELM_COPY.searchOpenResult(title)}
      onClick={() => onOpen(entry)}
    >
      {mark?.kind === 'who' && (
        <WhoPhoto
          kind={mark.who.kind}
          name={mark.who.name}
          mediaId={mark.who.photoMediaId}
        />
      )}
      {mark?.kind === 'done' && <TickMark className='size-6' />}
      {mark?.kind === 'synced' && (
        <SyncedMark connectorId={mark.record.connectorId} />
      )}
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {title}
        </span>
        {detail && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default SearchRow;
