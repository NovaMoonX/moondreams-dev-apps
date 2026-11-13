import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, ImageOff } from 'lucide-react';

import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { formatClock } from '@/utils/durationUtils';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import KeptMediaViewer from '@apps/helm/components/media/KeptMediaViewer';
import { MediaKindIcon } from '@apps/helm/components/media/MediaKindIcon';
import MediaThumb from '@apps/helm/components/media/MediaThumb';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import FactSheet from '@apps/helm/components/who/FactSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { loadExecutionsById } from '@apps/helm/store/actions/captureActions';
import { keepLetGoMedia } from '@apps/helm/store/actions/mediaActions';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import {
  selectExecutionsById,
  selectOpenTasksById,
} from '@apps/helm/store/selectors/captureSelectors';
import { selectNoteById } from '@apps/helm/store/selectors/knowledgeSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { MediaAttachment, OpenCapture, OpenMedia } from '@apps/helm/types';
import { shortenFileName } from '@apps/helm/utils/fileNames';
import { isMediaExpired } from '@apps/helm/utils/mediaCaps';
import { getKeepTarget, getKeptEffect } from '@apps/helm/utils/mediaKeep';

const LINE = 'flex w-full items-baseline gap-2 pl-[30px] text-[13px]';
const HOUR_MS = 3_600_000;
const SMALL_ACTION =
  "relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']";

interface TurnPhotosProps {
  capture: OpenCapture;
}

/** What a file or recording sent with a turn looks like in its tile: an icon and its name (a recording just says so). */
function FileTile({ media }: { media: OpenMedia }) {
  return (
    <span className='bg-muted text-muted-foreground flex size-20 flex-col items-center justify-center gap-1 rounded-xl p-1.5'>
      <MediaKindIcon kind={media.kind} className='size-5 shrink-0' />
      <span className='line-clamp-2 w-full text-center text-[11px] leading-tight break-words'>
        {media.kind === 'voiceNote'
          ? media.durationMs === null
            ? HELM_COPY.mediaVoiceTile
            : HELM_COPY.attachVoiceMeta(formatClock(media.durationMs))
          : shortenFileName(
              media.fileName ?? HELM_COPY.mediaWord(media.kind),
              20,
            )}
      </span>
      {media.kind === 'pdf' && media.pageCount !== null && (
        <span className='w-full truncate text-center text-[11px] leading-tight'>
          {HELM_COPY.mediaPdfPages(media.pageCount)}
        </span>
      )}
    </span>
  );
}

