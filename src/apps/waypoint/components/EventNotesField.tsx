import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { Pencil } from 'lucide-react';

import { getErrorMessage } from '@/utils/errorUtils';

interface EventNotesFieldProps {
  notes: string | null;
  canEdit: boolean;
  onSave: (notes: string) => Promise<void>;
  variant: 'link' | 'subtle';
}

export function EventNotesField({ notes, canEdit, onSave, variant }: EventNotesFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = draft !== null;

  const handleSave = async () => {
    if (draft === null) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setDraft(null);
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this note.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing && !notes && !canEdit) {
    return null;
  }

  return (
    <div className='space-y-2' onClick={(clickEvent) => clickEvent.stopPropagation()}>
      {isEditing ? (
        <>
          <Textarea
            rows={3}
            autoFocus
            value={draft}
            variant='outline'
            placeholder='Reservation name, what to bring, where to meet…'
            onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          />
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={isSaving}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type='button'
              size='sm'
              loading={isSaving}
              disabled={isSaving || draft.trim() === (notes ?? '')}
              onClick={() => void handleSave()}
            >
              Save note
            </Button>
          </div>
          {error && <p className='text-destructive text-sm'>{error}</p>}
        </>
      ) : (
        <>
          {notes && (
            <p className='border-border text-muted-foreground border-l-2 pl-3 text-xs whitespace-pre-line'>
              {notes}
            </p>
          )}
          {canEdit && variant === 'link' && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto min-h-0 p-0!'
              onClick={() => setDraft(notes ?? '')}
            >
              {notes ? 'Edit note' : '+ Add note'}
            </Button>
          )}
          {canEdit && variant === 'subtle' && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='text-muted-foreground! hover:text-foreground! -ml-2 h-7 gap-1.5 px-2 text-xs'
              onClick={() => setDraft(notes ?? '')}
            >
              <Pencil className='h-3.5 w-3.5' aria-hidden='true' />
              {notes ? 'Edit note' : 'Add note'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default EventNotesField;
