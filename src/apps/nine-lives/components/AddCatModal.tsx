import { Modal } from '@moondreamsdev/dreamer-ui/components';

import CatQuickAddForm, { type CatQuickAddValues } from './CatQuickAddForm';

interface AddCatModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: CatQuickAddValues) => Promise<void> | void;
  onClose: () => void;
}

function AddCatModal({ isOpen, isSubmitting, onSubmit, onClose }: AddCatModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Add a cat'>
      <p className='mb-4 text-sm text-muted-foreground'>
        Just the basics for now — you can fill in the rest later.
      </p>
      <CatQuickAddForm isSubmitting={isSubmitting} onSubmit={onSubmit} onCancel={onClose} />
    </Modal>
  );
}

export default AddCatModal;
