import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Clock,
  FileText,
  Flame,
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
import RecipeAutofill from '@apps/pinch/components/recipes/RecipeAutofill';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import ServingStepper from '@apps/pinch/components/plan/ServingStepper';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  DEFAULT_SERVING,
  MAX_MINUTES,
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
  MAX_RECIPE_TITLE_LENGTH,
  MAX_SERVING_AMOUNT,
  MAX_STEP_LENGTH,
  NUTRITION_CELLS,
  NUTRITION_METRICS,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import {
  removeRecipe,
  saveRecipe,
} from '@apps/pinch/store/actions/recipeActions';
import {
  selectIngredients,
  selectIngredientsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { ExtractedRecipe } from '@apps/pinch/lib/extractRecipe';
import { matchIngredient } from '@apps/pinch/utils/ingredientMatch';
import type {
  NutritionMetric,
  NutritionValues,
  Recipe,
  RecipeSource,
  Unit,
} from '@apps/pinch/types';

const { custom, input } = FormFactories;

interface IngredientRow {
  id: string;
  /** Empty while the reader's name hasn't been resolved to an ingredient yet. */
  ingredientId: string;
  amount: string;
  unit: Unit;
  note: string | null;
  /** A name from the reader that no ingredient matches: shown until the person adds it as new or picks another. */
  proposedName: string | null;
  /** Set when the person chose "Add as new ingredient": it is created with the recipe. */
  newName: string | null;
}

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface Extras {
  steps: Reveal<string[]>;
  description: Reveal<string>;
  times: Reveal<{ prep: string; cook: string }>;
  nutrition: Reveal<Record<NutritionMetric, string>>;
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
    note: line.note ?? null,
    proposedName: null,
    newName: null,
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
    nutrition: {
      enabled: recipe?.nutritionOverride != null,
      value: Object.fromEntries(
        NUTRITION_METRICS.map((metric) => [
          metric,
          recipe?.nutritionOverride?.[metric] != null
            ? String(recipe.nutritionOverride[metric])
            : '',
        ]),
      ) as Record<NutritionMetric, string>,
    },
    cover: { enabled: recipe?.coverPath != null, value: null },
  },
});

const EMPTY_NUTRITION = { calories: '', protein: '', carbs: '', fat: '' };

/** The typed-over nutrition as per-serving values, a blank metric staying derived; null when nothing was typed. */
const parseNutrition = (
  values: Record<NutritionMetric, string>,
): NutritionValues | null => {
  const parsed = Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      values[metric].trim() === '' ? null : Number(values[metric]),
    ]),
  ) as unknown as NutritionValues;
  return Object.values(parsed).every((value) => value === null) ? null : parsed;
};

