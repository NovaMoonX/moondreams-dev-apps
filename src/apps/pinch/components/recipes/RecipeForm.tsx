import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Clock,
  FileText,
  ListOrdered,
  Plus,
  Trash2,
  X,
  Image as ImageIcon,
} from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import PhotoPicker from '@/components/forms/PhotoPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import ServingStepper from '@apps/pinch/components/plan/ServingStepper';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  DEFAULT_SERVING,
  MAX_MINUTES,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_STEP_LENGTH,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import {
  removeRecipe,
  saveRecipe,
} from '@apps/pinch/store/actions/recipeActions';
import {
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Recipe, Unit } from '@apps/pinch/types';

const { custom, input } = FormFactories;

interface IngredientRow {
  id: string;
  ingredientId: string;
  amount: string;
  unit: Unit;
}

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface Extras {
  steps: Reveal<string[]>;
  description: Reveal<string>;
  times: Reveal<{ prep: string; cook: string }>;
  cover: Reveal<null>;
}

interface FormData {
  title: string;
  servings: number;
  ingredients: IngredientRow[];
  extras: Extras;
}

const getInitialData = (recipe: Recipe | null): FormData => ({
  title: recipe?.title ?? '',
  servings: recipe?.servings ?? 4,
  ingredients: (recipe?.ingredients ?? []).map((line) => ({
    id: line.id,
    ingredientId: line.ingredientId,
    amount: String(line.amount),
    unit: line.unit,
  })),
  extras: {
    steps: {
      enabled: (recipe?.steps.length ?? 0) > 0,
      value: recipe?.steps ?? [''],
    },
    description: {
      enabled: recipe?.description != null,
      value: recipe?.description ?? '',
    },
    times: {
      enabled: recipe?.prepMinutes != null || recipe?.cookMinutes != null,
      value: {
        prep: recipe?.prepMinutes != null ? String(recipe.prepMinutes) : '',
        cook: recipe?.cookMinutes != null ? String(recipe.cookMinutes) : '',
      },
    },
    cover: { enabled: recipe?.coverPath != null, value: null },
  },
});

const parseMinutes = (text: string) =>
  text.trim() === '' ? null : Number(text);
const isValidMinutes = (value: number | null) =>
  value === null ||
  (Number.isInteger(value) && value >= 0 && value <= MAX_MINUTES);

interface IngredientRowsProps {
  uid: string;
  rows: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
}

