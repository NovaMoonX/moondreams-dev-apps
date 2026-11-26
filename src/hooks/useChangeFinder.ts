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
  /** Arms a jump to the first of `changedKeys` (or any newly marked item) once the next round of marks appears, and makes those count as unseen again. */
  goFirstOnNextChange: (changedKeys?: string[]) => void;
}

const SEEN_SHARE = 0.6;
const JUMP_WAIT_MS = 1500;

const getKey = (element: HTMLElement) =>
  element.dataset.changeKey ??
  (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

const getFooter = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('.form-footer');

const getFooterHeight = (root: HTMLElement) =>
  getFooter(root)?.offsetHeight ?? 0;

const scrollToElement = (element: HTMLElement, footerHeight: number) => {
  const isReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  // A bottom scroll margin the footer's height centres the item in the part of the screen the footer leaves.
  element.style.scrollMarginBottom = `${footerHeight}px`;
  element.scrollIntoView({
    block: 'center',
    behavior: isReduced ? 'auto' : 'smooth',
  });
};

/** Finds the items marked with `selector` inside `rootRef`, counts those not yet on screen above a pinned `.form-footer`, and jumps to the next one off screen. */
export function useChangeFinder(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
): ChangeFinder {
  const [keys, setKeys] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [edges, setEdges] = useState({ hasAbove: false, hasBelow: false });
  const [footerHeight, setFooterHeight] = useState(0);
  const seenRef = useRef<Set<string>>(seen);
  const pendingJump = useRef<{
    before: Set<string>;
    changed: Set<string>;
    until: number;
  } | null>(null);
  const observedFooter = useRef<HTMLElement | null>(null);

  const getElements = useCallback(
    () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
      ).filter((element) => !element.closest('.form-footer')),
    [rootRef, selector],
  );

  const splitTargets = useCallback(() => {
    const root = rootRef.current;
    if (root === null) return { above: [], below: [] };
    const visibleBottom = window.innerHeight - getFooterHeight(root);
    const middle = visibleBottom / 2;
    const elements = getElements();
    const unseen = elements.filter(
      (element) => !seenRef.current.has(getKey(element)),
    );
    const pool = unseen.length > 0 ? unseen : elements;
    const offScreen = pool
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.top < 0 || rect.bottom > visibleBottom);
    return {
      above: offScreen
        .filter(({ rect }) => rect.bottom <= middle)
        .map(({ element }) => element),
      below: offScreen
        .filter(({ rect }) => rect.top >= middle)
        .map(({ element }) => element),
    };
  }, [rootRef, getElements]);

  const measure = useCallback(() => {
    const { above, below } = splitTargets();
    const hasAbove = above.length > 0;
    const hasBelow = below.length > 0;
    setEdges((current) =>
      current.hasAbove === hasAbove && current.hasBelow === hasBelow
        ? current
        : { hasAbove, hasBelow },
    );
  }, [splitTargets]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const frame = { id: 0 };
    const resize = new ResizeObserver(() => schedule());
    const watchFooter = () => {
      const footer = getFooter(root);
      if (footer === observedFooter.current) return;
      if (observedFooter.current !== null) {
        resize.unobserve(observedFooter.current);
      }
      observedFooter.current = footer;
      if (footer !== null) resize.observe(footer);
    };
    const read = () => {
      const elements = getElements();
      const next = elements.map(getKey);
      setKeys((current) =>
        current.length === next.length &&
        current.every((key, index) => key === next[index])
          ? current
          : next,
      );
      watchFooter();
      setFooterHeight(getFooterHeight(root));
      measure();
      const jump = pendingJump.current;
      if (jump === null) return;
      if (Date.now() > jump.until) {
        pendingJump.current = null;
        return;
      }
      const fresh = elements.filter((element) => {
        const key = getKey(element);
        return jump.changed.has(key) || !jump.before.has(key);
      });
      if (fresh.length === 0) return;
      pendingJump.current = null;
      const freshKeys = new Set(fresh.map(getKey));
      const kept = new Set(
        [...seenRef.current].filter((key) => !freshKeys.has(key)),
      );
      seenRef.current = kept;
      setSeen(kept);
      scrollToElement(fresh[0], getFooterHeight(root));
    };
    const schedule = () => {
      cancelAnimationFrame(frame.id);
      frame.id = requestAnimationFrame(read);
    };
    watchFooter();
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      cancelAnimationFrame(frame.id);
      observer.disconnect();
      resize.disconnect();
      observedFooter.current = null;
    };
  }, [rootRef, getElements, measure]);

  useEffect(() => {
    if (keys.length === 0) return;
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
        rootMargin: `0px 0px -${footerHeight}px 0px`,
        threshold: [0, SEEN_SHARE, 1],
      },
    );
    getElements().forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [keys, footerHeight, getElements, measure]);

  useEffect(() => {
    if (keys.length === 0) return;
    const frame = { id: 0 };
    const onScroll = () => {
      cancelAnimationFrame(frame.id);
      frame.id = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame.id);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [keys.length, measure]);

  const go = (direction: 'above' | 'below') => {
    const root = rootRef.current;
    if (root === null) return;
    const targets = splitTargets()[direction];
    const target = direction === 'above' ? targets.at(-1) : targets[0];
    if (target) scrollToElement(target, getFooterHeight(root));
  };

  return {
    total: keys.length,
    unseen: keys.filter((key) => !seen.has(key)).length,
    hasAbove: edges.hasAbove,
    hasBelow: edges.hasBelow,
    goAbove: () => go('above'),
    goBelow: () => go('below'),
    goFirstOnNextChange: (changedKeys = []) => {
      pendingJump.current = {
        before: new Set(getElements().map(getKey)),
        changed: new Set(changedKeys),
        until: Date.now() + JUMP_WAIT_MS,
      };
    },
  };
}
