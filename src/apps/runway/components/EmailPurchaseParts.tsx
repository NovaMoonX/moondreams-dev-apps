import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  CalendarClock,
  Check,
  Filter,
  Hourglass,
  Mail,
  RotateCcw,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import InlineNotice from '@/components/InlineNotice';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import EmailFilterSheet from '@apps/runway/components/EmailFilterSheet';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import { EMAIL_KEEP_WAITING_DAYS } from '@apps/runway/constants';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  isOverdueEmail,
  selectPostedOnlySides,
  selectTwinnedEmailIds,
} from '@apps/runway/store/selectors/emailSelectors';
import { useAppSelector } from '@/store';
import {
  useEmailActions,
  useEmailEvents,
  useWaitingBank,
} from '@apps/runway/hooks/useEmailPurchases';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';

interface EmailPurchaseProps {
  purchase: OpenPurchase;
}

const useIsAddedByPerson = (purchase: OpenPurchase) => {
  const events = useEmailEvents();
  return events.some(
    (entry) =>
      entry.id === purchase.emailEventId && entry.addedByPersonAt !== null,
  );
};

/** The one quiet line on an emailed purchase's sheet: where it came from and, while it waits, that it merges on its own. */
export function EmailPurchaseNotice({ purchase }: EmailPurchaseProps) {
  const today = todayAsUtcDate();
  const twinned = useAppSelector(selectTwinnedEmailIds);
  const postedOnly = useAppSelector(selectPostedOnlySides);
  const bank = useWaitingBank(purchase);
  const isAddedByPerson = useIsAddedByPerson(purchase);
  if (purchase.source !== 'email') return null;
  if (isOverdueEmail(purchase, twinned, postedOnly, today)) {
    const days = Math.floor((today - purchase.date) / DAY_MS);
    return (
      <InlineNotice tone='warning'>
        <p>
          {purchase.storeEmail?.kind === 'order'
            ? EMAIL_WORDS.overdueOrderNotice(days)
            : EMAIL_WORDS.overdueNotice(days)}
        </p>
        {isAddedByPerson && (
          <p className='mt-1 text-xs'>{EMAIL_WORDS.drawerAddedByYou}</p>
        )}
      </InlineNotice>
    );
  }
  const isStore = purchase.storeEmail != null;
  const getText = () => {
    if (
      purchase.emailWaiting === true &&
      purchase.emailWaitUntil !== null &&
      purchase.emailWaitUntil >= today
    ) {
      return EMAIL_WORDS.drawerWaitingUntil(
        formatDateOrdinalUTC(purchase.emailWaitUntil),
        isStore,
      );
    }
    if (purchase.emailWaiting !== true) {
      return isStore
        ? EMAIL_WORDS.drawerFromStore
        : EMAIL_WORDS.drawerFromEmail;
    }
    if (bank.name === null) {
      return isStore
        ? EMAIL_WORDS.drawerStoreWaiting
        : EMAIL_WORDS.drawerWaiting;
    }
    if (bank.isPostedOnly)
      return EMAIL_WORDS.drawerPostedOnly(bank.name, isStore);
    return isStore
      ? EMAIL_WORDS.drawerStoreWaitingNamed(bank.name)
      : EMAIL_WORDS.drawerWaitingNamed(bank.name);
  };
  return (
    <InlineNotice tone='info' icon={Mail}>
      <p>{getText()}</p>
      {isAddedByPerson && (
        <p className='mt-1 text-xs'>{EMAIL_WORDS.drawerAddedByYou}</p>
      )}
    </InlineNotice>
  );
}

interface EmailPurchaseRowsProps extends EmailPurchaseProps {
  /** Shows a failure in the sheet that holds the rows. */
  onFailed: (message: string) => void;
}

