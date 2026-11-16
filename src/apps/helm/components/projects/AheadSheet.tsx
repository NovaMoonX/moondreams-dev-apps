import { useId, useMemo, useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Lock } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import {
  MultiPillGroup,
  PillGroup,
  type PillOption,
} from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  pickResearchDepth,
  readResearchAllowance,
  readResearchArrival,
  RESEARCH_MONTHLY_CAP_CENTS,
  type ResearchDepth,
} from '@apps/helm/engine/research';
import {
  buildAheadBrief,
  type AheadOfferMeta,
  type LeadAnswer,
  type LeadQuestion,
} from '@apps/helm/engine/researchAhead';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  AheadAnsweredError,
  sendAheadOffer,
} from '@apps/helm/store/actions/aheadActions';
import type { AheadAsk, OpenProject } from '@apps/helm/types';
import { readThoroughLeft } from '@apps/helm/utils/researchWords';

interface AheadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  project: OpenProject;
  offer: AheadOfferMeta;
  ask: AheadAsk;
}

type Draft =
  | { kind: 'text'; text: string }
  | { kind: 'picks'; picks: string[] }
  | { kind: 'range'; min: string; max: string };

/** A pick question whose prefill names nothing among its options has nothing ticked, so it says nothing was filled. */
const settleQuestion = (question: LeadQuestion): LeadQuestion =>
  !question.from ||
  ((question.shape === 'pickOne' || question.shape === 'pickMany') &&
    !question.prefill.some((pick) => question.options.includes(pick)))
    ? { ...question, prefill: [], from: null }
    : question;

const toDollarsValue = (cents: number) =>
  cents % 100 === 0 ? String(cents / 100) : centsToInputValue(cents);

const toStartDraft = (question: LeadQuestion): Draft => {
  if (question.shape === 'text') {
    return { kind: 'text', text: question.prefill[0] ?? '' };
  }
  if (question.shape === 'amountRange') {
    const [min, max] = (question.prefill[0] ?? '').split('-').map(Number);
    return {
      kind: 'range',
      min: Number.isFinite(min) && min > 0 ? toDollarsValue(min) : '',
      max: Number.isFinite(max) && max > 0 ? toDollarsValue(max) : '',
    };
  }
  const picks = question.prefill.filter((pick) =>
    question.options.includes(pick),
  );
  return {
    kind: 'picks',
    picks: question.shape === 'pickOne' ? picks.slice(0, 1) : picks,
  };
};

const toAnswer = (draft: Draft): LeadAnswer => {
  if (draft.kind === 'text') {
    return draft.text.trim()
      ? { kind: 'text', text: draft.text.trim() }
      : { kind: 'skipped' };
  }
  if (draft.kind === 'picks') {
    return draft.picks.length > 0
      ? { kind: 'picks', picks: draft.picks }
      : { kind: 'skipped' };
  }
  const minCents = parseMoneyToCents(draft.min);
  const maxCents = parseMoneyToCents(draft.max);
  if (minCents === null && maxCents === null) return { kind: 'skipped' };
  return minCents !== null && maxCents !== null && minCents > maxCents
    ? { kind: 'range', minCents: maxCents, maxCents: minCents }
    : { kind: 'range', minCents, maxCents };
};

const toOptions = (options: string[]): PillOption<string>[] =>
  options.map((value) => ({ value, label: value }));

interface FromLineProps {
  question: LeadQuestion;
  assistant: string;
}

function FromLine({ question, assistant }: FromLineProps) {
  if (!question.from) return null;
  const words = question.isInferred
    ? HELM_COPY.aheadInferred(
        assistant,
        question.from.replace(/^inferred\s*·\s*/i, ''),
      )
    : question.from;
  return (
    <p className='text-muted-foreground flex items-start gap-2 text-[13px] text-pretty'>
      <span
        className={join(
          'mt-[5px] size-2 shrink-0 rounded-full border',
          question.isInferred
            ? 'border-muted-foreground'
            : 'border-muted-foreground bg-muted-foreground',
        )}
        aria-hidden='true'
      />
      <span className='min-w-0 break-words'>{words}</span>
    </p>
  );
}

interface DepthRowProps {
  title: string;
  line: string;
  isSelected: boolean;
  isLocked?: boolean;
  onPick: () => void;
}

