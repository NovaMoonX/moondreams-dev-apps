import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronLeft } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import MethodPicker from '@/components/MethodPicker';
import { useBackStep } from '@/hooks/useBackHistory';
import {
  IdeaLinkWay,
  IdeaPhotoWay,
  IdeaTextWay,
} from '@apps/pinch/components/ideas/IdeaWays';
import { IDEA_START_METHODS } from '@apps/pinch/constants';
import type { IdeaStartMethod } from '@apps/pinch/types';

type Stage = 'pick' | IdeaStartMethod;

interface IdeaAddSheetProps {
  uid: string;
  onClose: () => void;
  onOpenExisting: (id: string) => void;
}

function IdeaAddSheet({ uid, onClose, onOpenExisting }: IdeaAddSheetProps) {
  const [stage, setStage] = useState<Stage>('pick');
  useBackStep(stage !== 'pick', () => setStage('pick'));

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={stage === 'pick' ? 'New idea' : 'Idea'}
    >
      {stage === 'pick' ? (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Keep it now, and turn it into a recipe when you're ready.
          </p>
          <MethodPicker
            methods={IDEA_START_METHODS.map((method) => ({
              ...method,
              isQuiet: method.id === 'text',
              onPick: () => setStage(method.id),
            }))}
          />
        </div>
      ) : (
        <div className='space-y-3'>
          <Button
            type='button'
            variant='tertiary'
            className='h-10 gap-1 px-0!'
            onClick={() => setStage('pick')}
          >
            <ChevronLeft className='h-4 w-4' aria-hidden='true' />
            Back
          </Button>
          {stage === 'link' && (
            <IdeaLinkWay
              uid={uid}
              onClose={onClose}
              onOpenExisting={onOpenExisting}
            />
          )}
          {stage === 'photo' && <IdeaPhotoWay uid={uid} onClose={onClose} />}
          {stage === 'text' && <IdeaTextWay uid={uid} onClose={onClose} />}
        </div>
      )}
    </FormSheet>
  );
}

export default IdeaAddSheet;
