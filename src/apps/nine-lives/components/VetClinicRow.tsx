import { Button, DropdownMenu, DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { DotsVertical } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { copyToClipboard } from '@/utils/clipboardUtils';

import type { Doctor, VetClinic } from '@apps/nine-lives/types';

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

  const clinicContactItems = [
    ...(clinic.phone
      ? [
          option({
            label: 'Call clinic',
            value: 'call-clinic',
            description: clinic.phone,
          }),
          option({
            label: 'Copy phone',
            value: 'copy-phone',
            description: 'Copy the clinic phone number.',
          }),
        ]
      : []),
    ...(clinic.email
      ? [
          option({
            label: 'Email clinic',
            value: 'email-clinic',
            description: clinic.email,
          }),
          option({
            label: 'Copy email',
            value: 'copy-email',
            description: 'Copy the clinic email address.',
          }),
        ]
      : []),
    ...(clinic.address
      ? [
          option({
            label: 'Copy address',
            value: 'copy-address',
            description: 'Copy the clinic address.',
          }),
        ]
      : []),
  ];

  const clinicMenuItems = [
    ...(clinicContactItems.length > 0 ? [group(clinicContactItems, 'Contact')] : []),
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
        </div>

        <DropdownMenu
          items={clinicMenuItems}
          onItemSelect={async (value) => {
            if (value === 'call-clinic' && clinic.phone) {
              window.location.href = `tel:${clinic.phone.replace(/[^+\d]/g, '')}`;
              return;
            }

            if (value === 'email-clinic' && clinic.email) {
              window.location.href = `mailto:${clinic.email}`;
              return;
            }

            if (value === 'copy-phone' && clinic.phone) {
              const copied = await copyToClipboard(clinic.phone);
              if (copied) {
                addToast({
                  title: 'Phone copied',
                  description: 'Clinic phone number copied to your clipboard.',
                });
              }
              return;
            }

            if (value === 'copy-email' && clinic.email) {
              const copied = await copyToClipboard(clinic.email);
              if (copied) {
                addToast({
                  title: 'Email copied',
                  description: 'Clinic email address copied to your clipboard.',
                });
              }
              return;
            }

            if (value === 'copy-address' && clinic.address) {
              const copied = await copyToClipboard(clinic.address);
              if (copied) {
                addToast({
                  title: 'Address copied',
                  description: 'Clinic address copied to your clipboard.',
                });
              }
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
          placement='bottom'
          alignment='end'
          offset={8}
          trigger={
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-8 w-8 p-0'
              aria-label={`Open actions for clinic ${clinic.name}`}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DotsVertical className='h-4 w-4' />
            </Button>
          }
        />
      </div>

      {doctors.length > 0 && (
        <div className='border-border mt-3 space-y-2 border-l-2 pl-3'>
          {doctors.map((doctor) => (
            <div key={doctor.id} className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm font-medium'>{doctor.name}</p>
                {doctor.notes && (
                  <p className='text-muted-foreground text-sm'>{doctor.notes}</p>
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
