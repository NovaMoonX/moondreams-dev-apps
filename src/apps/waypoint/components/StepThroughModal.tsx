import { useState, type ReactNode } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StepThroughModalProps<T> {
  isOpen: boolean;
  title: string;
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onDismissItem: (item: T) => void;
  onDismissAll: () => void;
  onClose: () => void;
}

function StepThroughModal<T>({
  isOpen,
  title,
  items,
  getKey,
  renderItem,
  onDismissItem,
  onDismissAll,
  onClose,
}: StepThroughModalProps<T>) {
  const [index, setIndex] = useState(0);
  const currentIndex = Math.min(index, Math.max(items.length - 1, 0));
  const current = items[currentIndex];
  const isLast = currentIndex === items.length - 1;

  const handleNext = () => {
    onDismissItem(current);
    setIndex((value) => Math.min(items.length - 1, value + 1));
  };

  return (
    <Modal isOpen={isOpen && current !== undefined} onClose={onClose} title={title} hideCloseButton>
      {current && (
        <div className='space-y-4'>
          {items.length > 1 && (
            <p className='text-muted-foreground text-center text-xs'>
              {currentIndex + 1} of {items.length}
            </p>
          )}
          <div key={getKey(current)}>{renderItem(current)}</div>
          <div className='flex items-center justify-between gap-2'>
            <Button
              type='button'
              variant='tertiary'
              disabled={currentIndex === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className='h-4 w-4' /> Previous
            </Button>
            {isLast ? (
              <Button type='button' onClick={onDismissAll}>
                Dismiss all
              </Button>
            ) : (
              <Button type='button' variant='secondary' onClick={handleNext}>
                Next <ChevronRight className='h-4 w-4' />
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default StepThroughModal;
