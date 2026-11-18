import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import SwipeArea from '@/components/SwipeArea';

const END_DAMPING = 0.15;
const SLIDE_MS = 200;
/** The page shows between two views while they move, so their edges never touch. */
const VIEW_GAP_PX = 24;

const isCovered = () =>
  Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) => getComputedStyle(dialog).pointerEvents !== 'none',
  );

const isReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A still copy of the view, without its floating controls or ids, standing where the view is now. */
const makeGhost = (body: HTMLElement) => {
  const ghost = body.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('.fixed').forEach((element) => element.remove());
  ghost
    .querySelectorAll('[id]')
    .forEach((element) => element.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: 'absolute',
    top: `${body.offsetTop}px`,
    left: body.style.left || '0px',
    width: `${body.offsetWidth}px`,
    margin: '0',
    pointerEvents: 'none',
    transition: 'none',
  });
  return ghost;
};

const placeBeside = (
  element: HTMLElement,
  body: HTMLElement,
  offset: number,
  direction: 1 | -1,
  transition: string,
) => {
  element.style.transition = transition;
  element.style.top = `${body.offsetTop}px`;
  element.style.width = `${body.offsetWidth}px`;
  element.style.left = `${offset + direction * (body.offsetWidth + VIEW_GAP_PX)}px`;
};

export interface SwipeViewsHandle<K extends string> {
  /** Shows a view, sliding it in from the side it sits on. */
  show: (view: K) => void;
}

interface SwipeViewsProps<K extends string> {
  /** The views a swipe moves between, in their left-to-right order. */
  views: readonly K[];
  current: K;
  onShow: (view: K) => void;
  /** Draws a neighbour while the finger pulls it in; it is inert and its floating controls are hidden. */
  renderPeek: (view: K) => ReactNode;
  /** The open view. */
  children: ReactNode;
  /** Stays put above the moving views (their pills or tiles). */
  header?: ReactNode;
  /** Return true to pause swiping (a selection in progress). */
  isPaused?: () => boolean;
  className?: string;
  bodyClassName?: string;
  ref?: Ref<SwipeViewsHandle<K>>;
}

