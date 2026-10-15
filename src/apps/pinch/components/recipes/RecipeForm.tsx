import { useMemo, useState, type RefObject } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import ClampedText from '@/components/ClampedText';
import DeleteIconButton from '@/components/DeleteIconButton';
import FallbackImage from '@/components/FallbackImage';
import FormSection from '@/components/FormSection';
import Field from '@/components/forms/Field';
import PhotoPicker from '@/components/forms/PhotoPicker';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import ModalFooterActions from '@/components/ModalFooterActions';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import Stepper from '@/components/Stepper';
import NutritionReview from '@apps/pinch/components/recipes/NutritionReview';
import RecipeCareField from '@apps/pinch/components/recipes/RecipeCareField';
import {
  RecipeDescriptionField,
  RecipeTimesField,
  RecipeTitleField,
} from '@apps/pinch/components/recipes/RecipeBasics';
import RecipeIngredients from '@apps/pinch/components/recipes/RecipeIngredients';
import {
  getDataFromExtracted,
  getDataFromIdea,
  getInitialData,
  getReadSourceChoice,
  isRowAmountValid,
  isValidMinutes,
  isValidNutrition,
  parseMinutes,
  parseNutrition,
  toRecipeLine,
  type IngredientRow,
  type RecipeFormData,
} from '@apps/pinch/components/recipes/recipeFormModel';
import RecipeSteps from '@apps/pinch/components/recipes/RecipeSteps';
import {
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_NOTE_LENGTH,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SOURCE_LABEL_LENGTH,
  SECTION_COUNT_THRESHOLD,
} from '@apps/pinch/constants';
import { findSourceByLabel } from '@apps/pinch/utils/sources';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { announceRecipeAdded } from '@apps/pinch/hooks/useRecipeAdded';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import {
  removeRecipe,
  saveRecipe,
} from '@apps/pinch/store/actions/recipeActions';
import { getUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectCookSummaries,
  selectIdeas,
  selectIngredients,
  selectIngredientsById,
  selectNotesByRecipe,
  selectRecipesById,
  selectSourceCounts,
  selectSources,
  selectSourcesById,
  selectSourcesLoadError,
  selectTweakTracking,
} from '@apps/pinch/store/selectors';
import type {
  Idea,
  NutritionMetric,
  Recipe,
  RecipeNote,
  RecipeSource,
} from '@apps/pinch/types';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { getRecipeNutrition } from '@apps/pinch/utils/nutritionMath';
import { getCareProblem, parseCareText } from '@apps/pinch/utils/recipeCare';
import { describeUsage, isInUse } from '@apps/pinch/utils/references';

const { custom } = FormFactories;

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export interface RecipeRead {
  recipe: ExtractedRecipe;
  source: RecipeSource;
  label: string;
}

const isRowValid = (row: IngredientRow) =>
  row.ingredientId !== '' && isRowAmountValid(row);

interface RecipeFormProps {
  uid: string;
  /** The recipe being changed; null writes a new one. */
  recipeId: string | null;
  /** What a reader found for a new recipe; the form opens filled in with it. */
  initialRead: RecipeRead | null;
  /** The idea a new recipe is made from: the form opens with what it knows, and saving marks it made. */
  initialIdea: Idea | null;
  /** The note the person is updating this recipe from: shown as a quote, and the tweak's reason starts as its words. The note itself is never changed. */
  initialNote: RecipeNote | null;
  /** Keeps the screen's header on the recipe's name as it is typed. */
  onTitleChange: (title: string) => void;
  /** Tells the screen whether leaving now would throw work away. */
  isDirtyRef: RefObject<boolean>;
  /** Cancel and the screen's own back go through the screen, which asks before discarding. */
  onLeave: () => void;
}

