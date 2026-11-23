import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CircleCheck, Loader, Mail } from 'lucide-react';

import { GmailMark } from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import MethodPicker from '@/components/MethodPicker';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import {
  EMAIL_FILTER_TEXT,
  EMAIL_SETUP_WORDS,
  EMAIL_WORDS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  YAHOO_MAIL_URL,
} from '@apps/runway/components/emailWords';
import type { EmailIntakeRead } from '@apps/runway/hooks/useEmailPurchases';
import type { EmailProvider } from '@apps/runway/types';
import type { EmailSetupStepId } from '@apps/runway/utils/emailSetupSteps';

const WORDS = EMAIL_SETUP_WORDS;
const PROVIDERS: EmailProvider[] = [
  'gmail',
  'outlook',
  'icloud',
  'yahoo',
  'other',
];

interface EmailSetupWalkthroughProps {
  provider: EmailProvider | null;
  steps: EmailSetupStepId[];
  stepIndex: number;
  intake: EmailIntakeRead;
  hasPurchase: boolean;
  isBusy: boolean;
  onPickProvider: (provider: EmailProvider) => void;
  onGetAddress: () => void;
  onGo: (index: number) => void;
  onFinish: () => void;
}

interface StepBodyProps {
  title: string;
  lines?: readonly string[];
  isTicked?: boolean;
  children?: ReactNode;
}

function StepBody({
  title,
  lines = [],
  isTicked = false,
  children,
}: StepBodyProps) {
  return (
    <div className='space-y-3'>
      <div className='flex items-start gap-2'>
        <ActionTitle>{title}</ActionTitle>
        {isTicked && (
          <CircleCheck
            className='text-success mt-1.5 size-5 shrink-0'
            aria-label='Done'
          />
        )}
      </div>
      {lines.map((line) => (
        <p key={line} className='text-muted-foreground text-sm'>
          {line}
        </p>
      ))}
      {children}
    </div>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p
      className='text-muted-foreground flex items-center gap-2 text-sm'
      role='status'
    >
      <Loader className='size-4 shrink-0 animate-spin' aria-hidden='true' />
      {children}
    </p>
  );
}

interface ConfirmStepProps {
  provider: EmailProvider;
  intake: EmailIntakeRead;
}

function ConfirmStep({ provider, intake }: ConfirmStepProps) {
  const [isCodeShown, setIsCodeShown] = useState(false);
  const url =
    intake.confirm?.url?.startsWith('https://') === true
      ? intake.confirm.url
      : null;
  const code = intake.confirm?.code ?? null;
  return (
    <StepBody title={WORDS.confirmTitle} isTicked={intake.confirm?.at != null}>
      {url === null ? (
        <Waiting>{WORDS.confirmWaiting(provider)}</Waiting>
      ) : (
        <div className='space-y-2'>
          <Button
            className='w-full'
            variant='secondary'
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            {WORDS.confirmButton(provider)}
          </Button>
          {code !== null && !isCodeShown && (
            <Button
              variant='tertiary'
              size='sm'
              onClick={() => setIsCodeShown(true)}
            >
              {WORDS.linkFailed}
            </Button>
          )}
          {code !== null && isCodeShown && (
            <div className='space-y-1'>
              <p className='text-muted-foreground text-sm'>
                {WORDS.codeLine(provider)}
              </p>
              <div className='flex items-center justify-between gap-3'>
                <span className='text-lg font-semibold tabular-nums'>
                  {code}
                </span>
                <CopyTextButton
                  text={code}
                  label={WORDS.copyCode}
                  variant='tertiary'
                  isCompact
                />
              </div>
            </div>
          )}
        </div>
      )}
    </StepBody>
  );
}

const getProviderIcon = (provider: EmailProvider) =>
  provider === 'gmail' ? <GmailMark /> : <Mail className='size-5' />;

