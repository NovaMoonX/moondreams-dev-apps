import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface ViewerPicture {
  src: string;
  /** Names the picture within its slide ("Before"); only shown when a slide has more than one. */
  label: string | null;
}

/** One screen of the viewer: a caption and the picture or pictures that belong together (a before and its after). */
export interface ViewerSlide {
  caption: string | null;
  pictures: ViewerPicture[];
}

interface ImageViewerProps {
  slides: ViewerSlide[];
  startIndex: number;
  onClose: () => void;
}

const SWIPE_PX = 50;

/**
 * Pictures full screen in the same tab, over whatever is open: swipe, the arrows or the arrow keys
 * step through the slides (a slide's pictures sit side by side where there is room, and switch with a
 * pill row where there is not), and a tap on the empty space, Escape or the back gesture closes only this layer.
 */
function ImageViewer({ slides, startIndex, onClose }: ImageViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [pick, setPick] = useState({ slide: startIndex, picture: 0 });
  const isNarrow = useMediaQuery().isBelow('sm');
  const swipeStart = useRef<number | null>(null);
  const didSwipe = useRef(false);
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
    root.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
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
      aria-label='Screenshots'
      tabIndex={-1}
      className='fixed inset-0 z-100 flex flex-col bg-black text-white outline-none'
    >
      <div className='flex items-center gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]'>
        <p className='min-w-0 flex-1 truncate text-sm'>
          {slide.caption ?? 'Screenshot'}
        </p>
        {count > 1 ? (
          <span className='text-xs tabular-nums text-white/70'>
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
          swipeStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (start === null) return;
          const moved = event.clientX - start;
          didSwipe.current = Math.abs(moved) >= SWIPE_PX;
          if (didSwipe.current) step(moved < 0 ? 1 : -1);
        }}
      >
        <div className='flex size-full min-h-0 items-center justify-center gap-3'>
          {shown.map((picture) => (
            <figure
              key={picture.src}
              className='flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-2'
            >
              {!isNarrow && picture.label ? (
                <figcaption className='text-xs text-white/70'>
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
        {count > 1 ? (
          <>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              aria-label='Previous'
              disabled={index === 0}
              className='absolute top-1/2 left-2 -translate-y-1/2 bg-black/50 text-white! disabled:opacity-30'
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
              className='absolute top-1/2 right-2 -translate-y-1/2 bg-black/50 text-white! disabled:opacity-30'
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
