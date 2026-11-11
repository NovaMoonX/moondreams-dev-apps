import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ExternalLink, FileText, Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FallbackImage from '@/components/FallbackImage';
import FormSheet from '@/components/FormSheet';
import ImageViewer from '@/components/ImageViewer';
import MarkdownText from '@/components/MarkdownText';
import { useAuth } from '@/hooks/useAuth';
import { forgetSealedObject } from '@/hooks/useSealedObjectUrl';
import { shareOrDownloadFiles } from '@/utils/fileUtils';
import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useMediaUrl } from '@apps/helm/hooks/useMediaUrl';
import { removeKeptMedia } from '@apps/helm/store/actions/mediaActions';
import type { MediaAttachment, OpenMedia } from '@apps/helm/types';

interface KeptMediaViewerProps {
  media: OpenMedia;
  /** The task or fact the photo is kept on; null for one kept on no record. */
  record: MediaAttachment | null;
  onClose: () => void;
}

/** One kept photo, PDF, Markdown file or recording: a photo's picture (a tap opens it full screen, with zoom) and caption; a PDF's name and pages with Open the PDF; a Markdown file's text; a recording's player and what was said. Each shows the day it was sent and Remove, which offers Undo in a toast. */
function KeptMediaViewer({ media, record, onClose }: KeptMediaViewerProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { url, isFailed } = useMediaUrl(
    media.kind === 'markdown' ? null : media,
    'full',
  );
  const [isFull, setIsFull] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const day = HELM_COPY.mediaFromTurn(formatDateShort(media.createdAt));

  const openPdf = async () => {
    if (!url) return;
    if (window.open(url, '_blank')) return;
    try {
      const blob = await (await fetch(url)).blob();
      await shareOrDownloadFiles(
        [
          new File([blob], media.fileName ?? 'document.pdf', {
            type: blob.type,
          }),
        ],
        { title: media.fileName ?? HELM_COPY.mediaSheetTitle('pdf') },
      );
    } catch (error) {
      console.error('Helm PDF was not opened', error);
      addToast({ title: HELM_COPY.mediaOpenPdfFailed, type: 'error' });
    }
  };

  const remove = async () => {
    if (!user || isBusy) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.photoRemoveNeedsConnection, type: 'info' });
      return;
    }
    setIsBusy(true);
    try {
      const removed = await removeKeptMedia(user.uid, media, record);
      if (removed === 'gone') {
        addToast({ title: HELM_COPY.photoGone, type: 'info' });
      } else {
        forgetSealedObject(media.id);
        addToast({
          title: HELM_COPY.mediaRemovedToast(media.kind),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void removed.restore().catch((error: unknown) => {
                console.error('Helm photo was not put back', error);
                addToast({
                  title: HELM_COPY.mediaRestoreFailed,
                  type: 'error',
                });
              }),
          },
        });
      }
      onClose();
    } catch (error) {
      console.error('Helm photo was not removed', error);
      addToast({ title: HELM_COPY.mediaRemoveFailed, type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <FormSheet
        isOpen
        onClose={onClose}
        title={HELM_COPY.mediaSheetTitle(media.kind)}
      >
        <div className='space-y-4'>
          {media.kind === 'photo' && (
            <Button
              type='button'
              variant='tertiary'
              className='bg-muted relative flex aspect-4/3 h-auto max-h-[40dvh] w-full items-center justify-center overflow-hidden rounded-2xl p-0!'
              disabled={!url}
              aria-label={HELM_COPY.photoOpenFull}
              onClick={() => setIsFull(true)}
            >
              {url && (
                <FallbackImage
                  src={url}
                  alt={media.caption ?? day}
                  className='size-full object-contain'
                />
              )}
            </Button>
          )}
          {media.kind === 'pdf' && (
            <div className='bg-muted flex items-center gap-3 rounded-2xl p-4'>
              <FileText className='size-6 shrink-0' aria-hidden='true' />
              <div className='min-w-0 flex-1'>
                <p className='text-[15px] font-medium break-words'>
                  {media.fileName ?? HELM_COPY.mediaSheetTitle('pdf')}
                </p>
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.mediaPdfPages(media.pageCount)}
                </p>
              </div>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={!url}
                onClick={() => void openPdf()}
              >
                <ExternalLink className='size-4' aria-hidden='true' />
                {HELM_COPY.mediaOpenPdf}
              </Button>
            </div>
          )}
          {media.kind === 'markdown' && (
            <div className='space-y-2'>
              <p className='text-[15px] font-medium break-words'>
                {media.fileName}
              </p>
              {media.text ? (
                <MarkdownText
                  text={media.text}
                  className='text-[15px] break-words'
                />
              ) : (
                <p className='text-muted-foreground text-[15px]'>
                  {HELM_COPY.mediaMarkdownEmpty}
                </p>
              )}
            </div>
          )}
          {media.kind === 'voiceNote' && url && (
            <audio controls src={url} className='w-full' />
          )}
          {media.kind === 'voiceNote' && media.text && (
            <div className='space-y-1'>
              <h3 className='text-[13px] font-medium'>
                {HELM_COPY.mediaTranscriptTitle}
              </h3>
              <p className='text-[15px] break-words whitespace-pre-wrap'>
                {media.text}
              </p>
            </div>
          )}
          {(isFailed || media.isUnreadable) && (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.mediaUnreadable}
            </p>
          )}
          <div className='space-y-1'>
            {media.caption && (
              <p className='text-[15px] break-words'>{media.caption}</p>
            )}
            <p className='text-muted-foreground text-[13px] break-words'>
              {day}
            </p>
          </div>
          <ActionGroup>
            <ActionRow
              isGrouped
              isDestructive
              icon={<Trash2 />}
              label={HELM_COPY.mediaRemove(media.kind)}
              subtitle={HELM_COPY.mediaRemoveSubtitle(media.kind)}
              isDisabled={isBusy}
              onClick={() => void remove()}
            />
          </ActionGroup>
        </div>
      </FormSheet>
      {isFull && url && (
        <ImageViewer
          slides={[
            {
              caption: media.caption ?? day,
              pictures: [{ src: url, label: null }],
            },
          ]}
          startIndex={0}
          onClose={() => setIsFull(false)}
          label={HELM_COPY.photoViewerLabel}
        />
      )}
    </>
  );
}

export default KeptMediaViewer;
