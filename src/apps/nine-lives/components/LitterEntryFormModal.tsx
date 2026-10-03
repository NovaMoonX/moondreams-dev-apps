import { useMemo, useState } from 'react';

import { Button, Form, FormFactories, Input, Modal, Select } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { shallowEqual } from 'react-redux';

import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { fromLocalDateAndTimeInputValues, toLocalDateInputValue } from '@/utils/dateInputUtils';
import {
  LITTER_DEPTH_UNIT_OPTIONS,
  LITTER_GUIDE_SEEN_KEY,
  LITTER_WEIGHT_UNIT_OPTIONS,
} from '@apps/nine-lives/constants/litter';
import {
  createLitterEntry,
  deleteLitterEntry,
  updateLitterEntry,
} from '@apps/nine-lives/store/actions/litterEntriesActions';
import {
  selectCustomLitterTypesByHousehold,
  selectLitterEntriesByHousehold,
  selectLittersByHousehold,
} from '@apps/nine-lives/store/selectors';
import type { CustomLitterType, Litter, LitterBox, LitterDepthUnit, LitterEntry } from '@apps/nine-lives/types';
import {
  formatLitterFillTarget,
  getLitterFillTarget,
  getLitterTypeLabel,
} from '@apps/nine-lives/utils/litterCalculators';

import LitterWeighInGuide from './LitterWeighInGuide';

const { custom, input, textarea } = FormFactories;

type RefillType = 'none' | 'topped_off' | 'full_change';
type WeightUnit = 'lb' | 'kg';

const REFILL_OPTIONS: { label: string; value: RefillType }[] = [
  { label: 'Just weighing', value: 'none' },
  { label: 'Topped off', value: 'topped_off' },
  { label: 'Full change', value: 'full_change' },
];

const revealLinkClassName = 'h-auto p-0! text-muted-foreground hover:text-foreground';

interface WeightValue {
  amount: string;
  unit: WeightUnit;
}

interface DepthValue {
  before: string;
  after: string;
  unit: LitterDepthUnit;
}

interface LitterEntryFormValues {
  weightBefore: WeightValue;
  refillType: RefillType;
  refillWeight: string;
  depth: DepthValue;
  litterId: string;
  loggedAt: string;
  notes: string;
}

