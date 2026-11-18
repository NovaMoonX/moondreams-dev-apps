import { Ban, Check, Clock, Eraser, RotateCcw, Undo2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import {
  readNotNowWeeks,
  readStateWords,
  readYes,
} from '@apps/helm/components/noticed/patternWords';
import { usePatternAnswers } from '@apps/helm/components/noticed/usePatternAnswers';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  selectShownObservations,
  selectShownPatterns,
} from '@apps/helm/store/selectors/patternSelectors';
import type { OpenObservation, OpenPattern } from '@apps/helm/types';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

interface PatternSheetProps {
  patternId: string | null;
  onClose: () => void;
  /** The same place the card opens to make the change; where the sheet has none, a yes that needs it is left out. */
  onChange?: (onSaved: () => void) => void;
}

const ROWS_SHOWN = 8;

interface EvidenceRow {
  dayKey: string;
  words: string;
}

/** The days that made the pattern, newest first, each with what was done or the person's own words. */
const readEvidenceRows = (
  pattern: OpenPattern,
  observations: OpenObservation[],
): EvidenceRow[] => {
  const { evidence } = pattern;
  if (evidence.kind === 'occurrences')
    return [...evidence.dayKeys]
      .sort()
      .reverse()
      .map((dayKey) => ({
        dayKey,
        words:
          pattern.kind === 'doneOutsideWindow'
            ? HELM_COPY.noticedBasedOnOutside
            : HELM_COPY.noticedBasedOnDone,
      }));
  if (evidence.kind !== 'said') return [];
  const cited = observations.filter((one) =>
    evidence.observationIds.includes(one.id),
  );
  return [...evidence.dayKeys]
    .sort()
    .reverse()
    .map((dayKey) => {
      const quote = cited.find((one) => one.dayKey === dayKey)?.quote ?? null;
      return {
        dayKey,
        words: quote ? `“${quote}”` : HELM_COPY.noticedBasedOnSaid,
      };
    });
};

