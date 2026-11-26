import { ChevronRight, Mail } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';

import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import {
  CONFIRM_PROVIDER_NAMES,
  readConfirmLink,
} from '@/lib/emailForwarding/address';
import type { EmailConfirm } from '@/lib/emailForwarding/types';

interface EmailConfirmNoticeProps {
  /** Names the app in "<app> confirmed Gmail's forwarding". */
  appName: string;
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

/** The provider's forwarding confirmation: a quiet line when the server opened the link, else the link or code to act on. */
function EmailConfirmNotice({
  appName,
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
          {WORDS.confirmedBy(appName, name ?? 'your email')}
        </p>
        {url !== null && <LinkRow label={WORDS.confirmAgain} url={url} />}
      </div>
    );
  }

  if (url === null && confirm.code === null) return null;
  if (url !== null && isTapped) {
    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>{WORDS.confirmWaiting}</p>
        <LinkRow label={WORDS.confirmAgain} url={url} />
      </div>
    );
  }
  return (
    <InlineNotice
      tone='info'
      icon={Mail}
      title={WORDS.confirmAsked(name ?? 'Your email')}
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
            {WORDS.confirmButton(name)}
          </Button>
        ) : (
          <>
            <p className='text-muted-foreground'>
              {WORDS.confirmCodeLine(name)}
            </p>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-lg font-semibold tabular-nums'>
                {confirm.code}
              </span>
              <CopyTextButton
                text={confirm.code ?? ''}
                label={WORDS.copyCode}
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
