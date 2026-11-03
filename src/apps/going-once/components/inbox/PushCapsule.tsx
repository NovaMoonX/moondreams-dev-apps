import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { turnOnDevicePush } from '@/lib/notifications/devicePush';
import { getTurnOnFailureText } from '@/lib/notifications/deviceText';
import {
  devicePushQueryOptions,
  notificationsQueryKeys,
} from '@/lib/notifications/notificationsQueries';
import { useAppSelector } from '@/store';
import { selectIsInquiryPushOff } from '@apps/going-once/store/selectors';

const MAX_ASKS = 3;
const NO_ASKS = 0;
const parseAsks = (stored: unknown) =>
  typeof stored === 'number' && stored >= 0 ? stored : null;

// "Not now" lasts the rest of this visit; the stored count is what makes it come back, up to MAX_ASKS times.
const dismissedThisVisit = new Set<string>();

interface PushCapsuleProps {
  saleId: string;
  uid: string;
}

/** A quiet bar that offers to buzz this phone when someone is interested, asked on its own Turn on tap and never on load. It comes back on a later visit after Not now, up to three times in all, and draws nothing once the phone is reachable or the person turned this sale's push off. */
function PushCapsule({ saleId, uid }: PushCapsuleProps) {
  const queryClient = useQueryClient();
  const device = useQuery(devicePushQueryOptions(uid)).data ?? null;
  const isPushOff = useAppSelector((state) =>
    selectIsInquiryPushOff(state, saleId),
  );
  const [asks, setAsks] = useLocalStorageState(
    `going-once:${uid}:push-asks`,
    NO_ASKS,
    parseAsks,
  );
  const [isAsking, setIsAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (
    device === null ||
    device === 'on' ||
    isPushOff !== false ||
    asks >= MAX_ASKS ||
    dismissedThisVisit.has(uid)
  )
    return null;

  const isStuck = device === 'blocked' || device === 'unsupported';

  const dismiss = () => {
    dismissedThisVisit.add(uid);
    setAsks((count) => count + 1);
  };

  const turnOn = async () => {
    setFailure(null);
    setIsAsking(true);
    try {
      const result = await turnOnDevicePush(uid);
      if (result === 'dismissed')
        setFailure('Nothing changed. Tap Turn on when you are ready.');
      else if (result !== 'on') setFailure(getTurnOnFailureText(result));
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.device(uid),
      });
    }
  };

  return (
    <div className='bg-accent/60 border-border space-y-2 rounded-2xl border px-3 py-2.5'>
      <div className='flex items-center gap-2'>
        <span aria-hidden='true' className='shrink-0 leading-none'>
          🔔
        </span>
        <p className='text-foreground min-w-0 flex-1 text-sm font-medium text-pretty'>
          {isStuck
            ? 'Pushes are blocked in this browser.'
            : "Get a push when someone's interested"}
        </p>
        {!isStuck && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            rounded='full'
            className="border-foreground/30 bg-background relative h-8 shrink-0 px-3 font-medium after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
            loading={isAsking}
            onClick={() => void turnOn()}
          >
            Turn on
          </Button>
        )}
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          className="relative h-8 shrink-0 px-3 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
          onClick={dismiss}
        >
          Not now
        </Button>
      </div>
      {failure && (
        <p className='text-muted-foreground text-xs text-pretty'>{failure}</p>
      )}
    </div>
  );
}

export default PushCapsule;
