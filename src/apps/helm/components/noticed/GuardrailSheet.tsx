import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Ban, CalendarDays, Pause, PauseCircle, Undo2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
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
  useGuardrailDone,
  useGuardrailOthers,
  useGuardrailStartedName,
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

type SheetView = 'choices' | 'others';

interface BodyProps {
  pattern: OpenPattern;
  view: SheetView;
  onView: (view: SheetView) => void;
  onClose: () => void;
  onFindLater?: () => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function GuardrailBody({
  pattern,
  view,
  onView,
  onClose,
  onFindLater,
}: BodyProps) {
  const assistant = useAssistantName();
  const { dayKey } = useHabitClock();
  const answers = useGuardrailAnswers();
  const others = useGuardrailOthers(pattern);
  const name = useGuardrailSubjectName(pattern);
  const startedName = useGuardrailStartedName(pattern);
  const answered = useGuardrailDone(pattern);
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
    : HELM_COPY.guardrailPause(date);
  const noLabel = isTask
    ? readKeepDayLabel(pattern)
    : isStart
      ? HELM_COPY.guardrailStartNow
      : HELM_COPY.guardrailKeepGoing;
  const noSubtitle =
    isStart && !isTask
      ? HELM_COPY.guardrailStartNowSubtitle(startedName, noDate)
      : HELM_COPY.guardrailKeepGoingSubtitle(noDate, assistant);

  const done = (work: Promise<boolean>) =>
    void work.then((isSaved) => {
      if (isSaved) onClose();
    });

  if (view === 'others') {
    return (
      <div className='space-y-4'>
        <BackLink
          label={HELM_COPY.guardrailOthersBack}
          onBack={() => onView('choices')}
        />
        <p className='text-muted-foreground text-[14px] text-pretty'>
          {HELM_COPY.guardrailOthersHint(name)}
        </p>
        <div className='space-y-2'>
          {others.map((other) => (
            <ActionRow
              key={other.id}
              icon={<PauseCircle />}
              label={HELM_COPY.guardrailInstead(other.name, date)}
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
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      {!state.isAsking && (
        <p className='bg-muted/50 text-muted-foreground rounded-xl px-3 py-2.5 text-[14px] text-pretty'>
          {answered
            ? HELM_COPY.guardrailAnsweredSentence(
                answered.line,
                formatDateShort(pattern.stateAt),
              )
            : state.sentence}
        </p>
      )}
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
      {answered?.isUndoable && (
        <ActionRow
          icon={<Undo2 />}
          label={HELM_COPY.guardrailUndo}
          subtitle={HELM_COPY.guardrailUndoSubtitle(answered.name)}
          isDisabled={isBusy}
          onClick={() => void answers.undo(pattern, answered.name)}
        />
      )}
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
              subtitle={HELM_COPY.guardrailHoldSubtitle(date)}
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
          {!isTask && others.length > 0 && (
            <ActionRow
              icon={<PauseCircle />}
              label={HELM_COPY.guardrailOthers}
              subtitle={HELM_COPY.guardrailOthersSubtitle}
              hasChevron
              isDisabled={isBusy}
              onClick={() => onView('others')}
            />
          )}
          <Button
            type='button'
            variant='tertiary'
            className='text-muted-foreground h-auto min-h-11 w-full flex-col gap-0.5 py-2 text-center font-normal'
            disabled={isBusy}
            onClick={() => done(answers.keepGoing(pattern))}
          >
            <span className='text-[15px] font-medium'>{noLabel}</span>
            <span className='text-[13px] text-pretty'>{noSubtitle}</span>
          </Button>
        </div>
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
  const [shown, setShown] = useState<{ id: string | null; view: SheetView }>({
    id: null,
    view: 'choices',
  });
  const view = shown.id === patternId ? shown.view : 'choices';
  const setView = (next: SheetView) => setShown({ id: patternId, view: next });
  const close = () => {
    setView('choices');
    onClose();
  };
  return (
    <DetailSheet
      isOpen={pattern !== null}
      onClose={close}
      title={pattern?.statement ?? ''}
      viewKey={view}
    >
      {pattern && (
        <GuardrailBody
          pattern={pattern}
          view={view}
          onView={setView}
          onClose={close}
          onFindLater={onFindLater}
        />
      )}
    </DetailSheet>
  );
}

export default GuardrailSheet;
