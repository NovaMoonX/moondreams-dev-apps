import { useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Plus } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import MilestoneSheet, {
  type MilestoneDraft,
} from '@apps/helm/components/projects/MilestoneSheet';
import { DAY_MS, HELM_COPY } from '@apps/helm/constants';
import { setMilestoneDone } from '@apps/helm/store/actions/projectActions';
import type { OpenProject } from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';

interface MilestonesTabProps {
  project: OpenProject;
  /** A finished project shows its milestones and changes none. */
  isReadOnly: boolean;
}

interface Milestone extends MilestoneDraft {
  order: number;
  doneAt: number | null;
}

const bySchedule = (left: Milestone, right: Milestone) =>
  (left.date ?? Infinity) - (right.date ?? Infinity) ||
  left.order - right.order;

/** The project's dated points: open ones by date with the next one saying how far off it is, and the reached ones folded away, ticked. A row opens a sheet to change it. */
function MilestonesTab({ project, isReadOnly }: MilestonesTabProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [isReachedOpen, setIsReachedOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const milestones: Milestone[] = Object.entries(project.milestoneState)
    .flatMap(([id, state]) => {
      const words = project.milestones[id];
      return words ? [{ id, title: words.title, ...state }] : [];
    })
    .sort(bySchedule);
  const open = milestones.filter((entry) => entry.doneAt === null);
  const reached = milestones.filter((entry) => entry.doneAt !== null);
  const today = getDueDay({ kind: 'moment', at: now }, timeZone);
  const nextId =
    open.find((entry) => entry.date !== null && entry.date >= today)?.id ??
    null;
  const editing = milestones.find((entry) => entry.id === openId) ?? null;

  const tick = (entry: Milestone, isDone: boolean) => {
    if (!user || isReadOnly) return;
    const change = setMilestoneDone(
      user.uid,
      project.id,
      entry.id,
      entry.doneAt,
      isDone,
    );
    change.written.catch((error: unknown) => {
      console.error('Helm milestone was not ticked', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
    addToast({
      title: isDone
        ? HELM_COPY.milestoneReachedToast(entry.title)
        : HELM_COPY.milestoneReopenedToast(entry.title),
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void change.undo().catch((error: unknown) => {
            console.error('Helm milestone was not put back', error);
            addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
          }),
      },
    });
  };

  const whenLine = (entry: Milestone) => {
    if (entry.date === null) return HELM_COPY.milestoneNoDate;
    const label = formatDateShortUTC(entry.date);
    const days = Math.round((entry.date - today) / DAY_MS);
    return entry.doneAt === null && (days < 0 || entry.id === nextId)
      ? HELM_COPY.milestoneWhen(label, days)
      : label;
  };

  const renderRow = (entry: Milestone) => {
    const isReached = entry.doneAt !== null;
    const body = (
      <span className={join('block min-w-0 flex-1', isReached && 'opacity-60')}>
        <span
          className={join(
            'block text-[15px] leading-[21px] break-words',
            isReached
              ? 'text-muted-foreground line-through'
              : 'text-foreground',
          )}
        >
          {entry.title}
        </span>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {whenLine(entry)}
        </span>
      </span>
    );
    return (
      <li key={entry.id} className='flex items-center pl-4'>
        <Checkbox
          rounded
          filled
          checked={isReached}
          disabled={isReadOnly}
          aria-label={
            isReached
              ? HELM_COPY.milestoneMarkNotReached(entry.title)
              : HELM_COPY.milestoneMarkReached(entry.title)
          }
          className="relative shrink-0 after:absolute after:-inset-2.5 after:content-['']"
          onCheckedChange={(isOn) => tick(entry, isOn)}
        />
        {isReadOnly ? (
          <div className='min-w-0 flex-1 py-3 pr-4 pl-3'>{body}</div>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            className='flex h-auto min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 py-3 pr-4 pl-3 text-left focus-visible:-outline-offset-2'
            onClick={() => setOpenId(entry.id)}
          >
            {body}
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
      </li>
    );
  };

  return (
    <section className='space-y-3'>
      <SectionHeader
        title={HELM_COPY.milestonesTitle}
        action={
          isReadOnly ? undefined : (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setIsAdding(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              {HELM_COPY.milestoneAdd}
            </Button>
          )
        }
      />
      {milestones.length === 0 && (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {HELM_COPY.milestonesEmpty}
        </p>
      )}
      {open.length > 0 && (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {open.map(renderRow)}
        </ul>
      )}
      {reached.length > 0 && (
        <div className='space-y-2'>
          <ShowMoreButton
            isOpen={isReachedOpen}
            onClick={() => setIsReachedOpen((isOpen) => !isOpen)}
          >
            {isReachedOpen
              ? HELM_COPY.milestoneReachedHide
              : HELM_COPY.milestoneReachedFold(reached.length)}
          </ShowMoreButton>
          {isReachedOpen && (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {reached.map(renderRow)}
            </ul>
          )}
        </div>
      )}
      {!isReadOnly && (
        <>
          <MilestoneSheet
            isOpen={isAdding}
            onClose={() => setIsAdding(false)}
            projectId={project.id}
            milestone={null}
          />
          <MilestoneSheet
            isOpen={editing !== null}
            onClose={() => setOpenId(null)}
            projectId={project.id}
            milestone={editing}
          />
        </>
      )}
    </section>
  );
}

export default MilestonesTab;
