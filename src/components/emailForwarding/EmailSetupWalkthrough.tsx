import { useState, type ReactNode } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { CircleCheck, Loader, Mail } from 'lucide-react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  ProtonMark,
  YahooMark,
} from '@/components/BrandMarks';
import ClearOfFooter from '@/components/ClearOfFooter';
import CopyTextButton from '@/components/CopyTextButton';
import { EmailAddressText } from '@/components/emailForwarding/EmailAddressRow';
import {
  EMAIL_FORWARDING_WORDS as WORDS,
  EMAIL_PROVIDERS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  PROTON_MAIL_URL,
  YAHOO_MAIL_URL,
  type EmailForwardingWords,
} from '@/components/emailForwarding/emailForwardingWords';
import ExternalLinkText from '@/components/ExternalLinkText';
import InlineNotice from '@/components/InlineNotice';
import MethodPicker from '@/components/MethodPicker';
import StepGuide from '@/components/StepGuide';
import Subview from '@/components/Subview';
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
  /** Set on a re-walk, so Back from the first step returns to the status screen; otherwise Back from the first step calls `onFinishLater`. */
  onBackToStatus?: (() => void) | null;
  /** The subview's title; default "Email setup". */
  title?: string;
  /** The end of the subview's title row, such as an app's masking eye. */
  headerAction?: ReactNode;
}

const titled = (title: string, isTicked = false) => (
  <>
    {title}
    {isTicked && (
      <CircleCheck
        className='text-success ml-2 inline size-5 align-[-2px]'
        aria-label={WORDS.done}
      />
    )}
  </>
);

const Muted = ({ children }: { children: ReactNode }) => (
  <p className='text-muted-foreground text-sm'>{children}</p>
);

interface NumberedItem {
  text: ReactNode;
  control?: ReactNode;
}

function NumberedSteps({ items }: { items: NumberedItem[] }) {
  return (
    <ol className='space-y-4'>
      {items.map((item, index) => (
        <li key={index} className='flex items-start gap-3'>
          <span
            className='bg-muted text-muted-foreground mt-px grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold'
            aria-hidden='true'
          >
            {index + 1}
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <p className='text-sm break-words'>{item.text}</p>
            {item.control}
          </div>
        </li>
      ))}
    </ol>
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
  proton: <ProtonMark />,
  other: <Mail className='size-5' />,
};

const PROVIDER_SETTINGS_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  gmail: { href: GMAIL_FORWARDING_URL, label: WORDS.gmailForwardingLink },
  yahoo: { href: YAHOO_MAIL_URL, label: WORDS.yahooForwardingLink },
  proton: { href: PROTON_MAIL_URL, label: WORDS.protonRuleLink },
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
    <div className='space-y-3'>
      {!isConfirmed && <Muted>{WORDS.confirmFirst(provider)}</Muted>}
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
    </div>
  );
}

interface SenderFieldProps {
  words: EmailForwardingWords;
  value: string;
  onChange: (value: string) => void;
}

function SenderField({ words, value, onChange }: SenderFieldProps) {
  return (
    <ClearOfFooter>
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
    </ClearOfFooter>
  );
}

/** Where a view of the walk stands: made by the person's own moves, dropped when a new walk begins. */
interface WalkView {
  provider: EmailProvider | null;
  stepId: EmailSetupStepId;
  startedAt: number | null;
}

