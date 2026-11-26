import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, GripVertical } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';

export interface ReorderGroup<T extends { id: string }> {
  id: string;
  /** Words on the group's divider; `null` draws the group with no heading. It also names the group in announcements. */
  label: string | null;
  /** Drawn as the divider's label in place of `label` (a button that opens the heading's editor). */
  heading?: ReactNode;
  /** Sits beside the divider's label, such as how the group is sorted. */
  trailing?: ReactNode;
  items: T[];
  /** Draws place numbers and a drag handle on each row. */
  isOrdered: boolean;
  /** Whether a dragged row can be dropped into this group. Defaults to true. */
  isDropTarget?: boolean;
  /** Shown in place of the rows while the group is empty, and as the drop target for it. */
  empty?: ReactNode;
}

export interface ReorderMove {
  itemId: string;
  toGroupId: string;
  /** Where the item ends up among that group's drawn rows once it has left its old spot; a row `renderRow` hides is not counted, so filter hidden items out of `groups` instead. */
  toIndex: number;
}

export interface ReorderRowState {
  place: number;
  isDragging: boolean;
}

interface MoveInfo {
  itemLabel: string;
  /** The item's place at the slot; null in a group that draws no places. */
  place: number | null;
  /** Set only when the slot is in another group than the one the item came from. */
  groupLabel: string | null;
}

export interface ReorderAnnouncements {
  pickedUp: (itemLabel: string) => string;
  moved: (info: MoveInfo) => string;
  dropped: (info: MoveInfo) => string;
  cancelled: (itemLabel: string) => string;
  unchanged: (itemLabel: string) => string;
}

export interface ReorderListProps<T extends { id: string }> {
  groups: ReorderGroup<T>[];
  /** Draws the row's content; the list adds the place number, the handle and the tap target. */
  renderRow: (item: T, state: ReorderRowState) => ReactNode;
  /** Called with the finished move; the list keeps no order of its own beyond the drag. */
  onMove: (move: ReorderMove) => void;
  /** A tap on a row anywhere but its handle. Without it rows are not tappable. */
  onOpen?: (item: T) => void;
  /** The number shown for a row; defaults to its position, so a caller can show equal places. */
  getPlace?: (item: T, index: number, group: ReorderGroup<T>) => number;
  /** Names an item for the handle and the spoken announcements. */
  getItemLabel?: (item: T) => string;
  /** The handle's accessible name before the item's own. */
  handleLabel?: string;
  /** Rows draw no place number, border or padding: `renderRow` supplies the whole row. */
  isPlain?: boolean;
  /** Which edge of a row carries the grip. Defaults to the end. */
  handleSide?: 'start' | 'end';
  /** Rows start with a line of text or a 24px node: the row aligns to the top and the grip sits on that first line instead of the row's middle. */
  isHandleAtFirstLine?: boolean;
  /** Press and hold on touch picks a row up. A list that uses press and hold for selection passes false. */
  canLongPressDrag?: boolean;
  announcements?: Partial<ReorderAnnouncements>;
  className?: string;
}

const whereWords = (info: MoveInfo) =>
  [
    info.place === null ? null : `place ${info.place}`,
    info.groupLabel ? `in ${info.groupLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ') || 'a new spot';

const DEFAULT_ANNOUNCEMENTS: Required<ReorderAnnouncements> = {
  pickedUp: (label) =>
    `Picked up${label ? ` ${label}` : ''}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
  moved: (info) => `Moved to ${whereWords(info)}`,
  dropped: (info) => `Dropped at ${whereWords(info)}`,
  cancelled: () => 'Move cancelled',
  unchanged: () => 'Dropped where it was',
};

const NBSP = '\u00a0';
const DRAG_START_PX = 4;
const EDGE_ZONE_PX = 72;
const MAX_SCROLL_PX_PER_FRAME = 18;
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 8;

interface Slot {
  g: number;
  i: number;
}

interface Measured {
  id: string;
  top: number;
  bottom: number;
}

interface Snapshot {
  itemId: string;
  groupIds: string[];
  signature: string;
  src: Slot;
  height: number;
  srcTop: number;
  groups: {
    top: number;
    bottom: number;
    isTarget: boolean;
    itemsTop: number;
    items: Measured[];
  }[];
  scroller: HTMLElement | null;
  startScroll: number;
  startPointerY: number;
  target: Slot;
  mode: 'pointer' | 'keyboard';
  canScrollUp: boolean;
  canScrollDown: boolean;
}

