import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const px = (value: string) => parseFloat(value) || 0;

const fit = (field: HTMLTextAreaElement, maxLines: number) => {
  const style = getComputedStyle(field);
  const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.25;
  // With the keyboard up a phone shows little, so the field never takes more than about half of it.
  const visible = window.visualViewport?.height ?? window.innerHeight;
  const max = Math.min(
    lineHeight * maxLines +
      px(style.paddingTop) +
      px(style.paddingBottom) +
      borders,
    Math.max(lineHeight * 2, visible * 0.45),
  );
  field.style.height = 'auto';
  const content = field.scrollHeight + borders;
  field.style.height = `${Math.min(content, max)}px`;
  field.style.overflowY = content > max ? 'auto' : 'hidden';
};

/** Grows a textarea with its text, typed or set from code (dictation, a restored draft, a cleared field), up to `maxLines`, then scrolls inside it. */
export function useGrowingTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines: number,
) {
  const fitted = useRef({
    field: null as HTMLTextAreaElement | null,
    value: '',
    maxLines: 0,
  });
  const observer = useRef<ResizeObserver | null>(null);

  // No dependency list: a remounted field, or one that was hidden, is a new element the value alone wouldn't catch.
  useLayoutEffect(() => {
    const field = ref.current;
    const last = fitted.current;
    if (!field) return;
    if (
      last.field === field &&
      last.value === value &&
      last.maxLines === maxLines
    ) {
      return;
    }
    if (last.field !== field) {
      observer.current?.disconnect();
      const widths = new WeakMap<Element, number>();
      observer.current = new ResizeObserver((entries) =>
        entries.forEach((entry) => {
          const width = entry.contentRect.width;
          if (widths.get(entry.target) === width) return;
          widths.set(entry.target, width);
          fit(field, fitted.current.maxLines);
        }),
      );
      observer.current.observe(field);
    }
    fitted.current = { field, value, maxLines };
    fit(field, maxLines);
  });

  useEffect(() => {
    const refit = () => {
      const { field, maxLines: lines } = fitted.current;
      if (field) fit(field, lines);
    };
    window.visualViewport?.addEventListener('resize', refit);
    return () => {
      window.visualViewport?.removeEventListener('resize', refit);
      observer.current?.disconnect();
    };
  }, []);
}