/** The forwarding setup as an overlay subview of `StepGuide` steps: a progress bar, the step's title and content, one pinned primary and Back as the header arrow. The same walk for every app; the app's words come in `words`. Render it as the screen, not inside a card. */
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
  title = WORDS.setupTitle,
  headerAction,
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

  const senderField = (
    <SenderField words={words} value={senderText} onChange={setSenderText} />
  );
  const typed = { text: WORDS.senderLead(words), control: senderField };

  const body = (): { title: ReactNode; content: ReactNode } => {
    if (step === 'provider') {
      return {
        title: WORDS.providerTitle(words),
        content: (
          <MethodPicker
            methods={EMAIL_PROVIDERS.map((id) => ({
              id,
              emoji: PROVIDER_ICONS[id],
              title: WORDS.providerLabels[id],
              description: WORDS.providerSubs[id],
              onPick: () => pickProvider(id),
            }))}
          />
        ),
      };
    }
    if (step === 'copy') {
      return {
        title: WORDS.copyTitle(words),
        content: (
          <div className='space-y-3'>
            <Muted>{words.copyLine}</Muted>
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
          </div>
        ),
      };
    }
    if (step === 'forwarding') {
      const isYahoo = provider === 'yahoo';
      return {
        title: isYahoo
          ? WORDS.yahooForwardingTitle
          : WORDS.gmailForwardingTitle,
        content: (
          <div className='space-y-4'>
            <NumberedSteps
              items={
                isYahoo
                  ? [
                      {
                        text: WORDS.yahooForwardingOpen,
                        control: (
                          <ExternalLinkText
                            href={YAHOO_MAIL_URL}
                            label={WORDS.yahooForwardingLink}
                          />
                        ),
                      },
                      { text: WORDS.yahooForwardingGo },
                      { text: WORDS.yahooForwardingPaste },
                    ]
                  : [
                      {
                        text: WORDS.gmailForwardingOpen,
                        control: (
                          <ExternalLinkText
                            href={GMAIL_FORWARDING_URL}
                            label={WORDS.gmailForwardingLink}
                          />
                        ),
                      },
                      { text: WORDS.gmailForwardingChoose },
                    ]
              }
            />
            <Muted>
              {isYahoo
                ? WORDS.yahooForwardingNote(words)
                : WORDS.gmailForwardingNote}
            </Muted>
          </div>
        ),
      };
    }
    if (step === 'rule') {
      if (provider === 'proton') {
        return {
          title: WORDS.protonRuleTitle(words),
          content: (
            <div className='space-y-4'>
              <Muted>{WORDS.protonRuleNote}</Muted>
              <NumberedSteps
                items={[
                  typed,
                  {
                    text: WORDS.protonRuleSteps.go,
                    control: (
                      <ExternalLinkText
                        href={PROTON_MAIL_URL}
                        label={WORDS.protonRuleLink}
                      />
                    ),
                  },
                  { text: WORDS.protonRuleSteps.paste(words) },
                  { text: WORDS.protonRuleSteps.condition(senderAddress) },
                  { text: WORDS.protonRuleSteps.save(words) },
                ]}
              />
            </div>
          ),
        };
      }
      if (provider === 'outlook' || provider === 'icloud') {
        const isOutlook = provider === 'outlook';
        return {
          title: WORDS.ruleTitle(words),
          content: (
            <NumberedSteps
              items={[
                typed,
                {
                  text: isOutlook
                    ? WORDS.outlookRuleOpen
                    : WORDS.icloudRuleOpen,
                  control: (
                    <ExternalLinkText
                      href={isOutlook ? OUTLOOK_RULES_URL : ICLOUD_MAIL_URL}
                      label={
                        isOutlook ? WORDS.outlookRuleLink : WORDS.icloudRuleLink
                      }
                    />
                  ),
                },
                {
                  text: isOutlook
                    ? WORDS.outlookRuleLine(senderAddress)
                    : WORDS.icloudRuleLine(senderAddress),
                },
              ]}
            />
          ),
        };
      }
      return {
        title: WORDS.otherRuleTitle,
        content: (
          <NumberedSteps
            items={[typed, { text: WORDS.otherRuleLine(words, senderAddress) }]}
          />
        ),
      };
    }
    if (step === 'confirm') {
      return {
        title: titled(WORDS.confirmTitle, isConfirmed),
        content: (
          <ConfirmStep
            provider={provider ?? 'other'}
            intake={intake}
            isConfirmed={isConfirmed}
          />
        ),
      };
    }
    if (step === 'filter') {
      const filterText =
        senderAddress === null
          ? null
          : buildGmailFilterText(senderAddress, words.gmailSubjectWords);
      return {
        title: WORDS.filterTitle(words),
        content: (
          <NumberedSteps
            items={[
              typed,
              {
                text: WORDS.filterCopy,
                control:
                  filterText === null ? (
                    <Muted>{WORDS.filterNeedAddress}</Muted>
                  ) : (
                    <>
                      <code className='bg-muted block rounded-lg px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap'>
                        {filterText}
                      </code>
                      <CopyTextButton
                        text={filterText}
                        label={WORDS.filterLabel}
                        variant='secondary'
                        isCompact
                      />
                    </>
                  ),
              },
              {
                text: WORDS.filterPaste(words),
                control: (
                  <ExternalLinkText
                    href={GMAIL_FILTERS_URL}
                    label={WORDS.filterLink}
                  />
                ),
              },
            ]}
          />
        ),
      };
    }
    return {
      title: titled(WORDS.testTitle, isTestReceived),
      content: (
        <div className='space-y-3'>
          <Muted>{words.testLine}</Muted>
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
        </div>
      ),
    };
  };

  const getPrimary = () => {
    if (step === 'provider') return undefined;
    if (step === 'test') {
      return {
        label: WORDS.done,
        onClick: onFinish,
        isDisabled: !isTestReceived,
      };
    }
    if (!hasNext) return undefined;
    return {
      label: WORDS.next,
      onClick: () => goTo(stepIndex + 1),
      isDisabled: step === 'copy' && address === null,
    };
  };

  const leave = onBackToStatus ?? onFinishLater;
  const goBack = () => (stepIndex > 0 ? goTo(stepIndex - 1) : leave());

  const { title: stepTitle, content } = body();
  return (
    <Subview
      overlay
      title={title}
      isTitleWrapped
      onClose={leave}
      onBack={goBack}
      headerAction={headerAction}
    >
      <div className='flex flex-1 flex-col space-y-4'>
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
        <StepGuide
          step={provider === null ? undefined : stepIndex + 1}
          stepCount={provider === null ? undefined : steps.length}
          title={stepTitle}
          primary={getPrimary()}
          secondary={
            step === 'test' && !isTestReceived ? (
              <Button variant='tertiary' size='sm' onClick={onFinishLater}>
                {WORDS.finishLater}
              </Button>
            ) : undefined
          }
        >
          {content}
        </StepGuide>
      </div>
    </Subview>
  );
}

export default EmailSetupWalkthrough;
