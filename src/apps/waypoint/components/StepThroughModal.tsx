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

  return (
    <Modal isOpen={isOpen && current !== undefined} onClose={onClose} title={title}>
      {current && (
        <div className='space-y-4'>
          {items.length > 1 && (
            <div className='flex items-center justify-between'>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Previous'
                disabled={currentIndex === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <p className='text-muted-foreground text-xs'>
                {currentIndex + 1} of {items.length}
              </p>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Next'
                disabled={currentIndex === items.length - 1}
                onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          )}
          <div key={getKey(current)}>{renderItem(current)}</div>
          <div className='flex items-center justify-between gap-2'>
            {items.length > 1 ? (
              <Button type='button' variant='link' size='sm' onClick={onDismissAll}>
                Dismiss all
              </Button>
            ) : (
              <span />
            )}
            <Button type='button' variant='secondary' onClick={() => onDismissItem(current)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default StepThroughModal;
