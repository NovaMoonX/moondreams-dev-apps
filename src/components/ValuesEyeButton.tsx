import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Eye, EyeOff } from 'lucide-react';

import { useValuesHidden } from '@/hooks/useValuesHidden';

const SURFACE = '[role="dialog"], .subview-card, .page';

/** The header's eye: shows or hides every private figure under the same provider, and is drawn only while the surface it sits in holds one (a `SensitiveValue`). 28px round with a 40px hit area, like the other header icons. */
function ValuesEyeButton() {
  const { isHidden, toggle } = useValuesHidden();
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [hasValues, setHasValues] = useState(false);
  const label = 'Show amounts';
  const Icon = isHidden ? Eye : EyeOff;

  useEffect(() => {
    const surface = anchor.current?.closest(SURFACE);
    if (!surface) return;
    const check = () =>
      setHasValues(surface.querySelector('[data-sensitive]') !== null);
    const frame = requestAnimationFrame(check);
    let pending = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(check);
    });
    observer.observe(surface, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
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
          <Icon className='size-4' aria-hidden='true' />
        </Button>
      )}
    </span>
  );
}

export default ValuesEyeButton;
