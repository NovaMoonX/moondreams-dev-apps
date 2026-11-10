import FormSheet from '@/components/FormSheet';
import SegmentedControl from '@/components/SegmentedControl';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { setWhoTier } from '@apps/helm/store/actions/whoActions';
import type { OpenWho, WhoTier } from '@apps/helm/types';

interface WhoTierSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
}

const TIER_OPTIONS = [
  { value: 'close', label: HELM_COPY.tierClose },
  { value: 'regular', label: HELM_COPY.tierRegular },
  { value: 'passing', label: HELM_COPY.tierPassing },
] as const;

/** How close someone is: Close, Regular or Passing. A level chosen here is the person's, and the assistant leaves it. */
function WhoTierSheet({ isOpen, onClose, who }: WhoTierSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();

  const choose = (tier: WhoTier) => {
    if (!user) return;
    setWhoTier(user.uid, who.id, tier).catch((error: unknown) => {
      console.error('Helm closeness was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    });
    onClose();
  };

  return (
    <FormSheet isOpen={isOpen} onClose={onClose} title={HELM_COPY.whoTierTitle}>
      <div className='space-y-3'>
        <SegmentedControl
          label={HELM_COPY.whoTierTitle}
          options={TIER_OPTIONS}
          value={who.tier}
          onChange={choose}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.whoTierHelp(assistant)}
        </p>
      </div>
    </FormSheet>
  );
}

export default WhoTierSheet;
