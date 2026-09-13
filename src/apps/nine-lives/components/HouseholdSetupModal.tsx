import {
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import AppSetupModal from '@/ui/AppSetupModal';

interface HouseholdSetupModalProps {
  isOpen: boolean;
  defaultName: string;
  isSubmitting?: boolean;
  onCreate: (name: string) => Promise<void> | void;
  onJoin: (inviteCode: string) => Promise<void> | void;
  onClose?: () => void;
}

function HouseholdSetupModal({
  isOpen,
  defaultName,
  isSubmitting = false,
  onCreate,
  onJoin,
  onClose,
}: HouseholdSetupModalProps) {
  const [name, setName] = useState(defaultName);
  const [inviteCode, setInviteCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setCreateError('Household name is required.');
      return;
    }

    setCreateError(null);

    try {
      await onCreate(trimmedName);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Unable to create your household.',
      );
    }
  };

  const handleJoin = async () => {
    const trimmedCode = inviteCode.trim();

    if (!trimmedCode) {
      setJoinError('Enter a valid invite code.');
      return;
    }

    setJoinError(null);

    try {
      await onJoin(trimmedCode);
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : 'Unable to request this invite.',
      );
    }
  };

  return (
    <AppSetupModal
      isOpen={isOpen}
      onClose={onClose}
      title='Create or join a household'
      hideCloseButton={false}
    >
      <Tabs defaultValue='create' tabsWidth='full' variant='pills'>
        <TabsList>
          <TabsTrigger value='create'>Create</TabsTrigger>
          <TabsTrigger value='join'>Join</TabsTrigger>
        </TabsList>

        <TabsContent value='create' className='space-y-4 pt-4'>
          <p className='text-muted-foreground text-sm'>
            Start a household for your cats, vets, and care records.
          </p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Luna's household"
            aria-label='Household name'
            name='nine-lives-household-name'
          />
          {createError && <p className='text-destructive text-sm'>{createError}</p>}
          <Button
            onClick={handleCreate}
            disabled={isSubmitting || !name.trim()}
            className='w-full'
          >
            {isSubmitting ? 'Creating…' : 'Create household'}
          </Button>
        </TabsContent>

        <TabsContent value='join' className='space-y-4 pt-4'>
          <p className='text-muted-foreground text-sm'>
            Enter the code shared by someone already in the household.
          </p>
          <Input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder='Enter invite code'
            aria-label='Invite code'
            name='nine-lives-household-invite-code'
            autoComplete='off'
            maxLength={6}
          />
          {joinError && <p className='text-destructive text-sm'>{joinError}</p>}
          <Button
            onClick={handleJoin}
            disabled={isSubmitting || !inviteCode.trim()}
            className='w-full'
          >
            {isSubmitting ? 'Requesting…' : 'Request to join'}
          </Button>
        </TabsContent>
      </Tabs>
    </AppSetupModal>
  );
}

export default HouseholdSetupModal;
