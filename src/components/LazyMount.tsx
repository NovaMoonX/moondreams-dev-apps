import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazyMountProps {
  children: ReactNode;
  /** Height reserved until the content mounts, so the scrollbar and the rows below stay put. */
  estimatedHeight: number;
  /** Mount at once, for the first screenful. Read once: content that has mounted stays, even if the list reorders. */
  eager?: boolean;
  /** How far outside the viewport the content mounts, so it is ready before it scrolls in. */
  rootMargin?: string;
}

/** Mounts a long section's children only when it nears the viewport, then keeps them: a list of 100+ cards never builds them all at once. */
function LazyMount({ children, estimatedHeight, eager = false, rootMargin = '800px 0px' }: LazyMountProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [hasMounted, setHasMounted] = useState(eager);
  const isMounted = eager || hasMounted;

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (isMounted || !placeholder) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setHasMounted(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [isMounted, rootMargin]);

  if (isMounted) {
    return <>{children}</>;
  }

  return <div ref={placeholderRef} aria-hidden='true' style={{ minHeight: estimatedHeight }} />;
}

export default LazyMount;
