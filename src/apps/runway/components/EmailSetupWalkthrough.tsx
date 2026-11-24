import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleCheck, ExternalLink, Loader, Mail } from 'lucide-react';

import {
  GmailMark,
  ICloudMark,
  OutlookMark,
  ProtonMark,
  YahooMark,
} from '@/components/BrandMarks';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import InstructionSteps, {
  type Instruction,
} from '@/components/InstructionSteps';
import MethodPicker from '@/components/MethodPicker';
import StepGuide from '@/components/StepGuide';
import {
  EMAIL_SETUP_WORDS,
  EMAIL_WORDS,
  GMAIL_FILTERS_URL,
  GMAIL_FORWARDING_URL,
  GMAIL_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  PROTON_MAIL_URL,
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
  FilterFields,
  GmailFilterDownload,
  DisclosureLine,
} from '@apps/runway/components/EmailFilterParts';
import {
  getFilterFields,
  type FilterField,
} from '@apps/runway/utils/emailFilterFields';
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
  /** When the confirmation link was last tapped; null until then. */
  confirmOpenedAt: number | null;
  onConfirmOpened: () => void;
  /** Walked again from "Set it up again", so a filter or rule may already exist. */
  isRewalk?: boolean;
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

interface ShownStep {
  title: ReactNode;
  content?: ReactNode;
  /** Done in another app, so shown one at a time with the footer's primary moving on. */
  instructions?: Instruction[];
  after?: ReactNode;
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

const LATE_AFTER_MS = 120_000;

const useIsLate = () => {
  const [isLate, setIsLate] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLate(true), LATE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return isLate;
};

/** A spinner that lives only while its step is on screen: leaving ends it, coming back starts it fresh, and after a while it gives way to what to try. */
function Waiting({
  children,
  isLate,
  lateLine,
}: {
  children: ReactNode;
  isLate: boolean;
  lateLine: ReactNode;
}) {
  if (isLate) {
    return (
      <div className='text-muted-foreground space-y-1 text-sm' role='status'>
        {lateLine}
      </div>
    );
  }
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
  confirmOpenedAt: number | null;
  onOpened: () => void;
}

/** The link was tapped for the email that is here now; a newer email asks for the tap again. */
const isConfirmOpened = (
  confirmOpenedAt: number | null,
  confirmAt: number | null,
) =>
  confirmOpenedAt !== null &&
  confirmAt !== null &&
  confirmOpenedAt >= confirmAt;

const PROVIDER_SETTINGS_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  gmail: { href: GMAIL_FORWARDING_URL, label: WORDS.settingsLinkGmail },
  yahoo: { href: YAHOO_MAIL_URL, label: WORDS.yahooForwardingLink },
  proton: { href: PROTON_MAIL_URL, label: WORDS.protonRuleLink },
};

