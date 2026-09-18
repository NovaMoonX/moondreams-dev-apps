import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { FileUp } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';

import { selectIngestionDraftsByHousehold } from '../store/selectors';
import DocumentIngestionModal from './DocumentIngestionModal';

interface DashboardQuickActionsProps {
  householdId: string;
}

function DashboardQuickActions({ householdId }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const pendingDraftCount = useAppSelector(selectIngestionDraftsByHousehold(householdId)).length;

  if (!user?.uid) {
    return null;
  }

  return (
    <div className='flex justify-center'>
      <Button type='button' variant='outline' size='sm' className='gap-1' onClick={() => setIsOpen(true)}>
        <FileUp className='h-4 w-4' /> Upload document
        {pendingDraftCount > 0 && (
          <Badge variant='primary' size='xs' aspect='square' use='status'>
            {pendingDraftCount}
          </Badge>
        )}
      </Button>
      <DocumentIngestionModal
        isOpen={isOpen}
        householdId={householdId}
        uid={user.uid}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}

export default DashboardQuickActions;
