import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Star, Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FallbackImage from '@/components/FallbackImage';
import FormSheet from '@/components/FormSheet';
import ImageViewer from '@/components/ImageViewer';
import { useAuth } from '@/hooks/useAuth';
import { forgetSealedObject } from '@/hooks/useSealedObjectUrl';
import { HELM_COPY } from '@apps/helm/constants';
import { useMediaUrl } from '@apps/helm/hooks/useMediaUrl';
import {
  makeMainPhoto,
  type PhotoOwner,
  removePhoto,
} from '@apps/helm/store/actions/mediaActions';
import type { OpenMedia } from '@apps/helm/types';

interface MediaViewerProps {
  owner: PhotoOwner;
  /** Names the photo for screen readers and the main-photo line. */
  ownerName: string;
  media: OpenMedia;
  isMain: boolean;
  /** Where the photo sits among the record's photos, from 1. */
  position: number;
  total: number;
  onClose: () => void;
}

/** One photo of a who or place: the picture (a tap opens it full screen, with zoom), then Make main photo and Remove photo. A removal offers Undo in a toast. */
function MediaViewer({
  owner,
  ownerName,
  media,
  isMain,
  position,
  total,
  onClose,
}: MediaViewerProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { url, isFailed } = useMediaUrl(media, 'full');
  const [isFull, setIsFull] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const makeMain = async () => {
    if (!user) return;
    setIsBusy(true);
    try {
      const result = await makeMainPhoto(user.uid, owner, media.id);
      if (result === 'missing') {
        addToast({ title: HELM_COPY.photoGone, type: 'info' });
      } else {
        const { restore } = result;
        addToast({
          title: HELM_COPY.photoMadeMain,
          type: 'info',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void restore().then(
                () =>
                  addToast({ title: HELM_COPY.photoMainBack, type: 'info' }),
                (error: unknown) => {
                  console.error('Helm main photo was not put back', error);
                  addToast({
                    title: HELM_COPY.photoMakeMainFailed,
                    type: 'error',
                  });
                },
              ),
          },
        });
      }
      onClose();
    } catch (error) {
      console.error('Helm main photo was not changed', error);
      addToast({ title: HELM_COPY.photoMakeMainFailed, type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.photoRemoveNeedsConnection, type: 'info' });
      return;
    }
    setIsBusy(true);
    try {
      const removed = await removePhoto(
        user.uid,
        owner,
        media.id,
        media.hasThumb,
      );
      forgetSealedObject(media.id);
      if (removed === 'missing') {
        addToast({ title: HELM_COPY.photoGone, type: 'info' });
      } else {
        const { restore } = removed;
        addToast({
          title: HELM_COPY.photoRemoved,
          type: 'success',
          action: restore
            ? {
                label: HELM_COPY.undo,
                onClick: () =>
                  void restore().then(
                    () =>
                      addToast({
                        title: HELM_COPY.photoRestored,
                        type: 'info',
                      }),
                    (error: unknown) => {
                      console.error('Helm photo was not put back', error);
                      addToast({
                        title: HELM_COPY.photoRestoreFailed,
                        type: 'error',
                      });
                    },
                  ),
              }
            : undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error('Helm photo was not removed', error);
      addToast({ title: HELM_COPY.photoRemoveFailed, type: 'error' });
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
            className='bg-muted relative flex aspect-4/3 h-auto max-h-[40dvh] w-full items-center justify-center overflow-hidden rounded-2xl p-0'
            disabled={!url}
            aria-label={HELM_COPY.photoOpenFull}
            onClick={() => setIsFull(true)}
          >
            {url && (
              <FallbackImage
                src={url}
                alt={HELM_COPY.photoOfTotal(ownerName, position, total)}
                className='size-full object-contain'
              />
            )}
          </Button>
          {(isFailed || media.isUnreadable) && (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.photoUnreadable}
            </p>
          )}
          <ActionGroup>
            {!isMain && (
              <ActionRow
                isGrouped
                icon={<Star />}
                label={HELM_COPY.photoMakeMain}
                subtitle={
                  owner.kind === 'who'
                    ? HELM_COPY.photoMakeMainSubtitle(ownerName)
                    : HELM_COPY.photoMakeMainPlaceSubtitle
                }
                isDisabled={isBusy}
                onClick={() => void makeMain()}
              />
            )}
            <ActionRow
              isGrouped
              isDestructive
              icon={<Trash2 />}
              label={HELM_COPY.photoRemove}
              subtitle={HELM_COPY.photoRemoveSubtitle}
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
              caption: HELM_COPY.photoOfTotal(ownerName, position, total),
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

export default MediaViewer;
