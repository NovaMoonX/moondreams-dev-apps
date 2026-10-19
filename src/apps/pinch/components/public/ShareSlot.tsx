import { useId, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Skeleton } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import TickMark from '@/components/TickMark';
import { useAuth } from '@/hooks/useAuth';
import { SHARE_SLOT_COPY } from '@apps/pinch/constants';
import { useShareAdd } from '@apps/pinch/hooks/useShareAdd';
import {
  getAddedMessage,
  type ShareTarget,
} from '@apps/pinch/utils/importShare';

const PINCH_RECIPES_PATH = '/pinch?tab=recipes';

interface SlotCardProps {
  emoji: ReactNode;
  lead: ReactNode;
  hint?: ReactNode;
  isBusy?: boolean;
  children: ReactNode;
}

function SlotCard({
  emoji,
  lead,
  hint,
  isBusy = false,
  children,
}: SlotCardProps) {
  const leadId = useId();

  return (
    <section
      aria-labelledby={leadId}
      aria-busy={isBusy}
      aria-live='polite'
      className='bg-accent/60 border-border rounded-2xl border p-3.5'
    >
      <div className='flex items-start gap-3'>
        <span
          aria-hidden='true'
          className='bg-background/70 border-border grid size-10 shrink-0 place-items-center rounded-full border text-lg leading-none'
        >
          {emoji}
        </span>
        <div className='min-h-17 min-w-0 flex-1 space-y-0.5 pt-0.5'>
          <div id={leadId} className='font-medium text-pretty'>
            {lead}
          </div>
          {hint && (
            <div className='text-muted-foreground text-sm text-pretty'>
              {hint}
            </div>
          )}
        </div>
      </div>
      <div className='mt-3 space-y-3'>{children}</div>
    </section>
  );
}

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
        className='h-11 w-full gap-2'
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
  return (
    <SlotCard
      emoji={copy.emoji}
      lead={copy.visitorLead}
      hint={copy.visitorHint}
      isBusy={isAdding}
    >
      {state.phase === 'idle' && state.error && (
        <p className='text-destructive text-sm' role='alert'>
          {state.error}
        </p>
      )}
      {state.phase === 'idle' && state.notice && (
        <p className='text-muted-foreground text-sm'>{state.notice}</p>
      )}
      <Button
        type='button'
        className='h-11 w-full'
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

function Benefits({ target }: KindSlotProps) {
  return (
    <ul className='space-y-1.5'>
      {SHARE_SLOT_COPY[target.kind].benefits.map((benefit) => (
        <li key={benefit.text} className='flex gap-2 text-sm'>
          <span className='w-5 shrink-0 text-center' aria-hidden='true'>
            {benefit.emoji}
          </span>
          <span className='min-w-0 text-pretty'>{benefit.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The page's one action: the same card in every state, so a signed-out page reads like a signed-in one. Only a signed-out page adds the lines about what an account gives, under the card. */
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
    <div className={join('space-y-3', className)}>
      {getCard()}
      {user === null && !isChecking && <Benefits target={target} />}
    </div>
  );
}

export default ShareSlot;
