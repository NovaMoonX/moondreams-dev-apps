import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { FileUp } from 'lucide-react';

import BookingImportModal from '@apps/waypoint/components/BookingImportModal';
import type { BookingKind } from '@apps/waypoint/lib/extractBookingFromFile';
import type { TripSpace } from '@apps/waypoint/types';

interface ImportBookingButtonProps {
  trip: TripSpace;
  currentUserId: string;
  kind: BookingKind;
}

/** Opens the "read a booking from a photo or PDF" flow for one kind of entry. */
function ImportBookingButton({ trip, currentUserId, kind }: ImportBookingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type='button'
        variant='secondary'
        rounded='full'
        className='gap-1.5'
        aria-label='Upload a booking'
        onClick={() => setIsOpen(true)}
      >
        <FileUp className='h-4 w-4' />
        <span className='max-sm:sr-only'>Upload booking</span>
      </Button>
      <BookingImportModal
        key={isOpen ? 'open' : 'closed'}
        isOpen={isOpen}
        trip={trip}
        currentUserId={currentUserId}
        kind={kind}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default ImportBookingButton;
