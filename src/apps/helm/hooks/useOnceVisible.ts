import { useEffect, useRef, type RefObject } from 'react';

/** Calls `onVisible` once, when at least half of the element is on screen. */
export function useOnceVisible(
  ref: RefObject<Element | null>,
  isEnabled: boolean,
  onVisible: () => void,
) {
  const latest = useRef(onVisible);
  useEffect(() => {
    latest.current = onVisible;
  });

  useEffect(() => {
    const element = ref.current;
    if (!isEnabled || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        latest.current();
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isEnabled]);
}
