import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import Field from '@/components/forms/Field';
import PhotoPicker from '@/components/forms/PhotoPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import Stepper from '@/components/Stepper';
import NutritionReview from '@apps/pinch/components/recipes/NutritionReview';
import RecipeIngredients from '@apps/pinch/components/recipes/RecipeIngredients';
import {
  getDataFromExtracted,
  getInitialData,
  isValidMinutes,
  isValidNutrition,
  parseMinutes,
  parseNutrition,
  type IngredientRow,
  type RecipeFormData,
} from '@apps/pinch/components/recipes/recipeFormModel';
import RecipeSteps from '@apps/pinch/components/recipes/RecipeSteps';
import {
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import {
  removeRecipe,
  saveRecipe,
} from '@apps/pinch/store/actions/recipeActions';
import { getUsage } from '@apps/pinch/store/actions/usageActions';
import {
  selectIngredients,
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { NutritionMetric, Recipe, RecipeSource } from '@apps/pinch/types';
import { getRecipeNutrition } from '@apps/pinch/utils/nutritionMath';
import { describeUsage, isInUse } from '@apps/pinch/utils/references';

const { custom, input } = FormFactories;

export interface RecipeRead {
  recipe: ExtractedRecipe;
  source: RecipeSource;
  label: string;
}

const isRowValid = (row: IngredientRow) => {
  const amount = Number(row.amount);
  return (
    row.ingredientId !== '' &&
    row.amount.trim() !== '' &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_SERVING_AMOUNT
  );
};

interface RecipeFormProps {
  uid: string;
  /** The recipe being changed; null writes a new one. */
  recipeId: string | null;
  /** What a reader found for a new recipe; the form opens filled in with it. */
  initialRead: RecipeRead | null;
  /** Keeps the screen's header on the recipe's name as it is typed. */
  onTitleChange: (title: string) => void;
}

function RecipeForm({
  uid,
  recipeId,
  initialRead,
  onTitleChange,
}: RecipeFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { closeSubview } = usePinchOverlay();
  const recipe = useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ingredients = useAppSelector(selectIngredients);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const existingCoverUrl = useStorageImageUrl(
    recipe?.coverPath ?? null,
    recipe?.updatedAt ?? 0,
  );
  const upload = useImageUpload(null);
  const { pick: pickCover, clear: clearCover, error: coverError } = upload;
  const [isCoverRemoved, setIsCoverRemoved] = useState(false);
  const [initialData] = useState(() =>
    initialRead
      ? getDataFromExtracted(initialRead.recipe, ingredients)
      : getInitialData(recipe),
  );
  const [formData, setFormData] = useState<RecipeFormData>(initialData);
  const [isNoteClosed, setIsNoteClosed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverUrl =
    upload.previewUrl ?? (isCoverRemoved ? null : existingCoverUrl);
  const prep = parseMinutes(formData.basics.prep);
  const cook = parseMinutes(formData.basics.cook);
  const isFormComplete =
    formData.title.trim() !== '' &&
    formData.title.length <= MAX_RECIPE_TITLE_LENGTH &&
    formData.ingredients.length >= 1 &&
    formData.ingredients.length <= MAX_RECIPE_INGREDIENTS &&
    formData.ingredients.every(isRowValid) &&
    formData.basics.servings > 0 &&
    isValidMinutes(prep) &&
    isValidMinutes(cook) &&
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
        ingredients: lines.map((row) => ({
          id: row.id,
          ingredientId: row.ingredientId,
          amount: Number(row.amount),
          unit: row.unit,
          note: null,
        })),
        steps: [],
        nutritionOverride: null,
        source: 'MANUAL',
        isArchived: false,
        createdAt: 0,
        updatedAt: 0,
      },
      ingredientsById,
    );

    return {
      values: result.values,
      leftOut: {
        count: new Set(result.missing.map((entry) => entry.ingredientId)).size,
        total: lines.length,
      },
    };
  }, [formData.ingredients, formData.basics.servings, ingredientsById]);

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Title',
        variant: 'outline',
        placeholder: 'Adobo chicken',
      }),
      custom({
        name: 'basics',
        label: '',
        renderComponent: (props) => {
          const basics = props.value as RecipeFormData['basics'];
          const set = (patch: Partial<RecipeFormData['basics']>) =>
            props.onValueChange({ ...basics, ...patch });
          return (
            <div
              className='grid grid-cols-2 gap-3'
              onKeyDown={blockEnterSubmit}
            >
              <div className='col-span-2 flex items-center justify-between gap-3'>
                <span className='text-sm font-medium'>Servings</span>
                <Stepper
                  label='Servings'
                  value={basics.servings}
                  onChange={(servings) => set({ servings })}
                />
              </div>
              <Field label='Prep (minutes)'>
                {(id) => (
                  <Input
                    id={id}
                    type='number'
                    inputMode='numeric'
                    min={0}
                    step={1}
                    variant='outline'
                    value={basics.prep}
                    onChange={(event) => set({ prep: event.target.value })}
                  />
                )}
              </Field>
              <Field label='Cook (minutes)'>
                {(id) => (
                  <Input
                    id={id}
                    type='number'
                    inputMode='numeric'
                    min={0}
                    step={1}
                    variant='outline'
                    value={basics.cook}
                    onChange={(event) => set({ cook: event.target.value })}
                  />
                )}
              </Field>
            </div>
          );
        },
      }),
      custom({
        name: 'cover',
        label: '',
        renderComponent: () => (
          <FormSection title='Photo'>
            <PhotoPicker
              photoUrl={coverUrl}
              initials='🍲'
              error={coverError}
              onSelect={(file) => {
                pickCover(file);
                setIsCoverRemoved(false);
              }}
              onRemove={() => {
                clearCover();
                setIsCoverRemoved(true);
              }}
            />
          </FormSection>
        ),
      }),
      custom({
        name: 'description',
        label: '',
        renderComponent: (props) => (
          <Field label='Description'>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                variant='outline'
                placeholder='A line about this dish'
                maxLength={MAX_RECIPE_DESCRIPTION_LENGTH}
                value={String(props.value)}
                onChange={(event) => props.onValueChange(event.target.value)}
              />
            )}
          </Field>
        ),
      }),
      custom({
        name: 'ingredients',
        label: '',
        renderComponent: (props) => (
          <FormSection
            title='Ingredients'
            detail={(props.value as IngredientRow[]).length}
          >
            <RecipeIngredients
              uid={uid}
              rows={props.value as IngredientRow[]}
              onChange={props.onValueChange}
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
            />
          </FormSection>
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
    ],
    [uid, coverUrl, coverError, pickCover, clearCover, calculation],
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
    const confirmed = await confirm({
      title: isUsed ? 'Remove recipe' : 'Delete recipe',
      message: isUsed
        ? `"${recipe.title}" is used in ${describeUsage(usage)}, so it will be taken off your lists, not erased. Everything that uses it keeps its name and numbers, but you can't bring it back to your lists.`
        : `Delete "${recipe.title}"? This action cannot be undone.`,
      confirmText: isUsed ? 'Remove' : 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeRecipe({ uid, id: recipe.id })).unwrap();
      closeSubview();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete this recipe.'));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (data: RecipeFormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        saveRecipe({
          uid,
          draft: {
            id: recipe?.id ?? null,
            title: data.title,
            description: data.description.trim() || null,
            servings: data.basics.servings,
            prepMinutes: parseMinutes(data.basics.prep),
            cookMinutes: parseMinutes(data.basics.cook),
            ingredients: data.ingredients.map((row) => ({
              id: row.id,
              ingredientId: row.ingredientId,
              amount: Number(row.amount),
              unit: row.unit,
              note: row.note,
            })),
            source: recipe ? recipe.source : (initialRead?.source ?? 'MANUAL'),
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
            steps: data.steps.map((step) => step.trim()).filter(Boolean),
            coverFile: upload.file,
            removeCover: isCoverRemoved,
          },
        }),
      ).unwrap();
      closeSubview();
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
        }}
        onSubmit={(data) => {
          void handleSubmit(data as RecipeFormData);
        }}
        submitButton={
          <ModalFooterActions
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
                onClick={closeSubview}
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
