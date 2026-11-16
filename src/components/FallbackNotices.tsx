import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DebugDetails from '@/components/DebugDetails';
import InlineNotice from '@/components/InlineNotice';
import { useFallbacks } from '@/hooks/useFallbacks';
import { useCanSeeDebugDetails } from '@/lib/debugProfiles/useCanSeeDebugDetails';
import type { Fallback } from '@/lib/fallbacks/fallbacks';
import { formatTime } from '@/utils/formatUtils';

const SHOWN_MAX = 2;

const toLine = ({ used, wanted, reason }: Fallback) =>
  `Using ${used} instead of ${wanted}: ${reason}`;

const toFacts = (fallback: Fallback) => [
  `Feature: ${fallback.feature}`,
  `Wanted: ${fallback.wanted}`,
  `Used: ${fallback.used}`,
  ...fallback.facts,
  fallback.count === 1
    ? `Happened once at ${formatTime(fallback.lastAt)}`
    : `Happened ${fallback.count} times, first at ${formatTime(fallback.firstAt)}, last at ${formatTime(fallback.lastAt)}`,
];

function FallbackList() {
  const { fallbacks, dismiss } = useFallbacks();
  const [isAllShown, setIsAllShown] = useState(false);
  if (fallbacks.length === 0) return null;
  const shown = isAllShown ? fallbacks : fallbacks.slice(0, SHOWN_MAX);
  const hiddenCount = fallbacks.length - shown.length;

  return (
    <div className='pointer-events-none fixed inset-x-0 top-0 z-[125] flex flex-col items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]'>
      <div
        className={join(
          'flex w-full max-w-md flex-col items-center gap-2',
          isAllShown && 'pointer-events-auto max-h-[55dvh] overflow-y-auto',
        )}
      >
        {shown.map((fallback) => (
          <div
            key={fallback.key}
            className='bg-background pointer-events-auto w-full max-w-md rounded-xl shadow-md'
          >
            <InlineNotice
              tone='warning'
              className='max-h-[32dvh] overflow-y-auto p-2.5 text-[13px]'
              dismissLabel='Dismiss for this session'
              onDismiss={() => dismiss(fallback.key)}
            >
              <p className='font-medium'>{toLine(fallback)}</p>
              <DebugDetails
                title='What went wrong'
                message={toLine(fallback)}
                facts={toFacts(fallback)}
                trace={
                  fallback.trace === null
                    ? null
                    : { label: 'What was recorded', text: fallback.trace }
                }
                className='mt-1'
              />
            </InlineNotice>
          </div>
        ))}
      </div>
      {fallbacks.length > SHOWN_MAX && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className="bg-background! pointer-events-auto relative h-7 rounded-full px-3 text-xs before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          onClick={() => setIsAllShown(!isAllShown)}
        >
          {isAllShown ? 'Show fewer' : `+${hiddenCount} more`}
        </Button>
      )}
    </div>
  );
}

/** Dismissible notices for anything the site fell back from (a chosen voice, a downloaded model, a service), mounted once in the site shell so every app gets them. Debug viewers only: local builds, the admin and listed debug emails. */
function FallbackNotices() {
  const canSee = useCanSeeDebugDetails();
  if (!canSee) return null;
  return <FallbackList />;
}

export default FallbackNotices;
