import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  /** `SettingsRow`s. */
  children: ReactNode;
}

/** A named group of settings rows: a sentence-case caption on the card's edge over one hairline card. */
function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className='flex flex-col gap-2'>
      <h2 className='text-muted-foreground text-[13px] font-medium'>{title}</h2>
      <ul className='helm-card divide-border divide-y px-3'>{children}</ul>
    </section>
  );
}

export default SettingsSection;
