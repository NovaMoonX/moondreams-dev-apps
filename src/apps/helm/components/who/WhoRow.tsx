import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import WhoPhoto from '@apps/helm/components/who/WhoPhoto';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenWho } from '@apps/helm/types';
import { getWhoLine } from '@apps/helm/utils/whoGroups';
import PrivateLock from '@apps/helm/components/privacy/PrivateLock';

interface WhoRowProps {
  who: OpenWho;
  onOpen: (whoId: string) => void;
}

/** One person, pet or organization: its mark, its name and a quiet line of what it is. Opens its page. */
function WhoRow({ who, onOpen }: WhoRowProps) {
  const name = who.isUnreadable ? HELM_COPY.unreadable : who.name;
  const line = getWhoLine(who, {
    you: HELM_COPY.youLabel,
    pet: HELM_COPY.petKindFallback,
    organization: HELM_COPY.organizationKindFallback,
  });

  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(who.id)}
    >
      <WhoPhoto kind={who.kind} name={name} mediaId={who.photoMediaId} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {name}
          <PrivateLock kind='who' record={who} />
        </span>
        {!who.isUnreadable && line && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {line}
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

export default WhoRow;
