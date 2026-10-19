import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SettingsGroup from '@/components/SettingsGroup';
import { useAppSelector } from '@/store';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';

function SharedLinksSection() {
  const { openSubview } = usePinchOverlay();
  const hasShares = useAppSelector(
    (state) => state.pinch.shares.items.length > 0,
  );

  if (!hasShares) {
    return null;
  }

  return (
    <SettingsGroup title='Sharing'>
      <li>
        <Button
          type='button'
          variant='tertiary'
          onClick={() => openSubview({ kind: 'shares' })}
          className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-3 text-left'
        >
          <span
            className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-lg leading-none'
            aria-hidden='true'
          >
            🔗
          </span>
          <span className='flex min-h-10 min-w-0 flex-1 flex-col justify-center'>
            <span className='text-foreground font-medium text-pretty'>
              Shared links
            </span>
            <span className='text-muted-foreground block text-sm font-normal text-pretty'>
              Copy, update or stop the links you have sent.
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
            aria-hidden='true'
          />
        </Button>
      </li>
    </SettingsGroup>
  );
}

export default SharedLinksSection;