function ConfirmStep({
  provider,
  intake,
  isConfirmed,
  confirmOpenedAt,
  onOpened,
}: ConfirmStepProps) {
  const [isCodeShown, setIsCodeShown] = useState(false);
  const [isHelpShown, setIsHelpShown] = useState(false);
  const isLate = useIsLate();
  const settingsLink = PROVIDER_SETTINGS_LINKS[provider];
  const url =
    intake.confirm?.url?.startsWith('https://') === true
      ? intake.confirm.url
      : null;
  const code = intake.confirm?.code ?? null;
  const isCodeOnly = url === null && code !== null;
  const [isLanding] = useState(() => url === null && code === null);
  const isOpened = isConfirmOpened(confirmOpenedAt, intake.confirm?.at ?? null);
  const openConfirm = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    onOpened();
  };
  return (
    <div className='space-y-3'>
      {!isConfirmed && <Muted>{WORDS.confirmFirst(provider)}</Muted>}
      {url === null && code === null ? (
        <div className='space-y-2'>
          <Waiting
            isLate={isLate}
            lateLine={
              <>
                <p>{WORDS.confirmStillWaiting(provider)}</p>
                {settingsLink && (
                  <ExternalLinkText
                    href={settingsLink.href}
                    label={settingsLink.label}
                  />
                )}
              </>
            }
          >
            {WORDS.confirmWaiting(provider)}
          </Waiting>
          <DisclosureLine
            label={WORDS.didntArrive}
            isOpen={isHelpShown}
            onClick={() => setIsHelpShown(!isHelpShown)}
          />
          {isHelpShown && (
            <div className='space-y-2'>
              {WORDS.didntArriveLines(provider, isLate).map((line) => (
                <p key={line} className='text-muted-foreground text-sm'>
                  {line}
                </p>
              ))}
              {!isLate && settingsLink && (
                <ExternalLinkText
                  href={settingsLink.href}
                  label={settingsLink.label}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className={join(
            'space-y-3',
            isLanding && 'motion-safe:animate-[snackbar-in_200ms_ease-out]',
          )}
        >
          <p
            className='flex items-center gap-2 text-sm font-medium'
            role='status'
          >
            <CircleCheck
              className='text-success size-5 shrink-0'
              aria-hidden='true'
            />
            {WORDS.confirmArrived(provider)}
          </p>
          {url !== null && !isOpened && (
            <Button className='w-full' onClick={() => openConfirm(url)}>
              {WORDS.confirmButton(provider)}
            </Button>
          )}
          {url !== null && isOpened && (
            <p className='text-muted-foreground text-sm'>
              {WORDS.confirmOpened(provider)}{' '}
              <Button
                variant='link'
                size='stripped'
                className='text-primary! relative inline gap-1 text-sm after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[""]'
                onClick={() => openConfirm(url)}
              >
                {WORDS.confirmOpenAgain}
                <ExternalLink
                  className='ml-1 inline size-3.5 align-[-2px]'
                  aria-hidden='true'
                />
              </Button>
            </p>
          )}
          {code !== null && url !== null && (
            <DisclosureLine
              label={WORDS.linkFailed}
              isOpen={isCodeShown}
              onClick={() => setIsCodeShown(!isCodeShown)}
            />
          )}
          {code !== null && (isCodeShown || isCodeOnly) && (
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

function TestWaiting() {
  const [isShown, setIsShown] = useState(false);
  const isLate = useIsLate();
  return (
    <div className='space-y-2'>
      <Waiting isLate={isLate} lateLine={<p>{WORDS.testStillWaiting}</p>}>
        {WORDS.testWaiting}
      </Waiting>
      <DisclosureLine
        label={WORDS.notArriving}
        isOpen={isShown}
        onClick={() => setIsShown(!isShown)}
      />
      {isShown && (
        <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-sm'>
          {WORDS.notArrivingLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterClosedHelp({ fields }: { fields: FilterField[] }) {
  const [isShown, setIsShown] = useState(false);
  return (
    <div className='space-y-3'>
      <DisclosureLine
        label={WORDS.filterClosed}
        isOpen={isShown}
        onClick={() => setIsShown(!isShown)}
      />
      {isShown && (
        <>
          <p className='text-muted-foreground text-sm'>
            {WORDS.filterClosedLine}
          </p>
          <FilterFields fields={fields} />
        </>
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
  confirmOpenedAt,
  onConfirmOpened,
  isRewalk = false,
  onPickProvider,
  onGetAddress,
  onGo,
  onFinish,
  onClose,
  onExit,
  onActivity,
}: EmailSetupWalkthroughProps) {
  const [draft, setDraft] = useState<BankDraft | null>(null);
  const [isPickingBank, setIsPickingBank] = useState(isAddingBank);
  const [bankCountAtStart] = useState(banks.length);
  const [addressesAtStart] = useState(() => listBankAddresses(banks));
  const step = steps[stepIndex] ?? 'provider';
  const [place, setPlace] = useState({
    stepIndex,
    part: 0,
    isImporting: false,
  });
  const isHere = place.stepIndex === stepIndex;
  const canImport = isConfirmed && intake.address !== null;
  const isImporting = isHere && place.isImporting && canImport;
  const goTo = (index: number) => {
    setPlace({ stepIndex: index, part: 0, isImporting: false });
    onGo(index);
  };
  const setImporting = (next: boolean) =>
    setPlace({ stepIndex, part: 0, isImporting: next });
  const addressParts = (intake.address ?? '').split(/@(.*)/s);
  const hasNext = stepIndex < steps.length - 1;
  const addresses = listBankAddresses(banks);
  const runwayAddresses = intake.address === null ? [] : [intake.address];
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

  const saveDraft = () => {
    if (draft === null) return;
    const read = readBankDraft(draft, banks);
    if (read.bank === null) {
      setDraft({ ...draft, error: read.error });
      return;
    }
    onSaveBanks(addDraftedBank(read.bank)).catch(() => {
      setDraft({ ...draft, error: WORDS.banksSaveFailed });
      onActivity(true);
    });
    setDraft(null);
    setIsPickingBank(false);
    onActivity(false);
  };

  const bankFirst =
    addresses.length === 0 && bankIndex >= 0 ? (
      <div className='space-y-2'>
        <Muted>{WORDS.bankFirst}</Muted>
        <Button variant='secondary' size='sm' onClick={() => goTo(bankIndex)}>
          {WORDS.bankFirstButton}
        </Button>
      </div>
    ) : null;

  const body = (): ShownStep => {
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
        instructions: [
          { text: WORDS.yahooForwardingLink, href: YAHOO_MAIL_URL },
          { text: WORDS.yahooForwardingGo },
          {
            text: WORDS.yahooForwardingPaste,
            control: <Muted>{WORDS.yahooForwardingNote}</Muted>,
          },
        ],
      };
    }
    if (step === 'forwarding') {
      if (bankFirst !== null) {
        return { title: WORDS.gmailForwardingTitle, content: bankFirst };
      }
      return {
        title: WORDS.gmailForwardingTitle,
        instructions: [
          {
            text: WORDS.gmailForwardingOpen,
            control: (
              <ExternalLinkText
                href={GMAIL_URL}
                label={WORDS.gmailForwardingLink}
              />
            ),
          },
          {
            text: WORDS.gmailForwardingFill,
            control: (
              <FilterFields fields={getFilterFields('gmail', addresses)} />
            ),
          },
          { text: WORDS.gmailForwardingCreate },
          {
            text: WORDS.gmailForwardingAdd,
            control: (
              <>
                <RuleAddresses addresses={runwayAddresses} isShownForOne />
                <Muted>{WORDS.gmailForwardingNote}</Muted>
              </>
            ),
          },
        ],
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
          instructions: [
            {
              text: WORDS.protonRuleGo,
              control: (
                <>
                  <ExternalLinkText
                    href={PROTON_MAIL_URL}
                    label={WORDS.protonRuleLink}
                  />
                  <Muted>{WORDS.protonRuleNote}</Muted>
                </>
              ),
            },
            { text: WORDS.protonRulePaste },
            {
              text: WORDS.protonRuleCondition(addresses),
              control: <RuleAddresses addresses={addresses} />,
            },
            { text: WORDS.protonRuleSave },
          ],
        };
      }
      if (provider === 'outlook') {
        return {
          title: WORDS.outlookRuleTitle,
          instructions: [
            { text: WORDS.outlookRuleLink, href: OUTLOOK_RULES_URL },
            {
              text: WORDS.outlookRuleConditions,
              control: (
                <FilterFields fields={getFilterFields('outlook', addresses)} />
              ),
            },
            {
              text: WORDS.outlookRuleForward,
              control: (
                <RuleAddresses addresses={runwayAddresses} isShownForOne />
              ),
            },
          ],
        };
      }
      if (provider === 'icloud') {
        return {
          title: WORDS.icloudRuleTitle,
          instructions: [
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
              text: WORDS.icloudRuleConditions,
              control: (
                <FilterFields fields={getFilterFields('icloud', addresses)} />
              ),
            },
            {
              text: WORDS.icloudRuleForward,
              control: (
                <RuleAddresses addresses={runwayAddresses} isShownForOne />
              ),
            },
          ],
        };
      }
      return {
        title: WORDS.otherRuleTitle,
        instructions: [
          {
            text: WORDS.otherRuleLine(addresses),
            control: <RuleAddresses addresses={addresses} />,
          },
        ],
      };
    }
    if (step === 'confirm') {
      return {
        title: WORDS.confirmTitle,
        content: (
          <ConfirmStep
            provider={provider ?? 'other'}
            intake={intake}
            isConfirmed={isConfirmed}
            confirmOpenedAt={confirmOpenedAt}
            onOpened={onConfirmOpened}
          />
        ),
      };
    }
    if (step === 'filter') {
      if (bankFirst !== null) {
        return { title: WORDS.filterTitle, content: bankFirst };
      }
      if (isImporting) {
        return {
          title: WORDS.filterImportTitle,
          instructions: [
            {
              text: WORDS.filterImportDownloadStep,
              control: (
                <GmailFilterDownload
                  addresses={addresses}
                  forwardTo={intake.address ?? ''}
                />
              ),
            },
            { text: WORDS.filterImportLink, href: GMAIL_FILTERS_URL },
            { text: WORDS.filterImportChoose },
            { text: WORDS.filterImportCreate },
          ],
          after: (
            <DisclosureLine
              label={WORDS.filterByHand}
              onClick={() => setImporting(false)}
            />
          ),
        };
      }
      return {
        title: WORDS.filterTitle,
        instructions: [{ text: WORDS.filterPick }],
        after: (
          <div className='flex flex-col items-start gap-5'>
            <FilterClosedHelp fields={getFilterFields('gmail', addresses)} />
            {canImport && (
              <DisclosureLine
                label={WORDS.filterImportInstead}
                onClick={() => setImporting(true)}
              />
            )}
          </div>
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
            <TestWaiting />
          )}
        </div>
      ),
    };
  };

  const showBody = (): ShownStep => {
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
    if (!isRewalk) return shown;
    return {
      ...shown,
      after: (
        <>
          {shown.after}
          <Muted>{WORDS.alreadyMade}</Muted>
        </>
      ),
    };
  };
  const shown = showBody();
  const partCount = shown.instructions?.length ?? 0;
  const part = Math.min(isHere ? place.part : 0, Math.max(partCount - 1, 0));
  const isMidInstructions = part < partCount - 1;
  const content =
    shown.instructions === undefined ? (
      shown.content
    ) : (
      <div className='space-y-6'>
        <InstructionSteps items={shown.instructions} current={part} />
        {part === 0 && shown.after}
      </div>
    );

  const getPrimary = () => {
    if (step === 'provider') return undefined;
    if (isMidInstructions) {
      return {
        label: WORDS.partDone,
        onClick: () => {
          setPlace({ stepIndex, part: part + 1, isImporting });
          onActivity(false);
        },
      };
    }
    if (step === 'bank' && draft !== null) {
      return {
        label: WORDS.addThisBank(draft.name),
        onClick: saveDraft,
      };
    }
    if (step === 'bank' && isBankChoosing) return undefined;
    if (step === 'test') {
      return hasPurchase
        ? { label: WORDS.done, onClick: onFinish }
        : { label: WORDS.finishLater, onClick: onClose };
    }
    if (!hasNext) return undefined;
    const isConfirmOpenedNow =
      step === 'confirm' &&
      isConfirmOpened(confirmOpenedAt, intake.confirm?.at ?? null);
    const isConfirmShown =
      step === 'confirm' &&
      !isConfirmOpenedNow &&
      intake.confirm?.url?.startsWith('https://') === true;
    return {
      label: isConfirmOpenedNow
        ? WORDS.nextAfterConfirm(steps[stepIndex + 1])
        : WORDS.next,
      variant: isConfirmShown ? ('secondary' as const) : undefined,
      onClick: () => goTo(stepIndex + 1),
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
    if (part > 0) {
      setPlace({ stepIndex, part: part - 1, isImporting });
      return;
    }
    if (isImporting) {
      setImporting(false);
      return;
    }
    setPlace({ stepIndex: stepIndex - 1, part: Infinity, isImporting: false });
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
    (stepIndex > 0 ||
      part > 0 ||
      isImporting ||
      (step === 'bank' && (draft !== null || isPickingBank)));

  return (
    <StepGuide
      step={provider === null ? undefined : stepIndex + 1}
      stepCount={provider === null ? undefined : steps.length}
      title={shown.title}
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
