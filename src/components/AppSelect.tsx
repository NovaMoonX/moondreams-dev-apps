import { useEffect, useRef, type ComponentProps } from 'react';

import { Select } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

type AppSelectProps = Omit<ComponentProps<typeof Select>, 'ref'>;

const GAP_PX = 4;
const EDGE_PX = 8;
const LIST_MAX_PX = 240;
const LIST_MIN_PX = 96;

const FLOATING =
  'fixed! mt-0! top-(--app-select-top)! bottom-(--app-select-bottom)! left-(--app-select-left)! right-(--app-select-right)! w-(--app-select-width)! [&_[data-scroll-area-viewport]]:max-h-(--app-select-list)!';

const makesFixedBox = (style: CSSStyleDeclaration) =>
  style.transform !== 'none' ||
  (style.translate !== 'none' && style.translate !== '') ||
  (style.scale !== 'none' && style.scale !== '') ||
  (style.rotate !== 'none' && style.rotate !== '') ||
  style.perspective !== 'none' ||
  style.filter !== 'none' ||
  (style.backdropFilter !== 'none' && style.backdropFilter !== '') ||
  /paint|layout|strict|content/.test(style.contain) ||
  /transform|filter|perspective/.test(style.willChange) ||
  (style.containerType !== 'normal' && style.containerType !== '');

// A fixed layer is placed against the nearest ancestor that makes a containing block (a sheet's slide
// transform does), not always the screen, so its offsets are measured from that box.
const findFixedBox = (node: HTMLElement) => {
  const climb = (current: HTMLElement | null): DOMRect => {
    if (!current || current === document.documentElement) {
      return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    }
    if (makesFixedBox(getComputedStyle(current))) {
      const rect = current.getBoundingClientRect();
      return new DOMRect(
        rect.left + current.clientLeft,
        rect.top + current.clientTop,
        current.clientWidth,
        current.clientHeight,
      );
    }
    return climb(current.parentElement);
  };
  return climb(node.parentElement);
};

const place = (box: HTMLElement) => {
  const list = box.querySelector<HTMLElement>(':scope > [data-select-content]');
  const trigger = box.querySelector<HTMLElement>('[data-select-trigger]');
  if (!list || !trigger) return;
  list.setAttribute('data-no-swipe', '');
  const viewport = list.querySelector<HTMLElement>(
    '[data-scroll-area-viewport]',
  );
  const at = trigger.getBoundingClientRect();
  const screen = window.visualViewport;
  const screenTop = screen?.offsetTop ?? 0;
  const screenBottom = screenTop + (screen?.height ?? window.innerHeight);
  const chrome = list.offsetHeight - (viewport?.offsetHeight ?? 0);
  const wanted = Math.min(LIST_MAX_PX, viewport?.scrollHeight ?? LIST_MAX_PX);
  const below = screenBottom - at.bottom - GAP_PX - EDGE_PX - chrome;
  const above = at.top - screenTop - GAP_PX - EDGE_PX - chrome;
  const isAbove = below < wanted && above > below;
  const room = isAbove ? above : below;
  const fixedBox = findFixedBox(box);
  const isRightAligned = at.left + at.width / 2 > window.innerWidth / 2;
  const vars: Record<string, string> = {
    '--app-select-top': isAbove
      ? 'auto'
      : `${at.bottom + GAP_PX - fixedBox.top}px`,
    '--app-select-bottom': isAbove
      ? `${fixedBox.bottom - at.top + GAP_PX}px`
      : 'auto',
    '--app-select-left': isRightAligned
      ? 'auto'
      : `${at.left - fixedBox.left}px`,
    '--app-select-right': isRightAligned
      ? `${fixedBox.right - at.right}px`
      : 'auto',
    '--app-select-width': `${at.width}px`,
    '--app-select-list': `${Math.max(LIST_MIN_PX, Math.min(LIST_MAX_PX, room))}px`,
  };
  Object.entries(vars).forEach(([name, value]) =>
    box.style.setProperty(name, value),
  );
  list.setAttribute('data-placement', isAbove ? 'top' : 'bottom');
};

/** Dreamer UI's `Select` with its list floated over any scroll box, opening upward when there is more room above. */
function AppSelect({ dropdownClassName, ...props }: AppSelectProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const frame = { id: 0 };
    const follow = () => {
      cancelAnimationFrame(frame.id);
      frame.id = requestAnimationFrame(() => place(box));
    };
    const listen = (isOn: boolean) => {
      const method = isOn ? 'addEventListener' : 'removeEventListener';
      window[method]('scroll', follow, { capture: true, passive: true });
      window[method]('resize', follow);
      window.visualViewport?.[method]('resize', follow);
      window.visualViewport?.[method]('scroll', follow);
    };
    const state = { isOpen: false };
    const sync = () => {
      const isOpen =
        box.querySelector(':scope > [data-select-content]') !== null;
      if (isOpen) place(box);
      if (isOpen !== state.isOpen) listen(isOpen);
      state.isOpen = isOpen;
    };
    const observer = new MutationObserver(sync);
    observer.observe(box, { childList: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.id);
      if (state.isOpen) listen(false);
    };
  }, []);

  return (
    <Select
      {...props}
      ref={boxRef}
      dropdownClassName={join(FLOATING, dropdownClassName)}
    />
  );
}

export default AppSelect;
