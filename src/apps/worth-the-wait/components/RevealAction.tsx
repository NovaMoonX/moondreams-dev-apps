import {
  Button,
  RadioGroup,
  RadioGroupItem,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useMemo, useState } from 'react';

import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@hooks/useAuth';

import { useBoxContext } from '../context/boxContext';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useRevealRequest } from '../hooks/useRevealRequest';
import type { RevealMethod } from '../types';
import { getFriendlyRevealMethod } from '../utils/boxHelpers';

const methodOptions: RevealMethod[] = ['full_reveal', 'raffle'];

function RevealAction() {
  const { user } = useAuth();
  const { box, spaceId } = useBoxContext();
  const { activeAction, space } = useWorthTheWait();
  const { toggleRevealRequest, startAction, loading } = useRevealRequest({
    spaceId,
    box,
    userUid: user?.uid,
  });
  const [startActionError, setStartActionError] = useState<string | null>(null);

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

  const isPartnerAvailable = partnerPresence?.isHere;
  const isActionForCurrentBox = Boolean(
    activeAction && activeAction.boxId === box.id,
  );
  const actionLocked = Boolean(
    activeAction && activeAction.status !== 'completed',
  );

  const isTriggerEnabled =
    Boolean(mutualMethod) && isPartnerAvailable && !actionLocked;

  const handleStartAction = async () => {
    if (!isTriggerEnabled || !mutualMethod || !user?.uid) {
      return;
    }

    await startAction(mutualMethod);
  };

  const getRevealStatusMessage = () => {
    if (actionLocked) {
      return null;
    }

    if (mutualMethod) {
      return 'Both you and your partner have matched and can now start the reveal!';
    }

    if (selectedMethod && partnerRequest) {
      return 'You and your partner have made different requests. Match to continue.';
    }

    if (!selectedMethod && partnerRequest) {
      return 'Your partner has made a request. Choose the same method to match.';
    }

    if (selectedMethod && !partnerRequest) {
      return 'Waiting for your partner to make a request.';
    }

    if (partnerUid) {
      return 'Choose a reveal method to start matching with your partner.';
    }

    return 'Add your partner to start sharing a reveal request.';
  };

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
            disabled={actionLocked}
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
              disabled={actionLocked}
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
                <span
                  className={join(
                    'text-muted-foreground text-[11px]',
                    !isSelected && isPartnerSelected && 'text-emerald-500!',
                  )}
                >
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
          {getRevealStatusMessage()}
        </div>

        <Button
          type='button'
          size='sm'
          disabled={!isTriggerEnabled}
          onClick={() => {
            handleStartAction().catch((error) => {
              console.error('Error starting action:', error);
              setStartActionError(
                'An error occurred while starting the action. Please try again.',
              );
            });
          }}
          loading={loading}
        >
          <span
            className={
              actionLocked && isActionForCurrentBox ? 'animate-pulse' : ''
            }
          >
            {!actionLocked
              ? 'Start Action'
              : isActionForCurrentBox
                ? 'Reveal in progress'
                : 'Another box is being revealed'}
          </span>
        </Button>
      </div>
      <div className='my-1 text-right'>
        <span className='text-destructive text-xs'>{startActionError}</span>
      </div>
    </div>
  );
}

export default RevealAction;
