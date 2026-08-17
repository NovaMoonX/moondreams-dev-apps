import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useEffect, useState } from 'react';

type SpaceOnboardingModalProps = {
  isOpen: boolean;
  inviteCode?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onCreateSpace: () => Promise<unknown> | unknown;
  onJoinSpace: (inviteCode: string) => Promise<unknown> | unknown;
};

function SpaceOnboardingModal({
  isOpen,
  inviteCode = '',
  isSubmitting = false,
  onClose,
  onCreateSpace,
  onJoinSpace,
}: SpaceOnboardingModalProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [joinInput, setJoinInput] = useState(inviteCode);

  useEffect(() => {
    if (isOpen) {
      setJoinInput(inviteCode);
    }
  }, [inviteCode, isOpen]);

  const handleCreate = async () => {
    await onCreateSpace();
    setMode('create');
  };

  const handleJoin = async () => {
    await onJoinSpace(joinInput.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Create or join a space'
      actions={[
        {
          label: 'Close',
          variant: 'secondary',
          onClick: onClose,
        },
      ]}
    >
      <div className='space-y-5'>
        <div className='flex rounded-md border border-border bg-muted/30 p-1'>
          <button
            type='button'
            onClick={() => setMode('create')}
            className={
              mode === 'create'
                ? 'flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background'
                : 'flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground'
            }
          >
            Create Space
          </button>
          <button
            type='button'
            onClick={() => setMode('join')}
            className={
              mode === 'join'
                ? 'flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background'
                : 'flex-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground'
            }
          >
            Join Space
          </button>
        </div>

        {mode === 'create' ? (
          <div className='space-y-4'>
            <p className='text-muted-foreground text-sm'>
              Start your shared space and generate a unique invite code for your
              partner.
            </p>
            <div className='rounded-md border border-border bg-muted/30 p-3'>
              <div className='text-muted-foreground mb-1 text-xs uppercase tracking-[0.14em]'>
                Invite code
              </div>
              <div className='text-foreground text-2xl font-semibold tracking-[0.24em]'>
                {inviteCode || 'Generating...'}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={isSubmitting} className='w-full'>
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <p className='text-muted-foreground text-sm'>
              Enter the code shared by your partner to request access to the space.
            </p>
            <Input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder='Enter invite code'
              aria-label='Invite code'
            />
            <Button
              onClick={handleJoin}
              disabled={isSubmitting || !joinInput.trim()}
              className='w-full'
            >
              {isSubmitting ? 'Requesting...' : 'Request to Join'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default SpaceOnboardingModal;
