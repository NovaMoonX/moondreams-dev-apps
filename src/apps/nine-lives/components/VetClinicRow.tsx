import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import type { Doctor, VetClinic } from '@apps/nine-lives/types';
import {
  getClinicContactMenuItems,
  handleClinicContactAction,
} from '@apps/nine-lives/utils/clinicContactMenu';

interface VetClinicRowProps {
  clinic: VetClinic;
  doctors: Doctor[];
  onEditClinic: (clinicId: string) => void;
  onEditDoctor: (doctorId: string) => void;
  onAddDoctor: (clinicId: string) => void;
  onDeleteClinic: (clinicId: string) => Promise<void> | void;
}

function VetClinicRow({
  clinic,
  doctors,
  onEditClinic,
  onEditDoctor,
  onAddDoctor,
  onDeleteClinic,
}: VetClinicRowProps) {
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { group, option, separator } = DropdownMenuFactories;

  const clinicContactItems = getClinicContactMenuItems(clinic);

  const clinicMenuItems = [
    ...(clinicContactItems.length > 0
      ? [group(clinicContactItems, 'Contact')]
      : []),
    group(
      [
        option({
          label: 'Edit clinic',
          value: 'edit-clinic',
          description: 'Update this clinic’s details.',
        }),
        option({
          label: 'Add doctor',
          value: 'add-doctor',
          description: 'Add a doctor to this clinic.',
        }),
      ],
      'Clinic',
    ),
    separator(),
    option({
      label: 'Delete clinic',
      value: 'delete-clinic',
      description: 'Remove this clinic and its doctors.',
    }),
  ];

  return (
    <div className='py-3 first:pt-0 last:pb-0'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <Button
              className='text-left text-sm font-medium'
              variant='link'
              size='stripped'
              onClick={() => onEditClinic(clinic.id)}
            >
              {clinic.name}
            </Button>
            <span
              className={join(
                'bg-muted rounded-full px-2 py-1 text-xs',
                !clinic.isEmergency24Hour && 'hidden',
              )}
            >
              24hr
            </span>
          </div>
          {clinic.phone && (
            <p className='text-muted-foreground text-sm'>{clinic.phone}</p>
          )}
          {clinic.email && (
            <p className='text-muted-foreground text-sm'>{clinic.email}</p>
          )}
          {clinic.address && (
            <p className='text-muted-foreground text-sm'>{clinic.address}</p>
          )}
          {clinic.website && (
            <a
              href={clinic.website}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary text-sm hover:underline'
            >
              {clinic.website}
            </a>
          )}
        </div>

        <EllipsisDropdown
          items={clinicMenuItems}
          onItemSelect={async (value) => {
            if (await handleClinicContactAction(value, clinic, addToast)) {
              return;
            }

            if (value === 'edit-clinic') {
              onEditClinic(clinic.id);
              return;
            }

            if (value === 'add-doctor') {
              onAddDoctor(clinic.id);
              return;
            }

            if (value === 'delete-clinic') {
              const confirmed = await confirm({
                title: 'Delete clinic',
                message:
                  'Are you sure you want to delete this clinic? This action cannot be undone.',
                destructive: true,
              });

              if (confirmed) {
                await onDeleteClinic(clinic.id);
              }
            }
          }}
          ariaLabel={`Open actions for clinic ${clinic.name}`}
        />
      </div>

      {doctors.length > 0 && (
        <div className='border-border mt-3 space-y-2 border-l-2 pl-3'>
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className='flex items-start justify-between gap-3'
            >
              <div>
                <p className='text-sm font-medium'>{doctor.name}</p>
                {doctor.notes && (
                  <p className='text-muted-foreground text-sm'>
                    {doctor.notes}
                  </p>
                )}
              </div>
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={() => onEditDoctor(doctor.id)}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VetClinicRow;
