import { useMemo } from 'react';

import { Button, Form, FormFactories, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import type {
  Cat,
  Visit,
  VisitReason,
} from '../types';
import type { VisitOutcome } from '../store/actions/visitsActions';
import { getDefaultVisitTitle } from '../utils/dateHelpers';

interface VisitFormModalProps {
  isOpen: boolean;
  cats: Cat[];
  clinics?: Array<{ id: string; name: string }>;
  doctors?: Array<{ id: string; name: string; clinicId: string }>;
  visits?: Visit[];
  initialVisit?: Visit | null;
  isSubmitting?: boolean;
  isCompleting?: boolean;
  onSubmit: (visit: Partial<Visit> & Pick<Visit, 'catIds' | 'reason' | 'scheduledAt'>) => Promise<void> | void;
  onComplete?: (outcome: VisitOutcome) => Promise<void> | void;
  onCancelVisit?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

interface VisitFormValues {
  catIds: string[];
  scheduledAt: string;
  reason: VisitReason;
  customReasonLabel: string;
  followUpOfVisitId: string;
  followUpNote: string;
  title: string;
  clinicId: string;
  doctorId: string;
}

interface VisitOutcomeValues {
  summary: string;
  [key: string]: string;
}

const { input, select, textarea, checkboxGroup } = FormFactories;

const REASON_OPTIONS = [
  { label: 'Checkup', value: 'checkup' },
  { label: 'Illness', value: 'illness' },
  { label: 'Accident', value: 'accident' },
  { label: 'Vaccination', value: 'vaccination' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Custom', value: 'custom' },
];

function toDateTimeInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromDateTimeInputValue(value: string) {
  if (!value) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
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
        label: 'Visit summary (optional)',
        rows: 3,
        variant: 'outline',
      }),
      ...cats.flatMap((cat) => [
        input({
          name: `vaccination_${cat.id}`,
          label: `${cat.name}: vaccination given (optional)`,
          placeholder: 'Rabies',
          variant: 'outline',
        }),
        input({
          name: `weight_${cat.id}`,
          label: `${cat.name}: current weight (optional)`,
          placeholder: '5.4',
          variant: 'outline',
        }),
        input({
          name: `condition_${cat.id}`,
          label: `${cat.name}: condition diagnosed (optional)`,
          placeholder: 'Dental disease',
          variant: 'outline',
        }),
        textarea({
          name: `symptom_${cat.id}`,
          label: `${cat.name}: symptom discussed (optional)`,
          rows: 2,
          variant: 'outline',
        }),
      ]),
    ],
    [cats],
  );

  const handleSubmit = async (data: VisitOutcomeValues) => {
    const outcome: VisitOutcome = {
      summary: data.summary.trim() || null,
      vaccinations: [],
      weightEntries: [],
      conditions: [],
      symptoms: [],
    };

    cats.forEach((cat) => {
      const vaccinationName = data[`vaccination_${cat.id}`]?.trim();
      if (vaccinationName) {
        outcome.vaccinations?.push({
          catId: cat.id,
          name: vaccinationName,
          administeredAt: Date.now(),
        });
      }

      const weight = Number(data[`weight_${cat.id}`]);
      if (data[`weight_${cat.id}`]?.trim() && Number.isFinite(weight) && weight > 0) {
        outcome.weightEntries?.push({
          catId: cat.id,
          weight,
          unit: 'lb',
          measuredAt: Date.now(),
        });
      }

      const conditionName = data[`condition_${cat.id}`]?.trim();
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

      const symptomDescription = data[`symptom_${cat.id}`]?.trim();
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
    <Form
      id='nine-lives-visit-outcome'
      form={outcomeFields}
      initialData={{ summary: '' }}
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
  const fields = useMemo(
    () => [
      checkboxGroup({
        name: 'catIds',
        label: 'Cats',
        options: cats.map((cat) => ({ label: cat.name, value: cat.id })),
      }),
      input({
        name: 'scheduledAt',
        label: 'Date and time',
        type: 'text',
        placeholder: '2026-03-04 09:00',
        required: true,
        variant: 'outline',
      }),
      select({
        name: 'reason',
        label: 'Reason',
        options: REASON_OPTIONS,
      }),
      input({
        name: 'customReasonLabel',
        label: 'Custom reason (when selected)',
        variant: 'outline',
      }),
      select({
        name: 'followUpOfVisitId',
        label: 'Original visit (for follow-up)',
        placeholder: 'Select an original visit',
        options: visits
          .filter((visit) => visit.id !== initialVisit?.id)
          .map((visit) => ({
            label: visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
            value: visit.id,
          })),
      }),
      textarea({
        name: 'followUpNote',
        label: 'Follow-up note (optional)',
        rows: 2,
        variant: 'outline',
      }),
      input({
        name: 'title',
        label: 'Title override (optional)',
        placeholder: 'Leave blank for the default title',
        variant: 'outline',
      }),
      select({
        name: 'clinicId',
        label: 'Clinic (optional)',
        placeholder: 'None',
        options: [
          { label: 'None', value: '' },
          ...clinics.map((clinic) => ({ label: clinic.name, value: clinic.id })),
        ],
      }),
      select({
        name: 'doctorId',
        label: 'Doctor (optional)',
        placeholder: 'None',
        options: [
          { label: 'None', value: '' },
          ...doctors.map((doctor) => ({ label: doctor.name, value: doctor.id })),
        ],
      }),
    ],
    [cats, visits, initialVisit?.id, clinics, doctors],
  );

  const handleSubmit = async (data: VisitFormValues) => {
    const scheduledAt = fromDateTimeInputValue(data.scheduledAt);
    if (!scheduledAt || data.catIds.length === 0) {
      return;
    }

    await onSubmit({
      id: initialVisit?.id,
      catIds: data.catIds,
      scheduledAt,
      reason: data.reason,
      customReasonLabel: data.customReasonLabel.trim() || null,
      followUpOfVisitId: data.followUpOfVisitId || null,
      followUpNote: data.followUpNote.trim() || null,
      title: data.title.trim() || null,
      clinicId: data.clinicId || null,
      doctorId: data.doctorId || null,
    });
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete visit',
      message: 'Are you sure you want to delete this visit? Follow-up links will be cleared.',
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
      title={showOutcome ? 'Complete visit' : isEditing ? 'Edit visit' : 'Schedule visit'}
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
            scheduledAt: toDateTimeInputValue(initialVisit?.scheduledAt),
            reason: initialVisit?.reason ?? 'checkup',
            customReasonLabel: initialVisit?.customReasonLabel ?? '',
            followUpOfVisitId: initialVisit?.followUpOfVisitId ?? '',
            followUpNote: initialVisit?.followUpNote ?? '',
            title: initialVisit?.title ?? '',
            clinicId: initialVisit?.clinicId ?? '',
            doctorId: initialVisit?.doctorId ?? '',
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
                  <Button type='button' variant='secondary' onClick={() => void handleDelete()} disabled={isSubmitting}>
                    Delete
                  </Button>
                )}
                {isEditing && onCancelVisit && initialVisit?.status === 'upcoming' && (
                  <Button type='button' variant='secondary' onClick={() => void onCancelVisit()} disabled={isSubmitting}>
                    Cancel visit
                  </Button>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <Button type='button' variant='secondary' onClick={onClose} disabled={isSubmitting}>
                  Close
                </Button>
                <Button type='submit' loading={isSubmitting}>
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save visit' : 'Schedule visit'}
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
