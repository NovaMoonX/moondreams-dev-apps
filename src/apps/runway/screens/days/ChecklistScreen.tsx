import { Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import BillPaidChip from '@apps/runway/components/BillPaidChip';
import ChecklistGroup from '@apps/runway/components/ChecklistGroup';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { BILL_WORDS, CHECKLIST_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { setLinesDone } from '@apps/runway/store/actions/moveActions';
import {
  selectBillPayments,
  selectOpenDay,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { RecordLine } from '@apps/runway/types';
import { describeBillProgress } from '@apps/runway/utils/billText';

interface ChecklistScreenProps {
  day: ListedDay;
  lines: readonly RecordLine[];
}

/** What to do with the money of a confirmed day: the bills it set money aside for, ready to pay or still waiting for the rest. */
function ChecklistScreen({ day, lines }: ChecklistScreenProps) {
  const { user } = useAuth();
  const { isBelow } = useMediaQuery();
  const everythingLabel = isBelow('sm')
    ? CHECKLIST_WORDS.everythingShort
    : CHECKLIST_WORDS.everything;
  const { addToast } = useToast();
  const today = todayAsUtcDate(useNow(60_000));
  const items = useAppSelector((state) => state.runway.items);
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const openDay = useAppSelector((state) => selectOpenDay(state, day.dayKey));
  const doneIds = openDay?.doneLineIds ?? [];
  const done = new Set(doneIds);

  const billIds = new Set(
    items.filter((item) => item.kind === 'bill').map((item) => item.id),
  );
  const rows = lines
    .filter((line) => billIds.has(line.itemId) && line.cents > 0)
    .map((line) => {
      const payment =
        (payments[line.itemId] ?? []).find((entry) => entry.dueOn >= day.on) ??
        null;
      const isWaiting =
        payment !== null &&
        payment.paid === null &&
        payment.fundedCents < payment.totalCents;
      return { line, payment, isWaiting };
    });
  const ready = rows.filter((row) => !row.isWaiting);
  const waiting = rows.filter((row) => row.isWaiting);
  const readyIds = ready.map((row) => row.line.lineId);
  const doneCount = readyIds.filter((id) => done.has(id)).length;

  if (rows.length === 0) return null;

  const setDone = async (lineIds: readonly string[], isDone: boolean) => {
    if (!user) return;
    try {
      await setLinesDone(user.uid, day.dayKey, lineIds, isDone, doneIds);
    } catch {
      addToast({ title: CHECKLIST_WORDS.tickFailed, type: 'error' });
    }
  };

  return (
    <section aria-label={CHECKLIST_WORDS.title} className='space-y-3'>
      {ready.length > 0 && (
        <div className='border-border bg-card flex min-h-12 items-center gap-3 rounded-2xl border px-3'>
          <Checkbox
            checked={doneCount === ready.length}
            indeterminate={doneCount > 0 && doneCount < ready.length}
            onCheckedChange={(next) => setDone(readyIds, Boolean(next))}
            aria-label={CHECKLIST_WORDS.everything}
          />
          <span className='min-w-0 flex-1 font-medium'>{everythingLabel}</span>
          <span className='text-muted-foreground text-sm whitespace-nowrap tabular-nums'>
            {doneCount} of {ready.length}
          </span>
        </div>
      )}
      {ready.length > 0 && (
        <ChecklistGroup
          label={CHECKLIST_WORDS.billsGroup}
          doneCount={doneCount}
          total={ready.length}
        >
          {ready.map(({ line, payment }) => (
            <li key={line.lineId} className='flex items-start gap-3 p-3'>
              <div className='flex h-10 shrink-0 items-center'>
                <Checkbox
                  checked={done.has(line.lineId)}
                  onCheckedChange={(next) =>
                    setDone([line.lineId], Boolean(next))
                  }
                  aria-label={`${line.name} done`}
                />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex min-h-10 items-start justify-between gap-2'>
                  <p className='line-clamp-2 min-w-0 pt-2 font-medium break-words'>
                    {line.name}
                  </p>
                  <p className='flex h-10 shrink-0 items-center font-semibold whitespace-nowrap tabular-nums'>
                    {formatCents(line.cents)}
                  </p>
                </div>
                {payment && (
                  <p className='text-muted-foreground text-sm'>
                    {describeBillProgress(payment) ?? BILL_WORDS.readyToPay}
                  </p>
                )}
                {payment && (
                  <div className='pt-1'>
                    <BillPaidChip
                      billId={line.itemId}
                      billName={line.name}
                      payment={payment}
                      onMarked={() => setDone([line.lineId], true)}
                      onUndone={() => setDone([line.lineId], false)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ChecklistGroup>
      )}
      {waiting.length > 0 && (
        <div className='space-y-2'>
          <SectionDivider label={CHECKLIST_WORDS.waitingGroup} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {waiting.map(({ line, payment }) => (
              <li key={line.lineId} className='flex items-start gap-3 p-3'>
                <ItemBadge name={line.name} emoji={line.emoji} />
                <div className='min-w-0 flex-1'>
                  <p className='line-clamp-2 pt-2 font-medium break-words'>
                    {line.name}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {payment ? describeBillProgress(payment) : null}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    {BILL_WORDS.waiting}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ChecklistScreen;
