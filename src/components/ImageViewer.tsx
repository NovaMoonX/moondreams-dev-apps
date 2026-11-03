import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface ViewerPicture {
  src: string;
  label: string | null;
}

export interface ViewerSlide {
  caption: string | null;
  /** A longer line about the slide, laid over the bottom of the picture until dismissed; null for none. */
  note?: string | null;
  pictures: ViewerPicture[];
}

interface ImageViewerProps {
  slides: ViewerSlide[];
  startIndex: number;
  onClose: () => void;
  /** What the pictures are, for screen readers; defaults to screenshots. */
  label?: string;
}

const DRAG_START_PX = 8;
const COMMIT_FRACTION = 0.2;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 24;
const EDGE_RESISTANCE = 3;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startAt: number;
  isActive: boolean;
}

/** Pictures full screen in the same tab, over whatever is open; closes only its own layer. */
function ImageViewer({
  slides,
  startIndex,
  onClose,
  label = 'Screenshots',
}: ImageViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [pick, setPick] = useState({ slide: startIndex, picture: 0 });
  const [hiddenNotes, setHiddenNotes] = useState<number[]>([]);
  const isNarrow = useMediaQuery().isBelow('sm');
  const drag = useRef<Drag | null>(null);
  const didSwipe = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const { dialogId, onDialogClose } = useSheetHistory(true, onClose);
  const slide = slides[index] ?? slides[0];
  const count = slides.length;
  const step = useCallback(
    (by: number) =>
      setIndex((current) => Math.min(count - 1, Math.max(0, current + by))),
    [count],
  );

  useEffect(() => {
    const opener = document.activeElement;
    root.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled])',
          ) ?? [],
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const isOutside = !root.current?.contains(document.activeElement);
        if (!first || !last) return;
        if (isOutside || (event.shiftKey && document.activeElement === first)) {
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus();
        } else return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'Escape') onDialogClose();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [step, onDialogClose]);

  if (!slide) return null;
  const isNoteHidden = hiddenNotes.includes(index);
  const shownPicture = pick.slide === index ? pick.picture : 0;
  const shown = isNarrow
    ? slide.pictures.slice(shownPicture, shownPicture + 1)
    : slide.pictures;
  return createPortal(
    <div
      ref={root}
      id={dialogId}
      role='dialog'
      aria-modal='true'
      aria-label={label}
      tabIndex={-1}
      className='fixed inset-0 z-100 flex flex-col bg-black text-white outline-none'
    >
      <div className='flex items-center gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]'>
        <p className='line-clamp-2 min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'>
          {slide.caption ?? 'Screenshot'}
        </p>
        {slide.note && isNoteHidden ? (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            aria-label='Show the note'
            className="relative text-white! before:absolute before:-inset-1.5 before:content-['']"
            onClick={() =>
              setHiddenNotes((current) => current.filter((at) => at !== index))
            }
          >
            <Info className='size-5' aria-hidden='true' />
          </Button>
        ) : null}
        {count > 1 ? (
          <span className='text-xs text-white/70 tabular-nums'>
            {index + 1} / {count}
          </span>
        ) : null}
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label='Close'
          className="relative text-white! before:absolute before:-inset-1.5 before:content-['']"
          onClick={onDialogClose}
        >
          <X className='size-5' aria-hidden='true' />
        </Button>
      </div>
      <div
        className='relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]'
        onClick={(event) => {
          if (didSwipe.current) {
            didSwipe.current = false;
            return;
          }
          if (event.target === event.currentTarget) onDialogClose();
        }}
        onPointerDown={(event) => {
          didSwipe.current = false;
          if (
            !event.isPrimary ||
            (event.target as HTMLElement).closest('button')
          )
            return;
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startAt: event.timeStamp,
            isActive: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (current?.pointerId !== event.pointerId) return;
          const moved = event.clientX - current.startX;
          if (!current.isActive) {
            const isHorizontal =
              Math.abs(moved) > DRAG_START_PX &&
              Math.abs(moved) > Math.abs(event.clientY - current.startY);
            if (!isHorizontal) return;
            current.isActive = true;
            didSwipe.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsDragging(true);
          }
          const isAtEdge =
            (index === 0 && moved > 0) || (index === count - 1 && moved < 0);
          setDragX(isAtEdge ? moved / EDGE_RESISTANCE : moved);
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          drag.current = null;
          if (current?.pointerId !== event.pointerId || !current.isActive)
            return;
          const moved = event.clientX - current.startX;
          const elapsed = Math.max(1, event.timeStamp - current.startAt);
          const isFlick =
            Math.abs(moved) >= FLICK_MIN_PX &&
            Math.abs(moved) / elapsed >= FLICK_PX_PER_MS;
          const isFar =
            Math.abs(moved) >=
            event.currentTarget.clientWidth * COMMIT_FRACTION;
          if (isFar || isFlick) step(moved < 0 ? 1 : -1);
          setIsDragging(false);
          setDragX(0);
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          setIsDragging(false);
          setDragX(0);
        }}
      >
        <div
          className={join(
            'flex size-full min-h-0 items-center justify-center gap-3',
            !isDragging &&
              'transition-transform duration-200 motion-reduce:transition-none',
          )}
          style={{ transform: `translateX(${dragX}px)` }}
        >
          {shown.map((picture) => (
            <figure
              key={picture.src}
              className='flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-2'
            >
              {picture.label ? (
                <figcaption className='rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white'>
                  {picture.label}
                </figcaption>
              ) : null}
              <FallbackImage
                src={picture.src}
                alt={picture.label ?? slide.caption ?? 'Screenshot'}
                draggable={false}
                className='min-h-0 max-w-full flex-1 rounded-lg object-contain select-none'
                fallback={
                  <p className='text-sm text-white/70'>
                    Couldn&apos;t load this picture.
                  </p>
                }
              />
            </figure>
          ))}
        </div>
        {slide.note && !isNoteHidden ? (
          <div className='absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto flex max-w-md items-start gap-2 rounded-xl bg-black/80 p-3 text-sm text-white shadow-lg backdrop-blur'>
            <p className='min-w-0 flex-1 [overflow-wrap:anywhere]'>
              {slide.note}
            </p>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              aria-label='Hide the note'
              className="relative -my-1 size-7 min-w-7 p-0 text-white! before:absolute before:-inset-1.5 before:content-['']"
              onClick={() => setHiddenNotes((current) => [...current, index])}
            >
              <X className='size-4' aria-hidden='true' />
            </Button>
          </div>
        ) : null}
        {count > 1 ? (
          <>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              aria-label='Previous'
              disabled={index === 0}
              className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/50 text-white! before:absolute before:-inset-2 before:content-[''] disabled:opacity-30"
              onClick={() => step(-1)}
            >
              <ChevronLeft className='size-5' aria-hidden='true' />
            </Button>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              aria-label='Next'
              disabled={index === count - 1}
              className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/50 text-white! before:absolute before:-inset-2 before:content-[''] disabled:opacity-30"
              onClick={() => step(1)}
            >
              <ChevronRight className='size-5' aria-hidden='true' />
            </Button>
          </>
        ) : null}
      </div>
      {isNarrow && slide.pictures.length > 1 ? (
        <div
          role='group'
          aria-label='Pictures of this screen'
          className='flex justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]'
        >
          {slide.pictures.map((picture, pictureIndex) => (
            <Button
              key={picture.src}
              type='button'
              size='sm'
              rounded='full'
              variant={pictureIndex === shownPicture ? 'secondary' : 'tertiary'}
              aria-pressed={pictureIndex === shownPicture}
              className={pictureIndex === shownPicture ? '' : 'text-white!'}
              onClick={() => setPick({ slide: index, picture: pictureIndex })}
            >
              {picture.label ?? `Picture ${pictureIndex + 1}`}
            </Button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export default ImageViewer;
