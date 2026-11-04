import { useDeferredValue, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ClearOfFooter from '@/components/ClearOfFooter';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  HORIZON_WORDS,
  MAX_PURCHASE_CENTS,
  PAY_SHARE_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getCostShareKey } from '@apps/runway/engine/parts';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { saveBillShare } from '@apps/runway/store/actions/dayActions';
import type { PreviewChange } from '@apps/runway/store/selectors/previewSelectors';
import { selectComingDays } from '@apps/runway/store/selectors/runwaySelectors';

interface CostShareViewProps {
  itemId: string;
  costId: string;
  costName: string;
  itemName: string;
  dayKey: string;
  /** What this pay puts toward the cost now. */
  currentCents: number;
  /** The most the cost still needs. */
  maxCents: number;
  onBack: () => void;
  onClose: () => void;
}

/** The view a cost line's sheet swaps in: what this one pay puts toward a cost, and what that moves on the other pays. */
function CostShareView({
  itemId,
  costId,
  costName,
  itemName,
  dayKey,
  currentCents,
  maxCents,
  onBack,
  onClose,
}: CostShareViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const today = todayAsUtcDate();
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const day = comingDays.find((entry) => entry.dayKey === dayKey) ?? null;
  const previous = useAppSelector(
    (state) =>
      state.runway.days.find((entry) => entry.id === dayKey)?.override
        .billCents?.[getCostShareKey(itemId, costId)],
  );
  const [amount, setAmount] = useState(() =>
    isHidden ? '' : centsToInputValue(currentCents),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseMoneyToCents(amount);
  const target =
    parsed !== null && parsed >= 0 && parsed <= MAX_PURCHASE_CENTS
      ? Math.min(parsed, maxCents)
      : null;
  const settledTarget = useDeferredValue(target);
  const key = getCostShareKey(itemId, costId);
  const isChanged = target !== null && target !== currentCents;
  const changeJson =
    day !== null && settledTarget !== null && settledTarget !== currentCents
      ? JSON.stringify({
          kind: 'dayBill',
          day: {
            dayKey: day.dayKey,
            payLineId: day.payLineId,
            sourceId: day.sourceId,
            on: day.on,
          },
          billId: key,
          cents: settledTarget,
        } satisfies PreviewChange)
      : null;
  const getBlocker = () => {
    if (target === null) return PAY_SHARE_WORDS.needsAmount;
    return isChanged ? null : PAY_SHARE_WORDS.unchanged;
  };
  const blocker = getBlocker();

  const save = async () => {
    if (!user || target === null || blocker !== null || isSaving) return;
    if (!day) {
      setError(HORIZON_WORDS.payMoved);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const dayRef = {
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
      };
      const date = formatDateOrdinalUTC(day.on);
      await saveBillShare(user.uid, encryption, dayRef, key, target, {
        itemId,
        summary: HORIZON_WORDS.costShareSummary(
          costName,
          itemName,
          formatCents(target),
          date,
        ),
        note: null,
      });
      addToast({
        title: HORIZON_WORDS.costShareToast(costName),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () =>
            void saveBillShare(
              user.uid,
              encryption,
              dayRef,
              key,
              previous ?? null,
              {
                itemId,
                summary:
                  previous === undefined
                    ? HORIZON_WORDS.costShareResetSummary(
                        costName,
                        itemName,
                        date,
                      )
                    : HORIZON_WORDS.costShareSummary(
                        costName,
                        itemName,
                        formatCents(previous),
                        date,
                      ),
                note: null,
              },
              { was: target },
            ).catch((undoError: unknown) =>
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, PAY_SHARE_WORDS.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const isCapped = !isHidden && parsed !== null && parsed > maxCents;

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{HORIZON_WORDS.costShareTitle(costName)}</ActionTitle>
      <ClearOfFooter>
        <AmountHero
          label={PAY_SHARE_WORDS.amount}
          value={amount}
          onChange={setAmount}
          disabled={isSaving}
          hint={
            isCapped ? (
              <MaskedText>
                {HORIZON_WORDS.costShareCapped(costName, formatCents(maxCents))}
              </MaskedText>
            ) : undefined
          }
        />
      </ClearOfFooter>
      <EffectPreview changeJson={changeJson} />
      <ModalFooterActions
        note={error ?? blocker}
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
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void save()}
          >
            {PAY_SHARE_WORDS.save}
          </Button>
        }
      />
    </div>
  );
}

export default CostShareView;
