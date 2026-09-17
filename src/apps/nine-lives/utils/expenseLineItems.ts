export interface LineItemValue {
  id: string;
  category: string;
  label: string;
  amount: string;
}

export function createEmptyLineItem(): LineItemValue {
  return { id: crypto.randomUUID(), category: 'other', label: '', amount: '' };
}
