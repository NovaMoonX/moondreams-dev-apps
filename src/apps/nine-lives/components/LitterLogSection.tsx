import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Badge,
  Button,
  Form,
  FormFactories,
  Input,
  Modal,
  Pagination,
  Popover,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Info } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import AppToggle from '@/components/AppToggle';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';
import {
  DEFAULT_LITTER_FILL_DEPTH,
  DEFAULT_LITTER_FILL_DEPTH_UNIT,
  LITTER_DEPTH_UNIT_OPTIONS,
  LITTER_TYPE_LABELS,
  LITTER_WEIGHT_UNIT_OPTIONS,
} from '@apps/nine-lives/constants/litter';
import { LITTER_TYPE_OPTIONS } from '@apps/nine-lives/constants/presetOptions';
import { useAttentionFocus } from '@apps/nine-lives/context/attentionFocusContext';
import { createCustomLitterType } from '@apps/nine-lives/store/actions/customLitterTypesActions';
import {
  createLitterBox,
  deleteLitterBox,
  updateLitterBox,
} from '@apps/nine-lives/store/actions/litterBoxesActions';
import { createLitter, deleteLitter, updateLitter } from '@apps/nine-lives/store/actions/littersActions';
import {
  selectCustomLitterTypesByHousehold,
  selectLitterBoxesByHousehold,
  selectLitterEntriesByHousehold,
  selectLittersByHousehold,
} from '@apps/nine-lives/store/selectors';
import type {
  CustomLitterType,
  Litter,
  LitterBox,
  LitterDepthUnit,
  LitterEntry,
  LitterType,
} from '@apps/nine-lives/types';
import {
  calculateLitterUsageCost,
  convertWeight,
  formatLitterFillTarget,
  getLitterEntryEndingWeight,
  getLitterFillTarget,
  getLitterTypeLabel,
} from '@apps/nine-lives/utils/litterCalculators';
import { usePagination } from '@apps/nine-lives/utils/usePagination';

import DetailsDisclosure from './DetailsDisclosure';
import LitterEntryModal from './LitterEntryFormModal';
import TrendLineChart from './TrendLineChart';
import ViewToggle, { type ViewToggleValue } from './ViewToggle';

const { input, select, custom } = FormFactories;

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';
const NEW_LITTER_TYPE_VALUE = 'new-custom-litter-type';
const NEW_LOCATION_VALUE = 'new-location';

function formatWeight(weight: number, unit: 'lb' | 'kg') {
  return `${Number(weight.toFixed(2))} ${unit}`;
}

