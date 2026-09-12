import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import AuthRequiredState from '@/ui/AuthRequiredState';
import Loading from '@/ui/Loading';

import CatProfileForm from './components/CatProfileForm';
import HouseholdSetupModal from './components/HouseholdSetupModal';
import VetClinicFormModal from './components/VetClinicFormModal';
import { useNineLivesSync } from './hooks/useNineLivesSync';
import { createCat } from './store/actions/catsActions';
import { createHousehold } from './store/actions/householdsActions';
import { createDoctor } from './store/actions/doctorsActions';
import { createVetClinic } from './store/actions/vetClinicsActions';
import type { Cat } from './types';

function NineLives() {
  const { user, loading } = useAuth();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [doctorClinicId, setDoctorClinicId] = useState('');

  const households = useAppSelector((state) => {
    if (!user?.uid) {
      return [];
    }

    return state.nineLives.households.items.filter((household) =>
      household.members.includes(user.uid),
    );
  });

  const selectedHousehold = useMemo(() => {
    if (!selectedHouseholdId) {
      return households[0] ?? null;
    }

    return (
      households.find((household) => household.id === selectedHouseholdId) ??
      households[0] ??
      null
    );
  }, [households, selectedHouseholdId]);

  useEffect(() => {
    if (!user?.uid) {
      setSelectedHouseholdId(null);
      return;
    }

    if (households.length === 0) {
      setSelectedHouseholdId(null);
      return;
    }

    if (
      !selectedHouseholdId ||
      !households.some((household) => household.id === selectedHouseholdId)
    ) {
      setSelectedHouseholdId(households[0].id);
    }
  }, [households, selectedHouseholdId, user?.uid]);

  useNineLivesSync(selectedHousehold?.id ?? null, user?.uid ?? null);

  const cats = useAppSelector((state) =>
    selectedHousehold?.id
      ? state.nineLives.cats.items.filter(
          (cat) => cat.householdId === selectedHousehold.id,
        )
      : [],
  );

  const clinics = useAppSelector((state) =>
    selectedHousehold?.id
      ? state.nineLives.vetClinics.items.filter(
          (clinic) => clinic.householdId === selectedHousehold.id,
        )
      : [],
  );

  const doctors = useAppSelector((state) =>
    selectedHousehold?.id
      ? state.nineLives.doctors.items.filter(
          (doctor) => doctor.householdId === selectedHousehold.id,
        )
      : [],
  );

  useEffect(() => {
    if (clinics.length === 0) {
      setDoctorClinicId('');
      return;
    }

    if (!doctorClinicId || !clinics.some((clinic) => clinic.id === doctorClinicId)) {
      setDoctorClinicId(clinics[0].id);
    }
  }, [clinics, doctorClinicId]);

  const defaultHouseholdName = useMemo(
    () => (user?.displayName ? `${user.displayName}'s household` : 'My household'),
    [user?.displayName],
  );

  const handleCreateHousehold = async (name: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdHousehold = await dispatch(
        createHousehold({ uid: user.uid, name }),
      ).unwrap();
      setSelectedHouseholdId(createdHousehold.id);
      setShowHouseholdModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCat = async (cat: Cat) => {
    if (!user?.uid || !selectedHousehold?.id) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createCat({
          householdId: selectedHousehold.id,
          uid: user.uid,
          cat,
        }),
      ).unwrap();
      setShowCatForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateClinic = async (clinic: {
    name: string;
    phone?: string;
    address?: string;
    isEmergency24Hour?: boolean;
    notes?: string;
  }) => {
    if (!selectedHousehold?.id) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createVetClinic({
          householdId: selectedHousehold.id,
          clinic,
        }),
      ).unwrap();
      setShowClinicForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDoctor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.uid || !selectedHousehold?.id || !doctorClinicId || !doctorName.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        createDoctor({
          householdId: selectedHousehold.id,
          clinicId: doctorClinicId,
          name: doctorName,
          notes: doctorNotes.trim() || undefined,
        }),
      ).unwrap();
      setDoctorName('');
      setDoctorNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <AuthRequiredState message='Please sign in to use Nine Lives.' />;
  }

  const householdModalOpen = households.length === 0 || showHouseholdModal;

  if (households.length === 0) {
    return (
      <HouseholdSetupModal
        key={`${user.uid}-${defaultHouseholdName}`}
        isOpen={householdModalOpen}
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onConfirm={handleCreateHousehold}
        onClose={() => undefined}
      />
    );
  }

  return (
    <div className='page'>
      <div className='mx-auto max-w-6xl space-y-6 py-8'>
        <header className='flex flex-col gap-4 rounded-lg border border-border bg-card p-6 md:flex-row md:items-end md:justify-between'>
          <div>
            <p className='text-muted-foreground text-sm uppercase tracking-[0.2em]'>
              Nine Lives
            </p>
            <h1 className='mt-2 text-3xl font-semibold'>{selectedHousehold?.name}</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              {selectedHousehold?.members.length ?? 0} member(s) in this household
            </p>
          </div>

          <div className='flex flex-col gap-2 md:items-end'>
            <label className='text-sm font-medium text-muted-foreground'>Household</label>
            <div className='flex gap-2'>
              <select
                value={selectedHousehold?.id ?? ''}
                onChange={(event) => setSelectedHouseholdId(event.target.value || null)}
                className='rounded-md border border-border bg-background px-3 py-2 text-sm'
              >
                {households.map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
              </select>
              <Button type='button' variant='secondary' onClick={() => setShowHouseholdModal(true)}>
                Add household
              </Button>
            </div>
          </div>
        </header>

        <div className='grid gap-4 md:grid-cols-3'>
          <div className='rounded-lg border border-border bg-card p-4'>
            <p className='text-sm text-muted-foreground'>Cats</p>
            <p className='mt-2 text-2xl font-semibold'>{cats.length}</p>
          </div>
          <div className='rounded-lg border border-border bg-card p-4'>
            <p className='text-sm text-muted-foreground'>Clinics</p>
            <p className='mt-2 text-2xl font-semibold'>{clinics.length}</p>
          </div>
          <div className='rounded-lg border border-border bg-card p-4'>
            <p className='text-sm text-muted-foreground'>Doctors</p>
            <p className='mt-2 text-2xl font-semibold'>{doctors.length}</p>
          </div>
        </div>

        <div className='grid gap-6 xl:grid-cols-2'>
          <section className='rounded-lg border border-border bg-card p-4'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-semibold'>Cats</h2>
              {!showCatForm && (
                <Button type='button' onClick={() => setShowCatForm(true)}>
                  Add cat
                </Button>
              )}
            </div>

            {showCatForm && (
              <CatProfileForm
                householdId={selectedHousehold?.id}
                isSubmitting={isSubmitting}
                onSubmit={handleCreateCat}
                onCancel={() => setShowCatForm(false)}
              />
            )}

            {!showCatForm && cats.length === 0 && (
              <p className='text-sm text-muted-foreground'>No cats added yet.</p>
            )}

            {!showCatForm && cats.length > 0 && (
              <div className='space-y-3'>
                {cats.map((cat) => (
                  <div key={cat.id} className='rounded-md border border-border p-3'>
                    <p className='text-lg font-medium'>{cat.name}</p>
                    <p className='text-sm text-muted-foreground'>{cat.breed}</p>
                    <p className='mt-2 text-sm'>
                      {cat.lifestyle ? cat.lifestyle.replace('_', ' ') : 'Indoor'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className='rounded-lg border border-border bg-card p-4'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-semibold'>Vet clinics</h2>
              {!showClinicForm && (
                <Button type='button' onClick={() => setShowClinicForm(true)}>
                  Add clinic
                </Button>
              )}
            </div>

            {showClinicForm && (
              <VetClinicFormModal
                isOpen
                isSubmitting={isSubmitting}
                onSubmit={handleCreateClinic}
                onClose={() => setShowClinicForm(false)}
              />
            )}

            {!showClinicForm && clinics.length === 0 && (
              <p className='text-sm text-muted-foreground'>No clinics added yet.</p>
            )}

            {!showClinicForm && clinics.length > 0 && (
              <div className='space-y-3'>
                {clinics.map((clinic) => (
                  <div key={clinic.id} className='rounded-md border border-border p-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-lg font-medium'>{clinic.name}</p>
                      {clinic.isEmergency24Hour && (
                        <span className='rounded-full bg-muted px-2 py-1 text-xs'>24hr</span>
                      )}
                    </div>
                    {clinic.phone && <p className='text-sm text-muted-foreground'>{clinic.phone}</p>}
                    {clinic.address && <p className='text-sm text-muted-foreground'>{clinic.address}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className='rounded-lg border border-border bg-card p-4'>
          <h2 className='mb-4 text-xl font-semibold'>Doctors</h2>

          <form onSubmit={handleCreateDoctor} className='space-y-4 rounded-md border border-border p-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Clinic</label>
              <select
                value={doctorClinicId}
                onChange={(event) => setDoctorClinicId(event.target.value)}
                className='w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
                disabled={!clinics.length}
              >
                {!clinics.length && <option value=''>Create a clinic first</option>}
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>Doctor name</label>
              <Input
                value={doctorName}
                onChange={(event) => setDoctorName(event.target.value)}
                placeholder='Dr. Morgan Lee'
                aria-label='Doctor name'
                name='nine-lives-doctor-name'
              />
            </div>

            <div className='space-y-2'>
              <label className='text-sm font-medium'>Notes</label>
              <textarea
                value={doctorNotes}
                onChange={(event) => setDoctorNotes(event.target.value)}
                placeholder='Notes (optional)'
                className='min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
              />
            </div>

            <div className='flex justify-end'>
              <Button type='submit' disabled={!doctorClinicId || !doctorName.trim() || isSubmitting}>
                Add doctor
              </Button>
            </div>
          </form>

          {doctors.length === 0 && (
            <p className='mt-4 text-sm text-muted-foreground'>No doctors saved yet.</p>
          )}

          {doctors.length > 0 && (
            <div className='mt-4 space-y-3'>
              {clinics.map((clinic) => {
                const clinicDoctors = doctors.filter((doctor) => doctor.clinicId === clinic.id);

                if (clinicDoctors.length === 0) {
                  return null;
                }

                return (
                  <div key={clinic.id} className='rounded-md border border-border p-3'>
                    <p className='mb-2 font-medium'>{clinic.name}</p>
                    <div className='space-y-2'>
                      {clinicDoctors.map((doctor) => (
                        <div key={doctor.id} className='rounded-sm bg-muted/40 p-2'>
                          <p className='font-medium'>{doctor.name}</p>
                          {doctor.notes && <p className='text-sm text-muted-foreground'>{doctor.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <HouseholdSetupModal
        key={`add-household-${user.uid}`}
        isOpen={householdModalOpen && showHouseholdModal}
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onConfirm={handleCreateHousehold}
        onClose={() => setShowHouseholdModal(false)}
      />
    </div>
  );
}

export default NineLives;
