import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatDateTime } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import NoteKindPills, {
  type WrittenNoteKind,
} from '@apps/pinch/components/notes/NoteKindPills';
import NoteReasonField from '@apps/pinch/components/notes/NoteReasonField';
import NoteStepPicker from '@apps/pinch/components/notes/NoteStepPicker';
import {
  MAX_RECIPE_NOTE_LENGTH,
  NOTE_KIND_LABELS,
  NOTE_TEXT_COPY,
} from '@apps/pinch/constants';
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
  selectNotesLoadError,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Cook } from '@apps/pinch/types';
import {
  getCookChoiceLabels,
  getNoteCookChoices,
  isNoteHistoryFull,
  isValidNoteText,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const { custom } = FormFactories;

const NO_COOK = 'none';
const NO_COOKS: Cook[] = [];

const WHOLE_RECIPE = '';
const NO_STEPS: string[] = [];

interface NoteFormData {
  kind: WrittenNoteKind;
  text: string;
  reason: string;
  /** The step's number (0-based) as text, or empty for the whole recipe. */
  step: string;
  cook: string;
}


interface NoteFormProps {
  uid: string;
  recipeId: string;
  /** The note being changed; null writes a new one. */
  noteId: string | null;
  /** The cook a new note is about, which then isn't asked; null asks, starting on a cook from today when there is one. */
  initialCookId: string | null;
  /** What a new entry starts as; null starts as a note. */
  initialKind?: WrittenNoteKind | null;
  /** The step a new entry starts on (0-based); null starts on the whole recipe. */
  initialStepIndex?: number | null;
  onCancel: () => void;
  onDone: () => void;
}

/** A tip, a planned change or a note about the whole recipe or one step. Editing saves the words, a change's reason and the step: an entry's kind, cook and date stay as they were. */
function NoteForm({
  uid,
  recipeId,
  noteId,
  initialCookId,
  initialKind = null,
  initialStepIndex = null,
  onCancel,
  onDone,
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
  const notesError = useAppSelector(selectNotesLoadError);
  const [today] = useState(() => toLocalDateInputValue(Date.now()));
  const isToday = (cook: Cook) =>
    toLocalDateInputValue(cook.cookedAt) === today;
  const steps = recipe?.steps ?? NO_STEPS;
  const [initialData] = useState<NoteFormData>(() => {
    const at = note === null ? initialStepIndex : resolveNoteStep(note, steps);
    return {
      kind:
        note !== null && note.kind !== 'TWEAK'
          ? note.kind
          : (initialKind ?? 'NOTE'),
      text: note?.text ?? '',
      reason: note?.reason ?? '',
      step: at === null ? WHOLE_RECIPE : String(at),
      cook: initialCookId ?? cooks.find(isToday)?.id ?? NO_COOK,
    };
  });
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
        label:
          toLocalDateInputValue(cook.cookedAt) === today &&
          labels[index] === formatDateShort(cook.cookedAt)
            ? 'Today'
            : labels[index],
      })),
    ];
  }, [choices, today]);
  const hasCookQuestion =
    !isEditing && initialCookId === null && isCooksReady && choices.length > 0;
  const isFull = !isEditing && isNoteHistoryFull(noteCount);
  const isDirty = isEditing
    ? data.text !== initialData.text ||
      data.reason !== initialData.reason ||
      data.step !== initialData.step
    : data.text.trim() !== '';
  const kind: WrittenNoteKind | 'TWEAK' = isTweak ? 'TWEAK' : data.kind;
  const stepIndex = data.step === WHOLE_RECIPE ? null : Number(data.step);
  const isTextOk = isTweak || isValidNoteText(data.text);

  const getBlocker = () => {
    if (isFull) {
      return "This recipe's notes are full. Delete an older one to add more.";
    }
    if (!isTextOk) {
      return isEditing
        ? 'An entry needs some words. Delete it instead if you no longer want it.'
        : `Write ${kind === 'NOTE' ? 'a note' : `a ${NOTE_KIND_LABELS[kind].toLowerCase()}`} to save.`;
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
                    {NOTE_KIND_LABELS[note.kind]} from{' '}
                    {formatDateShort(note.createdAt)}
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
        : [
            custom({
              name: 'kind',
              label: '',
              renderComponent: (props) => (
                <NoteKindPills
                  value={String(props.value) as WrittenNoteKind}
                  onChange={props.onValueChange}
                />
              ),
            }),
          ]),
      custom({
        name: 'text',
        label: '',
        renderComponent: (props) => (
          <NoteTextField
            label={NOTE_TEXT_COPY[kind].label}
            placeholder={NOTE_TEXT_COPY[kind].placeholder}
            maxLength={MAX_RECIPE_NOTE_LENGTH}
            value={String(props.value)}
            onChange={props.onValueChange}
            shouldFocus
          />
        ),
      }),
      ...(kind === 'CHANGE'
        ? [
            custom({
              name: 'reason',
              label: '',
              renderComponent: (props) => (
                <NoteReasonField
                  value={String(props.value)}
                  onChange={props.onValueChange}
                />
              ),
            }),
          ]
        : []),
      ...(!isTweak && steps.length > 0
        ? [
            custom({
              name: 'step',
              label: '',
              renderComponent: (props) => (
                <NoteStepPicker
                  steps={steps}
                  value={
                    String(props.value) === WHOLE_RECIPE
                      ? null
                      : Number(props.value)
                  }
                  onChange={(next) =>
                    props.onValueChange(next === null ? WHOLE_RECIPE : String(next))
                  }
                />
              ),
            }),
          ]
        : []),
      ...(hasCookQuestion && kind === 'NOTE'
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
    ],
    [note, noteCook, isTweak, kind, steps, hasCookQuestion, cookOptions],
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
          updateNote({
            uid,
            id: noteId,
            text: data.text,
            ...(note?.kind === 'CHANGE' ? { reason: data.reason } : {}),
            ...(isTweak ? {} : { stepIndex }),
          }),
        ).unwrap();
      } else {
        await dispatch(
          addNote({
            uid,
            recipeId,
            kind: data.kind,
            text: data.text,
            reason: data.kind === 'CHANGE' ? data.reason : null,
            cookId:
              data.kind === 'NOTE' && data.cook !== NO_COOK ? data.cook : null,
            stepIndex,
          }),
        ).unwrap();
        addToast({
          title: `Added a ${NOTE_KIND_LABELS[data.kind].toLowerCase()} to ${recipe?.title ?? 'your recipe'}`,
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
      title: `Delete this ${NOTE_KIND_LABELS[note.kind].toLowerCase()}?`,
      message:
        note.kind === 'TWEAK'
          ? `The record of the change on ${formatDateShort(note.createdAt)} comes off the recipe's notes. The recipe itself stays as it is. This can't be undone.`
          : `The ${NOTE_KIND_LABELS[note.kind].toLowerCase()} from ${formatDateShort(note.createdAt)} comes off the recipe's notes. This can't be undone.`,
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
                label={`Delete this ${note ? NOTE_KIND_LABELS[note.kind].toLowerCase() : 'entry'}`}
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
