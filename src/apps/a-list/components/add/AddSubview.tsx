import { AddFlow } from '@apps/a-list/components/add/AddFlow';
import Subview from '@/components/Subview';
import type { AListOverlay } from '@apps/a-list/types';

interface AddSubviewProps {
  overlay: Extract<AListOverlay, { kind: 'add' }>;
  onClose: () => void;
}

function AddSubview({ overlay, onClose }: AddSubviewProps) {
  const isPast = overlay.destination === 'calendar' && overlay.mode === 'past';
  const isQuick = overlay.destination === 'watchlist' && overlay.mode === 'quick';
  const getTitle = () => {
    if (isPast) return 'Movies you have seen';
    if (isQuick) return 'Trailer picks';
    return 'Find a movie';
  };
  const title = getTitle();

  return (
    <Subview onClose={onClose}>
      <AddFlow overlay={overlay} onClose={onClose} title={title} />
    </Subview>
  );
}

export default AddSubview;
