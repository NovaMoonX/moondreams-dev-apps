import { useCallback, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface ClampedTextProps {
  text: string;
}

function ClampedText({ text }: ClampedTextProps) {
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
          'text-sm wrap-break-word whitespace-pre-wrap',
          !isOpen && 'line-clamp-4',
        )}
      >
        {text}
      </p>
      {(isClamped || isOpen) && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Less' : 'More'}
        </Button>
      )}
    </div>
  );
}

export default ClampedText;
