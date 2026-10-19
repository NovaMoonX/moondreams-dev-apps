import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

interface EntryTileProps {
  icon: ReactNode;
  label: string;
  /** A few words for something there that wants a look ("2 to eat soon"), cut to one line in a narrow tile and two in a wide one; only while it applies. */
  status?: string;
  /** The full phrase when the tile shows less than it means; it starts with the visible label. */
  ariaLabel?: string;
  onClick: () => void;
}

/** A way into a related screen as a rounded tile with an icon chip, the label, an optional status in words and a chevron, so it never reads as a filter. Tiles sit in a two-column grid; one alone spans it below `lg`. */
function EntryTile({
  icon,
  label,
  status,
  ariaLabel,
  onClick,
}: EntryTileProps) {
  return (
    <div className='@container min-w-0 only:col-span-2 lg:only:col-span-1'>
      <Button
        type='button'
        variant='tertiary'
        size='stripped'
        rounded='lg'
        aria-label={ariaLabel}
        onClick={onClick}
        className='bg-card border-border text-foreground! hover:bg-muted relative flex h-full min-h-14 w-full flex-col items-start justify-start gap-1 border px-3 py-2 text-left font-normal whitespace-normal @min-[13rem]:flex-row @min-[13rem]:items-center @min-[13rem]:gap-3 @min-[13rem]:py-2.5 @min-[13rem]:pr-9 @min-[13rem]:[@media(max-height:599px)]:min-h-10 @min-[13rem]:[@media(max-height:599px)]:gap-2 @min-[13rem]:[@media(max-height:599px)]:py-1.5 @min-[13rem]:[@media(max-height:599px)]:pr-7'
      >
        <span
          className='bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-full @min-[13rem]:size-8 @min-[13rem]:[@media(max-height:599px)]:size-7'
          aria-hidden='true'
        >
          {icon}
        </span>
        <span className='w-full min-w-0 @min-[13rem]:flex-1 @min-[13rem]:[@media(max-height:599px)]:flex @min-[13rem]:[@media(max-height:599px)]:items-baseline @min-[13rem]:[@media(max-height:599px)]:gap-1.5'>
          <span className='block truncate text-sm font-medium @min-[13rem]:[@media(max-height:599px)]:shrink-0'>
            {label}
          </span>
          {status && (
            <span className='text-muted-foreground line-clamp-1 text-[11px] wrap-break-word @min-[13rem]:line-clamp-2 @min-[13rem]:text-xs @min-[13rem]:text-balance @min-[13rem]:[@media(max-height:599px)]:line-clamp-1 @min-[13rem]:[@media(max-height:599px)]:min-w-0 @min-[13rem]:[@media(max-height:599px)]:flex-1'>
              {status}
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground absolute top-3.5 right-3 size-4 @min-[13rem]:top-1/2 @min-[13rem]:-translate-y-1/2'
          aria-hidden='true'
        />
      </Button>
    </div>
  );
}

export default EntryTile;
