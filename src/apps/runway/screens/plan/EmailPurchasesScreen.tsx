import { useMemo, useState } from 'react';

import {
  Ban,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Filter,
  KeyRound,
  Landmark,
  Mail,
  Receipt,
  PackageX,
  Plus,
  Store,
  Trash2,
  type LucideIcon,
  Undo2,
} from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ActionRow from '@/components/ActionRow';
import EmailAddressText from '@/components/emailForwarding/EmailAddressText';
import EmailConfirmNotice from '@/components/emailForwarding/EmailConfirmNotice';
import EmailSetupView from '@/components/emailForwarding/EmailSetupView';
import FallbackImage from '@/components/FallbackImage';
import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useNow } from '@/hooks/useNow';
import { hasConfirmNotice } from '@/lib/emailForwarding/address';
import {
  isConfirmNoticeDue,
  readConfirmTapped,
  writeConfirmTapped,
} from '@/lib/emailForwarding/confirmNotice';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinal, formatTimeAgo } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import EmailRowBadge from '@apps/runway/components/EmailRowBadge';
import EmailEventSheet from '@apps/runway/components/EmailEventSheet';
import EmailSenderSheet from '@apps/runway/components/EmailSenderSheet';
import {
  EMAIL_WORDS,
  FILTER_FROM_WORDS,
  describeEmailFilter,
  describeEmailRowOutcome,
  stripForwardPrefix,
} from '@apps/runway/components/emailWords';
import ItemRow from '@apps/runway/components/ItemRow';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  EMAIL_ADDRESS_PREFIX,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  useEmailActions,
  useEmailEvents,
  useEmailFilters,
  useEmailIntake,
  useIsEmailEventsLoaded,
  usePurchaseBankLink,
} from '@apps/runway/hooks/useEmailPurchases';
import type {
  EmailEventRead,
  EmailFilterRead,
} from '@apps/runway/hooks/useEmailPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import {
  groupEmailSenders,
  isSenderFiltered,
  type EmailSender,
} from '@apps/runway/utils/emailSenders';

const ROWS_SHOWN = 5;
const CONFIRM_TAPPED_KEY = 'runway:email-confirm-tapped';

const OUTCOME_BADGES: Record<EmailEventRead['outcome'], LucideIcon> = {
  purchase: Receipt,
  filtered: Ban,
  unread: CircleHelp,
  confirm: Mail,
  notPurchase: Mail,
  notTracking: Mail,
  refund: Undo2,
  cancel: PackageX,
};

