import { useEffect } from 'react';

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
        <AddFlow overlay={overlay} onClose={onClose} title={title} />
      </div>
    </div>
  );
}

export default AddSubview;
