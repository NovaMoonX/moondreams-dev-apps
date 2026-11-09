import { useState } from 'react';

import { ReceiptText, Trash2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import { HORIZON_PLAN_WORDS } from '@apps/runway/constants';
import { getGoalCostId } from '@apps/runway/engine/horizonGoal';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { unlinkGoalFromHorizon } from '@apps/runway/store/actions/horizonGoalActions';
import {
  selectCostPaid,
  type ResolvedHorizon,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isOfflineFailure } from '@apps/runway/utils/offlineText';

interface HorizonUnlinkViewProps {
  goalName: string;
  event: ResolvedHorizon;
  today: number;
  onBack: () => void;
}

/** Asks what happens to the goal's cost on the event when the goal stops saving for it; with the cost paid or already gone there is nothing to ask and the event keeps it. */
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
  const mask = useMaskedText();
  const eventName = event.version.payload.name;
  const paidEntries = useAppSelector(selectCostPaid)[event.item.id];
  const costId = getGoalCostId(event.version.payload.goalId ?? '');
  const goalCost = event.version.payload.costs.find(({ id }) => id === costId);
  const canRemoveCost =
    goalCost !== undefined &&
    !(paidEntries ?? []).some((entry) => entry.costId === costId);

  const unlink = async (removeCost: boolean) => {
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
        removeCost,
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
      <ActionTitle>{HORIZON_PLAN_WORDS.unlinkTitle(goalName, eventName)}</ActionTitle>
      <p className='text-muted-foreground text-sm'>
        {canRemoveCost
          ? HORIZON_PLAN_WORDS.unlinkBody
          : HORIZON_PLAN_WORDS.unlinkBodyKept(eventName)}
      </p>
      {canRemoveCost && (
        <ActionGroup>
          <ActionRow
            isGrouped
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={HORIZON_PLAN_WORDS.unlinkRemoveRow(goalName)}
            subtitle={mask(
              HORIZON_PLAN_WORDS.unlinkRemoveSub(
                eventName,
                formatCents(goalCost.amount.highCents),
              ),
            )}
            isDisabled={isSaving}
            onClick={() => void unlink(true)}
          />
          <ActionRow
            isGrouped
            isRoomy
            icon={<ReceiptText />}
            label={HORIZON_PLAN_WORDS.unlinkKeepRow(eventName)}
            subtitle={HORIZON_PLAN_WORDS.unlinkKeepSub(eventName)}
            isDisabled={isSaving}
            onClick={() => void unlink(false)}
          />
        </ActionGroup>
      )}
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
          canRemoveCost ? undefined : (
            <Button
              type='button'
              className='whitespace-nowrap max-sm:px-3'
              loading={isSaving}
              disabled={isSaving}
              onClick={() => void unlink(false)}
            >
              {HORIZON_PLAN_WORDS.unlinkAction}
            </Button>
          )
        }
      />
    </div>
  );
}

export default HorizonUnlinkView;
