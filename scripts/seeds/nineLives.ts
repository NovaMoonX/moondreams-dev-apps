import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const HOUSEHOLD_ID = 'seed-nine-lives-household';

export async function seedNineLives(context: SeedContext): Promise<SeedResult> {
  const caretaker = FIXTURE_USERS.nineLivesCaretaker;
  const coCaretaker = FIXTURE_USERS.partnerTwo;
  const batch = context.firestore.batch();
  const householdRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('households')
    .doc(HOUSEHOLD_ID);
  const createdAt = context.now - 1_209_600_000;

  batch.set(
    householdRef,
    {
      id: HOUSEHOLD_ID,
      name: 'Taylor and Jamie’s household',
      members: [caretaker.uid, coCaretaker.uid],
      inviteCode: 'LUNA7Q',
      createdBy: caretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );

  const inviteCodeRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('inviteCodes')
    .doc('LUNA7Q');

  batch.set(inviteCodeRef, { householdId: HOUSEHOLD_ID }, { merge: true });

  const cats = [
    {
      id: 'seed-cat-mochi',
      name: 'Mochi',
      breed: 'Domestic Shorthair',
      dateOfBirth: context.now - 63_072_000_000,
      isDateOfBirthEstimated: true,
      lifestyle: 'indoor',
      microchipNumber: '985141000123456',
      currentClinicId: 'seed-vet-clinic-blue-bark',
      shelterOrigin: {
        name: 'Moonlight Cat Rescue',
        address: '123 Adoption Lane',
      },
      adoptedAt: context.now - 47_520_000_000,
      customKeyDates: [
        {
          label: 'Spayed',
          date: context.now - 45_792_000_000,
        },
        {
          label: 'Rabies vaccine',
          date: context.now - 15_552_000_000,
        },
      ],
      insurance: {
        provider: 'Trupanion',
        policyNumber: 'TRU-445211',
        monthlyPremium: 34.75,
        coverageStartDate: context.now - 47_433_600_000,
        coverageNotes: 'Exam fees reimbursed after deductible.',
      },
      notes: 'Loves crinkle balls and insists on supervising every sink visit.',
    },
    {
      id: 'seed-cat-juniper',
      name: 'Juniper',
      breed: 'Ragdoll',
      dateOfBirth: context.now - 94_608_000_000,
      isDateOfBirthEstimated: false,
      lifestyle: 'indoor_outdoor',
      microchipNumber: '985141000654321',
      shelterOrigin: {
        name: 'Willow Foster Network',
      },
      adoptedAt: context.now - 78_624_000_000,
      customKeyDates: [
        {
          label: 'Dental cleaning',
          date: context.now - 7_776_000_000,
        },
      ],
      notes: 'Needs a slow feeder and always steals the warm laundry basket.',
    },
  ] as const;

  const clinics = [
    {
      id: 'seed-vet-clinic-blue-bark',
      name: 'Blue Bark Veterinary Clinic',
      phone: '(415) 555-0147',
      email: 'urgent@bluebarkvet.example',
      address: '272 Maple Avenue, Portland, OR',
      isEmergency24Hour: true,
      notes: '24-hour urgent care for after-hours emergencies.',
    },
    {
      id: 'seed-vet-clinic-harbor',
      name: 'Harbor Cat & Pet Center',
      phone: '(415) 555-0192',
      email: 'hello@harborpet.example',
      address: '184 River Street, Portland, OR',
      isEmergency24Hour: false,
      notes: 'Primary care visits and routine checkups.',
    },
  ] as const;

  const doctors = [
    {
      id: 'seed-doctor-maya',
      clinicId: 'seed-vet-clinic-blue-bark',
      name: 'Dr. Maya Lee',
      notes: 'Handles chronic condition follow-ups and urgent same-day visits.',
    },
    {
      id: 'seed-doctor-daniela',
      clinicId: 'seed-vet-clinic-harbor',
      name: 'Dr. Daniela Ruiz',
      notes: 'Routine wellness and dental visits.',
    },
  ] as const;

  const vaccinationsByCat: Record<
    string,
    Array<{
      id: string;
      name: string;
      administeredAt: number;
      expiresAt: number | null;
      clinicId: string | null;
      doctorId: string | null;
      lotNumber: string | null;
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-vaccination-mochi-rabies',
        name: 'Rabies',
        administeredAt: context.now - 15_552_000_000,
        expiresAt: context.now + 47_520_000_000,
        clinicId: 'seed-vet-clinic-blue-bark',
        doctorId: 'seed-doctor-maya',
        lotNumber: 'L-1024',
      },
      {
        id: 'seed-vaccination-mochi-fvrcp',
        name: 'FVRCP',
        administeredAt: context.now - 31_536_000_000,
        expiresAt: context.now + 31_536_000_000,
        clinicId: 'seed-vet-clinic-blue-bark',
        doctorId: 'seed-doctor-maya',
        lotNumber: 'L-0876',
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-vaccination-juniper-rabies',
        name: 'Rabies',
        administeredAt: context.now - 23_328_000_000,
        expiresAt: context.now + 39_744_000_000,
        clinicId: 'seed-vet-clinic-harbor',
        doctorId: 'seed-doctor-daniela',
        lotNumber: 'L-2201',
      },
    ],
  };

  const weightEntriesByCat: Record<
    string,
    Array<{ id: string; weight: number; unit: 'lb' | 'kg'; measuredAt: number }>
  > = {
    'seed-cat-mochi': [
      { id: 'seed-weight-mochi-1', weight: 8.2, unit: 'lb', measuredAt: context.now - 15_552_000_000 },
      { id: 'seed-weight-mochi-2', weight: 8.6, unit: 'lb', measuredAt: context.now - 7_776_000_000 },
      { id: 'seed-weight-mochi-3', weight: 8.9, unit: 'lb', measuredAt: context.now - 2_592_000_000 },
    ],
    'seed-cat-juniper': [
      { id: 'seed-weight-juniper-1', weight: 9.4, unit: 'lb', measuredAt: context.now - 15_552_000_000 },
      { id: 'seed-weight-juniper-2', weight: 9.1, unit: 'lb', measuredAt: context.now - 5_184_000_000 },
    ],
  };

  let vaccinationCount = 0;
  let weightEntryCount = 0;

  cats.forEach((cat) => {
    const catRef = householdRef.collection('cats').doc(cat.id);

    batch.set(
      catRef,
      {
        ...cat,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );

    (vaccinationsByCat[cat.id] ?? []).forEach((vaccination) => {
      const vaccinationRef = catRef.collection('vaccinations').doc(vaccination.id);

      batch.set(
        vaccinationRef,
        {
          ...vaccination,
          householdId: HOUSEHOLD_ID,
          catId: cat.id,
          linkedVisitId: null,
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      vaccinationCount += 1;
    });

    (weightEntriesByCat[cat.id] ?? []).forEach((weightEntry) => {
      const weightEntryRef = catRef.collection('weightEntries').doc(weightEntry.id);

      batch.set(
        weightEntryRef,
        {
          ...weightEntry,
          catId: cat.id,
          linkedVisitId: null,
          createdBy: caretaker.uid,
          createdAt,
        },
        { merge: true },
      );
      weightEntryCount += 1;
    });
  });

  clinics.forEach((clinic) => {
    const clinicRef = householdRef.collection('vetClinics').doc(clinic.id);

    batch.set(
      clinicRef,
      {
        ...clinic,
        householdId: HOUSEHOLD_ID,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
  });

  doctors.forEach((doctor) => {
    const doctorRef = householdRef.collection('doctors').doc(doctor.id);

    batch.set(
      doctorRef,
      {
        ...doctor,
        householdId: HOUSEHOLD_ID,
        createdAt,
      },
      { merge: true },
    );
  });

  await batch.commit();

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      2 + cats.length + clinics.length + doctors.length + vaccinationCount + weightEntryCount,
  };

  return result;
}
