import { useMemo, useRef, useState, type ReactNode } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Eye,
  ListChecks,
  Lock,
  MessageSquareText,
  PenLine,
  Trash2,
  Type,
} from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import SectionHeader from '@/components/SectionHeader';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useAppSelector } from '@/store';
import SeenAsRing from '@apps/helm/components/howNomosSeesYou/SeenAsRing';
import {
  SEEN_AS_WORDS,
  toNoticedDay,
  toSaidAt,
} from '@apps/helm/components/howNomosSeesYou/seenAsWords';
import { HELM_COPY } from '@apps/helm/constants';
import {
  SEEN_AS_LIMITS,
  cutCorrection,
  readSourceKey,
} from '@apps/helm/engine/seenAs';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  correctSeenAs,
  removeSeenAs,
  type SeenAsChange,
} from '@apps/helm/store/actions/seenAsActions';
import {
  selectShownObservations,
  selectShownPatterns,
} from '@apps/helm/store/selectors/patternSelectors';
import { selectShownSeenAs } from '@apps/helm/store/selectors/seenAsSelectors';
import { UNDO_WINDOW_MS } from '@/lib/undo';

interface SeenAsSheetProps {
  lineId: string | null;
  onClose: () => void;
}

interface SourceRow {
  key: string;
  icon: ReactNode;
  text: string;
  meta: string | null;
  isPrivate: boolean;
}

const iconClass = 'text-muted-foreground mt-0.5 size-4 shrink-0';

