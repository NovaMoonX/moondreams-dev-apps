import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setResearchDepth } from '@apps/helm/store/actions/settingsActions';
import { readResearchResetOn } from '@apps/helm/engine/research';
import { readThoroughLeft } from '@apps/helm/utils/researchWords';

interface ResearchDepthSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type DepthChoice = 'ask' | 'light' | 'thorough';

const OPTIONS: PillOption<DepthChoice>[] = [
  { value: 'ask', label: HELM_COPY.researchSettingsAsk },
  { value: 'light', label: HELM_COPY.researchDepthAlwaysQuick },
  { value: 'thorough', label: HELM_COPY.researchDepthAlwaysThorough },
];

/** How deep to look by default: Ask me when it matters, a quick look or a thorough one, with what is left of the month's allowance. */
function ResearchDepthSheet({ isOpen, onClose }: ResearchDepthSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const profile = useAppSelector((state) => state.helm.profile);
  const choice: DepthChoice = profile?.researchDepth ?? 'ask';

  const change = (next: DepthChoice) => {
    if (!user || next === choice) return;
    setResearchDepth(user.uid, next === 'ask' ? null : next).catch(
      (error: unknown) => {
        console.error('Helm research depth was not saved', error);
        addToast({ title: HELM_COPY.researchSettingsFailed, type: 'error' });
      },
    );
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.researchSettingsTitle}
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.researchSettingsIntro(assistant)}
        </p>
        <PillGroup
          label={HELM_COPY.researchSettingsDefault}
          options={OPTIONS}
          value={choice}
          onChange={change}
          wrapsNarrow
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.researchThoroughLeft(
            readThoroughLeft(
              profile?.researchAllowance ?? null,
              now,
              profile?.timeZone ?? 'UTC',
            ),
            formatDateUTC(readResearchResetOn(now, profile?.timeZone ?? 'UTC')),
          )}
        </p>
      </div>
    </FormSheet>
  );
}

export default ResearchDepthSheet;
