import { useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Eye, EyeOff, Shuffle } from 'lucide-react';

import { useValuesHidden } from '@/hooks/useValuesHidden';

const SURFACE = '[role="dialog"], .subview-card, .page';

/** The header's eye: shows or hides every private figure under the same provider (while amounts are made up it flips between made-up and masked, never the real ones), and is drawn only while the surface it sits in holds one (a `SensitiveValue`). 28px round with a 40px hit area, like the other header icons. */
function ValuesEyeButton() {
  const { isHidden, isScrambled, toggle } = useValuesHidden();
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [hasValues, setHasValues] = useState(false);
  const getLabel = () => {
    if (!isScrambled) return 'Show amounts';
    return isHidden ? 'Show made-up amounts' : 'Hide made-up amounts';
  };
  const label = getLabel();
  const getIcon = () => {
    if (isScrambled && !isHidden)
      return <Shuffle className='size-4' aria-hidden='true' />;
    if (isHidden) return <Eye className='size-4' aria-hidden='true' />;
    return <EyeOff className='size-4' aria-hidden='true' />;
  };

  useLayoutEffect(() => {
    const surface = anchor.current?.closest(SURFACE);
    if (!surface) return;
    const check = () =>
      setHasValues(surface.querySelector('[data-sensitive]') !== null);
    check();
    let pending = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(check);
    });
    observer.observe(surface, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
    };
  }, []);

  return (
    <span ref={anchor} className='contents'>
      {hasValues && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className="relative size-7 p-0 after:absolute after:-inset-1.5 after:content-['']"
          aria-label={label}
          aria-pressed={!isHidden}
          title={label}
          onClick={toggle}
        >
          {getIcon()}
        </Button>
      )}
    </span>
  );
}

export default ValuesEyeButton;
