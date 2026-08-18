import {
  Button,
  Input,
  Modal,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

export type BoxDraft = {
  name: string;
  emoji: string;
  description: string;
};

interface CreateBoxModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onCreate: (draft: BoxDraft) => Promise<unknown> | unknown;
}

function CreateBoxModal({
  isOpen,
  isSubmitting = false,
  onClose,
  onCreate,
}: CreateBoxModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    const sanitizedDraft: BoxDraft = {
      name: name.trim(),
      emoji: emoji.trim() || '✨',
      description: description.trim(),
    };

    if (!sanitizedDraft.name || sanitizedDraft.description.length > 50) {
      return;
    }

    await onCreate(sanitizedDraft);
    setName('');
    setEmoji('✨');
    setDescription('');
    onClose();
  };

  const descriptionRemaining = 50 - description.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Create a new box'>
      <div className='space-y-4'>
        <div className='grid grid-cols-[72px_1fr] items-center gap-3'>
          <Input
            value={emoji}
            onChange={(event) => setEmoji(event.target.value.slice(0, 2))}
            aria-label='Box emoji'
            name='box-emoji'
            maxLength={2}
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='Box name'
            aria-label='Box name'
            name='box-name'
            maxLength={32}
          />
        </div>

        <div>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 50))}
            placeholder='Short description'
            aria-label='Box description'
            name='box-description'
            maxLength={50}
          />
          <div className='text-muted-foreground mt-2 text-right text-xs'>
            {descriptionRemaining} characters left
          </div>
        </div>

        <Button
          type='button'
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || !name.trim() || description.length > 50}
          className='w-full'
        >
          {isSubmitting ? 'Creating...' : 'Create box'}
        </Button>
      </div>
    </Modal>
  );
}

export default CreateBoxModal;
