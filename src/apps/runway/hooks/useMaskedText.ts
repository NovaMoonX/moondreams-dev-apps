import { useValuesHidden } from '@/hooks/useValuesHidden';
import { maskFigures } from '@apps/runway/utils/maskText';

/** Masks the amounts in a line while amounts are hidden; the line is returned as it is once they are shown. */
export function useMaskedText() {
  const { isHidden } = useValuesHidden();
  return (text: string) => (isHidden ? maskFigures(text) : text);
}
