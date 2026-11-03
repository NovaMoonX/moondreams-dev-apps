import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { ExternalLink, RefreshCw } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import {
  FINISHED_SALE_STATUS,
  SALE_PAGE_PATH,
} from '@apps/going-once/constants';
import { changeSaleLink } from '@apps/going-once/store/actions/saleActions';
import type { Sale, SaleLinkAction } from '@apps/going-once/types';

interface LinkCardProps {
  sale: Sale;
  isSeller: boolean;
}

/** The Sale tab's public page: the seller turns it on and off or gets a new address; the seller and co-sellers copy and open it. */
function LinkCard({ sale, isSeller }: LinkCardProps) {
  const navigate = useNavigate();
  const { confirm } = useActionModal();
  const [pending, setPending] = useState<SaleLinkAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkId = sale.publicLinkId;
  const isFinished = sale.status === FINISHED_SALE_STATUS;
  const isOn = pending === null ? linkId !== null : pending !== 'stop';
  const path = linkId === null ? null : `${SALE_PAGE_PATH}${linkId}`;

  const change = async (action: SaleLinkAction) => {
    setPending(action);
    setError(null);
    const result = await changeSaleLink(sale.id, action);
    setPending(null);
    if (result.outcome === 'failed') setError(result.reason);
  };

  const handleToggle = async (isChecked: boolean) => {
    if (isChecked) {
      await change('create');
      return;
    }
    const isConfirmed = await confirm({
      title: 'Turn off the public page?',
      message:
        "Everyone with the link sees that the sale isn't here anymore. Turning it on again makes a new address.",
      confirmText: 'Turn it off',
      destructive: true,
    });
    if (isConfirmed) await change('stop');
  };

  const handleNewAddress = async () => {
    const isConfirmed = await confirm({
      title: 'Get a new address?',
      message:
        "Anyone with the old link sees that the sale isn't here anymore. You'll share the new one.",
      confirmText: 'Get a new address',
      destructive: true,
    });
    if (isConfirmed) await change('renew');
  };

  const getOffNotice = () => {
    if (isFinished)
      return isSeller
        ? 'This sale is finished. Reopen it to turn the page on.'
        : 'This sale is finished, so the page is off.';
    if (isSeller)
      return "Turning it on makes a link that shows photos, names, condition and prices of Available and Pending things. Never your floor prices, notes, buyers or who's selling.";
    return 'Only the seller can turn it on.';
  };

  return (
    <section
      aria-label='Public page'
      className='border-border bg-card space-y-3 rounded-2xl border p-4'
    >
      <div className='flex min-h-10 items-center justify-between gap-3'>
        <h3 className='font-medium'>Public page</h3>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-sm'>
            {isOn ? 'On' : 'Off'}
          </span>
          {isSeller && (
            <AppToggle
              aria-label='Public page'
              checked={isOn}
              disabled={pending !== null || isFinished}
              onCheckedChange={(isChecked) => void handleToggle(isChecked)}
            />
          )}
        </div>
      </div>
      {path === null || !isOn ? (
        <InlineNotice tone='info'>{getOffNotice()}</InlineNotice>
      ) : (
        <>
          <p className='text-muted-foreground text-sm break-all'>
            {window.location.host}
            {SALE_PAGE_PATH}
            {linkId?.slice(0, 6)}…
          </p>
          <div className='flex items-center gap-2'>
            <CopyTextButton
              text={`${window.location.origin}${path}`}
              label='Copy link'
              variant='secondary'
              className='h-10 min-w-0 flex-1 px-2! whitespace-nowrap [&_svg]:shrink-0'
            />
            <Button
              type='button'
              variant='secondary'
              className='h-10 min-w-0 flex-1 gap-1.5 px-2! [&_svg]:shrink-0'
              onClick={() => navigate(`${path}?sale=${sale.id}&tab=sale`)}
            >
              <ExternalLink className='size-4' aria-hidden='true' />
              Open
            </Button>
            {isSeller && (
              <Button
                type='button'
                variant='secondary'
                className='size-10 shrink-0 p-0!'
                aria-label='Get a new address'
                disabled={pending !== null}
                onClick={() => void handleNewAddress()}
              >
                <RefreshCw className='size-4' aria-hidden='true' />
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
    </section>
  );
}

export default LinkCard;
