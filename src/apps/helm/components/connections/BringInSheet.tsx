import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import AppCheckbox from '@/components/AppCheckbox';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { HELM_COPY } from '@apps/helm/constants';
import type { BringInPlan } from '@apps/helm/engine/bringIn';
import type { BringInOffer } from '@apps/helm/hooks/useBringInOffers';
import { undoExecution } from '@apps/helm/nomos/undoExecution';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  bringIntoCircle,
  type BringInChoice,
} from '@apps/helm/store/actions/bringInActions';

interface BringInSheetProps {
  isOpen: boolean;
  onClose: () => void;
  offer: BringInOffer;
}

type Answer = 'merge' | 'new';

const toKey = (plan: BringInPlan) => plan.candidate.key;

const toDescribe = (plan: BringInPlan) => {
  if (plan.kind === 'new') return HELM_COPY.bringInNewRow;
  const merge = HELM_COPY.bringInSameRow(plan.who.name);
  return plan.kind === 'same'
    ? merge
    : HELM_COPY.bringInMaybeRow(plan.who.name);
};

const toAdds = (plan: BringInPlan) =>
  plan.kind === 'new'
    ? plan.candidate.detail
    : plan.adds.length === 0
      ? HELM_COPY.bringInMergeAddsNothing
      : HELM_COPY.bringInMergeAdds(plan.adds);

function BringInForm({ onClose, offer }: Omit<BringInSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const isOffline = useNetworkStatus() === 'offline';
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<{
    executionId: string;
    summary: string;
    isUndone: boolean;
  } | null>(null);

  const choices = offer.plans.flatMap((plan): BringInChoice[] => {
    const key = toKey(plan);
    if (plan.kind === 'maybe') {
      const answer = answers[key];
      return answer === undefined
        ? []
        : [
            {
              candidate: plan.candidate,
              intoWhoId: answer === 'merge' ? plan.who.id : null,
            },
          ];
    }
    if (unticked.has(key)) return [];
    return [
      {
        candidate: plan.candidate,
        intoWhoId: plan.kind === 'same' ? plan.who.id : null,
      },
    ];
  });

  const toggle = (key: string, isOn: boolean) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (isOn) next.delete(key);
      else next.add(key);
      return next;
    });

  const bringIn = async () => {
    if (!user || isWorking || choices.length === 0) return;
    setIsWorking(true);
    setFailure(null);
    const result = await bringIntoCircle(
      user.uid,
      await getHelmEncryption(user.uid),
      choices,
      offer.appName,
    );
    setIsWorking(false);
    if (result.kind === 'offline') return setFailure(HELM_COPY.bringInOffline);
    if (result.kind === 'failed' || result.executionId === null)
      return setFailure(HELM_COPY.bringInFailed);
    setDone({
      executionId: result.executionId,
      summary: HELM_COPY.bringInDone(
        HELM_COPY.bringInSummary(result.brought, result.merged),
      ),
      isUndone: false,
    });
  };

  const undo = async () => {
    if (!user || !done || isWorking) return;
    setIsWorking(true);
    const result = await undoExecution(
      user.uid,
      await getHelmEncryption(user.uid),
      done.executionId,
    );
    setIsWorking(false);
    if (result.kind === 'done') setDone({ ...done, isUndone: true });
    else setFailure(HELM_COPY.bringInUndoFailed);
  };

  if (done)
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-foreground text-[15px] text-pretty' role='status'>
          {done.isUndone ? HELM_COPY.bringInUndone : done.summary}
        </p>
        {failure && (
          <p className='text-destructive text-sm text-pretty' role='alert'>
            {failure}
          </p>
        )}
        <ModalFooterActions
          cancelAction={
            done.isUndone ? null : (
              <Button
                type='button'
                variant='tertiary'
                loading={isWorking}
                onClick={() => void undo()}
              >
                {HELM_COPY.bringInUndo}
              </Button>
            )
          }
          rightActions={
            <Button type='button' variant='primary' onClick={onClose}>
              {HELM_COPY.connectionGotIt}
            </Button>
          }
        />
      </div>
    );

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.bringInIntro}
      </p>
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {offer.plans.map((plan) => {
          const key = toKey(plan);
          const adds = toAdds(plan);
          return (
            <li key={key} className='flex flex-col gap-2 px-4 py-3'>
              <div className='flex items-start gap-3'>
                {plan.kind !== 'maybe' && (
                  <AppCheckbox
                    className='mt-0.5'
                    checked={!unticked.has(key)}
                    disabled={isWorking}
                    onCheckedChange={(isOn) => toggle(key, isOn)}
                    aria-label={plan.candidate.name}
                  />
                )}
                <div className='min-w-0 flex-1'>
                  <p className='text-foreground text-[15px] break-words'>
                    {plan.candidate.name}
                    {plan.candidate.role && (
                      <span className='text-muted-foreground'>
                        {` · ${plan.candidate.role}`}
                      </span>
                    )}
                  </p>
                  <p
                    className={join(
                      'text-[13px] text-pretty',
                      plan.kind === 'new'
                        ? 'text-muted-foreground'
                        : 'text-foreground',
                    )}
                  >
                    {toDescribe(plan)}
                  </p>
                  {adds && (
                    <p className='text-muted-foreground text-[13px] text-pretty'>
                      {adds}
                    </p>
                  )}
                </div>
              </div>
              {plan.kind === 'maybe' && (
                <div className='flex flex-wrap gap-2'>
                  {(['merge', 'new'] as const).map((answer) => (
                    <Button
                      key={answer}
                      type='button'
                      size='sm'
                      variant={answers[key] === answer ? 'primary' : 'outline'}
                      disabled={isWorking}
                      onClick={() =>
                        setAnswers((current) => ({
                          ...current,
                          [key]: answer,
                        }))
                      }
                    >
                      {answer === 'merge'
                        ? HELM_COPY.bringInMaybeYes(plan.who.name)
                        : HELM_COPY.bringInMaybeNo}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {failure && (
        <p className='text-destructive text-sm text-pretty' role='alert'>
          {failure}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={onClose}
            disabled={isWorking}
          >
            {HELM_COPY.bringInCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            variant='primary'
            loading={isWorking}
            disabled={choices.length === 0 || isOffline}
            onClick={() => void bringIn()}
          >
            {HELM_COPY.bringInConfirm(choices.length)}
          </Button>
        }
      />
    </div>
  );
}

/** The review before anything is written: each person, pet or business and how it would merge. Unsure matches wait for the person's yes or no. */
function BringInSheet({ isOpen, onClose, offer }: BringInSheetProps) {
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.bringInTitle(offer.appName)}
    >
      {isOpen && <BringInForm onClose={onClose} offer={offer} />}
    </FormSheet>
  );
}

export default BringInSheet;
