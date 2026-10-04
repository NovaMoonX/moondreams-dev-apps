import { useState, type ComponentType } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { Check, Copy } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';


import { formatDateUTC } from '@/utils/formatUtils';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface TripCardProps {
  trip: TripSpace;
  now: number;
  onOpen: (tripId: string) => void;
  onCopyInviteLink: (inviteCode: string) => void;
  onCopyInviteCode: (inviteCode: string) => void;
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      aria-hidden
    >
      <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
      <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
    </svg>
  );
}

function CopiedIcon({
  icon: Icon,
  isCopied,
}: {
  icon: ComponentType<{ className?: string }>;
  isCopied: boolean;
}) {
  const Shown = isCopied ? Check : Icon;
  return <Shown className={join('h-3.5 w-3.5', isCopied && 'text-success')} />;
}

function TripCard({
  trip,
  now,
  onOpen,
  onCopyInviteLink,
  onCopyInviteCode,
}: TripCardProps) {
  const [copiedKind, setCopiedKind] = useState<'code' | 'link' | null>(null);
  const isActive = getTripStatus(trip, now) === 'ACTIVE';

  const handleCopy = async (kind: 'code' | 'link') => {
    if (!trip.inviteCode) {
      return;
    }

    if (kind === 'code') {
      onCopyInviteCode(trip.inviteCode);
    } else {
      onCopyInviteLink(trip.inviteCode);
    }

    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 2000);
  };

  return (
    <div className='border-border bg-card rounded-lg border p-4'>
      {trip.coverImageUrl && (
        <img
          src={trip.coverImageUrl}
          alt={`${trip.title} cover`}
          className='mb-4 h-40 w-full rounded-md object-cover'
        />
      )}
      <div>
        <div className='flex items-center gap-2'>
          <h2 className='text-lg font-semibold'>{trip.title}</h2>
          {isActive && (
            <Badge variant='success' use='status'>
              Active
            </Badge>
          )}
          {trip.isArchived && <Badge variant='muted'>Archived</Badge>}
        </div>
        <p className='text-muted-foreground mt-2 text-sm'>
          {formatDateUTC(trip.startDate)} - {formatDateUTC(trip.endDate)}
        </p>
      </div>

      {trip.inviteCode && (
        <div className='bg-muted/50 mt-4 flex items-center justify-between gap-2 rounded-lg p-2 pl-3'>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-[10px] font-semibold tracking-wide uppercase'>
              Invite code
            </p>
            <div className='flex items-center gap-1'>
              <code className='text-foreground text-base font-semibold tracking-[0.2em]'>
                {trip.inviteCode}
              </code>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='-my-1'
                aria-label='Copy invite code'
                onClick={() => handleCopy('code')}
              >
                <CopiedIcon icon={Copy} isCopied={copiedKind === 'code'} />
              </Button>
            </div>
          </div>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='shrink-0'
            onClick={() => handleCopy('link')}
          >
            {copiedKind === 'link' ? 'Copied' : 'Copy link'}
            <CopiedIcon icon={LinkIcon} isCopied={copiedKind === 'link'} />
          </Button>
        </div>
      )}

      <Button
        type='button'
        className='mt-4 w-full'
        onClick={() => onOpen(trip.id)}
      >
        Open trip
      </Button>
    </div>
  );
}

export default TripCard;
