import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CircleCheck,
  CircleHelp,
  ExternalLink,
  Loader,
  Mail,
} from 'lucide-react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  ProtonMark,
  YahooMark,
} from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import MethodPicker from '@/components/MethodPicker';
import StepGuide from '@/components/StepGuide';
import {
  EMAIL_SETUP_WORDS,
  EMAIL_WORDS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  PROTON_MAIL_URL,
  buildGmailFilterText,
  YAHOO_MAIL_URL,
} from '@apps/runway/components/emailWords';
import {
  BankAddresses,
  BankDraftForm,
  BankMark,
  BankPicker,
  ForwardingUpdate,
  RuleAddresses,
  type SaveBanks,
} from '@apps/runway/components/EmailBanksEditor';
import {
  addDraftedBank,
  findBankLogo,
  listBankAddresses,
  readBankDraft,
  type BankDraft,
} from '@apps/runway/utils/emailBanks';
import type { EmailIntakeRead } from '@apps/runway/hooks/useEmailPurchases';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank, EmailProvider } from '@apps/runway/types';
import type { EmailSetupStepId } from '@apps/runway/utils/emailSetupSteps';

const WORDS = EMAIL_SETUP_WORDS;
const PROVIDERS: EmailProvider[] = [
  'gmail',
  'outlook',
  'icloud',
  'yahoo',
  'proton',
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
  banks: EmailBank[];
  knownBanks: KnownBank[];
  onSaveBanks: SaveBanks;
  /** Opens the bank step on its choices, for adding one more bank. */
  isAddingBank?: boolean;
  onPickProvider: (provider: EmailProvider) => void;
  onGetAddress: () => void;
  onGo: (index: number) => void;
  onFinish: () => void;
  onClose: () => void;
  /** Leaves from the first step's Exit, asking first once the person has done something. */
  onExit: () => void;
  /** Something was picked, typed or saved; says whether a bank is half added. */
  onActivity: (isDrafting: boolean) => void;
}

const titled = (title: string, isTicked = false) => (
  <>
    {title}
    {isTicked && (
      <CircleCheck
        className='text-success ml-2 inline size-5 align-[-2px]'
        aria-label='Done'
      />
    )}
  </>
);

const Muted = ({ children }: { children: ReactNode }) => (
  <p className='text-muted-foreground text-sm'>{children}</p>
);

