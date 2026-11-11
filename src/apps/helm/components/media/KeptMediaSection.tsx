import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import KeptMediaViewer from '@apps/helm/components/media/KeptMediaViewer';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import { HELM_COPY } from '@apps/helm/constants';
import type { MediaAttachment } from '@apps/helm/types';

interface KeptMediaSectionProps {
  record: MediaAttachment;
}

/** The photos kept on a task or fact, as a row of thumbnails that each open the photo. Draws nothing while there are none. */
function KeptMediaSection({ record }: KeptMediaSectionProps) {
  const items = useAppSelector((state) => state.helm.media.items);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const shown = items.filter(
    (entry) =>
      entry.status === 'kept' &&
      entry.attachedTo.some(
        (held) => held.kind === record.kind && held.id === record.id,
      ),
  );
  const viewed = shown.find((entry) => entry.id === viewedId) ?? null;
  if (shown.length === 0) return null;

  return (
    <>
      <ul className='-mx-4 flex gap-2 overflow-x-auto px-4'>
        {shown.map((media, index) => (
          <li key={media.id} className='shrink-0'>
            <Button
              type='button'
              variant='tertiary'
              className="relative block size-16 overflow-hidden rounded-xl p-0! before:absolute before:-inset-1 before:content-['']"
              aria-label={HELM_COPY.mediaViewOnRecord(index + 1, shown.length)}
              onClick={() => setViewedId(media.id)}
            >
              <MediaThumb
                media={media}
                alt=''
                className='size-full'
                fallback={
                  <span className='text-muted-foreground grid size-full place-items-center p-1 text-center text-[11px]'>
                    {HELM_COPY.mediaUnreadable}
                  </span>
                }
              />
            </Button>
          </li>
        ))}
      </ul>
      {viewed && (
        <KeptMediaViewer
          media={viewed}
          record={record}
          onClose={() => setViewedId(null)}
        />
      )}
    </>
  );
}

export default KeptMediaSection;
