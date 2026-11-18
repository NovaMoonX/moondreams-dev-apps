import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Loader2, X } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { formatClock } from '@/utils/durationUtils';
import { MediaKindIcon } from '@apps/helm/components/media/MediaKindIcon';
import { HELM_COPY } from '@apps/helm/constants';
import type { TurnAttachment } from '@apps/helm/hooks/useMediaUpload';
import { shortenFileName } from '@apps/helm/utils/fileNames';

interface AttachmentChipsProps {
  items: TurnAttachment[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

const getVoiceMeta = (item: TurnAttachment) => {
  const time = formatClock(item.measured.durationMs ?? 0);
  if (item.status === 'transcribing') return HELM_COPY.attachWritingOut;
  return item.isWritten
    ? HELM_COPY.attachVoiceWritten(time)
    : HELM_COPY.attachVoiceMeta(time);
};

const META: Record<TurnAttachment['kind'], (item: TurnAttachment) => string> = {
  photo: () => '',
  pdf: (item) => HELM_COPY.mediaPdfPages(item.measured.pageCount),
  markdown: () => HELM_COPY.attachMarkdownMeta,
  voiceNote: getVoiceMeta,
};

const getRemoveLabel = (item: TurnAttachment) =>
  item.kind === 'voiceNote'
    ? HELM_COPY.attachRemoveVoice
    : item.kind === 'photo'
      ? HELM_COPY.mediaRemove('photo')
      : HELM_COPY.attachRemove(shortenFileName(item.source.name));

const getFailure = (item: TurnAttachment) =>
  item.failure === 'usedUp'
    ? HELM_COPY.attachVoiceUsedUp
    : item.failure === 'tooLong'
      ? HELM_COPY.attachVoiceTooLongToWrite
      : item.failure === 'transcribe'
        ? HELM_COPY.attachWriteFailed
        : HELM_COPY.attachFailed;

/** The photos and files picked for the turn being written, above the field: a spinner while one uploads (a voice note then says it is being written out), then Remove; a failed one says so with Try again. */
function AttachmentChips({ items, onRemove, onRetry }: AttachmentChipsProps) {
  if (items.length === 0) return null;
  return (
    <ul className='-mx-1 flex gap-2 overflow-x-auto px-1 py-1'>
      {items.map((item, index) => {
        const isBusy =
          item.status === 'uploading' || item.status === 'transcribing';
        return (
          <li
            key={item.key}
            className={join(
              'relative flex shrink-0 flex-col items-start gap-0.5',
              item.kind === 'photo' ? 'w-16' : 'w-44',
            )}
          >
            {item.kind === 'photo' ? (
              <span className='bg-muted relative block size-16 overflow-hidden rounded-xl'>
                <FallbackImage
                  src={item.previewUrl ?? ''}
                  alt={HELM_COPY.attachThumbLabel(index + 1)}
                  fallback={null}
                  className={join(
                    'size-full object-cover',
                    item.status === 'failed' && 'opacity-40',
                  )}
                />
                {isBusy && (
                  <span
                    className='bg-background/50 absolute inset-0 grid place-items-center'
                    role='status'
                    aria-label={HELM_COPY.attachUploading}
                  >
                    <Loader2
                      className='size-5 animate-spin'
                      aria-hidden='true'
                    />
                  </span>
                )}
              </span>
            ) : (
              <span
                className={join(
                  'bg-muted flex h-16 w-full items-center gap-2 rounded-xl py-2 pr-8 pl-3',
                  item.status === 'failed' && 'opacity-60',
                )}
              >
                {isBusy ? (
                  <Loader2
                    className='size-5 shrink-0 animate-spin'
                    role='status'
                    aria-label={HELM_COPY.attachUploading}
                  />
                ) : (
                  <MediaKindIcon kind={item.kind} className='size-5 shrink-0' />
                )}
                <span className='min-w-0'>
                  {item.kind !== 'voiceNote' && (
                    <span className='block truncate text-[13px] leading-4 font-medium'>
                      {shortenFileName(item.source.name)}
                    </span>
                  )}
                  <span className='text-muted-foreground block text-[12px] leading-4 text-pretty'>
                    {META[item.kind](item)}
                  </span>
                </span>
              </span>
            )}
            <Button
              type='button'
              variant='base'
              size='icon'
              aria-label={getRemoveLabel(item)}
              className="bg-background/85 text-foreground absolute top-1 right-1 size-6 min-w-6 rounded-full p-0 before:absolute before:-inset-2 before:content-['']"
              onClick={() => onRemove(item.key)}
            >
              <X className='size-3.5' aria-hidden='true' />
            </Button>
            {item.status === 'failed' && (
              <>
                <span className='text-destructive text-[12px] leading-4'>
                  {getFailure(item)}
                </span>
                {item.failure !== 'usedUp' && item.failure !== 'tooLong' && (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    className="relative h-auto min-w-0 p-0! text-[12px] before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
                    onClick={() => onRetry(item.key)}
                  >
                    {HELM_COPY.attachTryAgain}
                  </Button>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default AttachmentChips;
