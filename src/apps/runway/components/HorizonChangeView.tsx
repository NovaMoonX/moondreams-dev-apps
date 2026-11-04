import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ChangeReason from '@apps/runway/components/ChangeReason';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import type { HorizonSealed } from '@apps/runway/types';

interface HorizonChangeViewProps {
  itemId: string;
  /** Where the back chip goes ("Moving", "Movers"). */
  backLabel: string;
  title: string;
  /** The event as it stands; the change is a whole new payload from today. */
  current: HorizonSealed;
  /** What the fields build now; null while they are not finished. */
  candidate: HorizonSealed | null;
  /** Why the fields are not finished, said in the footer. */
  blocker: string | null;
  onBack: () => void;
  onDone: () => void;
  children?: ReactNode;
}

/** An event edit in its sheet: the fields, then what the change does to the pays, then why. Always from today; the first step an edit of a cost or of the event itself shares. */
function HorizonChangeView({
  itemId,
  backLabel,
  title,
  current,
  candidate,
  blocker,
  onBack,
  onDone,
  children,
}: HorizonChangeViewProps) {
  const flow = useChangeFlow({
    itemId,
    kind: 'horizon',
    current,
    candidate,
    onDone,
  });
  const { setWarningBox } = flow;
  const shownBlocker = flow.getBlocker(blocker);

  return (
    <ChangeSteps
      isReason={flow.step === 'reason'}
      reason={<ChangeReason flow={flow} onClose={onBack} />}
    >
      <div className='space-y-4'>
        <BackLink label={backLabel} onBack={onBack} />
        <ActionTitle>{title}</ActionTitle>
        {children}
        {candidate !== null && !flow.isUnchanged && (
          <p className='text-muted-foreground text-sm break-words'>
            <MaskedText>{flow.summaryText}</MaskedText>
          </p>
        )}
        {candidate !== null && !flow.isUnchanged && !flow.isMoneyless && (
          <div ref={setWarningBox}>
            <EffectPreview changeJson={flow.changeJson} holds={flow.holds} />
          </div>
        )}
        <ModalFooterActions
          note={flow.error ?? shownBlocker ?? flow.warningHint}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={onBack}
              disabled={flow.isSaving}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={flow.isSaving}
              disabled={flow.isSaving || shownBlocker !== null}
              onClick={() => {
                if (flow.isMoneyless) void flow.save(null);
                else flow.setStep('reason');
              }}
            >
              {flow.isMoneyless ? 'Save' : CHANGE_WORDS.review}
            </Button>
          }
        />
      </div>
    </ChangeSteps>
  );
}

export default HorizonChangeView;
