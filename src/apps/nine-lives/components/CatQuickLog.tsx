import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import { CAT_LOG_OPTIONS, type CatLogKind } from '../constants/catLog';
import type { Cat } from '../types';
import QuickAddConditionModal from './QuickAddConditionModal';
import QuickAddPreventiveModal from './QuickAddPreventiveModal';
import QuickAddSymptomModal from './QuickAddSymptomModal';
import QuickAddVaccinationModal from './QuickAddVaccinationModal';
import QuickAddWeightEntryModal from './QuickAddWeightEntryModal';

interface CatLogModalsProps {
  householdId: string;
  cats: Cat[];
  activeLog: CatLogKind | null;
  onClose: () => void;
}

export function CatLogModals({ householdId, cats, activeLog, onClose }: CatLogModalsProps) {
  const shared = { householdId, cats, onClose };

  return (
    <>
      <QuickAddVaccinationModal isOpen={activeLog === 'vaccination'} {...shared} />
      <QuickAddPreventiveModal isOpen={activeLog === 'preventive'} {...shared} />
      <QuickAddWeightEntryModal isOpen={activeLog === 'weight'} {...shared} />
      <QuickAddConditionModal isOpen={activeLog === 'condition'} {...shared} />
      <QuickAddSymptomModal isOpen={activeLog === 'symptom'} {...shared} />
    </>
  );
}

interface CatQuickLogProps {
  householdId: string;
  cats: Cat[];
  isMenuOpen: boolean;
  onMenuClose: () => void;
}

function CatQuickLog({ householdId, cats, isMenuOpen, onMenuClose }: CatQuickLogProps) {
  const [activeLog, setActiveLog] = useState<CatLogKind | null>(null);

  return (
    <>
      <Modal isOpen={isMenuOpen} onClose={onMenuClose} title='Log for a cat'>
        <div className='divide-border divide-y'>
          {CAT_LOG_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <Button
              key={value}
              type='button'
              variant='tertiary'
              className='h-auto w-full justify-start gap-3 rounded-none px-1 py-3 text-left'
              onClick={() => {
                onMenuClose();
                setActiveLog(value);
              }}
            >
              <span className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                <Icon className='h-4 w-4' />
              </span>
              <span className='min-w-0'>
                <span className='block font-medium'>{label}</span>
                <span className='text-muted-foreground block text-sm font-normal'>{hint}</span>
              </span>
            </Button>
          ))}
        </div>
      </Modal>
      <CatLogModals householdId={householdId} cats={cats} activeLog={activeLog} onClose={() => setActiveLog(null)} />
    </>
  );
}

export default CatQuickLog;
