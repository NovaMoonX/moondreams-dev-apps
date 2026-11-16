import { useEffect, useRef, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, HeartPulse } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import { type ReorderGroup, type ReorderMove } from '@/components/ReorderList';
import ReorderList from '@/components/ReorderList';
import SearchInput from '@/components/SearchInput';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import ImportancePlaceSheet, {
  PutAboveView,
  type PlaceChoice,
} from '@apps/helm/components/importance/ImportancePlaceSheet';
import ImportanceRowBody, {
  type ImportanceRecord,
} from '@apps/helm/components/importance/ImportanceRowBody';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  useImportancePlace,
  useImportanceToday,
} from '@apps/helm/hooks/useImportancePlace';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  clearImportanceOrder,
  moveToCanWait,
  placeAbove,
  placeAfter,
  placeFirst,
  takeOutOfOrder,
  type ImportanceResult,
} from '@apps/helm/store/actions/importanceActions';
import {
  selectImportanceGroups,
  type ImportanceRowView,
} from '@apps/helm/store/selectors/importanceSelectors';

const { option } = DropdownMenuFactories;

const SEARCH_FROM = 8;
const TINT_MS = 1000;

interface Spot {
  key: string;
  id: string;
  block: ScrollLogicalPosition;
}

interface ImportanceViewProps {
  /** The thing the view opens scrolled to, its row tinted for a second. */
  focusId: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenHabit: (habitId: string) => void;
}

interface Said {
  line: string;
  undo: (() => Promise<void>) | null;
}

function UndoLine({ said, onUndo }: { said: Said; onUndo: () => void }) {
  return (
    <AssistantLine>
      {said.line}
      {said.undo && (
        <>
          {' · '}
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            className="relative inline h-auto min-h-0 p-0 align-baseline font-medium underline underline-offset-2 before:absolute before:-inset-2.5 before:content-['']"
            onClick={onUndo}
          >
            {HELM_COPY.undo}
          </Button>
        </>
      )}
    </AssistantLine>
  );
}

