import { useState } from 'react';

import { Filter, Trash2 } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import FormSheet from '@/components/FormSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import EmailEventSheet from '@apps/runway/components/EmailEventSheet';
import {
  EMAIL_FILTER_TEXT,
  EMAIL_WORDS,
  GMAIL_FILTERS_URL,
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
} from '@apps/runway/hooks/useEmailPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';

const EVENTS_SHOWN = 8;

interface EmailPurchasesScreenProps {
  onClose: () => void;
}

/** Where the person sets up forwarding: their private address, three steps, the filters they made and the emails that arrived. */
function EmailPurchasesScreen({ onClose }: EmailPurchasesScreenProps) {
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const intake = useEmailIntake();
  const events = useEmailEvents();
  const filters = useEmailFilters();
  const actions = useEmailActions();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [isAllShown, setIsAllShown] = useState(false);

  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;
  const openFilter = filters.find((entry) => entry.id === openFilterId) ?? null;
  const shownEvents = isAllShown ? events : events.slice(0, EVENTS_SHOWN);
  const confirmUrl =
    intake.confirm?.url?.startsWith('https://') === true
      ? intake.confirm.url
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
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-6'>
        <ActionSection caption={EMAIL_WORDS.addressCaption}>
          {intake.address === null ? (
            <Button
              className='w-full'
              disabled={isBusy || intake.isLoading}
              onClick={() => void getNewAddress()}
            >
              {EMAIL_WORDS.getAddress}
            </Button>
          ) : (
            <div className='border-border space-y-3 rounded-2xl border p-3'>
              <p className='text-base font-semibold break-all select-all'>
                {intake.address}
              </p>
              <div className='flex flex-wrap items-center gap-2'>
                <CopyTextButton
                  text={intake.address}
                  label='Copy address'
                  variant={confirmUrl === null ? 'primary' : 'secondary'}
                />
                <Button
                  variant='tertiary'
                  disabled={isBusy}
                  onClick={() => void getNewAddress()}
                >
                  {EMAIL_WORDS.newAddress}
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
        </ActionSection>
        {confirmUrl !== null && (
          <div className='space-y-2'>
            <Button
              className='w-full'
              onClick={() =>
                window.open(confirmUrl, '_blank', 'noopener,noreferrer')
              }
            >
              {EMAIL_WORDS.confirmForwarding}
            </Button>
            {intake.confirm?.code && (
              <div className='flex items-center justify-between gap-3 text-sm'>
                <span className='text-muted-foreground'>
                  {EMAIL_WORDS.confirmCode}{' '}
                  <span className='text-foreground font-semibold tabular-nums'>
                    {intake.confirm.code}
                  </span>
                </span>
                <CopyTextButton
                  text={intake.confirm.code}
                  label='Copy code'
                  variant='tertiary'
                  isCompact
                />
              </div>
            )}
          </div>
        )}
        <ActionSection caption={EMAIL_WORDS.stepsCaption}>
          <ol className='space-y-3 text-sm'>
            {EMAIL_WORDS.steps.map((step, index) => (
              <li key={step} className='flex gap-3'>
                <span
                  className='bg-accent text-accent-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold'
                  aria-hidden='true'
                >
                  {index + 1}
                </span>
                <span className='min-w-0 flex-1 break-words'>
                  {step}
                  {index === 2 && (
                    <span className='mt-2 block space-y-2'>
                      <code className='bg-muted block rounded-lg px-2 py-1.5 text-xs break-all'>
                        {EMAIL_FILTER_TEXT}
                      </code>
                      <span className='flex flex-wrap items-center gap-3'>
                        <CopyTextButton
                          text={EMAIL_FILTER_TEXT}
                          label={EMAIL_WORDS.filterLabel}
                          variant='secondary'
                          isCompact
                        />
                        <ExternalLinkText
                          href={GMAIL_FILTERS_URL}
                          label={EMAIL_WORDS.gmailFilters}
                        />
                      </span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </ActionSection>
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
      </div>
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
