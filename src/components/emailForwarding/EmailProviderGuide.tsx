import { type ComponentType, useState } from 'react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  ProtonMark,
  YahooMark,
} from '@/components/BrandMarks';
import ExternalLinkText from '@/components/ExternalLinkText';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { EMAIL_FORWARDING_WORDS as WORDS } from '@/components/emailForwarding/emailForwardingWords';
import {
  MAIL_PROVIDER_GUIDES,
  type MailProviderId,
} from '@/lib/emailForwarding/providerGuides';

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
      icon: <Mark className='size-4' />,
    };
  }),
  { value: 'other', label: WORDS.otherProvider },
];

/** Asks which email service the person uses and links that service's own help on forwarding. */
function EmailProviderGuide() {
  const [choice, setChoice] = useState<ProviderChoice | null>(null);
  const guide = MAIL_PROVIDER_GUIDES.find((item) => item.id === choice) ?? null;

  return (
    <div className='space-y-3'>
      <div className='space-y-1'>
        <p className='text-sm font-semibold'>{WORDS.guideTitle}</p>
        <p className='text-muted-foreground text-sm'>{WORDS.guideLine}</p>
      </div>
      <PillGroup
        label={WORDS.guidePickLabel}
        options={OPTIONS}
        value={choice}
        onChange={setChoice}
      />
      {guide !== null && (
        <div className='space-y-1.5'>
          {guide.paidPlan !== null && (
            <p className='text-muted-foreground text-sm'>
              {WORDS.paidLine(guide.name, guide.paidPlan)}
            </p>
          )}
          <ExternalLinkText
            href={guide.articleUrl}
            label={WORDS.openGuide(guide.name)}
          />
          {guide.videoUrl !== null && (
            <div>
              <ExternalLinkText
                href={guide.videoUrl}
                label={WORDS.watchVideo(guide.name)}
              />
            </div>
          )}
        </div>
      )}
      {choice === 'other' && (
        <p className='text-muted-foreground text-sm'>{WORDS.otherGuide}</p>
      )}
    </div>
  );
}

export default EmailProviderGuide;