function isNonNegativeNumber(value: string) {
  return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isBlankOrNonNegativeNumber(value: string) {
  return value.trim() === '' || isNonNegativeNumber(value);
}

interface LitterEntryFormModalProps {
  box: LitterBox;
  initialEntry: LitterEntry | null;
  lastEntry: LitterEntry | null;
  litters: Litter[];
  customTypes: CustomLitterType[];
  isSubmitting: boolean;
  onSubmit: (entry: Partial<LitterEntry>) => Promise<void> | void;
  onDelete?: (entryId: string) => Promise<void> | void;
  onClose: () => void;
}

function LitterEntryFormModal({
  box,
  initialEntry,
  lastEntry,
  litters,
  customTypes,
  isSubmitting,
  onSubmit,
  onDelete,
  onClose,
}: LitterEntryFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialEntry);
  const fillTarget = getLitterFillTarget(box);
  const fillTargetText = formatLitterFillTarget(fillTarget);
  const [hasSeenGuide, setHasSeenGuide] = useLocalStoragePreference(LITTER_GUIDE_SEEN_KEY, false);
  const isFirstRunGuide = !isEditing && !hasSeenGuide;
  const today = toLocalDateInputValue(useNow(60_000));
  const [view, setView] = useState<'form' | 'guide'>(isFirstRunGuide ? 'guide' : 'form');

  const startingLitterId = initialEntry?.litterId ?? lastEntry?.litterId ?? litters[0]?.id ?? '';
  const [initialData] = useState<LitterEntryFormValues>(
    () => ({
      weightBefore: {
        amount: initialEntry ? String(initialEntry.weightBefore) : lastEntry ? '' : '0',
        unit: initialEntry?.weightUnit ?? lastEntry?.weightUnit ?? fillTarget.weightUnit,
      },
      refillType: !initialEntry || initialEntry.refillWeight === null
        ? 'none'
        : initialEntry.isFullChange
          ? 'full_change'
          : 'topped_off',
      refillWeight: initialEntry?.refillWeight?.toString() ?? '',
      depth: {
        before: initialEntry?.depthBefore?.toString() ?? '',
        after: initialEntry?.depthAfter?.toString() ?? '',
        unit: initialEntry?.depthUnit ?? fillTarget.depthUnit,
      },
      litterId: startingLitterId,
      loggedAt: initialEntry ? toLocalDateInputValue(initialEntry.loggedAt) : today,
      notes: initialEntry?.notes ?? '',
    }),
  );

  const [values, setValues] = useState(initialData);
  const [isDepthOpen, setIsDepthOpen] = useState(
    initialEntry?.depthBefore != null || initialEntry?.depthAfter != null,
  );
  const [isNotesOpen, setIsNotesOpen] = useState(Boolean(initialEntry?.notes));
  const [isDateOpen, setIsDateOpen] = useState(
    isEditing && toLocalDateInputValue(initialEntry?.loggedAt) !== today,
  );
  const [isLitterOpen, setIsLitterOpen] = useState(!litters.some((litter) => litter.id === startingLitterId));

  const litterOptions = useMemo(
    () =>
      litters.map((litter) => ({
        text: `${litter.brand} (${getLitterTypeLabel(litter.litterType, litter.customLitterTypeId, customTypes)})`,
        value: litter.id,
      })),
    [litters, customTypes],
  );

  const hasRefill = values.refillType !== 'none';

  const fields = useMemo(
    () => [
      custom({
        name: 'weightBefore',
        label: 'Weight now',
        description: 'After scooping, before adding litter. A new or empty box is 0.',
        required: true,
        renderComponent: ({ value, onValueChange, disabled }) => {
          const weight = value as WeightValue;

          return (
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                inputMode='decimal'
                min={0}
                step='any'
                placeholder='0'
                variant='outline'
                value={weight.amount}
                disabled={disabled}
                onChange={(event) => onValueChange({ ...weight, amount: event.target.value })}
              />
              <div className='w-28 shrink-0'>
                <Select
                  options={LITTER_WEIGHT_UNIT_OPTIONS.map((option) => ({
                    text: option.value,
                    value: option.value,
                  }))}
                  value={weight.unit}
                  disabled={disabled}
                  onChange={(next) => onValueChange({ ...weight, unit: next as WeightUnit })}
                />
              </div>
            </div>
          );
        },
      }),
      custom({
        name: 'refillType',
        label: 'Added litter?',
        renderComponent: ({ value, onValueChange, disabled }) => (
          <div className='grid grid-cols-3 gap-2'>
            {REFILL_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type='button'
                size='sm'
                variant={value === option.value ? 'primary' : 'outline'}
                disabled={disabled}
                aria-pressed={value === option.value}
                onClick={() => onValueChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        ),
      }),
      ...(hasRefill
        ? [
            input({
              name: 'refillWeight',
              label: `Weight after refill (${values.weightBefore.unit})`,
              description: fillTargetText ? `This box fills to ${fillTargetText}.` : undefined,
              type: 'number',
              placeholder: fillTarget.weight !== null ? String(fillTarget.weight) : undefined,
              required: true,
              variant: 'outline',
            }),
          ]
        : []),
      custom({
        name: 'depth',
        label: '',
        renderComponent: ({ value, onValueChange, disabled }) => {
          const depth = value as DepthValue;

          if (!isDepthOpen) {
            return (
              <Button type='button' variant='link' size='sm' className={revealLinkClassName} onClick={() => setIsDepthOpen(true)}>
                + Add litter depth
              </Button>
            );
          }

          return (
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-sm font-medium'>Litter depth</span>
                <Button type='button' variant='link' size='sm' className={revealLinkClassName} onClick={() => setIsDepthOpen(false)}>
                  Remove depth
                </Button>
              </div>
              <div className='flex items-center gap-2'>
                <Input
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  placeholder='Before'
                  aria-label='Depth before'
                  variant='outline'
                  value={depth.before}
                  disabled={disabled}
                  onChange={(event) => onValueChange({ ...depth, before: event.target.value })}
                />
                {hasRefill && (
                  <Input
                    type='number'
                    inputMode='decimal'
                    min={0}
                    step='any'
                    placeholder={fillTarget.depth !== null ? `After (${fillTarget.depth})` : 'After'}
                    aria-label='Depth after'
                    variant='outline'
                    value={depth.after}
                    disabled={disabled}
                    onChange={(event) => onValueChange({ ...depth, after: event.target.value })}
                  />
                )}
                <div className='w-24 shrink-0'>
                  <Select
                    options={LITTER_DEPTH_UNIT_OPTIONS.map((option) => ({
                      text: option.value,
                      value: option.value,
                    }))}
                    value={depth.unit}
                    disabled={disabled}
                    onChange={(next) => onValueChange({ ...depth, unit: next as LitterDepthUnit })}
                  />
                </div>
              </div>
            </div>
          );
        },
      }),
      custom({
        name: 'litterId',
        label: '',
        renderComponent: ({ value, onValueChange, disabled }) => {
          const selected = litters.find((litter) => litter.id === value);

          if (isLitterOpen) {
            return (
              <div className='space-y-1'>
                <span className='text-sm font-medium'>Litter</span>
                <Select
                  options={litterOptions}
                  value={value as string}
                  placeholder='Choose a litter'
                  disabled={disabled}
                  onChange={onValueChange}
                />
              </div>
            );
          }

          return (
            <p className='text-muted-foreground text-sm'>
              {selected ? `Using ${selected.brand}` : 'Litter not chosen'}
              {litters.length > 1 && (
                <>
                  {' · '}
                  <Button type='button' variant='link' size='sm' className={revealLinkClassName} onClick={() => setIsLitterOpen(true)}>
                    Change
                  </Button>
                </>
              )}
            </p>
          );
        },
      }),
      custom({
        name: 'loggedAt',
        label: '',
        renderComponent: ({ value, onValueChange, disabled }) =>
          isDateOpen ? (
            <div className='space-y-1'>
              <span className='text-sm font-medium'>Date</span>
              <Input
                type='date'
                variant='outline'
                value={value as string}
                max={today}
                disabled={disabled}
                onChange={(event) => onValueChange(event.target.value)}
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              Weighed today ·{' '}
              <Button type='button' variant='link' size='sm' className={revealLinkClassName} onClick={() => setIsDateOpen(true)}>
                Change date
              </Button>
            </p>
          ),
      }),
      isNotesOpen
        ? textarea({
            name: 'notes',
            label: 'Notes',
            placeholder: 'Anything worth remembering',
            rows: 2,
            variant: 'outline',
          })
        : custom({
            name: '_addNotes',
            label: '',
            renderComponent: () => (
              <Button type='button' variant='link' size='sm' className={revealLinkClassName} onClick={() => setIsNotesOpen(true)}>
                + Add note
              </Button>
            ),
          }),
    ],
    [
      hasRefill,
      values.weightBefore.unit,
      fillTarget.weight,
      fillTarget.depth,
      fillTargetText,
      isDepthOpen,
      isDateOpen,
      isLitterOpen,
      isNotesOpen,
      litters,
      litterOptions,
      today,
    ],
  );

  const isValid =
    Boolean(values.litterId) &&
    isNonNegativeNumber(values.weightBefore.amount) &&
    (!hasRefill || (Number.isFinite(Number(values.refillWeight)) && Number(values.refillWeight) > 0)) &&
    (!isDepthOpen ||
      (isBlankOrNonNegativeNumber(values.depth.before) && (!hasRefill || isBlankOrNonNegativeNumber(values.depth.after)))) &&
    values.loggedAt !== '' &&
    values.loggedAt <= today;

  const handleSubmit = async (data: LitterEntryFormValues) => {
    const getLoggedAt = () => {
      if (initialEntry && data.loggedAt === toLocalDateInputValue(initialEntry.loggedAt)) {
        return initialEntry.loggedAt;
      }

      return data.loggedAt === toLocalDateInputValue(Date.now())
        ? Date.now()
        : fromLocalDateAndTimeInputValues(data.loggedAt, '12:00');
    };
    const loggedAt = getLoggedAt();

    if (!isValid || loggedAt === undefined || loggedAt > Date.now()) {
      return;
    }

    const depthBefore = isDepthOpen && data.depth.before.trim() ? Number(data.depth.before) : null;
    const depthAfter = isDepthOpen && hasRefill && data.depth.after.trim() ? Number(data.depth.after) : null;

    await onSubmit({
      id: initialEntry?.id,
      litterBoxId: box.id,
      litterId: data.litterId,
      weightBefore: Number(data.weightBefore.amount),
      weightUnit: data.weightBefore.unit,
      refillWeight: hasRefill ? Number(data.refillWeight) : null,
      isFullChange: data.refillType === 'full_change',
      depthBefore,
      depthAfter,
      depthUnit: data.depth.unit,
      loggedAt,
      notes: isNotesOpen ? data.notes.trim() || null : null,
    });
  };

  const handleDelete = async () => {
    if (!initialEntry || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete weigh-in',
      message: 'Are you sure you want to delete this weigh-in? This action cannot be undone.',
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialEntry.id);
    }
  };

  const closeGuide = () => {
    setHasSeenGuide(true);
    setView('form');
  };

  return (
    <Modal isOpen onClose={onClose} title={view === 'guide' ? 'How to weigh in' : `${box.name} weigh-in`}>
      {view === 'guide' && (
        <div className='space-y-4'>
          {!isFirstRunGuide && (
            <Button type='button' variant='link' size='sm' className='h-auto gap-1 p-0' onClick={closeGuide}>
              <ChevronLeft className='h-4 w-4' /> Back
            </Button>
          )}
          <LitterWeighInGuide fillTargetText={fillTargetText} />
          <ModalFooterActions
            rightActions={
              isFirstRunGuide ? (
                <>
                  <Button type='button' variant='secondary' onClick={closeGuide}>
                    Skip
                  </Button>
                  <Button type='button' onClick={closeGuide}>
                    Start
                  </Button>
                </>
              ) : (
                <Button type='button' onClick={closeGuide}>
                  Got it
                </Button>
              )
            }
          />
        </div>
      )}

      <div className={join(view === 'guide' && 'hidden')}>
        <div className='mb-3 flex justify-end'>
          <Button type='button' variant='link' size='sm' className='h-auto p-0' onClick={() => setView('guide')}>
            How to weigh in
          </Button>
        </div>
        <Form
          id='nine-lives-litter-entry'
          form={fields}
          initialData={initialData}
          columns={1}
          spacing='normal'
          onDataChange={(data) => setValues(data as LitterEntryFormValues)}
          onSubmit={(data) => {
            void handleSubmit(data as LitterEntryFormValues);
          }}
          submitButton={
            <ModalFooterActions
              leftActions={isEditing && onDelete && <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />}
              rightActions={
                <>
                  <Button type='button' variant='secondary' onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type='submit' loading={isSubmitting} disabled={isSubmitting || !isValid}>
                    {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Log'}
                  </Button>
                </>
              }
            />
          }
        />
      </div>
    </Modal>
  );
}

interface LitterEntryModalProps {
  householdId: string;
  box: LitterBox;
  editingEntry: LitterEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

function LitterEntryModal({ householdId, box, editingEntry, isOpen, onClose }: LitterEntryModalProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(selectLitterEntriesByHousehold(householdId), shallowEqual);
  const litters = useAppSelector(selectLittersByHousehold(householdId), shallowEqual);
  const customTypes = useAppSelector(selectCustomLitterTypesByHousehold(householdId), shallowEqual);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lastEntry = useMemo(
    () =>
      entries
        .filter((entry) => entry.litterBoxId === box.id)
        .reduce<LitterEntry | null>((latest, entry) => (!latest || entry.loggedAt > latest.loggedAt ? entry : latest), null),
    [entries, box.id],
  );

  if (!isOpen || !user?.uid) {
    return null;
  }

  const handleSubmit = async (entry: Partial<LitterEntry>) => {
    setIsSubmitting(true);

    try {
      if (editingEntry) {
        await dispatch(
          updateLitterEntry({ householdId, entryId: editingEntry.id, reminderUid: user.uid, changes: entry }),
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
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteLitterEntry({ householdId, entryId, reminderUid: user.uid })).unwrap();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LitterEntryFormModal
      key={editingEntry?.id ?? `new-${box.id}`}
      box={box}
      initialEntry={editingEntry}
      lastEntry={lastEntry}
      litters={litters}
      customTypes={customTypes}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onDelete={editingEntry ? handleDelete : undefined}
      onClose={onClose}
    />
  );
}

export default LitterEntryModal;
