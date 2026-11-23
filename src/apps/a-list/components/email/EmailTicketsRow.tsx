import { Mail } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useNow } from '@/hooks/useNow';
import { formatTimeAgo } from '@/lib/emailForwarding/timeAgo';
import {
  getEmailSetupSteps,
  resolveStepIndex,
} from '@/lib/emailForwarding/setupSteps';
import { useAppSelector } from '@/store';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  EMAIL_TICKETS_GATE_ID,
  EMAIL_TICKETS_TITLE,
} from '@apps/a-list/constants';
import {
  selectEmailIntake,
  selectEmailProgress,
  selectIsEmailLoaded,
} from '@apps/a-list/store/selectors';

/** The settings row that opens the email setup and status screen; nothing at all while the switch is closed. */
function EmailTicketsRow() {
  const isOpen = useIsGateOpen('a-list', EMAIL_TICKETS_GATE_ID);
  const { openOverlay } = useAListOverlay();
  const intake = useAppSelector(selectEmailIntake);
  const progress = useAppSelector(selectEmailProgress);
  const isLoaded = useAppSelector(selectIsEmailLoaded);
  const now = useNow(60_000);

  if (!isOpen) return null;

  const getSubtitle = () => {
    if (!isLoaded) return undefined;
    if (progress?.doneAt != null) {
      return intake?.lastReceivedAt == null
        ? EMAIL_FORWARDING_WORDS.noEmailsYet
        : EMAIL_FORWARDING_WORDS.workingSince(
            formatTimeAgo(intake.lastReceivedAt, now),
          );
    }
    if (progress?.provider == null) return 'Not set up yet';
    const steps = getEmailSetupSteps(
      progress.provider,
      intake !== null &&
        (intake.confirmUrl !== null || intake.confirmAt !== null),
    );
    return `Step ${resolveStepIndex(steps, progress.stepId) + 1} of ${steps.length}`;
  };

  return (
    <ActionGroup>
      <ActionRow
        isGrouped
        isRoomy
        hasChevron
        icon={<Mail />}
        label={EMAIL_TICKETS_TITLE}
        subtitle={getSubtitle()}
        onClick={() => openOverlay({ kind: 'emailTickets' })}
      />
    </ActionGroup>
  );
}

export default EmailTicketsRow;