/** One step of the forwarding setup as a card: its title, a line or two, its one action and Next and Back. */
function EmailSetupWalkthrough({
  provider,
  steps,
  stepIndex,
  intake,
  hasPurchase,
  isBusy,
  onPickProvider,
  onGetAddress,
  onGo,
  onFinish,
}: EmailSetupWalkthroughProps) {
  const step = steps[stepIndex] ?? 'provider';
  const addressParts = (intake.address ?? '').split(/@(.*)/s);
  const hasNext = stepIndex < steps.length - 1;
  const canNext =
    step === 'provider'
      ? false
      : step === 'copy'
        ? intake.address !== null
        : hasNext;

  const body = () => {
    if (step === 'provider') {
      return (
        <StepBody title={WORDS.providerTitle}>
          <MethodPicker
            methods={PROVIDERS.map((id) => ({
              id,
              emoji: getProviderIcon(id),
              title: WORDS.providerLabels[id],
              description: WORDS.providerSubs[id],
              onPick: () => onPickProvider(id),
            }))}
          />
        </StepBody>
      );
    }
    if (step === 'copy') {
      return (
        <StepBody title={WORDS.copyTitle} lines={[WORDS.copyLine]}>
          {intake.address === null ? (
            <Button
              className='w-full'
              disabled={isBusy || intake.isLoading}
              onClick={onGetAddress}
            >
              {EMAIL_WORDS.getAddress}
            </Button>
          ) : (
            <div className='border-border space-y-3 rounded-2xl border p-3'>
              <p className='text-base font-semibold select-all'>
                <span className='break-all'>{addressParts[0]}@</span>
                <wbr />
                <span className='whitespace-nowrap'>{addressParts[1]}</span>
              </p>
              <CopyTextButton
                text={intake.address}
                label={WORDS.copyLabel}
                variant='secondary'
              />
            </div>
          )}
        </StepBody>
      );
    }
    if (step === 'forwarding' && provider === 'yahoo') {
      return (
        <StepBody
          title={WORDS.yahooForwardingTitle}
          lines={WORDS.yahooForwardingLines}
        >
          <ExternalLinkText
            href={YAHOO_MAIL_URL}
            label={WORDS.yahooForwardingLink}
          />
        </StepBody>
      );
    }
    if (step === 'forwarding') {
      return (
        <StepBody
          title={WORDS.gmailForwardingTitle}
          lines={WORDS.gmailForwardingLines}
        >
          <ExternalLinkText
            href={GMAIL_FORWARDING_URL}
            label={WORDS.gmailForwardingLink}
          />
        </StepBody>
      );
    }
    if (step === 'rule') {
      const rule =
        provider === 'outlook'
          ? {
              title: WORDS.outlookRuleTitle,
              lines: WORDS.outlookRuleLines,
              href: OUTLOOK_RULES_URL,
              label: WORDS.outlookRuleLink,
            }
          : provider === 'icloud'
            ? {
                title: WORDS.icloudRuleTitle,
                lines: WORDS.icloudRuleLines,
                href: ICLOUD_MAIL_URL,
                label: WORDS.icloudRuleLink,
              }
            : {
                title: WORDS.otherRuleTitle,
                lines: WORDS.otherRuleLines,
                href: null,
                label: '',
              };
      return (
        <StepBody title={rule.title} lines={rule.lines}>
          {rule.href !== null && (
            <ExternalLinkText href={rule.href} label={rule.label} />
          )}
        </StepBody>
      );
    }
    if (step === 'confirm') {
      return <ConfirmStep provider={provider ?? 'other'} intake={intake} />;
    }
    if (step === 'filter') {
      return (
        <StepBody title={WORDS.filterTitle} lines={WORDS.filterLines}>
          <code className='bg-muted block rounded-lg px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap'>
            {EMAIL_FILTER_TEXT}
          </code>
          <p className='text-muted-foreground text-xs'>{WORDS.filterHint}</p>
          <div className='flex flex-wrap items-center gap-3'>
            <CopyTextButton
              text={EMAIL_FILTER_TEXT}
              label={WORDS.filterLabel}
              variant='secondary'
              isCompact
            />
            <ExternalLinkText
              href={GMAIL_FILTERS_URL}
              label={WORDS.filterLink}
            />
          </div>
        </StepBody>
      );
    }
    return (
      <StepBody
        title={WORDS.testTitle}
        lines={[
          WORDS.testLine,
          ...(provider === 'yahoo' ? [WORDS.yahooNote] : []),
        ]}
        isTicked={hasPurchase}
      >
        {hasPurchase ? (
          <p className='text-sm'>{WORDS.testDone}</p>
        ) : (
          <Waiting>{WORDS.testWaiting}</Waiting>
        )}
      </StepBody>
    );
  };

  return (
    <div className='border-border bg-card space-y-4 rounded-2xl border p-4'>
      {provider !== null && (
        <p className='text-muted-foreground text-sm'>
          {WORDS.progress(stepIndex + 1, steps.length)}
        </p>
      )}
      {body()}
      {step !== 'provider' && (
        <div className='flex items-center justify-between gap-3'>
          <Button variant='tertiary' onClick={() => onGo(stepIndex - 1)}>
            {WORDS.back}
          </Button>
          {canNext && (
            <Button onClick={() => onGo(stepIndex + 1)}>{WORDS.next}</Button>
          )}
          {step === 'test' && hasPurchase && (
            <Button onClick={onFinish}>{WORDS.done}</Button>
          )}
        </div>
      )}
      {step === 'provider' && provider !== null && hasNext && (
        <div className='flex justify-end'>
          <Button variant='tertiary' onClick={() => onGo(1)}>
            {WORDS.next}
          </Button>
        </div>
      )}
    </div>
  );
}

export default EmailSetupWalkthrough;
