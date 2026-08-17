import {
  Button,
  Input,
  Modal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useMemo, useState } from 'react';
import { generateInviteCode, SPACE_CODE_LENGTH } from '../utils/generateCode';

type SpaceOnboardingModalProps = {
  isOpen: boolean;
  isSubmitting?: boolean;
  onCreateSpace: (inviteCode: string) => Promise<unknown> | unknown;
  onJoinSpace: (inviteCode: string) => Promise<unknown> | unknown;
};

function SpaceOnboardingModal({
  isOpen,
  isSubmitting = false,
  onCreateSpace,
  onJoinSpace,
}: SpaceOnboardingModalProps) {
  const createInviteCode = useMemo(() => generateInviteCode(), []);
  const [joinInput, setJoinInput] = useState('');

  const handleCreate = async () => {
    await onCreateSpace(createInviteCode);
  };

  const handleJoin = async () => {
    await onJoinSpace(joinInput.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => undefined}
      title='Create or join a space'
      hideCloseButton={true}
    >
      <Tabs defaultValue='create' tabsWidth='full' variant='pills'>
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
          <Button
            onClick={handleJoin}
            disabled={isSubmitting || !joinInput.trim()}
            className='w-full'
          >
            {isSubmitting ? 'Requesting...' : 'Request to Join'}
          </Button>
        </TabsContent>
      </Tabs>
    </Modal>
  );
}

export default SpaceOnboardingModal;