/** The action rows an emailed purchase adds: filter out emails like it, keep waiting longer once it is overdue, and stop waiting for its bank's charge. */
export function EmailPurchaseRows({
  purchase,
  onFailed,
}: EmailPurchaseRowsProps) {
  const events = useEmailEvents();
  const actions = useEmailActions();
  const { addToast } = useToast();
  const twinned = useAppSelector(selectTwinnedEmailIds);
  const postedOnly = useAppSelector(selectPostedOnlySides);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isPickingWait, setIsPickingWait] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const today = todayAsUtcDate();
  const isOverdue = isOverdueEmail(purchase, twinned, postedOnly, today);
  const event =
    purchase.emailEventId === null
      ? null
      : (events.find((entry) => entry.id === purchase.emailEventId) ?? null);

  if (purchase.source !== 'email') return null;
  const waitUntil =
    purchase.emailWaiting === true &&
    purchase.emailWaitUntil !== null &&
    purchase.emailWaitUntil >= today
      ? purchase.emailWaitUntil
      : null;

  const stopWaiting = async () => {
    setIsBusy(true);
    try {
      await actions.stopWaiting(purchase.id);
      addToast({
        title: EMAIL_WORDS.stoppedWaiting,
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: EMAIL_WORDS.undo,
          onClick: () =>
            void actions.resumeWaiting(purchase.id).catch((error) =>
              addToast({
                title: getErrorMessage(error, EMAIL_WORDS.removeFailed),
                type: 'error',
              }),
            ),
        },
      });
    } catch (error) {
      onFailed(getErrorMessage(error, EMAIL_WORDS.removeFailed));
    } finally {
      setIsBusy(false);
    }
  };

  const keepWaiting = async (until: DateOnly | null) => {
    const before = purchase.emailWaitUntil;
    setIsPickingWait(false);
    try {
      await actions.setWaitUntil(purchase.id, until);
      addToast({
        title:
          until === null
            ? EMAIL_WORDS.usualWaitDone
            : EMAIL_WORDS.waitingUntil(formatDateOrdinalUTC(until)),
        type: 'success',
        duration: UNDO_WINDOW_MS,
        action: {
          label: EMAIL_WORDS.undo,
          onClick: () =>
            void actions
              .setWaitUntil(purchase.id, before, until)
              .catch((error) =>
                addToast({
                  title: getErrorMessage(error, EMAIL_WORDS.keepWaitingFailed),
                  type: 'error',
                }),
              ),
        },
      });
    } catch (error) {
      onFailed(getErrorMessage(error, EMAIL_WORDS.keepWaitingFailed));
    }
  };

  return (
    <>
      {event !== null && event.addedByPersonAt === null && (
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Filter />}
          label={EMAIL_WORDS.filterOut}
          subtitle={EMAIL_WORDS.filterOutRowSub}
          onClick={() => setIsFiltering(true)}
        />
      )}
      {(isOverdue || waitUntil !== null) && (
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<CalendarClock />}
          label={EMAIL_WORDS.keepWaiting}
          subtitle={
            waitUntil === null
              ? EMAIL_WORDS.keepWaitingSub
              : EMAIL_WORDS.keepWaitingSetSub(formatDateOrdinalUTC(waitUntil))
          }
          onClick={() => setIsPickingWait(true)}
        />
      )}
      {purchase.emailWaiting === true && (
        <ActionRow
          isGrouped
          isRoomy
          icon={<Hourglass />}
          label={EMAIL_WORDS.stopWaiting}
          subtitle={EMAIL_WORDS.stopWaitingSub}
          isDisabled={isBusy}
          onClick={() => void stopWaiting()}
        />
      )}
      <DetailSheet
        isOpen={isPickingWait}
        onClose={() => setIsPickingWait(false)}
        title={EMAIL_WORDS.keepWaitingTitle}
      >
        <ActionGroup isRoomy>
          {EMAIL_KEEP_WAITING_DAYS.map((days) => (
            <ActionRow
              key={days}
              isGrouped
              isRoomy
              icon={<CalendarClock />}
              label={EMAIL_WORDS.keepWaitingFor(days)}
              subtitle={EMAIL_WORDS.keepWaitingUntil(
                formatDateOrdinalUTC(today + days * DAY_MS),
              )}
              trailing={
                today + days * DAY_MS === waitUntil ? (
                  <Check
                    className='text-primary h-4 w-4'
                    aria-label={EMAIL_WORDS.chosenWait}
                  />
                ) : null
              }
              onClick={() => void keepWaiting(today + days * DAY_MS)}
            />
          ))}
          {waitUntil !== null && (
            <ActionRow
              isGrouped
              isRoomy
              icon={<RotateCcw />}
              label={EMAIL_WORDS.usualWait}
              subtitle={EMAIL_WORDS.usualWaitSub}
              onClick={() => void keepWaiting(null)}
            />
          )}
        </ActionGroup>
      </DetailSheet>
      {isFiltering && event !== null && (
        <EmailFilterSheet event={event} onClose={() => setIsFiltering(false)} />
      )}
    </>
  );
}
