import { useMemo, useState } from 'react';

import { ChevronRight, Filter, Forward, KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useNow } from '@/hooks/useNow';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import EmailConfirmNotice from '@apps/runway/components/EmailConfirmNotice';
import EmailEventSheet from '@apps/runway/components/EmailEventSheet';
import EmailSenderSheet from '@apps/runway/components/EmailSenderSheet';
import EmailSetupView from '@apps/runway/components/EmailSetupView';
import {
  EMAIL_WORDS,
  describeEmailFilter,
  describeEmailOutcome,
  stripForwardPrefix,
} from '@apps/runway/components/emailWords';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import {
  useEmailActions,
  useEmailEvents,
  useEmailFilters,
  useEmailIntake,
  useIsEmailEventsLoaded,
} from '@apps/runway/hooks/useEmailPurchases';
import type {
  EmailEventRead,
  EmailFilterRead,
} from '@apps/runway/hooks/useEmailPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  groupEmailSenders,
  type EmailSender,
} from '@apps/runway/utils/emailSenders';
import { formatUpdatedAgo } from '@apps/runway/utils/linkText';

const ROWS_SHOWN = 5;
const CONFIRM_TAPPED_KEY = 'runway:email-confirm-tapped';
const CONFIRM_NOTICE_DAYS = 7;
const DAY_MS = 86_400_000;

const readConfirmTapped = (confirmAt: number | null) => {
  try {
    return (
      confirmAt !== null &&
      localStorage.getItem(CONFIRM_TAPPED_KEY) === String(confirmAt)
    );
  } catch {
    return false;
  }
};

const writeConfirmTapped = (confirmAt: number) => {
  try {
    localStorage.setItem(CONFIRM_TAPPED_KEY, String(confirmAt));
  } catch {
    // Storage can be blocked; the notice then stays its seven days.
  }
};

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
        const subject = mask(
          stripForwardPrefix(event.subject) || EMAIL_WORDS.noSubject,
        );
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

interface SenderGroupsProps {
  senders: EmailSender[];
  kind: keyof typeof EMAIL_WORDS.senderKinds;
  onOpen: (address: string) => void;
}

