import { faker } from '@faker-js/faker';

import { getDefaultBoxes } from '../../src/apps/worth-the-wait/utils/boxHelpers.ts';

import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const SPACE_ID = 'seed-shared-space';

function createItem(
  id: string,
  authorId: string,
  content: string,
  createdAt: number,
  revealedMethod?: 'full_reveal' | 'raffle',
) {
  const item = {
    id,
    authorId,
    content,
    isRevealed: Boolean(revealedMethod),
    revealedAt: revealedMethod ? createdAt + 10_000 : null,
    revealedMethod: revealedMethod ?? null,
    createdAt,
    lastEditedAt: createdAt,
  };

  return item;
}

export async function seedWorthTheWait(context: SeedContext): Promise<SeedResult> {
  faker.seed(20260818);

  const firstMember = FIXTURE_USERS.partnerOne;
  const secondMember = FIXTURE_USERS.partnerTwo;
  const spaceRef = context.firestore
    .collection('apps')
    .doc('worth-the-wait')
    .collection('spaces')
    .doc(SPACE_ID);
  const batch = context.firestore.batch();
  const spaceCreatedAt = context.now - 604_800_000;

  batch.set(
    spaceRef,
    {
      id: SPACE_ID,
      createdBy: firstMember.uid,
      createdAt: spaceCreatedAt,
      updatedAt: context.now,
      members: [firstMember.uid, secondMember.uid],
      inviteCode: null,
      pendingMember: null,
      activeAction: null,
    },
    { merge: true },
  );

  const defaultBoxes = getDefaultBoxes(spaceCreatedAt + 1_000);
  defaultBoxes.forEach((box) => {
    batch.set(spaceRef.collection('boxes').doc(box.id), box, { merge: true });
  });

  const revealRequestSeeds = [
    {
      boxId: defaultBoxes[0].id,
      requests: [
        {
          userId: firstMember.uid,
          method: 'raffle',
          requestedAt: context.now - 7_200_000,
        },
        {
          userId: secondMember.uid,
          method: 'raffle',
          requestedAt: context.now - 7_000_000,
        },
      ],
    },
    {
      boxId: defaultBoxes[1].id,
      requests: [
        {
          userId: firstMember.uid,
          method: 'full_reveal',
          requestedAt: context.now - 3_600_000,
        },
        {
          userId: secondMember.uid,
          method: 'raffle',
          requestedAt: context.now - 3_500_000,
        },
      ],
    },
    {
      boxId: defaultBoxes[2].id,
      requests: [
        {
          userId: firstMember.uid,
          method: 'raffle',
          requestedAt: context.now - 1_800_000,
        },
      ],
    },
    {
      boxId: defaultBoxes[4].id,
      requests: [
        {
          userId: secondMember.uid,
          method: 'full_reveal',
          requestedAt: context.now - 900_000,
        },
      ],
    },
  ];

  revealRequestSeeds.forEach(({ boxId, requests }) => {
    batch.set(
      spaceRef.collection('boxes').doc(boxId),
      { revealRequestedBy: requests },
      { merge: true },
    );
  });

  batch.set(
    spaceRef.collection('boxes').doc(defaultBoxes[3].id),
    {
      revealHistory: [
        {
          id: 'seed-recent-full-reveal',
          method: 'full_reveal',
          triggeredBy: firstMember.uid,
          revealedAt: context.now - 900_000,
          itemIds: ['seed-default-box-four-item-one'],
        },
      ],
    },
    { merge: true },
  );

  const customBox = {
    id: 'seed-custom-box',
    name: faker.word.words({ count: { min: 2, max: 3 } }),
    emoji: '🪄',
    description: faker.lorem.sentence({ min: 4, max: 7 }).slice(0, 50),
    isDefault: false,
    createdBy: firstMember.uid,
    revealRequestedBy: [
      {
        userId: firstMember.uid,
        method: 'full_reveal',
        requestedAt: context.now - 7_200_000,
      },
      {
        userId: secondMember.uid,
        method: 'full_reveal',
        requestedAt: context.now - 7_000_000,
      },
    ],
    revealHistory: [
      {
        id: 'seed-raffle-history',
        method: 'raffle',
        triggeredBy: firstMember.uid,
        revealedAt: context.now - 86_395_000,
        itemIds: ['seed-item-revealed-raffle'],
      },
    ],
    createdAt: context.now - 172_800_000,
    lastEditedAt: context.now - 172_800_000,
  };
  const customBoxRef = spaceRef.collection('boxes').doc(customBox.id);
  batch.set(customBoxRef, customBox, { merge: true });

  const defaultBoxSeeds = [
    {
      boxId: defaultBoxes[0].id,
      items: [
        createItem(
          'seed-default-box-one-item-one',
          firstMember.uid,
          'I want to take a spontaneous weekend trip with you once life settles down.',
          context.now - 345_600_000,
        ),
        createItem(
          'seed-default-box-one-item-two',
          secondMember.uid,
          'We should plan a cozy dinner night in after the next big deadline.',
          context.now - 172_800_000,
        ),
      ],
    },
    {
      boxId: defaultBoxes[1].id,
      items: [
        createItem(
          'seed-default-box-two-item-one',
          firstMember.uid,
          'That movie night in the rain was one of my favorite evenings ever.',
          context.now - 259_200_000,
        ),
      ],
    },
    {
      boxId: defaultBoxes[2].id,
      items: [
        createItem(
          'seed-default-box-three-item-one',
          secondMember.uid,
          'I love how patient and thoughtful you are when I am overwhelmed.',
          context.now - 120_960_000,
        ),
        createItem(
          'seed-default-box-three-item-two',
          firstMember.uid,
          'You make ordinary routines feel softer and more special.',
          context.now - 86_400_000,
        ),
      ],
    },
    {
      boxId: defaultBoxes[3].id,
      items: [
        createItem(
          'seed-default-box-four-item-one',
          firstMember.uid,
          'I want to slow dance in the kitchen with the lights low.',
          context.now - 90_000_000,
          'full_reveal',
        ),
      ],
    },
  ];

  const items = [
    createItem(
      'seed-item-revealed-raffle',
      firstMember.uid,
      faker.lorem.sentence(),
      context.now - 259_200_000,
      'raffle',
    ),
    createItem(
      'seed-item-revealed-full',
      secondMember.uid,
      faker.lorem.sentence(),
      context.now - 172_800_000,
      'full_reveal',
    ),
    createItem(
      'seed-item-unrevealed-one',
      firstMember.uid,
      faker.lorem.sentence(),
      context.now - 86_400_000,
    ),
    createItem(
      'seed-item-unrevealed-two',
      secondMember.uid,
      faker.lorem.sentence(),
      context.now - 43_200_000,
    ),
  ];

  defaultBoxSeeds.forEach(({ boxId, items: boxItems }) => {
    const boxRef = spaceRef.collection('boxes').doc(boxId);

    boxItems.forEach((item) => {
      batch.set(boxRef.collection('items').doc(item.id), item, { merge: true });
    });
  });

  items.forEach((item) => {
    batch.set(customBoxRef.collection('items').doc(item.id), item, { merge: true });
  });

  await batch.commit();

  const seedItemCount = defaultBoxSeeds.reduce(
    (total, { items: boxItems }) => total + boxItems.length,
    0,
  );

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1 + defaultBoxes.length + 1 + seedItemCount + items.length,
  };

  return result;
}