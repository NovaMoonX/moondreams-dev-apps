import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { FileUp } from 'lucide-react';

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
    <div className='flex justify-center'>
      <Button type='button' variant='outline' size='sm' className='gap-1' onClick={() => setIsOpen(true)}>
        <FileUp className='h-4 w-4' /> Upload document
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
