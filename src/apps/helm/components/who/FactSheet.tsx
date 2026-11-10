import { useMemo, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import SourceRing from '@apps/helm/components/who/SourceRing';
import { FACT_STATEMENT_MAX, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  confirmFact,
  correctFact,
  forgetFact,
  type FactChange,
} from '@apps/helm/store/actions/memoryActions';
import type { OpenFact } from '@apps/helm/types';
import { getFactSource, toFactDay } from '@apps/helm/utils/factLines';

interface FactSheetProps {
  factId: string | null;
  onClose: () => void;
}

/** The facts this one replaced, newest first, following each `supersedesId` back. */
const getEarlier = (fact: OpenFact, facts: OpenFact[]) => {
  const byId = new Map(facts.map((entry) => [entry.id, entry]));
  const walk = (current: OpenFact, seen: Set<string>): OpenFact[] => {
    const previous = current.supersedesId
      ? byId.get(current.supersedesId)
      : undefined;
    if (!previous || seen.has(previous.id)) return [];
    return [previous, ...walk(previous, new Set([...seen, previous.id]))];
  };
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
  const now = useNow(60_000);
  const earlier = useMemo(
    () => (shown ? getEarlier(shown, facts) : []),
    [shown, facts],
  );
  const isDirty =
    draft !== null && shown !== null && draft.trim() !== shown.statement;
  const close = () => {
    setDraft(null);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

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
  const isCorrecting = draft !== null;
  const isMissing = draft !== null && draft.trim() === '';

  const footer = !shown ? undefined : isCorrecting ? (
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
            () => correctFact(uid, shown.id, draft.trim()),
            HELM_COPY.factCorrectedToast,
            close,
          )
        }
      >
        {HELM_COPY.editSave}
      </Button>
    </div>
  ) : (
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <Button
        type='button'
        variant='tertiary'
        disabled={isWorking}
        onClick={() =>
          void run(
            () => forgetFact(uid, shown.id),
            HELM_COPY.factForgotToast,
            close,
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
      {shown.status === 'inferred' && (
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
      viewKey={isCorrecting ? 'correct' : 'read'}
    >
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
      {shown && !isCorrecting && (
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
          {shown.quote && (
            <blockquote className='border-border text-muted-foreground border-l-2 pl-3 text-[15px] text-pretty'>
              {`“${shown.quote}”`}
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
