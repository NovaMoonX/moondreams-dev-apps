import { useState, type ReactNode } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { CircleCheck, Loader, Mail } from 'lucide-react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  YahooMark,
} from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import MethodPicker from '@/components/MethodPicker';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import {
  EMAIL_SETUP_WORDS,
  EMAIL_WORDS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  buildGmailFilterText,
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
  isConfirmed: boolean;
  hasPurchase: boolean;
  isBusy: boolean;
  /** Set on a re-walk, so Back from the first step returns to the status screen. */
  onBackToStatus: (() => void) | null;
  onPickProvider: (provider: EmailProvider) => void;
  onGetAddress: () => void;
  onGo: (index: number) => void;
  onFinish: () => void;
  onClose: () => void;
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
  isConfirmed: boolean;
}

const PROVIDER_SETTINGS_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  gmail: { href: GMAIL_FORWARDING_URL, label: WORDS.gmailForwardingLink },
  yahoo: { href: YAHOO_MAIL_URL, label: WORDS.yahooForwardingLink },
};

function ConfirmStep({ provider, intake, isConfirmed }: ConfirmStepProps) {
  const [isCodeShown, setIsCodeShown] = useState(false);
  const [isHelpShown, setIsHelpShown] = useState(false);
  const settingsLink = PROVIDER_SETTINGS_LINKS[provider];
  const url =
    intake.confirm?.url?.startsWith('https://') === true
      ? intake.confirm.url
      : null;
  const code = intake.confirm?.code ?? null;
  return (
    <StepBody
      title={WORDS.confirmTitle}
      lines={isConfirmed ? [] : [WORDS.confirmFirst(provider)]}
      isTicked={isConfirmed}
    >
      {url === null ? (
        <div className='space-y-2'>
          <Waiting>{WORDS.confirmWaiting(provider)}</Waiting>
          {!isHelpShown ? (
            <Button
              variant='tertiary'
              size='sm'
              onClick={() => setIsHelpShown(true)}
            >
              {WORDS.didntArrive}
            </Button>
          ) : (
            <div className='space-y-2'>
              {WORDS.didntArriveLines(provider).map((line) => (
                <p key={line} className='text-muted-foreground text-sm'>
                  {line}
                </p>
              ))}
              {settingsLink && (
                <ExternalLinkText
                  href={settingsLink.href}
                  label={settingsLink.label}
                />
              )}
            </div>
          )}
        </div>
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

const PROVIDER_ICONS: Record<EmailProvider, ReactNode> = {
  gmail: <GmailMark />,
  outlook: <OutlookMark />,
  icloud: <ICloudMark />,
  yahoo: <YahooMark />,
  other: <Mail className='size-5' />,
};

const readAlertAddress = (text: string) =>
  /[^\s<>,;"']+@[^\s<>,;"']+/.exec(text)?.[0] ?? null;

interface AlertAddressFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function AlertAddressField({ value, onChange }: AlertAddressFieldProps) {
  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm'>{WORDS.alertAddressLead}</p>
      <Input
        variant='outline'
        type='email'
        inputMode='email'
        autoCapitalize='none'
        autoCorrect='off'
        spellCheck={false}
        aria-label={WORDS.alertAddressLabel}
        placeholder={WORDS.alertAddressPlaceholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** One step of the forwarding setup as a card: its title, a line or two, its one action and Next and Back. */
function EmailSetupWalkthrough({
  provider,
  steps,
  stepIndex,
  intake,
  isConfirmed,
  hasPurchase,
  isBusy,
  onBackToStatus,
  onPickProvider,
  onGetAddress,
  onGo,
  onFinish,
  onClose,
}: EmailSetupWalkthroughProps) {
  const [alertText, setAlertText] = useState('');
  const [isNotArrivingShown, setIsNotArrivingShown] = useState(false);
  const alertAddress = readAlertAddress(alertText);
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
              emoji: PROVIDER_ICONS[id],
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
              line: WORDS.outlookRuleLine(alertAddress),
              href: OUTLOOK_RULES_URL,
              label: WORDS.outlookRuleLink,
            }
          : provider === 'icloud'
            ? {
                title: WORDS.icloudRuleTitle,
                line: WORDS.icloudRuleLine(alertAddress),
                href: ICLOUD_MAIL_URL,
                label: WORDS.icloudRuleLink,
              }
            : {
                title: WORDS.otherRuleTitle,
                line: WORDS.otherRuleLine(alertAddress),
                href: null,
                label: '',
              };
      return (
        <StepBody title={rule.title}>
          <AlertAddressField value={alertText} onChange={setAlertText} />
          <p className='text-muted-foreground text-sm'>{rule.line}</p>
          {rule.href !== null && (
            <ExternalLinkText href={rule.href} label={rule.label} />
          )}
        </StepBody>
      );
    }
    if (step === 'confirm') {
      return (
        <ConfirmStep
          provider={provider ?? 'other'}
          intake={intake}
          isConfirmed={isConfirmed}
        />
      );
    }
    if (step === 'filter') {
      return (
        <StepBody title={WORDS.filterTitle}>
          <AlertAddressField value={alertText} onChange={setAlertText} />
          {alertAddress === null ? (
            <p className='text-muted-foreground text-sm'>
              {WORDS.filterNeedAddress}
            </p>
          ) : (
            <>
              <code className='bg-muted block rounded-lg px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap'>
                {buildGmailFilterText(alertAddress)}
              </code>
              <p className='text-muted-foreground text-sm'>
                {WORDS.filterPaste}
              </p>
              <div className='flex flex-wrap items-center gap-3'>
                <CopyTextButton
                  text={buildGmailFilterText(alertAddress)}
                  label={WORDS.filterLabel}
                  variant='secondary'
                  isCompact
                />
                <ExternalLinkText
                  href={GMAIL_FILTERS_URL}
                  label={WORDS.filterLink}
                />
              </div>
            </>
          )}
        </StepBody>
      );
    }
    return (
      <StepBody
        title={WORDS.testTitle}
        lines={[WORDS.testLine]}
        isTicked={hasPurchase}
      >
        {hasPurchase ? (
          <p className='text-sm'>{WORDS.testDone}</p>
        ) : (
          <div className='space-y-2'>
            <Waiting>{WORDS.testWaiting}</Waiting>
            {!isNotArrivingShown ? (
              <Button
                variant='tertiary'
                size='sm'
                onClick={() => setIsNotArrivingShown(true)}
              >
                {WORDS.notArriving}
              </Button>
            ) : (
              <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-sm'>
                {WORDS.notArrivingLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
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
      {step === 'provider' && onBackToStatus !== null && (
        <div>
          <Button variant='tertiary' onClick={onBackToStatus}>
            {WORDS.back}
          </Button>
        </div>
      )}
      {step !== 'provider' && (
        <div className='flex items-center justify-between gap-3'>
          <Button variant='tertiary' onClick={() => onGo(stepIndex - 1)}>
            {WORDS.back}
          </Button>
          {canNext && (
            <Button onClick={() => onGo(stepIndex + 1)}>{WORDS.next}</Button>
          )}
          {step === 'test' && !hasPurchase && (
            <Button variant='tertiary' onClick={onClose}>
              {WORDS.finishLater}
            </Button>
          )}
          {step === 'test' && hasPurchase && (
            <Button onClick={onFinish}>{WORDS.done}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmailSetupWalkthrough;
