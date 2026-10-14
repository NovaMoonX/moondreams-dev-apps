import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Gauge, Scale } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import Field, { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import MacroStats from '@/components/MacroStats';
import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import { PillRow } from '@/components/PillGroup';
import { useAppDispatch, useAppSelector } from '@/store';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  MAX_NAME_LENGTH,
  MAX_NUTRITION_VALUE,
  MAX_SERVING_AMOUNT,
  NUTRITION_ENTRY_UNITS,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
import {
  removeIngredient,
  saveIngredient,
} from '@apps/pinch/store/actions/ingredientActions';
import { getUsage } from '@apps/pinch/store/actions/usageActions';
import {
  getEntryGrams,
  getServingGrams,
  toPer100g,
  type NutritionEntryUnit,
} from '@apps/pinch/utils/nutritionBasis';
import type { Conversions } from '@apps/pinch/utils/quantity';
import { formatSize } from '@apps/pinch/utils/productFormat';
import { describeUsage, isInUse } from '@apps/pinch/utils/references';
import {
  selectIngredientFamilies,
  selectIngredientRecordsById,
} from '@apps/pinch/store/selectors';
import type {
  NutritionValues,
  ResolvedIngredient,
  Unit,
} from '@apps/pinch/types';
import { getErrorMessage } from '@/utils/errorUtils';

interface Reveal<T> {
  enabled: boolean;
  value: T;
}

interface NutritionText {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

interface NutritionEntry {
  /** What the typed numbers are for: "28 g", "1 oz", "1 serving". */
  basis: { amount: string; unit: NutritionEntryUnit };
  values: NutritionText;
  /** Once the person types a number, switching the basis relabels it; before that it converts the saved numbers. */
  isTyped: boolean;
}

interface Extras {
  nutrition: Reveal<NutritionEntry>;
  serving: Reveal<{ amount: string; unit: Unit }>;
}

interface FormData {
  name: string;
  family: { choice: string; newText: string };
  extras: Extras;
}

const NUTRITION_FIELDS: { key: keyof NutritionText; label: string }[] = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fat', label: 'Fat (g)' },
];

const BASIS_DEFAULT_AMOUNTS: Record<NutritionEntryUnit, string> = {
  G: '100',
  OZ: '1',
  SERVING: '1',
};
const EMPTY_NUTRITION: NutritionEntry = {
  basis: { amount: BASIS_DEFAULT_AMOUNTS.G, unit: 'G' },
  values: { calories: '', protein: '', carbs: '', fat: '' },
  isTyped: false,
};

const { custom, input } = FormFactories;

const toText = (value: number | null) => (value === null ? '' : String(value));
const parseAmount = (text: string) =>
  text.trim() === '' ? null : Number(text);
const isPositive = (value: number | null, max: number): value is number =>
  value !== null && Number.isFinite(value) && value > 0 && value <= max;
const isMetric = (value: number | null) =>
  value === null ||
  (Number.isFinite(value) && value >= 0 && value <= MAX_NUTRITION_VALUE);

const getFormServingGrams = (extras: Extras, conversions: Conversions) => {
  const amount = parseAmount(extras.serving.value.amount);
  return !extras.serving.enabled || !isPositive(amount, MAX_SERVING_AMOUNT)
    ? null
    : getServingGrams({ amount, unit: extras.serving.value.unit }, conversions);
};

const getPer100g = (
  extras: Extras,
  conversions: Conversions,
): NutritionValues | null => {
  const { basis, values } = extras.nutrition.value;
  const amount = parseAmount(basis.amount);
  const grams = isPositive(amount, MAX_SERVING_AMOUNT)
    ? getEntryGrams(
        amount,
        basis.unit,
        getFormServingGrams(extras, conversions),
      )
    : null;
  if (grams === null || grams <= 0) {
    return null;
  }

  return Object.fromEntries(
    NUTRITION_METRICS.map((metric) => {
      const typed = parseAmount(values[metric]);
      return [metric, typed === null ? null : toPer100g(typed, grams)];
    }),
  ) as unknown as NutritionValues;
};

const getBasisLabel = (extras: Extras, servingGrams: number | null) => {
  const { basis } = extras.nutrition.value;
  const amount = basis.amount.trim() || '…';
  if (basis.unit !== 'SERVING') {
    return `${amount} ${basis.unit === 'G' ? 'g' : 'oz'}`;
  }

  const servingAmount = parseAmount(extras.serving.value.amount);
  const typed = Number(amount);
  const noun = amount === '1' ? 'serving' : 'servings';
  return servingGrams === null ||
    !Number.isFinite(typed) ||
    !isPositive(servingAmount, MAX_SERVING_AMOUNT)
    ? `${amount} ${noun}`
    : `${amount} ${noun} (${formatSize(servingAmount * typed, extras.serving.value.unit)})`;
};

const getInitialData = (
  ingredient: ResolvedIngredient | null,
  hasServing: boolean,
): FormData => {
  const isCatalog = ingredient !== null && !ingredient.isCustom;
  const hasNutrition =
    ingredient !== null &&
    Object.values(ingredient.per100g).some((value) => value !== null);

  return {
    name: ingredient?.name ?? '',
    family: { choice: ingredient?.familyId ?? '', newText: '' },
    extras: {
      nutrition: {
        enabled: isCatalog || hasNutrition,
        value: {
          basis: EMPTY_NUTRITION.basis,
          values: {
            calories: toText(ingredient?.per100g.calories ?? null),
            protein: toText(ingredient?.per100g.protein ?? null),
            carbs: toText(ingredient?.per100g.carbs ?? null),
            fat: toText(ingredient?.per100g.fat ?? null),
          },
          isTyped: false,
        },
      },
      serving: {
        enabled: isCatalog || hasServing,
        value: {
          amount: String(ingredient?.serving.amount ?? 100),
          unit: ingredient?.serving.unit ?? 'G',
        },
      },
    },
  };
};

interface ExtrasFieldsProps {
  extras: Extras;
  conversions: Conversions;
  onChange: (extras: Extras) => void;
}

function ExtrasFields({ extras, conversions, onChange }: ExtrasFieldsProps) {
  const chips = [
    {
      key: 'serving',
      label: 'Serving size',
      icon: <Scale className='h-4 w-4' />,
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      icon: <Gauge className='h-4 w-4' />,
    },
  ].filter((chip) => !extras[chip.key as keyof Extras].enabled);

  const reveal = (key: string) =>
    onChange({
      ...extras,
      [key]: { ...extras[key as keyof Extras], enabled: true },
    });
  const remove = (key: keyof Extras, empty: Extras[keyof Extras]) =>
    onChange({ ...extras, [key]: empty });
  const setEntry = (entry: Partial<NutritionEntry>) =>
    onChange({
      ...extras,
      nutrition: {
        ...extras.nutrition,
        value: { ...extras.nutrition.value, ...entry },
      },
    });

  const { basis, values, isTyped } = extras.nutrition.value;
  const servingGrams = getFormServingGrams(extras, conversions);
  const per100g = getPer100g(extras, conversions);
  const isPer100g = basis.unit === 'G' && parseAmount(basis.amount) === 100;
  const getServingHint = () => {
    if (servingGrams !== null) return null;
    return extras.serving.enabled
      ? 'To type it per serving, set one serving in grams or ounces above.'
      : 'To type it per serving, set the serving size in grams or ounces first.';
  };
  const servingHint = getServingHint();
  const getProblem = () => {
    if (!isPositive(parseAmount(basis.amount), MAX_SERVING_AMOUNT))
      return 'Add the amount these numbers are for.';
    return per100g && !Object.values(per100g).every(isMetric)
      ? 'Those numbers look too big. Check them against the label.'
      : null;
  };
  const problem = getProblem();

  const switchBasis = (unit: NutritionEntryUnit) => {
    const amount =
      basis.amount === BASIS_DEFAULT_AMOUNTS[basis.unit]
        ? BASIS_DEFAULT_AMOUNTS[unit]
        : basis.amount;
    const typedAmount = parseAmount(amount);
    const grams = isPositive(typedAmount, MAX_SERVING_AMOUNT)
      ? getEntryGrams(typedAmount, unit, servingGrams)
      : null;
    const converted =
      !isTyped && per100g !== null && grams !== null
        ? (Object.fromEntries(
            NUTRITION_FIELDS.map(({ key }) => [
              key,
              per100g[key] === null
                ? ''
                : String(Math.round(per100g[key] * grams) / 100),
            ]),
          ) as unknown as NutritionText)
        : null;
    setEntry({
      basis: { unit, amount },
      ...(converted && { values: converted }),
    });
  };

  return (
    <div className='space-y-4'>
      {extras.serving.enabled && (
        <RemovableField
          label='One serving is'
          removeLabel='Remove serving size'
          onRemove={() =>
            remove('serving', {
              enabled: false,
              value: { amount: '100', unit: 'G' },
            })
          }
        >
          <div className='grid grid-cols-2 gap-3'>
            <Input
              type='number'
              inputMode='decimal'
              min={0}
              step='any'
              variant='outline'
              aria-label='Serving amount'
              value={extras.serving.value.amount}
              onChange={(event) =>
                onChange({
                  ...extras,
                  serving: {
                    ...extras.serving,
                    value: {
                      ...extras.serving.value,
                      amount: event.target.value,
                    },
                  },
                })
              }
            />
            <UnitSelect
              value={extras.serving.value.unit}
              onChange={(unit) =>
                onChange({
                  ...extras,
                  serving: {
                    ...extras.serving,
                    value: { ...extras.serving.value, unit },
                  },
                })
              }
            />
          </div>
        </RemovableField>
      )}
      {extras.nutrition.enabled && (
        <RemovableField
          label={`Nutrition per ${getBasisLabel(extras, servingGrams)}`}
          removeLabel='Remove nutrition'
          onRemove={() =>
            remove('nutrition', { enabled: false, value: EMPTY_NUTRITION })
          }
        >
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-2'>
              <span className='text-sm font-medium'>Per</span>
              <div className='w-24 shrink-0'>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  aria-label='Amount the nutrition is for'
                  className={COMPACT_INPUT_CLASS}
                  value={basis.amount}
                  onChange={(event) =>
                    setEntry({
                      basis: { ...basis, amount: event.target.value },
                    })
                  }
                />
              </div>
              <PillRow label='What the nutrition is per'>
                {NUTRITION_ENTRY_UNITS.map((option) => (
                  <Pill
                    key={option.value}
                    isSelected={basis.unit === option.value}
                    isDisabled={
                      option.value === 'SERVING' && servingGrams === null
                    }
                    onClick={() => switchBasis(option.value)}
                  >
                    {option.label}
                  </Pill>
                ))}
              </PillRow>
            </div>
            {servingHint && (
              <p className='text-muted-foreground text-xs'>
                {servingHint}
                {!extras.serving.enabled && (
                  <>
                    {' '}
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className='h-auto min-h-0 p-0 align-baseline text-xs'
                      onClick={() => reveal('serving')}
                    >
                      Add serving size
                    </Button>
                  </>
                )}
              </p>
            )}
            <div className='grid grid-cols-2 gap-3'>
              {NUTRITION_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} isCompact>
                  {() => (
                    <Input
                      type='number'
                      inputMode='decimal'
                      min={0}
                      step='any'
                      variant='outline'
                      className={COMPACT_INPUT_CLASS}
                      value={values[field.key]}
                      onChange={(event) =>
                        setEntry({
                          values: {
                            ...values,
                            [field.key]: event.target.value,
                          },
                          isTyped: true,
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {problem && <p className='text-destructive text-xs'>{problem}</p>}
            {!problem && !isPer100g && per100g && (
              <p className='text-muted-foreground text-xs'>
                Saved as per 100 g: <MacroStats values={per100g} />
              </p>
            )}
          </div>
        </RemovableField>
      )}
      <AddFieldChips chips={chips} onAdd={reveal} />
    </div>
  );
}

interface IngredientFormSheetProps {
  uid: string;
  /** The ingredient being changed; null when adding a new custom one. */
  ingredient: ResolvedIngredient | null;
  onClose: () => void;
}

function IngredientFormSheet({
  uid,
  ingredient,
  onClose,
}: IngredientFormSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const families = useAppSelector(selectIngredientFamilies);
  const recordsById = useAppSelector(selectIngredientRecordsById);
  const record = ingredient ? (recordsById.get(ingredient.id) ?? null) : null;
  const isCatalog = ingredient !== null && !ingredient.isCustom;

  const initialData = useMemo(
    () => getInitialData(ingredient, record?.servingAmount != null),
    [ingredient, record],
  );
  const [formData, setFormData] = useState<FormData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gramsPerMl = ingredient?.gramsPerMl ?? null;
  const gramsEach = ingredient?.gramsEach ?? null;
  const conversions = useMemo(
    () => ({ gramsPerMl, gramsEach }),
    [gramsPerMl, gramsEach],
  );

  const { extras } = formData;
  const per100g = getPer100g(extras, conversions);
  const isFormComplete =
    (isCatalog ||
      (formData.name.trim() !== '' &&
        formData.name.length <= MAX_NAME_LENGTH)) &&
    (formData.family.choice !== NEW_CHOICE ||
      formData.family.newText.trim() !== '') &&
    (!extras.nutrition.enabled ||
      (per100g !== null && Object.values(per100g).every(isMetric))) &&
    (!extras.serving.enabled ||
      isPositive(parseAmount(extras.serving.value.amount), MAX_SERVING_AMOUNT));

  const familyOptions = useMemo(
    () => families.map((family) => ({ value: family.id, label: family.name })),
    [families],
  );

  const fields = useMemo(
    () => [
      ...(isCatalog
        ? []
        : [
            input({
              name: 'name',
              label: 'Name',
              variant: 'outline',
              placeholder: 'Doritos nacho cheese',
            }),
            custom({
              name: 'family',
              label: 'Which family does it join?',
              renderComponent: (props) => {
                const value = props.value as FormData['family'];
                return (
                  <div className='space-y-2'>
                    <PickOrCreate
                      label='Family'
                      options={familyOptions}
                      choice={value.choice}
                      newText={value.newText}
                      newPillLabel='New family'
                      newPlaceholder='Family name'
                      onChange={(choice, newText) =>
                        props.onValueChange({ choice, newText })
                      }
                    />
                    <p className='text-muted-foreground text-xs'>
                      Not sure? Skip it and the ingredient stands on its own.
                    </p>
                  </div>
                );
              },
            }),
          ]),
      custom({
        name: 'extras',
        label: '',
        renderComponent: (props) => (
          <ExtrasFields
            extras={props.value as Extras}
            conversions={conversions}
            onChange={props.onValueChange}
          />
        ),
      }),
    ],
    [isCatalog, familyOptions, conversions],
  );

  const handleDelete = async () => {
    if (!ingredient) {
      return;
    }
    const usage = isCatalog
      ? null
      : await dispatch(getUsage({ uid, kind: 'INGREDIENT', id: ingredient.id }))
          .unwrap()
          .catch(() => undefined);
    if (usage === undefined) {
      setError(
        "We couldn't check whether this ingredient is in use. Try again in a moment.",
      );
      return;
    }

    const isUsed = usage !== null && isInUse(usage);
    const confirmed = await confirm({
      title: isCatalog
        ? 'Use the built-in values'
        : isUsed
          ? 'Remove ingredient'
          : 'Delete ingredient',
      message: isCatalog
        ? `Put ${ingredient.name} back to its built-in nutrition and serving size? Your changes to it are removed.`
        : usage !== null && isUsed
          ? `"${ingredient.name}" is used by ${describeUsage(usage)}, so it will be taken off your lists, not erased. Everything that uses it keeps its name and numbers.`
          : `Delete "${ingredient.name}"? This action cannot be undone.`,
      confirmText: isCatalog ? 'Reset' : isUsed ? 'Remove' : 'Delete',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(removeIngredient({ uid, id: ingredient.id })).unwrap();
      onClose();
    } catch (deleteError) {
      setError(
        getErrorMessage(deleteError, 'Unable to remove this ingredient.'),
      );
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (data: FormData) => {
    const nutrition = data.extras.nutrition.enabled
      ? getPer100g(data.extras, conversions)
      : null;
    if (data.extras.nutrition.enabled && nutrition === null) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const isServingOn = data.extras.serving.enabled;

    const isUnchangedCatalog =
      isCatalog &&
      !ingredient.isAdjusted &&
      (nutrition === null ||
        (['calories', 'protein', 'carbs', 'fat'] as const).every(
          (metric) => nutrition[metric] === ingredient.per100g[metric],
        )) &&
      (!isServingOn ||
        (parseAmount(data.extras.serving.value.amount) ===
          ingredient.serving.amount &&
          data.extras.serving.value.unit === ingredient.serving.unit));
    if (isUnchangedCatalog) {
      onClose();
      return;
    }

    try {
      await dispatch(
        saveIngredient({
          uid,
          draft: {
            id: ingredient?.id ?? null,
            catalogId: isCatalog ? ingredient.id : null,
            name: data.name,
            familyId:
              data.family.choice === '' || data.family.choice === NEW_CHOICE
                ? null
                : data.family.choice,
            newFamilyName:
              data.family.choice === NEW_CHOICE ? data.family.newText : null,
            nutrition,
            servingAmount: isServingOn
              ? parseAmount(data.extras.serving.value.amount)
              : null,
            servingUnit: isServingOn ? data.extras.serving.value.unit : null,
          },
        }),
      ).unwrap();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this ingredient.'));
      setIsSubmitting(false);
    }
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Ingredient'>
      {isCatalog && (
        <div className='mb-4 flex items-center gap-3'>
          <div className='min-w-0'>
            <p className='truncate font-medium'>{ingredient.name}</p>
            <p className='text-muted-foreground text-sm'>
              Built in. Change what you like and it stays yours.
            </p>
          </div>
        </div>
      )}
      <Form
        id='pinch-ingredient'
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
              (isCatalog ? ingredient.isAdjusted : record !== null) && (
                <DeleteIconButton
                  label={isCatalog ? 'Use the built-in values' : 'Delete'}
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                />
              )
            }
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
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
                {ingredient ? 'Save' : 'Add'}
              </Button>
            }
          />
        }
      />
      {error && <p className='text-destructive mt-3 text-sm'>{error}</p>}
    </FormSheet>
  );
}

export default IngredientFormSheet;
