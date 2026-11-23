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
import { EmailAddressText } from '@/components/emailForwarding/EmailAddressRow';
import {
  EMAIL_FORWARDING_WORDS as WORDS,
  EMAIL_PROVIDERS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  YAHOO_MAIL_URL,
  type EmailForwardingWords,
} from '@/components/emailForwarding/emailForwardingWords';
import ExternalLinkText from '@/components/ExternalLinkText';
import InlineNotice from '@/components/InlineNotice';
import MethodPicker from '@/components/MethodPicker';
import {
  buildGmailFilterText,
  readSenderAddress,
} from '@/lib/emailForwarding/filterText';
import {
  getEmailSetupSteps,
  getFilterStepIndex,
  resolveStepIndex,
} from '@/lib/emailForwarding/setupSteps';
import type {
  EmailIntakeState,
  EmailProvider,
  EmailSetupProgress,
  EmailSetupStepId,
} from '@/lib/emailForwarding/types';
import { getErrorMessage } from '@/utils/errorUtils';

/** What the walkthrough asks the app to keep: the provider and the furthest step reached. The app adds `startedAt` the first time and `updatedAt` itself. */
export type EmailSetupProgressChange = Pick<
  EmailSetupProgress,
  'provider' | 'stepId'
>;

export interface EmailSetupWalkthroughProps {
  words: EmailForwardingWords;
  /** The address and what the server caught of the provider's confirmation; null while it loads. */
  intake: EmailIntakeState | null;
  /** True once the first useful email since `progress.startedAt` has arrived; the app decides what counts. */
  isTestReceived: boolean;
  /** Where the person got to, resumed by step id on any device; null before the first step. */
  progress: EmailSetupProgress | null;
  /** True when mail that is not the sender's has reached the address while the filter step is still ahead; draws a notice that jumps to it. */
  hasStrayEmail?: boolean;
  /** Gmail's separate filter step; default true. */
  hasFilterStep?: boolean;
  /** Called when the provider is picked or a later step is reached; a rejection shows a quiet "couldn't save your place" line and the walk goes on. */
  onSaveProgress: (next: EmailSetupProgressChange) => Promise<void>;
  /** Makes the address the first time (no confirmation: there is nothing to lose). */
  onGetAddress: () => Promise<void>;
  /** The person pressed Done on the test step after the email arrived. */
  onFinish: () => void;
  /** The person pressed Finish later on the test step. */
  onFinishLater: () => void;
  /** Set on a re-walk, so Back from the first step returns to the status screen. */
  onBackToStatus?: (() => void) | null;
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
        <h3 className='text-2xl font-semibold break-words'>{title}</h3>
        {isTicked && (
          <CircleCheck
            className='text-success mt-1.5 size-5 shrink-0'
            aria-label={WORDS.done}
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

const PROVIDER_ICONS: Record<EmailProvider, ReactNode> = {
  gmail: <GmailMark />,
  outlook: <OutlookMark />,
  icloud: <ICloudMark />,
  yahoo: <YahooMark />,
  other: <Mail className='size-5' />,
};

const PROVIDER_SETTINGS_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  gmail: { href: GMAIL_FORWARDING_URL, label: WORDS.gmailForwardingLink },
  yahoo: { href: YAHOO_MAIL_URL, label: WORDS.yahooForwardingLink },
};

interface ConfirmStepProps {
  provider: EmailProvider;
  intake: EmailIntakeState | null;
  isConfirmed: boolean;
}

function ConfirmStep({ provider, intake, isConfirmed }: ConfirmStepProps) {
  const [isCodeShown, setIsCodeShown] = useState(false);
  const [isHelpShown, setIsHelpShown] = useState(false);
  const settingsLink = PROVIDER_SETTINGS_LINKS[provider];
  const url = intake?.confirmUrl?.startsWith('https://')
    ? intake.confirmUrl
    : null;
  const code = intake?.confirmCode ?? null;
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

interface SenderFieldProps {
  words: EmailForwardingWords;
  value: string;
  onChange: (value: string) => void;
}

function SenderField({ words, value, onChange }: SenderFieldProps) {
  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-sm'>{WORDS.senderLead(words)}</p>
      <Input
        variant='outline'
        type='email'
        inputMode='email'
        autoCapitalize='none'
        autoCorrect='off'
        spellCheck={false}
        aria-label={WORDS.senderLabel}
        placeholder={words.senderAddressPlaceholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Where a view of the walk stands: made by the person's own moves, dropped when a new walk begins. */
interface WalkView {
  provider: EmailProvider | null;
  stepId: EmailSetupStepId;
  startedAt: number | null;
}

/** One step of the forwarding setup as a card: its title, a line or two, its one action and Next and Back. The same walk for every app; the app's words come in `words`. */
function EmailSetupWalkthrough({
  words,
  intake,
  isTestReceived,
  progress,
  hasStrayEmail = false,
  hasFilterStep = true,
  onSaveProgress,
  onGetAddress,
  onFinish,
  onFinishLater,
  onBackToStatus = null,
}: EmailSetupWalkthroughProps) {
  const [view, setView] = useState<WalkView | null>(null);
  const [senderText, setSenderText] = useState(words.senderAddress ?? '');
  const [isNotArrivingShown, setIsNotArrivingShown] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedAt = progress?.startedAt ?? null;
  const liveView =
    view !== null && (view.startedAt === null || view.startedAt === startedAt)
      ? view
      : null;
  const provider = liveView?.provider ?? progress?.provider ?? null;
  const hasConfirmation =
    intake !== null &&
    (intake.confirmUrl !== null || intake.confirmAt !== null);
  const options = { hasFilterStep };
  const steps = getEmailSetupSteps(provider, hasConfirmation, options);
  const furthestIndex = resolveStepIndex(steps, progress?.stepId ?? null);
  const stepIndex = liveView
    ? resolveStepIndex(steps, liveView.stepId)
    : provider !== null && progress?.stepId == null
      ? 1
      : furthestIndex;
  const step = steps[stepIndex] ?? 'provider';
  const hasNext = stepIndex < steps.length - 1;
  const address = intake?.address ?? null;
  const confirmAt = intake?.confirmAt ?? null;
  const isConfirmed =
    confirmAt !== null && (startedAt === null || confirmAt >= startedAt);
  const senderAddress = readSenderAddress(senderText);
  const filterIndex = getFilterStepIndex(steps);
  const isFilterMissing =
    hasStrayEmail &&
    progress?.doneAt == null &&
    provider !== null &&
    provider !== 'yahoo' &&
    filterIndex >= 0 &&
    furthestIndex < filterIndex &&
    stepIndex !== filterIndex;
  const canNext =
    step === 'provider' ? false : step === 'copy' ? address !== null : hasNext;

  const save = (next: EmailSetupProgressChange) => {
    setError(null);
    onSaveProgress(next).catch((saveError: unknown) =>
      setError(getErrorMessage(saveError, WORDS.progressFailed)),
    );
  };

  const goTo = (index: number) => {
    const stepId = steps[index] ?? 'provider';
    setView({ provider, stepId, startedAt });
    if (index > furthestIndex) save({ provider, stepId });
  };

  const pickProvider = (id: EmailProvider) => {
    setView({ provider: id, stepId: 'copy', startedAt });
    save({ provider: id, stepId: 'copy' });
  };

  const getAddress = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await onGetAddress();
    } catch (addressError) {
      setError(getErrorMessage(addressError, WORDS.addressFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const body = () => {
    if (step === 'provider') {
      return (
        <StepBody title={WORDS.providerTitle(words)}>
          <MethodPicker
            methods={EMAIL_PROVIDERS.map((id) => ({
              id,
              emoji: PROVIDER_ICONS[id],
              title: WORDS.providerLabels[id],
              description: WORDS.providerSubs[id],
              onPick: () => pickProvider(id),
            }))}
          />
        </StepBody>
      );
    }
    if (step === 'copy') {
      return (
        <StepBody title={WORDS.copyTitle(words)} lines={[words.copyLine]}>
          {address === null ? (
            <Button
              className='w-full'
              disabled={isBusy || intake === null}
              onClick={() => void getAddress()}
            >
              {WORDS.getAddress}
            </Button>
          ) : (
            <div className='border-border space-y-3 rounded-2xl border p-3'>
              <EmailAddressText
                address={address}
                className='text-base font-semibold'
              />
              <CopyTextButton
                text={address}
                label={WORDS.copyLabel}
                variant='secondary'
              />
            </div>
          )}
        </StepBody>
      );
    }
    if (step === 'forwarding') {
      const isYahoo = provider === 'yahoo';
      return (
        <StepBody
          title={
            isYahoo ? WORDS.yahooForwardingTitle : WORDS.gmailForwardingTitle
          }
          lines={
            isYahoo
              ? WORDS.yahooForwardingLines(words)
              : WORDS.gmailForwardingLines
          }
        >
          <ExternalLinkText
            href={isYahoo ? YAHOO_MAIL_URL : GMAIL_FORWARDING_URL}
            label={
              isYahoo ? WORDS.yahooForwardingLink : WORDS.gmailForwardingLink
            }
          />
        </StepBody>
      );
    }
    if (step === 'rule') {
      const rule =
        provider === 'outlook'
          ? {
              title: WORDS.ruleTitle(words),
              line: WORDS.outlookRuleLine(senderAddress),
              href: OUTLOOK_RULES_URL,
              label: WORDS.outlookRuleLink,
            }
          : provider === 'icloud'
            ? {
                title: WORDS.ruleTitle(words),
                line: WORDS.icloudRuleLine(senderAddress),
                href: ICLOUD_MAIL_URL,
                label: WORDS.icloudRuleLink,
              }
            : {
                title: WORDS.otherRuleTitle,
                line: WORDS.otherRuleLine(words, senderAddress),
                href: null,
                label: '',
              };
      return (
        <StepBody title={rule.title}>
          <SenderField
            words={words}
            value={senderText}
            onChange={setSenderText}
          />
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
      const filterText =
        senderAddress === null
          ? null
          : buildGmailFilterText(senderAddress, words.gmailSubjectWords);
      return (
        <StepBody title={WORDS.filterTitle(words)}>
          <SenderField
            words={words}
            value={senderText}
            onChange={setSenderText}
          />
          {filterText === null ? (
            <p className='text-muted-foreground text-sm'>
              {WORDS.filterNeedAddress}
            </p>
          ) : (
            <>
              <code className='bg-muted block rounded-lg px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap'>
                {filterText}
              </code>
              <p className='text-muted-foreground text-sm'>
                {WORDS.filterPaste(words)}
              </p>
              <div className='flex flex-wrap items-center gap-3'>
                <CopyTextButton
                  text={filterText}
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
        lines={[words.testLine]}
        isTicked={isTestReceived}
      >
        {isTestReceived ? (
          <p className='text-sm'>{words.testDone}</p>
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
                {WORDS.notArrivingLines(words).map((line) => (
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
    <div className='space-y-4'>
      {isFilterMissing && (
        <InlineNotice tone='warning'>
          <p>{WORDS.noFilterNotice(words)}</p>
          <Button
            className='mt-2'
            variant='secondary'
            size='sm'
            onClick={() => goTo(filterIndex)}
          >
            {WORDS.noFilterButton}
          </Button>
        </InlineNotice>
      )}
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
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
            <Button variant='tertiary' onClick={() => goTo(stepIndex - 1)}>
              {WORDS.back}
            </Button>
            {canNext && (
              <Button onClick={() => goTo(stepIndex + 1)}>{WORDS.next}</Button>
            )}
            {step === 'test' && !isTestReceived && (
              <Button variant='tertiary' onClick={onFinishLater}>
                {WORDS.finishLater}
              </Button>
            )}
            {step === 'test' && isTestReceived && (
              <Button onClick={onFinish}>{WORDS.done}</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailSetupWalkthrough;
