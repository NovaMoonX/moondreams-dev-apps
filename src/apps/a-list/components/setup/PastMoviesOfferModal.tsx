import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import ModalFooterActions from '@/components/ModalFooterActions';

interface PastMoviesOfferModalProps {
  onSkip: () => void;
  onAccept: () => void;
}

function PastMoviesOfferModal({ onSkip, onAccept }: PastMoviesOfferModalProps) {
  return (
    <Modal isOpen onClose={onSkip} title="You're in!">
      <div className='space-y-6'>
        <div className='space-y-3 text-center'>
          <div className='alist-marquee mx-auto h-3 w-40' aria-hidden='true' />
          <p className='text-7xl' aria-hidden='true'>
            🎞️
          </p>
          <h3 className='text-xl font-semibold'>
            Seen any movies since you joined?
          </h3>
          <p className='text-muted-foreground mx-auto max-w-xs text-sm'>
            Add what you've already watched and your savings start out
            accurate instead of at zero.
          </p>
        </div>
        <ModalFooterActions
          rightActions={
            <>
              <Button
                type='button'
                variant='secondary'
                rounded='full'
                onClick={onSkip}
              >
                Not now
              </Button>
              <Button type='button' rounded='full' onClick={onAccept}>
                Add past movies
              </Button>
            </>
          }
        />
      </div>
    </Modal>
  );
}

export default PastMoviesOfferModal;
