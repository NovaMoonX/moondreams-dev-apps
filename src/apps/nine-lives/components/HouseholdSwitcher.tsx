import { useMemo, useState } from 'react';

import { Button, Label, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { copyToClipboard } from '@/utils/clipboardUtils';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';

import HouseholdMembersRow from './HouseholdMembersRow';
import HouseholdPendingRequests from './HouseholdPendingRequests';
import HouseholdSetupModal from './HouseholdSetupModal';
import { createHousehold } from '../store/actions/householdsActions';
import { requestToJoinHousehold } from '../store/actions/pendingRequestsActions';
import type { Household } from '../types';

interface HouseholdSwitcherProps {
  households: Household[];
  selectedHousehold: Household | null;
  onSelectHousehold: (householdId: string | null) => void;
  onHouseholdCreated: (householdId: string) => void;
}

function HouseholdSwitcher({
  households,
  selectedHousehold,
  onSelectHousehold,
  onHouseholdCreated,
}: HouseholdSwitcherProps) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const householdOptions = useMemo(
    () =>
      households.map((household) => ({
        text: household.name,
        value: household.id,
      })),
    [households],
  );

  const defaultHouseholdName = useMemo(
    () =>
      user?.displayName ? `${user.displayName}'s household` : 'My household',
    [user],
  );

  const handleCreateHousehold = async (name: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdHousehold = await dispatch(
        createHousehold({ uid: user.uid, name }),
      ).unwrap();
      onHouseholdCreated(createdHousehold.id);
      setShowHouseholdModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinHousehold = async (inviteCode: string) => {
    if (!user?.uid) {
      return;
    }

    setIsSubmitting(true);

    try {
      await dispatch(
        requestToJoinHousehold({ uid: user.uid, inviteCode }),
      ).unwrap();
      setShowHouseholdModal(false);
      addToast({
        title: 'Join request sent',
        description: 'The household has been notified and is waiting for approval.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!selectedHousehold?.inviteCode) {
      return;
    }

    await copyToClipboard(selectedHousehold.inviteCode);
    addToast({
      title: 'Invite code copied',
      description: 'Share this code with someone who needs to join the household.',
    });
  };

  return (
    <>
      <header className='border-border bg-card flex flex-col gap-4 rounded-lg border p-6'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div className='space-y-3'>
            <div>
              <p className='text-muted-foreground text-sm tracking-[0.2em] uppercase'>
                Nine Lives
              </p>
              <h1 className='mt-2 text-3xl font-semibold'>
                {selectedHousehold?.name}
              </h1>
            </div>

            <div className='flex flex-wrap items-center gap-3'>
              <HouseholdMembersRow memberIds={selectedHousehold?.members ?? []} />
              {selectedHousehold?.inviteCode && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={handleCopyInviteCode}
                >
                  Invite
                </Button>
              )}
            </div>

            {selectedHousehold?.inviteCode && (
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span className='text-muted-foreground'>Invite code</span>
                <code className='border-border bg-muted rounded border px-2 py-1 font-mono tracking-[0.2em]'>
                  {selectedHousehold.inviteCode}
                </code>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground underline underline-offset-4'
                  onClick={handleCopyInviteCode}
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          <div className='flex flex-col gap-2 items-center sm:items-end'>
            <Label className='text-muted-foreground'>Household</Label>
            <div className='flex flex-col items-center sm:items-end gap-3'>
              <div className='flex-1 max-w-full'>
                <Select
                  options={householdOptions}
                  value={selectedHousehold?.id ?? ''}
                  onChange={(value) => onSelectHousehold(value || null)}
                  placeholder='Select a household'
                  searchable={householdOptions.length > 5}
                />
              </div>
              <Button
                type='button'
                variant='link'
                className='text-sm text-muted-foreground hover:text-foreground'
                onClick={() => setShowHouseholdModal(true)}
              >
                Add household
              </Button>
            </div>
          </div>
        </div>
      </header>

      {selectedHousehold && (
        <HouseholdPendingRequests householdId={selectedHousehold.id} />
      )}

      <HouseholdSetupModal
        key={`add-household-${user?.uid ?? 'anon'}`}
        isOpen={showHouseholdModal}
        defaultName={defaultHouseholdName}
        isSubmitting={isSubmitting}
        onCreate={handleCreateHousehold}
        onJoin={handleJoinHousehold}
        onClose={() => setShowHouseholdModal(false)}
      />
    </>
  );
}

export default HouseholdSwitcher;
