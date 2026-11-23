import { useEffect, useRef, useState } from 'react';

import { Filter, KeyRound, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import InlineNotice from '@/components/InlineNotice';
import FormSheet from '@/components/FormSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
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
import {
  useEmailActions,
  useEmailEvents,
  useEmailFilters,
  useEmailIntake,
  useEmailSetup,
} from '@apps/runway/hooks/useEmailPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { formatUpdatedAgo } from '@apps/runway/utils/linkText';
import { getFilterStepIndex } from '@apps/runway/utils/emailSetupSteps';

const EVENTS_SHOWN = 8;

interface EmailPurchasesScreenProps {
  onClose: () => void;
}

/** Where the person sets up forwarding, one step at a time, and where they come back to see it working: the emails that arrived and the filters they made. */
function EmailPurchasesScreen({ onClose }: EmailPurchasesScreenProps) {
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const intake = useEmailIntake();
  const events = useEmailEvents();
  const filters = useEmailFilters();
  const actions = useEmailActions();
  const setup = useEmailSetup();
  const now = useNow(60_000);
  const isWritten = useRef(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [isReopened, setIsReopened] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [isAllShown, setIsAllShown] = useState(false);

  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const openFilter = filters.find((entry) => entry.id === openFilterId) ?? null;
  const shownEvents = isAllShown ? events : events.slice(0, EVENTS_SHOWN);
  const hasPurchase = events.some((entry) => entry.outcome === 'purchase');
  const isWalking = !setup.isDone || isReopened;
  const stepIndex = Math.min(viewIndex ?? setup.step, setup.steps.length - 1);
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
    actions.finishSetup().catch(() => {
      isWritten.current = false;
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
    setViewIndex(index);
    actions
      .reachStep(index)
      .catch((reachError: unknown) =>
        setError(getErrorMessage(reachError, EMAIL_WORDS.progressFailed)),
      );
  };

  const pickProvider = (
    provider: Parameters<typeof actions.chooseProvider>[0],
  ) => {
    setViewIndex(1);
    actions
      .chooseProvider(provider)
      .catch((pickError: unknown) =>
        setError(getErrorMessage(pickError, EMAIL_WORDS.progressFailed)),
      );
  };

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
      headerAction={<ValuesEyeButton />}
    >
      {isWalking ? (
        <div className='space-y-4'>
          {isFilterMissing && (
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
            provider={setup.provider}
            steps={setup.steps}
            stepIndex={stepIndex}
            intake={intake}
            hasPurchase={hasPurchase}
            isBusy={isBusy}
            onPickProvider={pickProvider}
            onGetAddress={() => void getNewAddress()}
            onGo={goToStep}
            onFinish={() => {
              setIsReopened(false);
              setViewIndex(null);
            }}
          />
        </div>
      ) : (
        <div className='space-y-6'>
          <p className='text-sm font-medium' role='status'>
            {intake.lastReceivedAt === null
              ? EMAIL_SETUP_WORDS.working
              : EMAIL_SETUP_WORDS.workingSince(
                  formatUpdatedAgo(intake.lastReceivedAt, now),
                )}
          </p>
          {filters.length > 0 && (
            <ActionSection caption={EMAIL_WORDS.filtersCaption}>
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
                      onOpen={() => setOpenFilterId(filter.id)}
                    />
                  );
                })}
              </ul>
            </ActionSection>
          )}
          <ActionSection caption={EMAIL_WORDS.eventsCaption}>
            {events.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {EMAIL_WORDS.noEvents}
              </p>
            ) : (
              <>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {shownEvents.map((event) => {
                    const subject = mask(
                      event.subject || EMAIL_WORDS.noSubject,
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
                        onOpen={() => setOpenEventId(event.id)}
                      />
                    );
                  })}
                </ul>
                {events.length > EVENTS_SHOWN && (
                  <ShowMoreButton
                    isOpen={isAllShown}
                    onClick={() => setIsAllShown((current) => !current)}
                  >
                    {isAllShown
                      ? 'Show fewer'
                      : `Show ${events.length - EVENTS_SHOWN} more`}
                  </ShowMoreButton>
                )}
              </>
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
      {openEvent && (
        <EmailEventSheet
          event={openEvent}
          onClose={() => setOpenEventId(null)}
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
