import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Filter, Hourglass, Mail } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import InlineNotice from '@/components/InlineNotice';
import { UNDO_WINDOW_MS } from '@/lib/undo';
import { getErrorMessage } from '@/utils/errorUtils';
import EmailFilterSheet from '@apps/runway/components/EmailFilterSheet';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import { DAY_MS, todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  isOverdueEmail,
  selectTwinnedEmailIds,
} from '@apps/runway/store/selectors/emailSelectors';
import { useAppSelector } from '@/store';
import {
  useEmailActions,
  useEmailEvents,
} from '@apps/runway/hooks/useEmailPurchases';
import type { OpenPurchase } from '@apps/runway/types';

interface EmailPurchaseProps {
  purchase: OpenPurchase;
}

/** The one quiet line on an emailed purchase's sheet: where it came from and, while it waits, that it merges on its own. */
export function EmailPurchaseNotice({ purchase }: EmailPurchaseProps) {
  const today = todayAsUtcDate();
  const twinned = useAppSelector(selectTwinnedEmailIds);
  if (purchase.source !== 'email') return null;
  if (isOverdueEmail(purchase, twinned, today)) {
    return (
      <InlineNotice tone='warning'>
        {EMAIL_WORDS.overdueNotice(
          Math.floor((today - purchase.date) / DAY_MS),
        )}
      </InlineNotice>
    );
  }
  return (
    <InlineNotice tone='info' icon={Mail}>
      <p>
        {purchase.storeEmail != null
          ? purchase.emailWaiting === true
            ? EMAIL_WORDS.drawerStoreWaiting
            : EMAIL_WORDS.drawerFromStore
          : purchase.emailWaiting === true
            ? EMAIL_WORDS.drawerWaiting
            : EMAIL_WORDS.drawerFromEmail}
      </p>
    </InlineNotice>
  );
}

interface EmailPurchaseRowsProps extends EmailPurchaseProps {
  /** Shows a failure in the sheet that holds the rows. */
  onFailed: (message: string) => void;
}

/** The action rows an emailed purchase adds: filter out emails like it, and stop waiting for its bank's charge. */
export function EmailPurchaseRows({
  purchase,
  onFailed,
}: EmailPurchaseRowsProps) {
  const events = useEmailEvents();
  const actions = useEmailActions();
  const { addToast } = useToast();
  const [isFiltering, setIsFiltering] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const event =
    purchase.emailEventId === null
      ? null
      : (events.find((entry) => entry.id === purchase.emailEventId) ?? null);

  if (purchase.source !== 'email') return null;

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

  return (
    <>
      {event !== null && (
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
      {isFiltering && event !== null && (
        <EmailFilterSheet event={event} onClose={() => setIsFiltering(false)} />
      )}
    </>
  );
}
