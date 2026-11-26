import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CircleCheck } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedWork } from '@/hooks/useUnsavedWork';
import DeleteIconButton from '@/components/DeleteIconButton';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import NoteTextField from '@/components/NoteTextField';
import { PillGroup } from '@/components/PillGroup';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatDateTime } from '@/utils/formatUtils';
import ChangeList from '@apps/pinch/components/notes/ChangeList';
import ChangeRow from '@apps/pinch/components/notes/ChangeRow';
import NoteKindPills, {
  type WrittenNoteKind,
} from '@apps/pinch/components/notes/NoteKindPills';
import NoteReasonField from '@apps/pinch/components/notes/NoteReasonField';
import NoteStepPicker from '@apps/pinch/components/notes/NoteStepPicker';
import {
  MAX_RECIPE_NOTE_LENGTH,
  RESOLVE_EDIT_CHOICES,
  NOTE_KIND_LABELS,
  NOTE_TEXT_COPY,
  WRITTEN_NOTE_KINDS,
} from '@apps/pinch/constants';
import {
  addNote,
  removeNote,
  reopenChange,
  resolveChange,
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
import type { Cook, RecipeNote } from '@apps/pinch/types';
import {
  getCookChoiceLabels,
  getNoteCookChoices,
  getResolveCandidates,
  isNoteHistoryFull,
  isValidNoteText,
  resolveNoteStep,
} from '@apps/pinch/utils/notes';

const { custom } = FormFactories;

const NO_COOK = 'none';
const NO_COOKS: Cook[] = [];
const NO_NOTES: RecipeNote[] = [];

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

function parseNoteDraft(stored: unknown): NoteFormData | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { kind, text, reason, step, cook } = stored as Partial<NoteFormData>;
  const knownKind = WRITTEN_NOTE_KINDS.find((value) => value === kind);
  const isShaped =
    knownKind !== undefined &&
    typeof text === 'string' &&
    typeof reason === 'string' &&
    typeof step === 'string' &&
    typeof cook === 'string';
  return isShaped ? { kind: knownKind, text, reason, step, cook } : null;
}

interface ResolveEditViewProps {
  change: RecipeNote;
  notes: RecipeNote[];
  error: string | null;
  isBusy: boolean;
  onBack: () => void;
  onPick: (tweakId: string | null) => void;
}

function ResolveEditView({
  change,
  notes,
  error,
  isBusy,
  onBack,
  onPick,
}: ResolveEditViewProps) {
  const candidates = getResolveCandidates(notes, change, RESOLVE_EDIT_CHOICES);

  return (
    <div className='space-y-3'>
      <BackLink onBack={onBack} />
      <p className='font-medium'>Which edit took care of it?</p>
      {candidates.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          No edits since you wrote it.
        </p>
      )}
      <ul className='divide-border divide-y'>
        {candidates.map((candidate) => (
          <ChangeRow key={candidate.id} note={candidate} onOpen={onPick} />
        ))}
        <li>
          <Button
            type='button'
            variant='tertiary'
            className='h-auto min-h-12 w-full items-start justify-start gap-3 px-0! py-3 text-left'
            disabled={isBusy}
            onClick={() => onPick(null)}
          >
            <span className='text-foreground min-w-0 flex-1 text-sm font-medium'>
              None, it's handled
            </span>
          </Button>
        </li>
      </ul>
      {error && <p className='text-destructive text-sm'>{error}</p>}
    </div>
  );
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
  /** Hears each kind the person picks on a new entry, so the next one can start on it. */
  onKindChange?: (kind: WrittenNoteKind) => void;
  /** The step a new entry starts on (0-based); null starts on the whole recipe. */
  initialStepIndex?: number | null;
  onCancel: () => void;
  onDone: () => void;
}

