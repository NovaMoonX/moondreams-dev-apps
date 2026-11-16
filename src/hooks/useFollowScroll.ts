import { type RefObject, useEffect, useRef } from 'react';

const EASE = 0.15;
const RELEASE_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

export interface FollowProgress {
  get: () => number;
  subscribe: (listener: (fraction: number) => void) => () => void;
}

const restart = (follow: { isOn: boolean; goal: number; frameId: number }) => {
  cancelAnimationFrame(follow.frameId);
  follow.isOn = true;
  follow.goal = 0;
  follow.frameId = 0;
};

/** Keeps the part of `targetRef` that `progress` has reached about `anchor` of the way down `scrollerRef`, gliding and never backwards; a wheel, touch or key on the scroller ends it until progress returns to 0 or `restartKey` changes. */
export function useFollowScroll({
  scrollerRef,
  targetRef,
  progress,
  anchor = 0.4,
  restartKey,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  targetRef: RefObject<HTMLElement | null>;
  progress: FollowProgress;
  anchor?: number;
  restartKey?: string;
}) {
  const follow = useRef({ isOn: true, goal: 0, frameId: 0 });

  useEffect(() => {
    restart(follow.current);
  }, [restartKey]);

  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const state = follow.current;
    const isReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const glide = () => {
      state.frameId = 0;
      const gap = state.goal - box.scrollTop;
      if (!state.isOn || gap < 0.5) return;
      const before = box.scrollTop;
      box.scrollTop = before + Math.min(gap, Math.max(1, gap * EASE));
      if (box.scrollTop === before) return;
      state.frameId = requestAnimationFrame(glide);
    };
    const update = (fraction: number) => {
      if (fraction === 0) {
        restart(state);
        return;
      }
      const target = targetRef.current;
      if (!target || !state.isOn) return;
      state.goal = Math.max(
        state.goal,
        Math.min(
          box.scrollHeight - box.clientHeight,
          target.offsetTop +
            fraction * target.offsetHeight -
            box.clientHeight * anchor,
        ),
      );
      if (isReduced) box.scrollTop = Math.max(box.scrollTop, state.goal);
      else if (state.frameId === 0)
        state.frameId = requestAnimationFrame(glide);
    };
    const release = () => {
      state.isOn = false;
    };
    const releaseOnKey = (event: KeyboardEvent) => {
      if (RELEASE_KEYS.has(event.key)) release();
    };
    update(progress.get());
    const unsubscribe = progress.subscribe(update);
    box.addEventListener('wheel', release, { passive: true });
    box.addEventListener('touchstart', release, { passive: true });
    box.addEventListener('keydown', releaseOnKey);
    return () => {
      unsubscribe();
      cancelAnimationFrame(state.frameId);
      state.frameId = 0;
      box.removeEventListener('wheel', release);
      box.removeEventListener('touchstart', release);
      box.removeEventListener('keydown', releaseOnKey);
    };
  }, [progress, scrollerRef, targetRef, anchor]);
}
