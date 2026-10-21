import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import MethodPicker from '@/components/MethodPicker';
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
  /** Opens the idea a pasted link already belongs to; without it the sheet only says so. */
  onOpenExisting?: (id: string) => void;
  /** Says what was saved in a toast, for a sheet opened away from the Ideas list, where the new row isn't in view. */
  confirmsWithToast?: boolean;
}

function IdeaAddSheet({
  uid,
  onClose,
  onOpenExisting,
  confirmsWithToast = false,
}: IdeaAddSheetProps) {
  const { addToast } = useToast();
  const [stage, setStage] = useState<Stage>('pick');
  const handleSaved = (title: string) => {
    if (confirmsWithToast) {
      addToast({
        title: `Saved ${title} to your ideas`,
        description: navigator.onLine
          ? undefined
          : "It's on this phone and saves when you're back online.",
        type: 'success',
      });
    }
    onClose();
  };

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
          <BackLink onBack={() => setStage('pick')} />
          {stage === 'link' && (
            <IdeaLinkWay
              uid={uid}
              onClose={onClose}
              onSaved={handleSaved}
              onOpenExisting={onOpenExisting}
            />
          )}
          {stage === 'photo' && (
            <IdeaPhotoWay uid={uid} onClose={onClose} onSaved={handleSaved} />
          )}
          {stage === 'text' && (
            <IdeaTextWay uid={uid} onClose={onClose} onSaved={handleSaved} />
          )}
        </div>
      )}
    </FormSheet>
  );
}

export default IdeaAddSheet;
