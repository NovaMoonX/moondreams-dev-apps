import FormSheet from '@/components/FormSheet';
import NoteForm from '@apps/pinch/components/notes/NoteForm';

interface NoteSheetProps {
  uid: string;
  recipeId: string;
  noteId: string | null;
  initialCookId: string | null;
  onClose: () => void;
  onUpdateRecipe: (noteId: string) => void;
}

function NoteSheet({
  uid,
  recipeId,
  noteId,
  initialCookId,
  onClose,
  onUpdateRecipe,
}: NoteSheetProps) {
  return (
    <FormSheet isOpen onClose={onClose} title='Note'>
      <NoteForm
        key={noteId ?? 'new'}
        uid={uid}
        recipeId={recipeId}
        noteId={noteId}
        initialCookId={initialCookId}
        onCancel={onClose}
        onDone={onClose}
        onUpdateRecipe={onUpdateRecipe}
      />
    </FormSheet>
  );
}

export default NoteSheet;
