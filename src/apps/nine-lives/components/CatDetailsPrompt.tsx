import { Modal } from '@moondreamsdev/dreamer-ui/components';

interface CatDetailsPromptProps {
  isOpen: boolean;
  catName: string;
  onAddDetails: () => void;
  onDismiss: () => void;
}

function CatDetailsPrompt({ isOpen, catName, onAddDetails, onDismiss }: CatDetailsPromptProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title={`${catName} added!`}
      actions={[
        { label: 'Not now', variant: 'secondary', onClick: onDismiss },
        { label: 'Add details', onClick: onAddDetails },
      ]}
    >
      <p className='text-sm text-muted-foreground'>
        Want to add more details for {catName} now, like lifestyle, insurance, or a vet clinic?
        You can always do this later.
      </p>
    </Modal>
  );
}

export default CatDetailsPrompt;