/** The photos and files sent with a turn, above its words; one that is already deleted is a quiet tile that says so. */
export function TurnPhotos({ capture }: TurnPhotosProps) {
  const media = useAppSelector((state) => state.helm.media.items);
  if (capture.attachmentIds.length === 0) return null;
  return (
    <ul className='flex max-w-[84%] flex-wrap justify-end gap-1.5'>
      {capture.attachmentIds.map((id, index) => {
        const found = media.find((entry) => entry.id === id);
        return (
          <li key={id}>
            {found && found.kind !== 'photo' ? (
              <FileTile media={found} />
            ) : found ? (
              <MediaThumb
                media={found}
                alt={HELM_COPY.attachThumbLabel(index + 1)}
                className='size-20 rounded-xl'
                fallback={
                  <ImageOff
                    className='text-muted-foreground m-auto size-5'
                    aria-hidden='true'
                  />
                }
              />
            ) : (
              <span className='bg-muted text-muted-foreground grid size-20 place-items-center rounded-xl p-1 text-center text-[11px] leading-tight'>
                {HELM_COPY.mediaGoneTile}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OpenTask({
  taskId,
  isOpen,
  onClose,
}: {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const tasksById = useAppSelector(selectOpenTasksById);
  const activity = useAppSelector((state) =>
    selectTaskActivity(state, nowMinute),
  );
  const { held, tick, undoTick, forget } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();
  const task = held.get(taskId)?.task ?? tasksById.get(taskId) ?? null;

  const handleDeleted = (
    id: string,
    title: string,
    restore: () => Promise<RestoreResult>,
  ) => {
    forget(id);
    showUndo(HELM_COPY.deletedTask(title), () => {
      restore()
        .then((result) => {
          if (result === 'exists') {
            addToast({ title: HELM_COPY.restoreExists, type: 'info' });
          }
        })
        .catch((error: unknown) => {
          console.error('Helm task was not restored', error);
          addToast({ title: HELM_COPY.undoFailed, type: 'error' });
        });
    });
  };

  return (
    <>
      <TaskSheet
        task={isOpen ? task : null}
        screen={{
          view: 'tasks',
          visible: [{ collection: 'tasks', id: taskId }],
        }}
        doneAt={held.get(taskId)?.completedAt ?? null}
        activity={activity.byId.get(taskId) ?? null}
        onClose={onClose}
        onTick={tick}
        onUndoTick={(id) => void undoTick(id)}
        onDeleted={handleDeleted}
      />
      <UndoSnackbar pending={pending} onUndo={undo} />
    </>
  );
}

interface MediaLineProps {
  capture: OpenCapture;
  mediaId: string;
}

/** What became of one photo a turn sent: kept on a record (a line that opens it), let go with Keep it, or kept by Keep it with its Undo. Says nothing while the photo waits to be read. */
function MediaLine({ capture, mediaId }: MediaLineProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const media = useAppSelector((state) =>
    state.helm.media.items.find((entry) => entry.id === mediaId),
  );
  const isMediaLoaded = useAppSelector((state) => state.helm.media.isLoaded);
  const executionsById = useAppSelector(selectExecutionsById);
  const tasksById = useAppSelector(selectOpenTasksById);
  const facts = useAppSelector((state) => state.helm.facts.items);
  const noteById = useAppSelector(selectNoteById);
  const [isWorking, setIsWorking] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const now = useNow(60_000);
  const uid = user?.uid;
  const keptBy = media?.executionId ?? null;
  const needsLoad = keptBy !== null && !executionsById.has(keptBy);
  useEffect(() => {
    if (uid && keptBy && needsLoad) void loadExecutionsById(uid, [keptBy]);
  }, [uid, keptBy, needsLoad]);

  if (
    !uid ||
    !isMediaLoaded ||
    media?.status === 'received' ||
    media?.status === 'uploading'
  ) {
    return null;
  }
  if (!media || isMediaExpired(media.deleteAfter, now)) {
    const kept = getKeptEffect(
      capture.executionIds.flatMap((id) => {
        const execution = executionsById.get(id);
        return execution ? [execution] : [];
      }),
      mediaId,
    );
    if (!kept) return null;
    return (
      <p className={join(LINE, 'text-muted-foreground')}>
        {kept.title
          ? HELM_COPY.mediaTookOff(kept.title)
          : HELM_COPY.mediaRemovedNoRecord}
      </p>
    );
  }
  if (media.status === 'discarded') {
    const canKeep = !media.isUnreadable;
    const fileName = media.fileName ?? HELM_COPY.mediaWord(media.kind);
    const hoursLeft =
      media.deleteAfter === null
        ? null
        : media.deleteAfter - now <= HOUR_MS
          ? 0
          : Math.min(24, Math.ceil((media.deleteAfter - now) / HOUR_MS));
    const keep = async () => {
      if (isWorking) return;
      if (!navigator.onLine) {
        addToast({ title: HELM_COPY.mediaKeepNeedsConnection, type: 'info' });
        return;
      }
      setIsWorking(true);
      try {
        const executions = capture.executionIds.flatMap((id) => {
          const execution = executionsById.get(id);
          return execution ? [execution] : [];
        });
        const result = await keepLetGoMedia(uid, await getHelmEncryption(uid), {
          captureId: capture.id,
          mediaId,
          kind: media.kind,
          fileName: media.fileName,
          target: getKeepTarget(executions),
        });
        if (result === 'gone') {
          addToast({ title: HELM_COPY.mediaKeepGone, type: 'info' });
        }
      } catch (error) {
        console.error('Helm photo was not kept', error);
        addToast({ title: HELM_COPY.mediaKeepFailed, type: 'error' });
      } finally {
        setIsWorking(false);
      }
    };
    return (
      <p className={join(LINE, 'flex-wrap gap-y-1')}>
        <span className='text-muted-foreground min-w-0 basis-full sm:flex-1 sm:basis-0'>
          {media.kind === 'photo' ? (
            canKeep ? (
              HELM_COPY.mediaNotKeptIn(hoursLeft)
            ) : (
              HELM_COPY.mediaLetGo(media.kind)
            )
          ) : (
            <>
              <span className='block break-words'>
                {media.kind === 'voiceNote'
                  ? HELM_COPY.mediaVoiceNotKept
                  : HELM_COPY.mediaReadNotKept(shortenFileName(fileName))}
              </span>
              <span className='block'>
                {HELM_COPY.mediaNotKeptHours(hoursLeft)}
              </span>
            </>
          )}
        </span>
        {canKeep && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={isWorking}
            className={SMALL_ACTION}
            onClick={() => void keep()}
          >
            {media.kind === 'voiceNote'
              ? HELM_COPY.mediaKeepRecording
              : HELM_COPY.mediaKeepIt}
          </Button>
        )}
      </p>
    );
  }

  const record: MediaAttachment | null = media.attachedTo[0] ?? null;
  const keptExecution = keptBy ? executionsById.get(keptBy) : undefined;
  const effectIndex =
    keptExecution?.effectRefs.findIndex((ref) => ref.docId === media.id) ?? -1;
  const effectTitle =
    keptExecution?.effects[effectIndex]?.written['sealed.title'];
  const storedTitle =
    record?.kind === 'task'
      ? tasksById.get(record.id)?.title
      : record?.kind === 'fact'
        ? facts.find((entry) => entry.id === record.id)?.statement
        : undefined;
  const noteTitle =
    record?.kind === 'note' ? noteById.get(record.id)?.title : undefined;
  const title =
    typeof effectTitle === 'string' && effectTitle
      ? effectTitle
      : (noteTitle ?? storedTitle ?? null);
  const noun = HELM_COPY.mediaNoun(media.kind, media.fileName);
  const getLabel = () => {
    if (!record || !title) return HELM_COPY.mediaKeptNoRecord(noun);
    if (record.kind === 'note' && media.decidedBy !== 'person') {
      return HELM_COPY.mediaSeeNote(noteTitle || title);
    }
    return media.decidedBy === 'person'
      ? HELM_COPY.mediaKeptOn(noun, title)
      : HELM_COPY.mediaSeeOn(title);
  };
  const label = getLabel();
  const canOpen =
    record === null ||
    (record.kind === 'fact'
      ? facts.some((entry) => entry.id === record.id)
      : record.kind === 'note'
        ? noteById.has(record.id)
        : tasksById.has(record.id));
  const canUndo = media.decidedBy === 'person' && keptBy !== null;

  const undo = async () => {
    if (!keptBy || isWorking) return;
    setIsWorking(true);
    try {
      const result = await takeBack(uid, keptBy);
      if (result.kind === 'refused') {
        addToast({ title: HELM_COPY.cannotTakeBack, type: 'info' });
      }
      if (result.kind === 'offline') {
        addToast({
          title: HELM_COPY.undoNeedsConnectionTitle,
          description: HELM_COPY.undoNeedsConnectionBody,
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Helm photo keep was not undone', error);
      addToast({ title: HELM_COPY.undoFailed, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className={LINE}>
      {canOpen ? (
        <Button
          type='button'
          variant='tertiary'
          className='h-auto min-w-0 flex-1 justify-start gap-1 px-0! py-1 text-left text-[13px] font-normal'
          onClick={() => setIsOpen(true)}
        >
          <span className='min-w-0 break-words'>{label}</span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      ) : (
        <span className='text-muted-foreground min-w-0 flex-1 break-words'>
          {label}
        </span>
      )}
      {canUndo && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={isWorking}
          className={SMALL_ACTION}
          onClick={() => void undo()}
        >
          {HELM_COPY.undo}
        </Button>
      )}
      {record?.kind === 'task' && (
        <OpenTask
          taskId={record.id}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
      {record === null && isOpen && (
        <KeptMediaViewer
          media={media}
          record={null}
          onClose={() => setIsOpen(false)}
        />
      )}
      {record?.kind === 'note' && (
        <NoteSheet
          noteId={isOpen ? record.id : null}
          onClose={() => setIsOpen(false)}
        />
      )}
      {record?.kind === 'fact' && (
        <FactSheet
          factId={isOpen ? record.id : null}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default MediaLine;
