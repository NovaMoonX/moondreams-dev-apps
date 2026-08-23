import { copyToClipboard } from '@/utils/clipboardUtils';
import {
  Button,
  Input,
  Modal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useMemo, useState } from 'react';
import { generateInviteCode, SPACE_CODE_LENGTH } from '../utils/generateCode';

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
  const [joinInput, setJoinInput] = useState(searchJoinCode ?? '');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreate = async () => {
    onCreateSpace(createInviteCode)
      .then((inviteCode) => {
        copyToClipboard(inviteCode).then(() => {
          addToast({
            title: 'Space Created 🎊',
            description: 'Your invite code has been copied to your keyboard',
          });
        });
      })
      .catch((error) => {
        setCreateError(error.message || 'An unexpected error occurred.');
        throw error;
      });
  };

  const handleJoin = async () => {
    onJoinSpace(joinInput.trim()).catch((error: Error) => {
      setJoinError(error.message || 'An unexpected error occurred.');
      throw error;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={hasJoinBeenSubmitted ? 'Request Sent' : 'Create or join a space'}
      hideCloseButton={false}
    >
      {hasJoinBeenSubmitted && (
        <div className='space-y-4 pt-4'>
          <p className='text-muted-foreground text-sm'>
            Your request to join the space has been sent! Please wait for the
            space creator to approve your request.
          </p>
        </div>
      )}
      {!hasJoinBeenSubmitted && (
        <Tabs
          defaultValue={searchJoinCode ? 'join' : 'create'}
          tabsWidth='full'
          variant='pills'
        >
          <TabsList>
            <TabsTrigger value='create'>Create Space</TabsTrigger>
            <TabsTrigger value='join'>Join Space</TabsTrigger>
          </TabsList>

          <TabsContent value='create' className='space-y-4 pt-4'>
            <p className='text-muted-foreground text-sm'>
              Start your shared space and generate a unique invite code for your
              partner.
            </p>
            <div className='border-border bg-muted/30 rounded-md border p-3'>
              <div className='text-muted-foreground mb-1 text-xs tracking-[0.14em] uppercase'>
                Invite code
              </div>
              <div className='text-foreground text-2xl font-semibold tracking-[0.24em]'>
                {createInviteCode}
              </div>
            </div>
            {createError && (
              <p className='text-destructive text-sm'>{createError}</p>
            )}
            <Button
              onClick={handleCreate}
              disabled={isSubmitting}
              className='w-full'
            >
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </Button>
          </TabsContent>

          <TabsContent value='join' className='space-y-4 pt-4'>
            <p className='text-muted-foreground text-sm'>
              Enter the code shared by your partner to request access to the
              space.
            </p>
            <Input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder='Enter invite code'
              aria-label='Invite code'
              name='worth-the-wait-join-code'
              autoComplete='off'
              maxLength={SPACE_CODE_LENGTH}
            />
            {joinError && (
              <p className='text-destructive text-sm'>{joinError}</p>
            )}
            <Button
              onClick={handleJoin}
              disabled={isSubmitting || !joinInput.trim()}
              className='w-full'
            >
              {isSubmitting ? 'Requesting...' : 'Request to Join'}
            </Button>
          </TabsContent>
        </Tabs>
      )}
    </Modal>
  );
}

export default SpaceOnboardingModal;
