import { Activity, Pill, Scale, Stethoscope, Syringe, type LucideIcon } from 'lucide-react';

export type CatLogKind = 'vaccination' | 'preventive' | 'weight' | 'condition' | 'symptom';

export const CAT_LOG_OPTIONS: { value: CatLogKind; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'vaccination', label: 'Vaccination', hint: 'A shot, given or due', icon: Syringe },
  { value: 'preventive', label: 'Preventive / med', hint: 'Flea, worm, or other meds', icon: Pill },
  { value: 'weight', label: 'Weight', hint: 'A quick weigh-in', icon: Scale },
  { value: 'condition', label: 'Condition', hint: 'Something ongoing to keep an eye on', icon: Stethoscope },
  { value: 'symptom', label: 'Symptom', hint: 'Something that seems off today', icon: Activity },
];
