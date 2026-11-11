import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FallbackImage from '@/components/FallbackImage';
import FormSheet from '@/components/FormSheet';
import ImageViewer from '@/components/ImageViewer';
import { useAuth } from '@/hooks/useAuth';
import { forgetSealedObject } from '@/hooks/useSealedObjectUrl';
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

/** One kept photo: the picture (a tap opens it full screen, with zoom), its caption and the day it was sent, and Remove photo, which offers Undo in a toast. */
function KeptMediaViewer({ media, record, onClose }: KeptMediaViewerProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { url, isFailed } = useMediaUrl(media, 'full');
  const [isFull, setIsFull] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const day = HELM_COPY.mediaFromTurn(formatDateShort(media.createdAt));

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
          title: HELM_COPY.mediaRemovedToast,
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
      <FormSheet isOpen onClose={onClose} title={HELM_COPY.photoSheetTitle}>
        <div className='space-y-4'>
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
          {(isFailed || media.isUnreadable) && (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.photoUnreadable}
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
              label={HELM_COPY.photoRemove}
              subtitle={HELM_COPY.mediaRemoveSubtitle}
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