interface NumberedItem {
  text: ReactNode;
  /** A step that only opens a page is itself the link, so its words are never repeated under it. */
  href?: string;
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
            <p className='text-sm break-words'>
              {item.href === undefined ? (
                item.text
              ) : (
                <a
                  href={item.href}
                  target='_blank'
                  rel='noreferrer'
                  className='text-primary -my-2.5 inline-block py-2.5 font-medium hover:underline'
                >
                  {item.text}
                  <ExternalLink
                    className='ml-1 inline size-3.5 align-[-2px]'
                    aria-hidden='true'
                  />
                </a>
              )}
            </p>
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
  proton: { href: PROTON_MAIL_URL, label: WORDS.protonRuleLink },
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

const PROVIDER_ICONS: Record<EmailProvider, ReactNode> = {
  gmail: <GmailMark />,
  outlook: <OutlookMark />,
  icloud: <ICloudMark />,
  yahoo: <YahooMark />,
  proton: <ProtonMark />,
  other: <Mail className='size-5' />,
};

function EmailSetupWalkthrough({
  provider,
  steps,
  stepIndex,
  intake,
  isConfirmed,
  hasPurchase,
  isBusy,
  banks,
  knownBanks,
  onSaveBanks,
  isAddingBank = false,
  onPickProvider,
  onGetAddress,
  onGo,
  onFinish,
  onClose,
  onExit,
  onActivity,
}: EmailSetupWalkthroughProps) {
  const [isNotArrivingShown, setIsNotArrivingShown] = useState(false);
  const [draft, setDraft] = useState<BankDraft | null>(null);
  const [isPickingBank, setIsPickingBank] = useState(isAddingBank);
  const [bankCountAtStart] = useState(banks.length);
  const [addressesAtStart] = useState(() => listBankAddresses(banks));
  const [isSavingBank, setIsSavingBank] = useState(false);
  const step = steps[stepIndex] ?? 'provider';
  const addressParts = (intake.address ?? '').split(/@(.*)/s);
  const hasNext = stepIndex < steps.length - 1;
  const addresses = listBankAddresses(banks);
  const bankIndex = steps.indexOf('bank');
  const isBankChoosing =
    draft === null && (banks.length === 0 || isPickingBank);
  const isCoveredFirst = isAddingBank && banks.length === 0;
  const getBankTitle = () => {
    if (isCoveredFirst) return WORDS.coveredBankTitle;
    return banks.length === 0 ? WORDS.bankTitle : WORDS.addAnotherBank;
  };
  const bankTitle = getBankTitle();
  const changeDraft = (next: BankDraft | null) => {
    setDraft(next);
    onActivity(next !== null);
  };
  const getAddressesBefore = () => {
    if (bankCountAtStart > 0) return addressesAtStart;
    return banks[0]?.addresses ?? [];
  };
  const addressesBefore = getAddressesBefore();
  const addedAddresses = addresses.filter(
    (address) => !addressesBefore.includes(address),
  );

  const saveDraft = async () => {
    if (draft === null) return;
    const read = readBankDraft(draft, banks);
    if (read.bank === null) {
      setDraft({ ...draft, error: read.error });
      return;
    }
    setIsSavingBank(true);
    try {
      await onSaveBanks(addDraftedBank(read.bank));
      setDraft(null);
      setIsPickingBank(false);
      onActivity(false);
    } catch {
      setDraft({ ...draft, error: WORDS.banksSaveFailed });
    } finally {
      setIsSavingBank(false);
    }
  };

  const bankFirst =
    addresses.length === 0 && bankIndex >= 0 ? (
      <div className='space-y-2'>
        <Muted>{WORDS.bankFirst}</Muted>
        <Button variant='secondary' size='sm' onClick={() => onGo(bankIndex)}>
          {WORDS.bankFirstButton}
        </Button>
      </div>
    ) : null;

  const body = (): { title: ReactNode; content: ReactNode } => {
    if (step === 'provider') {
      return {
        title: WORDS.providerTitle,
        content: (
          <MethodPicker
            methods={PROVIDERS.map((id) => ({
              id,
              emoji: PROVIDER_ICONS[id],
              title: WORDS.providerLabels[id],
              description: WORDS.providerSubs[id],
              onPick: () => onPickProvider(id),
            }))}
          />
        ),
      };
    }
    if (step === 'copy') {
      return {
        title: WORDS.copyTitle,
        content: (
          <div className='space-y-3'>
            <Muted>{WORDS.copyLine}</Muted>
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
          </div>
        ),
      };
    }
    if (step === 'forwarding' && provider === 'yahoo') {
      return {
        title: WORDS.yahooForwardingTitle,
        content: (
          <div className='space-y-4'>
            <NumberedSteps
              items={[
                { text: WORDS.yahooForwardingLink, href: YAHOO_MAIL_URL },
                { text: WORDS.yahooForwardingGo },
                { text: WORDS.yahooForwardingPaste },
              ]}
            />
            <Muted>{WORDS.yahooForwardingNote}</Muted>
          </div>
        ),
      };
    }
    if (step === 'forwarding') {
      return {
        title: WORDS.gmailForwardingTitle,
        content: (
          <div className='space-y-4'>
            <NumberedSteps
              items={[
                {
                  text: WORDS.gmailForwardingLink,
                  href: GMAIL_FORWARDING_URL,
                },
                { text: WORDS.gmailForwardingChoose },
              ]}
            />
            <Muted>{WORDS.gmailForwardingNote}</Muted>
          </div>
        ),
      };
    }
    if (step === 'bank') {
      if (isBankChoosing) {
        return {
          title: bankTitle,
          content: (
            <div className='space-y-3'>
              <Muted>
                {isCoveredFirst ? WORDS.coveredBankLine : WORDS.bankLine}
              </Muted>
              <BankPicker
                known={knownBanks}
                banks={banks}
                onPick={changeDraft}
              />
            </div>
          ),
        };
      }
      if (draft !== null) {
        return {
          title: bankTitle,
          content: (
            <BankDraftForm
              draft={draft}
              known={knownBanks}
              onChange={changeDraft}
            />
          ),
        };
      }
      return {
        title: WORDS.banksTitle,
        content: (
          <div className='space-y-4'>
            {banks.map((bank) => (
              <div
                key={bank.id}
                className='border-border bg-card space-y-3 rounded-2xl border p-3'
              >
                <div className='flex items-center gap-3'>
                  <BankMark
                    name={bank.name}
                    logo={findBankLogo(knownBanks, bank.name)}
                  />
                  <p className='min-w-0 flex-1 font-semibold break-words'>
                    {bank.name}
                  </p>
                </div>
                <BankAddresses
                  bank={bank}
                  allAddresses={addresses}
                  onSave={onSaveBanks}
                />
              </div>
            ))}
            <Button
              variant='secondary'
              className='w-full gap-1.5'
              onClick={() => setIsPickingBank(true)}
            >
              {WORDS.addAnotherBank}
            </Button>
          </div>
        ),
      };
    }
    if (step === 'rule') {
      if (bankFirst !== null) {
        return { title: WORDS.otherRuleTitle, content: bankFirst };
      }
      if (provider === 'proton') {
        return {
          title: WORDS.protonRuleTitle,
          content: (
            <div className='space-y-4'>
              <Muted>{WORDS.protonRuleNote}</Muted>
              <NumberedSteps
                items={[
                  {
                    text: WORDS.protonRuleGo,
                    control: (
                      <ExternalLinkText
                        href={PROTON_MAIL_URL}
                        label={WORDS.protonRuleLink}
                      />
                    ),
                  },
                  { text: WORDS.protonRulePaste },
                  {
                    text: WORDS.protonRuleCondition(addresses),
                    control: <RuleAddresses addresses={addresses} />,
                  },
                  { text: WORDS.protonRuleSave },
                ]}
              />
            </div>
          ),
        };
      }
      if (provider === 'outlook') {
        return {
          title: WORDS.outlookRuleTitle,
          content: (
            <NumberedSteps
              items={[
                { text: WORDS.outlookRuleLink, href: OUTLOOK_RULES_URL },
                {
                  text: WORDS.outlookRuleLine(addresses),
                  control: <RuleAddresses addresses={addresses} />,
                },
              ]}
            />
          ),
        };
      }
      if (provider === 'icloud') {
        return {
          title: WORDS.icloudRuleTitle,
          content: (
            <NumberedSteps
              items={[
                {
                  text: WORDS.icloudRuleOpen,
                  control: (
                    <ExternalLinkText
                      href={ICLOUD_MAIL_URL}
                      label={WORDS.icloudRuleLink}
                    />
                  ),
                },
                {
                  text: WORDS.icloudRuleLine(addresses),
                  control: <RuleAddresses addresses={addresses} />,
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
            items={[
              {
                text: WORDS.otherRuleLine(addresses),
                control: <RuleAddresses addresses={addresses} />,
              },
            ]}
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
      if (bankFirst !== null) {
        return { title: WORDS.filterTitle, content: bankFirst };
      }
      const filterText = buildGmailFilterText(addresses);
      return {
        title: WORDS.filterTitle,
        content: (
          <NumberedSteps
            items={[
              {
                text: WORDS.filterCopy,
                control: (
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
                text: WORDS.filterPaste,
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
      title: titled(WORDS.testTitle, hasPurchase),
      content: (
        <div className='space-y-3'>
          <Muted>{WORDS.testLine}</Muted>
          {hasPurchase ? (
            <p className='text-sm'>{WORDS.testDone}</p>
          ) : (
            <div className='space-y-2'>
              <Waiting>{WORDS.testWaiting}</Waiting>
              {!isNotArrivingShown ? (
                <Button
                  variant='tertiary'
                  size='sm'
                  className='text-primary! -ml-2 gap-1.5'
                  aria-expanded={false}
                  onClick={() => setIsNotArrivingShown(true)}
                >
                  <CircleHelp className='size-4' aria-hidden='true' />
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
        </div>
      ),
    };
  };

  const getPrimary = () => {
    if (step === 'provider') return undefined;
    if (step === 'bank' && draft !== null) {
      return {
        label: WORDS.addThisBank(draft.name),
        onClick: () => void saveDraft(),
        isDisabled: isSavingBank,
      };
    }
    if (step === 'bank' && isBankChoosing) return undefined;
    if (step === 'test') {
      return hasPurchase
        ? { label: WORDS.done, onClick: onFinish }
        : { label: WORDS.finishLater, onClick: onClose };
    }
    if (!hasNext) return undefined;
    return {
      label: WORDS.next,
      onClick: () => onGo(stepIndex + 1),
      isDisabled: step === 'copy' && intake.address === null,
    };
  };

  const goBack = () => {
    if (step === 'bank' && (draft !== null || isPickingBank)) {
      setDraft(null);
      setIsPickingBank(isAddingBank && draft !== null);
      onActivity(false);
      return;
    }
    onGo(stepIndex - 1);
  };
  const isFirstPicker =
    step === 'bank' &&
    isAddingBank &&
    draft === null &&
    isPickingBank &&
    banks.length === bankCountAtStart;
  const canGoBack =
    !isFirstPicker &&
    (stepIndex > 0 || (step === 'bank' && (draft !== null || isPickingBank)));

  const showBody = (): { title: ReactNode; content: ReactNode } => {
    const shown = body();
    const isForwardingStep = step === 'filter' || step === 'rule';
    if (!isForwardingStep || bankFirst !== null || provider === null) {
      return shown;
    }
    if (isAddingBank) {
      return {
        title:
          step === 'filter' ? WORDS.updateFilterTitle : WORDS.updateRuleTitle,
        content: (
          <ForwardingUpdate
            provider={provider}
            addresses={addresses}
            added={addedAddresses}
            removed={[]}
          />
        ),
      };
    }
    return {
      title: shown.title,
      content: (
        <div className='space-y-4'>
          <Muted>{WORDS.alreadyMade}</Muted>
          {shown.content}
        </div>
      ),
    };
  };
  const { title, content } = showBody();
  return (
    <StepGuide
      step={provider === null ? undefined : stepIndex + 1}
      stepCount={provider === null ? undefined : steps.length}
      title={title}
      primary={getPrimary()}
      onBack={canGoBack ? goBack : undefined}
      backLabel={WORDS.backStep}
      onExit={onExit}
      exitLabel={WORDS.exitStep}
    >
      {content}
    </StepGuide>
  );
}

export default EmailSetupWalkthrough;
