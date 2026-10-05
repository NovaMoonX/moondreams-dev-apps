import { generateUuid } from '@/utils/idUtils';

export interface LineItemValue {
  id: string;
  category: string;
  label: string;
  amount: string;
}

export function createEmptyLineItem(): LineItemValue {
  return { id: generateUuid(), category: 'other', label: '', amount: '' };
}
