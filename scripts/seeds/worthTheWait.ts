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
      activeAction: {
        actionId: 'seed-completed-raffle',
        boxId: 'seed-custom-box',
        method: 'raffle',
        status: 'completed',
        selectedItemIds: ['seed-item-revealed-raffle'],
        initiatedBy: firstMember.uid,
        startedAt: context.now - 86_400_000,
        completedAt: context.now - 86_395_000,
      },
    },
    { merge: true },
  );

  const defaultBoxes = getDefaultBoxes(spaceCreatedAt + 1_000);
  defaultBoxes.forEach((box) => {
    batch.set(spaceRef.collection('boxes').doc(box.id), box, { merge: true });
  });

  const customBox = {
    id: 'seed-custom-box',
    name: faker.word.words({ count: { min: 2, max: 3 } }),
    emoji: '🪄',
    description: faker.lorem.sentence({ min: 4, max: 7 }).slice(0, 50),
    isDefault: false,
    createdBy: firstMember.uid,
    revealRequestedBy: [
      {
        userId: secondMember.uid,
        method: 'full_reveal',
        requestedAt: context.now - 7_200_000,
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
  items.forEach((item) => {
    batch.set(customBoxRef.collection('items').doc(item.id), item, { merge: true });
  });

  await batch.commit();

  const result: SeedResult = {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1 + defaultBoxes.length + 1 + items.length,
  };

  return result;
}