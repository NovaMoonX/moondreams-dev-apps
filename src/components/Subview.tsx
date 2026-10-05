import { useEffect, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft } from 'lucide-react';

import { SubviewTitleContext } from '@/contexts/SubviewTitleContext';
import { useSubviewHistory } from '@/hooks/useSubviewHistory';

interface SubviewHeaderProps {
  title: string;
  onBack: () => void;
}

/** The round back button and large title that open every subview; the larger type sets it apart from section subheaders. */
export function SubviewHeader({ title, onBack }: SubviewHeaderProps) {
  return (
    <div className='mb-3 flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={title}
        onClick={onBack}
      >
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <h1 className='min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight'>
        {title}
      </h1>
    </div>
  );
}

interface SubviewProps {
  children: ReactNode;
  /** Leaves the subview; also what the browser's back gesture calls. */
  onClose: () => void;
  /** Omit when the content draws its own `SubviewHeader` because its back step changes. */
  title?: string;
  className?: string;
}

/**
 * A nested page that takes over a mini-app: it opens at the top, brings its own way back, and
 * closes on the browser's back gesture rather than leaving the page beneath it.
 */
function Subview({ children, onClose, title, className }: SubviewProps) {
  useSubviewHistory(onClose);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className='page'>
      <div className={join('mx-auto max-w-2xl py-6', className)}>
        {title !== undefined && (
          <SubviewHeader title={title} onBack={onClose} />
        )}
        <SubviewTitleContext.Provider value={title ?? null}>
          {children}
        </SubviewTitleContext.Provider>
      </div>
    </div>
  );
}

export default Subview;
