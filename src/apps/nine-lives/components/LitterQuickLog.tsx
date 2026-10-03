import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';

import { selectLitterBoxesByHousehold } from '../store/selectors';
import LitterEntryModal from './LitterEntryFormModal';

interface LitterQuickLogProps {
  householdId: string;
  isOpen: boolean;
  onClose: () => void;
}

function LitterQuickLog({ householdId, isOpen, onClose }: LitterQuickLogProps) {
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const [pickedBoxId, setPickedBoxId] = useState<string | null>(null);

  const activeBoxes = litterBoxes.filter((box) => box.isActive);
  const targetBox =
    activeBoxes.length === 1 ? activeBoxes[0] : (activeBoxes.find((box) => box.id === pickedBoxId) ?? null);

  const handleClose = () => {
    setPickedBoxId(null);
    onClose();
  };

  return (
    <>
      <Modal isOpen={isOpen && !targetBox} onClose={handleClose} title='Which litter box?'>
        {activeBoxes.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Add a litter box first, then you can log weigh-ins here.</p>
        ) : (
          <div className='divide-border divide-y'>
            {activeBoxes.map((box) => (
              <Button
                key={box.id}
                type='button'
                variant='tertiary'
                className='h-auto w-full justify-start rounded-none px-1 py-3 text-left'
                onClick={() => setPickedBoxId(box.id)}
              >
                <span className='min-w-0'>
                  <span className='block font-medium'>{box.name}</span>
                  {box.location && <span className='text-muted-foreground block text-sm font-normal'>{box.location}</span>}
                </span>
              </Button>
            ))}
          </div>
        )}
      </Modal>
      {targetBox && (
        <LitterEntryModal
          householdId={householdId}
          box={targetBox}
          editingEntry={null}
          isOpen={isOpen}
          onClose={handleClose}
        />
      )}
    </>
  );
}

export default LitterQuickLog;
