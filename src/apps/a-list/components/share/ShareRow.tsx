import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Copy, Eye, EyeOff } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import { formatDateTime } from '@/utils/formatUtils';
import type { CalendarShare } from '@apps/a-list/types';
import { formatShareRange, getShareUrl } from '@apps/a-list/utils/sharing';

interface PinDetailsProps {
  pin: string;
  onCopyPin: () => void;
}

/** Keyed by the PIN at its call site, so a new PIN always starts hidden. */
function PinDetails({ pin, onCopyPin }: PinDetailsProps) {
  const [isShown, setIsShown] = useState(false);

  return (
    <div className='space-y-1'>
      <p className='text-muted-foreground text-xs'>
        Send them{' '}
        <code
          className='text-foreground -mr-[0.2em] font-semibold tracking-[0.2em]'
          aria-label={isShown ? `PIN ${pin.split('').join(' ')}` : 'PIN hidden'}
        >
          {isShown ? pin : '••••'}
        </code>
        . Turning it off and on again makes a new one.
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          aria-pressed={isShown}
          className="relative gap-1.5 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']"
          onClick={() => setIsShown((current) => !current)}
        >
          {isShown ? (
            <EyeOff className='h-4 w-4' aria-hidden='true' />
          ) : (
            <Eye className='h-4 w-4' aria-hidden='true' />
          )}
          {isShown ? 'Hide PIN' : 'Show PIN'}
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className="relative gap-1.5 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']"
          onClick={onCopyPin}
        >
          <Copy className='h-4 w-4' aria-hidden='true' />
          Copy PIN
        </Button>
      </div>
    </div>
  );
}

interface ShareRowProps {
  share: CalendarShare;
  isDisabled: boolean;
  onCopy: (text: string, what: string) => void;
  onTogglePin: (share: CalendarShare, isLocked: boolean) => void;
  onDelete: (share: CalendarShare) => void;
}

function ShareRow({
  share,
  isDisabled,
  onCopy,
  onTogglePin,
  onDelete,
}: ShareRowProps) {
  const url = getShareUrl(share.id);
  const movieCount = share.viewings.length;

  return (
    <li className='space-y-3 py-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='font-medium'>
            {formatShareRange(share.startDate, share.endDate)}
          </p>
          <p className='text-muted-foreground text-xs'>
            {movieCount === 1 ? '1 movie' : `${movieCount} movies`} · made{' '}
            {formatDateTime(share.createdAt)}
          </p>
        </div>
        <DeleteIconButton
          label={`Delete the link for ${formatShareRange(share.startDate, share.endDate)}`}
          disabled={isDisabled}
          onClick={() => onDelete(share)}
        />
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className='gap-1.5'
          onClick={() => onCopy(url, 'Link')}
        >
          <Copy className='h-4 w-4' aria-hidden='true' />
          Copy link
        </Button>
        <Button
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          variant='tertiary'
          size='sm'
          rounded='full'
        >
          Preview
        </Button>
      </div>
      <div className='bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2'>
        <div className='min-w-0'>
          <p className='text-sm font-medium'>
            {share.pin ? '🔒 PIN on' : '🔓 No PIN'}
          </p>
          {share.pin ? (
            <PinDetails
              key={share.pin}
              pin={share.pin}
              onCopyPin={() => onCopy(share.pin ?? '', 'PIN')}
            />
          ) : (
            <p className='text-muted-foreground text-xs'>
              Anyone with the link can open it.
            </p>
          )}
        </div>
        <AppToggle
          checked={share.pin !== null}
          disabled={isDisabled}
          aria-label='Lock this link with a PIN'
          onCheckedChange={(isLocked) => onTogglePin(share, isLocked)}
        />
      </div>
    </li>
  );
}

export default ShareRow;
