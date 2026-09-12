import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppDispatch, useAppSelector } from '@/store';

import DetailsDisclosure from './DetailsDisclosure';
import DoctorFormModal from './DoctorFormModal';
import VetClinicFormModal from './VetClinicFormModal';
import { createDoctor } from '../store/actions/doctorsActions';
import { createVetClinic } from '../store/actions/vetClinicsActions';
import { selectClinicsByHousehold, selectDoctorsByHousehold } from '../store/selectors';

interface ClinicsSectionProps {
  householdId: string;
}

function ClinicsSection({ householdId }: ClinicsSectionProps) {
  const dispatch = useAppDispatch();
  const clinics = useAppSelector(selectClinicsByHousehold(householdId));
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [doctorModalClinicId, setDoctorModalClinicId] = useState<string | null>(null);

  const doctorModalClinic = clinics.find((clinic) => clinic.id === doctorModalClinicId) ?? null;

  const handleCreateClinic = async (clinic: {
    name: string;
    phone?: string | null;
    address?: string | null;
    isEmergency24Hour?: boolean | null;
    notes?: string | null;
  }) => {
    setIsSubmitting(true);

    try {
      await dispatch(createVetClinic({ householdId, clinic })).unwrap();
      setShowClinicForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDoctor = async (doctor: { name: string; notes?: string | null }) => {
    if (!doctorModalClinicId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createDoctor({
          householdId,
          clinicId: doctorModalClinicId,
          name: doctor.name,
          notes: doctor.notes,
        }),
      ).unwrap();
      setDoctorModalClinicId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <DetailsDisclosure label='Vet clinics'>
        <div className='space-y-4'>
          <Button type='button' variant='secondary' size='sm' onClick={() => setShowClinicForm(true)}>
            Add clinic
          </Button>

          {clinics.length === 0 && (
            <p className='text-sm text-muted-foreground'>No clinics added yet.</p>
          )}

          {clinics.length > 0 && (
            <div className='divide-y divide-border'>
              {clinics.map((clinic) => {
                const clinicDoctors = doctors.filter((doctor) => doctor.clinicId === clinic.id);

                return (
                  <div key={clinic.id} className='py-3 first:pt-0 last:pb-0'>
                    <div className='flex items-center justify-between gap-2'>
                      <div>
                        <div className='flex items-center gap-2'>
                          <p className='font-medium'>{clinic.name}</p>
                          {clinic.isEmergency24Hour && (
                            <span className='rounded-full bg-muted px-2 py-1 text-xs'>24hr</span>
                          )}
                        </div>
                        {clinic.phone && (
                          <p className='text-sm text-muted-foreground'>{clinic.phone}</p>
                        )}
                        {clinic.address && (
                          <p className='text-sm text-muted-foreground'>{clinic.address}</p>
                        )}
                      </div>
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        onClick={() => setDoctorModalClinicId(clinic.id)}
                      >
                        Add doctor
                      </Button>
                    </div>

                    {clinicDoctors.length > 0 && (
                      <div className='mt-3 space-y-2 border-l-2 border-border pl-3'>
                        {clinicDoctors.map((doctor) => (
                          <div key={doctor.id}>
                            <p className='text-sm font-medium'>{doctor.name}</p>
                            {doctor.notes && (
                              <p className='text-sm text-muted-foreground'>{doctor.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DetailsDisclosure>

      <VetClinicFormModal
        isOpen={showClinicForm}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateClinic}
        onClose={() => setShowClinicForm(false)}
      />

      <DoctorFormModal
        isOpen={Boolean(doctorModalClinic)}
        clinicName={doctorModalClinic?.name ?? ''}
        isSubmitting={isSubmitting}
        onSubmit={handleCreateDoctor}
        onClose={() => setDoctorModalClinicId(null)}
      />
    </section>
  );
}

export default ClinicsSection;
