import { useEffect, useRef, useState } from 'react';

import {
  ChevronRight,
  Filter,
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useNow } from '@/hooks/useNow';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import EmailEventSheet from '@apps/runway/components/EmailEventSheet';
import EmailSetupWalkthrough from '@apps/runway/components/EmailSetupWalkthrough';
import {
  EMAIL_SETUP_WORDS,
  EMAIL_WORDS,
  describeEmailFilter,
  describeEmailOutcome,
} from '@apps/runway/components/emailWords';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import {
  useEmailActions,
  useEmailEvents,
  useEmailFilters,
  useEmailIntake,
  useEmailSetup,
  useKnownBanks,
  getBankArrival,
} from '@apps/runway/hooks/useEmailPurchases';
import type {
  EmailEventRead,
  EmailFilterRead,
} from '@apps/runway/hooks/useEmailPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { formatUpdatedAgo } from '@apps/runway/utils/linkText';
import {
  getAddBankSteps,
  getFilterStepIndex,
} from '@apps/runway/utils/emailSetupSteps';
import { BankMark } from '@apps/runway/components/EmailBanksEditor';
import { findBankLogo } from '@apps/runway/utils/emailBanks';
import EmailBankSheet from '@apps/runway/components/EmailBankSheet';

const ROWS_SHOWN = 5;

type AllList = 'events' | 'filters';

interface SeeAllButtonProps {
  label: string;
  onClick: () => void;
}

function SeeAllButton({ label, onClick }: SeeAllButtonProps) {
  return (
    <Button
      variant='tertiary'
      size='sm'
      className='text-muted-foreground -mr-2 gap-0.5 text-xs'
      onClick={onClick}
    >
      {label}
      <ChevronRight className='size-3.5' aria-hidden='true' />
    </Button>
  );
}

interface EventRowsProps {
  events: EmailEventRead[];
  onOpen: (id: string) => void;
}

function EventRows({ events, onOpen }: EventRowsProps) {
  const mask = useMaskedText();
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {events.map((event) => {
        const subject = mask(event.subject || EMAIL_WORDS.noSubject);
        const detail = `${describeEmailOutcome(event.outcome)} · ${formatDateOrdinal(event.receivedAt)}`;
        return (
          <ItemRow
            key={event.id}
            name={subject}
            leading={<ItemBadge name={subject} emoji={null} />}
            detail={detail}
            isPrivate={false}
            ariaLabel={`${subject}, ${detail}. Open`}
            onOpen={() => onOpen(event.id)}
          />
        );
      })}
    </ul>
  );
}

interface FilterRowsProps {
  filters: EmailFilterRead[];
  onOpen: (id: string) => void;
}

function FilterRows({ filters, onOpen }: FilterRowsProps) {
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {filters.map((filter) => {
        const words = describeEmailFilter(filter);
        return (
          <ItemRow
            key={filter.id}
            name={words.name}
            leading={
              <span className='border-border bg-accent grid size-10 shrink-0 place-items-center rounded-xl border'>
                <Filter className='size-5' aria-hidden='true' />
              </span>
            }
            detail={words.detail}
            isPrivate={false}
            ariaLabel={`${words.name}. Open`}
            onOpen={() => onOpen(filter.id)}
          />
        );
      })}
    </ul>
  );
}

interface EmailPurchasesScreenProps {
  onClose: () => void;
}

