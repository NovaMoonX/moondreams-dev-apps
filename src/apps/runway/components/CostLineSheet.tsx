import { useState } from 'react';
import { CalendarClock, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import CostShareView from '@apps/runway/components/CostShareView';
import { MaskedText } from '@apps/runway/components/MaskedText';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  HORIZON_WORDS,
  ITEM_SHEET_WORDS,
  PAY_SHARE_WORDS,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import type { DraftLine } from '@apps/runway/engine/draft';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import {
  selectHorizonItems,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

interface CostLineSheetProps {
  line: DraftLine;
  /** The cost's name with its item's, as the row shows it. */
  name: string;
  itemName: string;
  today: number;
  dayKey: string;
  /** This income day takes its own share of the cost. */
  isDayOnly: boolean;
  /** The day can still change what it puts in. */
  canChange: boolean;
  onResetShare?: (line: DraftLine) => void;
  onClose: () => void;
}

/** The sheet of a Horizon cost's line on an income day: why the pay puts this in, a change for this pay alone, and a door to the item. */
function CostLineSheet({
  line,
  name,
  itemName,
  today,
  dayKey,
  isDayOnly,
  canChange,
  onResetShare,
  onClose,
}: CostLineSheetProps) {
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const stance = useAppSelector(selectStance);
  const [view, setView] = useState<'menu' | 'change' | 'item'>('menu');
  const found = horizons.find(({ item }) => item.id === line.itemId) ?? null;
  const { cost } = line;
  const cents = formatCents(line.cents);

  if (view === 'item' && found) {
    return (
      <HorizonSheet
        itemId={line.itemId}
        horizon={found.version.payload}
        today={today}
        stance={stance}
        onClose={onClose}
      />
    );
  }
  if (!cost) return null;
  const costName = found?.version.payload.costs.find(
    ({ id }) => id === line.costId,
  )?.name;
  const cleanName = costName ?? name;
  const date = formatDateOrdinalUTC(cost.dueOn);
  const getWhy = () => {
    if (line.repaysFree) return HORIZON_WORDS.lineBackSheet(cleanName, date);
    const total = formatCents(cost.totalCents);
    return found?.version.payload.rest.kind === 'onePay'
      ? HORIZON_WORDS.lineWhyOnePay(cleanName, total, date)
      : HORIZON_WORDS.lineWhyPays(cleanName, total, date);
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={name}
      actions={<ValuesEyeButton />}
    >
      {view === 'change' ? (
        <CostShareView
          itemId={line.itemId}
          costId={cost.costId}
          costName={cleanName}
          itemName={itemName}
          dayKey={dayKey}
          currentCents={line.demandCents}
          maxCents={cost.needCents}
          onBack={() => setView('menu')}
          onClose={onClose}
        />
      ) : (
        <div className='space-y-4'>
          <SheetHead
            label={ITEM_SHEET_WORDS.fromThisDay}
            figure={cents}
            fact={`${PRIORITY_LABELS[line.tier]} · ${
              line.repaysFree
                ? HORIZON_WORDS.lineBack
                : HORIZON_WORDS.lineDue(date)
            }`}
          />
          <p className='text-sm'>
            <MaskedText>{getWhy()}</MaskedText>
          </p>
          <ActionGroup isRoomy>
            {canChange && !line.repaysFree && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<CalendarClock />}
                label={PAY_SHARE_WORDS.action}
                subtitle={PAY_SHARE_WORDS.actionSub(
                  cleanName,
                  formatCents(cost.totalCents),
                )}
                onClick={() => setView('change')}
              />
            )}
            {canChange && isDayOnly && onResetShare && (
              <ActionRow
                isGrouped
                isRoomy
                icon={<Undo2 />}
                label={PAY_SHARE_WORDS.backToPlan}
                subtitle={PAY_SHARE_WORDS.backToPlanSub}
                onClick={() => {
                  onResetShare(line);
                  onClose();
                }}
              />
            )}
            {found && (
              <ActionRow
                isGrouped
                isRoomy
                hasChevron
                icon={<CalendarClock />}
                label={HORIZON_WORDS.openItem(itemName)}
                subtitle={HORIZON_WORDS.openItemSub}
                onClick={() => setView('item')}
              />
            )}
          </ActionGroup>
        </div>
      )}
    </FormSheet>
  );
}

export default CostLineSheet;
