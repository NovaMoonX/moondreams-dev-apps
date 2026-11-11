import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import SensitiveValue from '@/components/SensitiveValue';
import { useLongPress } from '@/hooks/useLongPress';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import GroupTotalHelp from '@apps/runway/components/GroupTotalHelp';
import {
  GROUP_WORDS,
  PLAN_SELECT_WORDS,
  TICK_HIT_CLASS,
} from '@apps/runway/constants';
import type { GroupFigures } from '@apps/runway/hooks/useGroupFigures';
import {
  selectPurposeEmojis,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeGroupHeadingLead } from '@apps/runway/utils/billText';
import { formatCentsShort } from '@/utils/moneyUtils';

interface GroupHeadingProps {
  figures: GroupFigures;
  /** The list the heading sits on: it shows the total of that kind alone. */
  kind: 'bills' | 'envelopes' | 'goals';
  onOpen: () => void;
  /** For a list of balances (goals): what its rows have saved of their targets, shown instead of the monthly figure. */
  saved?: { savedCents: number; targetCents: number };
  /** While picking several: how many of the group's rows are ticked, and the tap that ticks or clears them all. */
  select?: { ticked: number; total: number; onToggle: () => void };
  /** Press and hold (right-click on a computer): starts picking several with the whole group ticked. */
  onHold?: () => void;
}

/** The heading of a list's section for one group: its name and combined monthly total, opening the group's sheet. */
function GroupHeading({
  figures,
  kind,
  onOpen,
  saved,
  select,
  onHold,
}: GroupHeadingProps) {
  const longPress = useLongPress(() => onHold?.());
  const { isHidden } = useValuesHidden();
  const stance = useAppSelector(selectStance);
  const { name } = figures;
  const emoji = useAppSelector(selectPurposeEmojis).get(figures.id);
  const total = {
    bills: figures.billsTotal,
    envelopes: figures.envelopesTotal,
    goals: figures.goalsTotal,
  }[kind];
  const count = figures[kind].length;
  const otherCount =
    figures.bills.length +
    figures.envelopes.length +
    figures.goals.length -
    count;
  const hasRange = !isHidden && total.total.lowCents !== total.total.highCents;
  const lead = saved
    ? {
        amount: formatCentsShort(saved.savedCents),
        whole: formatCentsShort(saved.targetCents),
        rest: GROUP_WORDS.savedWord,
      }
    : describeGroupHeadingLead(total, figures.total, count, otherCount);

  if (select) {
    const isAll = select.total > 0 && select.ticked === select.total;
    const label = isAll
      ? PLAN_SELECT_WORDS.groupUntick(name)
      : PLAN_SELECT_WORDS.groupTick(name);
    return (
      <div className='flex items-start gap-1'>
        <Button
          type='button'
          variant='tertiary'
          aria-label={label}
          className='text-foreground! flex h-auto min-h-11 min-w-0 flex-1 flex-col items-start justify-start gap-0 px-2! py-1.5! text-left font-normal whitespace-normal'
          onClick={select.onToggle}
        >
          <span className='line-clamp-2 text-base font-semibold break-words'>
            {emoji && `${emoji} `}
            {name}
          </span>
          <span className='text-muted-foreground block text-sm'>
            {PLAN_SELECT_WORDS.groupTicked(select.ticked, select.total)}
          </span>
        </Button>
        <span className='flex min-h-11 shrink-0 items-center pt-1 pr-3'>
          <Checkbox
            className={TICK_HIT_CLASS}
            checked={isAll}
            indeterminate={select.ticked > 0 && !isAll}
            onCheckedChange={select.onToggle}
            aria-label={label}
          />
        </span>
      </div>
    );
  }

  return (
    <div className='flex items-start gap-1'>
      <div className='min-w-0 flex-1 px-2 py-1.5'>
        <Button
          type='button'
          variant='tertiary'
          aria-label={GROUP_WORDS.openLabel(name)}
          className={join(
            'text-foreground! block h-auto min-h-6 w-full justify-start p-0! text-left text-base font-semibold whitespace-normal',
            onHold && 'select-none [-webkit-touch-callout:none]',
          )}
          {...(onHold ? longPress : {})}
          onClick={(event) => {
            if (onHold) longPress.onClick(event);
            if (!event.defaultPrevented) onOpen();
          }}
        >
          <span className='block break-words'>
            <span className='line-clamp-2'>
              {emoji && `${emoji} `}
              {name}
            </span>
          </span>
        </Button>
        <div className='flex items-center gap-1'>
          <Button
            type='button'
            variant='tertiary'
            tabIndex={-1}
            aria-hidden='true'
            className='text-muted-foreground! h-auto min-h-6 min-w-0 justify-start p-0! text-left text-sm font-normal whitespace-normal'
            onClick={onOpen}
          >
            <span className='block'>
              {lead.amount !== null && (
                <>
                  <SensitiveValue className='whitespace-nowrap'>
                    {lead.amount}
                  </SensitiveValue>{' '}
                </>
              )}
              {lead.whole !== null && (
                <>
                  {GROUP_WORDS.ofWord}{' '}
                  <SensitiveValue className='whitespace-nowrap'>
                    {lead.whole}
                  </SensitiveValue>{' '}
                </>
              )}
              {lead.rest}
            </span>
          </Button>
          {!saved &&
            (hasRange ||
              total.uncounted > 0 ||
              total.oneTime.count > 0 ||
              otherCount > 0) && (
              <HelpTip title={GROUP_WORDS.basisTitle}>
                <GroupTotalHelp
                  total={total}
                  hasRange={hasRange}
                  stance={stance}
                  only={
                    otherCount > 0
                      ? {
                          kind,
                          name,
                          part: lead.whole === null ? null : lead.amount,
                          whole: lead.whole,
                        }
                      : undefined
                  }
                />
              </HelpTip>
            )}
        </div>
      </div>
      <Button
        type='button'
        variant='tertiary'
        tabIndex={-1}
        aria-hidden='true'
        className='h-auto min-h-11 p-0! pt-2.5 pr-3!'
        onClick={onOpen}
      >
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </div>
  );
}

export default GroupHeading;
