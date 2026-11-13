import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import KeptMediaViewer from '@apps/helm/components/media/KeptMediaViewer';
import { MediaKindIcon } from '@apps/helm/components/media/MediaKindIcon';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import { HELM_COPY } from '@apps/helm/constants';
import { formatClock } from '@/utils/durationUtils';
import type { MediaAttachment, OpenMedia } from '@apps/helm/types';
import { shortenFileName } from '@apps/helm/utils/fileNames';

interface KeptMediaSectionProps {
  record: MediaAttachment;
  /** Draws only the photo strip or only the file rows, for a sheet that places them apart. */
  part?: 'photos' | 'files' | 'all';
}

const META: Record<OpenMedia['kind'], (media: OpenMedia) => string> = {
  photo: () => '',
  pdf: (media) => HELM_COPY.mediaPdfPages(media.pageCount),
  markdown: () => HELM_COPY.attachMarkdownMeta,
  voiceNote: (media) =>
    HELM_COPY.attachVoiceMeta(formatClock(media.durationMs ?? 0)),
};

/** The photos kept on a task, fact or note, as a row of thumbnails that each open the photo, and a row under them for each PDF, Markdown file or recording. Draws nothing while there are none. */
function KeptMediaSection({ record, part = 'all' }: KeptMediaSectionProps) {
  const items = useAppSelector((state) => state.helm.media.items);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const shown = items.filter(
    (entry) =>
      entry.status === 'kept' &&
      entry.attachedTo.some(
        (held) => held.kind === record.kind && held.id === record.id,
      ),
  );
  const photos =
    part === 'files' ? [] : shown.filter((entry) => entry.kind === 'photo');
  const files =
    part === 'photos' ? [] : shown.filter((entry) => entry.kind !== 'photo');
  const viewed = shown.find((entry) => entry.id === viewedId) ?? null;
  if (photos.length + files.length === 0) return null;

  return (
    <div>
      {photos.length > 0 && (
        <ul className='-mx-4 flex gap-2 overflow-x-auto px-4'>
          {photos.map((media, index) => (
            <li key={media.id} className='shrink-0'>
              <Button
                type='button'
                variant='tertiary'
                className="relative block size-16 rounded-xl p-0! before:absolute before:-inset-1 before:content-['']"
                aria-label={HELM_COPY.mediaViewOnRecord(
                  index + 1,
                  photos.length,
                )}
                onClick={() => setViewedId(media.id)}
              >
                <MediaThumb
                  media={media}
                  alt=''
                  className='size-full rounded-xl'
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
      )}
      {files.length > 0 && (
        <ul className={photos.length > 0 ? 'mt-2 space-y-1' : 'space-y-1'}>
          {files.map((media) => (
            <li key={media.id}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto w-full min-w-0 justify-start gap-3 px-0! py-2 text-left font-normal'
                aria-label={HELM_COPY.mediaViewFile(
                  media.fileName ?? HELM_COPY.mediaWord(media.kind),
                )}
                onClick={() => setViewedId(media.id)}
              >
                <MediaKindIcon kind={media.kind} className='size-5 shrink-0' />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-[15px]'>
                    {media.fileName
                      ? shortenFileName(media.fileName)
                      : HELM_COPY.mediaSheetTitle(media.kind)}
                  </span>
                  <span className='text-muted-foreground block text-[13px]'>
                    {META[media.kind](media)}
                  </span>
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
      {viewed && (
        <KeptMediaViewer
          media={viewed}
          record={record}
          onClose={() => setViewedId(null)}
        />
      )}
    </div>
  );
}

export default KeptMediaSection;
