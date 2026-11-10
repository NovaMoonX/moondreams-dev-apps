import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import KeyDateSheet from '@apps/helm/components/who/KeyDateSheet';
import MomentsScreen from '@apps/helm/components/who/MomentsScreen';
import { HELM_COPY, MOMENTS_PREVIEW } from '@apps/helm/constants';
import { useMoments } from '@apps/helm/hooks/useKeyDates';
import type { OpenWho } from '@apps/helm/types';
import { formatMomentRow } from '@apps/helm/utils/keyDateText';

interface MomentsPreviewProps {
  who: OpenWho;
}

/** A who's newest moments, "See all N" from the count the who already carries, and "Add a moment" in the header. The moments are read while this page is open. */
function MomentsPreview({ who }: MomentsPreviewProps) {
  const { moments, isLoaded, hasFailed } = useMoments(who.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAll, setIsAll] = useState(false);
  const newest = moments.slice(0, MOMENTS_PREVIEW);

  return (
    <section className='space-y-3'>
      <SectionDivider
        label={HELM_COPY.momentsHeading}
        trailing={
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
            onClick={() => setIsAdding(true)}
          >
            {HELM_COPY.momentAdd}
          </Button>
        }
      />
      {newest.length === 0 ? (
        isLoaded &&
        who.momentCount === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.momentsEmpty(who.name)}
          </p>
        )
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {newest.map((moment) => (
            <li key={moment.id}>
              <Button
                type='button'
                variant='tertiary'
                className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                onClick={() => setOpenId(moment.id)}
              >
                <span className='text-foreground min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
                  {formatMomentRow(moment)}
                </span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasFailed && (
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.momentsFailed}
        </p>
      )}
      {who.momentCount > MOMENTS_PREVIEW && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => setIsAll(true)}
        >
          {HELM_COPY.momentSeeAll(who.momentCount)}
        </Button>
      )}
      {isAll && (
        <MomentsScreen
          who={who}
          moments={moments}
          isLoaded={isLoaded}
          hasFailed={hasFailed}
          onOpen={setOpenId}
          onClose={() => setIsAll(false)}
        />
      )}
      <KeyDateSheet
        key={`${openId ?? 'none'}:${isAdding}`}
        who={who}
        openId={openId}
        isAdding={isAdding}
        startKind='met'
        moments={moments}
        onClose={() => {
          setOpenId(null);
          setIsAdding(false);
        }}
      />
    </section>
  );
}

export default MomentsPreview;
