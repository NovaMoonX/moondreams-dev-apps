import { useState } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pencil } from 'lucide-react';

import { getErrorMessage } from '@/utils/errorUtils';

interface NotesFieldProps {
  notes: string | null;
  canEdit: boolean;
  onSave: (notes: string) => Promise<void>;
  variant: 'link' | 'subtle';
  placeholder: string;
}

export function NotesField({ notes, canEdit, onSave, variant, placeholder }: NotesFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = draft !== null;
  const isLarge = variant === 'link';

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
            rows={isLarge ? 3 : 2}
            autoFocus
            value={draft}
            variant={isLarge ? 'outline' : 'left-line'}
            className={isLarge ? undefined : 'text-xs!'}
            placeholder={placeholder}
            onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          />
          <div className={join('gap-2', isLarge ? 'grid grid-cols-2' : 'flex justify-end')}>
            <Button
              type='button'
              size={isLarge ? 'md' : 'sm'}
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
              size={isLarge ? 'md' : 'sm'}
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
              variant='secondary'
              className='h-11 w-full justify-start gap-3 px-4'
              onClick={() => setDraft(notes ?? '')}
            >
              <Pencil className='text-muted-foreground h-4 w-4' aria-hidden='true' />
              {notes ? 'Edit note' : 'Add a note'}
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

export default NotesField;
