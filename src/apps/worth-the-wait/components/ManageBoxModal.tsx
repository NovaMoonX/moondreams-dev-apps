import {
  Button,
  Input,
  Modal,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';
import { BOX_DESCRIPTION_MAX_LENGTH } from '../utils/boxHelpers';

export type BoxDraft = {
  name: string;
  emoji: string;
  description: string;
};

interface ManageBoxModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  initialValues?: Partial<BoxDraft>;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onCreate: (draft: BoxDraft) => Promise<unknown> | unknown;
}

function ManageBoxModal({
  isOpen,
  isSubmitting = false,
  initialValues,
  title = 'Create a new box',
  submitLabel = 'Create box',
  onClose,
  onCreate,
}: ManageBoxModalProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [emoji, setEmoji] = useState(initialValues?.emoji ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );

  const handleSubmit = async () => {
    const sanitizedDraft: BoxDraft = {
      name: name.trim(),
      emoji: emoji.trim() || '',
      description: description.trim(),
    };

    if (!sanitizedDraft.name || sanitizedDraft.description.length > BOX_DESCRIPTION_MAX_LENGTH) {
      return;
    }

    await onCreate(sanitizedDraft);
    setName('');
    setEmoji('✨');
    setDescription('');
    onClose();
  };

  const descriptionRemaining = BOX_DESCRIPTION_MAX_LENGTH - description.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className='space-y-4'>
        <div className='grid grid-cols-[50px_1fr] items-center gap-3'>
          <Input
            value={emoji}
            onChange={(event) => setEmoji(event.target.value.slice(0, 2))}
            aria-label='Box emoji'
            name='box-emoji'
            maxLength={2}
            className='text-center'
            autoComplete='off'
            placeholder='✨'
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='Box name'
            aria-label='Box name'
            name='box-name'
            maxLength={32}
            autoComplete='off'
          />
        </div>

        <div>
          <Textarea
            value={description}
            onChange={(event) =>
              setDescription(event.target.value.slice(0, BOX_DESCRIPTION_MAX_LENGTH))
            }
            placeholder='Short description'
            aria-label='Box description'
            name='box-description'
            maxLength={BOX_DESCRIPTION_MAX_LENGTH}
            autoComplete='off'
          />
          <div className='text-muted-foreground mt-2 text-right text-xs'>
            {descriptionRemaining} characters left
          </div>
        </div>

        <Button
          type='button'
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || !name.trim() || description.length > BOX_DESCRIPTION_MAX_LENGTH}
          className='w-full'
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ManageBoxModal;