function RecipeForm({
  uid,
  recipeId,
  initialRead,
  initialIdea,
  initialNote,
  onTitleChange,
  isDirtyRef,
  onLeave,
}: RecipeFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { subview, closeSubviewIf, openSubviewFromToast } = usePinchOverlay();
  const recipe = useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ingredients = useAppSelector(selectIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const sources = useAppSelector(selectSources);
  const sourcesById = useAppSelector(selectSourcesById);
  const sourceCounts = useAppSelector(selectSourceCounts);
  const hasSourcesFailed = useAppSelector(selectSourcesLoadError) !== null;
  const tracking = useAppSelector((state) =>
    selectTweakTracking(state, recipeId),
  );
  const existingCoverUrl = useStorageImageUrl(
    recipe?.coverPath ?? null,
    recipe?.updatedAt ?? 0,
  );
  const upload = useImageUpload(null);
  const { pick: pickCover, clear: clearCover, error: coverError } = upload;
  const [isCoverRemoved, setIsCoverRemoved] = useState(false);
  const [initialData] = useState(() =>
    initialRead
      ? {
          ...getDataFromExtracted(initialRead.recipe, ingredients),
          sourceChoice: getReadSourceChoice(
            initialRead.source,
            initialRead.label,
            sources,
          ),
        }
      : initialIdea
        ? getDataFromIdea(initialIdea, sources)
        : {
            ...getInitialData(recipe, sourcesById),
            why: initialNote?.text ?? '',
          },
  );
  const [formData, setFormData] = useState<RecipeFormData>(initialData);
  const [isNoteClosed, setIsNoteClosed] = useState(false);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverUrl =
    upload.previewUrl ?? (isCoverRemoved ? null : existingCoverUrl);
  const prep = parseMinutes(formData.basics.prep);
  const cook = parseMinutes(formData.basics.cook);
  const isFormComplete =
    formData.title.trim() !== '' &&
    formData.title.length <= MAX_RECIPE_TITLE_LENGTH &&
    formData.description.length <= MAX_RECIPE_DESCRIPTION_LENGTH &&
    formData.ingredients.length >= 1 &&
    formData.ingredients.length <= MAX_RECIPE_INGREDIENTS &&
    formData.ingredients.every(isRowValid) &&
    formData.basics.servings > 0 &&
    isValidMinutes(prep) &&
    isValidMinutes(cook) &&
    getCareProblem(formData.care) === null &&
    isValidNutrition(formData.nutrition);

  const calculation = useMemo(() => {
    const lines = formData.ingredients.filter(isRowValid);
    const result = getRecipeNutrition(
      {
        id: 'draft',
        title: '',
        description: null,
        servings: formData.basics.servings,
        prepMinutes: null,
        cookMinutes: null,
        coverPath: null,
        ingredients: lines.map(toRecipeLine),
        steps: [],
        care: null,
        nutritionOverride: null,
        source: 'MANUAL',
        sourceId: null,
        isArchived: false,
        createdAt: 0,
        updatedAt: 0,
      },
      ingredientsById,
    );

    const unresolved = formData.ingredients.filter(
      (row) => row.ingredientId === '',
    ).length;

    return {
      values: result.values,
      leftOut: {
        count:
          new Set(result.missing.map((entry) => entry.ingredientId)).size +
          unresolved,
        total: lines.filter((row) => !row.isAmountless).length + unresolved,
      },
    };
  }, [formData.ingredients, formData.basics.servings, ingredientsById]);

  const isBlankByHand =
    recipeId === null && initialRead === null && initialIdea === null;
  const unresolvedCount = formData.ingredients.filter(
    (row) => row.ingredientId === '',
  ).length;
  const getBlocker = (): { text: string; target: string | null } | null => {
    if (
      !recipe &&
      formData.title.trim() === '' &&
      formData.ingredients.length === 0
    ) {
      return null;
    }
    const plain = (text: string) => ({ text, target: null });
    if (formData.title.trim() === '') return plain('Give it a title to save.');
    if (formData.title.length > MAX_RECIPE_TITLE_LENGTH) {
      return plain('Shorten the title to save.');
    }
    if (formData.description.length > MAX_RECIPE_DESCRIPTION_LENGTH) {
      return plain('Shorten the description to save.');
    }
    if (formData.ingredients.length === 0) {
      return {
        text: 'Add an ingredient to save.',
        target: '[data-recipe-ingredients]',
      };
    }
    if (unresolvedCount > 0) {
      return {
        text: `Add or choose ${unresolvedCount === 1 ? 'the ingredient' : `the ${unresolvedCount} ingredients`} marked “Not in your ingredients yet” to save.`,
        target: '[data-ingredient-unresolved]',
      };
    }
    if (!formData.ingredients.every(isRowValid)) {
      return {
        text: formData.ingredients.some(
          (row) => !row.isAmountless && row.amount.trim() === '',
        )
          ? 'Add the missing amounts, or choose “No amount”, to save.'
          : 'Check the ingredient amounts to save.',
        target: '[data-ingredient-amount-wrong]',
      };
    }
    if (!isValidMinutes(prep) || !isValidMinutes(cook)) {
      return plain('Check the prep and cook time to save.');
    }
    if (getCareProblem(formData.care) !== null) {
      return plain('Check the fridge and freezer days to save.');
    }
    return null;
  };
  const blocker = getBlocker();
  const showBlocker = (target: string) => {
    const element = document.querySelector<HTMLElement>(target);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.querySelector('button')?.focus({ preventScroll: true });
  };

  const sourceOptions = useMemo(
    () =>
      sources
        .filter(
          (source) =>
            sourceCounts.bySource.has(source.id) ||
            source.id === initialData.sourceChoice.choice,
        )
        .map((source) => ({ value: source.id, label: source.label })),
    [sources, sourceCounts, initialData.sourceChoice.choice],
  );

  const fields = useMemo(
    () => [
      custom({
        name: 'title',
        label: '',
        renderComponent: (props) => (
          <RecipeTitleField
            value={String(props.value)}
            onChange={props.onValueChange}
            defaultOpen={isBlankByHand}
          />
        ),
      }),
      custom({
        name: 'basics',
        label: '',
        renderComponent: (props) => {
          const basics = props.value as RecipeFormData['basics'];
          const set = (patch: Partial<RecipeFormData['basics']>) =>
            props.onValueChange({ ...basics, ...patch });
          return (
            <div className='space-y-1' onKeyDown={blockEnterSubmit}>
              <div className='flex min-h-11 items-center justify-between gap-3'>
                <span className='text-sm font-medium'>Servings</span>
                <Stepper
                  label='Servings'
                  value={basics.servings}
                  onChange={(servings) => set({ servings })}
                />
              </div>
              <RecipeTimesField
                prep={basics.prep}
                cook={basics.cook}
                onChange={set}
              />
            </div>
          );
        },
      }),
      custom({
        name: 'description',
        label: '',
        renderComponent: (props) => (
          <RecipeDescriptionField
            value={String(props.value)}
            onChange={props.onValueChange}
          />
        ),
      }),
      custom({
        name: 'cover',
        label: '',
        renderComponent: () => (
          <FormSection title='Photo'>
            <div className='flex items-center gap-4'>
              <span
                className='bg-accent grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-3xl'
                aria-hidden='true'
              >
                {coverUrl ? (
                  <FallbackImage
                    src={coverUrl}
                    alt=''
                    fallback='🍲'
                    className='size-full object-cover'
                  />
                ) : (
                  '🍲'
                )}
              </span>
              <PhotoPicker
                photoUrl={coverUrl}
                showPreview={false}
                error={coverError}
                onSelect={(file) => {
                  pickCover(file);
                  setIsCoverRemoved(false);
                  isDirtyRef.current = true;
                }}
                onRemove={() => {
                  clearCover();
                  setIsCoverRemoved(true);
                  isDirtyRef.current = true;
                }}
              />
            </div>
          </FormSection>
        ),
      }),
      custom({
        name: 'ingredients',
        label: '',
        renderComponent: (props) => (
          <FormSection
            title='Ingredients'
            detail={
              (props.value as IngredientRow[]).length > SECTION_COUNT_THRESHOLD
                ? (props.value as IngredientRow[]).length
                : undefined
            }
          >
            <RecipeIngredients
              uid={uid}
              rows={props.value as IngredientRow[]}
              onChange={props.onValueChange}
              onRemoved={showUndo}
            />
          </FormSection>
        ),
      }),
      custom({
        name: 'steps',
        label: '',
        renderComponent: (props) => (
          <FormSection title='Steps'>
            <RecipeSteps
              steps={props.value as string[]}
              onChange={props.onValueChange}
              onRemoved={showUndo}
            />
          </FormSection>
        ),
      }),
      ...(hasSourcesFailed
        ? []
        : [
            custom({
              name: 'sourceChoice',
              label: '',
              renderComponent: (props) => {
                const value = props.value as RecipeFormData['sourceChoice'];
                return (
                  <FormSection title="Where it's from">
                    <div className='space-y-2' onKeyDown={blockEnterSubmit}>
                      <PickOrCreate
                        label='Sources'
                        options={sourceOptions}
                        choice={value.choice}
                        newText={value.newText}
                        newPillLabel='New source'
                        newPlaceholder='Serious Eats'
                        maxLength={MAX_SOURCE_LABEL_LENGTH}
                        isFocusedOnOpen={false}
                        clearLabel='Remove source'
                        onChange={(choice, newText) =>
                          props.onValueChange({ choice, newText })
                        }
                      />
                      <p className='text-muted-foreground text-xs'>
                        Optional. It shows on the recipe, and you can filter by
                        it.
                      </p>
                    </div>
                  </FormSection>
                );
              },
            }),
          ]),
      custom({
        name: 'care',
        label: '',
        renderComponent: (props) => (
          <RecipeCareField
            value={props.value as RecipeFormData['care']}
            onChange={props.onValueChange}
          />
        ),
      }),
      custom({
        name: 'nutrition',
        label: '',
        renderComponent: (props) => (
          <FormSection title='Nutrition'>
            <NutritionReview
              calculated={calculation.values}
              leftOut={calculation.leftOut}
              typed={props.value as Record<NutritionMetric, string>}
              onChange={props.onValueChange}
            />
          </FormSection>
        ),
      }),
      ...(tracking === 'on'
        ? [
            custom({
              name: 'why',
              label: '',
              renderComponent: (props) => (
                <div className='space-y-1.5' onKeyDown={blockEnterSubmit}>
                  <Field label='What changed and why?' isCompact>
                    {() => (
                      <Input
                        variant='outline'
                        maxLength={MAX_RECIPE_NOTE_LENGTH}
                        placeholder='Less vinegar, it was too sharp'
                        value={String(props.value)}
                        onChange={(event) =>
                          props.onValueChange(event.target.value)
                        }
                      />
                    )}
                  </Field>
                  <p className='text-muted-foreground text-xs'>
                    Optional. Saving adds a note to this recipe with today's
                    date and what you changed.
                  </p>
                </div>
              ),
            }),
          ]
        : []),
      ...(tracking === 'full'
        ? [
            custom({
              name: 'whyFull',
              label: '',
              renderComponent: () => (
                <p className='text-muted-foreground text-xs'>
                  This recipe's notes are full, so this change won't be noted.
                  Delete an older note to make room.
                </p>
              ),
            }),
          ]
        : []),
    ],
    [
      uid,
      coverUrl,
      coverError,
      pickCover,
      clearCover,
      calculation,
      isDirtyRef,
      hasSourcesFailed,
      sourceOptions,
      isBlankByHand,
      showUndo,
      tracking,
    ],
  );

  const handleDelete = async () => {
    if (!recipe) {
      return;
    }
    const usage = await dispatch(
      getUsage({ uid, kind: 'RECIPE', id: recipe.id }),
    )
      .unwrap()
      .catch(() => null);
    if (usage === null) {
      setError(
        "We couldn't check whether this recipe is in use. Try again in a moment.",
      );
      return;
    }

    const isUsed = isInUse(usage);
    const state = store.getState();
    const idea = selectIdeas(state).find(
      (entry) => entry.recipeId === recipe.id,
    );
    const ideaLine = idea
      ? ` “${idea.title}”, the idea you made it from, goes back to your ideas.`
      : '';
    const getHistoryLine = () => {
      const { cooks, notes } = state.pinch;
      if (
        !cooks.isLoaded ||
        cooks.loadError !== null ||
        !notes.isLoaded ||
        notes.loadError !== null
      ) {
        return ' Its cooking history and notes go with it.';
      }
      const cookCount = selectCookSummaries(state).get(recipe.id)?.count ?? 0;
      const noteCount = selectNotesByRecipe(state).get(recipe.id)?.length ?? 0;
      const history = `its cooking history (${cookCount === 1 ? 'once' : `${cookCount} times`})`;
      const noted = noteCount === 1 ? 'its note' : `its ${noteCount} notes`;
      if (cookCount > 0 && noteCount > 0) {
        return ` ${capitalize(history)} and ${noted} are deleted too.`;
      }
      if (cookCount > 0) return ` ${capitalize(history)} is deleted too.`;
      if (noteCount > 0) {
        return ` ${capitalize(noted)} ${noteCount === 1 ? 'is' : 'are'} deleted too.`;
      }
      return '';
    };
    const confirmed = await confirm({
      title: isUsed ? 'Remove recipe' : 'Delete recipe',
      message: isUsed
        ? `“${recipe.title}” is used in ${describeUsage(usage)}, so it will be taken off your lists, not erased. Everything that uses it keeps its name and numbers.${ideaLine}`
        : `Delete “${recipe.title}”?${getHistoryLine()}${ideaLine} This can't be undone.`,
      confirmText: isUsed ? 'Remove' : 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeRecipe({ uid, id: recipe.id })).unwrap();
      closeSubviewIf((current) => current === subview);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this recipe.'));
      setIsSubmitting(false);
    }
  };

  const getSourceDraft = ({
    choice,
    newText,
  }: RecipeFormData['sourceChoice']) => {
    if (hasSourcesFailed) {
      return { sourceId: recipe?.sourceId ?? null, newSource: null };
    }
    if (choice !== NEW_CHOICE) {
      return {
        sourceId: sourcesById.has(choice) ? choice : null,
        newSource: null,
      };
    }
    const label = newText.trim();
    if (label === '') return { sourceId: null, newSource: null };
    const existing = findSourceByLabel([...sourcesById.values()], label);
    if (existing) return { sourceId: existing.id, newSource: null };
    const newSource = { id: generateUuid(), label };
    return { sourceId: newSource.id, newSource };
  };

  const handleSubmit = async (data: RecipeFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { sourceId, newSource } = getSourceDraft(data.sourceChoice);
      const { recipeId: savedId } = await dispatch(
        saveRecipe({
          uid,
          draft: {
            id: recipe?.id ?? null,
            title: data.title,
            description: data.description.trim() || null,
            servings: data.basics.servings,
            prepMinutes: parseMinutes(data.basics.prep),
            cookMinutes: parseMinutes(data.basics.cook),
            ingredients: data.ingredients.map(toRecipeLine),
            source: recipe ? recipe.source : (initialRead?.source ?? 'MANUAL'),
            sourceId,
            newSource,
            newIngredients: [
              ...new Map(
                data.ingredients
                  .filter((row) => row.newName !== null)
                  .map((row) => [
                    row.ingredientId,
                    { id: row.ingredientId, name: row.newName ?? '' },
                  ]),
              ).values(),
            ],
            nutritionOverride: parseNutrition(data.nutrition),
            care: parseCareText(data.care),
            steps: data.steps.map((step) => step.trim()).filter(Boolean),
            coverFile: upload.file,
            removeCover: isCoverRemoved,
            fromIdeaId: initialIdea?.id ?? null,
            tweakReason: data.why,
          },
        }),
      ).unwrap();
      if (!recipe) {
        addToast({
          title: `Added ${data.title.trim()} to your recipes`,
          type: 'success',
          action: {
            label: 'Plan it',
            onClick: () =>
              openSubviewFromToast({
                kind: 'plan',
                dayKey: getCellDayKey(new Date()),
                mealType: null,
                plannedMealId: null,
                fromMealId: null,
                fromRecipeId: savedId,
              }),
          },
        });
        announceRecipeAdded(savedId);
      }
      closeSubviewIf((current) => current === subview);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this recipe.'));
      setIsSubmitting(false);
    }
  };

  if (recipeId !== null && !recipe) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        This recipe is gone.
      </p>
    );
  }

  return (
    <>
      <UndoSnackbar pending={pending} onUndo={undo} />
      {initialIdea?.kind === 'PHOTO' && (
        <p className='text-muted-foreground mb-4 text-sm'>
          Its photo stays with the idea. To have an AI read a picture, start a
          new recipe with “From a file”.
        </p>
      )}
      {initialNote && (
        <div className='bg-accent border-border mb-4 space-y-0.5 rounded-2xl border p-3 text-sm'>
          <p className='text-muted-foreground text-xs'>
            Updating from your note
          </p>
          <ClampedText text={initialNote.text ?? ''} />
        </div>
      )}
      {initialRead && !isNoteClosed && (
        <div
          className='bg-accent mb-4 flex items-start gap-2 rounded-2xl p-3 text-sm'
          role='status'
        >
          <div className='min-w-0 flex-1 space-y-0.5'>
            <p>
              Filled in from {initialRead.label}. Take a look before you save.
            </p>
            {initialRead.recipe.unread.length > 0 && (
              <p className='text-muted-foreground text-xs'>
                We couldn&apos;t read: {initialRead.recipe.unread.join(', ')}.
              </p>
            )}
          </div>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Dismiss'
            className='-m-1 size-8 shrink-0'
            onClick={() => setIsNoteClosed(true)}
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      )}
      <Form
        id='pinch-recipe'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => {
          const next = data as RecipeFormData;
          setFormData(next);
          onTitleChange(next.title);
          isDirtyRef.current =
            initialRead !== null ||
            isDirtyRef.current === true ||
            JSON.stringify(next) !== JSON.stringify(initialData);
        }}
        onSubmit={(data) => {
          void handleSubmit(data as RecipeFormData);
        }}
        submitButton={
          <ModalFooterActions
            note={
              blocker?.target ? (
                <Button
                  type='button'
                  variant='tertiary'
                  className="text-muted-foreground! relative h-auto min-h-0 justify-start rounded-none p-0 px-0! py-0! text-left text-xs font-normal whitespace-normal before:absolute before:inset-x-0 before:-top-4 before:-bottom-2 before:content-['']"
                  onClick={() => showBlocker(blocker.target ?? '')}
                >
                  <span className='decoration-muted-foreground/50 underline underline-offset-4'>
                    {blocker.text}
                  </span>
                </Button>
              ) : (
                blocker?.text
              )
            }
            leftActions={
              recipe && (
                <DeleteIconButton
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                />
              )
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onLeave}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !isFormComplete}
              >
                {recipe ? 'Save' : 'Add'}
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </>
  );
}

export type { Recipe };
export default RecipeForm;
