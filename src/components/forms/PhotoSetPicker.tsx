import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent,
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
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';

const DEFAULT_MAX = 12;
// A little after the undo bar's own six seconds, so Undo is never offered for a removal that has already gone through.
const REMOVE_DELAY_MS = 6500;
const FOCUS_AFTER_REMOVAL_MS = 350;
const PENDING_ORDER_HOLD_MS = 3000;
const MOUSE_DRAG_PX = 5;
const TOUCH_HOLD_MS = 300;
const TOUCH_SLOP_PX = 8;
const EDGE_SCROLL_ZONE_PX = 40;
const EDGE_SCROLL_MAX_PX = 12;
const CLICK_GUARD_MS = 80;
// Positioning stays with the call site: a `relative` here would beat the `absolute` of a corner button.
const HIT_AREA = "before:absolute before:-inset-2 before:content-['']";

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
  /** Said in place of the add buttons at the cap. */
  fullMessage?: string;
}

interface Notice {
  message: string;
  isError: boolean;
}

interface Press {
  id: string;
  from: number;
  count: number;
  pointerId: number;
  isMouse: boolean;
  startX: number;
  startY: number;
  startScroll: number;
  pointerX: number;
  isActive: boolean;
  timer: number | null;
}

interface DragState {
  id: string;
  from: number;
  over: number;
  x: number;
}

// A thumb (5.5rem) plus the row's gap (0.5rem).
const SLOT = '6rem';

const thumbStyle = (
  drag: DragState | null,
  id: string,
  index: number,
): CSSProperties | undefined => {
  if (drag === null) return undefined;
  if (drag.id === id) {
    return { transform: `translateX(${drag.x}px) scale(1.05)` };
  }
  if (index > drag.from && index <= drag.over) {
    return { transform: `translateX(calc(${SLOT} * -1))` };
  }
  if (index < drag.from && index >= drag.over) {
    return { transform: `translateX(${SLOT})` };
  }
  return undefined;
};

const blockTouchScroll = (event: TouchEvent) => event.preventDefault();

interface ThumbFrameProps {
  isCover?: boolean;
  children: ReactNode;
}

function ThumbFrame({ isCover = false, children }: ThumbFrameProps) {
  return (
    <div className='bg-muted border-border relative size-22 shrink-0 snap-start overflow-hidden rounded-xl border'>
      {children}
      {isCover && (
        <span className='bg-accent text-accent-foreground absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-xs font-semibold'>
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
          <span className='text-destructive text-xs leading-tight'>
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
            'bg-background/80 absolute top-1 right-1 size-6 min-w-6 px-0! py-0!',
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
            (status === 'preparing' || status === 'saving') && 'opacity-60',
          )}
        />
      )}
      {status !== 'saved' && (
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
      )}
    </ThumbFrame>
  );
}

