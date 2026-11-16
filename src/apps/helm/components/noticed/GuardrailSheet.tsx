import { useState } from 'react';

import { Ban, CalendarDays, Clock, Pause, PauseCircle } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import HabitPauseSheet from '@apps/helm/components/habits/HabitPauseSheet';
import {
  isHoldingStarted,
  isTaskGuardrail,
  readHoursSource,
  readPauseUntil,
  readReasonLines,
  readKeepDayLabel,
  toShortDay,
} from '@apps/helm/components/noticed/guardrailWords';
import { readStateWords } from '@apps/helm/components/noticed/patternWords';
import { useGuardrailAnswers } from '@apps/helm/components/noticed/useGuardrailAnswers';
import {
  useGuardrailOthers,
  useGuardrailSubjectName,
} from '@apps/helm/components/noticed/useGuardrailThings';
import { HELM_COPY, PATTERN_BACKOFF_WEEKS } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { selectShownPatterns } from '@apps/helm/store/selectors/patternSelectors';
import type { OpenPattern } from '@apps/helm/types';

interface GuardrailSheetProps {
  patternId: string | null;
  onClose: () => void;
  onFindLater?: () => void;
}

interface BodyProps {
  pattern: OpenPattern;
  onClose: () => void;
  onFindLater?: () => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function GuardrailBody({ pattern, onClose, onFindLater }: BodyProps) {
  const assistant = useAssistantName();
  const { dayKey } = useHabitClock();
  const answers = useGuardrailAnswers();
  const others = useGuardrailOthers(pattern);
  const name = useGuardrailSubjectName(pattern);
  const [isPicking, setIsPicking] = useState(false);
  const state = readStateWords(pattern, assistant);
  const reasons = readReasonLines(pattern);
  const source = readHoursSource(pattern);
  const date = toShortDay(readPauseUntil(pattern));
  const isTask = isTaskGuardrail(pattern);
  const isStart = pattern.moment === 'onStart';
  const isHold = isHoldingStarted(pattern);
  const isAsked =
    pattern.offReason === null &&
    pattern.state === 'suggested' &&
    pattern.confirmedAt === null;
  const isBusy = answers.busyId !== null;
  const weeks = PATTERN_BACKOFF_WEEKS[pattern.declineCount] ?? null;
  const noDate =
    weeks === null ? null : toShortDay(Date.parse(dayKey) + weeks * WEEK_MS);
  const pauseLabel = isHold
    ? HELM_COPY.guardrailHold(date)
    : isStart
      ? HELM_COPY.guardrailPauseNamed(name, date)
      : HELM_COPY.guardrailPause(date);
  const noLabel = isTask
    ? readKeepDayLabel(pattern)
    : isStart
      ? HELM_COPY.guardrailStartNow
      : HELM_COPY.guardrailKeepGoing;

  const done = (work: Promise<boolean>) =>
    void work.then((isSaved) => {
      if (isSaved) onClose();
    });

  return (
    <div className='space-y-5'>
      <p className='bg-muted/50 text-muted-foreground rounded-xl px-3 py-2.5 text-[14px] text-pretty'>
        {state.sentence}
      </p>
      <section className='space-y-2'>
        <h3 className='text-muted-foreground text-[13px] font-medium'>
          {HELM_COPY.noticedBasedOn}
        </h3>
        <ul className='divide-border divide-y'>
          {reasons.map(({ kind, line, Icon }) => (
            <li
              key={kind}
              className='flex items-start gap-2 py-2 text-[15px] break-words'
            >
              <Icon
                className='text-muted-foreground mt-1 size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='min-w-0'>{line}</span>
            </li>
          ))}
        </ul>
        {source && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {source}
          </p>
        )}
      </section>
      {isAsked && (
        <div className='space-y-2'>
          {isTask && onFindLater && (
            <ActionRow
              icon={<CalendarDays />}
              label={HELM_COPY.guardrailFindLater}
              subtitle={HELM_COPY.guardrailFindLaterSubtitle}
              hasChevron
              onClick={() => {
                onClose();
                onFindLater();
              }}
            />
          )}
          {!isTask && (
            <ActionRow
              icon={<Pause />}
              label={pauseLabel}
              subtitle={HELM_COPY.guardrailHoldSubtitle}
              isDisabled={isBusy}
              onClick={() => done(answers.pause(pattern, { isHold }))}
            />
          )}
          {!isTask && !isStart && (
            <ActionRow
              icon={<CalendarDays />}
              label={HELM_COPY.guardrailPickDay}
              subtitle={HELM_COPY.guardrailPickDaySubtitle}
              hasChevron
              isDisabled={isBusy}
              onClick={() => setIsPicking(true)}
            />
          )}
          <ActionRow
            icon={<Clock />}
            label={noLabel}
            subtitle={HELM_COPY.guardrailKeepGoingSubtitle(noDate, assistant)}
            isDisabled={isBusy}
            onClick={() => done(answers.keepGoing(pattern))}
          />
        </div>
      )}
      {isAsked && !isTask && others.length > 0 && (
        <section className='space-y-2'>
          <h3 className='text-muted-foreground text-[13px] font-medium'>
            {HELM_COPY.guardrailOthers}
          </h3>
          {others.map((other) => (
            <ActionRow
              key={other.id}
              icon={<PauseCircle />}
              label={HELM_COPY.guardrailInstead(other.name, date)}
              subtitle={HELM_COPY.guardrailInsteadSubtitle}
              isDisabled={isBusy}
              onClick={() =>
                done(
                  answers.pause(pattern, {
                    target: { collection: other.collection, id: other.id },
                  }),
                )
              }
            />
          ))}
        </section>
      )}
      {pattern.offReason === null && (
        <div className='space-y-3 pt-4'>
          <SectionDivider label={HELM_COPY.noticedOtherChoices} />
          <ActionRow
            icon={<Ban />}
            label={HELM_COPY.guardrailStop}
            subtitle={HELM_COPY.guardrailStopSubtitle(name)}
            isDestructive
            isDisabled={isBusy}
            onClick={() => done(answers.stop(pattern, name))}
          />
        </div>
      )}
      <HabitPauseSheet
        isOpen={isPicking}
        name={name}
        todayKey={dayKey}
        onClose={() => setIsPicking(false)}
        onPause={(picked) =>
          void answers.pause(pattern, { until: picked }).then((isSaved) => {
            if (!isSaved) return;
            setIsPicking(false);
            onClose();
          })
        }
      />
    </div>
  );
}

/** One guardrail opened: its reasons, the choices named by what they do, and stopping it, apart below. */
function GuardrailSheet({
  patternId,
  onClose,
  onFindLater,
}: GuardrailSheetProps) {
  const patterns = useAppSelector(selectShownPatterns);
  const pattern = patterns.find((one) => one.id === patternId) ?? null;
  return (
    <DetailSheet
      isOpen={pattern !== null}
      onClose={onClose}
      title={pattern?.statement ?? ''}
    >
      {pattern && (
        <GuardrailBody
          pattern={pattern}
          onClose={onClose}
          onFindLater={onFindLater}
        />
      )}
    </DetailSheet>
  );
}

export default GuardrailSheet;
