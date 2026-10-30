import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { useSheetHistory } from '@/hooks/useBackHistory';

export interface ViewerImage {
  src: string;
  caption: string | null;
}

interface ImageViewerProps {
  images: ViewerImage[];
  startIndex: number;
  onClose: () => void;
}

const SWIPE_PX = 50;

/**
 * Pictures full screen in the same tab, over whatever is open: swipe, the arrows or the arrow keys
 * step through them, and a tap on the empty space, Escape or the back gesture closes only this layer.
 */
function ImageViewer({ images, startIndex, onClose }: ImageViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const swipeStart = useRef<number | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const { dialogId, onDialogClose } = useSheetHistory(true, onClose);
  const image = images[index] ?? images[0];
  const count = images.length;
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

  if (!image) return null;
  return createPortal(
    <div
      ref={root}
      id={dialogId}
      role='dialog'
      aria-modal='true'
      aria-label='Screenshots'
      tabIndex={-1}
      className='fixed inset-0 z-100 flex flex-col bg-black/95 text-white outline-none'
    >
      <div className='flex items-center gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]'>
        <p className='min-w-0 flex-1 truncate text-sm'>
          {image.caption ?? 'Screenshot'}
        </p>
        {images.length > 1 ? (
          <span className='text-xs tabular-nums text-white/70'>
            {index + 1} / {images.length}
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
          if (Math.abs(moved) >= SWIPE_PX) step(moved < 0 ? 1 : -1);
        }}
      >
        <FallbackImage
          key={image.src}
          src={image.src}
          alt={image.caption ?? 'Screenshot'}
          draggable={false}
          className='max-h-full max-w-full rounded-lg object-contain select-none'
          fallback={<p className='text-sm text-white/70'>Couldn&apos;t load this picture.</p>}
        />
        {images.length > 1 ? (
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
              disabled={index === images.length - 1}
              className='absolute top-1/2 right-2 -translate-y-1/2 bg-black/50 text-white! disabled:opacity-30'
              onClick={() => step(1)}
            >
              <ChevronRight className='size-5' aria-hidden='true' />
            </Button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default ImageViewer;