const signatureOf = <T extends { id: string }>(groups: ReorderGroup<T>[]) =>
  groups
    .map(
      (group) => `${group.id}:${group.items.map((item) => item.id).join(',')}`,
    )
    .join('|');

function findScroller(from: HTMLElement | null): HTMLElement | null {
  if (!from) return null;
  const parent = from.parentElement;
  if (!parent || parent === document.body) return null;
  const { overflowY } = getComputedStyle(parent);
  const isScroller =
    /(auto|scroll|overlay)/.test(overflowY) &&
    parent.scrollHeight > parent.clientHeight;
  return isScroller ? parent : findScroller(parent);
}

const scrollOffset = (scroller: HTMLElement | null) =>
  window.scrollY + (scroller?.scrollTop ?? 0);

const pageRect = (el: HTMLElement, offset: number) => {
  const rect = el.getBoundingClientRect();
  return { top: rect.top + offset, bottom: rect.bottom + offset };
};

const excluding = (items: Measured[], id: string) =>
  items.filter((item) => item.id !== id);

/** How far an item at its original place has moved up because the dragged row left its spot. */
const removalShift = (snap: Snapshot, g: number, originalIndex: number) =>
  g > snap.src.g || (g === snap.src.g && originalIndex > snap.src.i)
    ? -snap.height
    : 0;

function chooseTarget(snap: Snapshot, centerY: number): Slot {
  const candidates = snap.groups
    .map((group, g) => ({ group, g }))
    .filter(({ group }) => group.isTarget);
  if (candidates.length === 0) return snap.src;
  const distance = (top: number, bottom: number) =>
    centerY < top ? top - centerY : centerY > bottom ? centerY - bottom : 0;
  const best = candidates.reduce((nearest, next) =>
    distance(next.group.top, next.group.bottom) <
    distance(nearest.group.top, nearest.group.bottom)
      ? next
      : nearest,
  );
  const others = excluding(best.group.items, snap.itemId);
  return {
    g: best.g,
    i: others.filter((item) => (item.top + item.bottom) / 2 < centerY).length,
  };
}

/** Top edge, in page coordinates, of the gap the dragged row would fill at a slot. */
function slotTop(snap: Snapshot, slot: Slot): number {
  const group = snap.groups[slot.g];
  const others = excluding(group.items, snap.itemId);
  const originalIndexOf = (k: number) =>
    k + (slot.g === snap.src.g && k >= snap.src.i ? 1 : 0);
  if (slot.i < others.length) {
    return (
      others[slot.i].top + removalShift(snap, slot.g, originalIndexOf(slot.i))
    );
  }
  if (others.length > 0) {
    const last = others.length - 1;
    return (
      others[last].bottom + removalShift(snap, slot.g, originalIndexOf(last))
    );
  }
  return group.itemsTop + (slot.g > snap.src.g ? -snap.height : 0);
}

const GRIP_CLASS =
  "relative size-8! min-h-8! min-w-8! shrink-0 cursor-grab touch-none rounded-full p-0 select-none before:absolute before:-inset-1 before:content-[''] active:cursor-grabbing";

interface RowProps<T extends { id: string }> {
  item: T;
  place: number;
  isOrdered: boolean;
  isPlain: boolean;
  handleSide: 'start' | 'end';
  isHandleAtFirstLine: boolean;
  isActive: boolean;
  isOverOtherGroup: boolean;
  itemLabel: string;
  handleLabel: string;
  renderRow: ReorderListProps<T>['renderRow'];
  onOpen?: (item: T) => void;
  register: (key: string, el: HTMLElement | null) => void;
  onHandlePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
  ) => void;
  onHandleKeyDown: (event: KeyboardEvent<HTMLElement>, id: string) => void;
  onHandleBlur: (id: string) => void;
}

