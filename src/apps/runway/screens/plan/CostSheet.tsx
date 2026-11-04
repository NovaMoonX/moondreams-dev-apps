import { useState } from 'react';
import { Pencil, Tag, Trash2 } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import AmountField from '@/components/AmountField';
import BackLink from '@/components/BackLink';
import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import { MaskedText } from '@apps/runway/components/MaskedText';
import RangeNote from '@apps/runway/components/RangeNote';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  FORM_FLOW_WORDS,
  HORIZON_PRICE_REASON_CHIPS,
  HORIZON_WORDS,
  PAY_SHARE_WORDS,
} from '@apps/runway/constants';
import {
  getLiveCosts,
  removeCost,
  restoreCost,
  setCostPrice,
} from '@apps/runway/engine/horizon';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import { selectHorizonItems } from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';
import {
  describeCost,
  describeCostInSentence,
  describeCostTiming,
} from '@apps/runway/utils/horizonText';
import {
  EMPTY_AMOUNT_DRAFT,
  getAmountDraftProblem,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import { formatRange } from '@apps/runway/utils/rangeText';

type PriceWay = 'exact' | 'range';

const PRICE_WAYS = [
  {
    value: 'exact' as const,
    title: HORIZON_WORDS.priceExactTitle,
    body: HORIZON_WORDS.priceExactBody,
  },
  {
    value: 'range' as const,
    title: HORIZON_WORDS.priceRangeTitle,
    body: HORIZON_WORDS.priceRangeBody,
  },
];

interface PriceViewProps {
  itemId: string;
  horizon: HorizonSealed;
  cost: HorizonCost;
  today: number;
  onBack: () => void;
}

/** Say what the cost really is: an exact amount or a range, from today. The way is asked first, with nothing chosen for the person. */
function PriceView({ itemId, horizon, cost, today, onBack }: PriceViewProps) {
  const [way, setWay] = useState<PriceWay | null>(null);
  const [draft, setDraft] = useState<AmountDraft>(EMPTY_AMOUNT_DRAFT);
  const range = way === null ? null : parseAmountDraft(draft);
  const isSame =
    range !== null &&
    range.lowCents === cost.amount.lowCents &&
    range.highCents === cost.amount.highCents;
  const getBlocker = () => {
    if (way === null) return HORIZON_WORDS.pickPriceWay;
    if (range === null) {
      return getAmountDraftProblem(draft) ?? FORM_FLOW_WORDS.badAmount;
    }
    return isSame ? HORIZON_WORDS.samePrice : null;
  };
  const pickWay = (next: PriceWay) => {
    setWay(next);
    setDraft(
      next === 'exact'
        ? EMPTY_AMOUNT_DRAFT
        : { ...toAmountDraft(cost.amount, null), mode: 'range' },
    );
  };

  return (
    <HorizonChangeView
      itemId={itemId}
      backLabel={cost.name}
      title={HORIZON_WORDS.setPriceTitle(cost.name)}
      current={horizon}
      candidate={
        range === null || isSame
          ? null
          : setCostPrice(horizon, cost.id, range, today)
      }
      blocker={getBlocker()}
      reasonChips={HORIZON_PRICE_REASON_CHIPS}
      saveLabel={HORIZON_WORDS.setPriceSave}
      onBack={onBack}
      onDone={onBack}
    >
      <ChoiceCards options={PRICE_WAYS} value={way} onChange={pickWay} />
      {way !== null && (
        <AmountField
          key={way}
          isHero
          autoFocus
          label={HORIZON_WORDS.costAmount}
          mode={draft.mode}
          value={draft.low}
          onChange={(low) => setDraft({ ...draft, low })}
          highValue={draft.high}
          onHighChange={(high) => setDraft({ ...draft, high })}
          hint={
            way === 'exact' && (
              <MaskedText>
                {HORIZON_WORDS.priceHint(formatRange(cost.amount))}
              </MaskedText>
            )
          }
        />
      )}
    </HorizonChangeView>
  );
}

interface CostSheetProps {
  itemId: string;
  horizon: HorizonSealed;
  cost: HorizonCost;
  today: number;
  stance: Stance;
  /** Back to the event's sheet. */
  onBack: () => void;
  /** Opens the cost's Change form, which replaces the event's sheet. */
  onChange: () => void;
}

/** One cost of an event, swapped into the event's sheet: set its price, change it, or remove it. */
function CostSheet({
  itemId,
  horizon,
  cost,
  today,
  stance,
  onBack,
  onChange,
}: CostSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const [view, setView] = useState<'menu' | 'price'>('menu');
  const [isRemoving, setIsRemoving] = useState(false);

  const isExact = cost.amount.lowCents === cost.amount.highCents;
  const isLive = cost.endsAfter === null;
  const isRemovable = isLive && getLiveCosts(horizon).length > 1;
  const isRepeat = cost.schedule.kind !== 'once';
  const when = isRepeat
    ? describeCostTiming(cost.schedule, cost.ending)
    : HORIZON_WORDS.costDue(
        formatDateOrdinalUTC(cost.schedule.anchor ?? today),
      );

  if (view === 'price') {
    return (
      <PriceView
        itemId={itemId}
        horizon={horizon}
        cost={cost}
        today={today}
        onBack={() => setView('menu')}
      />
    );
  }

  const getLive = () =>
    selectHorizonItems(store.getState(), today).find(
      ({ item }) => item.id === itemId,
    )?.version.payload ?? null;

  const write = async (payload: HorizonSealed, summary: string) => {
    if (!user) return;
    const encryption = await getRunwayEncryption(user.uid);
    await changeItem(user.uid, encryption, {
      itemId,
      kind: 'horizon',
      payload,
      summary,
      note: null,
      effectiveFrom: today,
    });
  };

  const remove = async () => {
    if (!user || isRemoving) return;
    const isConfirmed = await confirm({
      title: HORIZON_WORDS.removeConfirmTitle(cost.name),
      message: mask(
        HORIZON_WORDS.removeConfirmText(
          cost.name,
          describeCostInSentence(cost),
          horizon.name,
        ),
      ),
      confirmText: HORIZON_WORDS.removeConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    const live = getLive();
    const index = live?.costs.findIndex(({ id }) => id === cost.id) ?? -1;
    const gone = live?.costs[index];
    // No payment can be marked paid yet, so a removal is always a version without the cost.
    const next = live && gone ? removeCost(live, cost.id, today, false) : null;
    if (!next || !gone) {
      addToast({ title: HORIZON_WORDS.removeGone, type: 'error' });
      return;
    }
    const from = formatDateOrdinalUTC(today);
    const timing = describeCostInSentence(gone);
    setIsRemoving(true);
    try {
      await write(
        next,
        HORIZON_WORDS.removeSummary(next.name, gone.name, timing, from),
      );
      addToast({
        title: HORIZON_WORDS.removedToast(gone.name),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () => {
            const now = getLive();
            const back = now ? restoreCost(now, gone, index) : null;
            if (!now || !back) {
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: HORIZON_WORDS.restoreGone,
                type: 'error',
              });
              return;
            }
            void write(
              back,
              HORIZON_WORDS.restoreSummary(now.name, gone.name, timing, from),
            ).catch((undoError: unknown) =>
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(
                  undoError,
                  HORIZON_WORDS.restoreFailed,
                ),
                type: 'error',
              }),
            );
          },
        },
      });
      onBack();
    } catch (removeError) {
      addToast({
        title: HORIZON_WORDS.removeFailed,
        description: getErrorMessage(removeError, ''),
        type: 'error',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className='space-y-4'>
      <BackLink label={horizon.name} onBack={onBack} />
      <SheetHead
        label={cost.name}
        figure={formatRange(cost.amount)}
        suffix={describeCost(cost).per || undefined}
        fact={HORIZON_WORDS.costFact(
          when,
          cost.pricedOn === null ? null : formatDateOrdinalUTC(cost.pricedOn),
        )}
      />
      <RangeNote isShort range={cost.amount} stance={stance} side='expense' />
      <ActionGroup isRoomy>
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Tag />}
          label={HORIZON_WORDS.setPrice}
          subtitle={
            isExact
              ? mask(
                  HORIZON_WORDS.setPriceSubExact(
                    formatCents(cost.amount.lowCents),
                  ),
                )
              : HORIZON_WORDS.setPriceSub
          }
          onClick={() => setView('price')}
        />
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Pencil />}
          label={HORIZON_WORDS.changeCostRow}
          subtitle={HORIZON_WORDS.changeCostSub}
          onClick={onChange}
        />
        {isRemovable && (
          <ActionRow
            isGrouped
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={HORIZON_WORDS.removeCostRow}
            subtitle={HORIZON_WORDS.removeCostSub}
            isDisabled={isRemoving}
            onClick={() => void remove()}
          />
        )}
      </ActionGroup>
      {isLive && !isRemovable && (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.changeLastCost}
        </p>
      )}
    </div>
  );
}

export default CostSheet;
