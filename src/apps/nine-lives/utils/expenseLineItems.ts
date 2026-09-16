export interface LineItemValue {
  id: string;
  label: string;
  amount: string;
}

export function createEmptyLineItem(): LineItemValue {
  return { id: crypto.randomUUID(), label: '', amount: '' };
}
