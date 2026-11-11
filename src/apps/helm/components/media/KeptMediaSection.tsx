import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { formatDateShort } from '@/utils/formatUtils';
import { forgetSealedObject } from '@/hooks/useSealedObjectUrl';
import { useAppSelector } from '@/store';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import { HELM_COPY } from '@apps/helm/constants';
import { removeKeptMedia } from '@apps/helm/store/actions/mediaActions';
import type { MediaAttachment, OpenMedia } from '@apps/helm/types';

interface KeptMediaSectionProps {
  record: MediaAttachment;
}

/** The photos kept on a task or fact: each with when it was sent and Remove photo, which offers Undo. Draws nothing while there are none. */
function KeptMediaSection({ record }: KeptMediaSectionProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const items = useAppSelector((state) => state.helm.media.items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = items.filter(
    (entry) =>
      entry.status === 'kept' &&
      entry.attachedTo.some(
        (held) => held.kind === record.kind && held.id === record.id,
      ),
  );
  if (shown.length === 0) return null;

  const remove = async (media: OpenMedia) => {
    if (!user || busyId !== null) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.photoRemoveNeedsConnection, type: 'info' });
      return;
    }
    setBusyId(media.id);
    try {
      const removed = await removeKeptMedia(user.uid, media, record);
      if (removed === 'gone') {
        addToast({ title: HELM_COPY.photoGone, type: 'info' });
        return;
      }
      forgetSealedObject(media.id);
      addToast({
        title: HELM_COPY.mediaRemovedToast,
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void removed.restore().catch((error: unknown) => {
              console.error('Helm photo was not put back', error);
              addToast({ title: HELM_COPY.mediaRestoreFailed, type: 'error' });
            }),
        },
      });
    } catch (error) {
      console.error('Helm photo was not removed', error);
      addToast({ title: HELM_COPY.mediaRemoveFailed, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className='space-y-3'>
      <SectionDivider label={HELM_COPY.mediaOnRecordTitle} />
      <ul className='space-y-3'>
        {shown.map((media) => (
          <li key={media.id} className='flex items-center gap-3'>
            <MediaThumb
              media={media}
              alt=''
              className='size-16 rounded-xl'
              fallback={
                <span className='text-muted-foreground grid size-full place-items-center text-[12px]'>
                  {HELM_COPY.mediaUnreadable}
                </span>
              }
            />
            <div className='min-w-0 flex-1'>
              <p className='text-[15px] break-words'>
                {HELM_COPY.mediaFromTurn(formatDateShort(media.createdAt))}
              </p>
              {media.caption && (
                <p className='text-muted-foreground text-[13px] break-words'>
                  {media.caption}
                </p>
              )}
            </div>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              disabled={busyId === media.id}
              className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
              onClick={() => void remove(media)}
            >
              {HELM_COPY.attachRemove}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default KeptMediaSection;
