import { ChevronRight, Mail } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import {
  CONFIRM_PROVIDER_NAMES,
  EMAIL_WORDS,
  readConfirmLink,
} from '@apps/runway/components/emailWords';
import type { EmailIntakeRead } from '@apps/runway/hooks/useEmailPurchases';

type EmailConfirm = NonNullable<EmailIntakeRead['confirm']>;

interface EmailConfirmNoticeProps {
  confirm: EmailConfirm;
  isTapped: boolean;
  onConfirmTapped: () => void;
}

const openLink = (url: string) =>
  window.open(url, '_blank', 'noopener,noreferrer');

interface LinkRowProps {
  label: string;
  url: string;
}

function LinkRow({ label, url }: LinkRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='text-muted-foreground! border-border h-auto min-h-11 w-full items-center justify-between gap-3 rounded-2xl border px-3! py-1.5 text-left text-sm font-normal whitespace-normal'
      onClick={() => openLink(url)}
    >
      <span className='min-w-0 flex-1 break-words'>{label}</span>
      <ChevronRight className='size-4 shrink-0' aria-hidden='true' />
    </Button>
  );
}

function EmailConfirmNotice({
  confirm,
  isTapped,
  onConfirmTapped,
}: EmailConfirmNoticeProps) {
  const url = readConfirmLink(confirm);
  const name =
    confirm.provider === null ? null : CONFIRM_PROVIDER_NAMES[confirm.provider];

  if (confirm.autoConfirm === 'confirmed') {
    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          {EMAIL_WORDS.confirmedBy(name ?? 'your email')}
        </p>
        {url !== null && <LinkRow label={EMAIL_WORDS.confirmAgain} url={url} />}
      </div>
    );
  }

  if (url === null && confirm.code === null) return null;
  if (url !== null && isTapped) {
    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          {EMAIL_WORDS.confirmWaiting(name)}
        </p>
        <LinkRow label={EMAIL_WORDS.confirmAgain} url={url} />
      </div>
    );
  }
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
