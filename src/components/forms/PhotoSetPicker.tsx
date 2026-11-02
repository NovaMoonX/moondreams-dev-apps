import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import FallbackImage from '@/components/FallbackImage';
import UndoSnackbar from '@/components/UndoSnackbar';
import {
  type PhotoSetUploads,
  type PhotoUpload,
} from '@/hooks/usePhotoSetUploads';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { getErrorMessage } from '@/utils/errorUtils';

const DEFAULT_MAX = 12;
const REMOVE_DELAY_MS = 6000;
const TOUCH_QUERY = '(pointer: coarse)';
const HIT_AREA = "relative before:absolute before:-inset-2 before:content-['']";

const subscribeToPointer = (onChange: () => void) => {
  const query = window.matchMedia(TOUCH_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getIsTouch = () => window.matchMedia(TOUCH_QUERY).matches;

/** A photo that is already saved with its record; the first is the cover. */
export interface PickerPhoto {
  id: string;
  /** Null while the address is still being looked up. */
  url: string | null;
}

interface PhotoSetPickerProps {
  photos: PickerPhoto[];
  /** From `usePhotoSetUploads`, held by the screen that owns the record so uploads outlive this picker. */
  uploads: PhotoSetUploads;
  /** Most photos the record can hold; the camera button gives way to a line at this count. */
  max?: number;
  /** Saves the whole new order; the first id is the cover. */
  onReorder: (ids: string[]) => Promise<void>;
  /** Takes the photo off the record, called once the undo window has passed. */
  onRemove: (id: string) => Promise<void>;
}

interface ThumbFrameProps {
  isCover?: boolean;
  children: ReactNode;
}

function ThumbFrame({ isCover = false, children }: ThumbFrameProps) {
  return (
    <div className='bg-muted border-border relative size-22 shrink-0 snap-start overflow-hidden rounded-xl border'>
      {children}
      {isCover && (
        <span className='bg-accent text-accent-foreground absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold'>
          Cover
        </span>
      )}
    </div>
  );
}

interface UploadThumbProps {
  upload: PhotoUpload;
  onRetry: () => void;
  onDismiss: () => void;
}

/** A picked photo shrinking and saving; only this thumb shows it, and a failure stays here with a way to try again. */
function UploadThumb({ upload, onRetry, onDismiss }: UploadThumbProps) {
  const { previewUrl, status, message } = upload;

  if (status === 'failed') {
    return (
      <ThumbFrame>
        <div className='flex size-full flex-col items-center justify-center gap-1 p-1 text-center'>
          <span className='text-destructive text-[11px] leading-tight'>
            {previewUrl === null ? "Can't open this" : "Didn't upload"}
          </span>
          {previewUrl !== null && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              rounded='full'
              className='h-7 px-2 text-xs'
              aria-label={`${message ?? "This photo didn't upload."} Try again`}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </div>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label='Dismiss this photo'
          className={join(
            HIT_AREA,
            'bg-background/80 absolute top-1 right-1 size-6 min-w-6 p-0',
          )}
          onClick={onDismiss}
        >
          <X className='size-3.5' aria-hidden='true' />
        </Button>
      </ThumbFrame>
    );
  }

  return (
    <ThumbFrame>
      {previewUrl && (
        <img
          src={previewUrl}
          alt=''
          className={join(
            'size-full object-cover',
            status === 'saving' && 'opacity-60',
          )}
        />
      )}
      <span
        role='status'
        aria-label='Saving this photo'
        className='absolute inset-0 grid place-items-center'
      >
        <Loader2
          className='text-muted-foreground size-6 motion-safe:animate-spin'
          aria-hidden='true'
        />
      </span>
    </ThumbFrame>
  );
}

/** Several photos for one record: a camera loop, a library multi-pick, the first as the cover, and a tapped photo's sheet to make it the cover, move it or remove it (with undo). Each photo is shrunk for a listing on the device and saved on its own (`usePhotoSetUploads`), so one uploading never holds the screen. */
function PhotoSetPicker({
  photos,
  uploads,
  max = DEFAULT_MAX,
  onReorder,
  onRemove,
}: PhotoSetPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const isTouch = useSyncExternalStore(
    subscribeToPointer,
    getIsTouch,
    () => false,
  );
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { pending: undoPending, showUndo, undo } = useUndoRemoval();
  const removal = useRef<{ id: string; timer: number } | null>(null);
  const removeRef = useRef(onRemove);

  useEffect(() => {
    removeRef.current = onRemove;
  });

  const commitRemoval = useCallback(() => {
    const current = removal.current;
    if (current === null) return;
    removal.current = null;
    window.clearTimeout(current.timer);
    void removeRef.current(current.id).catch(() => {
      setNotice("That photo couldn't be removed. Try again.");
      setHiddenId(null);
    });
  }, []);

  useEffect(() => commitRemoval, [commitRemoval]);

  const shown = photos.filter((photo) => photo.id !== hiddenId);
  const count = shown.length + uploads.uploads.length;
  const remaining = Math.max(0, max - count);
  const opened = shown.find((photo) => photo.id === openId) ?? null;
  const openedIndex = opened === null ? -1 : shown.indexOf(opened);

  const addFiles = (files: File[]) => {
    const accepted = files.slice(0, remaining);
    setNotice(
      accepted.length < files.length
        ? `There was room for ${accepted.length}, so the rest weren't added.`
        : null,
    );
    if (accepted.length > 0) uploads.add(accepted);
  };

  const move = (id: string, to: number) => {
    const ids = shown.map((photo) => photo.id);
    const without = ids.filter((photoId) => photoId !== id);
    const next = [...without.slice(0, to), id, ...without.slice(to)];
    setNotice(null);
    void onReorder(next).catch((error: unknown) =>
      setNotice(getErrorMessage(error, "The order didn't save. Try again.")),
    );
  };

  const startRemoval = (id: string) => {
    commitRemoval();
    setOpenId(null);
    setHiddenId(id);
    removal.current = {
      id,
      timer: window.setTimeout(commitRemoval, REMOVE_DELAY_MS),
    };
    showUndo('Removed a photo', () => {
      const current = removal.current;
      if (current !== null) window.clearTimeout(current.timer);
      removal.current = null;
      setHiddenId(null);
    });
  };

  const openPicker = (input: HTMLInputElement | null) => input?.click();

  const handleChosen = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  return (
    <div className='space-y-3'>
      <input
        ref={cameraRef}
        type='file'
        accept='image/*'
        capture='environment'
        className='hidden'
        onChange={handleChosen}
      />
      <input
        ref={libraryRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={handleChosen}
      />
      {count > 0 && (
        <div className='flex items-end gap-2'>
          <ul className='-mx-1 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-1'>
            {shown.map((photo, index) => (
              <li key={photo.id} className='shrink-0'>
                <ThumbFrame isCover={index === 0}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Photo ${index + 1} of ${shown.length}, options`}
                    className='size-full rounded-none p-0'
                    onClick={() => setOpenId(photo.id)}
                  >
                    {photo.url && (
                      <FallbackImage
                        src={photo.url}
                        alt=''
                        className='size-full object-cover'
                      />
                    )}
                  </Button>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    rounded='full'
                    aria-label={`Remove photo ${index + 1}`}
                    className={join(
                      HIT_AREA,
                      'bg-background/80 text-foreground! absolute top-1 right-1 size-6 min-w-6 p-0',
                    )}
                    onClick={() => startRemoval(photo.id)}
                  >
                    <X className='size-3.5' aria-hidden='true' />
                  </Button>
                </ThumbFrame>
              </li>
            ))}
            {uploads.uploads.map((upload) => (
              <li key={upload.key} className='shrink-0'>
                <UploadThumb
                  upload={upload}
                  onRetry={() => uploads.retry(upload.key)}
                  onDismiss={() => uploads.dismiss(upload.key)}
                />
              </li>
            ))}
          </ul>
          <p className='text-muted-foreground shrink-0 pb-1 text-xs tabular-nums'>
            {count} of {max}
          </p>
        </div>
      )}
      {remaining === 0 ? (
        <p className='text-muted-foreground text-sm'>
          That&apos;s {max}, the most you can add here.
        </p>
      ) : (
        <div className='space-y-2'>
          {isTouch && (
            <Button
              type='button'
              rounded='full'
              className='h-14 w-full gap-2 text-base'
              onClick={() => openPicker(cameraRef.current)}
            >
              <Camera className='size-5' aria-hidden='true' />
              {count === 0 ? 'Take a photo' : 'Take another'}
            </Button>
          )}
          <Button
            type='button'
            variant={isTouch ? 'secondary' : 'primary'}
            rounded='full'
            className={join(
              'w-full gap-2',
              isTouch ? 'h-11' : 'h-14 text-base',
            )}
            onClick={() => openPicker(libraryRef.current)}
          >
            <ImagePlus className='size-5' aria-hidden='true' />
            Choose photos
          </Button>
        </div>
      )}
      {notice && (
        <p className='text-destructive text-sm' role='alert'>
          {notice}
        </p>
      )}
      <UndoSnackbar pending={undoPending} onUndo={undo} isOverSheet />
      <DetailSheet
        isOpen={opened !== null}
        onClose={() => setOpenId(null)}
        title='This photo'
        footer={
          <Button type='button' rounded='full' onClick={() => setOpenId(null)}>
            Done
          </Button>
        }
      >
        {opened !== null && (
          <div className='space-y-4'>
            {opened.url && (
              <FallbackImage
                src={opened.url}
                alt=''
                className='mx-auto size-30 rounded-xl object-cover'
              />
            )}
            <ActionGroup isRoomy>
              {openedIndex > 0 && (
                <ActionRow
                  isRoomy
                  isGrouped
                  icon={<Star />}
                  label='Make cover'
                  subtitle='The first photo is the one people see first.'
                  onClick={() => move(opened.id, 0)}
                />
              )}
              {openedIndex > 0 && (
                <ActionRow
                  isRoomy
                  isGrouped
                  icon={<ArrowLeft />}
                  label='Move earlier'
                  onClick={() => move(opened.id, openedIndex - 1)}
                />
              )}
              {openedIndex < shown.length - 1 && (
                <ActionRow
                  isRoomy
                  isGrouped
                  icon={<ArrowRight />}
                  label='Move later'
                  onClick={() => move(opened.id, openedIndex + 1)}
                />
              )}
              <ActionRow
                isRoomy
                isGrouped
                isDestructive
                icon={<Trash2 />}
                label='Remove'
                onClick={() => startRemoval(opened.id)}
              />
            </ActionGroup>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

export default PhotoSetPicker;
