import { Mail } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import {
  CONFIRM_PROVIDER_NAMES,
  EMAIL_WORDS,
} from '@apps/runway/components/emailWords';
import type { EmailIntakeRead } from '@apps/runway/hooks/useEmailPurchases';

interface EmailConfirmNoticeProps {
  confirm: NonNullable<EmailIntakeRead['confirm']>;
  onConfirmTapped: () => void;
}

const openLink = (url: string) =>
  window.open(url, '_blank', 'noopener,noreferrer');

/** What the person still has to do, or what Runway did, about their email provider's forwarding confirmation; the screen decides how long it stays. */
function EmailConfirmNotice({
  confirm,
  onConfirmTapped,
}: EmailConfirmNoticeProps) {
  const url = confirm.url?.startsWith('https://') ? confirm.url : null;
  const name =
    confirm.provider === null ? null : CONFIRM_PROVIDER_NAMES[confirm.provider];

  if (confirm.autoConfirm === 'confirmed') {
    return (
      <div className='flex flex-wrap items-center justify-between gap-x-3'>
        <p className='text-muted-foreground text-sm'>
          {EMAIL_WORDS.confirmedBy(name ?? 'your email')}
        </p>
        {url !== null && (
          <Button
            variant='tertiary'
            size='sm'
            className='text-muted-foreground -mr-2 text-xs'
            onClick={() => openLink(url)}
          >
            {EMAIL_WORDS.confirmAgain}
          </Button>
        )}
      </div>
    );
  }

  if (url === null && confirm.code === null) return null;
  return (
    <InlineNotice
      tone='info'
      icon={Mail}
      title={EMAIL_WORDS.confirmAsked(name ?? 'Your email')}
    >
      <div className='mt-2 space-y-2'>
        {url !== null ? (
          <Button
            className='w-full'
            onClick={() => {
              openLink(url);
              onConfirmTapped();
            }}
          >
            {EMAIL_WORDS.confirmButton(name)}
          </Button>
        ) : (
          <>
            <p className='text-muted-foreground'>
              {EMAIL_WORDS.confirmCodeLine(name)}
            </p>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-lg font-semibold tabular-nums'>
                {confirm.code}
              </span>
              <CopyTextButton
                text={confirm.code ?? ''}
                label={EMAIL_WORDS.copyCode}
                variant='tertiary'
                isCompact
              />
            </div>
          </>
        )}
      </div>
    </InlineNotice>
  );
}

export default EmailConfirmNotice;