/** Sibling views of one screen (list and calendar, a set of sections) that a sideways swipe moves between like a carousel: the view follows the finger with its neighbour beside it, then slides; floating controls step aside while two views share the screen. */
function SwipeViews<K extends string>({
  views,
  current,
  onShow,
  renderPeek,
  children,
  header,
  isPaused,
  className,
  bodyClassName,
  ref,
}: SwipeViewsProps<K>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<{
    direction: 1 | -1;
    ghost: HTMLElement;
    timer: number;
  } | null>(null);
  // The view the finger is pulling in, drawn beside this one while the drag lasts.
  const [peek, setPeek] = useState<{ view: K; direction: 1 | -1 } | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const peekTimerRef = useRef(0);
  const dragRef = useRef(0);
  const attachPeek = useCallback(
    (element: HTMLDivElement | null) => {
      peekRef.current = element;
      const body = bodyRef.current;
      if (element && body && peek)
        placeBeside(element, body, dragRef.current, peek.direction, 'none');
    },
    [peek],
  );

  const getIndex = (view: K) => views.findIndex((value) => value === view);
  const getNeighbour = (direction: 1 | -1) => {
    const index = getIndex(current);
    return index >= 0 ? views[index + direction] : undefined;
  };

  const endSlide = () => {
    const slide = slideRef.current;
    const body = bodyRef.current;
    if (slide) {
      window.clearTimeout(slide.timer);
      slide.ghost.remove();
    }
    slideRef.current = null;
    if (!body) return;
    body.style.transition = 'none';
    body.style.left = '0px';
    body.style.minHeight = '';
    delete body.dataset.moving;
  };

  // A copy of the leaving view slides out beside the arriving one. The body moves by its own offset (not a transform, which would carry a floating add button with it).
  const slideTo = (next: K, direction: 1 | -1) => {
    const body = bodyRef.current;
    if (slideRef.current) endSlide();
    if (!body || isReducedMotion()) {
      onShow(next);
      return;
    }
    const ghost = makeGhost(body);
    body.before(ghost);
    // The leaving copy no longer holds the page's height, so the view keeps it until the slide ends.
    body.style.minHeight = `${body.offsetHeight}px`;
    setPeek(null);
    slideRef.current = {
      direction,
      ghost,
      // A request that lands on the same view never runs the entry below, so the copy is cleared here.
      timer: window.setTimeout(endSlide, SLIDE_MS * 3),
    };
    onShow(next);
  };

  useImperativeHandle(ref, () => ({
    show: (view) => {
      if (view === current) return;
      const from = getIndex(current);
      const to = getIndex(view);
      if (from < 0 || to < 0) onShow(view);
      else slideTo(view, to > from ? 1 : -1);
    },
  }));

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const slide = slideRef.current;
    if (!body || !slide) return;
    const width = body.offsetWidth + VIEW_GAP_PX;
    body.style.transition = 'none';
    body.style.left = `${slide.direction * width + slide.ghost.offsetLeft}px`;
    const frame = requestAnimationFrame(() => {
      const easing = `left ${SLIDE_MS}ms ease-out`;
      body.style.transition = easing;
      body.style.left = '0px';
      slide.ghost.style.transition = easing;
      slide.ghost.style.left = `${-slide.direction * width}px`;
    });
    window.clearTimeout(slide.timer);
    slide.timer = window.setTimeout(endSlide, SLIDE_MS + 50);
    return () => cancelAnimationFrame(frame);
  }, [current]);

  useEffect(
    () => () => {
      const slide = slideRef.current;
      window.clearTimeout(peekTimerRef.current);
      if (!slide) return;
      window.clearTimeout(slide.timer);
      slide.ghost.remove();
    },
    [],
  );

  const showNeighbour = (direction: 1 | -1) => {
    if (isPaused?.()) return;
    const next = getNeighbour(direction);
    if (next && !isCovered()) slideTo(next, direction);
  };

  const followFinger = (dx: number, isEnd: boolean) => {
    const body = bodyRef.current;
    if (!body || slideRef.current || (!isEnd && (isCovered() || isPaused?.())))
      return;
    const transition = isEnd ? `left ${SLIDE_MS}ms ease-out` : 'none';
    const direction = dx < 0 ? 1 : -1;
    const next = getNeighbour(direction);
    const damping = next ? 1 : END_DAMPING;
    dragRef.current = isEnd ? 0 : dx * damping;
    body.style.transition = transition;
    body.style.left = `${dragRef.current}px`;
    window.clearTimeout(peekTimerRef.current);
    if (isEnd) {
      delete body.dataset.moving;
      if (peekRef.current && peek)
        placeBeside(peekRef.current, body, 0, peek.direction, transition);
      peekTimerRef.current = window.setTimeout(() => {
        if (!slideRef.current) setPeek(null);
      }, SLIDE_MS);
      return;
    }
    // Floating buttons belong to one view, so they step aside while two views share the screen.
    body.dataset.moving = '';
    if (!next || isReducedMotion()) {
      if (peek) setPeek(null);
      return;
    }
    if (peek?.view !== next) setPeek({ view: next, direction });
    else if (peekRef.current)
      placeBeside(
        peekRef.current,
        body,
        dragRef.current,
        direction,
        transition,
      );
  };

  return (
    <SwipeArea
      className={join('relative overflow-x-clip', className)}
      onSwipe={showNeighbour}
      onDrag={followFinger}
    >
      {header}
      {peek && (
        <div
          ref={attachPeek}
          className={join(
            'pointer-events-none absolute [&_.fixed]:hidden!',
            bodyClassName,
          )}
          aria-hidden='true'
          inert
        >
          {renderPeek(peek.view)}
        </div>
      )}
      <div
        ref={bodyRef}
        className={join(
          'relative [&_.fixed]:transition-opacity data-moving:[&_.fixed]:opacity-0',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </SwipeArea>
  );
}

export default SwipeViews;
