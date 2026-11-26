import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useLayoutEffect, useRef } from 'react';

interface LatestWordsLineProps {
  text: string;
  className?: string;
}

/** One line of words that keeps its newest end in view: short text sits at the start, and once it outgrows the line the oldest words slide off the left under a fade, as a ticker does while someone speaks. */
export default function LatestWordsLine({
  text,
  className,
}: LatestWordsLineProps) {
  const lineRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (line === null) return;
    line.scrollLeft = line.scrollWidth;
    line.toggleAttribute(
      'data-overflowing',
      line.scrollWidth > line.clientWidth + 1,
    );
  }, [text]);

  return (
    <p
      ref={lineRef}
      className={join(
        'min-w-0 flex-1 overflow-hidden whitespace-nowrap',
        'data-[overflowing]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]',
        className,
      )}
    >
      {text}
    </p>
  );
}