const KIND_BADGES: Record<EmailSender['kind'], LucideIcon> = {
  bank: Landmark,
  store: Store,
  other: Mail,
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
      className='text-muted-foreground relative -mr-2 gap-0.5 text-xs after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[""]'
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
        const rawSubject =
          stripForwardPrefix(event.subject) || EMAIL_WORDS.noSubject;
        const subject = mask(rawSubject);
        const detail = `${describeEmailRowOutcome(event.outcome)} · ${formatDateOrdinal(event.receivedAt)}`;
        return (
          <ItemRow
            key={event.id}
            name={subject}
            nameNode={<MaskedText>{rawSubject}</MaskedText>}
            leading={<EmailRowBadge icon={OUTCOME_BADGES[event.outcome]} />}
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

function SenderBadge({
  logo,
  kind,
}: {
  logo: string | null;
  kind: EmailSender['kind'];
}) {
  const badge = <EmailRowBadge icon={KIND_BADGES[kind]} />;
  if (logo === null) return badge;
  return (
    // Logos are drawn for a white ground, so the tile stays white in dark mode as a bank app's would.
    <FallbackImage
      src={logo}
      alt=''
      aria-hidden='true'
      className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
      fallback={badge}
    />
  );
}

interface SenderRowsProps {
  senders: EmailSender[];
  onOpen: (address: string) => void;
}

function SenderRows({ senders, onOpen }: SenderRowsProps) {
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {senders.map((sender) => {
        const detail = EMAIL_WORDS.senderDetail(
          sender.kind,
          sender.company?.toLowerCase() === sender.name?.toLowerCase()
            ? null
            : sender.company,
          sender.count,
          formatDateOrdinal(sender.lastAt),
        );
        return (
          <ItemRow
            key={sender.address}
            name={sender.name ?? sender.address}
            nameNode={
              sender.name ?? <EmailAddressText address={sender.address} />
            }
            nameLines={3}
            leading={<SenderBadge logo={sender.logo} kind={sender.kind} />}
            detail={detail}
            isPrivate={false}
            ariaLabel={`${sender.name ?? sender.address}, ${detail}. Open`}
            onOpen={() => onOpen(sender.address)}
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
            nameNode={
              filter.fromAddress === null ? undefined : (
                <>
                  {FILTER_FROM_WORDS}
                  <EmailAddressText address={filter.fromAddress} />
                </>
              )
            }
            leading={<EmailRowBadge icon={Filter} />}
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
  const [isAllSendersShown, setIsAllSendersShown] = useState(false);
  const [query, setQuery] = useState('');

  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const openFilter = filters.find((entry) => entry.id === openFilterId) ?? null;
  const bankLinkOf = usePurchaseBankLink();
  const allSenders = groupEmailSenders(events, bankLinkOf).flatMap(
    (group) => group.senders,
  );
  const senders = allSenders.filter(
    (sender) => !isSenderFiltered(filters, sender.address),
  );
  const shownSenders = isAllSendersShown
    ? senders
    : senders.slice(0, ROWS_SHOWN);
  const openSender =
    allSenders.find((entry) => entry.address === openSenderAddress) ?? null;
  const isOverStatus = isReopened || hasStarted;
  const isSetupShown =
    isOverStatus || (!intake.isLoading && intake.address === null);
  const pendingConfirm = intake.confirm;
  const confirmAt = pendingConfirm?.at ?? null;
  const isConfirmTappedBefore = useMemo(
    () => readConfirmTapped(CONFIRM_TAPPED_KEY, confirmAt),
    [confirmAt],
  );
  const shownConfirm =
    pendingConfirm !== null &&
    (pendingConfirm.autoConfirm !== 'confirmed' || isEventsLoaded) &&
    isConfirmNoticeDue(pendingConfirm, events, now, intake.forwardedAt)
      ? pendingConfirm
      : null;
  const isConfirmDrawn =
    shownConfirm !== null && hasConfirmNotice(shownConfirm);

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
          appName='Runway'
          setupLine={EMAIL_WORDS.setupLine}
          prefix={EMAIL_ADDRESS_PREFIX}
          address={intake.address}
          isLoading={intake.isLoading}
          isFailed={intake.isFailed}
          isBusy={isBusy}
          error={error}
          forwarding={{
            confirm: shownConfirm,
            isTapped:
              shownConfirm !== null &&
              (isConfirmTappedBefore || confirmTappedAt === shownConfirm.at),
            onConfirmTapped: () => {
              if (shownConfirm === null) return;
              writeConfirmTapped(CONFIRM_TAPPED_KEY, shownConfirm.at);
              setConfirmTappedAt(shownConfirm.at);
            },
            lastReceivedAt: intake.lastReceivedAt,
          }}
          onGetAddress={() => void getNewAddress()}
          onRetry={intake.retry}
          onDone={backToStatus}
        />
      ) : (
        <div className='space-y-6'>
          {shownConfirm !== null && (
            <EmailConfirmNotice
              appName='Runway'
              confirm={shownConfirm}
              isTapped={
                isConfirmTappedBefore || confirmTappedAt === shownConfirm.at
              }
              onConfirmTapped={() => {
                writeConfirmTapped(CONFIRM_TAPPED_KEY, shownConfirm.at);
                setConfirmTappedAt(shownConfirm.at);
              }}
            />
          )}
          {intake.lastReceivedAt !== null && (
            <p className='text-sm font-medium' role='status'>
              {(isConfirmDrawn
                ? EMAIL_WORDS.lastEmail
                : EMAIL_WORDS.workingSince)(
                formatTimeAgo(intake.lastReceivedAt, now, true),
              )}
            </p>
          )}
          {intake.address !== null && (
            <ActionRow
              isRoomy
              icon={<Plus />}
              label={EMAIL_WORDS.addAnother(events.length > 0)}
              subtitle={EMAIL_WORDS.addAnotherSub}
              hasChevron
              onClick={() => setIsReopened(true)}
            />
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
          {senders.length > 0 && (
            <ActionSection caption={EMAIL_WORDS.sendersCaption}>
              <div className='space-y-1'>
                <SenderRows
                  senders={shownSenders}
                  onOpen={setOpenSenderAddress}
                />
                {senders.length > ROWS_SHOWN && (
                  <Button
                    type='button'
                    variant='tertiary'
                    className='text-muted-foreground! h-auto min-h-10 w-full gap-1 text-sm font-normal'
                    onClick={() => setIsAllSendersShown((isShown) => !isShown)}
                  >
                    {isAllSendersShown
                      ? EMAIL_WORDS.showFewer
                      : EMAIL_WORDS.showMore(senders.length - ROWS_SHOWN)}
                    <ChevronDown
                      className={join(
                        'size-4',
                        isAllSendersShown && 'rotate-180',
                      )}
                      aria-hidden='true'
                    />
                  </Button>
                )}
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
          {intake.address !== null && (
            <div className='space-y-3'>
              {error && (
                <p className='text-destructive text-sm' role='alert'>
                  {error}
                </p>
              )}
              <ActionRow
                isDestructive
                icon={<KeyRound />}
                label={EMAIL_WORDS.newAddress}
                subtitle={EMAIL_WORDS.newAddressSub}
                isDisabled={isBusy}
                onClick={() => void getNewAddress()}
              />
            </div>
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
