import { useCallback, useRef, useState } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import ShowMoreButton from '@/components/ShowMoreButton';

const CLAMP_CLASSES = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  4: 'line-clamp-4',
  8: 'line-clamp-8',
};

interface ClampedTextProps {
  text: string;
  /** How many lines show before "Show more". */
  maxLines?: 1 | 2 | 4 | 8;
  /** Body-size text, for a message read on its own rather than a note beside other content. */
  isBodySize?: boolean;
}

function ClampedText({
  text,
  maxLines = 4,
  isBodySize = false,
}: ClampedTextProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback((element: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setIsClamped(element.scrollHeight > element.clientHeight + 1),
    );
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  return (
    <div>
      <p
        ref={measure}
        className={join(
          'wrap-break-word whitespace-pre-wrap',
          !isBodySize && 'text-sm',
          !isOpen && CLAMP_CLASSES[maxLines],
        )}
      >
        {text}
      </p>
      {(isClamped || isOpen) && (
        <ShowMoreButton
          isOpen={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Show less' : 'Show more'}
        </ShowMoreButton>
      )}
    </div>
  );
}

export default ClampedText;
