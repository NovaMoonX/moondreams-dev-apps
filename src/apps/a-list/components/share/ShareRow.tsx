import { Button, CopyButton } from '@moondreamsdev/dreamer-ui/components';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import { formatDateShort } from '@/utils/formatUtils';
import type { CalendarShare } from '@apps/a-list/types';
import { formatShareRange, getShareUrl } from '@apps/a-list/utils/sharing';

interface ShareRowProps {
  share: CalendarShare;
  isDisabled: boolean;
  onCopied: () => void;
  onTogglePin: (share: CalendarShare, isLocked: boolean) => void;
  onDelete: (share: CalendarShare) => void;
}

function ShareRow({
  share,
  isDisabled,
  onCopied,
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
            {formatDateShort(share.createdAt)}
          </p>
        </div>
        <DeleteIconButton
          label={`Delete the link for ${formatShareRange(share.startDate, share.endDate)}`}
          disabled={isDisabled}
          onClick={() => onDelete(share)}
        />
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <CopyButton
          textToCopy={url}
          variant='primary'
          size='sm'
          rounded='full'
          onClick={onCopied}
        >
          Copy link
        </CopyButton>
        <Button
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          variant='secondary'
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
            <p className='text-muted-foreground text-xs'>
              Send them{' '}
              <code className='text-foreground font-semibold tracking-[0.2em]'>
                {share.pin}
              </code>
            </p>
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