/** A tip, a planned change or a note about the whole recipe, one step or a time it was cooked. Editing saves the words, a change's reason, the step and the cook: an entry's kind and date stay as they were. */
function NoteForm({
  uid,
  recipeId,
  noteId,
  initialCookId,
  initialKind = null,
  onKindChange,
  initialStepIndex = null,
  onCancel,
  onDone,
}: NoteFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast, removeToast } = useToast();
  const recipe = useAppSelector(selectRecipesById).get(recipeId);
  const note = useAppSelector(selectNotesById).get(noteId ?? '') ?? null;
  const noteCount =
    useAppSelector(selectNotesByRecipe).get(recipeId)?.length ?? 0;
  const cooks = useAppSelector(selectCooksByRecipe).get(recipeId) ?? NO_COOKS;
  const recipeNotes = useAppSelector(selectNotesByRecipe).get(recipeId);
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
  const [startData] = useState<NoteFormData>(() => {
    const at = note === null ? initialStepIndex : resolveNoteStep(note, steps);
    return {
      kind:
        note !== null && note.kind !== 'TWEAK'
          ? note.kind
          : (initialKind ?? (cooks.length === 0 ? 'TIP' : 'NOTE')),
      text: note?.text ?? '',
      reason: note?.reason ?? '',
      step: at === null ? WHOLE_RECIPE : String(at),
      cook:
        initialCookId ??
        (note === null ? cooks.find(isToday)?.id : note.cookId) ??
        NO_COOK,
    };
  });
  const draftKey = noteId
    ? `pinch:note:${noteId}`
    : `pinch:note:new:${recipeId}`;
  const draftBase = {
    updatedAt: note?.updatedAt ?? null,
    initialCookId,
    initialKind,
    initialStepIndex,
  };
  const draft = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseNoteDraft,
  });
  const [data, setData] = useState<NoteFormData>(() => {
    const restored = draft.restored;
    if (restored === null) return startData;
    const isStepKnown =
      restored.step === WHOLE_RECIPE ||
      (/^\d+$/.test(restored.step) && Number(restored.step) < steps.length);
    const isCookKnown =
      restored.cook === NO_COOK ||
      cooks.some((cook) => cook.id === restored.cook);
    return {
      kind: note === null ? restored.kind : startData.kind,
      text: restored.text,
      reason: restored.reason,
      step: isStepKnown ? restored.step : startData.step,
      cook:
        isCookKnown && initialCookId === null ? restored.cook : startData.cook,
    };
  });
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPickingEdit, setIsPickingEdit] = useState(false);
  const [isResolveBusy, setIsResolveBusy] = useState(false);

  const isEditing = noteId !== null;
  const noteCookId = note?.cookId ?? null;
  const isTweak = note?.kind === 'TWEAK';
  const choices = useMemo(
    () => getNoteCookChoices(cooks, initialCookId ?? noteCookId),
    [cooks, initialCookId, noteCookId],
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
    !isTweak && initialCookId === null && isCooksReady && choices.length > 0;
  const isFull = !isEditing && isNoteHistoryFull(noteCount);
  const isDirty = isEditing
    ? data.text !== startData.text ||
      data.reason !== startData.reason ||
      data.step !== startData.step ||
      data.cook !== startData.cook
    : data.text.trim() !== '';
  useUnsavedWork(() => isDirty);
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: draftKey,
    base: draftBase,
    value: data,
    isDirty,
  });
  const startOver = () => {
    setData(startData);
    setFormKey((current) => current + 1);
    draft.hideNotice();
  };
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

  const handleReopen = async () => {
    if (!note) {
      return;
    }
    setError(null);
    setIsResolveBusy(true);
    try {
      await dispatch(reopenChange({ uid, id: note.id })).unwrap();
      addToast({ title: 'Back on your planned changes', type: 'success' });
      onDone();
    } catch (reopenError) {
      setError(getErrorMessage(reopenError, 'Unable to plan this again.'));
      setIsResolveBusy(false);
    }
  };

  const doneEdit =
    note?.resolvedBy == null
      ? undefined
      : (recipeNotes ?? []).find((entry) => entry.id === note.resolvedBy);
  const doneLine =
    note?.resolvedAt == null
      ? ''
      : doneEdit
        ? `Done · taken care of in your ${formatDateShort(doneEdit.createdAt)} edit`
        : `Done on ${formatDateShort(note.resolvedAt)}`;

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
                  onChange={(next) => {
                    props.onValueChange(next);
                    onKindChange?.(next);
                  }}
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
                    props.onValueChange(
                      next === null ? WHOLE_RECIPE : String(next),
                    )
                  }
                />
              ),
            }),
          ]
        : []),
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
    ],
    [
      note,
      noteCook,
      isTweak,
      kind,
      steps,
      hasCookQuestion,
      cookOptions,
      onKindChange,
    ],
  );

  const handleSubmit = async (isAnother = false) => {
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
            ...(isTweak || data.step === startData.step ? {} : { stepIndex }),
            ...(isTweak || data.cook === startData.cook
              ? {}
              : { cookId: data.cook === NO_COOK ? null : data.cook }),
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
            cookId: data.cook === NO_COOK ? null : data.cook,
            stepIndex,
          }),
        ).unwrap();
        addToast({
          title: `Added a ${NOTE_KIND_LABELS[data.kind].toLowerCase()} to ${recipe?.title ?? 'your recipe'}`,
          type: 'success',
        });
        if (isAnother) {
          setData({ ...data, text: '', reason: '' });
          setFormKey((current) => current + 1);
          setIsSubmitting(false);
          return;
        }
      }
      onDone();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this note.'));
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (tweakId: string | null) => {
    if (!note) {
      return;
    }
    setError(null);
    setIsResolveBusy(true);
    try {
      await dispatch(resolveChange({ uid, id: note.id, tweakId })).unwrap();
      const toastId = generateUuid();
      addToast({
        id: toastId,
        title: 'Marked the change done',
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            removeToast(toastId);
            dispatch(reopenChange({ uid, id: note.id }))
              .unwrap()
              .catch(() =>
                addToast({ title: "Couldn't undo that", type: 'error' }),
              );
          },
        },
      });
      onDone();
    } catch (resolveError) {
      setError(getErrorMessage(resolveError, 'Unable to mark this done.'));
      setIsResolveBusy(false);
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

  if (isPickingEdit && note) {
    return (
      <ResolveEditView
        change={note}
        notes={recipeNotes ?? NO_NOTES}
        error={error}
        isBusy={isResolveBusy}
        onBack={() => setIsPickingEdit(false)}
        onPick={(tweakId) => void handleResolve(tweakId)}
      />
    );
  }

  return (
    <>
      {draft.isNoticeShown && (
        <div className='mb-4'>
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={draft.hideNotice}
          />
        </div>
      )}
      {note?.kind === 'CHANGE' && (
        <div className='mb-4 space-y-2'>
          {doneLine !== '' ? (
            <>
              <p className='text-muted-foreground text-sm'>{doneLine}</p>
              <ActionRow
                icon={<CircleCheck className='h-4 w-4' />}
                label='Plan it again'
                subtitle='Puts it back on your planned changes'
                isDisabled={isResolveBusy}
                onClick={() => void handleReopen()}
              />
            </>
          ) : (
            <ActionRow
              icon={<CircleCheck className='h-4 w-4' />}
              label='Mark done'
              subtitle="When it's taken care of, with or without an edit"
              hasChevron
              isDisabled={isResolveBusy}
              onClick={() => setIsPickingEdit(true)}
            />
          )}
          {error && <p className='text-destructive text-sm'>{error}</p>}
        </div>
      )}
      <Form
        key={formKey}
        id='pinch-note'
        form={fields}
        initialData={data}
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
              <>
                {!isEditing && (
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSubmitting || blocker !== null}
                    onClick={() => void handleSubmit(true)}
                  >
                    Add another
                  </Button>
                )}
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
              </>
            }
          />
        }
      />
    </>
  );
}

export default NoteForm;
