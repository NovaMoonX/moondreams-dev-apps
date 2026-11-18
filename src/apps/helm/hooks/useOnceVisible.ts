import { useEffect, useRef, type RefObject } from 'react';

/** Calls `onVisible` once, when at least half of the element is on screen. When it throws or rejects, it is tried again the next time the element comes into view. */
export function useOnceVisible(
  ref: RefObject<Element | null>,
  isEnabled: boolean,
  onVisible: () => void | Promise<void>,
) {
  const latest = useRef(onVisible);
  useEffect(() => {
    latest.current = onVisible;
  });

  useEffect(() => {
    const element = ref.current;
    if (!isEnabled || !element) return;
    const run = { isBusy: false, isDone: false, mustLeaveFirst: false };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry.isIntersecting) {
          run.mustLeaveFirst = false;
          return;
        }
        if (run.isBusy || run.isDone || run.mustLeaveFirst) return;
        run.isBusy = true;
        Promise.resolve()
          .then(() => latest.current())
          .then(
            () => {
              run.isDone = true;
              observer.disconnect();
            },
            () => {
              run.mustLeaveFirst = true;
            },
          )
          .finally(() => {
            run.isBusy = false;
          });
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isEnabled]);
}