/** What matters most: every project, goal and habit in the one order the person said, in three groups, each row a tap to its place and a handle to drag. */
function ImportanceView({
  focusId,
  backLabel,
  onBack,
  onHome,
  onOpenProject,
  onOpenHabit,
}: ImportanceViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const assistant = useAssistantName();
  const today = useImportanceToday();
  const groups = useAppSelector((state) =>
    selectImportanceGroups(state, today),
  );
  const projects = useAppSelector((state) => state.helm.projects);
  const habits = useAppSelector((state) => state.helm.habits);
  const [query, setQuery] = useState('');
  const [said, setSaid] = useState<Said | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [isKeptOpen, setIsKeptOpen] = useState(false);
  const [moved, setMoved] = useState<Spot | null>(null);
  const [tintEndedFor, setTintEndedFor] = useState<string | null>(null);
  const scrolledKey = useRef<string | null>(null);
  const tintTimer = useRef(0);
  const moveCount = useRef(0);

  useScreenContext('importance', null, [], {
    ask: HELM_COPY.askImportance,
    chip: HELM_COPY.chipImportance,
    back: HELM_COPY.backToImportance,
  });

  const kept = (rows: ImportanceRowView[]) =>
    rows.filter((row) => !groups.underGoalIds.includes(row.id));
  const listed = {
    inOrder: kept(groups.inOrder),
    notSaid: kept(groups.notSaid),
    canWait: kept(groups.canWait),
  };
  const rows = [...listed.inOrder, ...listed.notSaid, ...listed.canWait];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const needle = query.trim().toLowerCase();
  const matches = (row: ImportanceRowView) =>
    row.name.toLowerCase().includes(needle);
  const isLoaded = projects.isLoaded && habits.isLoaded;
  const hasSaid = listed.inOrder.length + listed.canWait.length > 0;

  const recordOf = (id: string): ImportanceRecord | null => {
    const project = projects.items.find(
      (entry) => entry.id === id && !entry.isUnreadable,
    );
    if (project) return { kind: 'project', project };
    const habit = habits.items.find(
      (entry) => entry.id === id && !entry.isUnreadable,
    );
    return habit ? { kind: 'habit', habit } : null;
  };

  const isReadable = (row: ImportanceRowView) => recordOf(row.id) !== null;
  const shownGroups: ReorderGroup<ImportanceRowView>[] = [
    {
      id: 'inOrder',
      label: HELM_COPY.importanceInOrder,
      items: listed.inOrder.filter(isReadable).filter(matches),
      isOrdered: true,
    },
    {
      id: 'notSaid',
      label: HELM_COPY.importanceNotSaid,
      trailing: (
        <span className='text-muted-foreground text-[12px]'>
          {HELM_COPY.importanceNotSaidTrailing}
        </span>
      ),
      items: listed.notSaid.filter(isReadable).filter(matches),
      isOrdered: false,
    },
    {
      id: 'canWait',
      label: HELM_COPY.importanceCanWait,
      items: listed.canWait.filter(isReadable).filter(matches),
      isOrdered: false,
    },
  ].filter((group) => group.items.length > 0);

  const hasNoMatch = needle !== '' && shownGroups.length === 0;

  const spot: Spot | null =
    moved ??
    (focusId === null
      ? null
      : { key: `focus:${focusId}`, id: focusId, block: 'center' });

  const spotKey = spot?.key ?? null;
  const spotId = spot?.id ?? null;
  const spotBlock = spot?.block ?? 'center';

  useEffect(() => {
    if (spotKey === null || spotId === null || !isLoaded) return;
    if (scrolledKey.current === spotKey) return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-importance-row="${CSS.escape(spotId)}"]`,
      );
      if (!target) return;
      scrolledKey.current = spotKey;
      target.scrollIntoView({ block: spotBlock });
      window.clearTimeout(tintTimer.current);
      tintTimer.current = window.setTimeout(
        () => setTintEndedFor(spotKey),
        TINT_MS,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [spotKey, spotId, spotBlock, isLoaded, rows.length]);

  useEffect(() => () => window.clearTimeout(tintTimer.current), []);

  const report = (error: unknown) => {
    console.error('Helm order was not changed', error);
    addToast({ title: HELM_COPY.editFailed, type: 'error' });
  };

  const settle = async (
    start: Promise<ImportanceResult>,
    subject: { id: string | null; name: string },
    line: string,
  ) => {
    const { id, name } = subject;
    try {
      const result = await start;
      if (result.kind === 'written') {
        const { undo, written } = result;
        setSaid({ line, undo });
        if (id !== null) {
          moveCount.current += 1;
          setMoved({
            key: `moved:${id}:${moveCount.current}`,
            id,
            block: 'nearest',
          });
        }
        written.catch(report);
        return;
      }
      setSaid({
        line:
          result.kind === 'refused'
            ? HELM_COPY.importanceRefusedCare(name)
            : result.kind === 'unchanged'
              ? HELM_COPY.importanceUnchanged(name)
              : HELM_COPY.editGone,
        undo: null,
      });
    } catch (error) {
      report(error);
    }
  };

  const undoSaid = () => {
    const previous = said;
    const undo = previous?.undo;
    if (!undo) return;
    setSaid({ line: HELM_COPY.takenBackLabel, undo: null });
    undo().catch((error: unknown) => {
      setSaid(previous);
      console.error('Helm order was not put back', error);
      addToast({ title: HELM_COPY.undoFailed, type: 'error' });
    });
  };

  const placeFirstRow = (row: ImportanceRowView) =>
    user &&
    settle(
      placeFirst(user.uid, today, row.id),
      row,
      HELM_COPY.importanceMovedFirst(row.name),
    );

  const placeAboveRow = (row: ImportanceRowView, other: ImportanceRowView) =>
    user &&
    settle(
      placeAbove(user.uid, today, row.id, other.id),
      row,
      HELM_COPY.importanceMovedAbove(row.name, other.name),
    );

  const canWaitRow = (row: ImportanceRowView) =>
    user &&
    settle(
      moveToCanWait(user.uid, today, row.id),
      row,
      HELM_COPY.importanceMovedCanWait(row.name),
    );

  const takeOutRow = (row: ImportanceRowView) =>
    user &&
    settle(
      takeOutOfOrder(user.uid, today, row.id),
      row,
      HELM_COPY.importanceMovedOut(row.name),
    );

  const open = (row: { id: string; kind: string }) =>
    row.kind === 'habit' ? onOpenHabit(row.id) : onOpenProject(row.id);

  const drop = ({ itemId, toGroupId, toIndex }: ReorderMove) => {
    const row = rowById.get(itemId);
    const target = shownGroups.find((group) => group.id === toGroupId);
    if (!row || !target) return;
    if (toGroupId === 'notSaid') {
      if (row.group !== 'notSaid') void takeOutRow(row);
      return;
    }
    if (toGroupId === 'canWait') {
      if (row.group !== 'canWait') void canWaitRow(row);
      return;
    }
    const others = target.items.filter((item) => item.id !== itemId);
    const next = others[toIndex];
    const previous = others[toIndex - 1];
    if (toIndex === 0 || (!next && !previous)) void placeFirstRow(row);
    else if (next) void placeAboveRow(row, next);
    else if (user) {
      void settle(
        placeAfter(user.uid, today, row.id, previous.id),
        row,
        HELM_COPY.importanceMovedAfter(row.name, previous.name),
      );
    }
  };

  const choose = (row: ImportanceRowView, choice: PlaceChoice) => {
    setOpenId(null);
    if (choice.kind === 'first') void placeFirstRow(row);
    else if (choice.kind === 'pickAbove') setPickingId(row.id);
    else if (choice.kind === 'canWait') void canWaitRow(row);
    else if (choice.kind === 'out') void takeOutRow(row);
    else afterBackLayersClose(() => open(row));
  };

  const clear = async () => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.importanceClear,
      message: HELM_COPY.importanceClearConfirm,
      confirmText: HELM_COPY.importanceClearAction,
    });
    if (isConfirmed) {
      void settle(
        clearImportanceOrder(user.uid),
        { id: null, name: '' },
        HELM_COPY.importanceCleared,
      );
    }
  };

  const openRow = openId === null ? null : (rowById.get(openId) ?? null);
  const pickingRow =
    pickingId === null ? null : (rowById.get(pickingId) ?? null);

  return (
    <>
      <HelmHeader
        backLabel={backLabel}
        onBack={onBack}
        onHome={onHome}
        menu={
          hasSaid
            ? {
                items: [
                  option({ label: HELM_COPY.importanceClear, value: 'clear' }),
                ],
                onItemSelect: () => void clear(),
              }
            : undefined
        }
      />
      <main className='space-y-4 pt-4'>
        <div className='space-y-1'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.importanceTitle}
          </h1>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.importanceIntro(assistant)}
          </p>
        </div>
        {said && (
          <div className='min-h-[42px]'>
            <UndoLine said={said} onUndo={undoSaid} />
          </div>
        )}
        {isLoaded && rows.length < 2 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.importanceFew}
          </p>
        )}
        {rows.length >= 2 && !hasSaid && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.importanceNothingSaid(assistant)}
          </p>
        )}
        {rows.length >= SEARCH_FROM && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={HELM_COPY.importanceSearch}
          />
        )}
        {hasNoMatch && (
          <p className='text-muted-foreground py-3 text-center text-[15px]'>
            {HELM_COPY.importanceNoMatch}
          </p>
        )}
        {rows.length >= 2 && (
          <ReorderList
            groups={shownGroups}
            handleLabel={HELM_COPY.importanceDragHandle}
            getPlace={(row) => row.position ?? 1}
            getItemLabel={(row) => row.name}
            onMove={drop}
            onOpen={(row) => setOpenId(row.id)}
            renderRow={(row) => {
              const record = recordOf(row.id);
              return record ? (
                <ImportanceRowBody
                  record={record}
                  isPaused={row.isPaused}
                  isTinted={
                    spotKey !== null &&
                    spotId === row.id &&
                    tintEndedFor !== spotKey
                  }
                />
              ) : null;
            }}
          />
        )}
        {groups.alwaysKept.length > 0 && (
          <Button
            type='button'
            variant='tertiary'
            className='helm-card flex h-auto min-h-10 w-full min-w-0 items-center gap-3 px-4 py-2 text-left font-normal'
            onClick={() => setIsKeptOpen(true)}
          >
            <HeartPulse
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
            <span className='text-muted-foreground min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
              {HELM_COPY.importanceAlwaysKept(groups.alwaysKept.length)}
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
      </main>
      {openRow && (
        <PlaceSheetFor
          row={openRow}
          others={listed.inOrder.filter((row) => row.id !== openRow.id)}
          onChoose={(choice) => choose(openRow, choice)}
          onClose={() => setOpenId(null)}
        />
      )}
      {pickingRow && (
        <PutAboveView
          row={pickingRow}
          others={listed.inOrder.filter((row) => row.id !== pickingRow.id)}
          onPick={(other) => {
            setPickingId(null);
            void placeAboveRow(pickingRow, other);
          }}
          onClose={() => {
            setPickingId(null);
            setOpenId(pickingRow.id);
          }}
        />
      )}
      <DetailSheet
        isOpen={isKeptOpen}
        onClose={() => setIsKeptOpen(false)}
        title={HELM_COPY.importanceAlwaysKept(groups.alwaysKept.length)}
      >
        <div className='space-y-3 pb-2'>
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.importanceAlwaysKeptNote(assistant)}
          </p>
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {groups.alwaysKept.map((entry) => {
              const record = recordOf(entry.id);
              return (
                <li key={entry.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    className='flex h-auto min-h-14 w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
                    onClick={() => {
                      setIsKeptOpen(false);
                      afterBackLayersClose(() => open(entry));
                    }}
                  >
                    <span className='min-w-0 flex-1'>
                      {record ? (
                        <PrivateTitle
                          kind={record.kind}
                          record={
                            record.kind === 'habit'
                              ? record.habit
                              : record.project
                          }
                          className='text-foreground text-[15px] leading-[21px]'
                        >
                          {entry.name}
                        </PrivateTitle>
                      ) : (
                        entry.name
                      )}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </DetailSheet>
    </>
  );
}

interface PlaceSheetForProps {
  row: ImportanceRowView;
  others: ImportanceRowView[];
  onChoose: (choice: PlaceChoice) => void;
  onClose: () => void;
}

function PlaceSheetFor({ row, others, onChoose, onClose }: PlaceSheetForProps) {
  const place = useImportancePlace(row.id);
  return (
    <ImportancePlaceSheet
      row={row}
      words={place?.text ?? null}
      others={others}
      onChoose={onChoose}
      onClose={onClose}
    />
  );
}

export default ImportanceView;