/** One line: the words behind it, then That's not quite right and, set apart, Remove this. A change names what it did and has its own Undo. */
function SeenAsSheet({ lineId, onClose }: SeenAsSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistant = useAssistantName();
  const lines = useAppSelector(selectShownSeenAs);
  const observations = useAppSelector(selectShownObservations);
  const patterns = useAppSelector(selectShownPatterns);
  const habits = useAppSelector((state) => state.helm.habits.items);
  const style = useAppSelector((state) => state.helm.style.items);
  const line = lines.find((one) => one.id === lineId) ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(field, draft ?? '', 6);

  const sources = useMemo<SourceRow[]>(
    () =>
      (line?.sourceKeys ?? []).flatMap((key): SourceRow[] => {
        const read = readSourceKey(key);
        if (!read) return [];
        if (read.home === 'observations') {
          const one = observations.find((entry) => entry.id === read.id);
          if (!one) return [];
          return [
            {
              key,
              icon: <MessageSquareText className={iconClass} />,
              text: one.quote
                ? `“${one.quote}”`
                : SEEN_AS_WORDS.someThingYouSaid,
              meta: `${toSaidAt(one.at)} · ${
                one.source === 'checkInNote'
                  ? SEEN_AS_WORDS.aCheckIn
                  : SEEN_AS_WORDS.saidTo(assistant)
              }`,
              isPrivate: one.privacy === 'private',
            },
          ];
        }
        if (read.home === 'patterns') {
          const one = patterns.find((entry) => entry.id === read.id);
          if (!one || one.statement === '') return [];
          return [
            {
              key,
              icon: <Eye className={iconClass} />,
              text: one.statement,
              meta: one.evidenceLine === '' ? null : one.evidenceLine,
              isPrivate: one.privacy === 'private',
            },
          ];
        }
        if (read.home === 'habits') {
          const one = habits.find((entry) => entry.id === read.id);
          if (!one || one.isUnreadable) return [];
          return [
            {
              key,
              icon: <ListChecks className={iconClass} />,
              text: [one.emoji, one.name].filter(Boolean).join(' '),
              meta: null,
              isPrivate: one.privacy === 'private',
            },
          ];
        }
        const [scope, trait] = read.id.split('#');
        const text = style.find((entry) => entry.id === scope)?.traits[trait]
          ?.text;
        if (!text) return [];
        return [
          {
            key,
            icon: <Type className={iconClass} />,
            text,
            meta: null,
            isPrivate: false,
          },
        ];
      }),
    [line, observations, patterns, habits, style, assistant],
  );

  const trimmed = draft?.trim() ?? '';
  const isChanged =
    cutCorrection(trimmed) !==
    cutCorrection(line?.corrected ?? line?.line ?? '');
  const isDirty = draft !== null && trimmed !== '' && isChanged;
  const close = () => {
    setDraft(null);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  const undoWith = (change: SeenAsChange) => () =>
    void change.undo().then(
      (isUndone) =>
        addToast({
          title: isUndone ? SEEN_AS_WORDS.undone : SEEN_AS_WORDS.changedSince,
          type: 'info',
        }),
      (error: unknown) => {
        console.error('Helm seen-as change was not undone', error);
        addToast({ title: SEEN_AS_WORDS.failed, type: 'error' });
      },
    );

  const run = async (
    action: (uid: string) => Promise<SeenAsChange | null>,
    title: string,
  ) => {
    if (!user || isWorking) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.factNeedsConnection, type: 'info' });
      return;
    }
    setIsWorking(true);
    try {
      const change = await action(user.uid);
      if (change) {
        close();
        addToast({
          duration: UNDO_WINDOW_MS,
          title,
          type: 'success',
          action: { label: HELM_COPY.undo, onClick: undoWith(change) },
        });
      }
    } catch (error) {
      console.error('Helm seen-as line was not changed', error);
      addToast({ title: SEEN_AS_WORDS.failed, type: 'error' });
    }
    setIsWorking(false);
  };

  const isCorrected = line?.state === 'corrected';
  const meta =
    line &&
    (isCorrected
      ? SEEN_AS_WORDS.saidOn(toNoticedDay(line.correctedAt ?? line.derivedAt))
      : SEEN_AS_WORDS.noticedOn(assistant, toNoticedDay(line.derivedAt)));

  return (
    <DetailSheet
      isOpen={line !== null}
      onClose={requestClose}
      title={line ? (line.corrected ?? line.line) : ''}
    >
      {line && (
        <div className='flex flex-col gap-4'>
          <p className='text-muted-foreground flex items-center gap-2 text-[13px]'>
            <SeenAsRing
              isCorrected={isCorrected}
              assistant={assistant}
              isInline
            />
            <span className='min-w-0 break-words'>{meta}</span>
            {line.privacy === 'private' && (
              <Lock
                className='size-3.5 shrink-0'
                role='img'
                aria-label={HELM_COPY.privateLockLabel}
              />
            )}
          </p>
          <div>
            <SectionHeader title={SEEN_AS_WORDS.fromTitle} />
            {sources.length === 0 ? (
              <p className='text-muted-foreground text-[15px] text-pretty'>
                {SEEN_AS_WORDS.fromNothing}
              </p>
            ) : (
              <ul className='divide-border divide-y'>
                {sources.map((source) => (
                  <li
                    key={source.key}
                    className='flex items-start gap-3 py-2.5'
                  >
                    {source.icon}
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block text-[15px] break-words'>
                        {source.text}
                      </span>
                      {source.meta && (
                        <span className='text-muted-foreground block text-[13px] break-words'>
                          {source.meta}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {draft === null ? (
            <div className='flex flex-col gap-8'>
              <ActionRow
                icon={<PenLine />}
                label={SEEN_AS_WORDS.correct}
                subtitle={SEEN_AS_WORDS.correctSubtitle(assistant)}
                onClick={() => setDraft(line.corrected ?? line.line)}
              />
              <ActionRow
                icon={<Trash2 />}
                label={SEEN_AS_WORDS.remove}
                subtitle={SEEN_AS_WORDS.removeSubtitle(assistant)}
                isDestructive
                isDisabled={isWorking}
                onClick={() =>
                  void run(
                    (uid) => removeSeenAs(uid, line.id),
                    SEEN_AS_WORDS.removed(assistant),
                  )
                }
              />
            </div>
          ) : (
            <div className='space-y-3'>
              <Textarea
                ref={field}
                aria-label={SEEN_AS_WORDS.correctField}
                placeholder={SEEN_AS_WORDS.correctPlaceholder}
                maxLength={SEEN_AS_LIMITS.corrected}
                rows={2}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
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
                  disabled={trimmed === '' || !isChanged}
                  onClick={() =>
                    void run(
                      (uid) => correctSeenAs(uid, line.id, trimmed),
                      SEEN_AS_WORDS.changed,
                    )
                  }
                >
                  {HELM_COPY.editSave}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default SeenAsSheet;
