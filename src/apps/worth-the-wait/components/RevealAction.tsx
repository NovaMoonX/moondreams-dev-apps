import {
  Button,
  RadioGroup,
  RadioGroupItem,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { doc, updateDoc } from 'firebase/firestore';
import { useMemo } from 'react';

import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@hooks/useAuth';
import { db } from '@lib/firebase/config';

import { useBoxContext } from '../context/boxContext';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useActiveAction } from '../hooks/useActiveAction';
import type { RevealMethod } from '../types';
import { getFriendlyRevealMethod } from '../utils/boxHelpers';

function RevealAction() {
  const { user } = useAuth();
  const { box, spaceId } = useBoxContext();
  const { space } = useWorthTheWait();
  const { activeAction } = useActiveAction(spaceId);

  const partnerUid = useMemo(() => {
    if (!user || !space) {
      return null;
    }

    return space.members.find((memberUid) => memberUid !== user.uid) ?? null;
  }, [space, user]);

  const partnerPresence = usePresence(partnerUid, 'worth-the-wait');
  const currentUserRequest =
    box.revealRequestedBy.find((request) => request.userId === user?.uid) ??
    null;
  const partnerRequest =
    partnerUid == null
      ? null
      : (box.revealRequestedBy.find(
          (request) => request.userId === partnerUid,
        ) ?? null);

  const selectedMethod = currentUserRequest?.method ?? null;
  const mutualMethod =
    selectedMethod && partnerRequest && selectedMethod === partnerRequest.method
      ? selectedMethod
      : null;

  const isPartnerAvailable =
    partnerPresence?.isOnline === true &&
    partnerPresence.currentLocation === 'worth-the-wait';
  const actionLocked = Boolean(
    activeAction && activeAction.status !== 'completed',
  );
  const isTriggerEnabled =
    Boolean(mutualMethod) && isPartnerAvailable && !actionLocked;

  const toggleRevealRequest = async (method: RevealMethod) => {
    if (!user?.uid) {
      return;
    }

    const boxRef = doc(
      db,
      'apps',
      'worth-the-wait',
      'spaces',
      spaceId,
      'boxes',
      box.id,
    );
    const nextRequests = box.revealRequestedBy.filter(
      (request) => request.userId !== user.uid,
    );

    if (currentUserRequest?.method === method) {
      await updateDoc(boxRef, { revealRequestedBy: nextRequests });
      return;
    }

    await updateDoc(boxRef, {
      revealRequestedBy: [
        ...nextRequests,
        {
          userId: user.uid,
          method,
          requestedAt: Date.now(),
        },
      ],
    });
  };

  const handleStartAction = async () => {
    if (!isTriggerEnabled || !mutualMethod || !user?.uid) {
      return;
    }

    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
    await updateDoc(spaceRef, {
      activeAction: {
        actionId: `${user.uid}-${box.id}-${mutualMethod}-${Date.now()}`,
        boxId: box.id,
        method: mutualMethod,
        status: 'initiating',
        selectedItemIds: [],
        initiatedBy: user.uid,
        startedAt: Date.now(),
        completedAt: null,
      },
    });
  };

  const methodOptions: RevealMethod[] = ['full_reveal', 'raffle'];

  return (
    <div className='border-border bg-muted/30 rounded-2xl border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <p className='text-foreground text-sm font-semibold'>
            Is it time to share?
          </p>
          <p className='text-muted-foreground text-xs'>
            Match your partner to unlock the reveal.
          </p>
        </div>

        {selectedMethod ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => void toggleRevealRequest(selectedMethod)}
          >
            Remove request
          </Button>
        ) : null}
      </div>

      <RadioGroup
        value={selectedMethod ?? ''}
        onChange={(nextValue) => {
          void toggleRevealRequest(nextValue as RevealMethod);
        }}
        className='grid gap-2 sm:grid-cols-2'
      >
        {methodOptions.map((method) => {
          const isSelected = selectedMethod === method;
          const isPartnerSelected = partnerRequest?.method === method;

          return (
            <RadioGroupItem
              key={method}
              value={method}
              hideInput
              className={join(
                'min-h-14 rounded-xl border px-3 py-2 text-left transition',
                isSelected
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                  : 'border-border bg-card text-foreground hover:border-ring/60',
              )}
            >
              <div className='flex flex-col'>
                <span className='text-sm font-medium'>
                  {getFriendlyRevealMethod(method)}
                </span>
                <span className='text-muted-foreground text-[11px]'>
                  {isSelected
                    ? 'You requested this'
                    : isPartnerSelected
                      ? 'Partner requested this'
                      : 'Tap to request'}
                </span>
              </div>
            </RadioGroupItem>
          );
        })}
      </RadioGroup>

      <div className='mt-4 flex items-center justify-between gap-3'>
        <div className='text-muted-foreground text-xs'>
          {mutualMethod
            ? `Both of you requested ${getFriendlyRevealMethod(mutualMethod)}.`
            : partnerUid
              ? 'Waiting for a matching request from your partner.'
              : 'Add your partner to start sharing a reveal request.'}
        </div>

        <Button
          type='button'
          size='sm'
          disabled={!isTriggerEnabled}
          onClick={() => void handleStartAction()}
        >
          {actionLocked ? 'Reveal in progress' : 'Start Action'}
        </Button>
      </div>
    </div>
  );
}

export default RevealAction;
