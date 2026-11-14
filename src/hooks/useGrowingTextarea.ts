import { useLayoutEffect, type RefObject } from 'react';

const px = (value: string) => parseFloat(value) || 0;

/** Grows a textarea with its text, typed or set from code (dictation, a restored draft, a cleared field), up to `maxLines`, then scrolls inside it. */
export function useGrowingTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines: number,
) {
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const fit = () => {
      const style = getComputedStyle(field);
      const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);
      const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.25;
      const max =
        lineHeight * maxLines +
        px(style.paddingTop) +
        px(style.paddingBottom) +
        borders;
      field.style.height = 'auto';
      const content = field.scrollHeight + borders;
      field.style.height = `${Math.min(content, max)}px`;
      field.style.overflowY = content > max ? 'auto' : 'hidden';
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [ref, value, maxLines]);
}
