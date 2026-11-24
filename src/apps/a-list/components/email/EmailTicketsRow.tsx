import SettingsRow from '@/components/SettingsRow';
import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/utils/formatUtils';
import { useAppSelector } from '@/store';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  EMAIL_TICKETS_GATE_ID,
  EMAIL_TICKETS_TITLE,
} from '@apps/a-list/constants';
import {
  selectEmailIntake,
  selectIsEmailLoaded,
} from '@apps/a-list/store/selectors';

/** The settings row that opens the email setup and status screen; nothing at all while the switch is closed. */
function EmailTicketsRow() {
  const isOpen = useIsGateOpen('a-list', EMAIL_TICKETS_GATE_ID);
  const { openOverlay } = useAListOverlay();
  const intake = useAppSelector(selectEmailIntake);
  const isLoaded = useAppSelector(selectIsEmailLoaded);
  const now = useNow(60_000);

  if (!isOpen) return null;

  const getSubtitle = () => {
    if (!isLoaded) return undefined;
    if (intake === null) return 'Not set up yet';
    return intake.lastReceivedAt === null
      ? EMAIL_FORWARDING_WORDS.noEmailsYet
      : EMAIL_FORWARDING_WORDS.workingSince(
          formatTimeAgo(intake.lastReceivedAt, now, true),
        );
  };

  return (
    <SettingsRow
      icon='📬'
      title={EMAIL_TICKETS_TITLE}
      description={getSubtitle()}
      hasChevron
      onClick={() =>
        openOverlay({ kind: 'emailTickets', returnTo: 'membership' })
      }
    />
  );
}

export default EmailTicketsRow;
