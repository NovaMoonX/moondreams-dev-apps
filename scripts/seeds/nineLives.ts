import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const HOUSEHOLD_ID = 'seed-nine-lives-household';
const SECOND_HOUSEHOLD_ID = 'seed-nine-lives-other-household';

export async function seedNineLives(context: SeedContext): Promise<SeedResult> {
  const caretaker = FIXTURE_USERS.nineLivesCaretaker;
  const coCaretaker = FIXTURE_USERS.partnerTwo;
  const batch = context.firestore.batch();
  const householdRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('households')
    .doc(HOUSEHOLD_ID);
  const secondHouseholdRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('households')
    .doc(SECOND_HOUSEHOLD_ID);
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

  batch.set(
    secondHouseholdRef,
    {
      id: SECOND_HOUSEHOLD_ID,
      name: 'Alex’s household',
      members: [coCaretaker.uid],
      inviteCode: 'NOVA9P',
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );

  const secondInviteCodeRef = context.firestore
    .collection('apps')
    .doc('nine-lives')
    .collection('inviteCodes')
    .doc('NOVA9P');
  batch.set(secondInviteCodeRef, { householdId: SECOND_HOUSEHOLD_ID }, { merge: true });

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
      description:
        'Sneezing, nasal discharge, and lethargy consistent with a common upper respiratory infection.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-laceration',
      name: 'Laceration',
      category: 'injury',
      description:
        'A skin wound or cut that may need cleaning, monitoring, or follow-up care.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-arthritis',
      name: 'Arthritis',
      category: 'chronic',
      description:
        'Chronic joint pain or stiffness that often needs ongoing monitoring and treatment.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-flea-burden',
      name: 'Flea burden',
      category: 'parasite',
      description:
        'Visible flea presence or itchy skin irritation from external parasites.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-food-allergy',
      name: 'Food allergy',
      category: 'allergy',
      description:
        'Gentle rash, itchy skin, or digestive upset linked to a food or ingredient exposure.',
      source: 'seed',
      sourceRef: null,
    },
    {
      id: 'seed-condition-unclassified',
      name: 'Other',
      category: 'other',
      description:
        'A condition that does not fit the standard illness, injury, chronic, parasite, or allergy categories.',
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

  const customPreventiveProducts = [
    {
      id: 'seed-custom-preventive-product-bravecto',
      label: 'Bravecto',
    },
  ] as const;

  const customPreventiveTypes = [
    {
      id: 'seed-custom-preventive-type-ear-mite-treatment',
      label: 'Ear mite treatment',
    },
  ] as const;

  const preventivesByCat: Record<
    string,
    Array<{
      id: string;
      name: string;
      customProductId: string | null;
      type: 'flea-tick' | 'heartworm' | 'mite' | 'dewormer' | 'medication' | 'other' | 'custom';
      customTypeId: string | null;
      administeredAt: number;
      expiresAt: number | null;
      dosage: string | null;
      clinicId: string | null;
      doctorId: string | null;
      linkedVisitId: string | null;
    }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-preventive-mochi-revolution',
        name: 'Revolution Plus',
        customProductId: null,
        type: 'flea-tick',
        customTypeId: null,
        administeredAt: context.now - 2_592_000_000,
        expiresAt: context.now + 2_592_000_000,
        dosage: '0.5 mL',
        clinicId: 'seed-vet-clinic-blue-bark',
        doctorId: 'seed-doctor-maya',
        linkedVisitId: null,
      },
      {
        id: 'seed-preventive-mochi-bravecto',
        name: customPreventiveProducts[0].label,
        customProductId: customPreventiveProducts[0].id,
        type: 'custom',
        customTypeId: customPreventiveTypes[0].id,
        administeredAt: context.now - 1_296_000_000,
        expiresAt: context.now + 6_480_000_000,
        dosage: null,
        clinicId: null,
        doctorId: null,
        linkedVisitId: null,
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-preventive-juniper-heartworm',
        name: 'Revolution Plus',
        customProductId: null,
        type: 'heartworm',
        customTypeId: null,
        administeredAt: context.now - 5_184_000_000,
        expiresAt: context.now + 25_920_000_000,
        dosage: '0.5 mL',
        clinicId: null,
        doctorId: null,
        linkedVisitId: null,
      },
    ],
  };

  const weightEntriesByCat: Record<
    string,
    Array<{ id: string; weight: number; unit: 'lb' | 'kg'; measuredAt: number }>
  > = {
    'seed-cat-mochi': [
      {
        id: 'seed-weight-mochi-1',
        weight: 8.2,
        unit: 'lb',
        measuredAt: context.now - 15_552_000_000,
      },
      {
        id: 'seed-weight-mochi-2',
        weight: 8.6,
        unit: 'lb',
        measuredAt: context.now - 7_776_000_000,
      },
      {
        id: 'seed-weight-mochi-3',
        weight: 8.9,
        unit: 'lb',
        measuredAt: context.now - 2_592_000_000,
      },
    ],
    'seed-cat-juniper': [
      {
        id: 'seed-weight-juniper-1',
        weight: 9.4,
        unit: 'lb',
        measuredAt: context.now - 15_552_000_000,
      },
      {
        id: 'seed-weight-juniper-2',
        weight: 9.1,
        unit: 'lb',
        measuredAt: context.now - 5_184_000_000,
      },
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
        description:
          'Skipped breakfast two days in a row but drinking water normally.',
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
        description:
          'Hiding under the bed more than usual and avoiding the living room.',
        quickTags: ['hiding', 'playfulness_change'],
        firstNoticedAt: context.now - 864_000_000,
        severity: 'moderate',
        linkedConditionId: null,
        resolvedAt: null,
      },
    ],
  };

  const expenses = [
    {
      id: 'seed-expense-mochi-adoption',
      catIds: ['seed-cat-mochi'],
      category: 'adoption_fee',
      label: null,
      amount: 125,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 47_520_000_000,
      notes: 'Adoption fee at Moonlight Cat Rescue.',
    },
    {
      id: 'seed-expense-mochi-insurance',
      catIds: ['seed-cat-mochi'],
      category: 'insurance',
      label: null,
      amount: 34.75,
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: null,
      incurredAt: context.now - 47_433_600_000,
      notes: 'Trupanion monthly premium.',
    },
    {
      id: 'seed-expense-mochi-checkup',
      catIds: ['seed-cat-mochi'],
      category: 'vet',
      label: null,
      amount: 82,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 2_592_000_000,
      notes: 'Routine checkup at Blue Bark Veterinary Clinic.',
    },
    {
      id: 'seed-expense-juniper-food',
      catIds: ['seed-cat-juniper'],
      category: 'food',
      label: null,
      amount: 48.5,
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: null,
      incurredAt: context.now - 5_184_000_000,
      notes: 'Grain-free dry food subscription.',
    },
    {
      id: 'seed-expense-juniper-dental',
      catIds: ['seed-cat-juniper'],
      category: 'vet',
      label: 'Dental cleaning',
      amount: 310,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 7_776_000_000,
      notes: 'Dental cleaning at Harbor Cat & Pet Center.',
    },
    {
      id: 'seed-expense-household-annual-checkup',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      category: 'vet',
      label: 'Annual wellness visit',
      amount: 168,
      isRecurring: false,
      recurrenceInterval: null,
      recurrenceEndedAt: null,
      incurredAt: context.now - 2_592_000_000,
      notes: 'Shared annual wellness visit for both cats.',
    },
    {
      id: 'seed-expense-mochi-old-insurance',
      catIds: ['seed-cat-mochi'],
      category: 'insurance',
      label: 'Previous provider',
      amount: 28,
      isRecurring: true,
      recurrenceInterval: 'monthly',
      recurrenceEndedAt: context.now - 31_536_000_000,
      incurredAt: context.now - 63_072_000_000,
      notes: 'Cancelled after switching to Trupanion.',
    },
    {
      id: 'seed-expense-juniper-membership',
      catIds: ['seed-cat-juniper'],
      category: 'other',
      label: 'Pet club membership',
      amount: 60,
      isRecurring: true,
      recurrenceInterval: 'yearly',
      recurrenceEndedAt: context.now - 15_552_000_000,
      incurredAt: context.now - 47_520_000_000,
      notes: 'Annual membership, not renewed.',
    },
  ] as const;

  const litterBoxes = [
    {
      id: 'seed-litter-box-main',
      name: 'Main litter box',
      location: 'Upstairs bathroom',
    },
    {
      id: 'seed-litter-box-office',
      name: 'Office litter box',
      location: 'Home office',
    },
  ] as const;

  const customLitterTypes = [
    {
      id: 'seed-custom-litter-type-recycled-paper',
      label: 'Recycled paper pellets',
    },
  ] as const;

  const litters = [
    {
      id: 'seed-litter-tidy-cats',
      brand: 'Tidy Cats',
      litterType: 'clumping_clay' as const,
      customLitterTypeId: null,
      weight: 20,
      weightUnit: 'lb' as const,
      cost: 22.99,
    },
    {
      id: 'seed-litter-yesterdays-news',
      brand: "Yesterday's News",
      litterType: 'custom' as const,
      customLitterTypeId: 'seed-custom-litter-type-recycled-paper',
      weight: 13.5,
      weightUnit: 'lb' as const,
      cost: 12.5,
    },
  ] as const;

  const litterEntries = [
    {
      id: 'seed-litter-main-1',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weight: 18.5,
      weightUnit: 'lb',
      loggedAt: context.now - 14 * 86_400_000,
      changedAt: context.now - 16 * 86_400_000,
      notes: 'Fresh litter after a full box change.',
    },
    {
      id: 'seed-litter-main-2',
      litterBoxId: 'seed-litter-box-main',
      litterId: 'seed-litter-tidy-cats',
      weight: 13.25,
      weightUnit: 'lb',
      loggedAt: context.now - 7 * 86_400_000,
      changedAt: context.now - 16 * 86_400_000,
      notes: 'Weekly weigh-in.',
    },
    {
      id: 'seed-litter-office-1',
      litterBoxId: 'seed-litter-box-office',
      litterId: 'seed-litter-yesterdays-news',
      weight: 8,
      weightUnit: 'lb',
      loggedAt: context.now - 3 * 86_400_000,
      changedAt: context.now - 4 * 86_400_000,
      notes: null,
    },
  ] as const;

  const customHealthRecordTypes = [
    {
      id: 'seed-custom-record-type-allergy-test',
      label: 'Allergy test',
    },
  ] as const;

  const healthRecords = [
    {
      id: 'seed-health-record-mochi-labs',
      catIds: ['seed-cat-mochi'],
      fileURL: 'https://example.com/seed-files/mochi-bloodwork.pdf',
      fileType: 'pdf' as const,
      fileName: 'mochi-bloodwork-results.pdf',
      label: null,
      recordType: 'lab_result' as const,
      customRecordTypeId: null,
      recordDate: context.now - 2_592_000_000,
      linkedVisitId: 'seed-visit-mochi-checkup',
      notes: 'Bloodwork from the routine checkup.',
    },
    {
      id: 'seed-health-record-juniper-allergy',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/juniper-allergy-panel.pdf',
      fileType: 'pdf' as const,
      fileName: 'juniper-allergy-panel.pdf',
      label: null,
      recordType: 'custom' as const,
      customRecordTypeId: 'seed-custom-record-type-allergy-test',
      recordDate: context.now - 7_776_000_000,
      linkedVisitId: null,
      notes: null,
    },
    {
      id: 'seed-health-record-household-insurance',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/household-insurance-policy.pdf',
      fileType: 'pdf' as const,
      fileName: 'household-insurance-policy.pdf',
      label: null,
      recordType: 'insurance' as const,
      customRecordTypeId: null,
      recordDate: null,
      linkedVisitId: null,
      notes: 'Shared insurance policy covering both cats.',
    },
    {
      id: 'seed-health-record-juniper-ear-photo',
      catIds: ['seed-cat-juniper'],
      fileURL: 'https://example.com/seed-files/IMG_2481.jpg',
      fileType: 'image' as const,
      fileName: 'IMG_2481.jpg',
      label: 'Ear infection photo',
      recordType: 'miscellaneous' as const,
      customRecordTypeId: null,
      recordDate: context.now - 1_296_000_000,
      linkedVisitId: null,
      notes: 'Photo sent to the vet before scheduling a follow-up.',
    },
  ] as const;

  const visits = [
    {
      id: 'seed-visit-mochi-checkup',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'completed' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now - 2_592_000_000,
      completedAt: context.now - 2_592_000_000,
      summary:
        'Routine checkup; weighed in and due for a rabies booster next cycle.',
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: ['seed-vaccination-mochi-rabies'],
      linkedWeightEntryIds: ['seed-weight-mochi-3'],
    },
    {
      id: 'seed-visit-mochi-follow-up',
      catIds: ['seed-cat-mochi'],
      clinicId: 'seed-vet-clinic-blue-bark',
      doctorId: 'seed-doctor-maya',
      status: 'upcoming' as const,
      reason: 'follow_up' as const,
      customReasonLabel: null,
      followUpOfVisitId: 'seed-visit-mochi-checkup',
      followUpNote: 'Recheck weight and appetite in two weeks.',
      title: null,
      scheduledAt: context.now + 1_209_600_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
    {
      id: 'seed-visit-household-annual',
      catIds: ['seed-cat-mochi', 'seed-cat-juniper'],
      clinicId: 'seed-vet-clinic-harbor',
      doctorId: 'seed-doctor-daniela',
      status: 'upcoming' as const,
      reason: 'checkup' as const,
      customReasonLabel: null,
      followUpOfVisitId: null,
      followUpNote: null,
      title: null,
      scheduledAt: context.now + 2_592_000_000,
      completedAt: null,
      summary: null,
      linkedSymptomIds: [],
      linkedConditionIds: [],
      linkedHealthRecordIds: [],
      linkedVaccinationIds: [],
      linkedWeightEntryIds: [],
    },
  ] as const;

  const linkedVaccinationVisits: Record<string, string> = {
    'seed-vaccination-mochi-rabies': 'seed-visit-mochi-checkup',
  };
  const linkedWeightEntryVisits: Record<string, string> = {
    'seed-weight-mochi-3': 'seed-visit-mochi-checkup',
  };

  let vaccinationCount = 0;
  let preventiveCount = 0;
  let weightEntryCount = 0;
  let expenseCount = 0;
  let litterEntryCount = 0;
  let litterBoxCount = 0;
  let litterCount = 0;
  let customLitterTypeCount = 0;
  let healthRecordCount = 0;
  let conditionLibraryCount = 0;
  let symptomCount = 0;
  let visitCount = 0;

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
      const vaccinationRef = householdRef
        .collection('vaccinations')
        .doc(vaccination.id);

      batch.set(
        vaccinationRef,
        {
          ...vaccination,
          householdId: HOUSEHOLD_ID,
          catId: cat.id,
          linkedVisitId: linkedVaccinationVisits[vaccination.id] ?? null,
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      vaccinationCount += 1;
    });

    (preventivesByCat[cat.id] ?? []).forEach((preventive) => {
      const preventiveRef = householdRef
        .collection('preventives')
        .doc(preventive.id);

      batch.set(
        preventiveRef,
        {
          ...preventive,
          householdId: HOUSEHOLD_ID,
          catIds: [cat.id],
          createdBy: caretaker.uid,
          createdAt,
          lastEditedAt: context.now,
        },
        { merge: true },
      );
      preventiveCount += 1;
    });

    (weightEntriesByCat[cat.id] ?? []).forEach((weightEntry) => {
      const weightEntryRef = householdRef
        .collection('weightEntries')
        .doc(weightEntry.id);

      batch.set(
        weightEntryRef,
        {
          ...weightEntry,
          catId: cat.id,
          linkedVisitId: linkedWeightEntryVisits[weightEntry.id] ?? null,
          createdBy: caretaker.uid,
          createdAt,
        },
        { merge: true },
      );
      weightEntryCount += 1;
    });

    (symptomsByCat[cat.id] ?? []).forEach((symptom) => {
      const symptomRef = householdRef.collection('symptoms').doc(symptom.id);

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

  const secondCatRef = secondHouseholdRef.collection('cats').doc('seed-cat-other-household');
  batch.set(
    secondCatRef,
    {
      id: 'seed-cat-other-household',
      householdId: SECOND_HOUSEHOLD_ID,
      name: 'Pixel',
      photoURL: null,
      dateOfBirth: context.now - 31_536_000_000,
      isDateOfBirthEstimated: false,
      breed: 'Domestic Shorthair',
      lifestyle: 'indoor',
      microchipNumber: null,
      shelterOrigin: null,
      adoptedAt: context.now - 25_920_000_000,
      customKeyDates: null,
      diet: null,
      currentClinicId: null,
      insurance: null,
      personalityTraits: null,
      notes: 'Separate-household fixture cat for household-isolation scoping checks.',
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );
  const secondPreventiveRef = secondHouseholdRef
    .collection('preventives')
    .doc('seed-preventive-other-household');
  batch.set(
    secondPreventiveRef,
    {
      id: 'seed-preventive-other-household',
      householdId: SECOND_HOUSEHOLD_ID,
      catIds: ['seed-cat-other-household'],
      name: 'Advantage Multi',
      customProductId: null,
      type: 'flea-tick',
      customTypeId: null,
      administeredAt: context.now - 2_592_000_000,
      expiresAt: context.now + 2_592_000_000,
      dosage: '0.4 mL',
      clinicId: null,
      doctorId: null,
      linkedVisitId: null,
      createdBy: coCaretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );
  preventiveCount += 1;

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

  visits.forEach((visit) => {
    const visitRef = householdRef.collection('visits').doc(visit.id);

    batch.set(
      visitRef,
      {
        ...visit,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    visitCount += 1;
  });

  expenses.forEach((expense) => {
    const expenseRef = householdRef.collection('expenses').doc(expense.id);

    batch.set(
      expenseRef,
      {
        ...expense,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    expenseCount += 1;
  });

  litterBoxes.forEach((litterBox) => {
    const litterBoxRef = householdRef.collection('litterBoxes').doc(litterBox.id);

    batch.set(
      litterBoxRef,
      {
        ...litterBox,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterBoxCount += 1;
  });

  customLitterTypes.forEach((customType) => {
    const customTypeRef = householdRef.collection('customLitterTypes').doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
    customLitterTypeCount += 1;
  });

  litters.forEach((litter) => {
    const litterRef = householdRef.collection('litters').doc(litter.id);

    batch.set(
      litterRef,
      {
        ...litter,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterCount += 1;
  });

  litterEntries.forEach((entry) => {
    const entryRef = householdRef.collection('litterEntries').doc(entry.id);

    batch.set(
      entryRef,
      {
        ...entry,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    litterEntryCount += 1;
  });

  customHealthRecordTypes.forEach((customType) => {
    const customTypeRef = householdRef
      .collection('customHealthRecordTypes')
      .doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  customPreventiveProducts.forEach((customProduct) => {
    const customProductRef = householdRef
      .collection('customPreventiveProducts')
      .doc(customProduct.id);

    batch.set(
      customProductRef,
      {
        ...customProduct,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  customPreventiveTypes.forEach((customType) => {
    const customTypeRef = householdRef
      .collection('customPreventiveTypes')
      .doc(customType.id);

    batch.set(
      customTypeRef,
      {
        ...customType,
        householdId: HOUSEHOLD_ID,
        createdBy: caretaker.uid,
        createdAt,
      },
      { merge: true },
    );
  });

  healthRecords.forEach((record) => {
    const recordRef = householdRef.collection('healthRecords').doc(record.id);

    batch.set(
      recordRef,
      {
        ...record,
        householdId: HOUSEHOLD_ID,
        uploadedBy: caretaker.uid,
        createdAt,
        lastEditedAt: context.now,
      },
      { merge: true },
    );
    healthRecordCount += 1;
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
      4 +
      conditionLibraryCount +
      cats.length +
      1 +
      clinics.length +
      doctors.length +
      vaccinationCount +
      preventiveCount +
      weightEntryCount +
      expenseCount +
      litterEntryCount +
      litterBoxCount +
      litterCount +
      customLitterTypeCount +
      customHealthRecordTypes.length +
      customPreventiveProducts.length +
      customPreventiveTypes.length +
      healthRecordCount +
      symptomCount +
      visitCount,
  };

  return result;
}
