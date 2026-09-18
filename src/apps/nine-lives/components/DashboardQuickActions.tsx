import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';

import DocumentIngestionModal from './DocumentIngestionModal';

interface DashboardQuickActionsProps {
  householdId: string;
}

function DashboardQuickActions({ householdId }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user?.uid) {
    return null;
  }

  return (
    <>
      <Button type='button' variant='outline' size='sm' onClick={() => setIsOpen(true)}>
        Upload document
      </Button>
      <DocumentIngestionModal
        isOpen={isOpen}
        householdId={householdId}
        uid={user.uid}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default DashboardQuickActions;