function getDaysSince(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return Math.max(0, days);
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
      text: LITTER_TYPE_LABELS[type],
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

interface FillLevelValue {
  depth: string;
  depthUnit: LitterDepthUnit;
  weight: string;
  weightUnit: 'lb' | 'kg';
}

interface LitterBoxFormValues {
  name: string;
  location: LocationChoice;
  fillLevel: FillLevelValue;
}

type LitterBoxDetails = Pick<
  LitterBox,
  'name' | 'location' | 'fillDepth' | 'fillDepthUnit' | 'fillWeight' | 'fillWeightUnit'
>;

function isBlankOrPositiveNumber(value: string) {
  return value.trim() === '' || (Number.isFinite(Number(value)) && Number(value) > 0);
}

function FillLevelField({
  value,
  onValueChange,
  disabled,
  isOpen,
  onOpen,
}: {
  value: FillLevelValue;
  onValueChange: (value: FillLevelValue) => void;
  disabled?: boolean;
  isOpen: boolean;
  onOpen: () => void;
}) {
  const summary = formatLitterFillTarget({
    depth: value.depth.trim() ? Number(value.depth) : null,
    depthUnit: value.depthUnit,
    weight: value.weight.trim() ? Number(value.weight) : null,
    weightUnit: value.weightUnit,
  });

  if (!isOpen) {
    return (
      <p className='text-muted-foreground text-sm'>
        {summary ? `Fills to ${summary}` : 'No fill level set'} ·{' '}
        <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={onOpen}>
          Change
        </Button>
      </p>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm'>
        How full a freshly changed box should be. Set a depth, a weight, or both.
      </p>
      <div className='flex items-center gap-2'>
        <Input
          type='number'
          inputMode='decimal'
          min={0}
          step='any'
          placeholder='Depth'
          aria-label='Fill depth'
          variant='outline'
          value={value.depth}
          disabled={disabled}
          onChange={(event) => onValueChange({ ...value, depth: event.target.value })}
        />
        <div className='w-24 shrink-0'>
          <Select
            options={LITTER_DEPTH_UNIT_OPTIONS.map((option) => ({ text: option.value, value: option.value }))}
            value={value.depthUnit}
            disabled={disabled}
            onChange={(next) => onValueChange({ ...value, depthUnit: next as LitterDepthUnit })}
          />
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <Input
          type='number'
          inputMode='decimal'
          min={0}
          step='any'
          placeholder='Weight'
          aria-label='Fill weight'
          variant='outline'
          value={value.weight}
          disabled={disabled}
          onChange={(event) => onValueChange({ ...value, weight: event.target.value })}
        />
        <div className='w-24 shrink-0'>
          <Select
            options={LITTER_WEIGHT_UNIT_OPTIONS.map((option) => ({ text: option.value, value: option.value }))}
            value={value.weightUnit}
            disabled={disabled}
            onChange={(next) => onValueChange({ ...value, weightUnit: next as 'lb' | 'kg' })}
          />
        </div>
      </div>
    </div>
  );
}

interface LitterBoxFormModalProps {
  isOpen: boolean;
  initialBox?: LitterBox | null;
  existingLocations: string[];
  isSubmitting: boolean;
  onSubmit: (box: LitterBoxDetails) => Promise<void> | void;
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
  const [isFillLevelOpen, setIsFillLevelOpen] = useState(false);

  const fillTarget = getLitterFillTarget(
    initialBox ?? {
      fillDepth: DEFAULT_LITTER_FILL_DEPTH,
      fillDepthUnit: DEFAULT_LITTER_FILL_DEPTH_UNIT,
      fillWeight: null,
      fillWeightUnit: 'lb',
    },
  );

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
      custom({
        name: 'fillLevel',
        label: 'Fill level',
        renderComponent: ({ value, onValueChange, disabled }) => (
          <FillLevelField
            value={value as FillLevelValue}
            onValueChange={onValueChange}
            disabled={disabled}
            isOpen={isFillLevelOpen}
            onOpen={() => setIsFillLevelOpen(true)}
          />
        ),
      }),
    ],
    [existingLocations, isFillLevelOpen],
  );

  const handleSubmit = async (data: LitterBoxFormValues) => {
    const name = data.name.trim();

    if (!name || !isBlankOrPositiveNumber(data.fillLevel.depth) || !isBlankOrPositiveNumber(data.fillLevel.weight)) {
      return;
    }

    const location =
      data.location.value === NEW_LOCATION_VALUE
        ? data.location.custom.trim() || null
        : data.location.value || null;

    await onSubmit({
      name,
      location,
      fillDepth: data.fillLevel.depth.trim() ? Number(data.fillLevel.depth) : null,
      fillDepthUnit: data.fillLevel.depthUnit,
      fillWeight: data.fillLevel.weight.trim() ? Number(data.fillLevel.weight) : null,
      fillWeightUnit: data.fillLevel.weightUnit,
    });
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
    <Modal isOpen={isOpen} onClose={onCancel} title='Litter box'>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          name: initialBox?.name ?? '',
          location: { value: initialBox?.location ?? '', custom: '' },
          fillLevel: {
            depth: fillTarget.depth?.toString() ?? '',
            depthUnit: fillTarget.depthUnit,
            weight: fillTarget.weight?.toString() ?? '',
            weightUnit: fillTarget.weightUnit,
          },
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as LitterBoxFormValues;
          setIsValid(
            Boolean(values.name?.trim()) &&
              isBlankOrPositiveNumber(values.fillLevel.depth) &&
              isBlankOrPositiveNumber(values.fillLevel.weight),
          );
        }}
        onSubmit={(data) => {
          void handleSubmit(data as LitterBoxFormValues);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={isEditing && onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />}
            rightActions={
              <>
                <Button type='button' variant='secondary' onClick={onCancel}>
                  Cancel
                </Button>
                <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isValid}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
        }
      />
    </Modal>
  );
}

interface LitterBoxItemProps {
  box: LitterBox;
  selected?: boolean;
  /** True while this box's log-entry modal is open — from any trigger, not just this button. */
  hasOpenModal?: boolean;
  onClick?: (box: LitterBox) => void;
}

