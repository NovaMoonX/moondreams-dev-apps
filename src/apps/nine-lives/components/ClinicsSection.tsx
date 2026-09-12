import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppDispatch, useAppSelector } from '@/store';
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
import {
  selectClinicsByHousehold,
  selectDoctorsByHousehold,
} from '../store/selectors';
import DetailsDisclosure from './DetailsDisclosure';
import DoctorFormModal from './DoctorFormModal';
import VetClinicRow from './VetClinicRow';
import VetClinicFormModal from './VetClinicFormModal';

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
  const [doctorModalClinicId, setDoctorModalClinicId] = useState<string | null>(
    null,
  );
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);

  const editingClinic =
    clinics.find((clinic) => clinic.id === editingClinicId) ?? null;
  const editingDoctor =
    doctors.find((doctor) => doctor.id === editingDoctorId) ?? null;
  const doctorModalClinic =
    clinics.find((clinic) => clinic.id === doctorModalClinicId) ?? null;
  const doctorFormClinic = editingDoctor
    ? (clinics.find((clinic) => clinic.id === editingDoctor.clinicId) ?? null)
    : doctorModalClinic;

  const handleCreateClinic = async (clinic: {
    name: string;
    phone?: string | null;
    email?: string | null;
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
    email?: string | null;
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
      await dispatch(
        deleteVetClinic({ householdId, vetClinicId: clinicId }),
      ).unwrap();
      setEditingClinicId(null);
      setShowClinicForm(false);
      if (doctorModalClinicId === clinicId) {
        setDoctorModalClinicId(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDoctor = async (doctor: {
    name: string;
    notes?: string | null;
  }) => {
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

  const handleUpdateDoctor = async (doctor: {
    name: string;
    notes?: string | null;
  }) => {
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
          <div className='flex items-center justify-between gap-2 pb-2'>
            <small className='text-muted-foreground text-sm'>
              Manage your vet clinics here.
            </small>
            <Button
              type='button'
              variant='primary'
              size='sm'
              onClick={() => setShowClinicForm(true)}
            >
              Add clinic
            </Button>
          </div>

          {clinics.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              No clinics added yet.
            </p>
          )}

          {clinics.length > 0 && (
            <div className='divide-border divide-y'>
              {clinics.map((clinic) => {
                const clinicDoctors = doctors.filter(
                  (doctor) => doctor.clinicId === clinic.id,
                );

                return (
                  <VetClinicRow
                    key={clinic.id}
                    clinic={clinic}
                    doctors={clinicDoctors}
                    onEditClinic={(clinicId) => setEditingClinicId(clinicId)}
                    onAddDoctor={(clinicId) => setDoctorModalClinicId(clinicId)}
                    onDeleteClinic={async (clinicId) => {
                      await handleDeleteClinic(clinicId);
                    }}
                    onEditDoctor={(doctorId) => setEditingDoctorId(doctorId)}
                  />
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
        onDelete={
          editingClinic ? () => handleDeleteClinic(editingClinic.id) : undefined
        }
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
        onDelete={
          editingDoctor ? () => handleDeleteDoctor(editingDoctor.id) : undefined
        }
        onClose={() => {
          setDoctorModalClinicId(null);
          setEditingDoctorId(null);
        }}
      />
    </section>
  );
}

export default ClinicsSection;
