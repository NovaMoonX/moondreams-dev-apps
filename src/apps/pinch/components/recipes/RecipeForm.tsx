import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  Button,
  Form,
  FormFactories,
  type FormCustomFieldProps,
} from '@moondreamsdev/dreamer-ui/components';
import AiChangeNotice from '@/components/AiChangeNotice';
import AppCheckbox from '@/components/AppCheckbox';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, Sparkles, X } from 'lucide-react';

import ClampedText from '@/components/ClampedText';
import ShowMoreButton from '@/components/ShowMoreButton';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  SUMMARY_GROUP_FRAME,
  type SummaryGroupPosition,
} from '@/components/summaryGroup';
import UndoSnackbar from '@/components/UndoSnackbar';
import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { normalizeName } from '@apps/pinch/utils/ingredientMatch';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatList } from '@/utils/formatUtils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import { canLoadImage } from '@/utils/imageUtils';
import Stepper from '@/components/Stepper';
import PepperDock from '@apps/pinch/components/recipes/PepperDock';
import AiChangeFinder from '@/components/AiChangeFinder';
import { useChangeFinder } from '@/hooks/useChangeFinder';
import NutritionReview from '@apps/pinch/components/recipes/NutritionReview';
import CategoryField from '@apps/pinch/components/shared/CategoryField';
import RecipeCareField from '@apps/pinch/components/recipes/RecipeCareField';
import RecipeCollectionsField from '@apps/pinch/components/recipes/RecipeCollectionsField';
import {
  RecipeDescriptionField,
  RecipeTimesField,
  RecipeTitleField,
} from '@apps/pinch/components/recipes/RecipeBasics';
import RecipeIngredients from '@apps/pinch/components/recipes/RecipeIngredients';
import RecipeLinksField from '@apps/pinch/components/recipes/RecipeLinksField';
import RecipePhotoField from '@apps/pinch/components/recipes/RecipePhotoField';
import RecipeSourceField from '@apps/pinch/components/recipes/RecipeSourceField';
import {
  adaptRows,
  getDataFromExtracted,
  getDataFromIdea,
  getInitialData,
  getReadSourceChoice,
  isRowAmountValid,
  isRowUnresolved,
  isValidMinutes,
  isValidNutrition,
  parseMinutes,
  parseNutrition,
  parseRecipeFormDraft,
  getRecipeDraftKey,
  settleNewIngredients,
  toRecipeLine,
  type IngredientRow,
  type RecipeFormData,
} from '@apps/pinch/components/recipes/recipeFormModel';
import RecipeSteps from '@apps/pinch/components/recipes/RecipeSteps';
import StepSectionsReview from '@apps/pinch/components/recipes/StepSectionsReview';
import ActionRow from '@/components/ActionRow';
import RecipeWhyStep from '@apps/pinch/components/recipes/RecipeWhyStep';
import {
  MAX_RECIPE_NOTE_LENGTH,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_TITLE_LENGTH,
  MIN_COVER_WIDTH,
  NUTRITION_METRICS,
  PHOTO_PROBE_TIMEOUT_MS,
  SECTION_COUNT_THRESHOLD,
} from '@apps/pinch/constants';
import { findSourceByLabel } from '@apps/pinch/utils/sources';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { announceRecipeAdded } from '@apps/pinch/hooks/useRecipeAdded';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import { reviseRecipe } from '@apps/pinch/lib/reviseRecipe';
import {
  removeRecipe,
  saveRecipe,
  type RecipeDraft,
} from '@apps/pinch/store/actions/recipeActions';
import { removeIngredient } from '@apps/pinch/store/actions/ingredientActions';
import { getUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectCollections,
  selectCookSummaries,
  selectIdeas,
  selectAllIngredients,
  selectIngredients,
  selectIngredientsById,
  selectCollectionsById,
  selectIsCollectionsReady,
  selectNotesByRecipe,
  selectPinchSettings,
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
  DishCategory,
  Idea,
  NutritionMetric,
  PinchUnitSettings,
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
import { getIdeaPhotoPaths } from '@apps/pinch/utils/ideas';
import { getIdeaExtras, type ReadExtras } from '@apps/pinch/utils/readExtras';
import { getJoinedChangeReason } from '@apps/pinch/utils/notes';
import {
  describePepperChange,
  getAllLiveMarks,
  getPepperReason,
} from '@apps/pinch/utils/pepperMarks';
import {
  applyRevision,
  toRevisionInput,
  type RevisionMarks,
} from '@apps/pinch/utils/pepperRevision';
import { getRecipeNutrition } from '@apps/pinch/utils/nutritionMath';
import {
  getDraftChanges,
  getWhyChoices,
  isWhyAsked,
} from '@apps/pinch/utils/recipeChanges';
import { readaptLine } from '@apps/pinch/utils/units';
import { getCareProblem, parseCareText } from '@apps/pinch/utils/recipeCare';
import { getShownCover } from '@apps/pinch/utils/recipeCover';
import {
  hasLinksProblem,
  isOverLinkCap,
  toRecipeLinks,
} from '@apps/pinch/utils/recipeLinks';
import { getFreedIngredientIds } from '@apps/pinch/utils/freeLines';
import { describeUsage, isInUse } from '@apps/pinch/utils/references';

const { custom } = FormFactories;

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export interface RecipeRead {
  recipe: ExtractedRecipe;
  source: RecipeSource;
  label: string;
  extras: ReadExtras;
}

const USAGE_READ_TIMEOUT_MS = 4000;

/** The first of the pictures a source offers that loads; they are tried in order so a missing large one falls back to the next. */
const findLoadablePhoto = (photos: WebPhoto[]) =>
  photos.reduce<Promise<WebPhoto | null>>(
    async (found, photo) =>
      (await found) ??
      ((await canLoadImage(
        photo.imageUrl,
        PHOTO_PROBE_TIMEOUT_MS,
        MIN_COVER_WIDTH,
      ))
        ? photo
        : null),
    Promise.resolve(null),
  );

const isRowValid = (row: IngredientRow) =>
  (row.freeText === null
    ? row.ingredientId !== ''
    : row.freeText.trim() !== '') && isRowAmountValid(row);

interface RecipeFormProps {
  uid: string;
  /** The recipe being changed; null writes a new one. */
  recipeId: string | null;
  /** What a reader found for a new recipe; the form opens filled in with it. */
  initialRead: RecipeRead | null;
  /** The idea a new recipe is made from: the form opens with what it knows, and saving marks it made. */
  initialIdea: Idea | null;
  /** The planned changes this edit applies: shown as quotes, and the tweak's reason starts as theirs. Saving turns the oldest into the tweak and takes the rest off, unless nothing changed. */
  initialChanges: RecipeNote[];
  /** Keeps the screen's header on the recipe's name as it is typed. */
  onTitleChange: (title: string) => void;
  /** Tells the screen whether leaving now would throw work away. */
  isDirtyRef: RefObject<boolean>;
  /** Holds a function that steps back inside the form (out of the question about why) and says whether it did, for the screen's own back to call first. */
  backStepRef: RefObject<(() => boolean) | null>;
  /** Opens with the Change with Pepper box focused. */
  autoFocusPepper?: boolean;
  /** Cancel and the screen's own back go through the screen, which asks before discarding. */
  onLeave: () => void;
  /** For a form shown inside another screen: runs after a save instead of closing the open subview, and the form offers no delete. */
  onSaved?: () => void;
}

// Adapting units or putting them back is not an edit, so it never asks why.
const withLinesAsWritten = (
  draft: RecipeDraft,
  recipe: Recipe,
  units: PinchUnitSettings,
): RecipeDraft => ({
  ...draft,
  ingredients: draft.ingredients.map((line) => {
    const before = recipe.ingredients.find((saved) => saved.id === line.id);
    if (before === undefined) return line;
    const adapted = readaptLine(before, units);
    const isAdaptedNow =
      adapted !== null &&
      line.amount === adapted.amount &&
      line.unit === adapted.unit;
    const isPutBackNow =
      before.adaptedFrom !== null &&
      line.adaptedFrom === null &&
      line.amount === before.adaptedFrom.amount &&
      line.unit === before.adaptedFrom.unit;
    return isAdaptedNow || isPutBackNow
      ? { ...line, amount: before.amount, unit: before.unit }
      : line;
  }),
});

const getRowName = (
  row: RecipeFormData['ingredients'][number],
  ingredientsById: Map<string, { name: string }>,
) =>
  row.freeText !== null
    ? row.freeText
    : (ingredientsById.get(row.ingredientId)?.name ??
      row.newName ??
      row.proposedName ??
      '');

function RecipeForm({
  uid,
  recipeId,
  initialRead,
  initialIdea,
  initialChanges,
  autoFocusPepper = false,
  onTitleChange,
  isDirtyRef,
  backStepRef,
  onLeave,
  onSaved,
}: RecipeFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { subview, closeSubviewIf, openSubviewFromToast } = usePinchOverlay();
  const recipe = useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ingredients = useAppSelector(selectIngredients);
  const allIngredients = useAppSelector(selectAllIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const sources = useAppSelector(selectSources);
  const sourcesById = useAppSelector(selectSourcesById);
  const collectionsById = useAppSelector(selectCollectionsById);
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
  const hasCooks = useAppSelector(
    (state) =>
      recipeId !== null &&
      (selectCookSummaries(state).get(recipeId)?.count ?? 0) > 0,
  );
  const existingCoverUrl = useStorageImageUrl(
    recipe?.coverPath ?? null,
    recipe?.updatedAt ?? 0,
  );
  const upload = useImageUpload(null, 'cover');
  const { pick: pickCover, clear: clearCover, error: coverError } = upload;
  const { units, voice: voiceSettings } = useAppSelector(selectPinchSettings);
  const formRootRef = useRef<HTMLDivElement>(null);
  const changeFinder = useChangeFinder(formRootRef, '.ai-changed');
  const [readStart] = useState(() => {
    if (!initialRead) return null;
    const read = getDataFromExtracted(
      initialRead.recipe,
      ingredients,
      initialRead.extras,
    );
    const adapted = adaptRows(read.ingredients, units);
    return { data: { ...read, ingredients: adapted.rows }, ids: adapted.ids };
  });
  const [adaptedIds, setAdaptedIds] = useState<string[]>(readStart?.ids ?? []);
  const [initialData] = useState(() =>
    initialRead && readStart
      ? {
          ...readStart.data,
          sourceChoice: getReadSourceChoice(
            initialRead.source,
            initialRead.label,
            sources,
          ),
        }
      : initialIdea
        ? getDataFromIdea(initialIdea, sources)
        : getInitialData(recipe, sourcesById, collections),
  );
  const draftBase = recipe?.updatedAt ?? null;
  const draftKey = getRecipeDraftKey(
    recipeId,
    initialRead !== null || initialIdea !== null || initialChanges.length > 0,
  );
  const draft = useFormDraft({
    key: draftKey,
    base: draftBase,
    parse: parseRecipeFormDraft,
  });
  const [isCoverRemoved, setIsCoverRemoved] = useState(
    draft.restored?.isCoverRemoved ?? false,
  );
  const [webCover, setWebCover] = useState<WebPhoto | null>(
    draft.restored?.webCover ?? null,
  );
  const [offeredPhotos] = useState(() =>
    initialRead
      ? initialRead.extras.photos
      : initialIdea
        ? getIdeaExtras(initialIdea).photos
        : [],
  );
  const [sourcePhoto, setSourcePhoto] = useState<WebPhoto | null>(null);
  const hasChosenCover = useRef(
    draft.restored !== null &&
      (draft.restored.webCover !== null || draft.restored.isCoverRemoved),
  );
  const [formStart, setFormStart] = useState<RecipeFormData>(() => {
    const restored = draft.restored?.formData;
    if (!restored) return initialData;
    const { choice } = restored.sourceChoice;
    const isSourceKnown =
      choice === '' || choice === NEW_CHOICE || sourcesById.has(choice);
    const ingredientIds = new Set(allIngredients.map(({ id }) => id));
    const collectionIds = new Set(collections.map(({ id }) => id));
    return {
      ...restored,
      sourceChoice: isSourceKnown
        ? restored.sourceChoice
        : { choice: '', newText: '' },
      ingredients: restored.ingredients.filter(
        (row) =>
          row.ingredientId === '' ||
          row.freeText !== null ||
          row.newName !== null ||
          ingredientIds.has(row.ingredientId),
      ),
      collections: {
        ...restored.collections,
        ids: restored.collections.ids.filter((id) => collectionIds.has(id)),
      },
    };
  });
  const [formData, setFormData] = useState<RecipeFormData>(formStart);
  const sectionsRef = useRef(formStart.stepSections);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const splitRef = useRef<Pick<Recipe, 'steps' | 'stepSections'> | null>(null);
  const [formKey, setFormKey] = useState(0);
  const isPepperOn =
    useIsGateOpen('pinch', 'pepper-edits') && recipeId !== null;
  const [pepper, setPepper] = useState<{
    rounds: {
      previousData: RecipeFormData;
      data: RecipeFormData;
      marks: RevisionMarks;
      reply: string;
      ask: string;
    }[];
    asks: string[];
    sent: number;
    unchangedReply: string | null;
  }>({ rounds: [], asks: [], sent: 0, unchangedReply: null });
  const latestData = useRef(formData);
  const isDraftDirty = useMemo(
    () =>
      webCover !== null ||
      isCoverRemoved ||
      JSON.stringify(formData) !== JSON.stringify(initialData),
    [formData, initialData, webCover, isCoverRemoved],
  );
  const draftValue = useMemo(
    () => ({ formData, webCover, isCoverRemoved }),
    [formData, webCover, isCoverRemoved],
  );
  useKeepFormDraft({
    isRestored: draft.restored !== null,
    key: getRecipeDraftKey(recipeId, false),
    base: draftBase,
    value: draftValue,
    isDirty: isDraftDirty,
  });
  const isRestored = draft.restored !== null;
  useEffect(() => {
    if (isRestored) isDirtyRef.current = true;
  }, [isRestored, isDirtyRef]);
  const startOver = () => {
    clearCover();
    setWebCover(null);
    setIsCoverRemoved(false);
    hasChosenCover.current = false;
    setFormStart(initialData);
    setFormData(initialData);
    latestData.current = initialData;
    sectionsRef.current = initialData.stepSections;
    splitRef.current = null;
    setFormKey((current) => current + 1);
    onTitleChange(initialData.title);
    isDirtyRef.current = false;
    draft.hideNotice();
    setPepper({ rounds: [], asks: [], sent: 0, unchangedReply: null });
    clearUndo();
  };
  const seedForm = (data: RecipeFormData) => {
    latestData.current = data;
    clearUndo();
    setFormStart(data);
    setFormData(data);
    sectionsRef.current = data.stepSections;
    splitRef.current = null;
    setFormKey((current) => current + 1);
    onTitleChange(data.title);
    isDirtyRef.current =
      webCover !== null ||
      isCoverRemoved ||
      JSON.stringify(data) !== JSON.stringify(initialData);
  };
  const [isNoteClosed, setIsNoteClosed] = useState(false);
  const [isAllChangesShown, setIsAllChangesShown] = useState(false);
  const [appliedIds, setAppliedIds] = useState(() =>
    initialChanges.map((change) => change.id),
  );
  const [typedWhy, setWhy] = useState<string | null>(null);
  const applied = initialChanges.filter((change) =>
    appliedIds.includes(change.id),
  );
  const pepperRound = pepper.rounds.at(-1) ?? null;
  const why =
    typedWhy ??
    ([
      getJoinedChangeReason(applied),
      getPepperReason(pepper.rounds.map((round) => round.ask)),
    ]
      .filter((part): part is string => part !== null)
      .join(' · ')
      .slice(0, MAX_RECIPE_NOTE_LENGTH) ||
      '');
  const liveMarks = useMemo(() => {
    const marks = getAllLiveMarks(pepper.rounds, formData);
    if (marks === null) return null;
    const present = new Set(
      formData.ingredients.map((row) =>
        normalizeName(getRowName(row, ingredientsById)),
      ),
    );
    return {
      ...marks,
      removedIngredientNames: marks.removedIngredientNames.filter(
        (name) => !present.has(normalizeName(name)),
      ),
    };
  }, [pepper.rounds, formData, ingredientsById]);
  const aiMarkedIds = useMemo(
    () =>
      liveMarks === null
        ? []
        : [...liveMarks.addedIngredientIds, ...liveMarks.changedIngredientIds],
    [liveMarks],
  );
  const [ask, setAsk] = useState<{
    data: RecipeFormData;
    changes: string[];
    choices: string[];
  } | null>(null);
  const { pending, showUndo, undo, clear: clearUndo } = useUndoRemoval();
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
        stepSections: [],
        care: null,
        links: [],
        nutritionOverride: null,
        source: 'MANUAL',
        sourceId: null,
        collectionIds: [],
        categories: [],
        isArchived: false,
        isFavorite: false,
        createdAt: 0,
        updatedAt: 0,
      },
      ingredientsById,
    );

    const unresolved = formData.ingredients.filter(isRowUnresolved).length;

    return {
      values: result.values,
      missing: result.missing,
      leftOut: {
        count:
          new Set(result.missing.map((entry) => entry.ingredientId)).size +
          unresolved,
        total:
          lines.filter((row) => !row.isAmountless && row.freeText === null)
            .length + unresolved,
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
    recipeId === null &&
    initialRead === null &&
    initialIdea === null &&
    draft.restored === null;
  const unresolvedCount = formData.ingredients.filter(isRowUnresolved).length;
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
        className: join(
          SUMMARY_GROUP_FRAME[position],
          ((row.name === 'sourceChoice' && liveMarks?.source) ||
            (row.name === 'collections' && liveMarks?.collections) ||
            (row.name === 'care' && liveMarks?.care)) &&
            'ai-changed',
        ),
        renderComponent: (props) => row.render(props, position),
      });
    });

    return [
      custom({
        name: 'title',
        label: '',
        renderComponent: (props) => (
          <div
            className={join(
              liveMarks?.title && 'ai-changed -mx-2 rounded-xl px-2',
            )}
            data-change-key='title'
          >
            <RecipeTitleField
              value={String(props.value)}
              onChange={props.onValueChange}
              defaultOpen={isBlankByHand}
            />
          </div>
        ),
      }),
      custom({
        name: 'categories',
        label: '',
        renderComponent: (props) => (
          <div
            className={join(
              liveMarks?.categories && 'ai-changed -mx-2 rounded-xl px-2',
            )}
            data-change-key='categories'
          >
            <CategoryField
              value={props.value as DishCategory[]}
              onChange={props.onValueChange}
            />
          </div>
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
              <div
                className={join(
                  'flex min-h-11 items-center justify-between gap-3',
                  liveMarks?.servings && 'ai-changed -mx-2 rounded-xl px-2',
                )}
                data-change-key='servings'
              >
                <span className='text-sm font-medium'>Servings</span>
                <Stepper
                  label='Servings'
                  value={basics.servings}
                  onChange={(servings) => set({ servings })}
                />
              </div>
              <div
                className={join(
                  liveMarks?.times && 'ai-changed -mx-2 rounded-xl px-2',
                )}
                data-change-key='times'
              >
                <RecipeTimesField
                  prep={basics.prep}
                  cook={basics.cook}
                  onChange={set}
                />
              </div>
            </div>
          );
        },
      }),
      custom({
        name: 'description',
        label: '',
        renderComponent: (props) => (
          <div
            className={join(
              liveMarks?.description && 'ai-changed -mx-2 rounded-xl px-2',
            )}
            data-change-key='description'
          >
            <RecipeDescriptionField
              value={String(props.value)}
              onChange={props.onValueChange}
            />
          </div>
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
            sourcePhoto={sourcePhoto}
            title={formData.title}
            searchWords={
              initialRead?.recipe.photoSearch &&
              formData.title === initialData.title
                ? initialRead.recipe.photoSearch
                : null
            }
            onSelect={(file) => {
              hasChosenCover.current = true;
              void pickCover(file);
              setIsCoverRemoved(false);
              isDirtyRef.current = true;
            }}
            onPickWeb={(photo) => {
              hasChosenCover.current = true;
              clearCover();
              setWebCover(photo);
              setIsCoverRemoved(false);
              isDirtyRef.current = true;
            }}
            onRemove={() => {
              hasChosenCover.current = true;
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
              adaptedIds={adaptedIds}
              onAdaptedIdsChange={setAdaptedIds}
              adaptUnits={recipe === null ? null : units}
              aiMarkedIds={aiMarkedIds}
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
              sections={formData.stepSections}
              onChange={(steps, stepSections) => {
                sectionsRef.current = stepSections;
                props.onValueChange(steps);
              }}
              onRemoved={showUndo}
              aiMarkedIndices={liveMarks?.changedStepIndices}
              footerAction={
                initialRead === null &&
                (props.value as string[]).filter((step) => step.trim()).length >
                  1 &&
                formData.stepSections.every((section) => section === null) && (
                  <ActionRow
                    icon={<Sparkles className='h-4 w-4' />}
                    label='Split into sections'
                    subtitle='An AI reads your steps; you see the result before anything changes'
                    onClick={() => setIsSplitOpen(true)}
                  />
                )
              }
            />
            {isSplitOpen && (
              <StepSectionsReview
                isOpen
                steps={(props.value as string[]).filter((step) => step.trim())}
                title={formData.title}
                onApply={(steps, stepSections) => {
                  splitRef.current = { steps, stepSections };
                  sectionsRef.current = stepSections;
                  props.onValueChange(steps);
                  setIsSplitOpen(false);
                }}
                onClose={() => setIsSplitOpen(false)}
              />
            )}
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
    initialData.title,
    uid,
    cover,
    sourcePhoto,
    recipe,
    formData.title,
    formData.stepSections,
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
    initialRead,
    showUndo,
    isSplitOpen,
    tracking,
    adaptedIds,
    units,
    liveMarks,
    aiMarkedIds,
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

  const getDraft = (
    data: RecipeFormData,
    reason: string,
    coverFile: File | null = upload.file,
  ): RecipeDraft => {
    const settled = settleNewIngredients(data.ingredients);
    const kept = data.steps
      .map((step, at) => ({
        step: step.trim(),
        section: data.stepSections[at] ?? null,
      }))
      .filter(({ step }) => step !== '');
    const { sourceId, newSource } = getSourceDraft(data.sourceChoice);
    const { collectionIds, newCollections } = ownsCollections
      ? getCollectionsToSave(data.collections, collections)
      : { collectionIds: null, newCollections: [] };
    return {
      id: recipe?.id ?? null,
      title: data.title,
      categories: data.categories,
      description: data.description.trim() || null,
      servings: data.basics.servings,
      prepMinutes: parseMinutes(data.basics.prep),
      cookMinutes: parseMinutes(data.basics.cook),
      ingredients: settled.rows.map(toRecipeLine),
      source: recipe ? recipe.source : (initialRead?.source ?? 'MANUAL'),
      sourceId,
      newSource,
      collectionChange:
        collectionIds === null
          ? null
          : getCollectionChange(initialData.collections.ids, collectionIds),
      newCollections,
      newIngredients: settled.newIngredients,
      nutritionOverride: parseNutrition(data.nutrition),
      care: parseCareText(data.care),
      links: toRecipeLinks(data.links),
      steps: kept.map(({ step }) => step),
      stepSections: kept.map(({ section }) => section),
      splitSteps: splitRef.current,
      coverFile,
      coverUrl: coverFile ? null : (webCover?.imageUrl ?? null),
      removeCover: isCoverRemoved,
      fromIdeaId: initialIdea?.id ?? null,
      tweakReason: reason,
      appliesChangeIds: applied.map((change) => change.id),
    };
  };

  const offerKitchenRemoval = async (ingredientId: string, savedId: string) => {
    const state = store.getState().pinch;
    const record = state.ingredients.records.find(
      (entry) => entry.id === ingredientId,
    );
    if (!record || record.catalogId !== null || !record.name) return;
    const usage = await Promise.race([
      dispatch(getUsage({ uid, kind: 'INGREDIENT', id: ingredientId }))
        .unwrap()
        .catch(() => null),
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), USAGE_READ_TIMEOUT_MS),
      ),
    ]);
    if (usage === null) return;
    const isUsedElsewhere =
      isInUse({
        ...usage,
        recipes: state.recipes.items.filter(
          (other) =>
            other.id !== savedId &&
            other.ingredients.some(
              (line) => line.ingredientId === ingredientId,
            ),
        ).length,
      }) ||
      state.packages.items.some((item) => item.ingredientId === ingredientId) ||
      state.shopping.items.some((item) => item.ingredientId === ingredientId);
    if (isUsedElsewhere) return;
    const isConfirmed = await confirm({
      title: `Also remove ${record.name} from your kitchen?`,
      message: `No other recipe uses ${record.name}, and it has no prices or stock. This recipe keeps the line as plain text.`,
      confirmText: 'Remove',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!isConfirmed) return;
    await dispatch(removeIngredient({ uid, id: ingredientId }))
      .unwrap()
      .catch((removeError) =>
        addToast({
          title: getErrorMessage(
            removeError,
            'Unable to remove this ingredient.',
          ),
          type: 'error',
        }),
      );
  };

  const save = async (data: RecipeFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const draft = getDraft(data, why, await upload.readyFile());
      const { recipeId: savedId } = await dispatch(
        saveRecipe({ uid, draft }),
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
      if (onSaved) onSaved();
      else closeSubviewIf((current) => current === subview);
      if (recipe) {
        void getFreedIngredientIds(recipe.ingredients, draft.ingredients)
          .reduce(
            (done, ingredientId) =>
              done.then(() => offerKitchenRemoval(ingredientId, savedId)),
            Promise.resolve(),
          )
          .catch(() => undefined);
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this recipe.'));
      setIsSubmitting(false);
    }
  };

  const sendToPepper = async (askText: string) => {
    const context = { sources, collections };
    const { input, refMap } = toRevisionInput(
      latestData.current,
      ingredientsById,
      context,
      { ask: askText, earlierAsks: pepper.asks },
    );
    const before = latestData.current;
    const revision = await reviseRecipe(input);
    if (JSON.stringify(latestData.current) !== JSON.stringify(before)) {
      setPepper((current) => ({
        ...current,
        unchangedReply:
          'You changed the recipe while Pepper was working, so nothing was changed. Ask again.',
      }));
      return;
    }
    const { data, marks } = applyRevision(
      before,
      revision,
      refMap,
      ingredients,
      context,
    );
    if (!revision.isChanged || marks.isEmpty) {
      setPepper((current) => ({
        ...current,
        asks: [...current.asks, askText],
        sent: current.sent + 1,
        unchangedReply: revision.reply,
      }));
      return;
    }
    changeFinder.goFirstOnNextChange();
    seedForm(data);
    setPepper((current) => ({
      rounds: [
        ...current.rounds,
        {
          previousData: before,
          data,
          marks,
          reply: revision.reply,
          ask: askText,
        },
      ],
      asks: [...current.asks, askText],
      sent: current.sent + 1,
      unchangedReply: null,
    }));
  };

  const getPepperSummary = () => {
    if (liveMarks === null) return '';
    if (liveMarks.isEmpty && liveMarks.removedIngredientNames.length === 0) {
      return 'changed the recipe';
    }
    const markedIds = [
      ...liveMarks.addedIngredientIds,
      ...liveMarks.changedIngredientIds,
    ];
    const names = formData.ingredients
      .filter((row) => markedIds.includes(row.id))
      .map((row) => getRowName(row, ingredientsById))
      .filter((name) => name !== '');
    const summary = describePepperChange(liveMarks, names);
    return pepper.rounds.length > 1
      ? `${summary} over ${pepper.rounds.length} asks`
      : summary;
  };

  const undoPepper = async () => {
    if (pepperRound === null) return;
    const round = pepperRound;
    if (JSON.stringify(latestData.current) !== JSON.stringify(round.data)) {
      const isConfirmed = await confirm({
        title: "Undo Pepper's change?",
        message:
          "You've edited the recipe since. Undoing puts it back as it was before Pepper's change, so those edits go too.",
        confirmText: 'Undo both',
        cancelText: 'Keep it',
        destructive: true,
      });
      if (!isConfirmed || pepper.rounds.at(-1) !== round) return;
    }
    seedForm(round.previousData);
    setPepper((current) => ({
      ...current,
      rounds: current.rounds.slice(0, -1),
      asks: current.asks.filter(
        (_, at) => at !== current.asks.lastIndexOf(round.ask),
      ),
      unchangedReply: null,
    }));
  };

  const handleSubmit = async (data: RecipeFormData) => {
    const hasReason = applied.length > 0 && why.trim() !== '';
    if (
      recipe &&
      ((tracking === 'on' && hasCooks) || applied.length > 0) &&
      !hasReason
    ) {
      const { changes, topics } = getDraftChanges(
        recipe,
        withLinesAsWritten(getDraft(data, ''), recipe, units),
        ingredientsById,
        sourcesById,
        collectionsById,
      );
      if (changes.length > 0 && isWhyAsked(topics)) {
        setAsk({ data, changes, choices: getWhyChoices(topics) });
        return;
      }
    }
    await save(data);
  };

  useEffect(() => {
    let isCurrent = true;
    void findLoadablePhoto(offeredPhotos).then((photo) => {
      if (!isCurrent || photo === null) return;
      setSourcePhoto(photo);
      if (!hasChosenCover.current) setWebCover(photo);
    });
    return () => {
      isCurrent = false;
    };
  }, [offeredPhotos]);

  useEffect(() => {
    backStepRef.current =
      ask === null
        ? null
        : () => {
            setAsk(null);
            return true;
          };
    return () => {
      backStepRef.current = null;
    };
  }, [ask, backStepRef]);

  const pepperDock = isPepperOn && ask === null && (
    <PepperDock
      rounds={pepper.sent}
      isStartFocused={autoFocusPepper && pepper.sent === 0}
      look={voiceSettings.look}
      onSend={sendToPepper}
      above={
        <>
          {pepperRound !== null && (
            <AiChangeNotice
              who='Pepper'
              summary={getPepperSummary()}
              reply={pepperRound.reply}
              removed={liveMarks?.removedIngredientNames ?? []}
              undoLabel={pepper.rounds.length > 1 ? 'Undo last' : 'Undo'}
              onUndo={() => void undoPepper()}
              footer={<AiChangeFinder finder={changeFinder} />}
              isCompact
            />
          )}
          {pepper.unchangedReply !== null && (
            <AiChangeNotice
              who='Pepper'
              summary=''
              reply={pepper.unchangedReply}
              removed={[]}
              isCompact
            />
          )}
        </>
      }
    />
  );

  if (recipeId !== null && !recipe) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        This recipe is gone.
      </p>
    );
  }

  return (
    <div ref={formRootRef}>
      {draft.isNoticeShown && (
        <div className='mb-4'>
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={draft.hideNotice}
          />
        </div>
      )}
      <UndoSnackbar pending={pending} onUndo={undo} />
      {initialIdea?.kind === 'PHOTO' && (
        <p className='text-muted-foreground mb-4 text-sm'>
          {getIdeaPhotoPaths(initialIdea).length > 1
            ? 'Its photos stay with the idea.'
            : 'Its photo stays with the idea.'}
        </p>
      )}
      {initialChanges.length > 0 && (
        <div className='bg-accent border-border mb-4 space-y-2 rounded-2xl border p-3 text-sm'>
          <p className='text-muted-foreground text-xs'>
            {initialChanges.length === 1
              ? 'Applying the change you planned'
              : `Applying the ${initialChanges.length} changes you planned. Untick one this edit doesn't make, and it stays planned.`}
          </p>
          <ul className='space-y-2'>
            {(isAllChangesShown
              ? initialChanges
              : initialChanges.slice(0, 3)
            ).map((change) => (
              <li key={change.id} className='flex items-start gap-3'>
                {initialChanges.length > 3 && (
                  <AppCheckbox
                    aria-label={`Apply: ${change.text ?? ''}`}
                    checked={appliedIds.includes(change.id)}
                    onCheckedChange={(checked) =>
                      setAppliedIds((current) =>
                        checked === true
                          ? [...current, change.id]
                          : current.filter((id) => id !== change.id),
                      )
                    }
                  />
                )}
                <span className='min-w-0 flex-1 space-y-0.5'>
                  <ClampedText text={change.text ?? ''} />
                  {(change.reason ?? '') !== '' && (
                    <span className='text-muted-foreground block text-xs'>
                      Why: {change.reason}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {initialChanges.length > 3 && (
            <ShowMoreButton
              isOpen={isAllChangesShown}
              onClick={() => setIsAllChangesShown((shown) => !shown)}
            >
              {isAllChangesShown
                ? 'Show fewer'
                : `and ${initialChanges.length - 3} more`}
            </ShowMoreButton>
          )}
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
            {initialRead.recipe.isServingsEstimate &&
              initialRead.recipe.servings !== null && (
                <p className='text-muted-foreground text-xs'>
                  The recipe didn&apos;t say how many it serves, so we guessed{' '}
                  {initialRead.recipe.servings} from the amounts.
                </p>
              )}
            {initialRead.recipe.unread.length > 0 && (
              <p className='text-muted-foreground text-xs'>
                We couldn&apos;t read: {initialRead.recipe.unread.join(', ')}.
              </p>
            )}
            {initialRead.recipe.guided.length > 0 && (
              <p className='text-muted-foreground text-xs'>
                Followed your guidance: {formatList(initialRead.recipe.guided)}.
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
        key={formKey}
        id='pinch-recipe'
        className={join(ask !== null && 'hidden!')}
        form={fields}
        initialData={formStart}
        columns={1}
        onDataChange={(data) => {
          const next = {
            ...(data as RecipeFormData),
            stepSections: sectionsRef.current,
          };
          latestData.current = next;
          setFormData(next);
          setError(null);
          onTitleChange(next.title);
          isDirtyRef.current =
            initialRead !== null ||
            isDirtyRef.current === true ||
            JSON.stringify(next) !== JSON.stringify(initialData);
        }}
        onSubmit={(data) => {
          void handleSubmit({
            ...(data as RecipeFormData),
            stepSections: sectionsRef.current,
          });
        }}
        submitButton={
          <ModalFooterActions
            top={pepperDock}
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
              recipe &&
              !onSaved && (
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
      {ask !== null && (
        <RecipeWhyStep
          changes={ask.changes}
          choices={ask.choices}
          value={why}
          onChange={setWhy}
          onSave={() => void save(ask.data)}
          isSubmitting={isSubmitting}
          error={error}
        />
      )}
    </div>
  );
}

export type { Recipe };
export default RecipeForm;