/** One pattern: what it is based on (days newest first, the person's own words when they said it), its state in words, and the answers named by what they do. Stopping it sits apart, below. */
function PatternSheet({ patternId, onClose, onChange }: PatternSheetProps) {
  const assistant = useAssistantName();
  const patterns = useAppSelector(selectShownPatterns);
  const observations = useAppSelector(selectShownObservations);
  const answers = usePatternAnswers();
  const pattern = patterns.find((one) => one.id === patternId) ?? null;
  const rows = pattern ? readEvidenceRows(pattern, observations) : [];
  const shown = rows.slice(0, ROWS_SHOWN);
  const state = pattern ? readStateWords(pattern, assistant) : null;
  const yes = pattern ? readYes(pattern) : null;
  const isAsked =
    pattern !== null &&
    pattern.offReason === null &&
    (pattern.state === 'suggested' || pattern.state === 'candidate');
  const isAskedNow =
    isAsked && pattern.state === 'suggested' && pattern.confirmedAt === null;
  const isSaid = pattern?.evidence.kind === 'said';
  const isTakenBackAble =
    pattern !== null &&
    pattern.state === 'accepted' &&
    pattern.acceptedBy === 'auto' &&
    pattern.undoneByExecutionId === null &&
    pattern.executionId !== null;
  const isEnded =
    pattern !== null &&
    (pattern.offReason !== null || pattern.state === 'retired');
  const isBusy = answers.busyId !== null;
  const weeks = pattern ? readNotNowWeeks(pattern) : null;

  const done = (work: Promise<boolean>) =>
    void work.then((isSaved) => {
      if (isSaved) onClose();
    });

  const first = pattern && (
    <div className='space-y-2'>
      {isAskedNow && yes && !yes.isDirect && onChange && (
        <ActionRow
          icon={<Check />}
          label={yes.label}
          subtitle={yes.subtitle ?? undefined}
          isDisabled={isBusy}
          onClick={() => {
            onClose();
            onChange(() => void answers.accept(pattern));
          }}
        />
      )}
      {isAskedNow && yes && yes.isDirect && (
        <ActionRow
          icon={<Check />}
          label={yes.label}
          subtitle={yes.subtitle ?? undefined}
          isDisabled={isBusy}
          onClick={() => done(answers.accept(pattern))}
        />
      )}
      {isAskedNow && pattern.handling === 'askOnly' && (
        <ActionRow
          icon={<Check />}
          label={HELM_COPY.noticedItsRight}
          subtitle={HELM_COPY.noticedItsRightSubtitle}
          isDisabled={isBusy}
          onClick={() => done(answers.confirm(pattern))}
        />
      )}
      {isAskedNow && pattern.handling !== 'askOnly' && (
        <ActionRow
          icon={<Clock />}
          label={HELM_COPY.noticedNotNow}
          subtitle={HELM_COPY.noticedNotNowSubtitle(weeks, assistant)}
          isDisabled={isBusy}
          onClick={() => done(answers.notNow(pattern))}
        />
      )}
      {isTakenBackAble && (
        <ActionRow
          icon={<Undo2 />}
          label={HELM_COPY.noticedTakeBack}
          subtitle={HELM_COPY.noticedTakeBackSubtitle}
          isDisabled={isBusy}
          onClick={() => done(answers.takeBack(pattern))}
        />
      )}
      {pattern.state === 'accepted' && !isTakenBackAble && (
        <ActionRow
          icon={<RotateCcw />}
          label={HELM_COPY.noticedNoLonger}
          subtitle={HELM_COPY.noticedNoLongerSubtitle}
          isDisabled={isBusy}
          onClick={() => done(answers.retire(pattern))}
        />
      )}
      {pattern.offReason !== null && (
        <ActionRow
          icon={<RotateCcw />}
          label={HELM_COPY.noticedStartAgain}
          subtitle={HELM_COPY.noticedStartAgainSubtitle}
          isDisabled={isBusy}
          onClick={() => done(answers.reopen(pattern))}
        />
      )}
    </div>
  );

  const hasApart = pattern && (isSaid || !isEnded);

  return (
    <DetailSheet
      isOpen={pattern !== null}
      onClose={onClose}
      title={pattern?.statement ?? ''}
    >
      {pattern && state && (
        <div className='space-y-5'>
          <p className='bg-muted/50 text-muted-foreground rounded-xl px-3 py-2.5 text-[14px] text-pretty'>
            {state.sentence}
          </p>
          {shown.length > 0 && (
            <section className='space-y-2'>
              <h3 className='text-muted-foreground text-[13px] font-medium'>
                {HELM_COPY.noticedBasedOn}
              </h3>
              <ul className='divide-border divide-y'>
                {shown.map((row) => (
                  <li key={row.dayKey} className='py-2 text-[15px] break-words'>
                    <span className='text-muted-foreground'>
                      {formatWeekdayDayUTC(Date.parse(row.dayKey))}
                    </span>
                    {` · ${row.words}`}
                  </li>
                ))}
              </ul>
              {rows.length > shown.length && (
                <p className='text-muted-foreground text-[13px]'>
                  {HELM_COPY.noticedBasedOnMore(rows.length - shown.length)}
                </p>
              )}
            </section>
          )}
          {first}
          {hasApart && (
            <div className='space-y-3 pt-4'>
              <SectionDivider label={HELM_COPY.noticedOtherChoices} />
              <div className='space-y-2'>
                {isSaid && pattern.evidence.kind === 'said' && (
                  <ActionRow
                    icon={<Eraser />}
                    label={HELM_COPY.noticedForgetWords}
                    subtitle={HELM_COPY.noticedForgetWordsSubtitle}
                    isDestructive
                    isDisabled={isBusy}
                    onClick={() =>
                      done(
                        answers.forgetWords(
                          pattern,
                          pattern.evidence.kind === 'said'
                            ? pattern.evidence.observationIds
                            : [],
                        ),
                      )
                    }
                  />
                )}
                {!isEnded && (
                  <ActionRow
                    icon={<Ban />}
                    label={HELM_COPY.noticedStop}
                    subtitle={HELM_COPY.noticedStopSubtitle}
                    isDestructive
                    isDisabled={isBusy}
                    onClick={() => done(answers.stop(pattern))}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default PatternSheet;
