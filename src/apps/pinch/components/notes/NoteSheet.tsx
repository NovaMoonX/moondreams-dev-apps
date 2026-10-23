import FormSheet from '@/components/FormSheet';
import NoteForm from '@apps/pinch/components/notes/NoteForm';
import type { WrittenNoteKind } from '@apps/pinch/components/notes/NoteKindPills';

interface NoteSheetProps {
  uid: string;
  recipeId: string;
  noteId: string | null;
  initialCookId: string | null;
  initialKind?: WrittenNoteKind | null;
  initialStepIndex?: number | null;
  onClose: () => void;
}

function NoteSheet({
  uid,
  recipeId,
  noteId,
  initialCookId,
  initialKind = null,
  initialStepIndex = null,
  onClose,
}: NoteSheetProps) {
  return (
    <FormSheet isOpen onClose={onClose} title='Note'>
      <NoteForm
        key={noteId ?? 'new'}
        uid={uid}
        recipeId={recipeId}
        noteId={noteId}
        initialCookId={initialCookId}
        initialKind={initialKind}
        initialStepIndex={initialStepIndex}
        onCancel={onClose}
        onDone={onClose}
      />
    </FormSheet>
  );
}

export default NoteSheet;