const isValidNutrition = (values: Record<NutritionMetric, string>) =>
  NUTRITION_METRICS.every((metric) => {
    const value = values[metric].trim() === '' ? null : Number(values[metric]);
    return (
      value === null ||
      (Number.isFinite(value) && value >= 0 && value <= 100000)
    );
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [choosingId, setChoosingId] = useState<string | null>(null);

  const addRow = (ingredientId: string) => {
    const serving =
      ingredientsById.get(ingredientId)?.serving ?? DEFAULT_SERVING;
    const id = generateUuid();
    onChange([
      ...rows,
      {
        id,
        ingredientId,
        amount: String(serving.amount),
        unit: serving.unit,
        note: null,
        proposedName: null,
        newName: null,
      },
    ]);
    setOpenId(id);
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
            const amount = Number(row.amount);
            const isAmountValid =
              row.amount.trim() !== '' &&
              amount > 0 &&
              amount <= MAX_SERVING_AMOUNT;
            const amountLabel = isAmountValid
              ? `${Math.round(amount * 100) / 100} ${UNIT_LABELS[row.unit]}`
              : row.amount.trim() === ''
                ? 'Add an amount'
                : 'Check the amount';
            const displayName =
              ingredient?.name ??
              row.newName ??
              row.proposedName ??
              'Removed ingredient';
            if (row.ingredientId === '') {
              return (
                <li key={row.id} className='space-y-2 py-2'>
                  <div className='flex items-center gap-1'>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate font-medium'>{displayName}</p>
                      <p className='text-muted-foreground text-xs'>
                        Not in your ingredients yet
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={`Remove ${displayName}`}
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
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      rounded='full'
                      variant='secondary'
                      onClick={() =>
                        update({
                          ingredientId: generateUuid(),
                          newName: row.proposedName,
                        })
                      }
                    >
                      Add as new ingredient
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      rounded='full'
                      variant='secondary'
                      onClick={() =>
                        setChoosingId((current) =>
                          current === row.id ? null : row.id,
                        )
                      }
                    >
                      {choosingId === row.id ? 'Close' : 'Choose another'}
                    </Button>
                  </div>
                  {choosingId === row.id && (
                    <ItemSearch
                      uid={uid}
                      excludeIds={rows.map(
                        (candidate) => candidate.ingredientId,
                      )}
                      onPick={(ingredientId) => {
                        setChoosingId(null);
                        update({
                          ingredientId,
                          proposedName: null,
                          newName: null,
                        });
                      }}
                    />
                  )}
                </li>
              );
            }
            return (
              <li key={row.id} className='py-1'>
                <div className='flex items-center gap-1'>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-expanded={openId === row.id}
                    aria-label={`${displayName}, ${amountLabel}`}
                    onClick={() =>
                      setOpenId((current) =>
                        current === row.id ? null : row.id,
                      )
                    }
                    className='h-auto min-h-12 min-w-0 flex-1 justify-start gap-3 px-0! py-1.5 text-left'
                  >
                    <IngredientIcon
                      iconKey={ingredient?.iconKey ?? null}
                      size={28}
                    />
                    <span className='min-w-0 flex-1 truncate font-medium'>
                      {displayName}
                      {row.newName && (
                        <span className='text-muted-foreground ml-1.5 text-xs font-normal'>
                          new
                        </span>
                      )}
                    </span>
                    <span
                      className={join(
                        'shrink-0 text-sm font-normal whitespace-nowrap',
                        isAmountValid
                          ? 'text-muted-foreground'
                          : 'text-destructive',
                      )}
                    >
                      {amountLabel}
                    </span>
                  </Button>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label={`Remove ${displayName}`}
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
                {openId === row.id && (
                  <div className='grid grid-cols-2 gap-3 pb-2'>
                    <Input
                      type='number'
                      inputMode='decimal'
                      min={0}
                      step='any'
                      variant='outline'
                      aria-label={`Amount of ${displayName}`}
                      value={row.amount}
                      onChange={(event) =>
                        update({ amount: event.target.value })
                      }
                    />
                    <UnitSelect
                      value={row.unit}
                      onChange={(unit) => update({ unit })}
                    />
                  </div>
                )}
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
  const [openStep, setOpenStep] = useState<number | null>(null);
  const chips = [
    { key: 'steps', label: 'Steps', icon: <ListOrdered className='h-4 w-4' /> },
    {
      key: 'description',
      label: 'Description',
      icon: <FileText className='h-4 w-4' />,
    },
    { key: 'times', label: 'Times', icon: <Clock className='h-4 w-4' /> },
    {
      key: 'nutrition',
      label: 'My own nutrition',
      icon: <Flame className='h-4 w-4' />,
    },
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
              <div key={index} className='space-y-2'>
                <div className='flex items-start gap-1'>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-expanded={openStep === index}
                    aria-label={`Step ${index + 1}`}
                    onClick={() =>
                      setOpenStep((current) =>
                        current === index ? null : index,
                      )
                    }
                    className='h-auto min-h-12 min-w-0 flex-1 items-start justify-start gap-3 px-0! py-2 text-left'
                  >
                    <span className='bg-secondary text-secondary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                      {index + 1}
                    </span>
                    <span
                      className={join(
                        'line-clamp-2 min-w-0 flex-1 text-sm font-normal',
                        step.trim() === '' && 'text-muted-foreground',
                      )}
                    >
                      {step.trim() === '' ? 'Write this step' : step}
                    </span>
                  </Button>
                  {steps.length > 1 && (
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      aria-label={`Remove step ${index + 1}`}
                      className='size-10 shrink-0'
                      onClick={() => {
                        setOpenStep(null);
                        setSteps(steps.filter((_, at) => at !== index));
                      }}
                    >
                      <Trash2 className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  )}
                </div>
                {openStep === index && (
                  <Textarea
                    rows={3}
                    variant='outline'
                    autoFocus
                    aria-label={`Step ${index + 1} text`}
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
                )}
              </div>
            ))}
            {steps.length < MAX_RECIPE_STEPS && (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='h-10 gap-1.5 px-0!'
                onClick={() => {
                  setSteps([...steps, '']);
                  setOpenStep(steps.length);
                }}
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
            maxLength={MAX_RECIPE_DESCRIPTION_LENGTH}
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
      {extras.nutrition.enabled && (
        <RemovableField
          label='My own nutrition, per serving'
          removeLabel='Remove my own nutrition'
          onRemove={() =>
            onChange({
              ...extras,
              nutrition: { enabled: false, value: EMPTY_NUTRITION },
            })
          }
        >
          <div className='grid grid-cols-2 gap-3'>
            {NUTRITION_CELLS.map((cell) => (
              <div key={cell.key} className='space-y-1.5'>
                <Label>
                  {cell.unit === '' ? cell.label : `${cell.label} (g)`}
                </Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  aria-label={`${cell.label} per serving`}
                  placeholder='From the ingredients'
                  value={extras.nutrition.value[cell.key]}
                  onChange={(event) =>
                    onChange({
                      ...extras,
                      nutrition: {
                        enabled: true,
                        value: {
                          ...extras.nutrition.value,
                          [cell.key]: event.target.value,
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
        onAdd={(key) => {
          if (key === 'steps') setOpenStep(0);
          onChange({
            ...extras,
            [key]: { ...extras[key as keyof Extras], enabled: true },
          });
        }}
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
  const ingredients = useAppSelector(selectIngredients);
  const initialData = useMemo(() => getInitialData(recipe), [recipe]);
  const [seed, setSeed] = useState({ data: initialData, key: 0 });
  const [source, setSource] = useState<RecipeSource>('MANUAL');
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
      row.ingredientId !== '' &&
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
    (!extras.times.enabled || (isValidMinutes(prep) && isValidMinutes(cook))) &&
    (!extras.nutrition.enabled || isValidNutrition(extras.nutrition.value));

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

  /** Fills only what the reader found and the person hasn't already written: blank fields, new ingredients and steps, never over what they typed. */
  const applyExtracted = (extracted: ExtractedRecipe, from: RecipeSource) => {
    const current = formData;
    const isUntouched = (value: number) => value === seed.data.servings;
    const known = new Set(current.ingredients.map((row) => row.ingredientId));
    const addedRows = extracted.ingredients.flatMap((line) => {
      const match = matchIngredient(line.name, ingredients);
      if (match && known.has(match.id)) {
        return [];
      }
      if (match) {
        known.add(match.id);
      }
      return [
        {
          id: generateUuid(),
          ingredientId: match?.id ?? '',
          amount: line.amount === null ? '' : String(line.amount),
          unit: line.unit ?? match?.serving.unit ?? 'EACH',
          note: line.note,
          proposedName: match ? null : line.name,
          newName: null,
        } satisfies IngredientRow,
      ];
    });
    const { extras } = current;
    const hasSteps =
      extras.steps.enabled &&
      extras.steps.value.some((step) => step.trim() !== '');
    const next: FormData = {
      ...current,
      title:
        current.title.trim() === '' ? (extracted.title ?? '') : current.title,
      servings:
        extracted.servings !== null && isUntouched(current.servings)
          ? extracted.servings
          : current.servings,
      ingredients: [...current.ingredients, ...addedRows].slice(
        0,
        MAX_RECIPE_INGREDIENTS,
      ),
      extras: {
        ...extras,
        steps:
          extracted.steps.length > 0 && !hasSteps
            ? { enabled: true, value: extracted.steps }
            : extras.steps,
        description:
          extracted.description !== null &&
          extras.description.value.trim() === ''
            ? { enabled: true, value: extracted.description }
            : extras.description,
        times:
          (extracted.prepMinutes !== null || extracted.cookMinutes !== null) &&
          !extras.times.enabled
            ? {
                enabled: true,
                value: {
                  prep:
                    extracted.prepMinutes === null
                      ? ''
                      : String(extracted.prepMinutes),
                  cook:
                    extracted.cookMinutes === null
                      ? ''
                      : String(extracted.cookMinutes),
                },
              }
            : extras.times,
      },
    };
    setFormData(next);
    setSeed((currentSeed) => ({ data: next, key: currentSeed.key + 1 }));
    setSource(from);
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
              note: row.note,
            })),
            source: recipe ? recipe.source : source,
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
            nutritionOverride: data.extras.nutrition.enabled
              ? parseNutrition(data.extras.nutrition.value)
              : null,
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
      <RecipeAutofill onFilled={applyExtracted} />
      <Form
        key={seed.key}
        id='pinch-recipe'
        form={fields}
        initialData={seed.data}
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
