import { Tabs } from '@moondreamsdev/dreamer-ui/components';
import type { ReactNode } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

// The library colors the active underline tab with `accent`, a pale gray in the default theme.
const TRIGGERS_CLASS =
  'text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground';

interface UnderlineTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: readonly { value: T; label: string }[];
}

/** Underline tabs for utility screens such as the admin dashboard (an app uses `Tabs variant='pills'`): equal widths on a phone, sized to their labels from `sm`. Pair each tab with a `TabPanel`. */
export function UnderlineTabs<T extends string>({ value, onChange, tabs }: UnderlineTabsProps<T>) {
  const isPhone = useMediaQuery().isBelow('sm');

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as T)}
      variant='underline'
      tabsWidth={isPhone ? 'full' : 'fit'}
      triggersClassName={TRIGGERS_CLASS}
      tabsList={tabs.map((tab) => ({ value: tab.value, label: tab.label }))}
    />
  );
}

interface TabPanelProps {
  value: string;
  activeValue: string;
  children: ReactNode;
}

/** One tab's pane. It stays mounted while hidden, so unsaved state survives a tab switch (the library's `TabsContent` unmounts it). */
export function TabPanel({ value, activeValue, children }: TabPanelProps) {
  return (
    <div id={`tabs-content-${value}`} role='tabpanel' hidden={value !== activeValue}>
      {children}
    </div>
  );
}