/** Several photos for one record: a camera loop, a library multi-pick, the first as the cover, and a tapped photo's sheet to make it the cover, move it or remove it (with undo). Each photo is shrunk on the device and saved on its own (`usePhotoSetUploads`), so one uploading never holds the screen. */
function PhotoSetPicker({
  photos,
  uploads,
  max = DEFAULT_MAX,
  onReorder,
  onRemove,
  fullMessage = `That's ${max}, the most you can add.`,
}: PhotoSetPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const isTouch = useCanTakePhoto();
  const addAreaRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const endPress = useRef<(() => void) | null>(null);
  const didDrag = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const moveToken = useRef(0);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { pending: undoPending, showUndo, undo } = useUndoRemoval();
  const removal = useRef<{ id: string; timer: number } | null>(null);
  const removeRef = useRef(onRemove);

  useEffect(() => {
    removeRef.current = onRemove;
  });

  const unhide = useCallback((id: string) => {
    setHiddenIds(
      (current) => new Set([...current].filter((hidden) => hidden !== id)),
    );
  }, []);

  const commitRemoval = useCallback(() => {
    const current = removal.current;
    if (current === null) return;
    removal.current = null;
    window.clearTimeout(current.timer);
    void removeRef.current(current.id).catch(() => {
      setNotice({
        message:
          "That photo wasn't removed. Removing a photo needs a connection; try again when you're back online.",
        isError: true,
      });
      unhide(current.id);
    });
  }, [unhide]);

  useEffect(() => commitRemoval, [commitRemoval]);

  const visible = photos.filter((photo) => !hiddenIds.has(photo.id));
  const isCaughtUp =
    pendingIds !== null &&
    visible.map((photo) => photo.id).join() === pendingIds.join();
  const shown =
    pendingIds === null || isCaughtUp
      ? visible
      : [
          ...pendingIds.flatMap((id) =>
            visible.filter((photo) => photo.id === id),
          ),
          ...visible.filter((photo) => !pendingIds.includes(photo.id)),
        ];
  const count = shown.length + uploads.uploads.length;
  const remaining = Math.max(0, max - count);
  const opened = shown.find((photo) => photo.id === openId) ?? null;
  const openedIndex = opened === null ? -1 : shown.indexOf(opened);

  const addFiles = (files: File[]) => {
    const accepted = files.slice(0, remaining);
    const left = files.length - accepted.length;
    setNotice(
      left > 0
        ? {
            message: `There was room for ${accepted.length}, so ${left} ${left === 1 ? "wasn't" : "weren't"} added.`,
            isError: false,
          }
        : null,
    );
    if (accepted.length > 0) uploads.add(accepted);
  };

  const move = (id: string, to: number) => {
    const ids = shown.map((photo) => photo.id);
    const without = ids.filter((photoId) => photoId !== id);
    const next = [...without.slice(0, to), id, ...without.slice(to)];
    setNotice(null);
    setPendingIds(next);
    const token = (moveToken.current += 1);
    const clearIfLatest = () => {
      if (moveToken.current === token) setPendingIds(null);
    };
    // A saved order shows from the record once its listener catches up; this only lets go if it never does.
    void onReorder(next).then(
      () => window.setTimeout(clearIfLatest, PENDING_ORDER_HOLD_MS),
      () => {
        clearIfLatest();
        setNotice({
          message:
            "The order didn't save. Changing it needs a connection; try again when you're back online.",
          isError: true,
        });
      },
    );
  };

  const latest = useRef({ move, count: shown.length });

  useEffect(() => {
    latest.current = { move, count: shown.length };
  });

  useEffect(() => () => endPress.current?.(), []);

  const startPress = (
    event: PointerEvent<HTMLLIElement>,
    id: string,
    from: number,
  ) => {
    const row = listRef.current;
    if (!event.isPrimary || event.button !== 0 || !row || shown.length < 2)
      return;
    endPress.current?.();
    didDrag.current = false;
    const isMouse = event.pointerType === 'mouse';
    const current: Press = {
      id,
      from,
      count: shown.length,
      pointerId: event.pointerId,
      isMouse,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: row.scrollLeft,
      pointerX: event.clientX,
      isActive: false,
      timer: null,
    };
    const loop = { frame: 0 };

    const measure = () => {
      const first = row.children[0] as HTMLElement | undefined;
      const second = row.children[1] as HTMLElement | undefined;
      const step = first && second ? second.offsetLeft - first.offsetLeft : 96;
      const x =
        current.pointerX -
        current.startX +
        row.scrollLeft -
        current.startScroll;
      const over = Math.min(
        current.count - 1,
        Math.max(0, Math.round(current.from + x / step)),
      );
      return { x, over };
    };

    const update = () => setDrag({ id, from, ...measure() });

    const tick = () => {
      const box = row.getBoundingClientRect();
      const toLeft = current.pointerX - (box.left + EDGE_SCROLL_ZONE_PX);
      const toRight = current.pointerX - (box.right - EDGE_SCROLL_ZONE_PX);
      const pace = (depth: number) =>
        Math.min(
          EDGE_SCROLL_MAX_PX,
          Math.ceil(
            (Math.abs(depth) / EDGE_SCROLL_ZONE_PX) * EDGE_SCROLL_MAX_PX,
          ),
        );
      const before = row.scrollLeft;
      if (toLeft < 0) row.scrollLeft -= pace(toLeft);
      else if (toRight > 0) row.scrollLeft += pace(toRight);
      if (row.scrollLeft !== before) update();
      loop.frame = window.requestAnimationFrame(tick);
    };

    const begin = () => {
      current.isActive = true;
      didDrag.current = true;
      if (current.timer !== null) window.clearTimeout(current.timer);
      current.timer = null;
      document.addEventListener('touchmove', blockTouchScroll, {
        passive: false,
      });
      update();
      loop.frame = window.requestAnimationFrame(tick);
    };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== current.pointerId) return;
      current.pointerX = moveEvent.clientX;
      if (current.isActive) {
        update();
        return;
      }
      const distance = Math.hypot(
        moveEvent.clientX - current.startX,
        moveEvent.clientY - current.startY,
      );
      if (isMouse && distance > MOUSE_DRAG_PX) begin();
      else if (!isMouse && distance > TOUCH_SLOP_PX) finish(false);
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== current.pointerId) return;
      finish(upEvent.type === 'pointerup');
    };

    const finish = (shouldDrop: boolean) => {
      const wasActive = current.isActive;
      const over = wasActive && shouldDrop ? measure().over : from;
      if (current.timer !== null) window.clearTimeout(current.timer);
      window.cancelAnimationFrame(loop.frame);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.removeEventListener('touchmove', blockTouchScroll);
      endPress.current = null;
      setDrag(null);
      if (wasActive) {
        window.setTimeout(() => {
          didDrag.current = false;
        }, CLICK_GUARD_MS);
        if (over !== from) latest.current.move(id, over);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    endPress.current = () => finish(false);
    if (!isMouse) current.timer = window.setTimeout(begin, TOUCH_HOLD_MS);
  };

  const startRemoval = (id: string) => {
    commitRemoval();
    uploads.forget(id);
    setOpenId(null);
    setHiddenIds((current) => new Set([...current, id]));
    removal.current = {
      id,
      timer: window.setTimeout(commitRemoval, REMOVE_DELAY_MS),
    };
    showUndo('Removed a photo', () => {
      const current = removal.current;
      if (current?.id !== id) return;
      window.clearTimeout(current.timer);
      removal.current = null;
      unhide(id);
    });
    window.setTimeout(
      () => addAreaRef.current?.querySelector('button')?.focus(),
      FOCUS_AFTER_REMOVAL_MS,
    );
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
        <div className='space-y-1'>
          <p className='text-muted-foreground text-xs tabular-nums'>
            {count} of {max}
          </p>
          {shown.length > 1 && (
            <p className='text-muted-foreground text-xs'>
              {isTouch
                ? 'Hold and drag to reorder. Tap a photo to make it the cover.'
                : 'Drag to reorder. Click a photo to make it the cover.'}
            </p>
          )}
          <ul
            ref={listRef}
            className={join(
              '-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1',
              drag === null ? 'snap-x' : 'snap-none',
            )}
          >
            {shown.map((photo, index) => (
              <li
                key={photo.id}
                className={join(
                  'relative shrink-0 select-none [-webkit-touch-callout:none]',
                  drag?.id === photo.id
                    ? 'z-10 shadow-xl'
                    : 'motion-safe:transition-transform motion-safe:duration-150',
                )}
                style={thumbStyle(drag, photo.id, index)}
                onPointerDown={(event) => startPress(event, photo.id, index)}
                onContextMenu={(event) => event.preventDefault()}
                onClickCapture={(event) => {
                  if (!didDrag.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <ThumbFrame isCover={index === 0}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Photo ${index + 1} of ${shown.length}, options`}
                    className='size-full rounded-none px-0! py-0!'
                    onClick={() => setOpenId(photo.id)}
                  >
                    {photo.url && (
                      <FallbackImage
                        src={photo.url}
                        alt=''
                        draggable={false}
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
                      'bg-background/80 text-foreground! absolute top-1 right-1 size-6 min-w-6 px-0! py-0!',
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
        </div>
      )}
      {remaining === 0 ? (
        <p className='text-muted-foreground text-sm'>{fullMessage}</p>
      ) : (
        <div ref={addAreaRef} className='space-y-2'>
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
        <p
          className={join(
            'text-sm',
            notice.isError ? 'text-destructive' : 'text-muted-foreground',
          )}
          role={notice.isError ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      )}
      <UndoSnackbar
        pending={undoPending}
        onUndo={undo}
        isOverSheet={opened !== null}
      />
      <DetailSheet
        isOpen={opened !== null}
        onClose={() => setOpenId(null)}
        title={
          opened === null
            ? 'Photo'
            : `Photo ${openedIndex + 1} of ${shown.length}`
        }
        footer={
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              size='lg'
              rounded='full'
              className='flex-1'
              onClick={() => setOpenId(null)}
            >
              Done
            </Button>
          </div>
        }
      >
        {opened !== null && (
          <div className='space-y-3'>
            {opened.url && (
              <FallbackImage
                src={opened.url}
                alt=''
                className='aspect-4/3 w-full rounded-2xl object-cover'
              />
            )}
            <ActionGroup>
              {openedIndex > 0 && (
                <ActionRow
                  isGrouped
                  icon={<Star />}
                  label='Make cover'
                  onClick={() => move(opened.id, 0)}
                />
              )}
              {openedIndex > 0 && (
                <ActionRow
                  isGrouped
                  icon={<ArrowLeft />}
                  label='Move earlier'
                  onClick={() => move(opened.id, openedIndex - 1)}
                />
              )}
              {openedIndex < shown.length - 1 && (
                <ActionRow
                  isGrouped
                  icon={<ArrowRight />}
                  label='Move later'
                  onClick={() => move(opened.id, openedIndex + 1)}
                />
              )}
              <ActionRow
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