function DepthRow({
  title,
  line,
  isSelected,
  isLocked,
  onPick,
}: DepthRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'border-border flex h-auto min-h-12 w-full items-start justify-start gap-3 rounded-xl border px-3.5 py-2.5 text-left font-normal',
        isSelected && !isLocked && 'border-primary bg-primary/5',
      )}
      role='radio'
      aria-checked={isSelected && !isLocked}
      onClick={isLocked ? undefined : onPick}
    >
      <span
        className={join(
          'mt-1 size-4 shrink-0 rounded-full border',
          isSelected && !isLocked
            ? 'border-primary border-[5px]'
            : 'border-muted-foreground',
        )}
        aria-hidden='true'
      />
      <span className='min-w-0 flex-1'>
        <span className='block text-[15px] leading-[21px] font-medium'>
          {title}
        </span>
        <span className='text-muted-foreground flex items-start gap-1.5 text-[13px] leading-[18px] text-pretty'>
          {isLocked && (
            <Lock className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
          )}
          <span className='min-w-0 break-words'>{line}</span>
        </span>
      </span>
    </Button>
  );
}

interface AheadFormProps extends Omit<AheadSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function AheadForm({
  project,
  offer,
  ask,
  onClose,
  requestClose,
  onDirtyChange,
}: AheadFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const fieldId = useId();
  const now = useNow(60_000);
  const profile = useAppSelector((state) => state.helm.profile);
  const timeZone = profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const questions = useMemo(
    () => ask.questions.map(settleQuestion),
    [ask.questions],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      questions.map((question) => [question.id, toStartDraft(question)]),
    ),
  );
  const allowance = readResearchAllowance(
    profile?.researchAllowance
      ? {
          month: profile.researchAllowance.month,
          cents:
            RESEARCH_MONTHLY_CAP_CENTS - profile.researchAllowance.leftCents,
        }
      : null,
    'thorough',
    now,
    timeZone,
  );
  const picked = pickResearchDepth({
    said: null,
    profileDefault: profile?.researchDepth ?? null,
    isDecision: ask.isDecision,
  });
  const isAsking = picked === 'ask';
  const [chosen, setChosen] = useState<ResearchDepth>('light');
  const depth: ResearchDepth = isAsking
    ? chosen
    : picked === 'thorough' && !allowance.canThorough
      ? 'light'
      : picked;
  const [isNow, setIsNow] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);

  const answers = useMemo(
    () =>
      Object.fromEntries(
        questions.map((question) => [
          question.id,
          toAnswer(drafts[question.id] ?? toStartDraft(question)),
        ]),
      ),
    [questions, drafts],
  );
  const brief = buildAheadBrief({
    subject: ask.subject,
    questions,
    answers,
    depth,
  });

  const change = (id: string, draft: Draft) => {
    setDrafts((current) => ({ ...current, [id]: draft }));
    onDirtyChange(true);
  };
  const pickDepth = (next: ResearchDepth) => {
    setChosen(next);
    onDirtyChange(true);
  };
  const changeNow = (next: boolean) => {
    setIsNow(next);
    onDirtyChange(true);
  };

  const send = async () => {
    if (!user || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    try {
      await sendAheadOffer(user.uid, {
        projectId: project.id,
        offerId: offer.id,
        ask,
        answers,
        brief,
        depth,
        isNow,
        assistantName: assistant,
      });
      addToast({
        title: HELM_COPY.aheadSent(
          ask.subject,
          HELM_COPY.aheadArrival[
            readResearchArrival(depth, isNow ? 'now' : 'later')
          ],
        ),
      });
      onClose();
    } catch (error) {
      console.error('Helm ahead research was not sent', error);
      isSendingRef.current = false;
      setIsSending(false);
      if (error instanceof AheadAnsweredError) {
        addToast({ title: HELM_COPY.aheadAlreadyAnswered, type: 'info' });
        onClose();
        return;
      }
      addToast({ title: HELM_COPY.aheadSendFailed, type: 'error' });
    }
  };

  const renderField = (question: LeadQuestion) => {
    const draft = drafts[question.id] ?? toStartDraft(question);
    const inputId = `${fieldId}-${question.id}`;
    return (
      <div key={question.id} className='space-y-1.5'>
        {draft.kind === 'text' && (
          <>
            <label htmlFor={inputId} className='text-sm font-medium'>
              {question.label}
            </label>
            <Input
              id={inputId}
              variant='outline'
              value={draft.text}
              maxLength={200}
              onChange={(event) =>
                change(question.id, { kind: 'text', text: event.target.value })
              }
            />
          </>
        )}
        {draft.kind === 'picks' && (
          <p className='text-sm font-medium'>{question.label}</p>
        )}
        {draft.kind === 'picks' && question.shape === 'pickOne' && (
          <PillGroup
            label={question.label}
            options={toOptions(question.options)}
            value={draft.picks[0] ?? null}
            onChange={(value) =>
              change(question.id, {
                kind: 'picks',
                picks: draft.picks[0] === value ? [] : [value],
              })
            }
          />
        )}
        {draft.kind === 'picks' && question.shape === 'pickMany' && (
          <MultiPillGroup
            label={question.label}
            options={toOptions(question.options)}
            values={draft.picks}
            showAll
            onChange={(picks) => change(question.id, { kind: 'picks', picks })}
          />
        )}
        {draft.kind === 'range' && (
          <>
            <p className='text-sm font-medium'>{question.label}</p>
            <div className='flex items-start gap-3'>
              <label className='min-w-0 flex-1 space-y-1'>
                <span className='text-muted-foreground block text-[13px]'>
                  {HELM_COPY.aheadMinField}
                </span>
                <MoneyInput
                  variant='outline'
                  ariaLabel={`${question.label}: ${HELM_COPY.aheadMinField}`}
                  placeholder={HELM_COPY.aheadMinField}
                  value={draft.min}
                  onChange={(min) => change(question.id, { ...draft, min })}
                />
              </label>
              <label className='min-w-0 flex-1 space-y-1'>
                <span className='text-muted-foreground block text-[13px]'>
                  {HELM_COPY.aheadMaxField}
                </span>
                <MoneyInput
                  variant='outline'
                  ariaLabel={`${question.label}: ${HELM_COPY.aheadMaxField}`}
                  placeholder={HELM_COPY.aheadMaxField}
                  value={draft.max}
                  onChange={(max) => change(question.id, { ...draft, max })}
                />
              </label>
            </div>
          </>
        )}
        <FromLine question={question} assistant={assistant} />
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.aheadOptional}
      </p>
      {questions.map(renderField)}
      {isAsking && (
        <div
          className='space-y-2'
          role='radiogroup'
          aria-label={HELM_COPY.aheadDepthLabel}
        >
          <p className='text-sm font-medium'>{HELM_COPY.aheadDepthLabel}</p>
          <DepthRow
            title={HELM_COPY.aheadDepthQuick}
            line={HELM_COPY.aheadDepthQuickLine}
            isSelected={chosen === 'light'}
            onPick={() => pickDepth('light')}
          />
          <DepthRow
            title={HELM_COPY.aheadDepthThorough}
            line={
              allowance.canThorough
                ? HELM_COPY.aheadDepthThoroughLine(
                    readThoroughLeft(
                      profile?.researchAllowance ?? null,
                      now,
                      timeZone,
                    ),
                  )
                : HELM_COPY.researchThoroughLocked(
                    formatDateUTC(allowance.resetOn),
                  )
            }
            isSelected={chosen === 'thorough'}
            isLocked={!allowance.canThorough}
            onPick={() => pickDepth('thorough')}
          />
        </div>
      )}
      <div className='border-border flex items-center justify-between gap-3 border-t pt-4'>
        <div className='min-w-0 flex-1'>
          <p className='text-[15px] font-medium'>{HELM_COPY.aheadStartNow}</p>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.aheadStartNowLine(
              isNow
                ? HELM_COPY.aheadArrival[readResearchArrival(depth, 'now')]
                : null,
            )}
          </p>
        </div>
        <AppToggle
          checked={isNow}
          onCheckedChange={changeNow}
          aria-label={HELM_COPY.aheadStartNow}
        />
      </div>
      <p className='text-muted-foreground text-[13px] text-pretty break-words'>
        <span className='text-foreground font-medium'>
          {HELM_COPY.aheadBriefLabel}
        </span>{' '}
        {brief}
      </p>
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSending}
          >
            {HELM_COPY.aheadCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSending} onClick={() => void send()}>
            {HELM_COPY.aheadSend}
          </Button>
        }
      />
    </div>
  );
}

/** The questions asked before a look ahead of a project: the brief as it will be sent, one optional field a question already filled from what is known, how deep when it matters, and Start now. */
function AheadSheet({ isOpen, onClose, project, offer, ask }: AheadSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.aheadSheetTitle(ask.subject)}
    >
      {isOpen && (
        <AheadForm
          project={project}
          offer={offer}
          ask={ask}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default AheadSheet;
