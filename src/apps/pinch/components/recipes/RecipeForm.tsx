import { useMemo, useState, type ReactNode, type RefObject } from 'react';

import {
  Button,
  Form,
  FormFactories,
  type FormCustomFieldProps,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ArrowUp, X } from 'lucide-react';

import ClampedText from '@/components/ClampedText';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  SUMMARY_GROUP_FRAME,
  type SummaryGroupPosition,
} from '@/components/summaryGroup';
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
import RecipeCollectionsField from '@apps/pinch/components/recipes/RecipeCollectionsField';
import {
  RecipeDescriptionField,
  RecipeTimesField,
  RecipeTitleField,
  RecipeWhyField,
} from '@apps/pinch/components/recipes/RecipeBasics';
import RecipeIngredients from '@apps/pinch/components/recipes/RecipeIngredients';
import RecipeLinksField from '@apps/pinch/components/recipes/RecipeLinksField';
import RecipePhotoField from '@apps/pinch/components/recipes/RecipePhotoField';
import RecipeSourceField from '@apps/pinch/components/recipes/RecipeSourceField';
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
  MAX_RECIPE_TITLE_LENGTH,
  NUTRITION_METRICS,
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
  selectCollections,
  selectCookSummaries,
  selectIdeas,
  selectIngredients,
  selectIngredientsById,
  selectIsCollectionsReady,
  selectNotesByRecipe,
  selectRecipesById,
  selectShareBySource,
  selectShowNutrition,
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
  WebPhoto,
} from '@apps/pinch/types';
import {
  getCollectionChange,
  getCollectionsToSave,
  getSuggestedCollections,
  getTrustedProtein,
  type CollectionsChoice,
} from '@apps/pinch/utils/collections';
import { getCellDayKey } from '@apps/pinch/utils/dayKeys';
import { toTypedIngredientName } from '@apps/pinch/utils/ingredientNames';
import { getRecipeNutrition } from '@apps/pinch/utils/nutritionMath';
import { getCareProblem, parseCareText } from '@apps/pinch/utils/recipeCare';
import { getShownCover } from '@apps/pinch/utils/recipeCover';
import {
  hasLinksProblem,
  isOverLinkCap,
  toRecipeLinks,
} from '@apps/pinch/utils/recipeLinks';
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
  const showNutrition = useAppSelector(selectShowNutrition);
  const isNutritionShown = NUTRITION_METRICS.some(
    (metric) => showNutrition[metric],
  );
  const hasSourcesFailed = useAppSelector(selectSourcesLoadError) !== null;
  const collections = useAppSelector(selectCollections);
  const isCollectionsReady = useAppSelector(selectIsCollectionsReady);
  const [ownsCollections] = useState(isCollectionsReady);
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
  const [webCover, setWebCover] = useState<WebPhoto | null>(null);
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
            ...getInitialData(recipe, sourcesById, collections),
            why: initialNote?.text ?? '',
          },
  );
  const [formData, setFormData] = useState<RecipeFormData>(initialData);
  const [isNoteClosed, setIsNoteClosed] = useState(false);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cover = getShownCover({
    uploadUrl: upload.previewUrl,
    web: webCover,
    isRemoved: isCoverRemoved,
    savedWebUrl: recipe?.coverUrl ?? null,
    storageUrl: existingCoverUrl,
  });
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
    !hasLinksProblem(formData.links) &&
    !isOverLinkCap(formData.links) &&
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
        coverUrl: null,
        ingredients: lines.map(toRecipeLine),
        steps: [],
        care: null,
        links: [],
        nutritionOverride: null,
        source: 'MANUAL',
        sourceId: null,
        collectionIds: [],
        isArchived: false,
        isFavorite: false,
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
      missing: result.missing,
      leftOut: {
        count:
          new Set(result.missing.map((entry) => entry.ingredientId)).size +
          unresolved,
        total: lines.filter((row) => !row.isAmountless).length + unresolved,
      },
    };
  }, [formData.ingredients, formData.basics.servings, ingredientsById]);

  const typedNutrition = isValidNutrition(formData.nutrition)
    ? parseNutrition(formData.nutrition)
    : null;
  const protein =
    typedNutrition?.protein != null ||
    (formData.ingredients.length > 0 && formData.ingredients.every(isRowValid))
      ? getTrustedProtein(calculation, typedNutrition)
      : null;
  const freezerDays = parseCareText(formData.care)?.freezerDays ?? null;
  const suggestions = useMemo(
    () =>
      getSuggestedCollections(
        {
          protein,
          prepMinutes: isValidMinutes(prep) ? prep : null,
          cookMinutes: isValidMinutes(cook) ? cook : null,
          freezerDays,
        },
        [...collections, ...formData.collections.added],
        formData.collections.ids,
      ),
    [protein, prep, cook, freezerDays, collections, formData.collections],
  );

  const isBlankByHand =
    recipeId === null && initialRead === null && initialIdea === null;
  const unresolvedCount = formData.ingredients.filter(
    (row) => row.ingredientId === '',
  ).length;
  const getBlocker = (): { text: string; target: string | null } | null => {
    const plain = (text: string) => ({ text, target: null });
    if (
      !recipe &&
      formData.title.trim() === '' &&
      formData.ingredients.length === 0
    ) {
      return plain('Add a title and an ingredient to save.');
    }
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
        text: `Choose ${unresolvedCount === 1 ? 'the ingredient' : `the ${unresolvedCount} ingredients`} marked “Choose” to save.`,
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
    if (hasLinksProblem(formData.links)) {
      return plain(
        'Fix or take out the link that is not a web address to save.',
      );
    }
    if (isOverLinkCap(formData.links)) {
      return plain('Take a link out to save: a recipe holds up to 8.');
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

  const fields = useMemo(() => {
    const groupRows: {
      name: string;
      render: (
        props: FormCustomFieldProps,
        position: SummaryGroupPosition,
      ) => ReactNode;
    }[] = [
      ...(hasSourcesFailed
        ? []
        : [
            {
              name: 'sourceChoice',
              render: (
                props: FormCustomFieldProps,
                position: SummaryGroupPosition,
              ) => (
                <RecipeSourceField
                  value={props.value as RecipeFormData['sourceChoice']}
                  options={sourceOptions}
                  onChange={props.onValueChange}
                  position={position}
                />
              ),
            },
          ]),
      ...(ownsCollections
        ? [
            {
              name: 'collections',
              render: (
                props: FormCustomFieldProps,
                position: SummaryGroupPosition,
              ) => (
                <RecipeCollectionsField
                  value={props.value as CollectionsChoice}
                  onChange={props.onValueChange}
                  collections={collections}
                  suggestions={suggestions}
                  position={position}
                />
              ),
            },
          ]
        : []),
      {
        name: 'care',
        render: (props, position) => (
          <RecipeCareField
            value={props.value as RecipeFormData['care']}
            onChange={props.onValueChange}
            position={position}
          />
        ),
      },
      {
        name: 'links',
        render: (props, position) => (
          <RecipeLinksField
            value={props.value as RecipeFormData['links']}
            onChange={props.onValueChange}
            position={position}
          />
        ),
      },
      ...(tracking === 'on'
        ? [
            {
              name: 'why',
              render: (
                props: FormCustomFieldProps,
                position: SummaryGroupPosition,
              ) => (
                <RecipeWhyField
                  value={String(props.value)}
                  onChange={props.onValueChange}
                  position={position}
                />
              ),
            },
          ]
        : []),
    ];
    const getPosition = (index: number): SummaryGroupPosition => {
      if (groupRows.length === 1) return 'only';
      if (index === 0) return 'first';
      return index === groupRows.length - 1 ? 'last' : 'middle';
    };
    const groupFields = groupRows.map((row, index) => {
      const position = getPosition(index);
      return custom({
        name: row.name,
        label: '',
        className: SUMMARY_GROUP_FRAME[position],
        renderComponent: (props) => row.render(props, position),
      });
    });

    return [
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
          <RecipePhotoField
            uid={uid}
            cover={cover}
            error={coverError}
            canSuggest={recipe === null}
            title={formData.title}
            onSelect={(file) => {
              pickCover(file);
              setIsCoverRemoved(false);
              isDirtyRef.current = true;
            }}
            onPickWeb={(photo) => {
              clearCover();
              setWebCover(photo);
              setIsCoverRemoved(false);
              isDirtyRef.current = true;
            }}
            onRemove={() => {
              clearCover();
              setWebCover(null);
              setIsCoverRemoved(true);
              isDirtyRef.current = true;
            }}
          />
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
      ...(isNutritionShown
        ? [
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
          ]
        : []),
      ...groupFields,
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
    ];
  }, [
    uid,
    cover,
    recipe,
    formData.title,
    coverError,
    pickCover,
    clearCover,
    calculation,
    isDirtyRef,
    hasSourcesFailed,
    isNutritionShown,
    sourceOptions,
    ownsCollections,
    collections,
    suggestions,
    isBlankByHand,
    showUndo,
    tracking,
  ]);

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
    const getShareLine = () => {
      if (selectShareBySource('RECIPE', recipe.id)(state) === null) return '';
      return isUsed
        ? ' Its shared link keeps working until you stop sharing it, under Settings, Shared links.'
        : " It's shared, so its link stops working too.";
    };
    const confirmed = await confirm({
      title: isUsed ? 'Remove recipe' : 'Delete recipe',
      message: isUsed
        ? `“${recipe.title}” is used in ${describeUsage(usage)}, so it will be taken off your lists, not erased. Everything that uses it keeps its name and numbers.${ideaLine}${getShareLine()}`
        : `Delete “${recipe.title}”?${getHistoryLine()}${ideaLine}${getShareLine()} This can't be undone.`,
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
      const { collectionIds, newCollections } = ownsCollections
        ? getCollectionsToSave(data.collections, collections)
        : { collectionIds: null, newCollections: [] };
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
            collectionChange:
              collectionIds === null
                ? null
                : getCollectionChange(
                    initialData.collections.ids,
                    collectionIds,
                  ),
            newCollections,
            newIngredients: [
              ...new Map(
                data.ingredients
                  .filter((row) => row.newName !== null)
                  .map((row) => [
                    row.ingredientId,
                    {
                      id: row.ingredientId,
                      name: toTypedIngredientName(row.newName ?? ''),
                    },
                  ]),
              ).values(),
            ],
            nutritionOverride: parseNutrition(data.nutrition),
            care: parseCareText(data.care),
            links: toRecipeLinks(data.links),
            steps: data.steps.map((step) => step.trim()).filter(Boolean),
            coverFile: upload.file,
            coverUrl: upload.file ? null : (webCover?.imageUrl ?? null),
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
          setError(null);
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
              error ? (
                <span className='text-destructive'>{error}</span>
              ) : blocker?.target ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  rounded='full'
                  className="text-foreground! relative h-auto min-h-7 gap-1.5 px-3 py-1 text-xs font-normal before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                  onClick={() => showBlocker(blocker.target ?? '')}
                >
                  <ArrowUp className='h-3.5 w-3.5' aria-hidden='true' />
                  {blocker.text}
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
    </>
  );
}

export type { Recipe };
export default RecipeForm;
