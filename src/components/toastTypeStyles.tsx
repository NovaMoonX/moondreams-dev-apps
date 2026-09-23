import type { ReactNode } from 'react';

import { Bell, Info, X } from 'lucide-react';

interface ToastTypeStyle {
  className: string;
  icon?: ReactNode;
}

// Also passed as `customTypes` to `ToastProvider` for documentation, though the
// library only reads `customTypes` for its own default renderer — since we supply
// `customComponent`, this map is the actual (and only) source of truth for styling.
export const TOAST_TYPE_STYLES: Record<string, ToastTypeStyle> = {
  info: {
    className: 'bg-popover text-popover-foreground border-border',
    icon: <Info className='h-5 w-5' />,
  },
  error: {
    className: 'bg-destructive text-destructive-foreground border-destructive',
    icon: <X className='h-5 w-5' />,
  },
  reminder: {
    className: 'bg-popover text-popover-foreground border-border',
    icon: <Bell className='h-5 w-5' />,
  },
};

// `ToastData` has no slot for extra fields, so the toast's source app is passed alongside by id.
export const TOAST_APP_LABELS = new Map<string, string>();
