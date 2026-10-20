import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Skeleton } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FormSection from '@/components/FormSection';
import TickMark from '@/components/TickMark';
import { useAuth } from '@/hooks/useAuth';
import SlotCard from '@apps/pinch/components/public/SlotCard';
import { SHARE_BENEFITS_TITLE, SHARE_SLOT_COPY } from '@apps/pinch/constants';
import { useShareAdd } from '@apps/pinch/hooks/useShareAdd';
import {
  getAddedMessage,
  type ShareTarget,
} from '@apps/pinch/utils/importShare';

const PINCH_RECIPES_PATH = '/pinch?tab=recipes';

interface KindSlotProps {
  target: ShareTarget;
}

function OwnerSlot({ target }: KindSlotProps) {
  const navigate = useNavigate();
  const copy = SHARE_SLOT_COPY[target.kind];

  return (
    <SlotCard
      emoji={copy.emoji}
      lead={copy.ownerLead}
      hint='Everyone with the link sees this page, just as you do now.'
    >
      <Button
        type='button'
        className='h-11 w-full'
        onClick={() => navigate(PINCH_RECIPES_PATH)}
      >
        Open in Pinch
      </Button>
    </SlotCard>
  );
}

function SignedOutSlot({ target }: KindSlotProps) {
  const { signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const copy = SHARE_SLOT_COPY[target.kind];

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SlotCard
      emoji={copy.emoji}
      lead={copy.signedOutLead}
      hint={copy.signedOutHint}
    >
      <Button
        type='button'
        className='disabled:bg-primary! disabled:text-primary-foreground! h-11 w-full gap-2 disabled:opacity-90!'
        disabled={isSigningIn}
        onClick={() => void handleSignIn()}
      >
        <Google className='size-4' />
        {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
      </Button>
    </SlotCard>
  );
}

interface VisitorSlotProps extends KindSlotProps {
  uid: string;
  shareId: string;
}

function VisitorSlot({ uid, shareId, target }: VisitorSlotProps) {
  const navigate = useNavigate();
  const { state, add, undo } = useShareAdd({ uid, shareId, target });
  const copy = SHARE_SLOT_COPY[target.kind];

  if (state.phase === 'added') {
    const { written } = state;
    return (
      <SlotCard
        emoji={copy.emoji}
        lead={
          <>
            <TickMark className='mr-1.5' />
            {getAddedMessage(target.kind, written.recipes.length)}
          </>
        }
        hint={
          written.missingCovers > 0
            ? `${written.missingCovers === 1 ? 'The photo' : 'Some photos'} didn't come along.`
            : copy.addedHint
        }
      >
        {state.undoError && (
          <p className='text-destructive text-sm' role='alert'>
            {state.undoError}
          </p>
        )}
        <div className='flex gap-2'>
          {state.canUndo && (
            <Button
              type='button'
              variant='secondary'
              className='h-11 shrink-0'
              disabled={state.isUndoing}
              onClick={() => void undo()}
            >
              {state.isUndoing ? 'Undoing…' : 'Undo'}
            </Button>
          )}
          <Button
            type='button'
            className='h-11 min-w-0 flex-1'
            onClick={() => navigate(PINCH_RECIPES_PATH)}
          >
            See it in Pinch
          </Button>
        </div>
      </SlotCard>
    );
  }

  const isAdding = state.phase === 'adding';
  const getHint = () => {
    if (state.phase !== 'idle') return copy.visitorHint;
    if (state.error) {
      return (
        <span className='text-destructive' role='alert'>
          {state.error}
        </span>
      );
    }
    return state.notice ?? copy.visitorHint;
  };
  return (
    <SlotCard
      emoji={copy.emoji}
      lead={copy.visitorLead}
      hint={getHint()}
      isBusy={isAdding}
    >
      <Button
        type='button'
        className='disabled:bg-primary! disabled:text-primary-foreground! h-11 w-full disabled:opacity-90!'
        disabled={isAdding}
        onClick={() => void add()}
      >
        {isAdding ? copy.addingLabel : copy.addLabel}
      </Button>
    </SlotCard>
  );
}

interface ShareSlotProps {
  shareId: string;
  target: ShareTarget;
  isOwner: boolean;
  isChecking: boolean;
  className?: string;
}

/** What an account gives, in a framed list under the sign-in card with a caption that says what it is about, drawn like the page's other sections. */
function Benefits({ target }: KindSlotProps) {
  return (
    <FormSection title={SHARE_BENEFITS_TITLE}>
      <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
        {SHARE_SLOT_COPY[target.kind].benefits.map((benefit) => (
          <li
            key={benefit.text}
            className='flex items-start gap-3 px-4 py-2.5 text-sm'
          >
            <span className='w-5 shrink-0 text-center' aria-hidden='true'>
              {benefit.emoji}
            </span>
            <span className='min-w-0 text-pretty'>{benefit.text}</span>
          </li>
        ))}
      </ul>
    </FormSection>
  );
}

/** The page's one action: the same card in every state, so a signed-out page reads like a signed-in one. Only a signed-out page adds the list of what an account gives, under the card. */
function ShareSlot({
  shareId,
  target,
  isOwner,
  isChecking,
  className,
}: ShareSlotProps) {
  const { user } = useAuth();

  const getCard = () => {
    if (isChecking) {
      return (
        <SlotCard
          emoji={SHARE_SLOT_COPY[target.kind].emoji}
          lead={<Skeleton className='h-5 w-44' />}
          hint={<Skeleton className='mt-1.5 h-4 w-60 max-w-full' />}
          isBusy
        >
          <Skeleton className='h-11 w-full' />
        </SlotCard>
      );
    }
    if (user === null) return <SignedOutSlot target={target} />;
    if (isOwner) return <OwnerSlot target={target} />;

    return (
      <VisitorSlot
        key={`${shareId}:${user.uid}`}
        uid={user.uid}
        shareId={shareId}
        target={target}
      />
    );
  };

  return (
    <div className={join('space-y-5', className)}>
      {getCard()}
      {user === null && !isChecking && <Benefits target={target} />}
    </div>
  );
}

export default ShareSlot;
