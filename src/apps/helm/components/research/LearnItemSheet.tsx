import { lazy, Suspense } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import ResearchSheet from '@apps/helm/components/research/ResearchSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useLearnTaps } from '@apps/helm/components/research/useLearnTaps';
import { selectLearnById } from '@apps/helm/store/selectors/researchSelectors';
import type { OpenResearch } from '@apps/helm/types';

const VideoEmbed = lazy(() => import('@/components/VideoEmbed'));

const VIDEO_STALE_MS = 30 * 24 * 60 * 60 * 1000;

const HIT_CLASS =
  "relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']";

interface LearnItemSheetProps {
  itemId: string | null;
  onClose: () => void;
}

function Videos({ item }: { item: OpenResearch }) {
  return (
    <section className='space-y-3'>
      <h3 className='text-muted-foreground text-[13px] font-semibold'>
        {HELM_COPY.learnVideos(item.videos.length)}
      </h3>
      {item.videos.map((video) => (
        <div key={video.videoId} className='space-y-1.5'>
          <Suspense
            fallback={
              <div className='bg-accent border-border aspect-video rounded-2xl border' />
            }
          >
            <VideoEmbed
              video={{
                src: `https://www.youtube-nocookie.com/embed/${video.videoId}`,
                thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
              }}
              ariaLabel={HELM_COPY.learnVideoPlay(video.title)}
            />
          </Suspense>
          <p className='text-[15px] leading-[21px] break-words'>
            {video.title}
          </p>
          <p className='text-muted-foreground text-[13px] break-words'>
            {HELM_COPY.learnVideoMeta(
              video.channel,
              Math.max(1, Math.round(video.durationSec / 60)),
            )}
          </p>
        </div>
      ))}
    </section>
  );
}

/** A saved question opened: its overview with the table or steps, its videos (nothing plays until tapped; a month-old lookup is hidden, as YouTube's terms require), and the actions in the footer: Save to my knowledge is the one primary, Done with it and Remove sit quiet and apart. */
function LearnItemSheet({ itemId, onClose }: LearnItemSheetProps) {
  const item = useAppSelector((state) => selectLearnById(state)(itemId));
  const now = useNow(60_000);
  const taps = useLearnTaps(onClose);
  const isOpenable =
    item !== null && (item.status === 'ready' || item.status === 'offered');
  const hasVideos =
    item !== null &&
    item.videos.length > 0 &&
    item.videosFetchedAt !== null &&
    now - item.videosFetchedAt < VIDEO_STALE_MS;
  const isWaiting = item !== null && item.status === 'planned';

  return (
    <ResearchSheet
      research={item}
      onClose={onClose}
      emptyText={
        item?.prepareFailedAt != null
          ? HELM_COPY.learnFailed
          : HELM_COPY.learnPreparing
      }
      extra={hasVideos && item ? <Videos item={item} /> : null}
      footer={
        item && (isOpenable || isWaiting) ? (
          <div className='space-y-2'>
            {isOpenable && (
              <Button
                type='button'
                className='w-full'
                loading={taps.isBusy}
                onClick={() => void taps.keep(item)}
              >
                {HELM_COPY.learnKeep}
              </Button>
            )}
            <div className='flex items-center justify-between gap-3'>
              {isOpenable ? (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className={HIT_CLASS}
                  onClick={() => void taps.done(item)}
                >
                  {HELM_COPY.learnDone}
                </Button>
              ) : (
                <span />
              )}
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className={HIT_CLASS}
                onClick={() => void taps.remove(item)}
              >
                {HELM_COPY.learnRemove}
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}

export default LearnItemSheet;
