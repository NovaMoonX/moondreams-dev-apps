import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { useAppSelector } from '@/store';
import ModalFooterActions from '@/components/ModalFooterActions';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ChangeReason from '@apps/runway/components/ChangeReason';
import ChangeSteps from '@apps/runway/components/ChangeSteps';
import CoversLine from '@apps/runway/components/CoversLine';
import EffectPreview from '@apps/runway/components/EffectPreview';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { CHANGE_WORDS, HORIZON_WORDS } from '@apps/runway/constants';
import { useChangeFlow } from '@apps/runway/forms/useChangeFlow';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectCostPaid,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonSealed } from '@apps/runway/types';
import { getCoversText } from '@apps/runway/utils/coversText';
import { getHorizonStatus } from '@apps/runway/utils/horizonText';

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
  /** Starter chips on the reason step. */
  reasonChips: readonly string[];
  /** The reason step's save button once a reason is typed. */
  saveLabel?: string;
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
  reasonChips,
  saveLabel,
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
  const mask = useMaskedText();
  const stance = useAppSelector(selectStance);
  const balances = useAppSelector(selectBalances);
  const assignedCents = balances.assignedByItem[itemId] ?? 0;
  const paid = useAppSelector(selectCostPaid)[itemId];
  const shownBlocker = flow.getBlocker(blocker);
  const readSide = (payload: HorizonSealed) => {
    const { plan, figures } = getHorizonStatus(
      payload,
      assignedCents,
      flow.today,
      stance,
      paid,
      balances.costPaidByItem[itemId] ?? 0,
      balances.costFromFreeByItem[itemId] ?? 0,
    );
    const { shortfall } = plan;
    const text = shortfall
      ? HORIZON_WORDS.shortTitle(
          formatCents(shortfall.shortCents),
          formatDateOrdinalUTC(shortfall.dueOn),
          shortfall.totalShortCents > shortfall.shortCents
            ? formatCents(shortfall.totalShortCents - shortfall.shortCents)
            : null,
        )
      : getCoversText(plan, payload.costs, figures.leftCents, stance);
    return {
      plan,
      payload,
      isShort: shortfall !== null,
      heldCents: figures.leftCents,
      text,
    };
  };
  const before = readSide(current);
  const after = candidate === null ? before : readSide(candidate);
  const coversLead =
    candidate !== null &&
    before.text !== after.text &&
    before.text !== null &&
    after.text !== null ? (
      <div className='space-y-2'>
        {[
          { label: HORIZON_WORDS.effectBefore, side: before },
          { label: HORIZON_WORDS.effectAfter, side: after },
        ].map(({ label, side }) => (
          <div key={label} className='space-y-0.5'>
            <p className='text-muted-foreground text-xs'>{label}</p>
            {side.isShort ? (
              <p className='text-sm break-words'>
                <MaskedText>{side.text ?? ''}</MaskedText>
              </p>
            ) : (
              <CoversLine
                plan={side.plan}
                costs={side.payload.costs}
                heldCents={side.heldCents}
                stance={stance}
              />
            )}
          </div>
        ))}
      </div>
    ) : null;
  const summaryLine =
    candidate !== null && !flow.isUnchanged ? (
      <p className='text-muted-foreground text-sm break-words'>
        <MaskedText>{flow.summaryText}</MaskedText>
      </p>
    ) : null;

  return (
    <ChangeSteps
      isReason={flow.step === 'reason'}
      reason={
        <ChangeReason
          flow={flow}
          onClose={onBack}
          chips={reasonChips}
          saveLabel={saveLabel}
        />
      }
    >
      <div className='flex flex-col gap-4 max-sm:min-h-[calc(92dvh-7rem)] [&_.form-footer]:mt-auto'>
        <BackLink label={backLabel} onBack={onBack} />
        <ActionTitle>{title}</ActionTitle>
        {children}
        {flow.isMoneyless && summaryLine}
        {candidate !== null && !flow.isUnchanged && !flow.isMoneyless && (
          <div ref={setWarningBox}>
            <EffectPreview
              changeJson={flow.changeJson}
              holds={flow.holds}
              lead={
                <>
                  {summaryLine}
                  {coversLead}
                </>
              }
            />
          </div>
        )}
        <ModalFooterActions
          note={
            mask(flow.error ?? shownBlocker ?? flow.warningHint ?? '') || null
          }
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
