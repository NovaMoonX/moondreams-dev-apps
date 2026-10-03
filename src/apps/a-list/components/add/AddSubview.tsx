import { useEffect } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import { AddFlow } from '@apps/a-list/components/add/AddFlow';
import type { AListOverlay } from '@apps/a-list/types';

interface AddSubviewProps {
  overlay: Extract<AListOverlay, { kind: 'add' }>;
  onClose: () => void;
}

/** A screen of its own: it brings its own way back, so it never needs the app's navigation. */
function AddSubview({ overlay, onClose }: AddSubviewProps) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const isPast = overlay.destination === 'calendar' && overlay.mode === 'past';
  const title = isPast ? 'Movies you have seen' : 'Find a movie';

  return (
    <div className='page'>
      <div className='mx-auto max-w-2xl space-y-4 py-6'>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            aria-label='Back'
            onClick={onClose}
          >
            <ChevronLeft className='h-5 w-5' />
          </Button>
          <h1 className='text-xl font-semibold'>{title}</h1>
        </div>
        <AddFlow overlay={overlay} onClose={onClose} />
      </div>
    </div>
  );
}

export default AddSubview;
