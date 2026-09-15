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

  const conditionLibraryEntries = [
    {
      id: 'seed-condition-upper-respiratory',
      name: 'Upper respiratory infection',
      category: 'illness',
      description: 'Sneezing, nasal discharge, and lethargy consistent with a common upper respiratory infection.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-laceration',
      name: 'Laceration',
      category: 'injury',
      description: 'A skin wound or cut that may need cleaning, monitoring, or follow-up care.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-arthritis',
      name: 'Arthritis',
      category: 'chronic',
      description: 'Chronic joint pain or stiffness that often needs ongoing monitoring and treatment.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-flea-burden',
      name: 'Flea burden',
      category: 'parasite',
      description: 'Visible flea presence or itchy skin irritation from external parasites.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-food-allergy',
      name: 'Food allergy',
      category: 'allergy',
      description: 'Gentle rash, itchy skin, or digestive upset linked to a food or ingredient exposure.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-unclassified',
      name: 'Other',
      category: 'other',
      description: 'A condition that does not fit the standard illness, injury, chronic, parasite, or allergy categories.',
      source: 'seed',
      sourceRef: null,
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

  const symptomsByCat: Record<
    string,
    Array<{
      id: string;
      description: string;
      quickTags: string[];
      firstNoticedAt: number;
      severity: 'mild' | 'moderate' | 'severe' | null;
      linkedConditionId: string | null;
      resolvedAt: number | null;
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-symptom-mochi-appetite',
        description: 'Skipped breakfast two days in a row but drinking water normally.',
        quickTags: ['appetite_change'],
        firstNoticedAt: context.now - 1_728_000_000,
        severity: 'mild',
        linkedConditionId: null,
        resolvedAt: context.now - 1_209_600_000,
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-symptom-juniper-hiding',
        description: 'Hiding under the bed more than usual and avoiding the living room.',
        quickTags: ['hiding', 'playfulness_change'],
        firstNoticedAt: context.now - 864_000_000,
        severity: 'moderate',
        linkedConditionId: null,
        resolvedAt: null,
      },
    ],
  };

  let vaccinationCount = 0;
  let weightEntryCount = 0;
  let conditionLibraryCount = 0;
  let symptomCount = 0;

  conditionLibraryEntries.forEach((condition) => {
    const conditionRef = context.firestore
      .collection('apps')
      .doc('nine-lives')
      .collection('conditionLibrary')
      .doc(condition.id);

    batch.set(
      conditionRef,
      {
        ...condition,
        createdAt: context.now - 3_153_600_000,
      },
      { merge: true },
    );
    conditionLibraryCount += 1;
  });

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

    (symptomsByCat[cat.id] ?? []).forEach((symptom) => {
      const symptomRef = catRef.collection('symptoms').doc(symptom.id);

      batch.set(
        symptomRef,
        {
          ...symptom,
          catId: cat.id,
          linkedVisitIds: [],
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      symptomCount += 1;
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
      2 +
      conditionLibraryCount +
      cats.length +
      clinics.length +
      doctors.length +
      vaccinationCount +
      weightEntryCount +
      symptomCount,
  };

  return result;
}