function SenderRows({ senders, kind, onOpen }: SenderGroupsProps) {
  return (
    <div className='space-y-2'>
      <SectionDivider label={EMAIL_WORDS.senderKinds[kind]} />
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {senders.map((sender) => {
          const name = sender.name ?? sender.address;
          const detail = EMAIL_WORDS.senderDetail(
            sender.count,
            formatDateOrdinal(sender.lastAt),
          );
          return (
            <ItemRow
              key={sender.address}
              name={name}
              leading={<ItemBadge name={name} emoji={null} />}
              detail={detail}
              isPrivate={false}
              ariaLabel={`${name}, ${detail}. Open`}
              onOpen={() => onOpen(sender.address)}
            />
          );
        })}
      </ul>
    </div>
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

/** Where the person copies their private address and sees what has arrived, who sends it and the filters they made. */
function EmailPurchasesScreen({ onClose }: EmailPurchasesScreenProps) {
  const { confirm } = useActionModal();
  const intake = useEmailIntake();
  const events = useEmailEvents();
  const isEventsLoaded = useIsEmailEventsLoaded();
  const filters = useEmailFilters();
  const actions = useEmailActions();
  const now = useNow(60_000);
  const [isReopened, setIsReopened] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [confirmTappedAt, setConfirmTappedAt] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [openSenderAddress, setOpenSenderAddress] = useState<string | null>(
    null,
  );
  const [allList, setAllList] = useState<AllList | null>(null);
  const [query, setQuery] = useState('');

  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const openFilter = filters.find((entry) => entry.id === openFilterId) ?? null;
  const senderGroups = groupEmailSenders(events);
  const openSender =
    senderGroups
      .flatMap((group) => group.senders)
      .find((entry) => entry.address === openSenderAddress) ?? null;
  const isOverStatus = isReopened || hasStarted;
  const isSetupShown =
    isOverStatus || (!intake.isLoading && intake.address === null);
  const pendingConfirm = intake.confirm;
  const confirmAt = pendingConfirm?.at ?? null;
  const isConfirmTappedBefore = useMemo(
    () => readConfirmTapped(confirmAt),
    [confirmAt],
  );
  const getIsConfirmShown = (
    pendingConfirm: NonNullable<typeof intake.confirm>,
  ) => {
    if (pendingConfirm.autoConfirm === 'confirmed') {
      return (
        isEventsLoaded &&
        !events.some(
          (entry) =>
            entry.outcome !== 'confirm' && entry.receivedAt > pendingConfirm.at,
        )
      );
    }
    // A hand-forwarded email proves nothing about automatic forwarding, so only a tap or time ends the notice.
    return (
      !isConfirmTappedBefore &&
      confirmTappedAt !== pendingConfirm.at &&
      now < pendingConfirm.at + CONFIRM_NOTICE_DAYS * DAY_MS
    );
  };
  const shownConfirm =
    pendingConfirm !== null && getIsConfirmShown(pendingConfirm)
      ? pendingConfirm
      : null;

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
    const isKnownEmpty =
      !intake.isLoading && !intake.isFailed && intake.address === null;
    if (!isKnownEmpty) {
      const isAccepted = await confirm({
        title: EMAIL_WORDS.newAddressTitle,
        message: EMAIL_WORDS.newAddressMessage,
        confirmText: EMAIL_WORDS.newAddress,
        destructive: true,
      });
      if (!isAccepted) return;
    } else {
      setHasStarted(true);
    }
    await run(() => actions.rotateAddress(), EMAIL_WORDS.addressFailed);
  };

  const backToStatus = () => {
    setIsReopened(false);
    setHasStarted(false);
    setError(null);
  };

  const openAll = (list: AllList) => {
    setQuery('');
    setAllList(list);
  };

  const allCount = allList === 'events' ? events.length : filters.length;
  const needle =
    allCount >= RUNWAY_SEARCH_THRESHOLD ? query.trim().toLowerCase() : '';
  const matchedEvents = events.filter((entry) =>
    (stripForwardPrefix(entry.subject) + ' ' + entry.from)
      .toLowerCase()
      .includes(needle),
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
      onBack={isOverStatus ? backToStatus : undefined}
      headerAction={<ValuesEyeButton />}
    >
      {isSetupShown ? (
        <EmailSetupView
          address={intake.address}
          isLoading={intake.isLoading}
          isFailed={intake.isFailed}
          isBusy={isBusy}
          error={error}
          onGetAddress={() => void getNewAddress()}
          onRetry={intake.retry}
          onDone={backToStatus}
        />
      ) : (
        <div className='space-y-6'>
          {shownConfirm !== null && (
            <EmailConfirmNotice
              confirm={shownConfirm}
              onConfirmTapped={() => {
                writeConfirmTapped(shownConfirm.at);
                setConfirmTappedAt(shownConfirm.at);
              }}
            />
          )}
          {intake.lastReceivedAt !== null && (
            <p className='text-sm font-medium' role='status'>
              {EMAIL_WORDS.workingSince(
                formatUpdatedAgo(intake.lastReceivedAt, now),
              )}
            </p>
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
          {senderGroups.length > 0 && (
            <ActionSection caption={EMAIL_WORDS.sendersCaption}>
              <div className='space-y-4'>
                {senderGroups.map((group) => (
                  <SenderRows
                    key={group.kind}
                    kind={group.kind}
                    senders={group.senders}
                    onOpen={setOpenSenderAddress}
                  />
                ))}
              </div>
            </ActionSection>
          )}
          {intake.address !== null && (
            <div className='space-y-3'>
              <div className='border-border flex items-center justify-between gap-3 rounded-2xl border p-3'>
                <div className='min-w-0'>
                  <p className='text-muted-foreground text-xs'>
                    {EMAIL_WORDS.addressRow}
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
              {error && (
                <p className='text-destructive text-sm' role='alert'>
                  {error}
                </p>
              )}
              <ActionGroup>
                <ActionRow
                  isGrouped
                  icon={<Forward />}
                  label={EMAIL_WORDS.showHow}
                  subtitle={EMAIL_WORDS.showHowSub}
                  onClick={() => setIsReopened(true)}
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
            </div>
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
      {openSender && (
        <EmailSenderSheet
          sender={openSender}
          onClose={() => setOpenSenderAddress(null)}
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
