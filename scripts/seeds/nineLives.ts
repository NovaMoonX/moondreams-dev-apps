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
      inviteCode: null,
      pendingMembers: [],
      createdBy: caretaker.uid,
      createdAt,
      lastEditedAt: context.now,
    },
    { merge: true },
  );

  const cats = [
    {
      id: 'seed-cat-mochi',
      name: 'Mochi',
      breed: 'Domestic Shorthair',
      dateOfBirth: context.now - 63_072_000_000,
      isDateOfBirthEstimated: true,
      lifestyle: 'indoor',
      microchipNumber: '985141000123456',
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
  });

  await batch.commit();

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1 + cats.length,
  };

  return result;
}