function LitterBoxItem({ box, selected = false, hasOpenModal = false, onClick }: LitterBoxItemProps) {
  return (
    <button
      type='button'
      onClick={() => onClick?.(box)}
      className={join(
        'min-w-32 rounded-lg border-2 border-border p-3 text-left transition hover:bg-muted/40',
        selected && 'bg-muted/60 ring-2 ring-primary',
        hasOpenModal && 'bg-primary/10',
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
        options: LITTER_WEIGHT_UNIT_OPTIONS,
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
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Add'}
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

const sortOptions = [
  { text: 'Newest first', value: 'newest' },
  { text: 'Oldest first', value: 'oldest' },
];

interface SelectedLitterBoxPanelProps {
  householdId: string;
  box: LitterBox;
  onEditDetails: () => void;
  /** Set to open the log-entry modal directly, in "new entry" mode, without the user hunting for the button. */
  autoOpenEntry?: { requestedAt: number };
  onModalOpenChange?: (isOpen: boolean) => void;
}

function SelectedLitterBoxPanel({
  householdId,
  box,
  onEditDetails,
  autoOpenEntry,
  onModalOpenChange,
}: SelectedLitterBoxPanelProps) {
  const dispatch = useAppDispatch();
  const entries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LitterEntry | null>(null);
  const [handledAutoOpenAt, setHandledAutoOpenAt] = useState(autoOpenEntry?.requestedAt);

  useEffect(() => {
    onModalOpenChange?.(isFormOpen);
    // Only report state changes, not on every re-render from an identity change of the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen]);

  if (autoOpenEntry && autoOpenEntry.requestedAt !== handledAutoOpenAt) {
    setHandledAutoOpenAt(autoOpenEntry.requestedAt);
    setEditingEntry(null);
    setIsFormOpen(true);
  }
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

  const renderEntryRow = ({ entry, usage, usageCost }: (typeof entriesWithUsage)[number]) => {
    const endingDepth = entry.depthAfter ?? entry.depthBefore;

    return (
      <div key={entry.id} className='flex items-center justify-between gap-3 py-3 first:pt-0'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <strong>{formatWeight(getLitterEntryEndingWeight(entry), entry.weightUnit)}</strong>
            {endingDepth !== null && endingDepth !== undefined && (
              <span className='text-muted-foreground text-sm'>
                {endingDepth} {entry.depthUnit ?? 'in'}
              </span>
            )}
            {entry.refillWeight !== null && (
              <Badge variant={entry.isFullChange ? 'success' : 'muted'} size='xs'>
                {entry.isFullChange ? 'Full change' : 'Topped off'}
              </Badge>
            )}
          </div>
          <div className='text-muted-foreground text-sm'>
            {[
              formatDateTime(entry.loggedAt),
              usage === null
                ? null
                : usage >= 0
                  ? `Used ${formatWeight(usage, entry.weightUnit)}${usageCost !== null ? ` (~$${usageCost.toFixed(2)})` : ''}`
                  : `Up ${formatWeight(Math.abs(usage), entry.weightUnit)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            {usage !== null && usage < 0 && (
              <Popover
                placement='bottom'
                className='w-64 p-3 text-sm'
                trigger={
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label='What does this mean?'
                    className='ml-1 inline-flex size-6 align-middle'
                  >
                    <Info className='h-3.5 w-3.5' />
                  </Button>
                }
              >
                The box weighed more than the last check left it at. That usually means litter was added without
                being logged.
              </Popover>
            )}
          </div>
          {entry.notes && <div className='text-muted-foreground truncate text-sm'>{entry.notes}</div>}
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
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEntry(null);
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
                  <AppToggle checked={showOnlyChanges} onCheckedChange={setShowOnlyChanges} size='sm' />
                  Full changes only
                </label>
              )}
            </div>
            <ViewToggle value={activeView} onChange={setActiveView} />
          </div>

          {activeView === 'list' ? (
            <div>
            <div className='divide-border divide-y'>
              {pagedListEntries.map(renderEntryRow)}
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
              emptyLabel={
                boxEntriesAscending.length < 3
                  ? 'Usage is measured between weigh-ins, so the chart appears after your third one.'
                  : 'Not enough measured usage yet. Weigh-ins where the box ended up heavier than expected are left out.'
              }
            />
          )}
        </div>
      )}

      {boxEntriesAscending.length <= 1 && (
        <div className='mt-3'>
          {boxEntriesAscending.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No weigh-ins logged for this box yet.</p>
          ) : (
            entriesWithUsage.map(renderEntryRow)
          )}
        </div>
      )}

      <LitterEntryModal
        householdId={householdId}
        box={box}
        editingEntry={editingEntry}
        isOpen={isFormOpen}
        onClose={closeForm}
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
  const { focusRequest } = useAttentionFocus();
  const litterBoxes = useAppSelector(selectLitterBoxesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const [isBoxSubmitting, setIsBoxSubmitting] = useState(false);
  const [isBoxFormOpen, setIsBoxFormOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<LitterBox | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('boxes');
  const [modalOpenBoxId, setModalOpenBoxId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const selectedBox = selectedBoxId ? litterBoxes.find((box) => box.id === selectedBoxId) ?? null : null;

  const litterLogFocusRequest = focusRequest?.kind === 'litter-log' ? focusRequest : null;
  const [handledLitterLogRequestedAt, setHandledLitterLogRequestedAt] = useState<number | undefined>(
    undefined,
  );

  if (litterLogFocusRequest && litterLogFocusRequest.requestedAt !== handledLitterLogRequestedAt) {
    setHandledLitterLogRequestedAt(litterLogFocusRequest.requestedAt);
    setActiveTab('boxes');
    setSelectedBoxId(litterLogFocusRequest.litterBoxId);
  }

  useEffect(() => {
    if (!litterLogFocusRequest) {
      return;
    }

    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [litterLogFocusRequest]);

  const autoOpenEntry =
    litterLogFocusRequest && litterLogFocusRequest.litterBoxId === selectedBoxId
      ? { requestedAt: litterLogFocusRequest.requestedAt }
      : undefined;

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

  const handleSubmitBox = async (box: LitterBoxDetails) => {
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
    <section ref={sectionRef}>
      <DetailsDisclosure label='Litter usage' forceOpenAt={litterLogFocusRequest?.requestedAt}>
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
                          hasOpenModal={box.id === modalOpenBoxId}
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
              autoOpenEntry={autoOpenEntry}
              onModalOpenChange={(isOpen) => setModalOpenBoxId(isOpen ? selectedBox.id : null)}
            />
          )}
        </div>
      </DetailsDisclosure>
    </section>
  );
}

export default LitterLogSection;
