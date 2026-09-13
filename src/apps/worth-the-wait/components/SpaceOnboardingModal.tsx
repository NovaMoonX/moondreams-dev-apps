import { copyToClipboard } from '@/utils/clipboardUtils';
import CreateOrJoinModal from '@/ui/CreateOrJoinModal';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo, useState } from 'react';
import { generateInviteCode, generateInviteLink, SPACE_CODE_LENGTH } from '../utils/generateCode';

interface SpaceOnboardingModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  hasJoinBeenSubmitted?: boolean;
  searchJoinCode?: string | null;
  onCreateSpace: (inviteCode: string) => Promise<string>;
  onJoinSpace: (inviteCode: string) => Promise<string>;
  onClose: () => void;
}

function SpaceOnboardingModal({
  isOpen,
  isSubmitting = false,
  hasJoinBeenSubmitted = false,
  searchJoinCode,
  onCreateSpace,
  onJoinSpace,
  onClose,
}: SpaceOnboardingModalProps) {
  const { addToast } = useToast();
  const createInviteCode = useMemo(() => generateInviteCode(), []);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    onCreateSpace(createInviteCode)
      .then((inviteCode) => {
        copyToClipboard(generateInviteLink(inviteCode)).then(() => {
          addToast({
            title: 'Space Created 🎊',
            description: 'Link to join your space has been copied to your clipboard!',
          });
        });
      })
      .catch((error) => {
        setCreateError(error.message || 'An unexpected error occurred.');
        throw error;
      });
  };

  return (
    <CreateOrJoinModal
      isOpen={isOpen}
      onClose={onClose}
      isSubmitting={isSubmitting}
      noun='space'
      createDescription='Start your shared space and generate a unique invite code for your partner.'
      createContent={
        <>
          <div className='border-border bg-muted/30 rounded-md border p-3'>
            <div className='text-muted-foreground mb-1 text-xs tracking-[0.14em] uppercase'>
              Invite code
            </div>
            <div className='text-foreground text-2xl font-semibold tracking-[0.24em]'>
              {createInviteCode}
            </div>
          </div>
          {createError && <p className='text-destructive text-sm'>{createError}</p>}
          <Button onClick={handleCreate} disabled={isSubmitting} className='w-full'>
            {isSubmitting ? 'Creating...' : 'Create Space'}
          </Button>
        </>
      }
      joinDescription='Enter the code shared by your partner to request access to the space.'
      inviteCodeLength={SPACE_CODE_LENGTH}
      joinFieldName='worth-the-wait-join-code'
      onJoin={onJoinSpace}
      searchJoinCode={searchJoinCode}
      hasJoinBeenSubmitted={hasJoinBeenSubmitted}
      requestSentDescription='Your request to join the space has been sent! Please wait for the space creator to approve your request.'
    />
  );
}

export default SpaceOnboardingModal;
