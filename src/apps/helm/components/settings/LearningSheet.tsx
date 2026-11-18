import { Moon } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import FormSheet from '@/components/FormSheet';
import { useLearningSwitch } from '@apps/helm/components/noticed/useLearningSwitch';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface LearningSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The switch for noticing what works, with what it does and where the reading happens. */
function LearningSheet({ isOpen, onClose }: LearningSheetProps) {
  const assistant = useAssistantName();
  const { isOn, change } = useLearningSwitch();
  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.learningTitle}
    >
      <div className='space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <span className='min-w-0 font-medium text-pretty'>
            {isOn ? HELM_COPY.learningRowOn : HELM_COPY.learningRowOff}
          </span>
          <AppToggle
            aria-label={HELM_COPY.learningTitle}
            checked={isOn}
            onCheckedChange={change}
          />
        </div>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.learningDescription(assistant)}
        </p>
        <p className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
          <Moon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
          <span className='min-w-0'>{HELM_COPY.learningServerLine}</span>
        </p>
      </div>
    </FormSheet>
  );
}

export default LearningSheet;
