import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { PenLine } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatDateTime } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import { MAX_RECIPE_NOTE_LENGTH } from '@apps/pinch/constants';
import {
  addNote,
  removeNote,
  updateNote,
} from '@apps/pinch/store/actions/noteActions';
import {
  selectCooksById,
  selectCooksByRecipe,
  selectNotesById,
  selectNotesByRecipe,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Cook } from '@apps/pinch/types';
import {
  getCookChoiceLabels,
  getNoteCookChoices,
  isNoteHistoryFull,
  isValidNoteText,
} from '@apps/pinch/utils/notes';

const { custom } = FormFactories;

const NO_COOK = 'none';
const NO_COOKS: Cook[] = [];

interface NoteFormData {
  text: string;
  cook: string;
}

interface NoteFormProps {
  uid: string;
  recipeId: string;
  /** The note being changed; null writes a new one. */
  noteId: string | null;
  /** The cook a new note starts on. */
  initialCookId: string | null;
  onCancel: () => void;
  onDone: () => void;
  /** Closes this and opens the recipe's form with the note quoted; offered for a saved NOTE. */
  onUpdateRecipe?: (noteId: string) => void;
}

/** Editing saves only the words: a note's cook and date stay as they were. */
function NoteForm({
  uid,
  recipeId,
  noteId,
  initialCookId,
  onCancel,
  onDone,
  onUpdateRecipe,
}: NoteFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const note = useAppSelector(selectNotesById).get(noteId ?? '') ?? null;
  const noteCount =
    useAppSelector(selectNotesByRecipe).get(recipeId)?.length ?? 0;
  const cooks = useAppSelector(selectCooksByRecipe).get(recipeId) ?? NO_COOKS;
  const noteCook = useAppSelector(selectCooksById).get(note?.cookId ?? '');
  const isCooksReady = useAppSelector(
    (state) =>
      state.pinch.cooks.isLoaded && state.pinch.cooks.loadError === null,
  );
  const isNotesLoaded = useAppSelector((state) => state.pinch.notes.isLoaded);
  const notesError = useAppSelector((state) => state.pinch.notes.loadError);
  const [initialData] = useState<NoteFormData>(() => ({
    text: note?.text ?? '',
    cook: initialCookId ?? NO_COOK,
  }));
  const [data, setData] = useState<NoteFormData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = noteId !== null;
  const isTweak = note?.kind === 'TWEAK';
  const choices = useMemo(
    () => getNoteCookChoices(cooks, initialCookId),
    [cooks, initialCookId],
  );
  const cookOptions = useMemo(() => {
    const labels = getCookChoiceLabels(
      choices,
      formatDateShort,
      formatDateTime,
    );
    return [
      { value: NO_COOK, label: 'No, just a note' },
      ...choices.map((cook, index) => ({
        value: cook.id,
        label: labels[index],
      })),
    ];
  }, [choices]);
  const hasCookQuestion = !isEditing && isCooksReady && choices.length > 0;
  const isFull = !isEditing && isNoteHistoryFull(noteCount);
  const isDirty = isEditing
    ? data.text !== (note?.text ?? '')
    : data.text.trim() !== '';
  const isTextOk = isTweak || isValidNoteText(data.text);

  const getBlocker = () => {
    if (isFull) {
      return "This recipe's notes are full. Delete an older one to add more.";
    }
    if (!isTextOk) {
      return isEditing
        ? 'A note needs some words. Delete it instead if you no longer want it.'
        : 'Write a note to save.';
    }
    return null;
  };
  const blocker = getBlocker();

  const fields = useMemo(
    () => [
      ...(note
        ? [
            custom({
              name: 'about',
              label: '',
              renderComponent: () => (
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>
                    {note.kind === 'TWEAK' ? 'Changed on' : 'Note from'}{' '}
                    {formatDateTime(note.createdAt)}
                    {noteCook &&
                      ` · after cooking on ${formatDateShort(noteCook.cookedAt)}`}
                  </p>
                  {note.kind === 'TWEAK' && (
                    <ChangeList changes={note.changes ?? []} />
                  )}
                </div>
              ),
            }),
          ]
        : []),
      custom({
        name: 'text',
        label: '',
        renderComponent: (props) => (
          <NoteTextField
            label={isTweak ? 'Why you changed it' : 'Your note'}
            placeholder={
              isTweak
                ? 'Optional'
                : 'Less vinegar next time, the sauce was ready early'
            }
            maxLength={MAX_RECIPE_NOTE_LENGTH}
            value={String(props.value)}
            onChange={props.onValueChange}
            shouldFocus
          />
        ),
      }),
      ...(hasCookQuestion
        ? [
            custom({
              name: 'cook',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-1.5'>
                  <p className='text-muted-foreground text-xs'>
                    Is this about a time you cooked it?
                  </p>
                  <PillGroup
                    label='Which time you cooked it'
                    options={cookOptions}
                    value={String(props.value)}
                    onChange={props.onValueChange}
                  />
                </div>
              ),
            }),
          ]
        : []),
      ...(note && note.kind === 'NOTE' && onUpdateRecipe
        ? [
            custom({
              name: 'update',
              label: '',
              renderComponent: () => (
                <ActionRow
                  icon={<PenLine className='h-4 w-4' />}
                  label='Update the recipe from this note'
                  subtitle={
                    isDirty
                      ? 'Save your changes first'
                      : 'Opens the recipe with this note above it'
                  }
                  isDisabled={isDirty || isSubmitting}
                  onClick={() => onUpdateRecipe(note.id)}
                />
              ),
            }),
          ]
        : []),
    ],
    [
      note,
      noteCook,
      isTweak,
      hasCookQuestion,
      cookOptions,
      isDirty,
      isSubmitting,
      onUpdateRecipe,
    ],
  );

  const handleSubmit = async () => {
    if (blocker !== null || (isEditing && !isDirty)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (noteId !== null) {
        await dispatch(
          updateNote({ uid, id: noteId, text: data.text }),
        ).unwrap();
      } else {
        await dispatch(
          addNote({
            uid,
            recipeId,
            text: data.text,
            cookId: data.cook === NO_COOK ? null : data.cook,
          }),
        ).unwrap();
        addToast({
          title: `Added a note to ${recipe?.title ?? 'your recipe'}`,
          type: 'success',
        });
      }
      onDone();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this note.'));
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!note) {
      return;
    }
    const confirmed = await confirm({
      title: 'Delete this note?',
      message:
        note.kind === 'TWEAK'
          ? `The record of the change on ${formatDateShort(note.createdAt)} comes off the recipe's notes. The recipe itself stays as it is. This can't be undone.`
          : `The note from ${formatDateShort(note.createdAt)} comes off the recipe's notes. This can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(removeNote({ uid, id: note.id })).unwrap();
      onDone();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this note.'));
      setIsSubmitting(false);
    }
  };

  if (notesError !== null) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        Your notes couldn't load just now.
      </p>
    );
  }
  if (!isNotesLoaded) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        Loading your notes…
      </p>
    );
  }
  if (isEditing && !note) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        This note is gone.
      </p>
    );
  }

  return (
    <Form
      id='pinch-note'
      form={fields}
      initialData={initialData}
      columns={1}
      onDataChange={(next) => {
        setData(next as NoteFormData);
        setError(null);
      }}
      onSubmit={() => {
        void handleSubmit();
      }}
      submitButton={
        <ModalFooterActions
          note={
            blocker ??
            (error && <span className='text-destructive'>{error}</span>)
          }
          leftActions={
            note && (
              <DeleteIconButton
                label='Delete this note'
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              />
            )
          }
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='submit'
              formNoValidate
              loading={isSubmitting}
              disabled={
                isSubmitting || blocker !== null || (isEditing && !isDirty)
              }
            >
              Save
            </Button>
          }
        />
      }
    />
  );
}

export default NoteForm;
