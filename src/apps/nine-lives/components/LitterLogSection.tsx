import { useMemo, useState } from 'react';

import {
  Badge,
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
  Pagination,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { shallowEqual } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import { formatDateTime } from '@/utils/formatUtils';
import { LITTER_TYPE_OPTIONS } from '@apps/nine-lives/constants/presetOptions';
import { createCustomLitterType } from '@apps/nine-lives/store/actions/customLitterTypesActions';
import {
  createLitterBox,
  deleteLitterBox,
  updateLitterBox,
} from '@apps/nine-lives/store/actions/litterBoxesActions';
import {
  createLitterEntry,
  deleteLitterEntry,
  updateLitterEntry,
} from '@apps/nine-lives/store/actions/litterEntriesActions';
import { createLitter, deleteLitter, updateLitter } from '@apps/nine-lives/store/actions/littersActions';
import {
  selectCustomLitterTypesByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectLittersByHousehold,
} from '@apps/nine-lives/store/selectors';
import type { CustomLitterType, Litter, LitterBox, LitterEntry, LitterType } from '@apps/nine-lives/types';
import {
  calculateLitterUsageCost,
  convertWeight,
  getLitterEntryEndingWeight,
} from '@apps/nine-lives/utils/litterCalculators';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

import DetailsDisclosure from './DetailsDisclosure';
import TrendLineChart from './TrendLineChart';
import ViewToggle, { type ViewToggleValue } from './ViewToggle';

const { input, select, textarea, custom } = FormFactories;

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';
const NEW_LITTER_TYPE_VALUE = 'new-custom-litter-type';
const NEW_LOCATION_VALUE = 'new-location';

const litterTypeLabels: Record<LitterType, string> = {
  clumping_clay: 'Clumping clay',
  non_clumping_clay: 'Non-clumping clay',
  pine_wood_pellet: 'Pine / wood pellet',
  paper: 'Paper',
  crystal_silica: 'Crystal / silica',
  corn: 'Corn',
  wheat: 'Wheat',
  walnut: 'Walnut',
  custom: 'Custom',
};

const unitOptions = [
  { label: 'Pounds (lb)', value: 'lb' },
  { label: 'Kilograms (kg)', value: 'kg' },
];

function formatWeight(weight: number, unit: 'lb' | 'kg') {
  return `${weight.toFixed(2)} ${unit}`;
}

function getDaysSince(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return Math.max(0, days);
}

function getLitterTypeLabel(
  litterType: LitterType,
  customLitterTypeId: string | null,
  customTypes: CustomLitterType[],
): string {
  if (litterType === 'custom') {
    return customTypes.find((type) => type.id === customLitterTypeId)?.label ?? 'Custom';
  }

  return litterTypeLabels[litterType];
}

interface LitterTypeChoice {
  value: LitterType | typeof NEW_LITTER_TYPE_VALUE;
  customLitterTypeId: string | null;
  customLabel: string;
}

function LitterTypeField({
  value,
  onValueChange,
  disabled,
  customTypes,
}: {
  value: LitterTypeChoice;
  onValueChange: (choice: LitterTypeChoice) => void;
  disabled?: boolean;
  customTypes: CustomLitterType[];
}) {
  const options = [
    ...LITTER_TYPE_OPTIONS.filter((type) => type !== 'custom').map((type) => ({
      text: litterTypeLabels[type],
      value: type,
    })),
    ...customTypes.map((type) => ({ text: type.label, value: `custom:${type.id}` })),
    { text: 'Add a custom type…', value: NEW_LITTER_TYPE_VALUE },
  ];
  const selectedValue =
    value.value === 'custom' && value.customLitterTypeId
      ? `custom:${value.customLitterTypeId}`
      : value.value;

  return (
    <div className='space-y-2'>
      <Select
        options={options}
        value={selectedValue}
        placeholder='Select a litter type'
        disabled={disabled}
        searchable
        onChange={(nextValue) => {
          if (nextValue === NEW_LITTER_TYPE_VALUE) {
            onValueChange({
              value: NEW_LITTER_TYPE_VALUE,
              customLitterTypeId: null,
              customLabel: value.customLabel,
            });
            return;
          }

          if (nextValue.startsWith('custom:')) {
            onValueChange({
              value: 'custom',
              customLitterTypeId: nextValue.slice('custom:'.length),
              customLabel: '',
            });
            return;
          }

          onValueChange({
            value: nextValue as LitterType,
            customLitterTypeId: null,
            customLabel: '',
          });
        }}
      />
      {value.value === NEW_LITTER_TYPE_VALUE && (
        <Input
          value={value.customLabel}
          placeholder='e.g. Recycled paper pellets'
          disabled={disabled}
          onChange={(event) => onValueChange({ ...value, customLabel: event.target.value })}
        />
      )}
    </div>
  );
}

interface LocationChoice {
  value: string;
  custom: string;
}

function LocationField({
  value,
  onValueChange,
  disabled,
  existingLocations,
}: {
  value: LocationChoice;
  onValueChange: (choice: LocationChoice) => void;
  disabled?: boolean;
  existingLocations: string[];
}) {
  const options = [
    ...existingLocations.map((location) => ({ text: location, value: location })),
    { text: 'Add a new location…', value: NEW_LOCATION_VALUE },
  ];

  return (
    <div className='space-y-2'>
      <Select
        options={options}
        value={value.value}
        placeholder='Select a location (optional)'
        disabled={disabled}
        searchable
        onChange={(nextValue) => onValueChange({ value: nextValue, custom: value.custom })}
      />
      {value.value === NEW_LOCATION_VALUE && (
        <Input
          value={value.custom}
          placeholder='e.g. Basement, guest bathroom'
          disabled={disabled}
          onChange={(event) => onValueChange({ ...value, custom: event.target.value })}
        />
      )}
    </div>
  );
}

interface LitterBoxFormValues {
  name: string;
  location: LocationChoice;
}

interface LitterBoxFormModalProps {
  isOpen: boolean;
  initialBox?: LitterBox | null;
  existingLocations: string[];
  isSubmitting: boolean;
  onSubmit: (box: { name: string; location: string | null }) => Promise<void> | void;
  onDelete?: (boxId: string) => Promise<void> | void;
  onCancel: () => void;
}

function LitterBoxFormModal({
  isOpen,
  initialBox,
  existingLocations,
  isSubmitting,
  onSubmit,
  onDelete,
  onCancel,
}: LitterBoxFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialBox?.id);
  const formId = initialBox?.id ?? 'new-nine-lives-litter-box';
  const [isValid, setIsValid] = useState(Boolean(initialBox?.name));

  const fields = useMemo(
    () => [
      input({
        name: 'name',
        label: 'Litter box name',
        placeholder: 'Main litter box',
        required: true,
        variant: 'outline',
      }),
      custom({
        name: 'location',
        label: 'Location',
        renderComponent: ({ value, onValueChange, disabled }) => (
          <LocationField
            value={value as LocationChoice}
            onValueChange={onValueChange}
            disabled={disabled}
            existingLocations={existingLocations}
          />
        ),
      }),
    ],
    [existingLocations],
  );

  const handleSubmit = async (data: LitterBoxFormValues) => {
    const name = data.name.trim();

    if (!name) {
      return;
    }

    const location =
      data.location.value === NEW_LOCATION_VALUE
        ? data.location.custom.trim() || null
        : data.location.value || null;

    await onSubmit({ name, location });
  };

  const handleDelete = async () => {
    if (!initialBox?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete litter box',
      message: `Are you sure you want to delete ${initialBox.name}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialBox.id);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={isEditing ? 'Edit litter box' : 'Add litter box'}>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          name: initialBox?.name ?? '',
          location: { value: initialBox?.location ?? '', custom: '' },
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as LitterBoxFormValues;
          setIsValid(Boolean(values.name?.trim()));
        }}
        onSubmit={(data) => {
          void handleSubmit(data as LitterBoxFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            <div>
              {isEditing && onDelete && (
                <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                  Delete
                </Button>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save litter box' : 'Add litter box'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

interface LitterBoxItemProps {
  box: LitterBox;
  selected?: boolean;
  onClick?: (box: LitterBox) => void;
}

function LitterBoxItem({ box, selected = false, onClick }: LitterBoxItemProps) {
  return (
    <button
      type='button'
      onClick={() => onClick?.(box)}
      className={join(
        'min-w-32 rounded-lg border-2 border-border p-3 text-left transition hover:bg-muted/40',
        selected && 'bg-muted/60 ring-2 ring-primary',
        !box.isActive && 'opacity-60',
      )}
    >
      <p className='font-medium leading-tight'>{box.name}</p>
      {box.location && <p className='text-muted-foreground text-sm leading-tight'>{box.location}</p>}
      {!box.isActive && <p className='text-muted-foreground text-sm leading-tight'>Inactive</p>}
    </button>
  );
}

interface LitterFormValues {
  brand: string;
  litterType: LitterTypeChoice;
  weight: string;
  weightUnit: string;
  costOpen?: boolean;
  cost?: string;
}

interface LitterFormModalProps {
  isOpen: boolean;
  householdId: string;
  uid: string;
  initialLitter?: Litter | null;
  customTypes: CustomLitterType[];
  isSubmitting: boolean;
  onSubmit: (litter: {
    brand: string;
    litterType: LitterType;
    customLitterTypeId: string | null;
    weight: number;
    weightUnit: 'lb' | 'kg';
    cost: number | null;
  }) => Promise<void> | void;
  onDelete?: (litterId: string) => Promise<void> | void;
  onCancel: () => void;
}

function LitterFormModal({
  isOpen,
  householdId,
  uid,
  initialLitter,
  customTypes,
  isSubmitting,
  onSubmit,
  onDelete,
  onCancel,
}: LitterFormModalProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialLitter?.id);
  const formId = initialLitter?.id ?? 'new-nine-lives-litter';
  const [isCostOpen, setIsCostOpen] = useState(Boolean(initialLitter?.cost));
  const [isValid, setIsValid] = useState(
    Boolean(initialLitter?.brand && initialLitter.weight > 0),
  );

  const fields = useMemo(
    () => [
      input({
        name: 'brand',
        label: 'Litter brand',
        placeholder: 'e.g. Tidy Cats',
        required: true,
        variant: 'outline',
      }),
      custom({
        name: 'litterType',
        label: 'Litter type',
        required: true,
        renderComponent: ({ value, onValueChange, disabled }) => (
          <LitterTypeField
            value={value as LitterTypeChoice}
            onValueChange={onValueChange}
            disabled={disabled}
            customTypes={customTypes}
          />
        ),
      }),
      input({
        name: 'weight',
        label: 'Bag weight',
        type: 'number',
        placeholder: '20',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'weightUnit',
        label: 'Weight unit',
        options: unitOptions,
      }),
      isCostOpen
        ? input({
            name: 'cost',
            label: 'Cost',
            type: 'number',
            placeholder: '24.99',
            variant: 'outline',
          })
        : custom({
            name: '_addCost',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setIsCostOpen(true)}
              >
                + Add cost
              </Button>
            ),
          }),
    ],
    [customTypes, isCostOpen],
  );

  const initialLitterType: LitterTypeChoice = {
    value: initialLitter?.litterType ?? 'clumping_clay',
    customLitterTypeId: initialLitter?.customLitterTypeId ?? null,
    customLabel: '',
  };

  const handleSubmit = async (data: LitterFormValues) => {
    const brand = data.brand.trim();
    const weight = Number(data.weight);
    const cost = isCostOpen && data.cost?.trim() ? Number(data.cost) : null;

    if (
      !brand ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      (data.litterType.value === 'custom' && !data.litterType.customLitterTypeId) ||
      (data.litterType.value === NEW_LITTER_TYPE_VALUE && !data.litterType.customLabel.trim()) ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0))
    ) {
      return;
    }

    const litterType: LitterType = data.litterType.value === NEW_LITTER_TYPE_VALUE
      ? 'custom'
      : (data.litterType.value as LitterType);
    let customLitterTypeId = data.litterType.customLitterTypeId;

    if (data.litterType.value === NEW_LITTER_TYPE_VALUE) {
      const customType = await dispatch(
        createCustomLitterType({
          householdId,
          uid,
          label: data.litterType.customLabel,
        }),
      ).unwrap();
      customLitterTypeId = customType.id;
    }

    await onSubmit({
      brand,
      litterType,
      customLitterTypeId: litterType === 'custom' ? customLitterTypeId : null,
      weight,
      weightUnit: data.weightUnit === 'kg' ? 'kg' : 'lb',
      cost,
    });
  };

  const handleDelete = async () => {
    if (!initialLitter?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete litter',
      message: `Are you sure you want to delete ${initialLitter.brand}? This action cannot be undone.`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialLitter.id);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={isEditing ? 'Edit litter' : 'Add litter'}>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          brand: initialLitter?.brand ?? '',
          litterType: initialLitterType,
          weight: initialLitter?.weight?.toString() ?? '',
          weightUnit: initialLitter?.weightUnit ?? 'lb',
          cost: initialLitter?.cost?.toString() ?? '',
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as LitterFormValues;
          setIsValid(
            Boolean(
              values.brand?.trim() &&
                Number.isFinite(Number(values.weight)) &&
                Number(values.weight) > 0,
            ),
          );
        }}
        onSubmit={(data) => {
          void handleSubmit(data as LitterFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            <div>
              {isEditing && onDelete && (
                <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                  Delete
                </Button>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save litter' : 'Add litter'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

interface LittersManagerProps {
  householdId: string;
}

function LittersManager({ householdId }: LittersManagerProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const customTypes = useAppSelector(selectCustomLitterTypesByHousehold(householdId), shallowEqual);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLitter, setEditingLitter] = useState<Litter | null>(null);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingLitter(null);
  };

  const handleSubmit = async (litter: {
    brand: string;
    litterType: LitterType;
    customLitterTypeId: string | null;
    weight: number;
    weightUnit: 'lb' | 'kg';
    cost: number | null;
  }) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingLitter) {
        await dispatch(
          updateLitter({ householdId, litterId: editingLitter.id, changes: litter }),
        ).unwrap();
      } else {
        await dispatch(createLitter({ householdId, uid: user.uid, litter })).unwrap();
      }
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (litterId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteLitter({ householdId, litterId })).unwrap();
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex justify-end'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className={mutedLinkClassName}
          onClick={() => {
            setEditingLitter(null);
            setIsFormOpen(true);
          }}
        >
          + Add litter
        </Button>
      </div>

      {litters.length === 0 && (
        <p className='text-muted-foreground text-sm'>No litter products added yet.</p>
      )}

      {litters.length > 0 && (
        <div className='divide-border divide-y'>
          {litters.map((litter) => (
            <div key={litter.id} className='flex items-center justify-between gap-3 py-2 first:pt-0'>
              <div className='min-w-0'>
                <div className='text-sm'>{litter.brand}</div>
                <div className='text-muted-foreground text-sm'>
                  {getLitterTypeLabel(litter.litterType, litter.customLitterTypeId, customTypes)}
                  {' · '}
                  {formatWeight(litter.weight, litter.weightUnit)}
                  {litter.cost !== null && ` · $${litter.cost.toFixed(2)}`}
                </div>
              </div>
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={() => {
                  setEditingLitter(litter);
                  setIsFormOpen(true);
                }}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}

      <LitterFormModal
        key={editingLitter?.id ?? 'new'}
        isOpen={isFormOpen}
        householdId={householdId}
        uid={user?.uid ?? ''}
        initialLitter={editingLitter}
        customTypes={customTypes}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingLitter ? handleDelete : undefined}
        onCancel={closeForm}
      />
    </div>
  );
}

type RefillType = 'none' | 'topped_off' | 'full_change';

const refillTypeOptions = [
  { label: 'No — just weighing it', value: 'none' },
  { label: 'Yes — topped off (box not emptied)', value: 'topped_off' },
  { label: 'Yes — fully emptied and refilled', value: 'full_change' },
];

interface LitterEntryFormValues {
  litterId: string;
  weightBefore: string;
  weightUnit: string;
  loggedAt: string;
  refillType: RefillType;
  refillWeight?: string;
  notesOpen?: boolean;
  notes?: string;
}

interface LitterEntryFormModalProps {
  isOpen: boolean;
  litterBoxId: string;
  initialEntry?: LitterEntry | null;
  litters: Litter[];
  customTypes: CustomLitterType[];
  isSubmitting: boolean;
  onSubmit: (entry: Partial<LitterEntry>) => Promise<void> | void;
  onDelete?: (entryId: string) => Promise<void> | void;
  onCancel: () => void;
}

function LitterEntryFormModal({
  isOpen,
  litterBoxId,
  initialEntry,
  litters,
  customTypes,
  isSubmitting,
  onSubmit,
  onDelete,
  onCancel,
}: LitterEntryFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialEntry?.id);
  const formId = initialEntry?.id ?? 'new-nine-lives-litter-entry';
  const [isNotesOpen, setIsNotesOpen] = useState(Boolean(initialEntry?.notes));
  const [refillType, setRefillType] = useState<RefillType>(
    initialEntry?.refillWeight == null ? 'none' : initialEntry.isFullChange ? 'full_change' : 'topped_off',
  );
  const [isValid, setIsValid] = useState(
    Boolean(initialEntry?.litterId && initialEntry.weightBefore > 0 && initialEntry.loggedAt),
  );

  const litterOptions = useMemo(
    () =>
      litters.map((litter) => ({
        label: `${litter.brand} (${getLitterTypeLabel(litter.litterType, litter.customLitterTypeId, customTypes)})`,
        value: litter.id,
      })),
    [litters, customTypes],
  );

  const fields = useMemo(
    () => [
      select({
        name: 'litterId',
        label: 'Litter',
        options: litterOptions,
        required: true,
      }),
      input({
        name: 'weightBefore',
        label: 'Weight before',
        description: 'The box’s weight after sifting, before adding anything.',
        type: 'number',
        placeholder: '10',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'weightUnit',
        label: 'Weight unit',
        options: unitOptions,
      }),
      createDateInputField({
        name: 'loggedAt',
        label: 'Weigh-in date',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'refillType',
        label: 'Litter added?',
        options: refillTypeOptions,
      }),
      ...(refillType !== 'none'
        ? [
            input({
              name: 'refillWeight',
              label: 'Weight after refill',
              description: 'The box’s weight after adding litter.',
              type: 'number',
              placeholder: '20',
              required: true,
              variant: 'outline',
            }),
          ]
        : []),
      isNotesOpen
        ? textarea({
            name: 'notes',
            label: 'Notes',
            placeholder: 'Refill, cleanup, or other context',
            rows: 3,
            variant: 'outline',
          })
        : custom({
            name: '_addNotes',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setIsNotesOpen(true)}
              >
                + Add notes
              </Button>
            ),
          }),
    ],
    [litterOptions, refillType, isNotesOpen],
  );

  const handleSubmit = async (data: LitterEntryFormValues) => {
    const weightBefore = Number(data.weightBefore);
    const loggedAt = fromDateInputValue(data.loggedAt);
    const now = Date.now();
    const refillWeight = data.refillType !== 'none' ? Number(data.refillWeight) : null;

    if (
      !data.litterId ||
      !Number.isFinite(weightBefore) ||
      weightBefore <= 0 ||
      loggedAt === undefined ||
      loggedAt > now ||
      (refillWeight !== null && (!Number.isFinite(refillWeight) || refillWeight <= 0))
    ) {
      return;
    }

    await onSubmit({
      id: initialEntry?.id,
      litterBoxId,
      litterId: data.litterId,
      weightBefore,
      weightUnit: data.weightUnit === 'kg' ? 'kg' : 'lb',
      refillWeight,
      isFullChange: data.refillType === 'full_change',
      loggedAt,
      notes: isNotesOpen ? data.notes?.trim() || null : null,
    });
  };

  const handleDelete = async () => {
    if (!initialEntry?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete litter entry',
      message: 'Are you sure you want to delete this litter weigh-in?',
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialEntry.id);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={isEditing ? 'Edit litter entry' : 'Log litter weigh-in'}>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          litterId: initialEntry?.litterId ?? litters[0]?.id ?? '',
          weightBefore: initialEntry?.weightBefore?.toString() ?? '',
          weightUnit: initialEntry?.weightUnit ?? 'lb',
          loggedAt: toDateInputValue(initialEntry?.loggedAt),
          refillType,
          refillWeight: initialEntry?.refillWeight?.toString() ?? '',
          notes: initialEntry?.notes ?? '',
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as LitterEntryFormValues;
          const now = Date.now();
          const loggedAt = values.loggedAt ? fromDateInputValue(values.loggedAt) : undefined;

          if (values.refillType !== refillType) {
            setRefillType(values.refillType);
          }

          setIsValid(
            Boolean(
              values.litterId &&
                Number.isFinite(Number(values.weightBefore)) &&
                Number(values.weightBefore) > 0 &&
                loggedAt !== undefined &&
                loggedAt <= now &&
                (values.refillType === 'none' ||
                  (Number.isFinite(Number(values.refillWeight)) && Number(values.refillWeight) > 0)),
            ),
          );
        }}
        onSubmit={(data) => {
          void handleSubmit(data as LitterEntryFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            <div>
              {isEditing && onDelete && (
                <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                  Delete
                </Button>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <Button type='button' variant='secondary' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save litter entry' : 'Log litter weigh-in'}
              </Button>
            </div>
          </div>
        }
      />
    </Modal>
  );
}

const sortOptions = [
  { text: 'Newest first', value: 'newest' },
  { text: 'Oldest first', value: 'oldest' },
];

interface SelectedLitterBoxPanelProps {
  householdId: string;
  box: LitterBox;
  onEditDetails: () => void;
}

function SelectedLitterBoxPanel({ householdId, box, onEditDetails }: SelectedLitterBoxPanelProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const customTypes = useAppSelector(selectCustomLitterTypesByHousehold(householdId), shallowEqual);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LitterEntry | null>(null);
  const [sortOption, setSortOption] = useState<'newest' | 'oldest'>('newest');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [activeView, setActiveView] = useState<ViewToggleValue>('list');

  const littersById = useMemo(() => new Map(litters.map((litter) => [litter.id, litter])), [litters]);

  const boxEntriesAscending = useMemo(
    () =>
      entries
        .filter((entry) => entry.litterBoxId === box.id)
        .sort((left, right) => left.loggedAt - right.loggedAt),
    [entries, box.id],
  );

  const latestChangedAt = useMemo(
    () =>
      boxEntriesAscending.reduce<number | null>(
        (latest, entry) => (entry.isFullChange && entry.loggedAt > (latest ?? 0) ? entry.loggedAt : latest),
        null,
      ),
    [boxEntriesAscending],
  );

  const entriesWithUsage = useMemo(
    () =>
      boxEntriesAscending.map((entry, index) => {
        const previous = index > 0 ? boxEntriesAscending[index - 1] : null;
        const usage = previous
          ? convertWeight(getLitterEntryEndingWeight(previous), previous.weightUnit, entry.weightUnit) -
            entry.weightBefore
          : null;
        const litter = littersById.get(entry.litterId) ?? null;
        const usageCost =
          usage !== null && usage > 0 && litter ? calculateLitterUsageCost(usage, entry.weightUnit, litter) : null;

        return { entry, index, usage, usageCost, litter };
      }),
    [boxEntriesAscending, littersById],
  );

  const visibleListEntries = useMemo(
    () =>
      entriesWithUsage
        .filter(({ entry }) => !showOnlyChanges || entry.isFullChange)
        .sort((left, right) => (sortOption === 'newest' ? right.index - left.index : left.index - right.index)),
    [entriesWithUsage, showOnlyChanges, sortOption],
  );
  const {
    page: entriesPage,
    pageCount: entriesPageCount,
    setPage: setEntriesPage,
    pagedItems: pagedListEntries,
    shouldPaginate: shouldPaginateEntries,
  } = usePagination(visibleListEntries, 5);

  const chartUnit = boxEntriesAscending[boxEntriesAscending.length - 1]?.weightUnit ?? 'lb';
  const usageChartData = useMemo(
    () =>
      entriesWithUsage
        .filter(({ usage }) => usage !== null && usage >= 0)
        .map(({ entry, usage }) => ({
          x: entry.loggedAt,
          y: convertWeight(usage as number, entry.weightUnit, chartUnit),
        })),
    [entriesWithUsage, chartUnit],
  );

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEntry(null);
  };

  const handleSubmit = async (entry: Partial<LitterEntry>) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingEntry) {
        await dispatch(
          updateLitterEntry({
            householdId,
            entryId: editingEntry.id,
            changes: entry,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createLitterEntry({
            householdId,
            uid: user.uid,
            litterEntry: entry as Partial<LitterEntry> &
              Pick<LitterEntry, 'litterBoxId' | 'litterId' | 'weightBefore' | 'weightUnit' | 'loggedAt'>,
          }),
        ).unwrap();
      }
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteLitterEntry({ householdId, entryId })).unwrap();
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    await dispatch(
      updateLitterBox({ householdId, litterBoxId: box.id, changes: { isActive: !box.isActive } }),
    ).unwrap();
  };

  const canLogEntry = box.isActive && litters.length > 0;

  return (
    <div className='bg-background border-border mt-6 rounded-lg border p-4'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='text-lg font-semibold'>
            {box.name}
            {!box.isActive && <span className='text-muted-foreground text-sm font-normal'> (inactive)</span>}
          </h3>
          {box.location && <p className='text-muted-foreground text-sm'>{box.location}</p>}
          {latestChangedAt !== null && (
            <p className='text-muted-foreground text-sm'>
              {getDaysSince(latestChangedAt) === 0
                ? 'Litter changed today'
                : `${getDaysSince(latestChangedAt)} day${getDaysSince(latestChangedAt) === 1 ? '' : 's'} since litter changed`}
            </p>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button type='button' variant='secondary' size='sm' onClick={() => void handleToggleActive()}>
            {box.isActive ? 'Archive' : 'Reactivate'}
          </Button>
          <Button type='button' variant='secondary' size='sm' onClick={onEditDetails}>
            Edit details
          </Button>
        </div>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-4'>
        <span className='text-muted-foreground text-sm'>
          {boxEntriesAscending.length} weigh-in{boxEntriesAscending.length === 1 ? '' : 's'} logged
        </span>
        {canLogEntry ? (
          <Button
            type='button'
            size='sm'
            onClick={() => {
              setEditingEntry(null);
              setIsFormOpen(true);
            }}
          >
            Log weigh-in
          </Button>
        ) : (
          !box.isActive && (
            <span className='text-muted-foreground text-sm'>Reactivate this box to log a new weigh-in.</span>
          )
        )}
      </div>

      {box.isActive && litters.length === 0 && (
        <p className='text-muted-foreground mt-2 text-sm'>
          Add a litter product above before logging a weigh-in.
        </p>
      )}

      {boxEntriesAscending.length > 1 && (
        <div className='mt-3'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <div className='flex items-center gap-2'>
                <span className='text-muted-foreground text-sm'>Sort by:</span>
                <div className='max-w-40 flex-1'>
                  <Select
                    options={sortOptions}
                    value={sortOption}
                    onChange={(value) => setSortOption(value as 'newest' | 'oldest')}
                    size='sm'
                  />
                </div>
              </div>
              {boxEntriesAscending.some((entry) => entry.isFullChange) && (
                <label className='flex items-center gap-2 text-sm'>
                  <Toggle checked={showOnlyChanges} onCheckedChange={setShowOnlyChanges} size='sm' />
                  Full changes only
                </label>
              )}
            </div>
            <ViewToggle value={activeView} onChange={setActiveView} />
          </div>

          {activeView === 'list' ? (
            <div>
            <div className='divide-border divide-y'>
              {pagedListEntries
                .map(({ entry, usage, usageCost, litter }) => {
                  const refillAmount = entry.refillWeight !== null ? entry.refillWeight - entry.weightBefore : null;
                  const litterLabel = litter
                    ? `${litter.brand} (${getLitterTypeLabel(litter.litterType, litter.customLitterTypeId, customTypes)})`
                    : 'Deleted litter';

                  return (
                    <div key={entry.id} className='flex items-start justify-between gap-3 py-3 first:pt-0'>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                          <strong className='text-sm'>{formatWeight(entry.weightBefore, entry.weightUnit)}</strong>
                          <span className='text-muted-foreground text-sm'>{formatDateTime(entry.loggedAt)}</span>
                          {entry.refillWeight !== null && (
                            <Badge variant={entry.isFullChange ? 'success' : 'muted'} size='xs'>
                              {entry.isFullChange ? 'Full change' : 'Topped off'}
                            </Badge>
                          )}
                        </div>
                        <div className='text-muted-foreground text-sm'>{litterLabel}</div>
                        {usage !== null && (
                          <div className='text-sm'>
                            {usage >= 0
                              ? `${formatWeight(usage, entry.weightUnit)} used since previous check`
                              : `${formatWeight(Math.abs(usage), entry.weightUnit)} more than expected since previous check`}
                            {usageCost !== null && ` (~$${usageCost.toFixed(2)})`}
                          </div>
                        )}
                        {entry.refillWeight !== null && (
                          <div className='text-muted-foreground text-sm'>
                            {entry.isFullChange ? 'Refilled' : 'Topped off'} to{' '}
                            {formatWeight(entry.refillWeight, entry.weightUnit)}
                            {refillAmount !== null && refillAmount > 0 && ` (+${formatWeight(refillAmount, entry.weightUnit)})`}
                          </div>
                        )}
                        {entry.notes && <div className='text-muted-foreground text-sm'>{entry.notes}</div>}
                      </div>
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        onClick={() => {
                          setEditingEntry(entry);
                          setIsFormOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  );
                })}
            </div>
            {shouldPaginateEntries && (
              <div className='mt-3 flex justify-center'>
                <Pagination
                  page={entriesPage}
                  pageCount={entriesPageCount}
                  onPageChange={setEntriesPage}
                  size='sm'
                  showFirstLast={entriesPageCount >= 5}
                />
              </div>
            )}
            </div>
          ) : (
            <TrendLineChart
              data={usageChartData}
              yLabel={`Usage (${chartUnit})`}
              formatY={(value: number) => `${value.toFixed(1)} ${chartUnit}`}
              emptyLabel='Log at least two weigh-ins to see a usage trend chart.'
            />
          )}
        </div>
      )}

      {boxEntriesAscending.length <= 1 && (
        <div className='mt-3'>
          {boxEntriesAscending.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No weigh-ins logged for this box yet.</p>
          ) : (
            entriesWithUsage.map(({ entry, litter }) => (
              <div key={entry.id} className='flex items-start justify-between gap-3 py-2'>
                <div className='min-w-0'>
                  <strong className='text-sm'>{formatWeight(entry.weightBefore, entry.weightUnit)}</strong>{' '}
                  <span className='text-muted-foreground text-sm'>{formatDateTime(entry.loggedAt)}</span>
                  <div className='text-muted-foreground text-sm'>
                    {litter
                      ? `${litter.brand} (${getLitterTypeLabel(litter.litterType, litter.customLitterTypeId, customTypes)})`
                      : 'Deleted litter'}
                  </div>
                </div>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  onClick={() => {
                    setEditingEntry(entry);
                    setIsFormOpen(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <LitterEntryFormModal
        key={editingEntry?.id ?? 'new'}
        isOpen={isFormOpen}
        litterBoxId={box.id}
        initialEntry={editingEntry}
        litters={litters}
        customTypes={customTypes}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingEntry ? handleDelete : undefined}
        onCancel={closeForm}
      />
    </div>
  );
}

interface LitterLogSectionProps {
  householdId: string;
}

function LitterLogSection({ householdId }: LitterLogSectionProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const [isBoxSubmitting, setIsBoxSubmitting] = useState(false);
  const [isBoxFormOpen, setIsBoxFormOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<LitterBox | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('boxes');
  const selectedBox = selectedBoxId ? litterBoxes.find((box) => box.id === selectedBoxId) ?? null : null;

  const existingLocations = useMemo(
    () =>
      Array.from(
        new Set(litterBoxes.map((box) => box.location).filter((location): location is string => Boolean(location))),
      ),
    [litterBoxes],
  );

  const closeBoxForm = () => {
    setIsBoxFormOpen(false);
    setEditingBox(null);
  };

  const handleSubmitBox = async (box: { name: string; location: string | null }) => {
    if (!user?.uid) {
      return;
    }

    setIsBoxSubmitting(true);

    try {
      if (editingBox) {
        await dispatch(
          updateLitterBox({ householdId, litterBoxId: editingBox.id, changes: box }),
        ).unwrap();
      } else {
        const createdBox = await dispatch(
          createLitterBox({ householdId, uid: user.uid, litterBox: box }),
        ).unwrap();
        setSelectedBoxId(createdBox.id);
      }
      closeBoxForm();
    } finally {
      setIsBoxSubmitting(false);
    }
  };

  const handleDeleteBox = async (litterBoxId: string) => {
    setIsBoxSubmitting(true);

    try {
      await dispatch(deleteLitterBox({ householdId, litterBoxId })).unwrap();
      setSelectedBoxId((current) => (current === litterBoxId ? null : current));
      closeBoxForm();
    } finally {
      setIsBoxSubmitting(false);
    }
  };

  return (
    <section>
      <DetailsDisclosure label='Litter usage'>
        <div className='space-y-6'>
          <Tabs value={activeTab} onValueChange={setActiveTab} tabsWidth='full' variant='pills'>
            <TabsList>
              <TabsTrigger value='boxes'>Litter boxes ({litterBoxes.length})</TabsTrigger>
              <TabsTrigger value='products'>Litter products ({litters.length})</TabsTrigger>
            </TabsList>

            <TabsContent value='boxes' className='pt-2'>
              <div className='space-y-3'>
                <p className='text-muted-foreground text-sm'>
                  Weigh a box after sifting it to track how much litter gets used between checks. Only mark a
                  refill as a "full change" when you've emptied and completely refilled the box — that resets
                  the "time since changed" count without affecting your usage history.
                </p>

                <div className='flex justify-end'>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className={mutedLinkClassName}
                    onClick={() => {
                      setEditingBox(null);
                      setIsBoxFormOpen(true);
                    }}
                  >
                    + Add litter box
                  </Button>
                </div>

                {litterBoxes.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>No litter boxes added yet.</p>
                ) : (
                  <>
                    <div className='flex flex-wrap gap-3'>
                      {litterBoxes.map((box) => (
                        <LitterBoxItem
                          key={box.id}
                          box={box}
                          selected={box.id === selectedBoxId}
                          onClick={(clickedBox) =>
                            setSelectedBoxId((current) => (current === clickedBox.id ? null : clickedBox.id))
                          }
                        />
                      ))}
                    </div>
                    {!selectedBox && (
                      <p className='text-muted-foreground text-sm'>
                        Select a litter box to log a weigh-in and see its history.
                      </p>
                    )}
                  </>
                )}

                <LitterBoxFormModal
                  key={editingBox?.id ?? 'new'}
                  isOpen={isBoxFormOpen}
                  initialBox={editingBox}
                  existingLocations={existingLocations}
                  isSubmitting={isBoxSubmitting}
                  onSubmit={handleSubmitBox}
                  onDelete={editingBox ? handleDeleteBox : undefined}
                  onCancel={closeBoxForm}
                />
              </div>
            </TabsContent>

            <TabsContent value='products' className='pt-2'>
              <LittersManager householdId={householdId} />
            </TabsContent>
          </Tabs>

          {activeTab === 'boxes' && selectedBox && (
            <SelectedLitterBoxPanel
              key={selectedBox.id}
              householdId={householdId}
              box={selectedBox}
              onEditDetails={() => {
                setEditingBox(selectedBox);
                setIsBoxFormOpen(true);
              }}
            />
          )}
        </div>
      </DetailsDisclosure>
    </section>
  );
}

export default LitterLogSection;
