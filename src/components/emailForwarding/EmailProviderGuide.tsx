import { type ComponentType, type ReactNode, useState } from 'react';

import { AtSign, BookOpen, Search } from 'lucide-react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  ProtonMark,
  YahooMark,
} from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import EmailAddressText from '@/components/emailForwarding/EmailAddressText';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import {
  MAIL_PROVIDER_GUIDES,
  type MailProviderId,
} from '@/lib/emailForwarding/providerGuides';

/** A mail search an app suggests for forwarding only its emails. */
export interface EmailFilterSuggestion {
  sender: string;
  phrase: string;
}

type ProviderChoice = MailProviderId | 'other';

const MARKS: Record<MailProviderId, ComponentType<{ className?: string }>> = {
  gmail: GmailMark,
  outlook: OutlookMark,
  icloud: ICloudMark,
  yahoo: YahooMark,
  proton: ProtonMark,
};

const OPTIONS: readonly PillOption<ProviderChoice>[] = [
  ...MAIL_PROVIDER_GUIDES.map((guide) => {
    const Mark = MARKS[guide.id];
    return {
      value: guide.id,
      label: guide.name,
      detail: guide.paidPlan === null ? undefined : WORDS.paidPill,
      ariaLabel:
        guide.paidPlan === null
          ? undefined
          : WORDS.paidAria(guide.name, guide.paidPlan),
      icon: (
        <span className='inline-flex rounded-full bg-white p-1'>
          <Mark className='size-4' />
        </span>
      ),
    };
  }),
  { value: 'other', label: WORDS.otherProvider },
];

const toSearch = ({ sender, phrase }: EmailFilterSuggestion) =>
  `from:(${sender}) "${phrase}"`;

interface GuidePartProps {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}

function GuidePart({ icon: Icon, children }: GuidePartProps) {
  return (
    <li className='flex gap-3'>
      <span
        className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full'
        aria-hidden='true'
      >
        <Icon className='size-4' />
      </span>
      <div className='min-w-0 flex-1 space-y-2 pt-1.5 text-sm'>{children}</div>
    </li>
  );
}

interface EmailProviderGuideProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  prefix: string;
  filter: EmailFilterSuggestion | null;
}

/** Asks which email service the person uses, links that service's own guide, and lists what to paste into it. */
function EmailProviderGuide({
  isOpen,
  onClose,
  address,
  prefix,
  filter,
}: EmailProviderGuideProps) {
  const [choice, setChoice] = useState<ProviderChoice | null>(null);
  const [copyFailed, setCopyFailed] = useState<'address' | 'search' | null>(
    null,
  );
  const guide = MAIL_PROVIDER_GUIDES.find((item) => item.id === choice) ?? null;

  return (
    <DetailSheet isOpen={isOpen} onClose={onClose} title={WORDS.guideTitle}>
      <div className='space-y-4 pb-2'>
        <div className='space-y-2'>
          <p className='text-sm font-semibold'>{WORDS.guidePickLabel}</p>
          <PillGroup
            label={WORDS.guidePickLabel}
            options={OPTIONS}
            value={choice}
            onChange={setChoice}
            hasRoundIcons
          />
        </div>
        {choice !== null && (
          <ul className='space-y-4'>
            <GuidePart icon={BookOpen}>
              {guide === null ? (
                <p>{WORDS.otherStep}</p>
              ) : (
                <>
                  <ExternalLinkText
                    href={guide.articleUrl}
                    label={WORDS.openGuide(guide.name)}
                    className='font-semibold'
                  />
                  {guide.videoUrl !== null && (
                    <div>
                      <ExternalLinkText
                        href={guide.videoUrl}
                        label={WORDS.watchVideo(guide.name)}
                      />
                    </div>
                  )}
                  {guide.paidPlan !== null && (
                    <p className='text-muted-foreground'>
                      {WORDS.paidLine(guide.paidPlan)}
                    </p>
                  )}
                </>
              )}
            </GuidePart>
            <GuidePart icon={AtSign}>
              <p>{WORDS.addressStep}</p>
              <p className='border-border rounded-xl border px-2.5 py-2 text-xs font-semibold break-words select-all'>
                <EmailAddressText address={address} prefix={prefix} />
              </p>
              <div className='flex justify-end'>
                <CopyTextButton
                  isCompact
                  variant='secondary'
                  text={address}
                  label={WORDS.copyAddress}
                  onFailed={() => setCopyFailed('address')}
                />
              </div>
              {copyFailed === 'address' && (
                <p className='text-destructive' role='alert'>
                  {WORDS.copyFailed}
                </p>
              )}
            </GuidePart>
            <GuidePart icon={Search}>
              {filter === null ? (
                <p>{WORDS.noSearchStep}</p>
              ) : (
                <>
                  <p>{WORDS.searchStep}</p>
                  <code className='bg-background border-border block rounded-xl border px-2.5 py-2 text-xs select-all'>
                    {'from:('}
                    <EmailAddressText address={filter.sender} />
                    {`) "${filter.phrase}"`}
                  </code>
                  <div className='flex justify-end'>
                    <CopyTextButton
                      isCompact
                      variant='secondary'
                      text={toSearch(filter)}
                      label={WORDS.copySearch}
                      onFailed={() => setCopyFailed('search')}
                    />
                  </div>
                  {copyFailed === 'search' && (
                    <p className='text-destructive' role='alert'>
                      {WORDS.searchCopyFailed}
                    </p>
                  )}
                  <p className='text-muted-foreground text-xs'>
                    {WORDS.filterCheck}
                  </p>
                </>
              )}
            </GuidePart>
          </ul>
        )}
      </div>
    </DetailSheet>
  );
}

export default EmailProviderGuide;
