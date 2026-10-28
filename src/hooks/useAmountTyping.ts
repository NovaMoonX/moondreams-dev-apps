import { useEffect, useRef, type RefObject } from 'react';

export interface AmountTypingOptions {
  /** Decimal places allowed (money: 2). */
  maxDecimals?: number;
  allowNegative?: boolean;
  /** The largest value the field takes (a percentage: 100). */
  max?: number;
}

const NUMBER_IN_TEXT = /-?\d[\d\s,]*(?:\.\d*)?|-?\.\d+/;

/** Whether `text` (commas ignored) is an amount a field may hold while it is being typed. */
export function isAmountText(
  text: string,
  { maxDecimals = 2, allowNegative = false, max }: AmountTypingOptions = {},
) {
  const bare = text.replace(/,/g, '');
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(bare)) return false;
  const decimals = bare.split('.')[1] ?? '';
  if (decimals.length > maxDecimals) return false;
  if (max !== undefined && Math.abs(Number(bare)) > max) return false;
  return true;
}

/** Cleans pasted or autofilled text down to the first number in it: "$1,234.50", "1 234.50" and "1234.5 USD" become plain amounts; text with no number gives `null`. */
export function cleanAmountText(
  text: string,
  options: AmountTypingOptions = {},
) {
  const { maxDecimals = 2, allowNegative = false } = options;
  const found = NUMBER_IN_TEXT.exec(text)?.[0];
  if (found === undefined) return null;
  const [whole, ...rest] = found.replace(/[\s,]/g, '').split('.');
  const decimals = rest.join('').slice(0, maxDecimals);
  const isNegative = allowNegative && whole.startsWith('-');
  const digits = whole.replace(/-/g, '');
  const result = `${isNegative ? '-' : ''}${digits}${rest.length > 0 ? `.${decimals}` : ''}`;
  return isAmountText(result, options) ? result : null;
}

const setNativeValue = (field: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(field, value);
};

/**
 * Keeps a text field to an amount as it is typed: a character that does not belong is dropped before
 * it reaches the value, so the caret stays where it was, and a paste is cleaned to its first number.
 */
export function useAmountTyping(
  ref: RefObject<HTMLInputElement | null>,
  options: AmountTypingOptions = {},
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const field = ref.current;
    if (!field) return;

    const resulting = (inserted: string) => {
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? start;
      const text =
        field.value.slice(0, start) + inserted + field.value.slice(end);
      return { text, caret: start + inserted.length };
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (!event.inputType.startsWith('insert') || event.isComposing) return;
      if (event.inputType === 'insertFromPaste') return;
      const inserted = event.data ?? '';
      if (inserted === '') return;
      if (!isAmountText(resulting(inserted).text, optionsRef.current)) {
        event.preventDefault();
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const cleaned = cleanAmountText(
        event.clipboardData?.getData('text') ?? '',
        optionsRef.current,
      );
      if (cleaned === null) return;
      const whole =
        field.selectionStart === 0 && field.selectionEnd === field.value.length;
      const next = whole
        ? { text: cleaned, caret: cleaned.length }
        : resulting(cleaned);
      const accepted = isAmountText(next.text, optionsRef.current)
        ? next
        : { text: cleaned, caret: cleaned.length };
      setNativeValue(field, accepted.text);
      field.setSelectionRange(accepted.caret, accepted.caret);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };

    field.addEventListener('beforeinput', handleBeforeInput);
    field.addEventListener('paste', handlePaste);
    return () => {
      field.removeEventListener('beforeinput', handleBeforeInput);
      field.removeEventListener('paste', handlePaste);
    };
  }, [ref]);
}