function RowInner<T extends { id: string }>({
  item,
  place,
  isOrdered,
  isPlain,
  handleSide,
  isHandleAtFirstLine,
  isActive,
  isOverOtherGroup,
  itemLabel,
  handleLabel,
  renderRow,
  onOpen,
  register,
  onHandlePointerDown,
  onHandleKeyDown,
  onHandleBlur,
}: RowProps<T>) {
  const body = renderRow(item, { place, isDragging: isActive });
  if (body === null) return null;
  const content = <span className='block w-full min-w-0'>{body}</span>;
  const handle = isOrdered && (
    <Button
      type='button'
      variant='tertiary'
      size='stripped'
      data-no-swipe
      data-reorder-handle={item.id}
      aria-label={
        itemLabel
          ? `${handleLabel}: ${itemLabel}, place ${place}`
          : `${handleLabel}, place ${place}`
      }
      aria-pressed={isActive}
      className={join(
        GRIP_CLASS,
        isActive
          ? 'text-muted-foreground!'
          : 'text-muted-foreground/50! hover:text-muted-foreground!',
        isHandleAtFirstLine && 'mt-1',
      )}
      onPointerDown={(event) => onHandlePointerDown(event, item.id)}
      onKeyDown={(event) => onHandleKeyDown(event, item.id)}
      onBlur={() => onHandleBlur(item.id)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <GripVertical className='size-4' aria-hidden='true' />
    </Button>
  );
  return (
    <div
      ref={(el) => register(`row:${item.id}`, el)}
      data-reorder-row={item.id}
      className={join(
        'border-border relative flex gap-1 transition-transform duration-150 motion-reduce:transition-none',
        isHandleAtFirstLine ? 'items-start' : 'items-center',
        !isPlain && 'border-b last:border-b-0',
        isActive &&
          'bg-background ring-border z-10 rounded-xl border-b-0 shadow-lg ring-1 transition-none select-none',
      )}
    >
      {handleSide === 'start' && handle}
      {!isPlain && (
        <span
          className='text-muted-foreground w-6 shrink-0 text-center text-sm tabular-nums'
          aria-hidden='true'
        >
          {isOrdered && !(isActive && isOverOtherGroup) ? place : ''}
        </span>
      )}
      {onOpen ? (
        <Button
          type='button'
          variant='tertiary'
          size='stripped'
          className={join(
            'h-auto min-h-10 min-w-0 flex-1 justify-start rounded-xl text-left font-normal',
            !isPlain && 'py-3',
          )}
          onClick={() => onOpen(item)}
        >
          {content}
        </Button>
      ) : (
        <div className={join('min-w-0 flex-1', !isPlain && 'py-3')}>
          {content}
        </div>
      )}
      {!isOrdered && onOpen && (
        <span
          className='text-muted-foreground flex size-8 shrink-0 items-center justify-center'
          aria-hidden='true'
        >
          <ChevronRight className='size-4' />
        </span>
      )}
      {handleSide === 'end' && handle}
    </div>
  );
}

const Row = memo(RowInner) as typeof RowInner;

interface Press {
  id: string;
  x: number;
  y: number;
  isFired: boolean;
  timer: number;
}

/** An ordered list in groups, where a row's handle is pressed and dragged (or moved by keyboard, or held on touch) to a new place; the caller applies the finished move. */
function ReorderList<T extends { id: string }>({
  groups,
  renderRow,
  onMove,
  onOpen,
  getPlace,
  getItemLabel,
  handleLabel = 'Reorder',
  isPlain = false,
  handleSide = 'end',
  isHandleAtFirstLine = false,
  canLongPressDrag = true,
  announcements,
  className,
}: ReorderListProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const snapshot = useRef<Snapshot | null>(null);
  const pointerY = useRef(0);
  const frame = useRef(0);
  const detach = useRef<(() => void) | null>(null);
  const press = useRef<Press | null>(null);
  const hasPressFired = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);
  const announceFlip = useRef(false);

  const drawnGroups = groups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item, index) =>
        renderRow(item, {
          place: getPlace ? getPlace(item, index, group) : index + 1,
          isDragging: false,
        }) !== null,
    ),
  }));

  const latest = useRef({
    groups: drawnGroups,
    onMove,
    canLongPressDrag,
    getItemLabel,
    getPlace,
    announcements,
  });
  useEffect(() => {
    latest.current = {
      groups: drawnGroups,
      onMove,
      canLongPressDrag,
      getItemLabel,
      getPlace,
      announcements,
    };
  });

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) elements.current.set(key, el);
    else elements.current.delete(key);
  }, []);

  const placeAt = (group: ReorderGroup<T>, slot: Slot, itemId: string) => {
    if (!group.isOrdered) return null;
    const placeOf = latest.current.getPlace;
    const others = group.items.filter((item) => item.id !== itemId);
    const read = (index: number) =>
      placeOf ? placeOf(others[index], index, group) : index + 1;
    if (others.length === 0) return 1;
    return slot.i < others.length ? read(slot.i) : read(others.length - 1) + 1;
  };

  const announce = (text: string) => {
    announceFlip.current = !announceFlip.current;
    if (liveRef.current)
      liveRef.current.textContent = announceFlip.current ? text : text + NBSP;
  };

  const say = (
    key: keyof ReorderAnnouncements,
    itemId: string,
    snap: Snapshot | null = snapshot.current,
    slot: Slot | null = null,
  ) => {
    const {
      groups: current,
      getItemLabel: labelOf,
      announcements: custom,
    } = latest.current;
    const words = { ...DEFAULT_ANNOUNCEMENTS, ...custom };
    const item = current
      .flatMap((group) => group.items)
      .find((entry) => entry.id === itemId);
    const itemLabel = (item && labelOf?.(item)) ?? '';
    const toGroupId = snap && slot ? snap.groupIds[slot.g] : null;
    const toGroup = current.find((group) => group.id === toGroupId);
    const fromGroupId = snap ? snap.groupIds[snap.src.g] : null;
    const text =
      key === 'pickedUp' || key === 'cancelled' || key === 'unchanged'
        ? words[key](itemLabel)
        : key === 'moved' || key === 'dropped'
          ? words[key]({
              itemLabel,
              place: toGroup && slot ? placeAt(toGroup, slot, itemId) : null,
              groupLabel:
                toGroup && toGroup.id !== fromGroupId ? toGroup.label : null,
            })
          : '';
    announce(text);
  };

  const measure = (
    itemId: string,
    mode: Snapshot['mode'],
    pointer: number,
  ): Snapshot | null => {
    const root = rootRef.current;
    const current = latest.current.groups;
    const src = current.reduce<Slot | null>((found, group, g) => {
      const i = group.items.findIndex((item) => item.id === itemId);
      return found ?? (i >= 0 ? { g, i } : null);
    }, null);
    const srcEl = elements.current.get(`row:${itemId}`);
    if (!root || !src || !srcEl) return null;
    const scroller = findScroller(root);
    const offset = scrollOffset(scroller);
    const page = (el: HTMLElement) => pageRect(el, offset);
    const srcRect = page(srcEl);
    return {
      itemId,
      groupIds: current.map((group) => group.id),
      signature: signatureOf(current),
      src,
      height: srcRect.bottom - srcRect.top,
      srcTop: srcRect.top,
      groups: current.map((group) => {
        const wrapper = elements.current.get(`group:${group.id}`);
        const body = elements.current.get(`items:${group.id}`);
        return {
          ...(wrapper ? page(wrapper) : { top: 0, bottom: 0 }),
          isTarget: group.isDropTarget !== false,
          itemsTop: body ? page(body).top : 0,
          items: group.items.map((item) => {
            const el = elements.current.get(`row:${item.id}`);
            return { id: item.id, ...(el ? page(el) : { top: 0, bottom: 0 }) };
          }),
        };
      }),
      scroller,
      startScroll: offset,
      startPointerY: pointer,
      target: src,
      mode,
      canScrollUp: false,
      canScrollDown: false,
    };
  };

  const setTransform = (el: HTMLElement | undefined, offset: number) => {
    if (el)
      el.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`;
  };

  const layout = (snap: Snapshot, draggedOffset: number) => {
    const { target, height } = snap;
    snap.groups.forEach((group, g) => {
      const headOffset =
        (g > snap.src.g ? -height : 0) + (g > target.g ? height : 0);
      setTransform(
        elements.current.get(`head:${snap.groupIds[g]}`),
        headOffset,
      );
      setTransform(
        elements.current.get(`empty:${snap.groupIds[g]}`),
        headOffset,
      );
      excluding(group.items, snap.itemId).forEach((item, k) => {
        const originalIndex = k + (g === snap.src.g && k >= snap.src.i ? 1 : 0);
        const makesRoom = g > target.g || (g === target.g && k >= target.i);
        setTransform(
          elements.current.get(`row:${item.id}`),
          removalShift(snap, g, originalIndex) + (makesRoom ? height : 0),
        );
      });
    });
    setTransform(elements.current.get(`row:${snap.itemId}`), draggedOffset);
    setOverGroupId(
      target.g === snap.src.g ? null : (snap.groupIds[target.g] ?? null),
    );
  };

  const begin = (snap: Snapshot) => {
    snapshot.current = snap;
    const el = elements.current.get(`row:${snap.itemId}`);
    if (el) el.style.transition = 'none';
    setActiveId(snap.itemId);
  };

  const startDrag = (id: string, mode: Snapshot['mode'], pointer: number) => {
    const snap = measure(id, mode, pointer);
    if (!snap) return null;
    begin(snap);
    return snap;
  };

  const refresh = () => {
    const snap = snapshot.current;
    if (!snap || snap.mode !== 'pointer') return;
    const dy =
      pointerY.current -
      snap.startPointerY +
      scrollOffset(snap.scroller) -
      snap.startScroll;
    const centerY = snap.srcTop + snap.height / 2 + dy;
    snap.target = chooseTarget(snap, centerY);
    layout(snap, dy);
  };

  const autoScroll = () => {
    const snap = snapshot.current;
    if (!snap) return;
    const bounds = snap.scroller?.getBoundingClientRect();
    const top = Math.max(0, bounds?.top ?? 0);
    const bottom = Math.min(
      window.innerHeight,
      bounds?.bottom ?? window.innerHeight,
    );
    const y = pointerY.current;
    if (signatureOf(latest.current.groups) !== snap.signature) {
      finish(false);
      return;
    }
    if (y < snap.startPointerY - DRAG_START_PX) snap.canScrollUp = true;
    if (y > snap.startPointerY + DRAG_START_PX) snap.canScrollDown = true;
    const speed =
      snap.canScrollUp && y < top + EDGE_ZONE_PX
        ? -Math.min(1, (top + EDGE_ZONE_PX - y) / EDGE_ZONE_PX)
        : snap.canScrollDown && y > bottom - EDGE_ZONE_PX
          ? Math.min(1, (y - (bottom - EDGE_ZONE_PX)) / EDGE_ZONE_PX)
          : 0;
    if (speed !== 0 && snap.mode === 'pointer') {
      const step = Math.round(speed * MAX_SCROLL_PX_PER_FRAME);
      if (snap.scroller) snap.scroller.scrollTop += step;
      else window.scrollBy(0, step);
      refresh();
    }
    frame.current = requestAnimationFrame(autoScroll);
  };

  const endPress = () => {
    const current = press.current;
    if (!current) return;
    window.clearTimeout(current.timer);
    press.current = null;
    const root = rootRef.current;
    if (root) {
      root.style.removeProperty('-webkit-touch-callout');
      root.style.removeProperty('user-select');
      root.style.removeProperty('-webkit-user-select');
    }
  };

  const finish = (shouldCommit: boolean) => {
    const snap = snapshot.current;
    detach.current?.();
    detach.current = null;
    cancelAnimationFrame(frame.current);
    endPress();
    if (!snap) return;
    snapshot.current = null;
    const touched = Array.from(elements.current.entries()).filter(
      ([key]) =>
        key.startsWith('row:') ||
        key.startsWith('head:') ||
        key.startsWith('empty:'),
    );
    touched.forEach(([, el]) => {
      el.style.transition = 'none';
      el.style.transform = '';
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        touched.forEach(([, el]) => (el.style.transition = '')),
      ),
    );
    setActiveId(null);
    setOverGroupId(null);
    const { target, src, itemId } = snap;
    if (!shouldCommit) return say('cancelled', itemId, snap);
    if (target.g === src.g && target.i === src.i)
      return say('unchanged', itemId, snap);
    const current = latest.current.groups;
    const toGroupId = snap.groupIds[target.g];
    const isItemKept = current.some((group) =>
      group.items.some((item) => item.id === itemId),
    );
    if (!isItemKept || !current.some((group) => group.id === toGroupId))
      return say('cancelled', itemId, snap);
    say('dropped', itemId, snap, target);
    latest.current.onMove({ itemId, toGroupId, toIndex: target.i });
    if (snap.mode === 'keyboard') {
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          rootRef.current
            ?.querySelector<HTMLElement>(
              `[data-reorder-handle="${CSS.escape(itemId)}"]`,
            )
            ?.focus(),
        ),
      );
    }
  };

  const onHandlePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (snapshot.current) return;
    detach.current?.();
    const { pointerId, clientX, clientY } = event;
    pointerY.current = clientY;
    let isStarted = false;

    const onMovePointer = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      pointerY.current = move.clientY;
      if (!isStarted) {
        if (
          Math.hypot(move.clientX - clientX, move.clientY - clientY) <
          DRAG_START_PX
        )
          return;
        const snap = startDrag(id, 'pointer', clientY);
        if (!snap) return;
        isStarted = true;
        frame.current = requestAnimationFrame(autoScroll);
      }
      move.preventDefault();
      if (
        snapshot.current &&
        signatureOf(latest.current.groups) !== snapshot.current.signature
      )
        return finish(false);
      refresh();
    };
    const onEnd = (end: PointerEvent) => {
      if (end.pointerId !== pointerId) return;
      if (!isStarted) return detach.current?.();
      finish(end.type === 'pointerup');
    };
    const onEscape = (key: globalThis.KeyboardEvent) => {
      if (key.key === 'Escape' && isStarted) finish(false);
    };
    window.addEventListener('pointermove', onMovePointer, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('keydown', onEscape);
    detach.current = () => {
      window.removeEventListener('pointermove', onMovePointer);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('keydown', onEscape);
      detach.current = null;
    };
  };

  const slotsFor = (snap: Snapshot): Slot[] =>
    snap.groups.flatMap((group, g) =>
      group.isTarget
        ? Array.from(
            { length: excluding(group.items, snap.itemId).length + 1 },
            (_, i) => ({ g, i }),
          )
        : [],
    );

  const onHandleKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    const snap = snapshot.current;
    const isOurs = snap?.mode === 'keyboard' && snap.itemId === id;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (isOurs) return finish(true);
      if (snap) return;
      const next = startDrag(id, 'keyboard', 0);
      if (!next) return;
      say('pickedUp', id);
      return;
    }
    if (!isOurs) return;
    if (signatureOf(latest.current.groups) !== snap.signature)
      return finish(false);
    if (event.key === 'Escape') {
      event.preventDefault();
      return finish(false);
    }
    const step =
      event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? 1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const slots = slotsFor(snap);
    const here = slots.findIndex(
      (slot) => slot.g === snap.target.g && slot.i === snap.target.i,
    );
    const next = slots[Math.min(slots.length - 1, Math.max(0, here + step))];
    if (!next || (next.g === snap.target.g && next.i === snap.target.i)) return;
    snap.target = next;
    layout(snap, slotTop(snap, next) - snap.srcTop);
    elements.current.get(`row:${id}`)?.scrollIntoView({ block: 'nearest' });
    say('moved', id, snap, next);
  };

  const onHandleBlur = (id: string) => {
    const snap = snapshot.current;
    if (snap?.mode === 'keyboard' && snap.itemId === id) finish(false);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 1) return endPress();
    if (press.current || snapshot.current || !latest.current.canLongPressDrag)
      return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      !target ||
      target.closest(
        '[data-reorder-handle],input,textarea,select,[contenteditable="true"],[data-no-reorder-press]',
      )
    )
      return;
    const current = latest.current.groups;
    const rowId = target
      .closest<HTMLElement>('[data-reorder-row]')
      ?.getAttribute('data-reorder-row');
    const isRowOrdered =
      rowId &&
      current.some(
        (group) =>
          group.isOrdered && group.items.some((item) => item.id === rowId),
      );
    const touch = event.touches[0];
    const root = rootRef.current;
    if (!isRowOrdered || !touch || !root) return;
    pointerY.current = touch.clientY;
    root.style.setProperty('-webkit-touch-callout', 'none');
    root.style.setProperty('user-select', 'none');
    root.style.setProperty('-webkit-user-select', 'none');
    const fire = () => {
      const armed = press.current;
      if (!armed) return;
      try {
        navigator.vibrate?.(10);
      } catch {
        // iOS has no vibration
      }
      const snap = startDrag(armed.id, 'pointer', pointerY.current);
      if (!snap) return endPress();
      armed.isFired = true;
      hasPressFired.current = true;
      frame.current = requestAnimationFrame(autoScroll);
    };
    press.current = {
      id: rowId,
      x: touch.clientX,
      y: touch.clientY,
      isFired: false,
      timer: window.setTimeout(fire, LONG_PRESS_MS),
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    const armed = press.current;
    const touch = event.touches[0];
    if (!armed || !touch) return;
    pointerY.current = touch.clientY;
    if (!armed.isFired) {
      if (
        Math.hypot(touch.clientX - armed.x, touch.clientY - armed.y) >
        LONG_PRESS_SLOP_PX
      )
        endPress();
      return;
    }
    if (event.cancelable) event.preventDefault();
    if (
      snapshot.current &&
      signatureOf(latest.current.groups) !== snapshot.current.signature
    )
      return finish(false);
    refresh();
  };

  const onTouchEnd = (event: TouchEvent) => {
    const armed = press.current;
    const hadFired = hasPressFired.current;
    hasPressFired.current = false;
    if (!armed) {
      if (hadFired && event.cancelable) event.preventDefault();
      return;
    }
    if (!armed.isFired) return endPress();
    if (event.cancelable) event.preventDefault();
    finish(true);
  };

  const onTouchCancel = () => {
    const armed = press.current;
    if (armed?.isFired) finish(false);
    else endPress();
  };

  const handlerFns = useRef({
    onHandlePointerDown,
    onHandleKeyDown,
    onHandleBlur,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    isPressing: () => press.current !== null,
  });
  useEffect(() => {
    handlerFns.current = {
      onHandlePointerDown,
      onHandleKeyDown,
      onHandleBlur,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      isPressing: () => press.current !== null,
    };
  });
  const stable = useMemo(
    () => ({
      down: (event: ReactPointerEvent<HTMLElement>, id: string) =>
        handlerFns.current.onHandlePointerDown(event, id),
      key: (event: KeyboardEvent<HTMLElement>, id: string) =>
        handlerFns.current.onHandleKeyDown(event, id),
      blur: (id: string) => handlerFns.current.onHandleBlur(id),
    }),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const start = (event: TouchEvent) => handlerFns.current.onTouchStart(event);
    const move = (event: TouchEvent) => handlerFns.current.onTouchMove(event);
    const end = (event: TouchEvent) => handlerFns.current.onTouchEnd(event);
    const cancel = () => handlerFns.current.onTouchCancel();
    const menu = (event: Event) => {
      if (handlerFns.current.isPressing()) event.preventDefault();
    };
    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', cancel);
    root.addEventListener('contextmenu', menu);
    return () => {
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', cancel);
      root.removeEventListener('contextmenu', menu);
    };
  }, []);

  useEffect(
    () => () => {
      detach.current?.();
      cancelAnimationFrame(frame.current);
      window.clearTimeout(press.current?.timer);
    },
    [],
  );

  return (
    <div ref={rootRef} className={join(activeId && 'select-none', className)}>
      {drawnGroups.map((group) => {
        const divider = (
          <SectionDivider
            label={group.heading ?? group.label}
            trailing={group.trailing}
            className='py-2'
          />
        );
        return (
          <div key={group.id} ref={(el) => register(`group:${group.id}`, el)}>
            {(group.label !== null || group.heading) && (
              <div
                ref={(el) => register(`head:${group.id}`, el)}
                className={join(
                  'rounded-lg transition-transform duration-150 motion-reduce:transition-none',
                  overGroupId === group.id &&
                    group.items.length === 0 &&
                    'bg-primary/10',
                )}
              >
                {divider}
              </div>
            )}
            <div ref={(el) => register(`items:${group.id}`, el)}>
              {group.items.length === 0 && group.empty && (
                <div
                  ref={(el) => register(`empty:${group.id}`, el)}
                  className='text-muted-foreground py-3 text-sm transition-transform duration-150 motion-reduce:transition-none'
                >
                  {group.empty}
                </div>
              )}
              {group.items.map((item, index) => (
                <Row
                  key={item.id}
                  item={item}
                  place={getPlace ? getPlace(item, index, group) : index + 1}
                  isOrdered={group.isOrdered}
                  isPlain={isPlain}
                  handleSide={handleSide}
                  isHandleAtFirstLine={isHandleAtFirstLine}
                  isActive={activeId === item.id}
                  isOverOtherGroup={overGroupId !== null}
                  itemLabel={getItemLabel?.(item) ?? ''}
                  handleLabel={handleLabel}
                  renderRow={renderRow}
                  onOpen={onOpen}
                  register={register}
                  onHandlePointerDown={stable.down}
                  onHandleKeyDown={stable.key}
                  onHandleBlur={stable.blur}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div ref={liveRef} className='sr-only' aria-live='assertive' />
    </div>
  );
}

export default ReorderList;
