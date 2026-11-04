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

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const KEY_ZOOM_STEP = 1.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startAt: number;
  isActive: boolean;
}

/** How far the pictures are zoomed, and how far the zoomed pictures are moved from the centre of their area. */
interface Zoom {
  scale: number;
  x: number;
  y: number;
}

interface Pan {
  pointerId: number;
  startX: number;
  startY: number;
  start: Zoom;
  isActive: boolean;
}

interface Pinch {
  distance: number;
  midX: number;
  midY: number;
  start: Zoom;
}

const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

const clampZoom = (zoom: Zoom, width: number, height: number): Zoom => {
  const scale = Math.min(MAX_ZOOM, Math.max(1, zoom.scale));
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, zoom.x)),
    y: Math.min(maxY, Math.max(-maxY, zoom.y)),
  };
};

/** The zoom at `scale` that keeps the point under the focus (measured from the area's centre) where it is. */
const zoomAround = (
  zoom: Zoom,
  scale: number,
  focusX: number,
  focusY: number,
): Zoom => {
  const ratio = scale / zoom.scale;
  return {
    scale,
    x: focusX - ratio * (focusX - zoom.x),
    y: focusY - ratio * (focusY - zoom.y),
  };
};

const readArea = (element: HTMLElement) => {
  const box = element.getBoundingClientRect();
  return {
    width: box.width,
    height: box.height,
    centerX: box.left + box.width / 2,
    centerY: box.top + box.height / 2,
  };
};

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
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<Pan | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const { dialogId, onDialogClose } = useSheetHistory(true, onClose);
  const slide = slides[index] ?? slides[0];
  const count = slides.length;
  const step = useCallback(
    (by: number) => {
      setZoom(NO_ZOOM);
      setIndex((current) => Math.min(count - 1, Math.max(0, current + by)));
    },
    [count],
  );
  const zoomByKey = useCallback((factor: number | null) => {
    const element = area.current;
    if (!element) return;
    const { width, height } = readArea(element);
    setZoom((current) =>
      factor === null
        ? NO_ZOOM
        : clampZoom(
            zoomAround(current, current.scale * factor, 0, 0),
            width,
            height,
          ),
    );
  }, []);

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
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === '+' || event.key === '=') zoomByKey(KEY_ZOOM_STEP);
      else if (event.key === '-') zoomByKey(1 / KEY_ZOOM_STEP);
      else if (event.key === '0') zoomByKey(null);
      else if (event.key === 'Escape') onDialogClose();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [step, zoomByKey, onDialogClose]);

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
        ref={area}
        className='relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))]'
        onClick={(event) => {
          if (didSwipe.current) {
            didSwipe.current = false;
            return;
          }
          if (event.target !== event.currentTarget) return;
          if (zoom.scale > 1) setZoom(NO_ZOOM);
          else onDialogClose();
        }}
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement).closest('button') ||
            (event.pointerType === 'mouse' && event.button !== 0) ||
            pointers.current.size >= 2
          )
            return;
          if (pointers.current.size === 0) didSwipe.current = false;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          const { centerX, centerY } = readArea(event.currentTarget);
          const fingers = Array.from(pointers.current.values());
          if (fingers.length === 2) {
            const [first, second] = fingers;
            drag.current = null;
            pan.current = null;
            setDragX(0);
            pinch.current = {
              distance: Math.max(
                1,
                Math.hypot(first.x - second.x, first.y - second.y),
              ),
              midX: (first.x + second.x) / 2 - centerX,
              midY: (first.y + second.y) / 2 - centerY,
              start: zoom,
            };
            didSwipe.current = true;
            setIsDragging(true);
            return;
          }
          if (fingers.length > 2 || !event.isPrimary) return;
          if (zoom.scale > 1) {
            pan.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              start: zoom,
              isActive: false,
            };
            return;
          }
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startAt: event.timeStamp,
            isActive: false,
          };
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          const { width, height, centerX, centerY } = readArea(
            event.currentTarget,
          );
          const currentPinch = pinch.current;
          if (currentPinch) {
            const fingers = Array.from(pointers.current.values());
            if (fingers.length < 2) return;
            const [first, second] = fingers;
            const distance = Math.hypot(first.x - second.x, first.y - second.y);
            const midX = (first.x + second.x) / 2 - centerX;
            const midY = (first.y + second.y) / 2 - centerY;
            const scaled = zoomAround(
              currentPinch.start,
              currentPinch.start.scale * (distance / currentPinch.distance),
              currentPinch.midX,
              currentPinch.midY,
            );
            setZoom(
              clampZoom(
                {
                  ...scaled,
                  x: scaled.x + midX - currentPinch.midX,
                  y: scaled.y + midY - currentPinch.midY,
                },
                width,
                height,
              ),
            );
            return;
          }
          const currentPan = pan.current;
          if (currentPan?.pointerId === event.pointerId) {
            const movedX = event.clientX - currentPan.startX;
            const movedY = event.clientY - currentPan.startY;
            if (!currentPan.isActive) {
              if (Math.hypot(movedX, movedY) <= DRAG_START_PX) return;
              currentPan.isActive = true;
              didSwipe.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsDragging(true);
            }
            setZoom(
              clampZoom(
                {
                  ...currentPan.start,
                  x: currentPan.start.x + movedX,
                  y: currentPan.start.y + movedY,
                },
                width,
                height,
              ),
            );
            return;
          }
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
          const wasTracked = pointers.current.delete(event.pointerId);
          if (pinch.current) {
            if (pointers.current.size < 2) {
              // A finger still down after a pinch neither pans nor counts as a tap when it lifts.
              pointers.current.clear();
              pinch.current = null;
              pan.current = null;
              lastTap.current = null;
              setIsDragging(false);
              setZoom((current) => (current.scale < 1.05 ? NO_ZOOM : current));
            }
            return;
          }
          const currentPan = pan.current;
          if (currentPan?.pointerId === event.pointerId) {
            pan.current = null;
            if (currentPan.isActive) {
              setIsDragging(false);
              return;
            }
          }
          const current = drag.current;
          drag.current = null;
          if (current?.pointerId === event.pointerId && current.isActive) {
            const moved = event.clientX - current.startX;
            const elapsed = Math.max(1, event.timeStamp - current.startAt);
            const isFlick =
              Math.abs(moved) >= FLICK_MIN_PX &&
              Math.abs(moved) / elapsed >= FLICK_PX_PER_MS;
            const isFar =
              Math.abs(moved) >=
              event.currentTarget.clientWidth * COMMIT_FRACTION;
            setDragX(0);
            if (!isFar && !isFlick) {
              setIsDragging(false);
              return;
            }
            // The new slide takes the old one's place at once; easing it back from the drag offset would slide it in against the finger.
            step(moved < 0 ? 1 : -1);
            window.requestAnimationFrame(() => setIsDragging(false));
            return;
          }
          if (!wasTracked || event.target === event.currentTarget) return;
          const previous = lastTap.current;
          const isDoubleTap =
            previous !== null &&
            event.timeStamp - previous.at <= DOUBLE_TAP_MS &&
            Math.hypot(
              event.clientX - previous.x,
              event.clientY - previous.y,
            ) <= DOUBLE_TAP_PX;
          if (!isDoubleTap) {
            lastTap.current = {
              at: event.timeStamp,
              x: event.clientX,
              y: event.clientY,
            };
            return;
          }
          lastTap.current = null;
          const { width, height, centerX, centerY } = readArea(
            event.currentTarget,
          );
          setZoom(
            zoom.scale > 1
              ? NO_ZOOM
              : clampZoom(
                  zoomAround(
                    NO_ZOOM,
                    DOUBLE_TAP_ZOOM,
                    event.clientX - centerX,
                    event.clientY - centerY,
                  ),
                  width,
                  height,
                ),
          );
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          if (pinch.current) {
            pointers.current.clear();
            pinch.current = null;
            lastTap.current = null;
          }
          if (pan.current?.pointerId === event.pointerId) pan.current = null;
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
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
          style={{
            transform: `translate(${dragX + zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
          }}
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
              onClick={() => {
                setZoom(NO_ZOOM);
                setPick({ slide: index, picture: pictureIndex });
              }}
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
