import { useValuesHidden } from '@/hooks/useValuesHidden';
import { maskForMode } from '@apps/runway/utils/maskText';

/** Masks the amounts in a line while amounts are hidden, and its real amounts while they are made up; the line is returned as it is once they are shown. */
export function useMaskedText() {
  const { isHidden } = useValuesHidden();
  return (text: string) => maskForMode(text, isHidden);
}
