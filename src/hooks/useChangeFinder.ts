import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface ChangeFinder {
  /** Marked items on the page now. */
  total: number;
  /** Marked items the person hasn't had on screen yet. */
  unseen: number;
  hasAbove: boolean;
  hasBelow: boolean;
  goAbove: () => void;
  goBelow: () => void;
  /** Scrolls to the first marked item the next time the marks change, such as after a new round of changes lands. */
  goFirstOnNextChange: () => void;
}

const SEEN_SHARE = 0.6;

const getKey = (element: HTMLElement) =>
  element.dataset.changeKey ??
  (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

const getFooterHeight = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('.form-footer')?.offsetHeight ?? 0;

const scrollToElement = (element: HTMLElement) => {
  const isReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  element.scrollIntoView({
    block: 'center',
    behavior: isReduced ? 'auto' : 'smooth',
  });
};

/** Finds the items marked with `selector` inside `rootRef`, remembers which have been on screen (above a pinned `.form-footer`) and jumps to the previous or next one not yet seen, or to any once all are seen; an item that loses its mark drops out of the count. */
export function useChangeFinder(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
): ChangeFinder {
  const [keys, setKeys] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [edges, setEdges] = useState({ hasAbove: false, hasBelow: false });
  const seenRef = useRef<Set<string>>(seen);
  const isJumpPending = useRef(false);

  const getElements = useCallback(
    () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
      ).filter((element) => !element.closest('.form-footer')),
    [rootRef, selector],
  );

  const getTargets = useCallback(
    (direction: 'above' | 'below') => {
      const root = rootRef.current;
      if (root === null) return [];
      const middle = (window.innerHeight - getFooterHeight(root)) / 2;
      const elements = getElements();
      const unseen = elements.filter(
        (element) => !seenRef.current.has(getKey(element)),
      );
      const pool = unseen.length > 0 ? unseen : elements;
      return pool.filter((element) => {
        const { top, bottom } = element.getBoundingClientRect();
        const center = (top + bottom) / 2;
        return direction === 'above'
          ? center < middle - 8
          : center > middle + 8;
      });
    },
    [rootRef, getElements],
  );

  const measure = useCallback(() => {
    const hasAbove = getTargets('above').length > 0;
    const hasBelow = getTargets('below').length > 0;
    setEdges((current) =>
      current.hasAbove === hasAbove && current.hasBelow === hasBelow
        ? current
        : { hasAbove, hasBelow },
    );
  }, [getTargets]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const read = () => {
      const elements = getElements();
      const next = elements.map(getKey);
      setKeys((current) =>
        current.length === next.length &&
        current.every((key, index) => key === next[index])
          ? current
          : next,
      );
      measure();
      if (isJumpPending.current && elements.length > 0) {
        isJumpPending.current = false;
        scrollToElement(elements[0]);
      }
    };
    const frame = requestAnimationFrame(read);
    const observer = new MutationObserver(read);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [rootRef, getElements, measure]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || keys.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              (entry.intersectionRatio >= SEEN_SHARE ||
                entry.intersectionRect.height >=
                  (entry.rootBounds?.height ?? Infinity) * SEEN_SHARE),
          )
          .map((entry) => getKey(entry.target as HTMLElement));
        if (shown.every((key) => seenRef.current.has(key))) return;
        const next = new Set([...seenRef.current, ...shown]);
        seenRef.current = next;
        setSeen(next);
        measure();
      },
      {
        rootMargin: `0px 0px -${getFooterHeight(root)}px 0px`,
        threshold: [0, SEEN_SHARE, 1],
      },
    );
    getElements().forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rootRef, keys, getElements, measure]);

  useEffect(() => {
    if (keys.length === 0) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [keys.length, measure]);

  return {
    total: keys.length,
    unseen: keys.filter((key) => !seen.has(key)).length,
    hasAbove: edges.hasAbove,
    hasBelow: edges.hasBelow,
    goAbove: () => {
      const target = getTargets('above').at(-1);
      if (target) scrollToElement(target);
    },
    goBelow: () => {
      const target = getTargets('below')[0];
      if (target) scrollToElement(target);
    },
    goFirstOnNextChange: () => {
      isJumpPending.current = true;
    },
  };
}
