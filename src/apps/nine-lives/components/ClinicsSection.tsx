import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppDispatch, useAppSelector } from '@/store';

import DetailsDisclosure from './DetailsDisclosure';
import DoctorFormModal from './DoctorFormModal';
import VetClinicFormModal from './VetClinicFormModal';
import {
  createDoctor,
  deleteDoctor,
  updateDoctor,
} from '../store/actions/doctorsActions';
import {
  createVetClinic,
  deleteVetClinic,
  updateVetClinic,
} from '../store/actions/vetClinicsActions';
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
  const [editingClinicId, setEditingClinicId] = useState<string | null>(null);
  const [doctorModalClinicId, setDoctorModalClinicId] = useState<string | null>(null);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);

  const editingClinic = clinics.find((clinic) => clinic.id === editingClinicId) ?? null;
  const editingDoctor = doctors.find((doctor) => doctor.id === editingDoctorId) ?? null;
  const doctorModalClinic = clinics.find((clinic) => clinic.id === doctorModalClinicId) ?? null;
  const doctorFormClinic =
    editingDoctor
      ? clinics.find((clinic) => clinic.id === editingDoctor.clinicId) ?? null
      : doctorModalClinic;

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

  const handleUpdateClinic = async (clinic: {
    name: string;
    phone?: string | null;
    address?: string | null;
    isEmergency24Hour?: boolean | null;
    notes?: string | null;
  }) => {
    if (!editingClinicId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateVetClinic({
          householdId,
          vetClinicId: editingClinicId,
          changes: clinic,
        }),
      ).unwrap();
      setEditingClinicId(null);
      setShowClinicForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClinic = async (clinicId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteVetClinic({ householdId, vetClinicId: clinicId })).unwrap();
      setEditingClinicId(null);
      setShowClinicForm(false);
      if (doctorModalClinicId === clinicId) {
        setDoctorModalClinicId(null);
      }
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

  const handleUpdateDoctor = async (doctor: { name: string; notes?: string | null }) => {
    if (!editingDoctorId) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        updateDoctor({
          householdId,
          doctorId: editingDoctorId,
          changes: {
            name: doctor.name,
            notes: doctor.notes ?? null,
          },
        }),
      ).unwrap();
      setEditingDoctorId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    setIsSubmitting(true);

    try {
      await dispatch(deleteDoctor({ householdId, doctorId })).unwrap();
      setEditingDoctorId(null);
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

                      <div className='flex items-center gap-2'>
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          onClick={() => setEditingClinicId(clinic.id)}
                        >
                          Edit clinic
                        </Button>
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          onClick={() => setDoctorModalClinicId(clinic.id)}
                        >
                          Add doctor
                        </Button>
                      </div>
                    </div>

                    {clinicDoctors.length > 0 && (
                      <div className='mt-3 space-y-2 border-l-2 border-border pl-3'>
                        {clinicDoctors.map((doctor) => (
                          <div key={doctor.id} className='flex items-start justify-between gap-3'>
                            <div>
                              <p className='text-sm font-medium'>{doctor.name}</p>
                              {doctor.notes && (
                                <p className='text-sm text-muted-foreground'>{doctor.notes}</p>
                              )}
                            </div>
                            <Button
                              type='button'
                              variant='secondary'
                              size='sm'
                              onClick={() => setEditingDoctorId(doctor.id)}
                            >
                              Edit
                            </Button>
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
        isOpen={showClinicForm || Boolean(editingClinic)}
        initialClinic={editingClinic ?? undefined}
        isSubmitting={isSubmitting}
        onSubmit={editingClinic ? handleUpdateClinic : handleCreateClinic}
        onDelete={editingClinic ? () => handleDeleteClinic(editingClinic.id) : undefined}
        onClose={() => {
          setShowClinicForm(false);
          setEditingClinicId(null);
        }}
      />

      <DoctorFormModal
        isOpen={Boolean(doctorModalClinic) || Boolean(editingDoctor)}
        clinicName={doctorFormClinic?.name ?? ''}
        initialDoctor={editingDoctor ?? undefined}
        isSubmitting={isSubmitting}
        onSubmit={editingDoctor ? handleUpdateDoctor : handleCreateDoctor}
        onDelete={editingDoctor ? () => handleDeleteDoctor(editingDoctor.id) : undefined}
        onClose={() => {
          setDoctorModalClinicId(null);
          setEditingDoctorId(null);
        }}
      />
    </section>
  );
}

export default ClinicsSection;
