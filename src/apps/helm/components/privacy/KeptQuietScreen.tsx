import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CalendarClock,
  ChevronRight,
  ExternalLink,
  VolumeX,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DateInput from '@/components/DateInput';
import FormSheet from '@/components/FormSheet';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import SearchSheets from '@apps/helm/components/search/SearchSheets';
import { useQuietWrite } from '@apps/helm/components/privacy/useQuietWrite';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import type { QuietKind } from '@apps/helm/store/actions/privacyActions';
import { isQuietOn, readPrivacyFacts } from '@apps/helm/utils/privacy';
import {
  compareQuietEnd,
  readQuietEndClause,
} from '@apps/helm/utils/quietDisplay';

interface QuietItem {
  key: string;
  kind: QuietKind;
  id: string;
  title: string;
  mark: 'person' | 'guessed';
  until: string | null;
}

interface QuietSource {
  id: string;
  title: string;
  isUnreadable: boolean;
  quietMark?: 'person' | 'guessed' | null;
  quietUntil?: string | null;
  isQuietCleared?: boolean | null;
  privateMark: 'health' | 'care' | 'person' | null;
  isPrivacyCleared: boolean | null;
}

const toItems = (
  kind: QuietKind,
  sources: readonly QuietSource[],
  today: string,
): QuietItem[] =>
  sources.flatMap((source) =>
    !source.isUnreadable && isQuietOn(readPrivacyFacts(source), today)
      ? [
          {
            key: `${kind}:${source.id}`,
            kind,
            id: source.id,
            title: source.title,
            mark: source.quietMark === 'guessed' ? 'guessed' : 'person',
            until: source.quietUntil ?? null,
          },
        ]
      : [],
  );

function QuietRowButton({
  item,
  onOpen,
}: {
  item: QuietItem;
  onOpen: () => void;
}) {
  const name = useAssistantName();
  const who =
    item.mark === 'guessed'
      ? HELM_COPY.quietStateGuess(name)
      : HELM_COPY.quietStateYou;
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto w-full items-center justify-between gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={onOpen}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 block text-[15px] leading-[21px] break-words'>
          {item.title}
        </span>
        <span className='text-muted-foreground block text-[13px]'>
          {`${who} · ${readQuietEndClause(item.until)}`}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

function QuietItemSheet({
  item,
  today,
  onClose,
  onOpenRecord,
}: {
  item: QuietItem;
  today: string;
  onClose: () => void;
  onOpenRecord: () => void;
}) {
  const { write, isWriting } = useQuietWrite(item.kind, item.id, null);
  const [isChanging, setIsChanging] = useState(false);
  const [day, setDay] = useState(item.until ?? '');
  const isDayUsable = day !== '' && day >= today;

  const stop = async () => {
    if (await write(false, null, HELM_COPY.quietOffToast(item.title)))
      onClose();
  };
  const changeTo = async (until: string | null) => {
    const toastTitle =
      until === null
        ? HELM_COPY.quietNoEndToast(item.title)
        : HELM_COPY.quietUntilToast(
            item.title,
            formatDateShortUTC(Date.parse(until)),
          );
    if (await write(true, until, toastTitle)) onClose();
  };

  return (
    <FormSheet isOpen onClose={onClose} title={item.title} isDrawerWhenShort>
      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.quietSheetLead}
        </p>
        {isChanging ? (
          <div className='flex flex-col gap-2'>
            <DateInput
              variant='outline'
              aria-label={HELM_COPY.quietDayLabel}
              className='helm-field'
              min={today}
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={!isDayUsable || isWriting}
                onClick={() => void changeTo(day)}
              >
                {HELM_COPY.quietSetDay}
              </Button>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                disabled={isWriting}
                onClick={() => void changeTo(null)}
              >
                {HELM_COPY.quietNoEnd}
              </Button>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                onClick={() => setIsChanging(false)}
              >
                {HELM_COPY.quietCancel}
              </Button>
            </div>
          </div>
        ) : (
          <ActionGroup>
            <ActionRow
              isGrouped
              icon={<VolumeX />}
              label={HELM_COPY.quietStop}
              isDisabled={isWriting}
              onClick={() => void stop()}
            />
            <ActionRow
              isGrouped
              icon={<CalendarClock />}
              label={HELM_COPY.quietChange}
              hasChevron
              onClick={() => setIsChanging(true)}
            />
            <ActionRow
              isGrouped
              icon={<ExternalLink />}
              label={HELM_COPY.quietOpen}
              onClick={onOpenRecord}
            />
          </ActionGroup>
        )}
      </div>
    </FormSheet>
  );
}

/** Everything kept quiet on its own mark (tasks, projects, notes), soonest end first and open-ended last; a row opens a small sheet to stop it, change when it ends, or open the thing. */
function KeptQuietScreen({ onClose }: { onClose: () => void }) {
  const name = useAssistantName();
  const today = useTodayKey();
  const { showView } = useHelmUrlState();
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const projects = useAppSelector((state) => state.helm.projects.items);
  const notes = useAppSelector((state) => state.helm.notes.items);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [shown, setShown] = useState<{
    kind: 'task' | 'note';
    id: string;
  } | null>(null);

  const tasks = useMemo(
    () => [
      ...new Map(
        [...openTasks, ...projectTasks].map((task) => [task.id, task]),
      ).values(),
    ],
    [openTasks, projectTasks],
  );
  const items = useMemo(
    () =>
      [
        ...toItems('task', tasks, today),
        ...toItems(
          'project',
          projects.map((project) => ({ ...project, title: project.name })),
          today,
        ),
        ...toItems('note', notes, today),
      ].sort((left, right) => compareQuietEnd(left.until, right.until)),
    [tasks, projects, notes, today],
  );
  const open = items.find((item) => item.key === openKey) ?? null;

  const openRecord = (item: QuietItem) => {
    setOpenKey(null);
    if (item.kind === 'project') {
      onClose();
      void showView('project', item.id);
      return;
    }
    setShown({ kind: item.kind, id: item.id });
  };

  return (
    <>
      <Subview overlay title={HELM_COPY.quietTitle} onClose={onClose}>
        <div className='flex flex-col gap-4'>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.quietLead(name)}
          </p>
          {items.length === 0 ? (
            <p className='helm-card p-4 text-[15px] text-pretty'>
              {HELM_COPY.quietEmpty(name)}
            </p>
          ) : (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {items.map((item) => (
                <li key={item.key}>
                  <QuietRowButton
                    item={item}
                    onOpen={() => setOpenKey(item.key)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Subview>
      {open && (
        <QuietItemSheet
          key={open.key}
          item={open}
          today={today}
          onClose={() => setOpenKey(null)}
          onOpenRecord={() => openRecord(open)}
        />
      )}
      <SearchSheets open={shown} tasks={tasks} onClose={() => setShown(null)} />
    </>
  );
}

export default KeptQuietScreen;
