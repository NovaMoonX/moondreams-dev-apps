import { useMemo } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type { Cat, Visit, VisitReason } from '../types';
import type { VisitOutcome } from '../store/actions/visitsActions';
import { getDefaultVisitTitle } from '../utils/dateHelpers';
import DetailsDisclosure from './DetailsDisclosure';

interface VisitFormModalProps {
  isOpen: boolean;
  cats: Cat[];
  clinics?: Array<{ id: string; name: string }>;
  doctors?: Array<{ id: string; name: string; clinicId: string }>;
  visits?: Visit[];
  initialVisit?: Visit | null;
  isSubmitting?: boolean;
  isCompleting?: boolean;
  onSubmit: (
    visit: Partial<Visit> & Pick<Visit, 'catIds' | 'reason' | 'scheduledAt'>,
  ) => Promise<void> | void;
  onComplete?: (outcome: VisitOutcome) => Promise<void> | void;
  onCancelVisit?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

interface VisitReasonValue {
  reason: VisitReason;
  customReasonLabel: string;
  followUpOfVisitId: string;
  followUpNote: string;
}

interface VisitMoreDetailsValue {
  title: string;
  clinicId: string;
  doctorId: string;
}

interface VisitFormValues {
  catIds: string[];
  scheduledAt: VisitDateTimeValue;
  reasonDetails: VisitReasonValue;
  moreDetails: VisitMoreDetailsValue;
}

interface VisitOutcomeValues {
  summary: string;
  [key: string]: string | VisitOutcomeCatValue;
}

const { textarea, checkboxGroup, custom } = FormFactories;

const REASON_OPTIONS = [
  { label: 'Checkup', value: 'checkup' },
  { label: 'Illness', value: 'illness' },
  { label: 'Accident', value: 'accident' },
  { label: 'Vaccination', value: 'vaccination' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Custom', value: 'custom' },
];

interface VisitDateTimeValue {
  date: string;
  time: string;
}

function toDateInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeValue(value: VisitDateTimeValue) {
  if (!value.date) {
    return undefined;
  }

  const timestamp = new Date(
    `${value.date}T${value.time || '00:00'}`,
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

interface VisitDateTimeFieldProps {
  value: VisitDateTimeValue;
  onValueChange: (value: VisitDateTimeValue) => void;
  disabled?: boolean;
}

function VisitDateTimeField({
  value,
  onValueChange,
  disabled,
}: VisitDateTimeFieldProps) {
  const update = (changes: Partial<VisitDateTimeValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <div className='grid grid-cols-2 gap-3'>
      <div className='space-y-1'>
        <Label className='text-sm'>Date</Label>
        <Input
          type='date'
          value={value.date}
          onChange={(event) => update({ date: event.target.value })}
          variant='outline'
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-sm'>Time</Label>
        <Input
          type='time'
          value={value.time}
          onChange={(event) => update({ time: event.target.value })}
          variant='outline'
          disabled={disabled}
        />
      </div>
    </div>
  );
}

interface VisitReasonFieldProps {
  value: VisitReasonValue;
  onValueChange: (value: VisitReasonValue) => void;
  originalVisitOptions: Array<{ label: string; value: string }>;
  disabled?: boolean;
}

function VisitReasonField({
  value,
  onValueChange,
  originalVisitOptions,
  disabled,
}: VisitReasonFieldProps) {
  const update = (changes: Partial<VisitReasonValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <div className='space-y-3'>
      <Select
        options={REASON_OPTIONS.map((option) => ({
          text: option.label,
          value: option.value,
        }))}
        value={value.reason}
        onChange={(nextReason) => update({ reason: nextReason as VisitReason })}
        disabled={disabled}
      />

      {value.reason === 'custom' && (
        <div className='space-y-1'>
          <Label className='text-sm'>What's the visit for?</Label>
          <Input
            value={value.customReasonLabel}
            onChange={(event) =>
              update({ customReasonLabel: event.target.value })
            }
            placeholder='e.g. Nail trim'
            variant='outline'
            disabled={disabled}
          />
        </div>
      )}

      {value.reason === 'follow_up' && (
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label className='text-sm'>Original visit</Label>
            <Select
              options={originalVisitOptions.map((option) => ({
                text: option.label,
                value: option.value,
              }))}
              value={value.followUpOfVisitId}
              onChange={(nextValue) => update({ followUpOfVisitId: nextValue })}
              placeholder='Select the visit this follows up on'
              disabled={disabled}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-sm'>Follow-up note</Label>
            <Textarea
              rows={2}
              value={value.followUpNote}
              onChange={(event) => update({ followUpNote: event.target.value })}
              variant='outline'
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface VisitMoreDetailsFieldsProps {
  value: VisitMoreDetailsValue;
  onValueChange: (value: VisitMoreDetailsValue) => void;
  clinics: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

function VisitMoreDetailsFields({
  value,
  onValueChange,
  clinics,
  doctors,
  disabled,
}: VisitMoreDetailsFieldsProps) {
  const update = (changes: Partial<VisitMoreDetailsValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <DetailsDisclosure label='More details'>
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label className='text-sm'>Title override</Label>
          <Input
            value={value.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder='Leave blank for the default title'
            variant='outline'
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Clinic</Label>
          <Select
            options={[
              { text: 'None', value: '' },
              ...clinics.map((clinic) => ({
                text: clinic.name,
                value: clinic.id,
              })),
            ]}
            value={value.clinicId}
            onChange={(nextValue) => update({ clinicId: nextValue })}
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Doctor</Label>
          <Select
            options={[
              { text: 'None', value: '' },
              ...doctors.map((doctor) => ({
                text: doctor.name,
                value: doctor.id,
              })),
            ]}
            value={value.doctorId}
            onChange={(nextValue) => update({ doctorId: nextValue })}
            disabled={disabled}
          />
        </div>
      </div>
    </DetailsDisclosure>
  );
}

interface VisitOutcomeCatValue {
  vaccination: string;
  weight: string;
  condition: string;
  symptom: string;
}

const EMPTY_OUTCOME_CAT_VALUE: VisitOutcomeCatValue = {
  vaccination: '',
  weight: '',
  condition: '',
  symptom: '',
};

interface VisitOutcomeCatFieldsProps {
  value: VisitOutcomeCatValue;
  onValueChange: (value: VisitOutcomeCatValue) => void;
  disabled?: boolean;
}

function VisitOutcomeCatFields({
  value,
  onValueChange,
  disabled,
}: VisitOutcomeCatFieldsProps) {
  const update = (changes: Partial<VisitOutcomeCatValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <Label className='text-sm'>Vaccination given</Label>
        <Input
          value={value.vaccination}
          onChange={(event) => update({ vaccination: event.target.value })}
          placeholder='Rabies'
          variant='outline'
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-sm'>Current weight</Label>
        <Input
          value={value.weight}
          onChange={(event) => update({ weight: event.target.value })}
          placeholder='5.4'
          variant='outline'
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-sm'>Condition diagnosed</Label>
        <Input
          value={value.condition}
          onChange={(event) => update({ condition: event.target.value })}
          placeholder='Dental disease'
          variant='outline'
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label className='text-sm'>Symptom discussed</Label>
        <Textarea
          rows={2}
          value={value.symptom}
          onChange={(event) => update({ symptom: event.target.value })}
          variant='outline'
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function VisitOutcomeForm({
  cats,
  isSubmitting,
  onComplete,
}: {
  cats: Cat[];
  isSubmitting: boolean;
  onComplete: (outcome: VisitOutcome) => Promise<void> | void;
}) {
  const outcomeFields = useMemo(
    () => [
      textarea({
        name: 'summary',
        label: 'Visit summary',
        rows: 3,
        variant: 'outline',
      }),
      ...cats.map((cat) =>
        custom({
          name: `outcome_${cat.id}`,
          label: cats.length > 1 ? cat.name : '',
          renderComponent: (props) => (
            <VisitOutcomeCatFields
              value={props.value as VisitOutcomeCatValue}
              onValueChange={(value) => props.onValueChange(value)}
              disabled={props.disabled}
            />
          ),
          colSpan: 'full' as const,
        }),
      ),
    ],
    [cats],
  );

  const handleSubmit = async (data: VisitOutcomeValues) => {
    const outcome: VisitOutcome = {
      summary: (data.summary as string).trim() || null,
      vaccinations: [],
      weightEntries: [],
      conditions: [],
      symptoms: [],
    };

    cats.forEach((cat) => {
      const catOutcome =
        (data[`outcome_${cat.id}`] as VisitOutcomeCatValue | undefined) ??
        EMPTY_OUTCOME_CAT_VALUE;

      const vaccinationName = catOutcome.vaccination.trim();
      if (vaccinationName) {
        outcome.vaccinations?.push({
          catId: cat.id,
          name: vaccinationName,
          administeredAt: Date.now(),
        });
      }

      const weight = Number(catOutcome.weight);
      if (catOutcome.weight.trim() && Number.isFinite(weight) && weight > 0) {
        outcome.weightEntries?.push({
          catId: cat.id,
          weight,
          unit: 'lb',
          measuredAt: Date.now(),
        });
      }

      const conditionName = catOutcome.condition.trim();
      if (conditionName) {
        outcome.conditions?.push({
          catId: cat.id,
          name: conditionName,
          category: 'illness',
          status: 'active',
          occurredAt: Date.now(),
          source: 'custom',
        });
      }

      const symptomDescription = catOutcome.symptom.trim();
      if (symptomDescription) {
        outcome.symptoms?.push({
          catId: cat.id,
          description: symptomDescription,
          firstNoticedAt: Date.now(),
          quickTags: [],
        });
      }
    });

    await onComplete(outcome);
  };

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-sm'>
        All fields are optional — skip anything you don't have yet.
      </p>
      <Form
        id='nine-lives-visit-outcome'
        form={outcomeFields}
        initialData={{
          summary: '',
          ...Object.fromEntries(
            cats.map((cat) => [`outcome_${cat.id}`, EMPTY_OUTCOME_CAT_VALUE]),
          ),
        }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as VisitOutcomeValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            <Button
              type='button'
              variant='secondary'
              onClick={() => void onComplete({})}
              disabled={isSubmitting}
            >
              Complete without entries
            </Button>
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Completing…' : 'Complete visit'}
            </Button>
          </div>
        }
      />
    </div>
  );
}

function VisitFormModal({
  isOpen,
  cats,
  clinics = [],
  doctors = [],
  visits = [],
  initialVisit,
  isSubmitting = false,
  isCompleting = false,
  onSubmit,
  onComplete,
  onCancelVisit,
  onDelete,
  onClose,
}: VisitFormModalProps) {
  const { confirm } = useActionModal();
  const isEditing = Boolean(initialVisit?.id);
  const showOutcome = Boolean(isCompleting && initialVisit && onComplete);
  const formId = initialVisit?.id ?? 'new-nine-lives-visit';
  const originalVisitOptions = useMemo(
    () =>
      visits
        .filter((visit) => visit.id !== initialVisit?.id)
        .map((visit) => ({
          label: visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
          value: visit.id,
        })),
    [visits, initialVisit?.id],
  );
  const clinicSummaries = useMemo(
    () => clinics.map(({ id, name }) => ({ id, name })),
    [clinics],
  );
  const doctorSummaries = useMemo(
    () => doctors.map(({ id, name }) => ({ id, name })),
    [doctors],
  );

  const fields = useMemo(
    () => [
      checkboxGroup({
        name: 'catIds',
        label: 'Cats',
        options: cats.map((cat) => ({ label: cat.name, value: cat.id })),
      }),
      custom({
        name: 'scheduledAt',
        label: 'Date and time',
        renderComponent: (props) => (
          <VisitDateTimeField
            value={props.value as VisitDateTimeValue}
            onValueChange={(value) => props.onValueChange(value)}
            disabled={props.disabled}
          />
        ),
      }),
      custom({
        name: 'reasonDetails',
        label: 'Reason',
        renderComponent: (props) => (
          <VisitReasonField
            value={props.value as VisitReasonValue}
            onValueChange={(value) => props.onValueChange(value)}
            originalVisitOptions={originalVisitOptions}
            disabled={props.disabled}
          />
        ),
      }),
      custom({
        name: 'moreDetails',
        label: '',
        renderComponent: (props) => (
          <VisitMoreDetailsFields
            value={props.value as VisitMoreDetailsValue}
            onValueChange={(value) => props.onValueChange(value)}
            clinics={clinicSummaries}
            doctors={doctorSummaries}
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
      }),
    ],
    [cats, originalVisitOptions, clinicSummaries, doctorSummaries],
  );

  const handleSubmit = async (data: VisitFormValues) => {
    const scheduledAt = fromDateTimeValue(data.scheduledAt);
    if (!scheduledAt || data.catIds.length === 0) {
      return;
    }

    await onSubmit({
      id: initialVisit?.id,
      catIds: data.catIds,
      scheduledAt,
      reason: data.reasonDetails.reason,
      customReasonLabel: data.reasonDetails.customReasonLabel.trim() || null,
      followUpOfVisitId: data.reasonDetails.followUpOfVisitId || null,
      followUpNote: data.reasonDetails.followUpNote.trim() || null,
      title: data.moreDetails.title.trim() || null,
      clinicId: data.moreDetails.clinicId || null,
      doctorId: data.moreDetails.doctorId || null,
    });
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete visit',
      message:
        'Are you sure you want to delete this visit? Follow-up links will be cleared.',
      destructive: true,
    });
    if (confirmed) {
      await onDelete();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        showOutcome
          ? 'Complete visit'
          : isEditing
            ? 'Edit visit'
            : 'Schedule visit'
      }
    >
      {showOutcome ? (
        <VisitOutcomeForm
          cats={cats.filter((cat) => initialVisit?.catIds.includes(cat.id))}
          isSubmitting={isSubmitting}
          onComplete={onComplete!}
        />
      ) : (
        <Form
          key={formId}
          id={formId}
          form={fields}
          initialData={{
            catIds: initialVisit?.catIds ?? [],
            scheduledAt: {
              date: toDateInputValue(initialVisit?.scheduledAt),
              time: toTimeInputValue(initialVisit?.scheduledAt),
            },
            reasonDetails: {
              reason: initialVisit?.reason ?? 'checkup',
              customReasonLabel: initialVisit?.customReasonLabel ?? '',
              followUpOfVisitId: initialVisit?.followUpOfVisitId ?? '',
              followUpNote: initialVisit?.followUpNote ?? '',
            },
            moreDetails: {
              title: initialVisit?.title ?? '',
              clinicId: initialVisit?.clinicId ?? '',
              doctorId: initialVisit?.doctorId ?? '',
            },
          }}
          columns={1}
          spacing='normal'
          onSubmit={(data) => {
            void handleSubmit(data as VisitFormValues);
          }}
          submitButton={
            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                {isEditing && onDelete && (
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={() => void handleDelete()}
                    disabled={isSubmitting}
                  >
                    Delete
                  </Button>
                )}
                {isEditing &&
                  onCancelVisit &&
                  initialVisit?.status === 'upcoming' && (
                    <Button
                      type='button'
                      variant='secondary'
                      onClick={() => void onCancelVisit()}
                      disabled={isSubmitting}
                    >
                      Cancel visit
                    </Button>
                  )}
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Close
                </Button>
                <Button type='submit' loading={isSubmitting}>
                  {isSubmitting
                    ? 'Saving…'
                    : isEditing
                      ? 'Save visit'
                      : 'Schedule visit'}
                </Button>
              </div>
            </div>
          }
        />
      )}
    </Modal>
  );
}

export default VisitFormModal;
