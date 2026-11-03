import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { CircleCheck, RotateCcw } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { formatDateShort } from '@/utils/formatUtils';
import { FINISHED_SALE_STATUS } from '@apps/going-once/constants';
import { finishSale } from '@apps/going-once/store/actions/saleActions';
import type { Sale } from '@apps/going-once/types';
import {
  describeFinished,
  describeLeftover,
  getClearDay,
} from '@apps/going-once/utils/finish';
import type { StatusSummary } from '@apps/going-once/utils/statusSummary';

interface FinishSectionProps {
  sale: Sale;
  isSeller: boolean;
  summary: StatusSummary;
}

/** The finished sale's line, for every member, with the seller's Reopen; or for an open sale the seller's Finish. */
function FinishSection({ sale, isSeller, summary }: FinishSectionProps) {
  const { confirm } = useActionModal();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFinished = sale.status === FINISHED_SALE_STATUS;

  const run = async (action: 'finish' | 'reopen') => {
    setIsWorking(true);
    setError(null);
    const result = await finishSale(sale.id, action);
    setIsWorking(false);
    if (result.outcome === 'failed') setError(result.reason);
  };

  const handleFinish = async () => {
    const unsold = summary.AVAILABLE.count + summary.AVAILABLE.notListedCount;
    const isConfirmed = await confirm({
      title: `Finish ${sale.name}?`,
      message: `${describeLeftover(unsold, summary.PENDING.count)} The public page closes and pushes stop. Pickups can still be recorded. Buyers' details are cleared about 30 days from now (${getClearDay(Date.now())}).`,
      confirmText: 'Finish the sale',
    });
    if (isConfirmed) await run('finish');
  };

  const handleReopen = async () => {
    const isCleared = sale.contactsClearedAt !== null;
    const isConfirmed = await confirm({
      title: `Reopen ${sale.name}?`,
      message: `${
        isCleared
          ? `Buyers' details were cleared ${formatDateShort(sale.contactsClearedAt ?? 0)} and stay cleared.`
          : "Buyers' details stay, and the clearing is cancelled."
      } The public page stays off until you turn it on.`,
      confirmText: 'Reopen the sale',
    });
    if (isConfirmed) await run('reopen');
  };

  const renderError = () =>
    error && (
      <p role='alert' className='text-destructive text-sm'>
        {error}
      </p>
    );

  if (isFinished)
    return (
      <section
        aria-label='Finished'
        className='border-border bg-card space-y-3 rounded-2xl border p-4'
      >
        <p className='text-sm text-pretty'>{describeFinished(sale)}</p>
        {isSeller && (
          <ActionRow
            isRoomy
            icon={<RotateCcw />}
            label={isWorking ? 'Reopening…' : 'Reopen the sale'}
            subtitle='The public page stays off until you turn it on.'
            isDisabled={isWorking}
            onClick={() => void handleReopen()}
          />
        )}
        {renderError()}
      </section>
    );

  if (!isSeller) return null;
  return (
    <div className='space-y-2'>
      <ActionRow
        isRoomy
        icon={<CircleCheck />}
        label={isWorking ? 'Finishing…' : 'Finish the sale'}
        subtitle="Closes the public page. Buyers' details clear in 30 days."
        isDisabled={isWorking}
        onClick={() => void handleFinish()}
      />
      {renderError()}
    </div>
  );
}

export default FinishSection;
