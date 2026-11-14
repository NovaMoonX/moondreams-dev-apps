import { useMemo, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { store, useAppSelector } from '@/store';
import KeptMediaSection from '@apps/helm/components/media/KeptMediaSection';
import QuestionCard from '@apps/helm/components/home/QuestionCard';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { FACT_STATEMENT_MAX, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { closeQuestion } from '@apps/helm/store/actions/captureActions';
import {
  confirmFact,
  correctFact,
  forgetFact,
  type FactChange,
} from '@apps/helm/store/actions/memoryActions';
import { selectHeldItems } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenFact } from '@apps/helm/types';
import { getOpenQuestions, isLeft } from '@apps/helm/utils/heldCaptures';
import {
  getDisputePartner,
  getFactQuote,
  getFactSource,
  toFactDay,
} from '@apps/helm/utils/factLines';
import PrivateRow from '@apps/helm/components/privacy/PrivateRow';

interface FactSheetProps {
  factId: string | null;
  onClose: () => void;
}

/** The facts this one replaced, newest first: the one its `supersedesId` names and every fact whose `supersededById` names it, followed back the same way. */
const getEarlier = (fact: OpenFact, facts: OpenFact[]) => {
  const walk = (current: OpenFact, seen: Set<string>): OpenFact[] =>
    [
      ...new Set(
        [
          facts.find((entry) => entry.id === current.supersedesId),
          ...facts.filter((entry) => entry.supersededById === current.id),
        ].filter((entry): entry is OpenFact => entry !== undefined),
      ),
    ]
      .filter((entry) => !seen.has(entry.id))
      .sort((a, b) => (b.supersededAt ?? 0) - (a.supersededAt ?? 0))
      .flatMap((entry) => [
        entry,
        ...walk(entry, new Set([...seen, entry.id])),
      ]);
  return walk(fact, new Set([fact.id]));
};

/** One fact: its words, who stands behind it, the words it came from and what it replaced. An inferred fact can be confirmed, any fact corrected or forgotten, each with an Undo. */
function FactSheet({ factId, onClose }: FactSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const facts = useAppSelector((state) => state.helm.facts.items);
  const fact = facts.find((entry) => entry.id === factId) ?? null;
  const shown = fact && fact.status !== 'superseded' ? fact : null;
  const [draft, setDraft] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [neitherText, setNeitherText] = useState('');
  const held = useAppSelector(selectHeldItems);
  const now = useNow(60_000);
  const earlier = useMemo(
    () => (shown ? getEarlier(shown, facts) : []),
    [shown, facts],
  );
  const partner = shown ? getDisputePartner(shown, facts) : null;
  const settling =
    shown && partner
      ? held.needsYou.flatMap((item) =>
          getOpenQuestions(item.capture).flatMap((entry) =>
            entry.question.options.some((option) => option.ref?.id === shown.id)
              ? [{ captureId: item.capture.id, entry }]
              : [],
          ),
        )[0]
      : undefined;
  const isSettleView = isSettling && settling !== undefined;
  const isNeitherDirty = isSettleView && neitherText.trim() !== '';
  const isDirty =
    isNeitherDirty ||
    (draft !== null && shown !== null && draft.trim() !== shown.statement);
  const close = () => {
    setDraft(null);
    setNeitherText('');
    setIsSettling(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });
  const requestBack = useDiscardGuard({
    isDirty: isNeitherDirty,
    onClose: () => {
      setNeitherText('');
      setIsSettling(false);
    },
  });

  const settle = (change: FactChange, title: string, isDone: () => void) => {
    if (change.kind === 'offline') {
      addToast({ title: HELM_COPY.factNeedsConnection, type: 'info' });
      return;
    }
    if (change.kind === 'changed') {
      addToast({ title: HELM_COPY.factChanged, type: 'info' });
      return;
    }
    isDone();
    addToast({
      title,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void change.undo().then(
            (isUndone) =>
              addToast({
                title: isUndone ? HELM_COPY.factUndone : HELM_COPY.factUndoKept,
                type: 'info',
              }),
            (error: unknown) => {
              console.error('Helm fact change was not undone', error);
              addToast({ title: HELM_COPY.editFailed, type: 'error' });
            },
          ),
      },
    });
  };

  const closeSettling = () => {
    if (!user || !settling) return;
    const { captureId, entry } = settling;
    const isLastOpen = !Object.entries(
      held.needsYou.find((item) => item.capture.id === captureId)?.capture
        .questionState ?? {},
    ).some(
      ([id, state]) =>
        id !== entry.id && state.answeredAt === null && !isLeft(state),
    );
    closeQuestion(user.uid, captureId, entry.id, isLastOpen).catch(
      (error: unknown) =>
        console.error('Helm settled question was not closed', error),
    );
  };

  const run = async (
    action: () => Promise<FactChange>,
    title: string,
    isDone: () => void,
  ) => {
    if (!user || isWorking) return;
    setIsWorking(true);
    try {
      settle(await action(), title, isDone);
    } catch (error) {
      console.error('Helm fact was not changed', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsWorking(false);
  };

  const uid = user?.uid ?? '';
  const quote = shown ? getFactQuote(shown) : null;
  const isCorrecting = draft !== null;
  const isMissing = draft !== null && draft.trim() === '';

  const hasThird =
    settling !== undefined || (shown?.status === 'inferred' && !partner);

  const footer =
    !shown || isSettleView ? undefined : isCorrecting ? (
      <div className='flex items-center justify-end gap-2'>
        <Button
          type='button'
          variant='tertiary'
          disabled={isWorking}
          onClick={() => setDraft(null)}
        >
          {HELM_COPY.editCancel}
        </Button>
        <Button
          type='button'
          loading={isWorking}
          disabled={isMissing || !isDirty}
          onClick={() =>
            void run(
              () => correctFact(uid, shown.id, draft.trim(), shown.topic),
              HELM_COPY.factCorrectedToast,
              () => {
                closeSettling();
                close();
              },
            )
          }
        >
          {HELM_COPY.editSave}
        </Button>
      </div>
    ) : (
      <div
        className={
          hasThird
            ? 'grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-end max-sm:[&>button]:px-2 max-sm:[&>button]:whitespace-nowrap'
            : 'flex items-center justify-end gap-2'
        }
      >
        <Button
          type='button'
          variant='tertiary'
          disabled={isWorking}
          onClick={() =>
            void run(
              () =>
                forgetFact(uid, shown.id, store.getState().helm.media.items),
              HELM_COPY.factForgotToast,
              () => {
                closeSettling();
                close();
              },
            )
          }
        >
          {HELM_COPY.factForget}
        </Button>
        <Button
          type='button'
          variant='secondary'
          disabled={isWorking}
          onClick={() => setDraft(shown.statement)}
        >
          {HELM_COPY.factCorrect}
        </Button>
        {settling !== undefined && (
          <Button
            type='button'
            disabled={isWorking}
            onClick={() => setIsSettling(true)}
          >
            {HELM_COPY.factSettle}
          </Button>
        )}
        {shown.status === 'inferred' && !partner && (
          <Button
            type='button'
            disabled={isWorking}
            onClick={() =>
              void run(
                () => confirmFact(uid, shown.id),
                HELM_COPY.factConfirmedToast,
                () => undefined,
              )
            }
          >
            {HELM_COPY.factConfirm}
          </Button>
        )}
      </div>
    );

  return (
    <DetailSheet
      isOpen={shown !== null}
      onClose={requestClose}
      title={
        isCorrecting ? HELM_COPY.factCorrectTitle : HELM_COPY.factSheetTitle
      }
      footer={footer}
      viewKey={isSettleView ? 'settle' : isCorrecting ? 'correct' : 'read'}
    >
      {shown && isSettleView && (
        <div className='space-y-4'>
          <div className='flex items-center gap-1'>
            <BackLink isChevronOnly onBack={requestBack} />
            <p className='min-w-0 text-2xl font-semibold'>
              {settling.entry.question.prompt}
            </p>
          </div>
          <QuestionCard
            captureId={settling.captureId}
            item={settling.entry}
            isInSheet
            isPromptHidden
            neitherDraft={{ text: neitherText, onChange: setNeitherText }}
          />
        </div>
      )}
      {shown && isCorrecting && (
        <div className='space-y-1.5'>
          <label htmlFor='helm-fact-correct' className='text-sm font-medium'>
            {HELM_COPY.factStatementField}
          </label>
          <Input
            id='helm-fact-correct'
            value={draft}
            maxLength={FACT_STATEMENT_MAX}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      )}
      {shown && !isCorrecting && !isSettleView && (
        <div className='flex flex-col gap-3'>
          <div className='flex items-start gap-3'>
            <SourceRing
              isConfirmed={shown.status === 'confirmed'}
              label={
                shown.status === 'confirmed'
                  ? HELM_COPY.factRingSaid
                  : HELM_COPY.factRingInferred(assistant)
              }
              className='mt-2'
            />
            <p className='text-[17px] leading-6 break-words'>
              {shown.statement}
            </p>
          </div>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {getFactSource(shown, assistant, now)}
          </p>
          <KeptMediaSection record={{ kind: 'fact', id: shown.id }} />
          <PrivateRow kind='fact' record={shown} title={shown.statement} />
          {partner && (
            <p className='text-muted-foreground text-[13px] break-words'>
              {HELM_COPY.factDisagrees(partner.statement)}
            </p>
          )}
          {quote && (
            <blockquote className='border-border text-muted-foreground border-l-2 pl-3 text-[15px] text-pretty'>
              {`“${quote}”`}
            </blockquote>
          )}
          {earlier.map((entry) => (
            <p
              key={entry.id}
              className='text-muted-foreground text-[13px] break-words'
            >
              {HELM_COPY.factWas(
                entry.statement,
                toFactDay(entry.supersededAt ?? entry.createdAt, now),
              )}
            </p>
          ))}
        </div>
      )}
    </DetailSheet>
  );
}

export default FactSheet;
