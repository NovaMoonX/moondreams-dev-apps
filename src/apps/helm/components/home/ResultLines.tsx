import { useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useOnceVisible } from '@apps/helm/hooks/useOnceVisible';
import {
  markAiNoticeSeen,
  markCaptureSeen,
} from '@apps/helm/store/actions/captureActions';
import type { OpenExecution } from '@apps/helm/types';
import { buildResultLines } from '@apps/helm/utils/resultLines';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';

interface ResultLinesProps {
  captureId: string;
  execution: OpenExecution;
  /** On home a turn is marked seen once its card is on screen, and the first one says that an AI service reads what is said. */
  isOnHome: boolean;
  isSeen: boolean;
  showsNotice: boolean;
}

const toSentence = (summary: string) => summary.replace(/[.!]*$/, '.');

function AiNotice() {
  const name = useAssistantName();
  const { user } = useAuth();
  const hasSeen = useAppSelector(
    (state) => state.helm.profile?.hasSeenAiNotice,
  );
  // Decided when the line first appears, so it stays while it is read and the profile then changes.
  const [isShown] = useState(hasSeen === false);
  const ref = useRef<HTMLParagraphElement>(null);
  useOnceVisible(ref, isShown && user !== null, async () => {
    if (!user) return;
    await markAiNoticeSeen(user.uid).catch((error: unknown) => {
      console.error('Helm AI notice was not marked seen', error);
      throw error;
    });
  });
  if (!isShown) return null;
  return (
    <p
      ref={ref}
      className='text-muted-foreground pl-[30px] text-[13px] text-pretty'
    >
      {HELM_COPY.aiNotice(name)}
    </p>
  );
}

/** What the assistant said about a turn and the compact card of what it did, one row per change. */
function ResultLines({
  captureId,
  execution,
  isOnHome,
  isSeen,
  showsNotice,
}: ResultLinesProps) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const tasksById = useAppSelector(selectOpenTasksById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const card = useRef<HTMLDivElement>(null);
  const lines = buildResultLines(execution, tasksById, timeZone, now);

  useOnceVisible(card, isOnHome && !isSeen && user !== null, async () => {
    if (!user) return;
    await markCaptureSeen(user.uid, captureId).catch((error: unknown) => {
      console.error('Helm turn was not marked seen', error);
      throw error;
    });
  });

  return (
    <div ref={card} className='flex w-full flex-col items-start gap-2'>
      {execution.isUnreadable ? (
        <p className='text-muted-foreground pl-[30px] text-[13px]'>
          {HELM_COPY.unreadable}
        </p>
      ) : (
        <>
          {execution.summary && (
            <AssistantLine>{toSentence(execution.summary)}</AssistantLine>
          )}
          {lines.length > 0 && (
            <ul
              aria-label={HELM_COPY.resultLabel}
              className='helm-card divide-border ml-[30px] w-[calc(100%-30px)] divide-y overflow-hidden'
            >
              {lines.map((line) => (
                <li key={line.key} className='px-3.5 py-2.5'>
                  <p className='text-[15px] leading-[21px] break-words'>
                    {line.title}
                  </p>
                  {line.detail && (
                    <p className='text-muted-foreground text-[13px] break-words'>
                      {line.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isOnHome && showsNotice && <AiNotice />}
        </>
      )}
    </div>
  );
}

export default ResultLines;