function IngredientRows({ uid, rows, onChange }: IngredientRowsProps) {
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [isAdding, setIsAdding] = useState(rows.length === 0);

  const addRow = (ingredientId: string) => {
    const serving =
      ingredientsById.get(ingredientId)?.serving ?? DEFAULT_SERVING;
    onChange([
      ...rows,
      {
        id: generateUuid(),
        ingredientId,
        amount: String(serving.amount),
        unit: serving.unit,
      },
    ]);
    setIsAdding(false);
  };

  return (
    <div className='space-y-3'>
      {rows.length > 0 && (
        <ul className='divide-border divide-y'>
          {rows.map((row) => {
            const ingredient = ingredientsById.get(row.ingredientId);
            const update = (patch: Partial<IngredientRow>) =>
              onChange(
                rows.map((candidate) =>
                  candidate.id === row.id
                    ? { ...candidate, ...patch }
                    : candidate,
                ),
              );
            return (
              <li key={row.id} className='space-y-2 py-3'>
                <div className='flex items-center gap-3'>
                  <IngredientIcon
                    iconKey={ingredient?.iconKey ?? null}
                    size={28}
                  />
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    {ingredient?.name ?? 'Removed ingredient'}
                  </span>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={`Remove ${ingredient?.name ?? 'ingredient'}`}
                    className='size-10 shrink-0'
                    onClick={() =>
                      onChange(
                        rows.filter((candidate) => candidate.id !== row.id),
                      )
                    }
                  >
                    <X className='h-4 w-4' aria-hidden='true' />
                  </Button>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <Input
                    type='number'
                    inputMode='decimal'
                    min={0}
                    step='any'
                    variant='outline'
                    aria-label={`Amount of ${ingredient?.name ?? 'ingredient'}`}
                    value={row.amount}
                    onChange={(event) => update({ amount: event.target.value })}
                  />
                  <UnitSelect
                    value={row.unit}
                    onChange={(unit) => update({ unit })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {isAdding ? (
        <ItemSearch
          uid={uid}
          onPick={addRow}
          excludeIds={rows.map((row) => row.ingredientId)}
          autoFocus={rows.length > 0}
        />
      ) : (
        rows.length < MAX_RECIPE_INGREDIENTS && (
          <Button
            type='button'
            variant='secondary'
            rounded='full'
            className='gap-1.5'
            onClick={() => setIsAdding(true)}
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add ingredient
          </Button>
        )
      )}
      {rows.length >= MAX_RECIPE_INGREDIENTS && (
        <p className='text-muted-foreground text-sm'>
          A recipe holds up to {MAX_RECIPE_INGREDIENTS} ingredients.
        </p>
      )}
    </div>
  );
}

interface ExtrasFieldsProps {
  extras: Extras;
  onChange: (extras: Extras) => void;
  cover: {
    previewUrl: string | null;
    error: string | null;
    onSelect: (file: File | null) => void;
    onRemove: () => void;
  };
}

function ExtrasFields({ extras, onChange, cover }: ExtrasFieldsProps) {
  const chips = [
    { key: 'steps', label: 'Steps', icon: <ListOrdered className='h-4 w-4' /> },
    {
      key: 'description',
      label: 'Description',
      icon: <FileText className='h-4 w-4' />,
    },
    { key: 'times', label: 'Times', icon: <Clock className='h-4 w-4' /> },
    {
      key: 'cover',
      label: 'Cover photo',
      icon: <ImageIcon className='h-4 w-4' />,
    },
  ].filter((chip) => !extras[chip.key as keyof Extras].enabled);

  const steps = extras.steps.value;
  const setSteps = (next: string[]) =>
    onChange({ ...extras, steps: { enabled: true, value: next } });

  return (
    <div className='space-y-4'>
      {extras.steps.enabled && (
        <RemovableField
          label='Steps'
          removeLabel='Remove steps'
          onRemove={() =>
            onChange({ ...extras, steps: { enabled: false, value: [''] } })
          }
        >
          <div className='space-y-2'>
            {steps.map((step, index) => (
              <div key={index} className='flex items-start gap-2'>
                <span className='bg-secondary text-secondary-foreground mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                  {index + 1}
                </span>
                <Textarea
                  rows={2}
                  variant='outline'
                  aria-label={`Step ${index + 1}`}
                  maxLength={MAX_STEP_LENGTH}
                  value={step}
                  onChange={(event) =>
                    setSteps(
                      steps.map((current, at) =>
                        at === index ? event.target.value : current,
                      ),
                    )
                  }
                />
                {steps.length > 1 && (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={`Remove step ${index + 1}`}
                    className='size-10 shrink-0'
                    onClick={() =>
                      setSteps(steps.filter((_, at) => at !== index))
                    }
                  >
                    <Trash2 className='h-4 w-4' aria-hidden='true' />
                  </Button>
                )}
              </div>
            ))}
            {steps.length < MAX_RECIPE_STEPS && (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='h-10 gap-1.5 px-0!'
                onClick={() => setSteps([...steps, ''])}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add a step
              </Button>
            )}
          </div>
        </RemovableField>
      )}
      {extras.description.enabled && (
        <RemovableField
          label='Description'
          removeLabel='Remove description'
          onRemove={() =>
            onChange({ ...extras, description: { enabled: false, value: '' } })
          }
        >
          <Textarea
            rows={3}
            variant='outline'
            value={extras.description.value}
            onChange={(event) =>
              onChange({
                ...extras,
                description: { enabled: true, value: event.target.value },
              })
            }
          />
        </RemovableField>
      )}
      {extras.times.enabled && (
        <RemovableField
          label='Times'
          removeLabel='Remove times'
          onRemove={() =>
            onChange({
              ...extras,
              times: { enabled: false, value: { prep: '', cook: '' } },
            })
          }
        >
          <div className='grid grid-cols-2 gap-3'>
            {(['prep', 'cook'] as const).map((kind) => (
              <div key={kind} className='space-y-1.5'>
                <Label>
                  {kind === 'prep' ? 'Prep (minutes)' : 'Cook (minutes)'}
                </Label>
                <Input
                  type='number'
                  inputMode='numeric'
                  min={0}
                  step={1}
                  variant='outline'
                  aria-label={kind === 'prep' ? 'Prep minutes' : 'Cook minutes'}
                  value={extras.times.value[kind]}
                  onChange={(event) =>
                    onChange({
                      ...extras,
                      times: {
                        enabled: true,
                        value: {
                          ...extras.times.value,
                          [kind]: event.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </RemovableField>
      )}
      {extras.cover.enabled && (
        <RemovableField
          label='Cover photo'
          removeLabel='Remove cover photo'
          onRemove={() => {
            cover.onRemove();
            onChange({ ...extras, cover: { enabled: false, value: null } });
          }}
        >
          <PhotoPicker
            photoUrl={cover.previewUrl}
            initials='🍲'
            error={cover.error}
            onSelect={cover.onSelect}
            onRemove={cover.onRemove}
          />
        </RemovableField>
      )}
      <AddFieldChips
        chips={chips}
        onAdd={(key) =>
          onChange({
            ...extras,
            [key]: { ...extras[key as keyof Extras], enabled: true },
          })
        }
      />
    </div>
  );
}

interface RecipeFormProps {
  uid: string;
  /** The recipe being changed; null writes a new one. */
  recipeId: string | null;
}

function RecipeForm({ uid, recipeId }: RecipeFormProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { closeSubview } = usePinchOverlay();
  const recipe = useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const existingCoverUrl = useStorageImageUrl(
    recipe?.coverPath ?? null,
    recipe?.updatedAt ?? 0,
  );
  const upload = useImageUpload(null);
  const { pick: pickCover, clear: clearCover, error: coverError } = upload;
  const [isCoverRemoved, setIsCoverRemoved] = useState(false);
  const initialData = useMemo(() => getInitialData(recipe), [recipe]);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverUrl =
    upload.previewUrl ?? (isCoverRemoved ? null : existingCoverUrl);
  const { extras } = formData;
  const prep = parseMinutes(extras.times.value.prep);
  const cook = parseMinutes(extras.times.value.cook);
  const rowsValid = formData.ingredients.every((row) => {
    const amount = Number(row.amount);
    return (
      row.amount.trim() !== '' &&
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= MAX_SERVING_AMOUNT
    );
  });
  const isFormComplete =
    formData.title.trim() !== '' &&
    formData.title.length <= MAX_RECIPE_TITLE_LENGTH &&
    formData.ingredients.length >= 1 &&
    formData.ingredients.length <= MAX_RECIPE_INGREDIENTS &&
    rowsValid &&
    formData.servings > 0 &&
    (!extras.times.enabled || (isValidMinutes(prep) && isValidMinutes(cook)));

  const fields = useMemo(
    () => [
      input({
        name: 'title',
        label: 'Title',
        variant: 'outline',
        placeholder: 'Adobo chicken',
      }),
      custom({
        name: 'servings',
        label: 'Servings',
        renderComponent: (props) => (
          <ServingStepper
            label='Servings'
            value={Number(props.value)}
            onChange={(value) => props.onValueChange(value)}
          />
        ),
      }),
      custom({
        name: 'ingredients',
        label: 'Ingredients',
        renderComponent: (props) => (
          <IngredientRows
            uid={uid}
            rows={props.value as IngredientRow[]}
            onChange={props.onValueChange}
          />
        ),
      }),
      custom({
        name: 'extras',
        label: '',
        renderComponent: (props) => (
          <ExtrasFields
            extras={props.value as Extras}
            onChange={props.onValueChange}
            cover={{
              previewUrl: coverUrl,
              error: coverError,
              onSelect: (file) => {
                pickCover(file);
                setIsCoverRemoved(false);
              },
              onRemove: () => {
                clearCover();
                setIsCoverRemoved(true);
              },
            }}
          />
        ),
      }),
    ],
    [uid, coverUrl, coverError, pickCover, clearCover],
  );

  const handleDelete = async () => {
    if (!recipe) {
      return;
    }
    const confirmed = await confirm({
      title: 'Delete recipe',
      message: `Delete "${recipe.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
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

  const handleSubmit = async (data: FormData) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await dispatch(
        saveRecipe({
          uid,
          draft: {
            id: recipe?.id ?? null,
            title: data.title,
            description: data.extras.description.enabled
              ? data.extras.description.value.trim() || null
              : null,
            servings: data.servings,
            prepMinutes: data.extras.times.enabled
              ? parseMinutes(data.extras.times.value.prep)
              : null,
            cookMinutes: data.extras.times.enabled
              ? parseMinutes(data.extras.times.value.cook)
              : null,
            ingredients: data.ingredients.map((row) => ({
              id: row.id,
              ingredientId: row.ingredientId,
              amount: Number(row.amount),
              unit: row.unit,
              note: null,
            })),
            steps: data.extras.steps.enabled
              ? data.extras.steps.value
                  .map((step) => step.trim())
                  .filter(Boolean)
              : [],
            coverFile: data.extras.cover.enabled ? upload.file : null,
            removeCover: isCoverRemoved || !data.extras.cover.enabled,
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
      <Form
        id='pinch-recipe'
        form={fields}
        initialData={initialData}
        columns={1}
        onDataChange={(data) => setFormData(data as FormData)}
        onSubmit={(data) => {
          void handleSubmit(data as FormData);
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

export default RecipeForm;
