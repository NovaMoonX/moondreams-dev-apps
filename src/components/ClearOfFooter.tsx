import { useEffect, useRef, type ReactNode } from 'react';

interface ClearOfFooterProps {
  children: ReactNode;
  onBlurCapture?: () => void;
}

/** Keeps a focused field above the pinned footer, again when the keyboard resizes the screen after focus. */
export default function ClearOfFooter({
  children,
  onBlurCapture,
}: ClearOfFooterProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keepClear = () => {
      if (ref.current?.contains(document.activeElement))
        ref.current.scrollIntoView({ block: 'nearest' });
    };
    const viewport = window.visualViewport;
    window.addEventListener('resize', keepClear);
    viewport?.addEventListener('resize', keepClear);
    return () => {
      window.removeEventListener('resize', keepClear);
      viewport?.removeEventListener('resize', keepClear);
    };
  }, []);

  return (
    <div
      ref={ref}
      className='scroll-mb-32'
      onFocusCapture={(event) =>
        event.currentTarget.scrollIntoView({ block: 'nearest' })
      }
      onBlurCapture={onBlurCapture}
    >
      {children}
    </div>
  );
}
