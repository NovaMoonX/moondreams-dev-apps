import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import { HORIZON_PLAN_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { unlinkGoalFromHorizon } from '@apps/runway/store/actions/horizonGoalActions';
import type { ResolvedHorizon } from '@apps/runway/store/selectors/runwaySelectors';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

interface HorizonUnlinkViewProps {
  goalName: string;
  event: ResolvedHorizon;
  today: number;
  onBack: () => void;
}

/** Asks before a goal stops saving for its event; the event keeps the cost the link added. */
function HorizonUnlinkView({
  goalName,
  event,
  today,
  onBack,
}: HorizonUnlinkViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const eventName = event.version.payload.name;

  const unlink = async () => {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const written = await unlinkGoalFromHorizon(user.uid, encryption, {
        eventId: event.item.id,
        baseVersionId: event.version.id,
        horizon: event.version.payload,
        goalName,
        today,
      });
      if (written === null) {
        setError(HORIZON_PLAN_WORDS.failed);
        return;
      }
      addToast({
        title: HORIZON_PLAN_WORDS.unlinked(goalName, eventName),
        type: 'success',
      });
      onBack();
    } catch (saveError) {
      setError(
        isOfflineFailure(saveError)
          ? HORIZON_PLAN_WORDS.offline
          : getErrorMessage(saveError, HORIZON_PLAN_WORDS.failed),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='flex flex-1 flex-col gap-4 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_PLAN_WORDS.unlinkTitle(eventName)}</ActionTitle>
      <p className='text-muted-foreground text-sm'>
        {HORIZON_PLAN_WORDS.unlinkBody(eventName)}
      </p>
      <ModalFooterActions
        note={error}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving}
            onClick={() => void unlink()}
          >
            {HORIZON_PLAN_WORDS.unlinkAction}
          </Button>
        }
      />
    </div>
  );
}

export default HorizonUnlinkView;
