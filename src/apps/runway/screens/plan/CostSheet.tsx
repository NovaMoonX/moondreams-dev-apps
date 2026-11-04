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
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import RangeNote from '@apps/runway/components/RangeNote';
import SheetHead from '@apps/runway/components/SheetHead';
import { FORM_FLOW_WORDS, HORIZON_WORDS } from '@apps/runway/constants';
import { removeCost, setCostPrice } from '@apps/runway/engine/horizon';
import CostForm from '@apps/runway/forms/CostForm';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import { selectHorizonItems } from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';
import {
  getAmountDraftProblem,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import { formatRange } from '@apps/runway/utils/rangeText';

const MODE_OPTIONS = [
  {
    value: 'exact' as const,
    label: 'Exact',
    linkLabel: FORM_FLOW_WORDS.oneAmount,
  },
  {
    value: 'range' as const,
    label: 'A range',
    linkLabel: FORM_FLOW_WORDS.itVaries,
  },
];

interface PriceViewProps {
  itemId: string;
  horizon: HorizonSealed;
  cost: HorizonCost;
  today: number;
  onBack: () => void;
}

/** Say what the cost really is: an exact amount or a range, from today. */
function PriceView({ itemId, horizon, cost, today, onBack }: PriceViewProps) {
  const [draft, setDraft] = useState<AmountDraft>(() =>
    toAmountDraft(cost.amount, null),
  );
  const range = parseAmountDraft(draft);
  const isSame =
    range !== null &&
    range.lowCents === cost.amount.lowCents &&
    range.highCents === cost.amount.highCents;
  const blocker =
    range === null
      ? (getAmountDraftProblem(draft) ?? FORM_FLOW_WORDS.badAmount)
      : isSame
        ? HORIZON_WORDS.samePrice
        : null;

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
      blocker={blocker}
      onBack={onBack}
      onDone={onBack}
    >
      <AmountField
        isHero
        autoFocus
        label={HORIZON_WORDS.costAmount}
        modes={MODE_OPTIONS}
        mode={draft.mode}
        onModeChange={(mode) =>
          setDraft({ ...draft, mode: mode === 'range' ? 'range' : 'exact' })
        }
        value={draft.low}
        onChange={(low) => setDraft({ ...draft, low })}
        highValue={draft.high}
        onHighChange={(high) => setDraft({ ...draft, high })}
      />
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
}

/** One cost of an event, swapped into the event's sheet: set its price, change it, or remove it. */
function CostSheet({
  itemId,
  horizon,
  cost,
  today,
  stance,
  onBack,
}: CostSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const [view, setView] = useState<'menu' | 'price' | 'change'>('menu');
  const [edited, setEdited] = useState<HorizonCost | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const isExact = cost.amount.lowCents === cost.amount.highCents;
  const dueOn = formatDateOrdinalUTC(cost.schedule.anchor ?? today);
  const toMenu = () => {
    setEdited(null);
    setView('menu');
  };

  if (view === 'price') {
    return (
      <PriceView
        itemId={itemId}
        horizon={horizon}
        cost={cost}
        today={today}
        onBack={toMenu}
      />
    );
  }
  if (view === 'change' && edited !== null) {
    return (
      <HorizonChangeView
        itemId={itemId}
        backLabel={cost.name}
        title={HORIZON_WORDS.changeCostRow}
        current={horizon}
        candidate={{
          ...horizon,
          costs: horizon.costs.map((entry) =>
            entry.id === edited.id ? edited : entry,
          ),
        }}
        blocker={null}
        onBack={toMenu}
        onDone={toMenu}
      />
    );
  }

  const remove = async () => {
    if (!user || isRemoving) return;
    const isConfirmed = await confirm({
      title: HORIZON_WORDS.removeConfirmTitle(cost.name),
      message: mask(
        HORIZON_WORDS.removeConfirmText(cost.name, dueOn, horizon.name),
      ),
      confirmText: HORIZON_WORDS.removeConfirm,
    });
    if (!isConfirmed) return;
    const live = selectHorizonItems(store.getState(), today).find(
      ({ item }) => item.id === itemId,
    )?.version.payload;
    // No payment can be marked paid yet, so a removal is always a version without the cost.
    const next = live ? removeCost(live, cost.id, today, false) : null;
    if (!next) {
      addToast({ title: HORIZON_WORDS.removeGone, type: 'error' });
      return;
    }
    setIsRemoving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await changeItem(user.uid, encryption, {
        itemId,
        kind: 'horizon',
        payload: next,
        summary: HORIZON_WORDS.removeSummary(next.name, cost.name, dueOn),
        note: null,
        effectiveFrom: today,
      });
      addToast({
        title: HORIZON_WORDS.removedToast(cost.name),
        type: 'success',
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
        fact={HORIZON_WORDS.costFact(
          dueOn,
          cost.pricedOn === null ? null : formatDateOrdinalUTC(cost.pricedOn),
        )}
      />
      <RangeNote range={cost.amount} stance={stance} side='expense' />
      <ActionGroup isRoomy>
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Tag />}
          label={HORIZON_WORDS.setPrice}
          subtitle={
            isExact
              ? HORIZON_WORDS.setPriceSubExact(
                  formatCents(cost.amount.lowCents),
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
          onClick={() => setView('change')}
        />
        {horizon.costs.length > 1 && (
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
      {view === 'change' && edited === null && (
        <CostForm
          isAmountFixed
          itemName={horizon.name}
          happensOn={horizon.happensOn}
          cost={cost}
          onSave={setEdited}
          onClose={toMenu}
        />
      )}
    </div>
  );
}

export default CostSheet;