/** Where the person sets up forwarding, one step at a time, and where they come back to see it working: the emails that arrived and the filters they made. */
function EmailPurchasesScreen({ onClose }: EmailPurchasesScreenProps) {
  const { confirm } = useActionModal();
  const intake = useEmailIntake();
  const events = useEmailEvents();
  const filters = useEmailFilters();
  const actions = useEmailActions();
  const setup = useEmailSetup();
  const knownBanks = useKnownBanks();
  const now = useNow(60_000);
  const isWritten = useRef(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [isReopened, setIsReopened] = useState(false);
  const [walkBaseline, setWalkBaseline] = useState<{
    eventIds: Set<string>;
    confirmAt: number | null;
  } | null>(null);
  const [isKept, setIsKept] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [allList, setAllList] = useState<AllList | null>(null);
  const [addBankIndex, setAddBankIndex] = useState<number | null>(null);
  const [openBankId, setOpenBankId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const openBank = setup.banks.find((entry) => entry.id === openBankId) ?? null;
  const addBankSteps = getAddBankSteps(setup.provider);
  const isAddingBank = addBankIndex !== null;
  const openFilter = filters.find((entry) => entry.id === openFilterId) ?? null;
  const hasPurchase = events.some(
    (entry) =>
      entry.outcome === 'purchase' &&
      (walkBaseline === null || !walkBaseline.eventIds.has(entry.id)),
  );
  const confirmAt = intake.confirm?.at ?? null;
  const isConfirmed =
    confirmAt !== null &&
    (walkBaseline === null || confirmAt !== walkBaseline.confirmAt);
  const isWalking = !setup.isDone || isReopened || isKept;
  const walkSteps = isAddingBank ? addBankSteps : setup.steps;
  const stepIndex = isAddingBank
    ? Math.min(addBankIndex, addBankSteps.length - 1)
    : Math.min(viewIndex ?? setup.step, setup.steps.length - 1);
  const filterIndex = getFilterStepIndex(setup.steps);
  const hasStrayEmail = events.some(
    (entry) => entry.outcome === 'notPurchase' || entry.outcome === 'unread',
  );
  const isFilterMissing =
    !setup.isDone &&
    setup.provider !== null &&
    setup.provider !== 'yahoo' &&
    filterIndex >= 0 &&
    setup.step < filterIndex &&
    stepIndex !== filterIndex &&
    hasStrayEmail;

  useEffect(() => {
    if (!setup.isDone || !setup.isDoneUnwritten || isWritten.current) return;
    isWritten.current = true;
    actions.finishSetup().catch((finishError: unknown) => {
      isWritten.current = false;
      setError(getErrorMessage(finishError, EMAIL_WORDS.progressFailed));
    });
  }, [setup.isDone, setup.isDoneUnwritten, actions]);

  const run = async (work: () => Promise<void>, failure: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
    } catch (workError) {
      setError(getErrorMessage(workError, failure));
    } finally {
      setIsBusy(false);
    }
  };

  const getNewAddress = async () => {
    if (intake.address !== null) {
      const isConfirmed = await confirm({
        title: EMAIL_WORDS.newAddressTitle,
        message: EMAIL_WORDS.newAddressMessage,
        confirmText: EMAIL_WORDS.newAddress,
        destructive: true,
      });
      if (!isConfirmed) return;
    }
    await run(() => actions.rotateAddress(), EMAIL_WORDS.addressFailed);
  };

  const goToStep = (index: number) => {
    if (isAddingBank) {
      setAddBankIndex(index);
      return;
    }
    setViewIndex(index);
    setIsKept(true);
    actions
      .reachStep(setup.steps[index] ?? 'provider')
      .catch((reachError: unknown) =>
        setError(getErrorMessage(reachError, EMAIL_WORDS.progressFailed)),
      );
  };

  const keepBaseline = () =>
    setWalkBaseline({
      eventIds: new Set(events.map((entry) => entry.id)),
      confirmAt,
    });

  const backToStatus = () => {
    setIsReopened(false);
    setIsKept(false);
    setWalkBaseline(null);
    setViewIndex(null);
    setAddBankIndex(null);
  };

  const isOverStatus = isReopened || isAddingBank || (isKept && setup.isDone);

  const pickProvider = (
    provider: Parameters<typeof actions.chooseProvider>[0],
  ) => {
    setViewIndex(1);
    setIsKept(true);
    actions
      .chooseProvider(provider)
      .catch((pickError: unknown) =>
        setError(getErrorMessage(pickError, EMAIL_WORDS.progressFailed)),
      );
  };

  const openAll = (list: AllList) => {
    setQuery('');
    setAllList(list);
  };

  const allCount = allList === 'events' ? events.length : filters.length;
  const needle =
    allCount >= RUNWAY_SEARCH_THRESHOLD ? query.trim().toLowerCase() : '';
  const matchedEvents = events.filter((entry) =>
    (entry.subject + ' ' + entry.from).toLowerCase().includes(needle),
  );
  const matchedFilters = filters.filter((entry) => {
    const words = describeEmailFilter(entry);
    return `${words.name} ${words.detail ?? ''}`.toLowerCase().includes(needle);
  });

  const removeFilter = async (id: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await actions.deleteFilter(id);
      setOpenFilterId(null);
    } catch (removeError) {
      setError(getErrorMessage(removeError, EMAIL_WORDS.removeFailed));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Subview
      overlay
      title={EMAIL_WORDS.title}
      isTitleWrapped
      onClose={onClose}
      onBack={
        isWalking || isAddingBank
          ? isOverStatus
            ? backToStatus
            : onClose
          : undefined
      }
      headerAction={<ValuesEyeButton />}
    >
      {isWalking || isAddingBank ? (
        <div className='space-y-4'>
          {isFilterMissing && !isAddingBank && (
            <InlineNotice tone='warning'>
              <p>{EMAIL_SETUP_WORDS.noFilterNotice}</p>
              <Button
                className='mt-2'
                variant='secondary'
                size='sm'
                onClick={() => setViewIndex(filterIndex)}
              >
                {EMAIL_SETUP_WORDS.noFilterButton}
              </Button>
            </InlineNotice>
          )}
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          <EmailSetupWalkthrough
            key={isAddingBank ? 'add-bank' : 'setup'}
            provider={setup.provider}
            steps={walkSteps}
            stepIndex={stepIndex}
            intake={intake}
            isConfirmed={isConfirmed}
            hasPurchase={hasPurchase}
            isBusy={isBusy}
            banks={setup.banks}
            knownBanks={knownBanks}
            onSaveBanks={actions.saveBanks}
            isAddingBank={isAddingBank}
            onPickProvider={pickProvider}
            onGetAddress={() => void getNewAddress()}
            onGo={goToStep}
            onFinish={backToStatus}
            onClose={isOverStatus ? backToStatus : onClose}
          />
        </div>
      ) : (
        <div className='space-y-6'>
          <p className='text-sm font-medium' role='status'>
            {intake.lastReceivedAt === null
              ? EMAIL_SETUP_WORDS.noEmailsYet
              : EMAIL_SETUP_WORDS.workingSince(
                  formatUpdatedAgo(intake.lastReceivedAt, now),
                )}
          </p>
          {addBankSteps.length > 0 && (
            <ActionSection caption={EMAIL_SETUP_WORDS.banksTitle}>
              <div className='space-y-3'>
                {setup.banks.length === 0 && (
                  <p className='text-muted-foreground text-sm'>
                    {EMAIL_SETUP_WORDS.noBanksYet}
                  </p>
                )}
                {setup.banks.length > 0 && (
                  <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                    {setup.banks.map((bank) => {
                      const detail = `${EMAIL_SETUP_WORDS.arrival[getBankArrival(bank, events, now)]} · ${EMAIL_SETUP_WORDS.addressCount(bank.addresses.length)}`;
                      return (
                        <ItemRow
                          key={bank.id}
                          name={bank.name}
                          leading={
                            <BankMark
                              name={bank.name}
                              logo={findBankLogo(knownBanks, bank.name)}
                            />
                          }
                          detail={detail}
                          isPrivate={false}
                          ariaLabel={`${bank.name}, ${detail}. Open`}
                          onOpen={() => setOpenBankId(bank.id)}
                        />
                      );
                    })}
                  </ul>
                )}
                <Button
                  variant='secondary'
                  className='w-full gap-1.5'
                  onClick={() => {
                    keepBaseline();
                    setAddBankIndex(0);
                  }}
                >
                  <Plus className='size-4' aria-hidden='true' />
                  {EMAIL_SETUP_WORDS.addBank}
                </Button>
              </div>
            </ActionSection>
          )}
          {filters.length > 0 && (
            <ActionSection
              caption={EMAIL_WORDS.filtersCaption}
              action={
                filters.length > ROWS_SHOWN && (
                  <SeeAllButton
                    label={EMAIL_WORDS.seeAll}
                    onClick={() => openAll('filters')}
                  />
                )
              }
            >
              <FilterRows
                filters={filters.slice(0, ROWS_SHOWN)}
                onOpen={setOpenFilterId}
              />
            </ActionSection>
          )}
          <ActionSection
            caption={EMAIL_WORDS.eventsCaption}
            action={
              events.length > ROWS_SHOWN && (
                <SeeAllButton
                  label={EMAIL_WORDS.seeAll}
                  onClick={() => openAll('events')}
                />
              )
            }
          >
            {events.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {EMAIL_WORDS.noEvents}
              </p>
            ) : (
              <EventRows
                events={events.slice(0, ROWS_SHOWN)}
                onOpen={setOpenEventId}
              />
            )}
          </ActionSection>
          {intake.address !== null && (
            <div className='border-border flex items-center justify-between gap-3 rounded-2xl border p-3'>
              <div className='min-w-0'>
                <p className='text-muted-foreground text-xs'>
                  {EMAIL_SETUP_WORDS.addressRow}
                </p>
                <p className='text-sm select-all'>
                  <span className='break-all'>
                    {intake.address.split('@')[0]}@
                  </span>
                  <wbr />
                  <span className='whitespace-nowrap'>
                    {intake.address.split('@').slice(1).join('@')}
                  </span>
                </p>
              </div>
              <CopyTextButton
                text={intake.address}
                label='Copy'
                variant='tertiary'
                isCompact
              />
            </div>
          )}
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
          {intake.address !== null && (
            <ActionGroup>
              <ActionRow
                isGrouped
                icon={<RotateCcw />}
                label={EMAIL_SETUP_WORDS.setUpAgain}
                subtitle={EMAIL_SETUP_WORDS.setUpAgainSub}
                onClick={() => {
                  setIsReopened(true);
                  keepBaseline();
                  setViewIndex(0);
                }}
              />
              <ActionRow
                isGrouped
                icon={<KeyRound />}
                label={EMAIL_WORDS.newAddress}
                subtitle={EMAIL_WORDS.newAddressSub}
                isDisabled={isBusy}
                onClick={() => void getNewAddress()}
              />
            </ActionGroup>
          )}
        </div>
      )}
      {allList !== null && (
        <Subview
          overlay
          title={
            allList === 'events'
              ? EMAIL_WORDS.eventsCaption
              : EMAIL_WORDS.filtersCaption
          }
          onClose={() => setAllList(null)}
          headerAction={<ValuesEyeButton />}
        >
          <div className='space-y-3'>
            {allCount >= RUNWAY_SEARCH_THRESHOLD && (
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={
                  allList === 'events'
                    ? EMAIL_WORDS.searchEmails
                    : EMAIL_WORDS.searchFilters
                }
              />
            )}
            {allList === 'events' ? (
              <EventRows events={matchedEvents} onOpen={setOpenEventId} />
            ) : (
              <FilterRows filters={matchedFilters} onOpen={setOpenFilterId} />
            )}
          </div>
        </Subview>
      )}
      {openEvent && (
        <EmailEventSheet
          event={openEvent}
          onClose={() => setOpenEventId(null)}
        />
      )}
      {openBank && (
        <EmailBankSheet
          bank={openBank}
          banks={setup.banks}
          provider={setup.provider}
          knownBanks={knownBanks}
          arrival={getBankArrival(openBank, events, now)}
          onSaveBanks={actions.saveBanks}
          onClose={() => setOpenBankId(null)}
        />
      )}
      {openFilter && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={() => setOpenFilterId(null)}
          title={EMAIL_WORDS.filterTitle}
        >
          <div className='space-y-4 pb-4'>
            <div>
              <p className='text-lg font-semibold break-words'>
                {describeEmailFilter(openFilter).name}
              </p>
              {describeEmailFilter(openFilter).detail && (
                <p className='text-muted-foreground text-sm break-words'>
                  {describeEmailFilter(openFilter).detail}
                </p>
              )}
            </div>
            {error && (
              <p className='text-destructive text-sm' role='alert'>
                {error}
              </p>
            )}
            <ActionRow
              isRoomy
              isDestructive
              icon={<Trash2 />}
              label={EMAIL_WORDS.removeFilter}
              subtitle={EMAIL_WORDS.removeFilterSub}
              isDisabled={isBusy}
              onClick={() => void removeFilter(openFilter.id)}
            />
          </div>
        </FormSheet>
      )}
    </Subview>
  );
}

export default EmailPurchasesScreen;
