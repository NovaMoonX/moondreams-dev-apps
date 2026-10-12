import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Gauge, Scale, Smile } from 'lucide-react';

import DeleteIconButton from '@/components/DeleteIconButton';
import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch, useAppSelector } from '@/store';
import IconPicker from '@apps/pinch/components/kitchen/IconPicker';
import IngredientIcon from '@apps/pinch/components/shared/IngredientIcon';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import { MAX_NAME_LENGTH } from '@apps/pinch/constants';
import {
  removeIngredient,
  saveIngredient,
} from '@apps/pinch/store/actions/ingredientActions';
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

interface Extras {
  nutrition: Reveal<NutritionText>;
  serving: Reveal<{ amount: string; unit: Unit }>;
  icon: Reveal<string | null>;
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

const { custom, input } = FormFactories;

const toText = (value: number | null) =>
  value === null ? '' : String(Math.round(value * 10) / 10);
const parseAmount = (text: string) =>
  text.trim() === '' ? null : Number(text);
const isNonNegative = (value: number | null) =>
  value === null || (Number.isFinite(value) && value >= 0 && value <= 100000);

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
          calories: toText(ingredient?.per100g.calories ?? null),
          protein: toText(ingredient?.per100g.protein ?? null),
          carbs: toText(ingredient?.per100g.carbs ?? null),
          fat: toText(ingredient?.per100g.fat ?? null),
        },
      },
      serving: {
        enabled: isCatalog || hasServing,
        value: {
          amount: String(ingredient?.serving.amount ?? 100),
          unit: ingredient?.serving.unit ?? 'G',
        },
      },
      icon: {
        enabled: ingredient?.iconKey != null && ingredient.isCustom,
        value: ingredient?.iconKey ?? null,
      },
    },
  };
};

interface ExtrasFieldsProps {
  extras: Extras;
  isCatalog: boolean;
  onChange: (extras: Extras) => void;
}

function ExtrasFields({ extras, isCatalog, onChange }: ExtrasFieldsProps) {
  const chips = [
    {
      key: 'nutrition',
      label: 'Nutrition',
      icon: <Gauge className='h-4 w-4' />,
    },
    {
      key: 'serving',
      label: 'Serving size',
      icon: <Scale className='h-4 w-4' />,
    },
    ...(isCatalog
      ? []
      : [{ key: 'icon', label: 'Icon', icon: <Smile className='h-4 w-4' /> }]),
  ].filter((chip) => !extras[chip.key as keyof Extras].enabled);

  const reveal = (key: string) =>
    onChange({
      ...extras,
      [key]: { ...extras[key as keyof Extras], enabled: true },
    });
  const remove = (key: keyof Extras, empty: Extras[keyof Extras]) =>
    onChange({ ...extras, [key]: empty });

  return (
    <div className='space-y-4'>
      {extras.nutrition.enabled && (
        <RemovableField
          label='Nutrition per 100 g'
          removeLabel='Remove nutrition'
          onRemove={() =>
            remove('nutrition', {
              enabled: false,
              value: { calories: '', protein: '', carbs: '', fat: '' },
            })
          }
        >
          <div className='grid grid-cols-2 gap-3'>
            {NUTRITION_FIELDS.map((field) => (
              <div key={field.key} className='space-y-1.5'>
                <Label>{field.label}</Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  aria-label={field.label}
                  value={extras.nutrition.value[field.key]}
                  onChange={(event) =>
                    onChange({
                      ...extras,
                      nutrition: {
                        ...extras.nutrition,
                        value: {
                          ...extras.nutrition.value,
                          [field.key]: event.target.value,
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
      {extras.icon.enabled && (
        <RemovableField
          label='Icon'
          removeLabel='Remove icon'
          onRemove={() => remove('icon', { enabled: false, value: null })}
        >
          <IconPicker
            value={extras.icon.value}
            onChange={(iconKey) =>
              onChange({ ...extras, icon: { enabled: true, value: iconKey } })
            }
          />
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

  const { extras } = formData;
  const nutritionValues = Object.values(extras.nutrition.value).map(
    parseAmount,
  );
  const servingAmount = parseAmount(extras.serving.value.amount);
  const isFormComplete =
    (isCatalog ||
      (formData.name.trim() !== '' &&
        formData.name.length <= MAX_NAME_LENGTH)) &&
    (formData.family.choice !== NEW_CHOICE ||
      formData.family.newText.trim() !== '') &&
    (!extras.nutrition.enabled || nutritionValues.every(isNonNegative)) &&
    (!extras.serving.enabled ||
      (servingAmount !== null &&
        Number.isFinite(servingAmount) &&
        servingAmount > 0));

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
            isCatalog={isCatalog}
            onChange={props.onValueChange}
          />
        ),
      }),
    ],
    [isCatalog, familyOptions],
  );

  const handleDelete = async () => {
    if (!ingredient) {
      return;
    }
    const confirmed = await confirm({
      title: isCatalog ? 'Use the built-in values' : 'Delete ingredient',
      message: isCatalog
        ? `Put ${ingredient.name} back to its built-in nutrition, serving size and icon? Your changes to it are removed.`
        : `Delete "${ingredient.name}"? This action cannot be undone.`,
      confirmText: isCatalog ? 'Reset' : 'Delete',
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
    setError(null);
    setIsSubmitting(true);
    const nutrition: NutritionValues | null = data.extras.nutrition.enabled
      ? {
          calories: parseAmount(data.extras.nutrition.value.calories),
          protein: parseAmount(data.extras.nutrition.value.protein),
          carbs: parseAmount(data.extras.nutrition.value.carbs),
          fat: parseAmount(data.extras.nutrition.value.fat),
        }
      : null;
    const isServingOn = data.extras.serving.enabled;

    const isUnchangedCatalog =
      isCatalog &&
      record === null &&
      nutrition !== null &&
      (['calories', 'protein', 'carbs', 'fat'] as const).every(
        (metric) => nutrition[metric] === ingredient.per100g[metric],
      ) &&
      parseAmount(data.extras.serving.value.amount) ===
        ingredient.serving.amount &&
      data.extras.serving.value.unit === ingredient.serving.unit;
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
            iconKey: data.extras.icon.enabled ? data.extras.icon.value : null,
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
          <IngredientIcon iconKey={ingredient.iconKey} size={40} />
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
              record && (
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
